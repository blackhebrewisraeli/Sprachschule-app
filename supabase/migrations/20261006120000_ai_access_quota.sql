-- AI access: per-day quotas, tier pools, Premium entitlements, quota grants,
-- and an identifier-free daily cost roll-up.
--
-- DO NOT apply this to production from an agent. The owner applies it to
-- Sprachschule (xcnnlczvxmuwcqwychox) after merge through the Management API
-- procedure in docs/STORE_SUBMISSION_CHECKLIST.md item 1, then renames this
-- file to the recorded version in a PR. Never `db push`, `migration repair`,
-- MCP apply_migration, or the SQL editor.
--
-- Design: docs/superpowers/specs/2026-10-01-monetization-access-design.md §6, §10.
--
-- Threat model: the tier is decided HERE, from entitlements, never from the
-- request. Every RPC is service_role only; the Vercel AI lane is the only
-- caller. Learners may read their own entitlements and grants (UI), nothing else.

-- ── entitlements ───────────────────────────────────────────────────

create table public.entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('manual', 'revenuecat')),
  tier text not null default 'premium' check (tier = 'premium'),
  product_id text,
  store text,
  environment text,
  expires_at timestamptz,
  will_renew boolean,
  billing_issue_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, source)
);

comment on table public.entitlements is
  'Premium grants. expires_at null = no expiry. Written by service_role only (RevenueCat webhook/sync, owner comps).';

alter table public.entitlements enable row level security;
create policy "read own entitlements"
  on public.entitlements for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on table public.entitlements from anon, authenticated;
grant select on table public.entitlements to authenticated;
grant all on table public.entitlements to service_role;

-- ── usage counters (one day per subject) ───────────────────────────

create table public.ai_usage (
  subject text not null check (char_length(subject) between 3 and 80),
  meter text not null check (meter in ('chat', 'grade', 'deck')),
  day date not null,
  used integer not null default 0 check (used >= 0),
  primary key (subject, meter, day)
);

alter table public.ai_usage enable row level security;
create policy "no client access" on public.ai_usage
  for all to anon, authenticated using (false) with check (false);
revoke all on table public.ai_usage from anon, authenticated;
grant all on table public.ai_usage to service_role;

-- ── grants (rewarded ads, support goodwill) ────────────────────────

create table public.ai_quota_grants (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  meter text not null check (meter in ('chat', 'grade', 'deck')),
  day date not null,
  units integer not null check (units between 1 and 50),
  source text not null check (source in ('rewarded_ad', 'support')),
  source_ref text not null check (char_length(source_ref) between 1 and 200),
  created_at timestamptz not null default now(),
  constraint ai_quota_grants_source_ref unique (source, source_ref)
);
create index ai_quota_grants_user_day_idx on public.ai_quota_grants (user_id, day);

alter table public.ai_quota_grants enable row level security;
create policy "read own grants"
  on public.ai_quota_grants for select to authenticated
  using ((select auth.uid()) = user_id);
revoke all on table public.ai_quota_grants from anon, authenticated;
grant select on table public.ai_quota_grants to authenticated;
grant all on table public.ai_quota_grants to service_role;

-- ── daily cost roll-up (no user, no IP) ────────────────────────────

create table public.ai_cost_daily (
  day date not null,
  meter text not null,
  model text not null,
  tier text not null check (tier in ('guest', 'free', 'premium')),
  calls integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (day, meter, model, tier)
);

alter table public.ai_cost_daily enable row level security;
create policy "no client access" on public.ai_cost_daily
  for all to anon, authenticated using (false) with check (false);
revoke all on table public.ai_cost_daily from anon, authenticated;
grant all on table public.ai_cost_daily to service_role;

-- ── consume ────────────────────────────────────────────────────────

