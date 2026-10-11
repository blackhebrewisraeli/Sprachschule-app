# Authentication and authorization

This page distinguishes repository-enforced behavior from live provider and
dashboard state. Status terms are defined in [Security.md](./Security.md).

## Authentication flows

| Flow                  | Repository behavior                                                                                                                                                         | Evidence                                                                                                       | Status                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Email                 | The client uses Supabase OTP/magic-link sign-in; no password flow is implemented in the app.                                                                                | `src/lib/auth.js:243-250`; `src/lib/auth.test.js:55-72`                                                        | **VERIFIED**                                                    |
| Google, GitHub, Apple | Each OAuth provider has an independent build-time flag and uses the same redirect helper. GitHub requests no extra application scope; native flows open the system browser. | `src/lib/auth.js:253-320`; `src/lib/auth.test.js:400-612`                                                      | **VERIFIED** in code; provider/dashboard enablement **BLOCKED** |
| Session               | Supabase persists and refreshes the session. Native auth uses PKCE and handles the callback outside the WebView URL.                                                        | `src/lib/auth.js:84-115`; `src/lib/auth.test.js:747-818`                                                       | **VERIFIED**                                                    |
| Server API            | The client sends a bearer token. The server calls Supabase `getUser` and derives the user ID from that result.                                                              | `src/lib/authedFetch.js:33-56`; `api/_lib/auth-middleware.js:18-31`; `api/_lib/auth-middleware.test.js:20-49`  | **VERIFIED**                                                    |
| Sensitive deletion    | Account deletion requires authentication within 15 minutes plus an exact typed `DELETE`.                                                                                    | `src/lib/authClaims.js:27-32`; `api/_lib/accountEndpoints.js:303-405`; `api/v1/account/delete.test.js:167-223` | **VERIFIED**                                                    |

The repository does not prove which OAuth providers or email settings are live.
The runbooks record earlier production observations, but this dossier did not
independently read those dashboards
(`docs/AUTH_GOOGLE_OAUTH_RUNBOOK.md:7-15`;
`docs/AUTH_EMAIL_TEMPLATE_RUNBOOK.md:13-26`).

## Invite-only signup policy

Since 2026-10-11 the closed beta is enforced where accounts are created, not
after the fact:

1. **Supabase Auth hook (the authority).** `public.hook_restrict_signup_to_beta_allowlist`
   runs as GoTrue's before-user-created hook and admits an email only if
   `private.beta_signup_allowlist` lists it (trimmed, lowercased). Missing,
   unlisted, malformed and errored all return the same `403` message, so the
   response reveals nothing about the list. A refusal happens before the
   `auth.users` insert, so neither an auth user nor a `profiles` row exists
   (`supabase/migrations/20261011120000_beta_signup_allowlist_hook.sql`). The
   table lives in the unexposed `private` schema. `supabase_auth_admin` gets
   SELECT and EXECUTE only. `anon`, `authenticated`, `service_role` and
   `PUBLIC` get nothing. The function is SECURITY INVOKER.
2. **Server gate for pre-existing accounts.** `SIGNUP_EMAIL_ALLOWLIST` in
   `requireAuth` and the AI caller still rejects an unlisted verified identity
   when non-empty (`api/_lib/auth-middleware.js`; `api/_lib/aiCaller.js`). It
   matters only for accounts created before the hook was enabled.
3. **No client list.** `VITE_SIGNUP_EMAIL_ALLOWLIST` was inlined into the
   public bundle and has been removed. The client only recognises the hook's
   refusal (`src/lib/signupAllowlist.js` `isBetaSignupDenial`;
   `src/lib/auth.js` `humanAuthError`, `authCallbackReason` →
   `'not_invited'`). `src/noWholeEnvInBundle.test.js` stops any client code
   from inlining the whole env object again.

"Verified" means a confirmed primary (`email_confirmed_at`) or an identity
whose provider sets `email_verified`. An `email`-provider identity is no
longer proof on its own (`src/lib/verifiedEmails.js`;
`src/lib/verifiedEmails.test.js`). User and app metadata are never read.

