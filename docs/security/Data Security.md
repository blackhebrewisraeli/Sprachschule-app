# Data security

This page inventories storage, processors, logs, deletion, and retention for the
controlled beta. Status terms are defined in [Security.md](./Security.md).

## Active storage

| Store                   | Data                                                                                                                                   | Access and control                                                                                                                         | Evidence                                                                                                                                                                                                  | Status                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Device `localStorage`   | Guest/account learning state, sync metadata, level, preferences, and Supabase's persisted session.                                     | The app is local-first. Sign-out freezes persistence, clears all local keys except the theme, then reloads.                                | `src/lib/storage.js:1-70`; `src/lib/auth.js:108-115`; `src/lib/clearUserState.js:1-99`; `src/lib/clearUserState.test.js`                                                                                  | **VERIFIED**                                                 |
| Device `sessionStorage` | Apple provider refresh token used only to revoke Apple access during deletion.                                                         | Stored per tab, never synced, and removed on sign-out or successful deletion.                                                              | `src/lib/appleRevokeToken.js:1-40`; `src/lib/appleRevokeToken.test.js:14-20`                                                                                                                              | **VERIFIED**                                                 |
| Supabase Auth           | Email, OAuth identity metadata, sessions, and account row.                                                                             | Server APIs validate tokens through `auth.getUser`; account deletion calls `auth.admin.deleteUser`.                                        | `api/_lib/auth-middleware.js:18-31`; `api/_lib/accountEndpoints.js:446-460`                                                                                                                               | Code **VERIFIED**; hosted retention **UNKNOWN**              |
| Supabase database       | Profiles, progress/SRS/stats/decks/settings, league/follows, legal acceptance, feedback, quota/usage, tokens, and optional AI history. | RLS protects learner-owned tables; sensitive operational tables are server-only. User-linked rows use foreign-key cascades where declared. | `supabase/migrations/20260611232000_user_tables.sql`; `supabase/migrations/20260918213000_server_only_rls_deny_policies.sql`; `supabase/tests/rls/policies.test.js`; `supabase/tests/rls/cascade.test.js` | Migration **VERIFIED**; RLS/cascade execution **NOT RUN**    |
| Supabase Storage        | Profile images at `avatars/<user_id>/<random>.webp`.                                                                                   | Public read; 256 KB server cap; WebP/PNG/JPEG only; owner-folder writes.                                                                   | `supabase/migrations/20260901000000_avatars_bucket.sql:1-105`; `supabase/tests/rls/storage.test.js`                                                                                                       | Migration **VERIFIED**; policy execution **NOT RUN**         |
| AI usage storage        | Daily subject counters (`u:<uuid>` or raw-IP guest key), entitlements/grants, and identifier-free daily cost roll-ups.                 | Usage/cost are server-only; entitlements/grants are own-read and server-write.                                                             | `supabase/migrations/20261006120000_ai_access_quota.sql:18-99`, `:247-252`; `api/_lib/aiQuota.js:17-19`, `:77-100`                                                                                        | **VERIFIED** in code/migration                               |
| Saved AI history        | Verbatim user/assistant turns, scenario, level, and model, only after opt-in.                                                          | Default off; SQL re-checks consent; own-read/delete; server-only append. The mobile build pins the feature off.                            | `supabase/migrations/20261008120000_ai_conversation_history.sql:25-35`, `:92-125`, `:170-240`; `package.json` `build:mobile`                                                                              | Schema **VERIFIED**; live feature state **BLOCKED**          |
| Feedback                | Report message and exercise context; signed-in reports include user ID, guest reports do not.                                          | Clients insert only; admin reads. Guest rows have no account-linked deletion path.                                                         | `src/lib/feedback.js:31-80`; `supabase/migrations/20260916183000_feedback.sql`                                                                                                                            | **VERIFIED**                                                 |
| Push registry           | Device token, platform, and time zone.                                                                                                 | Server-only table written through caller-bound RPCs; at most ten tokens per account. The mobile build pins push off.                       | `supabase/migrations/20260927120000_user_devices.sql:20-36`, `:42-76`, `:80-148`; `package.json` `build:mobile`                                                                                           | Schema **VERIFIED**; processing inactive in the pinned build |

## Processors and data flows

