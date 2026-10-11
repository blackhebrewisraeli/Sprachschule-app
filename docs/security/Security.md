# Security

This dossier describes the security posture of the controlled beta from
repository evidence. It is not a penetration test, compliance certification, or
statement that a cloud dashboard is configured. The evidence snapshot is
`origin/main` at `433efac2` (2026-10-09); the prerequisite facts audit covers
`a0b39546` and records its separate read-only checks
(`docs/release/legal-data-facts-audit.md:1-14`).

## Status language

| Status       | Meaning                                                                       |
| ------------ | ----------------------------------------------------------------------------- |
| **VERIFIED** | Current repository evidence or a command run for this dossier proves it.      |
| **NOT RUN**  | A check exists, but this dossier did not execute it.                          |
| **BLOCKED**  | The check needs owner-only dashboard, provider, production, or device access. |
| **UNKNOWN**  | Neither repository evidence nor a completed check settles the fact.           |
| **OWNER CONFIRMATION REQUIRED** | The repository side is done and tested; the hosted step (dashboard, production data or env) is the owner's to perform and record. |

An earlier runbook or audit entry is evidence that somebody observed a state on
its recorded date. It is not independent confirmation that the state still
exists. In particular, the documented invite-only Vercel configuration is not
promoted to **VERIFIED** here
(`docs/PRE_BETA_OWNER_CHECKLIST.md:92-101`).

## Architecture and trust boundaries

| Boundary                          | Security-relevant behavior                                                                                                                                                        | Evidence                                                                                                                                                 | Status                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| React/Vite web and Capacitor apps | The client is a Vite/React application packaged for iOS and Android with Capacitor. Account progress is local-first in `localStorage`; native auth uses PKCE and an app callback. | `package.json`; `capacitor.config.ts:1-22`; `src/lib/storage.js:1-70`; `src/lib/auth.js:84-115`                                                          | **VERIFIED**                                            |
| Supabase public client            | The browser receives the public URL/key, persists the Supabase session, and relies on grants plus RLS for authorization.                                                          | `src/lib/auth.js:108-120`; `supabase/migrations/20260611232000_user_tables.sql:47-98`; `supabase/migrations/20260612201311_data_api_explicit_grants.sql` | **VERIFIED**                                            |
| Vercel server functions           | Account, progress, social, league, admin, and AI routes run as server functions. The server-only Supabase client uses the service-role key and bypasses RLS.                      | `vercel.json`; `api/_lib/supabase.js:5-15`; `api/_lib/accountHandler.js:61-129`                                                                          | **VERIFIED**                                            |
| Anthropic boundary                | The AI lane rebuilds an allowlisted request body, then sends it to Anthropic with a server-side key. Anthropic is the only registered provider.                                   | `api/_lib/validate.js:1-65`; `api/_lib/anthropic.js:1-16`; `api/_lib/forward.js:1-45`                                                                    | **VERIFIED**                                            |
| Supabase Storage                  | Profile images live in a public `avatars` bucket. Reads are public; authenticated writes are restricted to the caller's first path segment.                                       | `supabase/migrations/20260901000000_avatars_bucket.sql:1-105`                                                                                            | **VERIFIED** in migration; policy execution **NOT RUN** |

## VERIFIED controls

