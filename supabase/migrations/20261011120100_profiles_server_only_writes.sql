-- profiles is written by the server only.
--
-- authenticated kept column-level INSERT/UPDATE on handle, avatar_path and the
-- name and privacy fields (20260918153000, 20260924120000) under the
-- "insert own profile" / "update own profile" policies. Every legitimate write
-- already goes through the service role or a definer function:
--   - api/_lib/accountEndpoints.js   profile PATCH (handle, names, privacy, avatar)
--   - api/v1/league/handle.js        handle rename
--   - api/_lib/adminEndpoints.js     block / unblock
--   - handle_new_user, award_tokens, spend_tokens (SECURITY DEFINER)
-- and the browser only ever SELECTs (src/lib/profile.js, src/lib/economy.js).
-- The direct path was therefore only a way around the API's checks: PATCH
-- /rest/v1/profiles could point avatar_path at another learner's folder and
-- wear their picture, store a handle of any length, or leave
-- league_members.handle out of step with the profile.
--
-- PRE-CHECK before applying to an existing database. Both must return no rows,
-- or the constraints below fail the migration (docs/AUTH_BETA_ALLOWLIST_RUNBOOK.md):
--   select user_id from public.profiles
--    where avatar_path is not null
--      and (not starts_with(avatar_path, user_id::text || '/')
--           or strpos(avatar_path, '..') > 0);
--   select user_id from public.profiles
--    where char_length(handle) not between 1 and 24;

-- Revoking a table privilege also revokes the column privileges granted on
-- that table, so this removes every column grant listed above.
revoke insert, update on table public.profiles from anon, authenticated;

-- With no insert/update policy left, RLS denies both to every role that does
-- not bypass it, so a future GRANT cannot quietly reopen the direct path.
-- "select own profile" stays: the app reads its own row.
drop policy if exists "insert own profile" on public.profiles;
drop policy if exists "update own profile" on public.profiles;

-- The API's own rules, now true of every writer including the service role:
-- ownsAvatarPath and MAX_LEN.handle in api/_lib/accountEndpoints.js.
alter table public.profiles
  add constraint profiles_avatar_path_own_folder check (
    avatar_path is null
    or (starts_with(avatar_path, user_id::text || '/') and strpos(avatar_path, '..') = 0)
  ),
  add constraint profiles_handle_length check (char_length(handle) between 1 and 24);
