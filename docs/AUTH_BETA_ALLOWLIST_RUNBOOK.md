# Closed-beta admission — owner runbook

**Owner-only.** Every step below acts on the hosted Supabase project or Vercel.
Agents never apply migrations, edit the allowlist, toggle the hook, or touch
Vercel env (`AGENTS.md`, "The MCP config points at PRODUCTION").

**Status 2026-10-11: OWNER CONFIRMATION REQUIRED.** The repository side is done
and tested. None of it is live until the owner completes steps 2–6. Record
each step's date, environment and result in the **Evidence** table at the end.
Do not mark anything VERIFIED without that record (`docs/security/Security
Checklist.md`, sign-off rule).

## What the repository does

| Layer | Behaviour | Where |
| --- | --- | --- |
| **Supabase Auth hook (authority)** | `public.hook_restrict_signup_to_beta_allowlist` runs before every `auth.users` insert made through a public Auth path (magic link / OTP, password signup, OAuth and OIDC, SAML, invites, generated links, anonymous). It admits an email only if `private.beta_signup_allowlist` lists it, after trimming and lowercasing. Missing, unlisted, malformed or errored all get the same `403 Sign-up is invite-only during the beta.` Nothing is written: no auth user, no profile. | `supabase/migrations/20261011120000_beta_signup_allowlist_hook.sql` |
| **Allowlist table** | `private` schema, which the Data API does not expose. RLS on. `supabase_auth_admin` gets `SELECT` only. `anon`, `authenticated`, `service_role` and `PUBLIC` get nothing. Addresses must be stored lowercase and trimmed (a check constraint rejects anything else). | same migration |
| **Server gate (existing accounts)** | `SIGNUP_EMAIL_ALLOWLIST` in `requireAuth` still rejects a verified email that is not listed. It matters only for accounts created **before** the hook was on. | `api/_lib/auth-middleware.js` |
| **Client** | No list. It turns the hook's 403 (magic-link form) or `error_description` (OAuth callback) into "This email isn't invited to the beta". | `src/lib/signupAllowlist.js`, `src/lib/auth.js`, `src/components/auth/AuthCallbackLanding.jsx` |
| **Profiles** | Clients can no longer INSERT or UPDATE `profiles`. Only the account API (service role) writes it. `avatar_path` must stay in the owner's folder, and `handle` must be 1–24 characters, for every writer. | `supabase/migrations/20261011120100_profiles_server_only_writes.sql` |

The admin API (`auth.admin.createUser`) does **not** run this hook. Users you
create from the dashboard's "Add user" or the service role bypass it, by
design.

Tests: `supabase/tests/rls/beta-signup-hook.test.js` (grants, decision table,
fail-closed, end to end through local GoTrue) and
`supabase/tests/rls/profiles-write.test.js`. Both run in the CI job **RLS
Policy Tests**.

## Production sequence

Do the steps in order. Steps 1–3 change nothing a user can see. The gate turns
on at step 4.

### 1. Pre-checks (read-only SQL)

Run in the Supabase SQL editor.

Rows that would fail the new profile constraints. **Both must return no rows**,
or step 2's second migration fails:

```sql
select user_id from public.profiles
 where avatar_path is not null
   and (not starts_with(avatar_path, user_id::text || '/')
        or strpos(avatar_path, '..') > 0);

select user_id from public.profiles
 where char_length(handle) not between 1 and 24;
```

If either returns rows, fix those rows through the admin UI or the account API
first. Do not edit the migration.

Existing accounts. Keep this result for step 7:

```sql
select id, created_at, last_sign_in_at,
       (select array_agg(provider) from auth.identities i where i.user_id = u.id) as providers
  from auth.users u
 order by created_at;
```

### 2. Apply the two migrations

Use the usual drill: baseline `list_migrations`, apply, verify, then
`notify pgrst, 'reload schema'`. Apply in filename order:

1. `20261011120000_beta_signup_allowlist_hook.sql`
2. `20261011120100_profiles_server_only_writes.sql`

Never `migration repair` and never `db push`. Afterwards **Migration Drift**
must be green. That needs a working `SUPABASE_ACCESS_TOKEN` repository secret:
on 2026-10-10 it returned 401, so drift is currently unverified.

The app keeps working after step 2. Profile edits already go through the API,
and the hook is not on yet.

### 3. Enter the beta addresses

One statement per address, in the SQL editor. **Never** commit addresses to the
repository, an env file, a doc or an issue.

```sql
insert into private.beta_signup_allowlist (email)
values (lower(btrim('tester@example.com')))
on conflict do nothing;
```

