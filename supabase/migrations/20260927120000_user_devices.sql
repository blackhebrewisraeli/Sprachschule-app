-- Push-notification device registry: one row per device that opted in, and the
-- two RPCs that are the ONLY way the browser touches it.
--
-- DO NOT apply this to production from an agent. The owner applies it to
-- Sprachschule (xcnnlczvxmuwcqwychox) after merge, under AGENTS.md. Never
-- `migration repair`, `db push`, or MCP apply_migration.
--
-- Why a table and not profiles.push_token
-- ---------------------------------------
-- * A learner can have more than one device (phone + tablet). A single column
--   would let the second device silently steal the first one's reminders.
-- * A token identifies a DEVICE, not a person, and devices change hands: one
--   phone, two accounts signing in and out. Keying the row on the token means
--   a token belongs to exactly one account at a time, so the last account to
--   opt in on a device is the only one it rings for.
-- * profiles is read by several endpoints (passport, Find People, the header)
--   and carries narrowed column grants. A device credential has no business
--   riding along with any of that.
--
-- Threat model
-- ------------
-- The table is server-only, stated the way 20260918213000 states it: RLS on, a
-- deny-all policy for the Data API roles, and no client grants. Browsers go
-- through register_push_device / unregister_push_device (SECURITY DEFINER),
-- which only ever act as auth.uid():
--   * register claims a token for the CALLER. It can move a token away from
--     another account, which is exactly the shared-device case above. Doing
--     that on purpose needs someone else's token, which only their device (or
--     the service role) holds. The worst outcome is that the victim's device
--     stops getting the victim's reminders and gets the attacker's instead;
--     nothing about the victim is read or revealed.
--   * register keeps at most MAX_DEVICES (10) rows per account, newest first,
--     so a script cannot grow the table without bound under one account.
--   * unregister deletes only the caller's own row for that token.
-- The eventual sender (a server job, service_role) reads by user_id and
-- deletes the tokens APNs / FCM report as dead.
--
-- platform matters to that sender: the iOS plugin hands back a raw APNs device
-- token, while Android hands back an FCM registration token. They are sent
-- through different services.

create table public.user_devices (
  push_token  text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  platform    text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint user_devices_platform_check check (platform in ('ios', 'android')),
  constraint user_devices_token_length check (char_length(push_token) between 1 and 4096)
);

-- The sender looks devices up by account, and the auth.users cascade deletes by
-- it. The primary key already covers lookups by token.
create index user_devices_user_id_idx on public.user_devices (user_id);

comment on table public.user_devices is
  'Push-notification tokens, one row per opted-in device. Server-only: browsers write through register_push_device / unregister_push_device.';
comment on column public.user_devices.push_token is
  'APNs device token (ios) or FCM registration token (android). Unique: a device rings for one account at a time.';
comment on column public.user_devices.platform is
  'ios or android. Decides which push service the sender uses.';
comment on column public.user_devices.updated_at is
  'Last time the device re-registered. Registration runs on every signed-in launch, so a stale value means an abandoned install.';

alter table public.user_devices enable row level security;

drop policy if exists "no client access" on public.user_devices;
create policy "no client access"
  on public.user_devices
  for all
  to anon, authenticated
  using (false)
  with check (false);

revoke all on table public.user_devices from anon, authenticated;
grant select, insert, update, delete on table public.user_devices to service_role;

-- ── register ───────────────────────────────────────────────────────

-- Idempotent: the app calls this on every signed-in launch to catch token
-- rotation, so the same (token, caller) must be a cheap no-op-ish upsert.
create or replace function public.register_push_device(p_token text, p_platform text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
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

  insert into public.user_devices (push_token, user_id, platform)
  values (p_token, v_uid, p_platform)
  on conflict (push_token) do update
    set user_id = excluded.user_id,
        platform = excluded.platform,
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

-- ── unregister ─────────────────────────────────────────────────────

-- Opt-out and sign-out. Deleting a token the caller does not own is a silent
-- no-op, not an error: the device may already have been claimed by the next
-- account, and that is not something to report to the one leaving.
create or replace function public.unregister_push_device(p_token text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  delete from public.user_devices
   where push_token = p_token
     and user_id = v_uid;
end
$$;

revoke all on function public.register_push_device(text, text) from public, anon;
revoke all on function public.unregister_push_device(text) from public, anon;
grant execute on function public.register_push_device(text, text) to authenticated, service_role;
grant execute on function public.unregister_push_device(text) to authenticated, service_role;
