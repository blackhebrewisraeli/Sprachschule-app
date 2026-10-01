# Push sender: daily "streak at risk" reminder — design

**Status:** Architecture accepted by the owner on 2026-10-01. The §15 copy is
**APPROVED as written** (2026-10-01). The `PRIVACY_VERSION` bump is deferred to
the release that turns push on.

Nothing here is implemented yet. No production resource was changed while
writing it. The only production contact was one read of the migration history
(`list_migrations`), which AGENTS.md allows.

Audit taken against `origin/main` at `04a68125` (2026-10-01).
Plan: `docs/superpowers/plans/2026-10-01-push-sender.md`.

---

## 1. Intent

**Goal.** Build the missing server half of push notifications: one sender, for
one message. Once per local day, remind an opted-in learner whose streak is
alive through yesterday but who has not reached today's goal yet.

**Fixed by the owner.** Firebase Cloud Messaging (FCM) is the only push provider,
so this design adds no other provider or Marketplace integration. APNs appears
only as FCM's own transport to Apple devices.

**Success criteria.**

- A reminder arrives in the learner's own evening. "Today" is computed in the
  same time zone the app used to write that day's progress.
- It arrives at most once per learner per local day, however many cron
  deliveries, overlapping runs or devices are involved.
- Nobody who has turned push off, deleted the account, been blocked, or already
  reached today's goal is reminded.
- Dead tokens are removed. A misconfiguration never mass-deletes live tokens.
- It runs on today's plans (Vercel Hobby, Supabase free) at no extra cost.
  Agents change no production resource; every production step is the owner's.

**Non-goals.** League updates or any second notification type. A user-chosen
reminder time. Notification history, queues, dashboards, a provider
abstraction, and in-app deep-link routing.

---

## 2. Premise check

Where the brief or the docs disagree with the code or production:

| #   | Brief / docs say                                                                                                           | Evidence says                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | `docs/BACKLOG.md` item 12: `user_devices` migration "**Not done**"                                                         | Production migration history lists `20260927120000 user_devices` (read 2026-10-01). It **is applied**. Rows may already exist, and some may be raw APNs tokens from builds made with `VITE_PUSH_ENABLED=true` (the P1 finding of the 2026-09-29 legal spec).                                                                                                                                                              |
| P2  | The repo has a cron pattern to reuse (`vercel.json` → `/api/v1/league/settle`)                                             | That cron runs **weekly**. Vercel Hobby allows **only daily** crons: an hourly expression "will fail deployment", and even a daily one can fire anywhere within its hour (vercel.com/docs/cron-jobs/usage-and-pricing, fetched 2026-10-01). A reminder in each learner's evening needs an hourly tick.                                                                                                                      |
| P3  | (implicit) Adding an endpoint is free                                                                                      | The project deploys **exactly 12** functions (`api/chat.js` + 11 under `api/v1/`). For plain `api/` projects, Hobby caps a deployment at 12 (vercel.com/docs/functions/runtimes). A 13th file fails the deploy. Four lanes were already merged into single dispatchers for this reason.                                                                                                                                    |
| P4  | `MOBILE_PUSH_SETUP.md` §3: "the sender sends iOS tokens through APNs directly, or registers them with FCM first"            | FCM only, so direct APNs is out. FCM's HTTP v1 API cannot address a raw APNs token. Converting one server-side needs the Instance ID `batchImport` API, which "will be turned down on September 29, 2027" (developers.google.com/instance-id/reference/server). So the **iOS app must hand Capacitor an FCM token**, as Capacitor's Firebase guide does (`Messaging.messaging().apnsToken = deviceToken`, then `.token`).   |
| P5  | `BACKLOG.md` item 13: "an APNs key for the future sender"                                                                  | With FCM, the `.p8` key is uploaded to **Firebase**. The sender never holds it.                                                                                                                                                                                                                                                                                                                                          |
| P6  | "client-local date keys"                                                                                                   | Correct: `todayKey()` (`src/lib/stats.js:33`) uses the device clock's local date, and events carry that `dateKey` into `stats_daily.day`. But **no time zone is stored anywhere server-side**, so the server cannot know when a learner's day starts or ends.                                                                                                                                                              |
| P7  | Privacy Policy §2 and the Settings disclosure say iPhone tokens come from "Apple Push Notification service"                  | After P4, iPhone tokens come from FCM, and the device's time zone is stored with the token (§5). **Both texts become inaccurate** until updated (§15). This is owner-supplied legal copy.                                                                                                                                                                                                                                 |

---

## 3. What exists today