| Control                                                                                                                                                                                          | Evidence                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Server APIs validate bearer tokens with `auth.getUser`; they do not trust a client-supplied user ID.                                                                                             | `api/_lib/auth-middleware.js:18-31`; `api/_lib/auth-middleware.test.js:20-49`                                                  |
| When the server signup allowlist is non-empty, only a listed verified email passes account APIs; unset or empty is open signup.                                                                  | `src/lib/signupAllowlist.js:26-82`; `api/_lib/auth-middleware.js:11-31`; `api/_lib/auth-middleware.test.js:59-138`             |
| Admin access is derived from verified Supabase identity emails, not request fields or user/app metadata.                                                                                         | `api/_lib/roles.js:1-38`; `api/_lib/accountHandler.test.js:302-365`                                                            |
| Core learner tables enable RLS and bind row ownership to `auth.uid()`. Anonymous clients have no grants to those tables.                                                                         | `supabase/migrations/20260611232000_user_tables.sql:47-98`; `supabase/tests/rls/policies.test.js:1-305`                        |
| Server-only tables deny all Data API operations to `anon` and `authenticated`; service-role privileges are explicit per table.                                                                   | `supabase/migrations/20260918213000_server_only_rls_deny_policies.sql`; `supabase/tests/rls/server-only-tables.test.js:97-180` |
| Avatar uploads are capped at 256 KB, exclude SVG, and restrict insert/update/delete to the caller's folder.                                                                                      | `supabase/migrations/20260901000000_avatars_bucket.sql:21-94`; `supabase/tests/rls/storage.test.js:39-159`                     |
| AI requests pass origin checks, caller resolution, burst limiting, body/model/size validation, daily quota accounting, and tier-based model clamping before the provider call.                   | `api/_lib/handler.js:10-136`; `api/_lib/validate.js:7-65`; `api/_lib/aiEndpoints.js:17-38`; `api/_lib/aiQuota.js:5-138`        |
| Account deletion requires a recent authentication and typed `DELETE`, removes the avatar folder best-effort, and then deletes the Supabase Auth user so foreign-key cascades remove linked rows. | `api/_lib/accountEndpoints.js:303-460`; `api/v1/account/delete.test.js:95-287`; `src/lib/authClaims.js:27-32`                  |
| CI runs lint, unit tests, build, browser smokes, and a Docker-backed adversarial RLS job. Dependency lifecycle scripts are disabled during CI installation.                                      | `.github/workflows/ci.yml:9-47`; `.github/workflows/ci.yml:226-294`                                                            |

## NOT RUN

The Docker-backed RLS suite was not run for this dossier. It is separate from
`npm test` and requires a local Supabase stack
(`supabase/tests/rls/cascade.test.js:18-19`; `.github/workflows/ci.yml:283-294`).
No production API request, real OAuth sign-in, account deletion, native-device
test, dashboard read, provider-console read, or backup restore was performed.
Those omissions are intentional: this mission permits documentation and local
verification only.

## BLOCKED

- Current values and scoping of Vercel environment variables, including both
  signup allowlists, `AI_QUOTA_MODE`, `CRON_SECRET`, Anthropic/Apple credentials,
  and Sentry configuration, require an owner dashboard check. The setup and
  smoke procedure is documented in
  `docs/PRE_BETA_OWNER_CHECKLIST.md:92-137` and
  `docs/STORE_SUBMISSION_CHECKLIST.md:54-69`.
- Supabase Auth provider settings, redirect URLs, email-template state, SMTP
  provider, OTP expiry, and Apple client-secret renewal require Supabase and
  provider-console access. The owner runbooks define the checks
  (`docs/AUTH_EMAIL_TEMPLATE_RUNBOOK.md:42-70`;
  `docs/AUTH_APPLE_OAUTH_RUNBOOK.md:40-64`).
- End-to-end Apple deletion requires an iPhone and a throwaway account. Its
  verification procedure is
  `docs/AUTH_APPLE_OAUTH_RUNBOOK.md:82-95`.

## UNKNOWN

- Supabase backup/PITR retention and restore success, Supabase Auth audit-log
  retention after deletion, Vercel runtime-log retention, Vercel Analytics
  field-level collection, and Sentry retention/IP settings are not established
  by repository controls
  (`docs/release/legal-data-facts-audit.md:172-196`).
- Anthropic input retention and training/use terms for this account are not in
  the repository (`docs/release/legal-data-facts-audit.md:186-196`).
- Whether anonymous Storage clients can enumerate avatar folder and object names
  is not covered by the current storage test; public download is intentional
  (`supabase/tests/rls/storage.test.js:80-87`).

## Evidence index

The dossier uses these primary evidence groups:

- auth and identity: `src/lib/auth.js`, `src/lib/signupAllowlist.js`,
  `api/_lib/auth-middleware.js`, `api/_lib/roles.js`, and their tests;
- database authorization: `supabase/migrations/20260611232000_user_tables.sql`,
  `supabase/migrations/20260918213000_server_only_rls_deny_policies.sql`, and
  `supabase/tests/rls/*.test.js` cited in [Auth.md](./Auth.md);
- data lifecycle: `api/_lib/accountEndpoints.js`, account endpoint tests,
  storage/retention migrations, and [Data Security.md](./Data%20Security.md);
- AI abuse and secret boundaries: `api/_lib/handler.js`, `api/_lib/aiQuota.js`,
  `api/_lib/ratelimit.js`, `api/_lib/validate.js`, `api/_lib/forward.js`, and
  `supabase/migrations/20261006120000_ai_access_quota.sql`;
- operational checks: `.github/workflows/ci.yml`,
  `.github/workflows/migration-drift.yml`, and the owner runbooks cited above.
