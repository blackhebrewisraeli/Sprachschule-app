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