| Check | Status | Evidence |
| --- | --- | --- |
| Hook decision table, normalisation, fail-closed, grants, non-exposure | Written; **NOT RUN** locally (Docker unavailable); runs in CI **RLS Policy Tests** | `supabase/tests/rls/beta-signup-hook.test.js` |
| End to end through local GoTrue: unlisted password and OTP signup refused with no user created; listed signup creates user + profile | Same as above | same file, "end to end through Supabase Auth" |
| Client maps the refusal; no list is bundled | **VERIFIED** (`npm test`) | `src/lib/auth.test.js`; `src/lib/signupAllowlist.test.js`; `src/components/auth/AuthCallbackLanding.test.jsx`; `src/noWholeEnvInBundle.test.js` |
| Migration applied, addresses entered, hook enabled, `VITE_SIGNUP_EMAIL_ALLOWLIST` deleted from Vercel, production unlisted attempt leaves no `auth.users`/`profiles` row | **OWNER CONFIRMATION REQUIRED** | `docs/AUTH_BETA_ALLOWLIST_RUNBOOK.md` steps 2–6 |

## Permissions table

| Actor                 | Allowed                                                                                                                   | Denied or constrained                                                                                            | Enforcement and evidence                                                                                                                                                                   | Status                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Signed-out guest      | Use local-only learning state; call guest-capable AI/public routes; download a known public avatar URL.                   | No Data API access to learner tables or league tables.                                                           | `src/lib/storage.js:36-70`; `api/_lib/aiCaller.js:34-40`; `supabase/tests/rls/policies.test.js:291-305`; `supabase/tests/rls/storage.test.js:80-87`                                        | Code **VERIFIED**; RLS execution **NOT RUN**                    |
| Authenticated learner | Read/write own `srs_state`, `decks`, and `settings`; read own profile; use server APIs as the token owner.                | Cannot read/write another learner's rows; cannot directly write `stats_daily`; cannot write server-only tables; cannot INSERT or UPDATE `profiles` at all (the account API is the only writer). | `supabase/migrations/20260611232000_user_tables.sql:47-98`; `supabase/migrations/20260925120000_stats_daily_read_only.sql`; `supabase/migrations/20261011120100_profiles_server_only_writes.sql`; `supabase/tests/rls/policies.test.js`; `supabase/tests/rls/profiles-write.test.js` | Migration **VERIFIED**; RLS execution **NOT RUN**               |
| League member         | Read the league and members for a league they currently belong to.                                                        | Cannot read an unrelated league or write league membership/XP directly.                                          | `supabase/tests/rls/policies.test.js:159-289`                                                                                                                                              | Test definition **VERIFIED**; execution **NOT RUN**             |
| Profile-image owner   | Insert, update, move, and delete objects only under `<auth.uid()>/`; set `profiles.avatar_path` (through the account API only) to their own folder. | Cannot write, overwrite, move into, or delete another user's folder, and cannot point `avatar_path` at one (API check plus the `profiles_avatar_path_own_folder` constraint, which binds every writer). Reads are public by design. | `supabase/migrations/20260901000000_avatars_bucket.sql:51-94`; `api/_lib/accountEndpoints.js` `ownsAvatarPath`; `supabase/migrations/20261011120100_profiles_server_only_writes.sql`; `supabase/tests/rls/storage.test.js:90-159`; `supabase/tests/rls/profiles-write.test.js`; `api/v1/account/profile.test.js` | Unit path guard and migration contract **VERIFIED**; Storage and profile RLS execution **NOT RUN** locally |
| AI-history owner      | Read and delete own conversations; the server may append only after opt-in.                                               | Cannot see/delete another learner's history, write forged messages, edit messages, or execute append/purge RPCs. | `supabase/migrations/20261008120000_ai_conversation_history.sql:92-125`, `:170-240`; `supabase/tests/rls/ai-history.test.js:58-107`, `:194-267`                                            | Migration **VERIFIED**; RLS execution **NOT RUN**               |
| Admin                 | Reach admin handlers only when a verified identity email matches the server allowlist.                                    | Request-body flags and user/app metadata cannot grant admin.                                                     | `api/_lib/roles.js:1-38`; `api/_lib/accountHandler.js:44-48`, `:105-109`; `api/_lib/accountHandler.test.js:302-365`                                                                        | **VERIFIED**                                                    |
| Vercel service role   | Perform explicitly granted server-side operations and call server-only RPCs; it bypasses RLS.                             | Key must remain server-side; browser roles have no access to it.                                                 | `api/_lib/supabase.js:5-15`; `supabase/tests/rls/server-only-tables.test.js:102-159`; `.env.example:11-40`                                                                                 | Code/migration **VERIFIED**; deployed secret scope **BLOCKED**  |

