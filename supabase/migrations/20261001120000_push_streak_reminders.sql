-- Streak-reminder sender, the database half.
-- Design: docs/superpowers/specs/2026-10-01-push-sender-design.md (§5, §7, §12).
--
-- DO NOT apply this to production from an agent. The owner applies it to
-- Sprachschule (xcnnlczvxmuwcqwychox) after merge, with the Management API
-- procedure in docs/MOBILE_PUSH_SETUP.md §1, then runs
-- `notify pgrst, 'reload schema';`. Never `migration repair`, `db push`, or
-- MCP apply_migration. Requires 20260927120000_user_devices (applied).
--
-- ── Part 1: the device reports its time zone; tokens are FCM tokens ─────────
--
-- user_devices.time_zone is the IANA zone of the device's own clock, the zone
-- the client's todayKey() (src/lib/stats.js) uses to name the day an exercise
-- lands in. It is the only zone in which "today" means what the streak means.
-- It is re-reported on every register (every signed-in launch). A name the
-- database does not know is stored as NULL, and a device without a zone is
-- never reminded: no guessing, no default zone.
--
-- Tokens are FCM registration tokens on both platforms. The iOS app hands
-- Capacitor the FCM token (ios/App/App/AppDelegate.swift); a raw APNs device
-- token (32 bytes as 64 hex characters) is refused, and any already stored is
-- purged, because FCM's HTTP v1 API cannot address one. A purged device
-- re-registers with an FCM token on its next launch with a current build.

alter table public.user_devices add column if not exists time_zone text;

comment on column public.user_devices.time_zone is
  'IANA time zone the device reported on its last register (NULL = unknown). The sender evaluates "today" in this zone.';
comment on column public.user_devices.push_token is
  'FCM registration token (both platforms). Unique: a device rings for one account at a time.';
comment on column public.user_devices.platform is
  'ios or android. Diagnostic; one FCM message carries both platform blocks.';

delete from public.user_devices
 where platform = 'ios'
   and push_token ~ '^[0-9A-Fa-f]{64}$';

-- The 2-argument version must go: PostgREST cannot choose between it and a
-- 3-argument version with a default, and would reject every call. Older
-- clients calling with (p_token, p_platform) resolve to the new one.
drop function if exists public.register_push_device(text, text);