| Processor                | Data flow                                                                                                                                            | Evidence                                                                                                                         | Status                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Supabase                 | Authentication, Postgres data, profile-image storage, and hosted Auth email delivery unless custom SMTP is configured.                               | `src/lib/auth.js:108-120`; `api/_lib/supabase.js:5-15`; storage/database migrations; `docs/AUTH_EMAIL_TEMPLATE_RUNBOOK.md:42-70` | Product use **VERIFIED**; SMTP provider **UNKNOWN**                          |
| Vercel                   | Hosts the web app and server functions; web-only Analytics and Speed Insights; runtime logs.                                                         | `vercel.json`; `src/App.jsx:2018`; `src/main.jsx:24-26`; `api/_lib/accountHandler.js:123-129`                                    | Code **VERIFIED**; retention/fields **UNKNOWN**                              |
| Anthropic                | Receives the validated AI body: model, max token cap, messages, and optional system prompt. The server key is sent only in the upstream header.      | `api/_lib/validate.js:26-65`; `api/_lib/anthropic.js:5-16`; `api/_lib/forward.js:12-45`                                          | Request shape **VERIFIED**; vendor retention/use **UNKNOWN**                 |
| Sentry                   | Web browser errors when a DSN is configured. User, cookies, query string, URL query/hash, and breadcrumb URLs are scrubbed; default PII is disabled. | `src/lib/observability.js:17-50`, `:109-147`; `src/lib/observability.test.js:23-146`                                             | Scrubber **VERIFIED**; live config/retention/IP settings **BLOCKED**         |
| Google, GitHub, Apple    | OAuth identity providers. Apple refresh token is used for revocation during in-app deletion.                                                         | `src/lib/auth.js:253-320`; `api/_lib/accountEndpoints.js:408-444`                                                                | Code **VERIFIED**; provider configuration **BLOCKED**                        |
| Google mailbox           | Receives manual support/deletion requests sent to the published Gmail address.                                                                       | `src/components/legal/DeleteAccountPage.jsx:24-28`; `src/components/legal/DeleteAccountPage.test.jsx:34-55`                      | Route **VERIFIED**; mailbox retention/access/SLA **UNKNOWN**                 |
| Firebase Cloud Messaging | Would receive push tokens on both platforms when push is enabled.                                                                                    | `supabase/migrations/20261001120000_push_streak_reminders.sql:19-29`; `package.json` `build:mobile`                              | **NOT ACTIVE** in pinned mobile build; production/provider state **BLOCKED** |

## Logs and telemetry

| Channel                           | Repository-visible content/control                                                                                                                                                              | Status                                                                                                                                                |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vercel function logs              | Account-lane failures include endpoint and user UUID; Apple misconfiguration/rejection logs the user UUID. AI degradation/quota logs omit tokens, prompts, addresses, and raw errors by design. | **VERIFIED**: `api/_lib/accountHandler.js:123-129`; `api/_lib/accountEndpoints.js:419-441`; `api/_lib/aiCaller.js:24-27`; `api/_lib/aiQuota.js:17-19` |
| Sentry                            | Errors only, no tracing or replay; a bounded pre-init queue; the scrubber removes known identity and URL-token fields. Exception text is not generally redacted.                                | **VERIFIED**: `src/lib/observability.js:9-15`, `:23-59`, `:109-147`. Retention and live project settings **UNKNOWN**.                                 |
| Vercel Analytics / Speed Insights | Rendered on the web and omitted in native apps. No repository `beforeSend` filter is supplied for Analytics.                                                                                    | **VERIFIED**: `src/App.jsx:2018`; `src/main.jsx:24-26`. Exact collection and retention **UNKNOWN**.                                                   |
| Local feedback fallback           | If Supabase is unconfigured, feedback is written to the developer console rather than a remote store.                                                                                           | **VERIFIED**: `src/lib/feedback.js:59-80`; `src/lib/feedback.test.js:106-149`                                                                         |

## Backups

| Question                                                       | Result      | Evidence                                                                                                                                                                                    |
| -------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase automatic backup/PITR schedule and retention          | **UNKNOWN** | No repository configuration; the prerequisite audit records no dashboard evidence (`docs/release/legal-data-facts-audit.md:172-184`).                                                       |
| Restore procedure and most recent restore test                 | **UNKNOWN** | No restore runbook or completed restore evidence was found in the audited evidence set.                                                                                                     |
| Whether deleted Auth audit-log entries persist in backups/logs | **UNKNOWN** | `deleteUser` is implemented, but hosted Auth audit-log and backup behavior are outside the repo (`api/_lib/accountEndpoints.js:446-460`; `docs/release/legal-data-facts-audit.md:186-196`). |