## Cross-account access tests

The following adversarial tests exist. Their assertions were reviewed, but the
Docker-backed `npm run test:rls` suite was **NOT RUN** for this dossier.

| Test                      | Cross-account assertion                                                                                                             | Evidence                                                                                              | Run status  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------- |
| Core rows                 | User A cannot see, insert as, update, or delete user B's SRS, decks, settings, profile, or daily stats.                             | `supabase/tests/rls/policies.test.js:15-157`                                                          | **NOT RUN** |
| League isolation          | A can read their own league but not B's league, and cannot write league rows.                                                       | `supabase/tests/rls/policies.test.js:159-289`                                                         | **NOT RUN** |
| Avatar namespace          | Bob cannot upload/overwrite/delete Alice's object or rename his object into Alice's folder.                                         | `supabase/tests/rls/storage.test.js:90-159`                                                           | **NOT RUN** |
| Saved AI history          | B sees none of A's conversations/messages and cannot delete them.                                                                   | `supabase/tests/rls/ai-history.test.js:194-216`                                                       | **NOT RUN** |
| Legal acceptance          | The RPC always writes for the caller; A reads only A's records and cannot backdate/delete them.                                     | `supabase/tests/rls/legal-acceptances.test.js:29-95`                                                  | **NOT RUN** |
| AI entitlements and quota | A learner reads only their own entitlements/grants; quota RPCs and usage/cost tables are unavailable to clients.                    | `supabase/tests/rls/ai-quota.test.js:282-315`                                                         | **NOT RUN** |
| Server-only tables        | Both `anon` and `authenticated` are denied every direct Data API verb on rate-limit, progress-event, push, and other server tables. | `supabase/tests/rls/policies.test.js:307-399`; `supabase/tests/rls/server-only-tables.test.js:97-159` | **NOT RUN** |
| Profile direct writes     | A cannot INSERT/UPDATE any `profiles` field (handle, avatar, names, privacy, `blocked_at`) on A's or B's row; constraints refuse a foreign or traversing `avatar_path` and a handle outside 1–24 characters even for the service role; the account API still edits all of them. | `supabase/tests/rls/profiles-write.test.js` | **NOT RUN** locally |
| Closed-beta admission     | An unlisted address cannot create an account through password or OTP signup, and no `auth.users` row is written; a listed address can; anon, authenticated and service_role cannot call the hook or read the list. | `supabase/tests/rls/beta-signup-hook.test.js` | **NOT RUN** locally |

CI is configured to start a local Supabase stack and run this suite on pushes
and pull requests (`.github/workflows/ci.yml:226-294`). Whether the latest CI
run is green was not checked in this mission.

## Known auth gaps

- **OWNER CONFIRMATION REQUIRED — invite state:** apply the two 2026-10-11
  migrations, enter the tester addresses, enable the hook, delete
  `VITE_SIGNUP_EMAIL_ALLOWLIST` from Vercel and smoke a listed and an unlisted
  identity (`docs/AUTH_BETA_ALLOWLIST_RUNBOOK.md` steps 2–6).
- **Closed in the repository — stranded unlisted account:** once the hook is
  on, an unlisted identity never gets an `auth.users` or `profiles` row, so
  there is nothing it cannot export or delete. Accounts created **before** the
  hook are unaffected by it. The owner lists, blocks or deletes each one, and
  `SIGNUP_EMAIL_ALLOWLIST` keeps refusing them meanwhile (runbook step 7).
- **BLOCKED — provider setup:** OAuth consent-screen status, redirect allowlists,
  SMTP sender, OTP expiry, and Apple secret renewal are dashboard/provider facts,
  not repository controls (`docs/AUTH_EMAIL_TEMPLATE_RUNBOOK.md:42-70`;
  `docs/AUTH_APPLE_OAUTH_RUNBOOK.md:40-64`).