create or replace function public.consume_ai_quota(
  p_subject text,
  p_user uuid,
  p_meter text,
  p_units integer,
  p_limits jsonb,
  p_pool_limits jsonb,
  p_enforce boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_tier text;
  v_limit integer;
  v_pool_limit integer;
  v_used integer;
  v_pool_used integer;
begin
  if p_meter is null or p_meter not in ('chat', 'grade', 'deck') then
    raise exception 'unknown meter' using errcode = '22023';
  end if;
  if p_units is null or p_units not between 1 and 10 then
    raise exception 'invalid units' using errcode = '22023';
  end if;
  if p_subject is null or char_length(p_subject) not between 3 and 80 then
    raise exception 'invalid subject' using errcode = '22023';
  end if;

  if p_user is null then
    v_tier := 'guest';
  elsif exists (
    select 1 from public.entitlements e
    where e.user_id = p_user and (e.expires_at is null or e.expires_at > now())
  ) then
    v_tier := 'premium';
  else
    v_tier := 'free';
  end if;

  v_limit := coalesce((p_limits ->> v_tier)::integer, 0);
  if v_tier = 'free' then
    v_limit := v_limit + coalesce((
      select sum(g.units)::integer from public.ai_quota_grants g
      where g.user_id = p_user and g.meter = p_meter and g.day = v_day
    ), 0);
  end if;
  v_pool_limit := (p_pool_limits ->> v_tier)::integer; -- null: no pool for this tier

  -- Earlier days are dead weight: drop this subject's, and pools older than 30 days.
  delete from public.ai_usage where subject = p_subject and day < v_day;
  delete from public.ai_usage
  where subject in ('pool:guest', 'pool:free') and day < v_day - 30;

  if p_enforce and v_limit < p_units then
    return jsonb_build_object('allowed', false, 'tier', v_tier, 'limit', v_limit,
      'used', null, 'reason', 'quota', 'wouldDeny', true);
  end if;

  insert into public.ai_usage as u (subject, meter, day, used)
  values (p_subject, p_meter, v_day, p_units)
  on conflict (subject, meter, day) do update
    set used = u.used + p_units
    where not p_enforce or u.used + p_units <= v_limit
  returning u.used into v_used;

  if v_used is null then
    return jsonb_build_object('allowed', false, 'tier', v_tier, 'limit', v_limit,
      'used', (select a.used from public.ai_usage a
               where a.subject = p_subject and a.meter = p_meter and a.day = v_day),
      'reason', 'quota', 'wouldDeny', true);
  end if;

  if v_pool_limit is not null then
    if not (p_enforce and v_pool_limit < p_units) then
      insert into public.ai_usage as u (subject, meter, day, used)
      values ('pool:' || v_tier, p_meter, v_day, p_units)
      on conflict (subject, meter, day) do update
        set used = u.used + p_units
        where not p_enforce or u.used + p_units <= v_pool_limit
      returning u.used into v_pool_used;
    end if;
    if v_pool_used is null then
      update public.ai_usage set used = used - p_units
      where subject = p_subject and meter = p_meter and day = v_day;
      return jsonb_build_object('allowed', false, 'tier', v_tier, 'limit', v_limit,
        'used', v_used - p_units, 'reason', 'pool', 'wouldDeny', true);
    end if;
  end if;

  return jsonb_build_object('allowed', true, 'tier', v_tier, 'limit', v_limit,
    'used', v_used, 'reason', null,
    'wouldDeny', v_used > v_limit or (v_pool_limit is not null and v_pool_used > v_pool_limit));
end
$$;

-- ── refund ─────────────────────────────────────────────────────────

-- A request that consumed at 23:59:59 and fails after midnight refunds the new
-- day's row (a no-op if absent). Accepted: the window is one request long.
create or replace function public.refund_ai_quota(
  p_subject text, p_meter text, p_units integer, p_tier text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_units is null or p_units not between 1 and 10 then
    raise exception 'invalid units' using errcode = '22023';
  end if;
  update public.ai_usage
  set used = greatest(used - p_units, 0)
  where day = (now() at time zone 'utc')::date
    and meter = p_meter
    and subject in (p_subject, 'pool:' || coalesce(p_tier, ''));
end
$$;

-- ── cost ───────────────────────────────────────────────────────────

create or replace function public.record_ai_cost(
  p_meter text, p_model text, p_tier text, p_input integer, p_output integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.ai_cost_daily as c (day, meter, model, tier, calls, input_tokens, output_tokens)
  values ((now() at time zone 'utc')::date, p_meter, left(p_model, 80), p_tier, 1,
          greatest(coalesce(p_input, 0), 0), greatest(coalesce(p_output, 0), 0))
  on conflict (day, meter, model, tier) do update
    set calls = c.calls + 1,
        input_tokens = c.input_tokens + excluded.input_tokens,
        output_tokens = c.output_tokens + excluded.output_tokens;
end
$$;

revoke all on function public.consume_ai_quota(text, uuid, text, integer, jsonb, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.refund_ai_quota(text, text, integer, text) from public, anon, authenticated;
revoke all on function public.record_ai_cost(text, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_ai_quota(text, uuid, text, integer, jsonb, jsonb, boolean) to service_role;
grant execute on function public.refund_ai_quota(text, text, integer, text) to service_role;
grant execute on function public.record_ai_cost(text, text, text, integer, integer) to service_role;