| Piece                                                          | Where                                                                                  | State                                                                                                                                                             |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Opt-in switch + just-in-time disclosure                        | `src/components/settings/NotificationsSection.jsx`                                     | Built. Dark behind `VITE_PUSH_ENABLED` (pinned `false` in `build:mobile`)                                                                                         |
| Permission → register → token → RPC; refresh on launch; drop on opt-out and sign-out | `src/lib/pushNotifications.js`, `src/lib/usePushNotifications.js`, `App.jsx:730`, `clearUserState.js` | Built. Sends `{ p_token, p_platform }`                                                                                                                            |
| Device registry                                                | `public.user_devices` (`20260927120000`): token PK, `user_id` FK cascade, `platform`, `updated_at`; RLS deny-all; `service_role` DML | **Applied in production**                                                                                                                                         |
| RPCs                                                           | `register_push_device(text, text)` (upsert, cap 10 per user), `unregister_push_device(text)`; SECURITY DEFINER, act as `auth.uid()` | Applied                                                                                                                                                           |
| RLS tests                                                      | `supabase/tests/rls/push-devices.test.js`, `server-only-tables.test.js`, `policies.test.js`, `cascade.test.js` | CI job "RLS Policy Tests" (required)                                                                                                                              |
| iOS hand-off                                                   | `ios/App/App/AppDelegate.swift` forwards the **raw APNs `Data`** to Capacitor          | Built. Pinned by `pushNotifications.test.js`                                                                                                                      |
| Android                                                        | The Capacitor plugin uses Firebase and returns an **FCM token**. `google-services.json` is applied when present | Built. The owner has not added the file yet                                                                                                                       |
| Export / deletion                                              | `user_devices` is excluded from the data export (a credential). Account deletion cascades | Built                                                                                                                                                             |
| Cron pattern                                                   | `api/v1/league/settle.js`: GET/POST, `Bearer ${CRON_SECRET}`, `serviceClient()`, per-item isolation, `maxDuration: 300` | Live (weekly)                                                                                                                                                     |
| Server data access                                             | `api/_lib/supabase.js` `serviceClient()`. XP formula shared as `src/lib/xpCore.js` (JS) and `public.progress_day_xp(jsonb)` (SQL, parity-tested) | Live                                                                                                                                                              |
| Streak rule                                                    | `src/lib/streak.js`: a day counts when `xpForDay ≥ goal` or it is in `frozenDays`. Today is "in progress"; the run counts through yesterday until today qualifies | Client-derived. `goal` and `frozenDays` sync into `settings.data`                                                                                                 |
| Sending                                                        | —                                                                                      | **Not built**                                                                                                                                                     |

---

## 4. Decision: runtime architecture

**Chosen: a Vercel Node function sends. Supabase `pg_cron` + `pg_net` is the
hourly clock that calls it.**

| Option                                                                                   | Verdict                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. Vercel Cron `0 * * * *` → Vercel function                                             | Simplest, and identical to the settle pattern. **Impossible on Hobby** (P2). Viable only if the owner upgrades to Pro.                                                                                                                                                                                                                                                  |
| **B. `pg_cron` hourly → `net.http_post` → Vercel function** (chosen)                     | Works on today's plans. `pg_cron` and `pg_net` are standard Supabase extensions, and Supabase documents this exact shape with Vault-held secrets. All logic stays in the lane that already has `serviceClient()`, the XP formula, Vitest mocks, CI coverage, Sonar, and Vercel env management. Supabase contributes only a clock: one SQL statement, no code. |
| C. Supabase Edge Function + `pg_cron`                                                    | Still needs `pg_cron`, so it removes nothing. It adds a runtime the repo has never used (Deno; there is no `supabase/functions/`), a deploy path agents must not run against production, a second secret store, and code outside Vitest, CI and Sonar. It would also duplicate `serviceClient`, the respond helpers and the XP parity code. |
| D. 24 daily Vercel crons on one path                                                     | Each one passes the per-expression check, but together they deliberately defeat the plan limit Vercel documents. A config change can break deploys. Rejected.                                                                                                                                                                                                          |
| E. GitHub Actions `schedule`                                                              | Private repo on a personal account. CI jobs have died on billing before, and scheduled workflows are delayed and best-effort. Rejected.                                                                                                                                                                                                                                 |

**Upgrade path (corrected 2026-10-01).** The endpoint accepts POST (`pg_net`)
and GET (manual runs) under `PUSH_CRON_SECRET`. Vercel Cron cannot drive it
as-is: Vercel always sends `Authorization: Bearer $CRON_SECRET`, a fixed
variable name, and this endpoint deliberately refuses the league's secret. If
the owner later moves to Pro, the switch is a `vercel.json` `crons` entry, a
one-line change so the endpoint also accepts `CRON_SECRET`, and
`cron.unschedule('streak-reminder')`.

**Function slot.** `api/chat.js` is a one-line legacy alias of the AI chat
handler, marked "Remove one release cycle after B0 ships" long ago. It becomes a
`vercel.json` rewrite (`/api/chat` → `/api/v1/ai?op=chat`), the pattern every
earlier consolidation used. That keeps the URL and handler unchanged, frees
slot 12 for `api/v1/push/streak-reminder.js`, and adds a test that fails CI
before Vercel fails a deploy.

```
pg_cron "5 * * * *" (UTC)
  └─ net.http_post  https://deutsch-app-dusky.vercel.app/api/v1/push/streak-reminder
       Authorization: Bearer <Vault push_cron_secret>
         └─ Vercel fn (maxDuration 300)
              1. check PUSH_CRON_SECRET (timing-safe)
              2. FCM OAuth token (service-account JWT, node:crypto)   ← before any claim
              3. rpc claim_streak_reminders(now, 19, 3, 50, 'de', 1000)   one round trip
                   = due learners (their zone, window, goal, streak) + claim rows + their devices
              4. POST fcm.googleapis.com/v1/projects/{id}/messages:send   10 in flight
              5. delete dead tokens · release claims of learners nobody reached
              6. 200 {summary}  → Vercel log line + net._http_response
```

---

## 5. The local-day contract (time zones)

**Stored: `user_devices.time_zone text` (nullable), reported by the device on
every `register_push_device` call.** The value is
`Intl.DateTimeFormat().resolvedOptions().timeZone`.

That is the IANA zone of the device clock, the same clock `todayKey()` reads to
name the day an exercise lands in. This is not an inference from locale:
language and region settings are never read. It is the one fact the client's
`dateKey` semantics already depend on.

- **Why on the device row.** A client that does not know a new key would erase
  it from `settings.data` (`settingsToRow` upserts an allowlist, so older builds
  would drop the field). `profiles` has narrowed grants and several readers. The
  device row is already server-only, already refreshed on every signed-in
  launch, and already the thing the reminder is addressed to.
- **Validation at the trust boundary.** `register_push_device` stores the name
  only if it is 1–64 characters and present in `pg_catalog.pg_timezone_names`.
  Anything else is stored as `NULL`, and the opt-in still succeeds. An unknown
  name would otherwise make `at time zone` throw inside the sender's query and
  fail every learner's reminder.
