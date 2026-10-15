# Closed-beta admission — owner runbook

**Owner-only.** Every step below acts on the hosted Supabase project or Vercel.
Agents never apply migrations, edit the allowlist, toggle the hook, or touch
Vercel env (`AGENTS.md`, "The MCP config points at PRODUCTION").

**Status 2026-10-14: LIVE in production.** Steps 2–6 are done. Step 7 is under
way: four accounts are banned, not deleted. One control in 6c still needs
owner confirmation. The **Production state** section below holds the
2026-10-14 evidence (checked after the Postgres upgrade). Record each later
step's date, environment and result in the **Evidence** table at the end. Do
not mark anything VERIFIED without that record (`docs/security/Security
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
must be green. That needs a working `SUPABASE_ACCESS_TOKEN` repository secret.
It returned 401 on 2026-10-10. Drift works again: run `38578641927` succeeded
on `977ad476` on 2026-10-14. The token expires around 2027-01-12.

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

**Done:** `VITE_SIGNUP_EMAIL_ALLOWLIST` is absent from Vercel, and the live
bundle contains no private mailbox (6i, 2026-10-14).

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

**State 2026-10-14:** four unwanted accounts are banned in Auth until
2026-11-13. They are not deleted. The owner reviews deletion around
2026-10-21. After that, decide whether `SIGNUP_EMAIL_ALLOWLIST` can be
removed.

## Production state — 2026-10-14

Checked after the owner upgraded Postgres on 2026-10-14. These checks read
production and changed nothing. No email address is recorded here. The
allowlist was matched by role against a normalized hash and is never printed.

**VERIFIED IN PRODUCTION**

- Project `ACTIVE_HEALTHY` on Postgres `17.11.0.003`. Extensions:
  `pg_stat_statements` 1.11, `pgcrypto` 1.3, `plpgsql` 1.0, `supabase_vault`
  0.3.1, `uuid-ossp` 1.1.
- Hook `public.hook_restrict_signup_to_beta_allowlist`: source md5
  `783611196fa5da340cfc864d39019833`, SECURITY INVOKER, empty `search_path`.
  Only `postgres` and `supabase_auth_admin` hold EXECUTE.
- `private.beta_signup_allowlist`: RLS enabled. It holds exactly three rows,
  matching the **admin**, **tester** and **support** roles. Policy set md5
  `301e7c4c02cf968990cd549b9064fdc1`. The table's single CHECK definition md5 is
  `497f6782d157ee19558229e48455cd9b`.
- `public.profiles`: RLS is still enabled. `authenticated` holds SELECT only.
  The select-own-profile policy and the three CHECK constraints are unchanged
  in meaning. This was checked against their definitions, not by hash: an
  aggregate hash of the catalog text is not claimed to be stable across
  Postgres versions.
- Counts: 6 auth users, 6 profiles, 0 anonymous users, 4 bans that run into the
  future, 41 migrations (the same number as `supabase/migrations/`).
- Migration Drift run `38578641927` succeeded on `977ad476`, after the upgrade.
- Earlier closed-beta tests in production passed: a listed address signed up
  (6a); an unlisted address was refused by magic link and by Google, and
  neither refusal left a row (6b–6d); direct profile writes were denied, and a
  profile edit through the server, then its revert, both saved (6e, 6f);
  grants and constraints were intact (6g, 6h); private mailboxes were absent
  from the bundle (6i); admin and tester API calls succeeded; the guest path
  from the welcome screen worked.
- `VITE_SIGNUP_EMAIL_ALLOWLIST` is absent from Vercel.
- `SIGNUP_EMAIL_ALLOWLIST` is still a Vercel Secret in Production and Preview.
  Only its name and type were checked, not its value.
- The support address is listed for a future sign-up. It has no account, and
  it is not an admin.
- Four unwanted accounts are banned until 2026-11-13, not deleted.
- Custom SMTP through Resend is live, and its sending domain is verified.

**Unchanged advisor findings (existing items, not caused by the upgrade)**

- Security: five 0029 warnings for SECURITY DEFINER functions
  (`PRE_BETA_OWNER_CHECKLIST.md` §8c: these are accepted), and
  leaked-password protection (§7 there).
- Performance, informational, each a separate follow-up and none of them fixed
  here: one unindexed foreign key on `feedback`, 14 RLS initplan warnings, and
  six unused indexes. The first two are fixed since; see the re-check below.

**Re-checked 2026-10-15 (main `719792ed`), read-only**

Only migrations, advisors and GitHub checks were re-read. The hook, the
allowlist and `profiles` were not re-checked.

- Migrations: `supabase/migrations/` holds 47 files, and production's
  `list_migrations` lists the same 47 by version and name. Migration Drift run
  `38736350948` (scheduled, on `7794b963`) "compared 47 repo migration(s)
  against 47 applied" and passed. #472 (`719792ed`) added no migration.
- Performance advisor:
  - No unindexed foreign key: #463 indexed `feedback.handled_by`.
  - No `auth_rls_initplan` warnings: #466–#470 wrapped `auth.uid()` on
    `srs_state`, `decks`, `settings`, `stats_daily` and `profiles`, after the
    #465 baseline tests. #471 strengthened the ai-history settings-upsert test.
  - Seven INFO `unused_index` findings: the six above, plus the new
    `feedback_handled_by_idx`, which the plan expected. They wait for the
    observation O1, no earlier than 2026-11-13.
- Security advisor: unchanged. Five 0029 warnings and leaked-password
  protection.
- On `719792ed` every check is green, including Build for iOS Simulator and
  Build debug APK. Uptime run `38724294155` passed on 2026-10-15.

**OWNER CONFIRMATION REQUIRED**

- In 6c, the **Continue as guest** button on the denial landing.
- The value of `SIGNUP_EMAIL_ALLOWLIST`.
- The deletion review of the four banned accounts, around 2026-10-21.

**Pending follow-ups (not done)**

- The hosted Confirm signup email template has no six-digit code, and native
  testers need the code. **Repository side done by #472 (merged as `719792ed`,
  2026-10-15):** `supabase/config.toml` wires Confirm signup to the same body
  as Magic Link, and `docs/AUTH_EMAIL_TEMPLATE_RUNBOOK.md` now covers both. **Owner-only, not
  done:** paste that body into the hosted Confirm signup template, then check a
  new invited tester gets a working code and link ("Verify: Confirm signup" in
  that runbook).
- **BLOCKED / EXTERNAL DEPENDENCY:** the Privacy Policy must name Resend before
  any outside tester joins. That edit comes with a `PRIVACY_VERSION` bump, after
  the DPA and counsel review.
- After the banned accounts are deleted, decide whether to remove
  `SIGNUP_EMAIL_ALLOWLIST` (step 7).
- Replace the Migration Drift token before it expires, around 2027-01-12.
- DMARC is at `p=none`.
- Optional: show Google's account chooser at sign-in.
- The public mailbox addresses hardcoded in the repository need a separate
  design review.

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
| 1 Pre-checks | 2026-10-14 | Production | **VERIFIED IN PRODUCTION** before the hook was enabled: 0 invalid `avatar_path` rows, 0 invalid handle rows; account inventory completed |
| 2 Migrations applied | 2026-10-14 (checked) | Production | **VERIFIED IN PRODUCTION**: 41 migrations; Migration Drift run `38578641927` succeeded on `977ad476` |
| 3 Addresses entered (count only) | 2026-10-14 (checked) | Production | **VERIFIED IN PRODUCTION**: 3 rows, matched by role (admin, tester, support) |
| 4 Hook enabled | 2026-10-14 (checked) | Production | **VERIFIED IN PRODUCTION**: a listed sign-up passed, and unlisted magic-link and Google sign-ups were refused |
| 5 `VITE_SIGNUP_EMAIL_ALLOWLIST` deleted + redeploy | 2026-10-14 (checked) | Vercel Production, Preview | **VERIFIED IN PRODUCTION**: the variable is absent, and no private mailbox is in the live bundle |
| 6a–6i | 2026-10-14 (checked) | Production | **VERIFIED IN PRODUCTION**, except the 6c **Continue as guest** control: **OWNER CONFIRMATION REQUIRED** |
| 7 Pre-existing accounts decided | 2026-10-14 | Production | Under way: 4 accounts banned until 2026-11-13, not deleted; deletion review around 2026-10-21 |
| Postgres upgrade re-check | 2026-10-14 | Production | **VERIFIED IN PRODUCTION**: `17.11.0.003`, `ACTIVE_HEALTHY`; hook, allowlist and profiles unchanged (Production state above) |
| Migrations and advisors re-check | 2026-10-15 | Production | **VERIFIED IN PRODUCTION**: 47 migrations, identical to the repo; Migration Drift run `38736350948` 47/47; no unindexed FK, no `auth_rls_initplan`, seven `unused_index` (re-check above) |
| Confirm signup template | — | Production | **NOT DONE (owner-only)**: hosted paste and new-invited-tester check; the repo side is #472 |