- Include the owner/admin mailbox.
- Apple "Hide My Email" testers sign up with their **relay** address
  (`…@privaterelay.appleid.com`). List that address, or ask them to share their
  real address with Apple.
- GitHub sign-up uses the account's primary verified email.
- Check: `select email, added_at from private.beta_signup_allowlist order by added_at;`

To remove someone later: `delete from private.beta_signup_allowlist where email = '…';`.
This stops new sign-ups only. An existing account is handled in step 7.

### 4. Enable the hook

Supabase dashboard → **Authentication → Hooks** → **Add hook** → **Before User
Created** → **Postgres**:

- Schema: `public`
- Function: `hook_restrict_signup_to_beta_allowlist`

Save, and make sure it shows as enabled. It takes effect immediately. To
re-open signup (or roll back), disable the hook here.

### 5. Remove the old client list from Vercel

Vercel → project → **Settings → Environment Variables**: **delete
`VITE_SIGNUP_EMAIL_ALLOWLIST`** from Production and Preview, then **redeploy**
(env edits do not rebuild the bundle).

The code no longer reads it, and `src/noWholeEnvInBundle.test.js` keeps the
client from inlining the whole env object. Deleting it anyway removes the last
copy of the list outside the database. After the redeploy, check that the live
JS bundle contains none of the tester addresses.

Keep `SIGNUP_EMAIL_ALLOWLIST` (server, never `VITE_`) for now. See step 7.

### 6. Verify

| # | Action | Expected |
| --- | --- | --- |
| 6a | Listed address that has no account yet: magic-link sign-up on the web | Code arrives; signed in. `select count(*) from auth.users where email = '<address>'` → 1 |
| 6b | Throwaway **unlisted** address: magic-link sign-up | Form shows "This email isn't invited to the beta. Ask the owner for access." No email is sent |
| 6c | Unlisted Google (or GitHub/Apple) account: OAuth sign-up | Callback landing titled "This email isn't invited"; "Continue as guest" keeps a guest session |
| 6d | After 6b and 6c | `select count(*) from auth.users where lower(email) in ('<throwaway-1>', '<throwaway-2>')` → **0**. No user means no profile, since `profiles.user_id` references `auth.users` |
| 6e | Direct profile write refused | `select has_table_privilege('authenticated', 'public.profiles', 'UPDATE'), has_table_privilege('authenticated', 'public.profiles', 'INSERT')` → `false, false` |
| 6f | Account API still edits a profile | As a tester: Settings → change name/handle/avatar → saved |
| 6g | Constraints present | `select conname from pg_constraint where conrelid = 'public.profiles'::regclass and conname like 'profiles_%'` includes `profiles_avatar_path_own_folder` and `profiles_handle_length` |
| 6h | Hook grants | `select has_function_privilege('anon', 'public.hook_restrict_signup_to_beta_allowlist(jsonb)', 'EXECUTE')` → `false`; same for `authenticated` |
| 6i | Live bundle | No tester address appears in the deployed JS (after step 5) |

Use the unlisted identity **only** for the denial checks. Export and deletion
testing needs an allowlisted disposable account (`docs/security/Security
Checklist.md` row 11).

### 7. Accounts that existed before the hook

The hook only gates **new** accounts. For each account from step 1's list
whose email is not in the table:

```sql
select u.id, u.created_at
  from auth.users u
 where not exists (
   select 1 from private.beta_signup_allowlist a where a.email = lower(btrim(u.email))
 );
```

Decide per account: **list** it, **block** it (admin UI, `profiles.blocked_at`),
or **delete** it (as the owner, never from an agent session). While any such
account remains, keep `SIGNUP_EMAIL_ALLOWLIST` equal to the table, so the
server keeps refusing that account's API calls. Once none remain, the variable
can be unset.

## Local development

`supabase/config.toml` enables the same hook on the local stack. To sign up
through the app locally, list your address first:

```bash
psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "insert into private.beta_signup_allowlist (email) values ('you@example.com')"
```

Fixtures created through the admin API (the RLS suite) are not affected.

## Evidence (fill in; do not mark VERIFIED without it)

| Step | Date | Environment | Result / evidence |
| --- | --- | --- | --- |
| 1 Pre-checks | | Production | |
| 2 Migrations applied | | Production | |
| 3 Addresses entered (count only) | | Production | |
| 4 Hook enabled | | Production | |
| 5 `VITE_SIGNUP_EMAIL_ALLOWLIST` deleted + redeploy | | Vercel Production, Preview | |
| 6a–6i | | Production | |
| 7 Pre-existing accounts decided | | Production | |