- **No zone, no reminder.** The sender never falls back to Berlin, UTC or any
  default. Devices without a zone are counted in every run summary
  (`devicesWithoutZone`), so a client that stops sending one shows up.
- **One learner, several devices.** The learner's zone is the zone of their most
  recently registered device that reports one (`updated_at desc`). That is the
  device most likely in their hand. The reminder then goes to all their devices.
- **Old clients.** `p_time_zone` defaults to `NULL`, so a build that predates
  this still registers, but gets no reminders until it updates. The latest
  report wins, including a null one. Since push never shipped enabled, this
  affects only test builds.
- **Travel.** The zone refreshes on the next signed-in launch. A learner who
  crosses zones without reopening the app is evaluated in the old zone. That is
  accepted: the dateKeys they write come from the same device.

**Reminder time: a product constant, not stored.** The window is 19:00–21:59 in
the learner's zone, and the first hourly tick inside it sends. Later ticks in
the window retry only learners whose attempt failed. No per-user preference is
stored in v1. Adding one later means a `reminder_hour smallint` column and a
Settings control. This is owner decision D1 (§26), which does not block
implementation.

---

## 6. Eligibility: "streak at risk"

At tick time `now`, a learner is **due** when all of these hold:

1. They have ≥ 1 row in `user_devices` (opted in), and a zone resolves as in §5.
2. Local hour of `now` in that zone ∈ [19, 21].
3. `profiles.blocked_at is null`.
4. **Not qualified today:** `progress_day_xp(stats_daily[today].counters) < goal`,
   where `today = (now at time zone tz)::date`.
5. **Streak alive through yesterday:**
   `progress_day_xp(stats_daily[today-1]) ≥ goal`, **or**
   `settings.data.frozenDays[today-1] = true`.
6. No claim row exists for `(user_id, today)` (§12).

- **Goal.** `goal = settings.data.goal` when it is a JSON number in [1, 1000],
  else `DEFAULT_GOAL`. The sender passes `DEFAULT_GOAL` from
  `src/lib/gameConfig.js`, so the default is not duplicated in SQL.
- **XP.** Uses `public.progress_day_xp`, whose weights are already guarded by
  `api/_lib/leagueXpParity.test.js`.
- **Pack.** `pack_id = 'de'` is passed by the sender. It is the progress lane's
  data key (`progressHandlers.js` defaults `packId` to `'de'`). No German
  behaviour hangs on it.

**Deliberately not modelled.** The server does not re-derive held freezes (that
needs `simulateFreezes` with quest seeds) or the streak length. The copy
therefore never states a number or a certainty ("will end"), and the app and
the notification cannot disagree. A learner holding a freeze still gets the
reminder: spending a freeze is still a loss.

**Accepted false positives.** Practice done offline and not yet flushed from
`progressQueue` reads as "not practised". So does practice between the claim
and the send (seconds).

**Accepted false negative.** A freeze earned yesterday that the client has not
reconciled into `settings.data.frozenDays` yet (the learner has not opened the
app today) reads as "no streak". Result: no reminder that day.

---

## 7. Data model — one migration, `20261001120000_push_streak_reminders.sql`