## Deletion and export

### VERIFIED

- In-app deletion is bearer-authenticated, recent-auth gated, typed-confirmed,
  rate-limited, and still available to a blocked account
  (`api/_lib/accountEndpoints.js:392-405`;
  `api/v1/account/delete.test.js:84-223`).
- Apple revocation runs before deletion. A transient Apple outage stops the
  request; the app's own missing/invalid Apple configuration logs and continues
  with erasure (`api/_lib/accountEndpoints.js:408-444`;
  `api/v1/account/delete.test.js:324-395`).
- Avatar cleanup lists the complete user folder before deleting the Auth user.
  It is deliberately best-effort, so storage failure can leave a public orphan
  while the account deletion succeeds
  (`api/_lib/accountEndpoints.js:357-375`, `:446-460`;
  `api/v1/account/delete.test.js:226-287`).
- Export includes SRS, daily stats, decks, settings, token ledger, legal
  acceptances, and paged AI conversations/messages
  (`api/_lib/accountEndpoints.js:196-299`;
  `api/v1/account/export.test.js:74-189`).

### NOT RUN

The real-Postgres deletion cascade and avatar policies were not executed. Their
test definitions are `supabase/tests/rls/cascade.test.js:1-152` and
`supabase/tests/rls/storage.test.js:1-182`.

### VERIFIED gaps

- Export is a learning-data export, not a copy of every account-linked row. It
  excludes profiles, league membership, progress idempotency keys, feedback,
  and push tokens by stated policy, and its coverage guard does not classify
  `entitlements`, `ai_quota_grants`, `profile_follows`, or
  `push_reminder_claims` (`api/_lib/accountEndpoints.js:221-242`;
  `api/v1/account/export.test.js:17-35`; migrations
  `20260921192802_profile_follows.sql`, `20261006120000_ai_access_quota.sql`, and
  `20261001120000_push_streak_reminders.sql`).
- The main cascade coverage list does not include `entitlements`,
  `ai_quota_grants`, or `profile_follows`; the quota suite separately tests the
  first two (`supabase/tests/rls/cascade.test.js:21-39`;
  `supabase/tests/rls/ai-quota.test.js:317-333`).
- An unlisted beta account is rejected before export/delete handlers run. This
  can strand an Auth/profile row until an owner action
  (`api/_lib/auth-middleware.js:26-31`;
  `docs/STORE_SUBMISSION_CHECKLIST.md:91`).

## Retention

| Data                                             | Repository retention rule                                                                                          | Status and evidence                                                                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Account-linked database rows                     | Retained until account deletion unless a narrower rule applies. FKs declare cascades for the cited tables.         | Migration **VERIFIED**; cascade **NOT RUN**: `supabase/migrations/20260611232000_user_tables.sql:4-45`; `supabase/tests/rls/cascade.test.js`           |
| Saved AI conversations                           | At most 20 conversations × 50 messages; purged after 90 days of inactivity by a protected daily cron.              | Rule **VERIFIED**: `supabase/migrations/20261008120000_ai_conversation_history.sql:199-270`; `api/v1/league/settle.js:15-43`; cron success **BLOCKED** |
| AI usage and grants                              | Usage keeps today and yesterday after a sweep; grants older than 30 days are deleted.                              | Rule **VERIFIED**: `supabase/migrations/20261007120000_ai_usage_retention.sql:1-40`; cron success **BLOCKED**                                          |
| Burst rate-limit rows                            | Older windows for a key are deleted only when that same key is used again. The final idle row has no fixed expiry. | **VERIFIED**: `supabase/migrations/20260611231830_rate_limits.sql:11-29`                                                                               |
| Push reminder claims                             | Real runs delete claims older than eight days.                                                                     | Rule **VERIFIED**: `supabase/migrations/20261001120000_push_streak_reminders.sql:104-136`, `:183-184`; push is dark                                    |
| Feedback                                         | Signed-in feedback cascades with the account; guest feedback has no account link and no purge.                     | **VERIFIED**: `supabase/migrations/20260916183000_feedback.sql`; `src/lib/feedback.js:59-80`                                                           |
| Provider logs, analytics, backups, support email | No repository-enforced duration.                                                                                   | **UNKNOWN**; see Backups and Logs above.                                                                                                               |
