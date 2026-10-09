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

The controlled-beta policy is a two-layer allowlist:

1. `VITE_SIGNUP_EMAIL_ALLOWLIST` is a client UX pre-check and signs a rejected
   restored session out (`src/lib/auth.js:235-250`, `:444-472`).
2. `SIGNUP_EMAIL_ALLOWLIST` is the security boundary. `requireAuth` and the AI
   caller accept only a listed verified identity when the list is non-empty
   (`api/_lib/auth-middleware.js:11-31`; `api/_lib/aiCaller.js:34-62`).

Parsing trims, lowercases, de-duplicates, and performs exact matching. A closed
list rejects an unverified match and ignores user-metadata email claims
(`src/lib/signupAllowlist.js:26-82`;
`src/lib/signupAllowlist.test.js:25-97`). Unset or empty means open signup
(`src/lib/signupAllowlist.js:31-48`).

**Current environment status: BLOCKED.** The owner checklist records that both
variables were present on Production and Preview on 2026-10-05, but that is a
historical names-only/live-bundle observation, not an independent check by this
mission (`docs/PRE_BETA_OWNER_CHECKLIST.md:92-101`). The security consequence is
also documented: Supabase Auth can create `auth.users` and `profiles` before the
server gate refuses every protected API, including export and deletion
(`supabase/migrations/20260611232000_user_tables.sql:100-114`;
`docs/STORE_SUBMISSION_CHECKLIST.md:91`).

## Permissions table

| Actor                 | Allowed                                                                                                                   | Denied or constrained                                                                                            | Enforcement and evidence                                                                                                                                                                   | Status                                                          |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Signed-out guest      | Use local-only learning state; call guest-capable AI/public routes; download a known public avatar URL.                   | No Data API access to learner tables or league tables.                                                           | `src/lib/storage.js:36-70`; `api/_lib/aiCaller.js:34-40`; `supabase/tests/rls/policies.test.js:291-305`; `supabase/tests/rls/storage.test.js:80-87`                                        | Code **VERIFIED**; RLS execution **NOT RUN**                    |
| Authenticated learner | Read/write own `srs_state`, `decks`, and `settings`; read own profile; use server APIs as the token owner.                | Cannot read/write another learner's rows; cannot directly write `stats_daily`; cannot write server-only tables.  | `supabase/migrations/20260611232000_user_tables.sql:47-98`; `supabase/migrations/20260925120000_stats_daily_read_only.sql`; `supabase/tests/rls/policies.test.js:15-157`, `:359-399`       | Migration **VERIFIED**; RLS execution **NOT RUN**               |
| League member         | Read the league and members for a league they currently belong to.                                                        | Cannot read an unrelated league or write league membership/XP directly.                                          | `supabase/tests/rls/policies.test.js:159-289`                                                                                                                                              | Test definition **VERIFIED**; execution **NOT RUN**             |
| Profile-image owner   | Insert, update, move, and delete objects only under `<auth.uid()>/`; set `profiles.avatar_path` only to their own folder. | Cannot write, overwrite, move into, or delete another user's folder. Reads are public by design.                 | `supabase/migrations/20260901000000_avatars_bucket.sql:51-94`; `api/_lib/accountEndpoints.js:65-81`; `supabase/tests/rls/storage.test.js:90-159`; `api/v1/account/profile.test.js:285-325` | Unit path guard **VERIFIED**; Storage RLS execution **NOT RUN** |
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

CI is configured to start a local Supabase stack and run this suite on pushes
and pull requests (`.github/workflows/ci.yml:226-294`). Whether the latest CI
run is green was not checked in this mission.

## Known auth gaps

- **BLOCKED — invite state:** confirm both production allowlist variables and
  smoke a listed and unlisted account using
  `docs/PRE_BETA_OWNER_CHECKLIST.md:112-137`.
- **VERIFIED gap — stranded unlisted account:** the allowlist gate runs after
  Supabase Auth has created the user/profile, and it also blocks export/delete.
  The controlled beta therefore needs every tester listed or an owner-operated
  cleanup path (`api/_lib/auth-middleware.js:26-31`;
  `supabase/migrations/20260611232000_user_tables.sql:100-114`;
  `docs/STORE_SUBMISSION_CHECKLIST.md:91`).
- **BLOCKED — provider setup:** OAuth consent-screen status, redirect allowlists,
  SMTP sender, OTP expiry, and Apple secret renewal are dashboard/provider facts,
  not repository controls (`docs/AUTH_EMAIL_TEMPLATE_RUNBOOK.md:42-70`;
  `docs/AUTH_APPLE_OAUTH_RUNBOOK.md:40-64`).
