# Pre-beta owner checklist

**Owner-only.** Manual dashboard steps for when the owner is back. Nothing
here can be finished from the repo: each item needs the Supabase, Vercel,
GitHub, or Google Cloud console. Agents must not apply production
migrations, rotate keys, disable Google auth, or delete users.

Companion runbooks:

- Magic Link template + redirect URLs → `docs/AUTH_EMAIL_TEMPLATE_RUNBOOK.md`
- Google OAuth provider → `docs/AUTH_GOOGLE_OAUTH_RUNBOOK.md`
- GitHub OAuth provider (not yet enabled) → `docs/AUTH_GITHUB_OAUTH_RUNBOOK.md`
- Sign in with Apple (on in native builds since #442) → `docs/AUTH_APPLE_OAUTH_RUNBOOK.md`
- Native deep-link callback → `docs/MOBILE_AUTH_SETUP.md`
- Store release blockers, ranked → `docs/STORE_SUBMISSION_CHECKLIST.md`
- Recurring owner actions that stay queued → `docs/BACKLOG.md`

Do **not** paste secret values into chat, tickets, or commit messages. Confirm
presence and last-rotated date only.

---

## 1. Confirm or rotate the Supabase secret / service_role key

Only if a leak is confirmed (secret-scanning alert, paste in a ticket, or a
`VITE_`-prefixed copy in Vercel).

1. Supabase → project **Sprachschule** → **Settings → API Keys**.
2. Rotate the **secret** / legacy **service_role** key. Do not create a new
   key _named_ `service_role` — that name is reserved.
3. Vercel → project → **Settings → Environment Variables** → update
   **`SUPABASE_SERVICE_ROLE_KEY`** on Production and Preview.
   - **Never** `VITE_SUPABASE_SERVICE_ROLE_KEY`. Vite inlines every `VITE_*`
     var into the public bundle.
4. Redeploy. The functions read this at runtime; a dashboard edit without a
   new deploy is enough for serverless, but Preview branches that were built
   with a stale value still need a rebuild if anything baked it in.

If no leak is confirmed, skip rotation. Presence of the key in Vercel is
expected.

## 2. Review GitHub secret-scanning alerts

GitHub → **Security → Secret scanning**. Open every alert.

- A real cloud service_role / secret key, Anthropic key, or Sentry write
  token → treat as a leak and rotate (step 1 / the matching provider).
- A false positive from a placeholder (`your_local_service_role_key_here`)
  → dismiss with a note. `.env.example` already uses a non-triggering
  placeholder for the local service-role key for this reason.

## 3. Magic Link template + redirect URLs

**Magic Link template + OTP expiry — owner-applied 2026-09-18** in project
Sprachschule. Hosted Magic Link body matches the repo template (footer:
"This code expires in five minutes."). Email OTP / magic-link expiry is
**300 seconds (5 minutes)** in the dashboard; `supabase/config.toml`
`[auth.email] otp_expiry` matches. JWT expiry is unchanged.

Hosted Auth still does not pick up later repo edits by itself. After any
future template change, re-paste via `docs/AUTH_EMAIL_TEMPLATE_RUNBOOK.md`.

**Redirect URLs — still owner-only / unverified from the repo:**

1. **Authentication → URL Configuration**:
   - Site URL → `https://www.sprachschule-app.com`
   - Redirect URLs → production origin, provider fallback
     `https://deutsch-app-dusky.vercel.app`, `http://localhost:5173`, and
     `http://127.0.0.1:5173` (exact match, no wildcards for the local pair)

Send one real magic-link email after any later template paste and confirm
both the 6-digit code and the link still sign in.

## 4. Auth custom domain / Google OAuth branding

Google's consent screen and redirect currently show
`xcnnlczvxmuwcqwychox.supabase.co` (see
`docs/AUTH_GOOGLE_OAUTH_RUNBOOK.md` §4). That hostname is the public API
subdomain, not a secret, but it looks like an unverified third party.

Decide and, if shipping, do both:

1. Supabase → **Authentication → Custom Domains** (or Auth Hooks / URL
   config, depending on plan) — put Auth behind a first-party host.
2. Google Cloud → **Clients** → authorized redirect URI must become the
   **new** `/auth/v1/callback`, not the old `*.supabase.co` URL. Leaving
   the old URI is the usual `redirect_uri_mismatch`.

Do **not** disable the Google provider while doing this. The live flag
`VITE_GOOGLE_AUTH_ENABLED` stays on.

## 5. Registration policy (closed beta)

> **Status 2026-10-11: OWNER CONFIRMATION REQUIRED.** The repository now
> enforces the closed beta at the Supabase Auth boundary: a
> before-user-created hook refuses any email missing from
> `private.beta_signup_allowlist` **before** `auth.users` or `profiles` is
> written (`supabase/migrations/20261011120000_beta_signup_allowlist_hook.sql`,
> `supabase/tests/rls/beta-signup-hook.test.js`). Nothing is live until the
> owner applies the migrations, enters the addresses and enables the hook in
> the dashboard. Procedure and verification:
> **`docs/AUTH_BETA_ALLOWLIST_RUNBOOK.md`**.

What changed from the 2026-10-05 setup:

- **`VITE_SIGNUP_EMAIL_ALLOWLIST` is gone.** The client no longer reads it, and
  as a `VITE_` variable it was inlined into the public bundle, publishing every
  tester's address. **Delete it from Vercel Production and Preview and
  redeploy** (runbook step 5). `src/noWholeEnvInBundle.test.js` keeps any
  client code from inlining the env object again.
- **The tester list lives in the database**, entered by the owner in SQL. It is
  never committed to the repository, an env file or a doc.
- **`SIGNUP_EMAIL_ALLOWLIST` (server only) stays**, as the gate for accounts
  that existed before the hook (`api/_lib/auth-middleware.js`). Keep it equal
  to the table, or unset it once every pre-existing unlisted account is dealt
  with (runbook step 7, and §6 below). Unset or empty means that gate is off.
- An uninvited sign-up now sees "This email isn't invited to the beta" from
  the magic-link form or the OAuth callback landing, and no account is created.
  Guests (Continue without account) are unaffected.

Do **not** flip `enable_signup` in the Supabase dashboard and do **not**
disable a provider: the hook is the switch, and turning it off re-opens signup
in one click. Do **not** delete users from an agent session.

## 6. Decision on `fateevvl@gmail.com`

An unexpected Google signup. Options: **block** (admin v1,
`profiles.blocked_at`), **delete** (B3 export/delete), or **keep**.

Do **not** delete the user from an agent session. If blocking, use the
admin UI as the owner. Note the choice next to this item.

## 7. Enable leaked-password protection

> **Low value here.** The product is passwordless (magic link and Google, no
> password anywhere), so no learner password exists to check. Enabling it
> silences the advisor; it does not change a user-facing risk. P2.

Supabase advisor WARN `auth_leaked_password_protection` is currently
firing: Auth is not checking passwords against HaveIBeenPwned.

Dashboard: **Authentication → Attack Protection** (or **Providers → Email**
password security) → enable **Leaked password protection**.

This is a hosted Auth setting. Editing `supabase/config.toml` only affects
local `supabase start`.

## 8. Apply pending security-hardening migrations — ✅ all three applied

Two files were applied on 2026-09-21, in this order: **#290 then #293**
(BACKLOG owner actions #6 then #7). A **third arrived on 2026-09-22**
(§8c, the `profile_follows` follow-up to #316). **All three are now applied**
(8c confirmed 2026-10-03, see below). The sections are kept as the record of
what ran and how it was verified.

Verified 2026-09-21 by production read-only check plus Migration Drift
CI — see _Verification_ below. No `supabase migration repair`, `db push`,
`db pull`, `db reset`, or MCP apply was used; the SQL ran verbatim in the
Sprachschule dashboard SQL editor.

### 8a. `#290` — `is_league_member` off the PostgREST surface

Repo file: `supabase/migrations/20260918200000_revoke_is_league_member_execute.sql`.

**✅ Applied 2026-09-21** (`schema_migrations` name
`revoke_is_league_member_execute`). Code landed as #290. Moves
`is_league_member` to schema
`private` (not in PostgREST's exposed schemas) and points both league RLS
policies at it. `authenticated` keeps `EXECUTE` there — PostgreSQL checks
that privilege when evaluating RLS, so revoking it in `public` 42501'd
every league SELECT. Dropping the public function is what closes
`/rpc/is_league_member`.

After it runs: sign in, open Stats → Ligen, confirm standings load. A
42501 on that SELECT means the private-schema grants did not land; do not
recreate `public.is_league_member`.

### 8b. `#293` — deny-all policies on server-only tables

Repo file: `supabase/migrations/20260918213000_server_only_rls_deny_policies.sql`.

**✅ Applied 2026-09-21** (`schema_migrations` name
`server_only_rls_deny_policies`), after 8a / the #290 migration as
required. Code landed as #293. Adds deny-all RLS policies (`USING false` / `WITH CHECK false`)
for `anon` and `authenticated` on `rate_limits` and `progress_events_seen`.
RLS stays enabled. No client grants. `service_role` keeps `GRANT ALL` (it
bypasses RLS). Learners never hit these tables; there is no UI smoke test.
Confirm advisor INFO `rls_enabled_no_policy` clears for both tables, and
Migration Drift sees the new name.

Ignore a red **Supabase Preview** check — that asks the inverse question
and is stale on `main` on purpose (`AGENTS.md`).

### 8c. `#316` follow-up — deny-all policies on `profile_follows`

Repo file: `supabase/migrations/20260921210000_profile_follows_deny_policies.sql`.

**✅ Applied** (confirmed 2026-10-03: read-only `list_migrations` on
production lists `profile_follows_deny_policies` at `20260921210000`, the
filename's own version, and the live security advisors no longer report
0008 `rls_enabled_no_policy`). The original instruction was the dashboard SQL
editor, never `migration repair`, `db push`, `db reset`, or MCP apply.

`#316` added `public.profile_follows` with RLS enabled and every grant
revoked from `anon` and `authenticated`, which already denies the Data
API — the table is **fail-closed today and this is not a vulnerability**.
Supabase advisor INFO 0008 (`rls_enabled_no_policy`) flags it anyway,
because "RLS on, no policies" cannot be told apart from a forgotten
policy.

That ambiguity is the whole reason to fix it. On this schema a table with
no policy should always mean somebody forgot; §8b settled that convention
for `rate_limits` and `progress_events_seen`, and leaving the third
server-only table outside it makes the advisor's INFO line unreadable as
a signal.

The grant list is deliberately NARROWER than §8b's: a follow row is
created or removed, never edited, so `service_role` gets
`select`/`insert`/`delete` and **not** `update`.
`supabase/tests/rls/server-only-tables.test.js` asserts both the granted
and the withheld privileges.

Result: advisor 0008 is clear. The live security advisors on 2026-10-03 show
`auth_leaked_password_protection` (§7) plus 0029 on five `SECURITY DEFINER`
RPCs that signed-in users are meant to call (`accept_legal_terms`,
`award_tokens`, `spend_tokens`, `register_push_device`,
`unregister_push_device`); each checks `auth.uid()` itself. Treat 0029 as
accepted, not as a blocker. The profile endpoints are unaffected — they already use the
service role. There is no UI smoke test; learners never touch this table
from the browser.

Verified red→green against a clean local stack (`supabase db reset
--local`): without the migration exactly one assertion fails — the
missing `profile_follows` deny-all policy — and with it the file's 7
tests and the full 14-file / 129-test RLS suite pass.

### Verification (2026-09-21)

Both migrations were confirmed applied by their **effects**, not just by a
`schema_migrations` stamp — a stamp row alone never proves a migration
took.

- **Migration Drift CI on `main`:** red on 2026-09-18 (before the apply),
  green on 2026-09-19 and 2026-09-20. Drift name-matches, so the
  production version stamps differing from the repo filenames
  (`20260918222912` vs `20260918213000`) is expected and not drift.
- **Production read-only check** (catalog reads only; no DDL, no writes):
  - `is_league_member` exists **only** in schema `private`; the
    `public` function is gone, so `/rpc/is_league_member` is closed.
    `authenticated` holds `EXECUTE` on the private one, as 8a intends.
  - `read my league rows` (`league_members`) and `read my leagues`
    (`leagues`) both evaluate `private.is_league_member(...)` with the
    InitPlan-wrapped `auth.uid()` intact.
  - `rate_limits` and `progress_events_seen` each carry a
    `no client access` policy, `FOR ALL`, `USING false` /
    `WITH CHECK false`.
- **Supabase advisors** (live, not cached): WARN 0029
  `authenticated_security_definer_function_executable` and INFO 0008
  `rls_enabled_no_policy` are both **clear**. The only remaining security
  advisor is `auth_leaked_password_protection`, which is §7 above and
  unrelated to these two migrations.

## 9. Merge the outstanding docs PR if it is still open

`#289` (`chore(docs): mark user roles + admin as shipped`) landed on
`main` 2026-09-18. If another docs-only PR is open when you return, merge
or close it so `docs/BACKLOG.md` owner-action rows do not fork.

---

## Out of scope (do not do from this list)

- Applying migrations from Cursor / Claude Code / MCP.
- Disabling Google auth in production.
- Deleting users.
- Touching Chat redesign (`ChatTab`, `src/components/chat/**`,
  chat-redesign specs) — Piccolo owns that.