Additive and idempotent. The owner applies it after merge with the Management
API procedure (`MOBILE_PUSH_SETUP.md` §1), then runs the drill: baseline →
apply → verify → `notify pgrst, 'reload schema'`, then rename the repo file to
the recorded version in a follow-up PR (as #383 did).

1. `alter table user_devices add column if not exists time_zone text`, plus
   updated column comments ("FCM registration token (both platforms)").
2. **Purge raw APNs tokens:**
   `delete from user_devices where platform = 'ios' and push_token ~ '^[0-9A-Fa-f]{64}$'`.
   The device re-registers with an FCM token on its next launch with the new
   build.
3. `drop function if exists register_push_device(text, text)`, then create
   `register_push_device(p_token text, p_platform text, p_time_zone text default null)`.
   The old 2-argument function must be dropped: PostgREST cannot choose between
   it and a 3-argument version with a default, and would refuse every call. Two
   additions:
   - zone validation (§5);
   - refusal of a raw 64-hex APNs token on `ios` (`22023`): the table becomes
     "FCM tokens only" at the boundary.

   Grants move to the new signature: `authenticated`, `service_role`.
4. `push_reminder_claims(user_id uuid fk cascade, local_day date, claimed_at timestamptz default now(), primary key (user_id, local_day))`.
   Server-only, stated the repo's way: RLS on, `"no client access"` deny-all
   policy for `anon`/`authenticated`, and `select, insert, delete` for
   `service_role` only (no update).
5. `claim_streak_reminders(p_now timestamptz, p_start_hour int, p_window_hours int, p_default_goal int, p_pack_id text, p_limit int, p_only_user uuid default null, p_dry_run boolean default false)`
   returns `(user_id, local_day, expires_at, push_token)`. One row per device of
   each claimed learner. `expires_at` is the learner's next local midnight as a
   `timestamptz`.

   How it works:
   - plpgsql, SECURITY INVOKER, `set search_path = ''`, `#variable_conflict use_column`;
   - `execute` for `service_role` only;
   - validates its parameters (`22023`);
   - prunes claims older than 8 days on real runs;
   - claims with `insert … on conflict do nothing returning`, so two overlapping
     runs can never both claim the same learner.

   `p_only_user` restricts to one learner and ignores the hour window, for the
   owner's smoke test. `p_dry_run` claims nothing.

   `p_limit` must be 1–100 (execution ruling, 2026-10-01). PostgREST truncates an
   RPC's result at `max_rows` = 1,000 rows, and a larger batch could claim
   learners whose device rows never reach the sender. The sender pages instead
   (§11).

**Indexes.** None new. Every per-learner lookup hits a primary key:
`stats_daily (user_id, pack_id, day)`, `settings (user_id)`,
`profiles (user_id)`, `push_reminder_claims (user_id, local_day)`. Zone
resolution scans `user_devices` once per tick (at most 10 rows per learner). That
is fine to at least ~10⁵ devices. Past that, precompute a UTC-offset bucket.
This ceiling is recorded as a `ponytail:` comment in the SQL.

---

## 8. Sender flow (`api/v1/push/streak-reminder.js` → `api/_lib/streakReminder.js`)

1. **Method and auth.** Anything except GET or POST gets 405. The secret is
   compared with `timingSafeEqual` against `Bearer ${PUSH_CRON_SECRET}`; a
   mismatch or unset secret gets 401. Then `serviceClient()`: none means 500.
   Query parameters: `dryRun=1`; `only=<uuid>`, where anything else gets 400.
2. **Dry run** needs no Firebase credentials. It calls the RPC with
   `p_dry_run = true` and returns counts. It never sends or claims.
3. **Real run.** `FIREBASE_SERVICE_ACCOUNT` missing or unparseable → 500
   "Push sender is not configured." with nobody claimed. Otherwise:
   - fetch the FCM access token **before** claiming anyone; a refusal becomes
     502 with nobody claimed;
   - one RPC claims and returns the device rows;
   - one head-count of zone-less devices (§17).
4. **Send.** Rows are grouped by learner. Ten workers take learners from a
   shared queue. Each learner's devices are sent in turn, one message per
   device.
5. **Stop rules.** The run stops starting new learners after `deadlineMs`
   (240 s of the 300 s budget), or after a `quota` or `fatal` outcome (§13).
   Learners not reached are released.
6. **Cleanup.** Delete dead tokens in chunks of 20 (`.in('push_token', …)`,
   small enough for URL length). Release claims in chunks of 100 per
   `local_day`.
7. **Result.** One `console.log` line `{"event":"streak_reminder_run", …summary, ms}`.
   A run stopped by `fatal` answers 502; otherwise 200 with the summary.

---

## 9. FCM: authentication, APNs through FCM, and the iOS token

**Authentication (HTTP v1).** OAuth 2 access token for scope
`https://www.googleapis.com/auth/firebase.messaging`:

- built from an RS256 JWT (`iss` = service-account email,
  `aud` = `https://oauth2.googleapis.com/token`, `exp` = `iat + 3600`);
- signed with `node:crypto`'s `createSign('RSA-SHA256')` and exchanged with
  `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`;
- cached per warm function instance until 60 s before expiry.

No `google-auth-library` or `firebase-admin`: stdlib covers it in about 30
lines, and a new dependency would cost more than it saves.

- **Service account, least privilege.** A dedicated account holding **only**
  "Firebase Cloud Messaging API Admin" (Firebase's documented role for senders).
  Not the default `firebase-adminsdk-*` account.
- **Key.** Its JSON key goes into one Sensitive, Production-only Vercel variable.
- **Hardening later.** Vercel OIDC → Google Workload Identity Federation would
  remove the long-lived key. That is not worth the setup for v1.
- **Endpoint.**
  `POST https://fcm.googleapis.com/v1/projects/{project_id}/messages:send`,
  where `project_id` comes from the key file. One message per request: HTTP v1
  has no batch send.

**APNs through FCM.**

- **Credential.** The owner uploads the APNs Auth Key (`.p8`, Key ID, Team ID)
  under Firebase → Project settings → Cloud Messaging → Apple app configuration.
  One key serves sandbox and production.
- **Routing.** The Firebase iOS SDK registers the APNs token with its
  environment (Xcode debug builds use sandbox), and FCM routes to match.
- **Message mapping.** The `notification` block becomes `aps.alert`. The `apns`
  block passes through as APNs headers and payload.
- **Failure.** A missing or invalid key comes back as `THIRD_PARTY_AUTH_ERROR`
  (401). That is a configuration problem, not a token problem (§13).

**The iOS token change (P4).** `AppDelegate.swift` gives Firebase the APNs
token (`Messaging.messaging().apnsToken = deviceToken`) and posts the resulting
**FCM token string** to `.capacitorDidRegisterForRemoteNotifications`. Capacitor
accepts a `String` object there.

Two guards keep builds without Firebase safe. Both are needed because
`FirebaseApp.configure()` without a plist is a fatal error at launch:

- **Compile time.** All Firebase code sits under
  `#if canImport(FirebaseMessaging)`, so the project builds before the owner
  adds the SPM package.
- **Run time.** `FirebaseApp.configure()` runs only when
  `GoogleService-Info.plist` is in the bundle. Without it, registration posts a
  **failure** (`PushSetupError.firebaseNotConfigured`) rather than the raw APNs
  token. The switch then says "Could not turn on push notifications", which is
  true.

This is the iOS mirror of Android's "Firebase applied only when
`google-services.json` exists". The owner adds the `firebase-ios-sdk` package
(product `FirebaseMessaging`) and the plist in Xcode; editing `project.pbxproj`
by hand is not agent work.

---

## 10. Payload and deep-link contract

```json
{
  "token": "<fcm token>",
  "notification": {
    "title": "Keep your streak alive",
    "body": "You haven’t reached today’s goal yet. A few minutes of practice keeps your streak going."
  },
  "data": { "kind": "streak_reminder", "dateKey": "2026-10-01" },
  "android": {
    "ttl": "<seconds until local midnight, min 60>s",
    "collapse_key": "streak_reminder",
    "notification": { "tag": "streak_reminder", "default_sound": true }
  },
  "apns": {
    "headers": { "apns-expiration": "<unix seconds of local midnight>", "apns-collapse-id": "streak_reminder" },
    "payload": { "aps": { "sound": "default" } }
  }
}
```

- **Expiry at local midnight.** After midnight the reminder is false, so a
  device offline until then never shows it.
- **Collapse key and tag.** A retried send whose first attempt had in fact been
  delivered replaces itself instead of stacking.
- **Copy.** English, like the rest of the app chrome. It carries no streak number
  (§6). It says "practice" rather than naming the language, so nothing
  German-specific is baked in. The owner may rewrite it (D1).
- **`data`.** Values are strings (FCM requires it). `kind` is the contract a
  future tap handler routes on. `dateKey` uses the client's own day format.
- **Deep link: none in v1.** Tapping opens the app. A cold start lands on Home,
  whose daily goal is the call to action; a warm start resumes where the learner
  was. No `pushNotificationActionPerformed` listener is added until a second
  notification needs a different destination.
- **Foreground.** Neither platform displays a notification while the app is in
  the foreground (no `presentationOptions`). A learner already in the app needs
  no reminder.

---

## 11. Batching and throughput

HTTP v1 has no batch send, so batching means bounded concurrency:

| Limit                    | Value              | Why                                                                                                          |
| ------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------ |
| Concurrent learners      | 10 workers         | ~100 requests/s at ~100 ms each. FCM's default project quota is 600,000 messages/min, far above.               |
| Learners per run         | 1,000, in RPC batches of 100 (`p_limit`) | PostgREST returns at most `max_rows` = 1,000 rows and each learner has up to 10 devices, so one call claims ≤ 100 learners (the SQL refuses more) and the run pages. The rest stay unclaimed for the next tick inside the 3-hour window. |
| Devices per learner      | ≤ 10               | Already capped by `register_push_device`.                                                                    |
| Request timeout          | 10 s               | `AbortSignal.timeout`                                                                                        |
| Run deadline             | 240 s              | Leaves 60 s of the 300 s `maxDuration` for cleanup.                                                          |

---

## 12. Idempotency and duplicate suppression

Every delivery path is at-least-once:

- `pg_cron` can double-fire;
- `pg_net` can deliver twice;
- the owner can trigger a run by hand;
- runs can overlap.

The claim row `(user_id, local_day)` is the lock. It is **inserted before
sending**, in the same statement that selects the learner. A second run, even
one running concurrently, sees the row (or loses the `on conflict`) and sends
nothing.

**Release rule.** After a learner's devices are tried, the claim is **kept**
if any device ended `sent`, `dead` or `config`:

- `sent`: the learner got it;
- `dead`: nothing left to retry;
- `config`: retrying today cannot help.

The claim is **released** when every attempt was transient or never happened
(`retry`, `quota`, `fatal`, deadline). The next tick inside the window retries
those learners.

A send that timed out but was in fact delivered, then retried, shows once
because of the collapse keys (§10). The effective guarantee is at most one
visible reminder per learner per local day.

Claims older than 8 days are pruned by the RPC. Rows per learner stay ≤ 9.
Account deletion cascades.

---

## 13. Error classification, retry and invalid-token cleanup

| FCM response                                                                           | Outcome   | Action                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 200                                                                                    | `sent`    | Count it.                                                                                                                                                                                  |
| 404 `UNREGISTERED`                                                                     | `dead`    | Delete the row.                                                                                                                                                                            |
| 400 `INVALID_ARGUMENT` whose message names the registration token, or a `BadRequest` field violation on `message.token` | `dead`    | Delete the row.                                                                                                                                                                            |
| 400 `INVALID_ARGUMENT`, anything else                                                  | `fatal`   | The message is constant, so this is a code bug: stop the run, release, answer 502.                                                                                                        |
| 403 `SENDER_ID_MISMATCH`                                                               | `config`  | **Do not delete.** Every token comes from this app's one Firebase project, so a mismatch means the server's service account belongs to another project. Deleting would wipe every live token. Count and log it; keep the claim. |
| 401 `THIRD_PARTY_AUTH_ERROR`                                                           | `config`  | APNs key missing or invalid in Firebase. Keep tokens and claim; count it.                                                                                                                  |
| 429 / `QUOTA_EXCEEDED`                                                                 | `quota`   | FCM asks for ≥ 1 minute of backoff, longer than a retry here should wait. Stop the run and release; the next tick continues.                                                              |
| 5xx (`UNAVAILABLE`, `INTERNAL`), network error, timeout                                | `retry`   | Retry once after `Retry-After` (capped at 5 s, default 1 s). If it fails again, the learner is released for the next tick.                                                                 |
| 401 / 403 / 404 without an FCM error code (our token, a missing IAM role, a wrong project id), any other 4xx | `fatal`   | Stop, release, 502.                                                                                                                                                                        |
| Token exchange refused or unreachable                                                  | —         | `FcmAuthError` before any claim → 502, nobody claimed.                                                                                                                                     |

**Wrong deletions heal themselves.** An opted-in device re-registers on every
signed-in launch (`resumePushRegistration`), and its local record survives a
server-side delete. A row deleted by mistake returns the next time the learner
opens the app.

---

## 14. Multi-device

- **One learner, one decision.** The zone comes from the learner's most recent
  device that reports one. One claim covers the learner, and every one of their
  devices (≤ 10) gets the message.
- **Per-device outcomes.** Each device's result is handled on its own: one dead
  tablet is deleted while the phone still counts as `sent`.
- **Shared devices.** A token belongs to one account at a time (primary key), so
  the last account to opt in on a device is the only one it rings for. This is
  unchanged.

---

## 15. Opt-out, consent and privacy copy

**Consent.** A device row exists only after the learner taps the switch, reads
the disclosure and grants the OS permission. Opt-out, sign-out, OS-level
blocking (detected at the next launch) and account deletion each remove the row.
The sender reads only existing rows, so each opt-out takes effect from the next
tick. Blocked accounts are skipped (§6).

**Copy (P7): APPROVED by the owner as written, 2026-10-01.** This is legal
copy, reproduced verbatim. It ships in Task 9, **in the release that turns push
on**, together with the `PRIVACY_VERSION` bump, and not before. The Terms of
Service need no change: they never mention push or time zones.

1. **Privacy Policy §2, "Push Notifications (mobile app only):"**, the whole
   text:
   > If you turn on push notifications, the app obtains a notification token for
   > your device from Firebase Cloud Messaging by Google, which delivers
   > notifications to iPhone and iPad through Apple Push Notification service.
   > We store the token in our database, together with your device's platform,
   > your device's time zone setting and a link to your account, so that we can
   > send you streak reminders and league updates at a suitable local time. To
   > decide whether you need a streak reminder, we check your recent activity
   > against your daily goal.
2. **Privacy Policy §5, the closing sentence:**
   > If you choose to use them, these services also receive data under their
   > own privacy policies: Google or GitHub (if you sign in with them), and
   > Firebase Cloud Messaging by Google, together with Apple Push Notification
   > service on iPhone and iPad (if you turn on push notifications).
3. **Privacy Policy §6, the third item:**
   > Account data — including your email, profile, learning data, problem
   > reports, notification tokens (with your device's time zone) and acceptance
   > records — is kept until you delete your account.

   Plus a **new item directly after it:**
   > Records of the days on which we sent, or tried to send, you a streak
   > reminder are deleted automatically after about eight days.
4. **Privacy Policy §7, the second sentence:**
   > Deleting your account immediately and permanently removes your account and
   > the data linked to it in our database, including your learning data,
   > profile, problem reports, notification tokens, reminder records and
   > acceptance records.
5. **Privacy Policy §8, the second item's first sentence.** The rest of the item
   is unchanged:
   > When you turn notifications off in the app or sign out, the app deletes
   > your device's notification token, and the time zone stored with it, from
   > our database and deactivates it on your device.
6. **Settings → Notifications disclosure.** As rendered on iPhone:
   > Get streak reminders and league updates on this device. If you turn this
   > on, we’ll ask for your permission, then save a notification token and this
   > device’s time zone to your account, so reminders arrive at a sensible local
   > time. Notifications are delivered through Firebase Cloud Messaging by
   > Google and Apple Push Notification service. They’re optional — the app
   > works the same without them — and you can turn them off here or in your
   > device’s settings at any time.

   On Android the delivery sentence reads "…delivered through Firebase Cloud
   Messaging by Google."

**Version (D2, decided 2026-10-01).** Do **not** bump `PRIVACY_VERSION` now.
`lastUpdatedLine(PRIVACY_VERSION)` prints the policy's date, and any bump
re-asks every signed-in learner (the #382 gate). So the bump and the copy merge
together, in the release that actually turns push on. Until then no learner's
data is processed this way.

**Store answers.** Update App Privacy / Data Safety answers ("Device ID / push
token") when push ships. This is already `STORE_SUBMISSION_CHECKLIST.md`
item 9.

---

## 16. Security and least privilege

- **Cron authentication.** Its own secret, `PUSH_CRON_SECRET`, not the league's
  `CRON_SECRET`. A copy must live in Supabase Vault, and a leak there should
  not also open league settlement. It needs ≥ 32 random characters and is
  compared with `timingSafeEqual`. The only other things the endpoint accepts
  are `dryRun` and `only=<uuid>`, both harmless under the secret.
- **Secrets.**
  - `FIREBASE_SERVICE_ACCOUNT` and `PUSH_CRON_SECRET` are Vercel
    **Production-only, Sensitive**. Neither is Preview (Preview must never send
    to real devices) or Development (an empty Development scope is the repo's
    rule).
  - The Vault secret is added through the Dashboard's Vault UI, not typed into
    the SQL editor, whose history persists.
- **Database.**
  - `claim_streak_reminders` is SECURITY INVOKER and executable by
    `service_role` only.
  - `push_reminder_claims` is deny-all to Data API roles.
  - `register_push_device` stays SECURITY DEFINER acting as `auth.uid()`. It
    now also validates the zone and refuses raw APNs tokens.
- **Logs.**
  - Counts and FCM error codes only.
  - No tokens (they are device credentials; the data export already refuses to
    ship them), no user ids, and no secret echoes.
- **Preview plane.** The migration may be applied to `Sprachschule Preview`
  (it is additive), but no cron is ever scheduled there, and Preview has no
  Firebase credentials.

---

## 17. Observability

There is no server-side Sentry in this project (`accountHandler.js:124`). The
design uses what already exists:

| Signal                               | Where                                                                                               | Retention                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Run summary (JSON response)          | `net._http_response` (`select status_code, content, error_msg, created from net._http_response order by created desc limit 5`) | 6 h                                |
| Run summary (log line)               | Vercel runtime logs, `event:"streak_reminder_run"`                                                  | Short on Hobby, so read it soon    |
| Tick fired                           | `cron.job_run_details`                                                                              | Until pruned                       |
| Learners reached per day             | `select local_day, count(*) from push_reminder_claims group by 1 order by 1 desc`                   | 8 days                             |

The summary's fields are: `dryRun`, `due`, `devices`, `sent`, `dead`, `failed`,
`configErrors`, `released`, `devicesWithoutZone`, `aborted`
(`null | 'quota' | 'fatal' | 'deadline'`) and `ms`.

**What "healthy" looks like.**

- `configErrors = 0` and `aborted = null`.
- `devicesWithoutZone` small and not rising.
- In the evening ticks, `sent ≈ devices`.

A non-200 in `net._http_response` is the alarm. Alerting is out of scope.

---

## 18. Cost and quota guardrails

| Service         | Usage                                                                  | Cost                                                                                                  |
| --------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| FCM             | ≤ one message per device per day                                       | Free. Quotas are far above (§11).                                                                     |
| Vercel          | 24 invocations/day, mostly a few seconds (the RPC returns nothing outside evenings) | Inside the Hobby allotment. Active CPU pricing bills compute, not network wait.                       |
| Supabase        | 24 `pg_net` calls/day, one RPC per tick, claims table ≤ 9 rows per learner | Free tier                                                                                             |

**Hard caps.**

- 1,000 learners per run.
- 10 devices per learner.
- 1 reminder per learner per local day.
- 240 s run deadline.
- `pg_net`'s ~200 requests/s ceiling is irrelevant at 1 request per hour.

**Kill switch.** `cron.unschedule` (§22).

---

## 19. Environment variables

| Name                        | Scope                        | Content                                                                                         |
| --------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `PUSH_CRON_SECRET`          | Vercel Production, Sensitive | ≥ 32 random characters. The **same value** is Vault secret `push_cron_secret`.                  |
| `FIREBASE_SERVICE_ACCOUNT`  | Vercel Production, Sensitive | The whole downloaded JSON key of the FCM-only service account.                                  |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | existing                     | unchanged                                                                                       |
| `VITE_PUSH_ENABLED`         | native build pin             | Stays `false` until §21 passes on both platforms (`STORE_SUBMISSION_CHECKLIST.md` item 9).      |

Both new variables are documented, commented out, in `.env.example` (Task 6).

---

## 20. Setup (owner, in order)

1. **Merge and apply.** Merge the PR. Apply `20261001120000_push_streak_reminders`
   with the Management API procedure (`MOBILE_PUSH_SETUP.md` §1), changing
   **both** the file path and `--arg name push_streak_reminders` (changing only
   the name would record the new migration while sending the old SQL). Then:
   - `notify pgrst, 'reload schema';`
   - verify Migration Drift is green (it reports the file missing until applied);
   - rename the repo file to its recorded version in a follow-up PR.
2. **Firebase project.**
   - **Android app:** package `com.sprachschule.deutsch` → `android/app/google-services.json`.
   - **iOS app:** bundle id of `ios/App` → `GoogleService-Info.plist`, added to
     the App target in Xcode.
   - **APNs:** upload the Auth Key (`.p8`) under Cloud Messaging → Apple app
     configuration.
3. **Xcode.** Add the Push Notifications capability (if not done), plus Package
   `https://github.com/firebase/firebase-ios-sdk` → product **FirebaseMessaging**
   on target App. Commit the `project.pbxproj` / `Package.resolved` /
   `App.entitlements` changes.
4. **Service account.** Google Cloud console (the Firebase project) → IAM →
   create a service account with only **Firebase Cloud Messaging API Admin**.
   Create a JSON key and paste the whole file into Vercel
   `FIREBASE_SERVICE_ACCOUNT` (Production, Sensitive). Delete the local key
   file.
   - If key creation is blocked by an organization policy, the project is under
     an org, and Workload Identity Federation becomes necessary (a design
     change, tell Claude Code).
5. **Cron secret.** Generate `PUSH_CRON_SECRET` (`openssl rand -base64 48`) and
   set it in Vercel Production (Sensitive). Never Preview (it must not ring real
   devices), never Development, never a `VITE_` name (those are inlined into
   the public bundle). Add the same value in Supabase Dashboard → Vault as
   `push_cron_secret`.
6. **Redeploy production.** Environment changes apply only to new deployments.
7. **Dry-run smoke test** (§21, steps 1–3).
8. **Device smoke test** (§21, steps 4–6), *before* scheduling the tick: a
   scheduled tick inside the owner's 19:00–21:59 could claim the owner's
   reminder first and make step 5 show `due: 0`. Use a **local, uncommitted
   test build**: on the owner's machine (with `google-services.json` and
   `GoogleService-Info.plist` present), temporarily change `build:mobile`'s pin
   to `VITE_PUSH_ENABLED=true`, build and install, then revert the local change.
   `isPushAvailable()` needs the flag at build time, so the switch does not
   render otherwise.
9. **Schedule the tick.** In the Supabase Dashboard, enable **Cron** under
   Integrations (it installs `pg_cron`) and **`pg_net`** under Database →
   Extensions. Then run once in the SQL editor:

   ```sql
   select cron.schedule(
     'streak-reminder',
     '5 * * * *',
     $$
     select net.http_post(
       url := 'https://deutsch-app-dusky.vercel.app/api/v1/push/streak-reminder',
       headers := jsonb_build_object(
         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'push_cron_secret'),
         'Content-Type', 'application/json'
       ),
       body := '{}'::jsonb,
       timeout_milliseconds := 290000
     );
     $$
   );
   ```

   `pg_net`'s default timeout is 2 s. The long timeout lets the function's JSON
   summary land in `net._http_response`. The function finishes either way.
   Vercel Cron cannot replace this schedule as-is: it always sends
   `CRON_SECRET`, which the endpoint refuses (§4 upgrade path).
10. **First scheduled tick** (§21, step 7).
11. **The push-on release.** One release commit flips the `build:mobile` pin to
    `VITE_PUSH_ENABLED=true`, ships the approved §15 copy and bumps
    `PRIVACY_VERSION` (D2), per `STORE_SUBMISSION_CHECKLIST.md` item 9.

---

## 21. Manual smoke test

Keep secrets out of shell history: `read -s S` (paste `PUSH_CRON_SECRET`),
`read -s L` (paste the league's `CRON_SECRET`, for step 1 only), and set
`U=https://deutsch-app-dusky.vercel.app/api/v1/push/streak-reminder`. The
Authorization header is visible in `ps` while `curl` runs, so use a trusted
machine, and `unset S L` at the end.

1. `curl -s -o /dev/null -w '%{http_code}\n' -X POST "$U"` → `401`. Also try
   `-H "Authorization: Bearer $L"` (the league secret) → `401`.
2. `curl -s -X POST -H "Authorization: Bearer $S" "$U?dryRun=1"` → `200` with
   `dryRun: true`. `devicesWithoutZone` counts old rows that have not
   re-registered with a zone yet.
3. `curl -s -X POST -H "Authorization: Bearer $S" "$U?only=not-a-uuid&dryRun=1"` → `400`.
4. **Delivery only (no sender code).**
   - Opt in on the test iPhone and Android with the local test builds (§20 step 8).
   - In the SQL editor:
     `select platform, time_zone, push_token, updated_at from public.user_devices where user_id = '<owner uuid>';`
     There are two rows, each with a zone.
   - Firebase console → Messaging → *Send test message* to each token (copy it
     from the same table).
   - Both phones ring. If the iPhone does not, fix the APNs key or capability
     before continuing.
5. **Opt-out, dry runs only.** On a day when the owner's streak counted
   yesterday and today's goal is not met yet (`only=` ignores the 19:00 window,
   so any hour works):
   1. `$U?only=<owner uuid>&dryRun=1` → `due: 1, devices: 2`.
   2. Turn notifications off on one phone. The row is gone, and the same dry run
      shows `devices: 1`.
   3. Turn them back on there. The same dry run shows `devices: 2` again.
6. **Sender end to end** — the only call that sends. Same day, same conditions
   (it must come after step 5, because a claimed learner drops out of every
   later dry run that day):
   1. `$U?only=<owner uuid>` → `sent: 2`, and both phones show "Keep your streak
      alive".
   2. Repeat → `due: 0` (claimed: idempotent).
7. **First scheduled tick.** After step 9 of §20, wait for the next `:05`. Then
   `select status_code, content from net._http_response order by created desc limit 1;`
   → `200` and a summary with `aborted: null`.

---

## 22. Rollback

| Need                                          | Do                                                                                                                             | Effect                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Stop sending **now**                          | `select cron.unschedule('streak-reminder');` (or `cron.alter_job(<id>, active := false)`)                                       | Takes effect immediately; no deploy                                            |
| Stop without database access                  | Remove or rotate `PUSH_CRON_SECRET` in Vercel, then redeploy                                                                    | Every tick answers 401                                                         |
| Bad code                                      | Vercel Instant Rollback, then revert the PR                                                                                     | Restores `api/chat.js` too (harmless)                                          |
| Bad schema                                    | Nothing to undo in a hurry: everything is additive and old clients stay compatible (`p_time_zone` defaults to `NULL`). If needed, a **forward** migration drops the RPC and table. | Never `db reset`, `migration repair` or `db push`                              |
| Bad iOS build                                 | `VITE_PUSH_ENABLED` stays `false` until verified. The Firebase code is compile-guarded and plist-guarded                        | —                                                                              |

---

## 23. Owner-only steps (agents must never perform)

1. Applying either migration to production, running `notify pgrst`, or renaming
   the migration file to its recorded version.
2. Creating the Firebase project, apps, plists or `google-services.json`, or
   uploading the APNs key.
3. Adding the Firebase SPM package or capability in Xcode, signing, or shipping
   builds.
4. Creating the service account or its key, and setting
   `FIREBASE_SERVICE_ACCOUNT` / `PUSH_CRON_SECRET` in Vercel or Vault.
5. Enabling `pg_cron` / `pg_net`, and scheduling, altering or unscheduling the
   job.
6. Any **non-dry-run** call to the production endpoint.
7. Choosing the push-on release in which the approved copy and the
   `PRIVACY_VERSION` bump merge (D2), and updating store privacy answers.
8. Flipping `VITE_PUSH_ENABLED`.

---

## 24. Rules preserved

- **Client `dateKey` semantics.** Unchanged. The server adopts the client's zone
  rather than imposing one.
- **Storage.** No localStorage key is renamed or reshaped
  (`deutsch-app-push-device-v1` keeps `{token, userId, platform}`).
- **Language coupling.** Nothing German enters `src/lib` or `src/components`.
  `'de'` appears only as the pack data key, as in the progress lane.
- **Production.** Migrations ship as reviewed files. RLS tests run against the
  local stack only (`vitest.rls.config.js` ignores `.env`). No agent touches
  production.
- **Hooks.** `.husky/pre-commit` is never bypassed. The work lands through a
  branch and a PR.

---

## 25. Out of scope, and known gaps

- League-update notifications, and any second notification kind.
- Tap routing, a user-chosen reminder hour, quiet hours beyond the fixed evening
  window, and localisation of the copy.
- **Android notification channel and small icon.** v1 uses FCM's fallback
  channel and the launcher icon. Some devices render that icon as a white
  square. This is a cosmetic follow-up: add a monochrome `ic_stat_*` resource
  and `com.google.firebase.messaging.default_notification_icon` metadata.
- Alerting on a failed run. Workload Identity Federation instead of a key.
- Server-side freeze simulation (§6).

---

## 26. Owner decisions

| #   | Decision                                                                                     | Proposed default                                                                                   | Blocks                                                                                  |
| --- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| D1  | Reminder window and copy                                                                     | 19:00–21:59 local; "Keep your streak alive" / "You haven’t reached today’s goal yet. A few minutes of practice keeps your streak going." | Nothing. These are constants that are cheap to change before or after the merge          |
| D2  | Privacy and disclosure wording (§15) and the `PRIVACY_VERSION` bump, which re-asks every signed-in learner | **Decided 2026-10-01:** copy approved as written. The version bump and the copy merge only in the push-on release | Task 9 is scheduled for that release. Tasks 1–8 do not depend on it                     |
| D3  | Clock: Supabase `pg_cron` (free) vs upgrading Vercel to Pro for native hourly cron           | `pg_cron`                                                                                          | Nothing. Moving to Vercel Cron later needs one line (§4 upgrade path)                   |

No owner decision blocks Tasks 1–8. Firebase and Apple setup (§20) is needed
only for on-device verification and go-live, not to build or test the code.