create or replace function public.register_push_device(
  p_token     text,
  p_platform  text,
  p_time_zone text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_zone text := null;
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_token is null or char_length(p_token) not between 1 and 4096 then
    raise exception 'invalid token' using errcode = '22023';
  end if;
  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'invalid platform' using errcode = '22023';
  end if;
  if p_platform = 'ios' and p_token ~ '^[0-9A-Fa-f]{64}$' then
    raise exception 'raw APNs token: this build cannot receive push' using errcode = '22023';
  end if;

  -- Validated, not trusted: the sender runs `at time zone` on this value.
  if p_time_zone is not null
     and char_length(p_time_zone) between 1 and 64
     and exists (select 1 from pg_catalog.pg_timezone_names z where z.name = p_time_zone) then
    v_zone := p_time_zone;
  end if;

  insert into public.user_devices (push_token, user_id, platform, time_zone)
  values (p_token, v_uid, p_platform, v_zone)
  on conflict (push_token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
        time_zone = excluded.time_zone,
        updated_at = now();

  -- MAX_DEVICES = 10. Keep the most recently registered; the ones that fall
  -- off are the installs that have stopped launching.
  delete from public.user_devices d
   where d.user_id = v_uid
     and d.push_token in (
       select k.push_token
         from public.user_devices k
        where k.user_id = v_uid
        order by k.updated_at desc, k.push_token
        offset 10
     );
end
$$;

revoke all on function public.register_push_device(text, text, text) from public, anon;
grant execute on function public.register_push_device(text, text, text) to authenticated, service_role;

-- ── Part 2: the claim, and who is due ──────────────────────────────────────
--
-- push_reminder_claims is NOT a notification history. One row means "this
-- learner's streak reminder for this local day is taken". The sender claims
-- BEFORE sending, in the same statement that selects the learner, so a
-- duplicated or overlapping tick (pg_cron and pg_net are at-least-once) finds
-- the row and sends nothing. A run that could not reach a learner releases the
-- row (the sender deletes it), so a later tick inside the window retries. Real
-- runs prune rows older than 8 days; account deletion cascades.

create table if not exists public.push_reminder_claims (
  user_id    uuid not null references auth.users(id) on delete cascade,
  local_day  date not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, local_day)
);

comment on table public.push_reminder_claims is
  'At most one streak reminder per learner per local day. Server-only; written by claim_streak_reminders and the sender.';

alter table public.push_reminder_claims enable row level security;

drop policy if exists "no client access" on public.push_reminder_claims;
create policy "no client access"
  on public.push_reminder_claims
  for all
  to anon, authenticated
  using (false)
  with check (false);

-- service_role too, then back exactly what the sender uses: a claim is
-- inserted, read and deleted, never edited (server-only-tables.test.js asserts
-- the withheld UPDATE).
revoke all on table public.push_reminder_claims from anon, authenticated, service_role;
grant select, insert, delete on table public.push_reminder_claims to service_role;

-- Due = opted in (a device row), a zone resolves (the newest device that
-- reports one), local hour in [p_start_hour, p_start_hour + p_window_hours),
-- not blocked, today's XP below the goal, and yesterday counted (XP at the goal
-- or a frozen day). The same rule as src/lib/streak.js, minus freeze
-- simulation (spec §6). The goal is settings.data.goal when it is a number in
-- [1, 1000], else p_default_goal (the sender passes DEFAULT_GOAL).
--
-- ponytail: resolving zones scans user_devices once per tick. That is fine to
-- ~1e5 devices; past that, precompute a UTC-offset bucket per device.
create or replace function public.claim_streak_reminders(
  p_now          timestamptz,
  p_start_hour   integer,
  p_window_hours integer,
  p_default_goal integer,
  p_pack_id      text,
  p_limit        integer,
  p_only_user    uuid default null,
  p_dry_run      boolean default false
)
returns table (user_id uuid, local_day date, expires_at timestamptz, push_token text)
language plpgsql
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_now is null
     or p_start_hour is null or p_start_hour not between 0 and 23
     or p_window_hours is null or p_window_hours < 1
     or p_start_hour + p_window_hours > 24
     or p_default_goal is null or p_default_goal < 1
     or p_limit is null or p_limit not between 1 and 10000
     or p_pack_id is null then
    raise exception 'invalid reminder parameters' using errcode = '22023';
  end if;

  if not coalesce(p_dry_run, false) then
    delete from public.push_reminder_claims c
     where c.claimed_at < p_now - interval '8 days';
  end if;

  return query
  with zone as (
    select distinct on (d.user_id) d.user_id, d.time_zone
      from public.user_devices d
     where d.time_zone is not null
       and (p_only_user is null or d.user_id = p_only_user)
     order by d.user_id, d.updated_at desc, d.push_token
  ), due as (
    select z.user_id,
           z.time_zone,
           (p_now at time zone z.time_zone)::date as day
      from zone z
     where p_only_user is not null
        or extract(hour from (p_now at time zone z.time_zone))
             between p_start_hour and p_start_hour + p_window_hours - 1
  ), eligible as (
    select du.user_id, du.time_zone, du.day
      from due du
      left join public.settings s on s.user_id = du.user_id
      left join public.stats_daily t
        on t.user_id = du.user_id and t.pack_id = p_pack_id and t.day = du.day
      left join public.stats_daily y
        on y.user_id = du.user_id and y.pack_id = p_pack_id and y.day = du.day - 1
      -- Nested CASE, not AND: Postgres does not promise to evaluate the type
      -- test before the cast, and settings.data is client-writable ('lots').
      cross join lateral (
        select case
                 when jsonb_typeof(s.data -> 'goal') = 'number' then
                   case
                     when (s.data ->> 'goal')::numeric between 1 and 1000
                     then floor((s.data ->> 'goal')::numeric)::integer
                     else p_default_goal
                   end
                 else p_default_goal
               end as goal
      ) g
     where coalesce(public.progress_day_xp(t.counters), 0) < g.goal
       and (coalesce(public.progress_day_xp(y.counters), 0) >= g.goal
            or coalesce(s.data -> 'frozenDays' ->> to_char(du.day - 1, 'YYYY-MM-DD'), '') = 'true')
       and not exists (
             select 1 from public.profiles p
              where p.user_id = du.user_id and p.blocked_at is not null)
       and not exists (
             select 1 from public.push_reminder_claims c
              where c.user_id = du.user_id and c.local_day = du.day)
     order by du.user_id
     limit p_limit
  ), claimed as (
    insert into public.push_reminder_claims as c (user_id, local_day)
    select e.user_id, e.day
      from eligible e
     where not coalesce(p_dry_run, false)
    on conflict do nothing
    returning c.user_id, c.local_day
  ), chosen as (
    select cl.user_id, cl.local_day from claimed cl
    union all
    select e.user_id, e.day from eligible e where coalesce(p_dry_run, false)
  )
  select ch.user_id,
         ch.local_day,
         ((ch.local_day + 1)::timestamp at time zone e.time_zone) as expires_at,
         d.push_token
    from chosen ch
    join eligible e on e.user_id = ch.user_id
    join public.user_devices d on d.user_id = ch.user_id
   order by ch.user_id, d.push_token;
end
$$;

revoke all on function public.claim_streak_reminders(timestamptz, integer, integer, integer, text, integer, uuid, boolean) from public, anon, authenticated;
grant execute on function public.claim_streak_reminders(timestamptz, integer, integer, integer, text, integer, uuid, boolean) to service_role;
