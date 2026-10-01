# Mobile push setup: Firebase, APNs and the build flag

**Owner action.** The app side of push notifications is built and ships dark.
Turning it on needs a Firebase project, an Apple capability and a build flag,
none of which anyone without those accounts can set up. Until then the
Notifications switch in Settings does not appear, on any platform.

## What is built, and what is not

| Piece                                                 | Where                                                                                                                                       | Status                                    |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Plugin (`@capacitor/push-notifications`)              | `package.json`, synced into `android/` and `ios/App/CapApp-SPM`                                                                             | Built                                     |
| Opt-in switch                                         | Settings → System → Notifications (`NotificationsSection.jsx`)                                                                              | Built, dark                               |
| Permission → register → token → save                  | `src/lib/pushNotifications.js`                                                                                                              | Built                                     |
| Token refresh on launch, drop on opt-out and sign-out | same file, wired from `App.jsx` and `clearUserState.js`                                                                                     | Built                                     |
| Device registry + RPCs                                | `supabase/migrations/20260927120000_user_devices.sql`, then `20261001120000_push_streak_reminders.sql` (time zone, FCM-only tokens, claims) | First applied; second needs applying (§1) |
| iOS token hand-off (AppDelegate)                      | `ios/App/App/AppDelegate.swift`                                                                                                             | Built                                     |
| Sender: daily streak reminder                         | `api/v1/push/streak-reminder.js`, `api/_lib/streakReminder.js`, `api/_lib/fcm.js`                                                           | Built, inert until §6                     |

The sender is built but inert until §6 is done: it needs Firebase
credentials, a cron secret and the Supabase schedule. Design:
`docs/superpowers/specs/2026-10-01-push-sender-design.md`.

## Why it ships behind a flag

`isPushAvailable()` needs **both** the native app **and**
`VITE_PUSH_ENABLED=true` at build time. The flag is not a formality: on Android,
`register()` calls straight into Firebase, and without `google-services.json`
Firebase is not initialised, so **the app crashes** instead of reporting an
error. iOS without the Push capability just never answers, which the app gives
up on after 20 seconds. Either way the learner would get a switch that cannot
work, so it stays hidden until the platform setup below is done.

In a browser the switch never renders, whatever the flag says. The plugin has
no web implementation, so it is never even downloaded there.

## 1. Apply the migration

Use Supabase's official Management API **Apply a migration** endpoint from a
clean checkout of the reviewed commit. This applies the reviewed file and
records the migration name, which the repo's Migration Drift check requires.
Create a short-lived scoped PAT restricted to project
`xcnnlczvxmuwcqwychox` with **Migrations: Read-write**, then run:

```bash
read -s SUPABASE_MIGRATIONS_TOKEN
export SUPABASE_MIGRATIONS_TOKEN
jq -Rs --arg name user_devices \
  '{name: $name, query: .}' supabase/migrations/20260927120000_user_devices.sql | \
  curl --fail-with-body --silent --show-error \
    -X POST https://api.supabase.com/v1/projects/xcnnlczvxmuwcqwychox/database/migrations \
    -H "Authorization: Bearer ${SUPABASE_MIGRATIONS_TOKEN}" \
    -H 'Content-Type: application/json' \
    --data-binary @-
unset SUPABASE_MIGRATIONS_TOKEN
```

Never paste the migration into the production SQL Editor: direct SQL bypasses
migration history. Never use `db push`, `migration repair`, or MCP
`apply_migration` in this repo. Verify the table and RPCs in the Dashboard,
verify migration history contains the name `user_devices`, then trigger
**Migration Drift** after the PR merges; it must be green.

Order does not matter against the flag: without the migration the switch shows
"Could not turn on push notifications" and saves nothing. But apply it first
anyway, so the first build with the flag works end to end.

**Then apply the second migration,
`supabase/migrations/20261001120000_push_streak_reminders.sql`, with its own
command.** The block above hard-codes the `user_devices` file, so reusing it
would apply the wrong one. Production history already lists `user_devices`
(checked 2026-10-01), so this is the outstanding one; a fresh project runs both,
in order. Same token handling:

```bash
read -s SUPABASE_MIGRATIONS_TOKEN
export SUPABASE_MIGRATIONS_TOKEN
jq -Rs --arg name push_streak_reminders \
  '{name: $name, query: .}' supabase/migrations/20261001120000_push_streak_reminders.sql | \
  curl --fail-with-body --silent --show-error \
    -X POST https://api.supabase.com/v1/projects/xcnnlczvxmuwcqwychox/database/migrations \
    -H "Authorization: Bearer ${SUPABASE_MIGRATIONS_TOKEN}" \
    -H 'Content-Type: application/json' \
    --data-binary @-
unset SUPABASE_MIGRATIONS_TOKEN
```

After each apply, run `notify pgrst, 'reload schema';` in the Dashboard SQL
editor (it is a notification, not a schema change). Verify migration history
contains the name `push_streak_reminders`. Until it is applied, Migration Drift
reports the file missing: that is expected. Then rename the repo file to the
version recorded in migration history, in a PR (as #383 did).

## 2. Android: Firebase

1. [Firebase console](https://console.firebase.google.com) → add a project (or
   use an existing one) → **Add app → Android**, package name
   `com.sprachschule.deutsch`.
2. Download **`google-services.json`** and put it at
   **`android/app/google-services.json`**. `android/app/build.gradle` already
   applies the Google Services plugin whenever that file exists, and skips it
   when it does not.
   - The file is not a secret in the credential sense (Firebase documents it as
     safe to ship in the app). Committing it is your call. If you do not, it
     has to exist on every machine that builds a push-enabled APK, CI included.
3. Nothing else on the app side: the plugin's manifest adds the FCM messaging
   service, `AndroidManifest.xml` declares Android 13's `POST_NOTIFICATIONS`,
   and the plugin requests it when the learner flips the switch.

## 3. iOS: APNs

1. Xcode → `ios/App/App.xcodeproj` → target **App** → **Signing &
   Capabilities** → **+ Capability** → **Push Notifications**. That writes the
   `aps-environment` entitlement and wires it into the project. Commit the
   resulting `App.entitlements` and `project.pbxproj` changes.
2. Apple Developer → **Keys** → create a key with **Apple Push Notifications
   service (APNs)**. Upload the `.p8` with its Key ID and your Team ID to
   Firebase → Project settings → Cloud Messaging → Apple app configuration. One
   key covers sandbox and production. The sender never holds it: FCM delivers
   to Apple devices through APNs with this key.
3. The token hand-off is already in `AppDelegate.swift`. Without it the plugin
   never hears from APNs; `pushNotifications.test.js` pins it.
4. **Firebase on iOS.** In Firebase, add an iOS app with the bundle id of
   `ios/App`. Download `GoogleService-Info.plist` and add it to target
   **App** in Xcode. Then File → Add Package Dependencies →
   `https://github.com/firebase/firebase-ios-sdk` → product
   **FirebaseMessaging** on target **App**. Commit the project changes.
   Without both, `AppDelegate.swift` reports a registration failure
   instead of a token, and the switch says it could not turn on.

With Firebase configured, `AppDelegate.swift` hands the plugin an **FCM
registration token**, the same kind Android returns. That is the only kind
the sender can address, and `register_push_device` refuses a raw APNs
token.

## 4. Turn the flag on for native builds

`npm run build:mobile` pins `VITE_PUSH_ENABLED=false`, so no local env file can
turn push on by accident. Turn it on only after every push item in
`docs/STORE_SUBMISSION_CHECKLIST.md` is done: change that pin to `true` in
`package.json`, on a machine that has step 2's `google-services.json`, then
`npm run build:mobile`.

Do not flip it in a commit until the sender is built and configured and
end-to-end delivery has been verified on real iOS and Android devices. That
verification uses a local, uncommitted test build (§6, setup step 8), never the
committed pin. The committed flip is the last step of §6. Flip it in a release
commit, only for a build machine that has google-services.json, and update
src/lib/buildMobileScript.test.js in the same commit (it pins =false on purpose).

Leave it **off** in Vercel. The web never shows the switch anyway, and keeping
the flag a native-build decision keeps it next to the file it depends on.

## 5. Privacy policy

The push wording is in the Privacy Policy (section 2, "Push Notifications") and
in the Settings disclosure. Follow docs/STORE_SUBMISSION_CHECKLIST.md item 9
before turning push on.

## On-device check

1. Sign in on the device, Settings → System → **Notifications** → tap
   **Push notifications: off**. The OS prompt appears (Android 13+, iOS).
2. Allow. The button reads **on**, and a row appears for your account:
   `select platform, time_zone, updated_at from public.user_devices where user_id = '<your id>';`
   `time_zone` should be your phone's zone (for example `Europe/Berlin`).
   `NULL` means the build predates the sender and gets no reminders.
3. Tap it again: the row is gone.
4. Turn it on, then **sign out**: the row is gone again. The next account on
   that device is not pushed the previous one's streak.
5. Deny the prompt instead: the button stays **off** and says where to allow
   notifications.

## 6. The sender (streak reminders)

**Owner action, after §1–§3.** One hourly tick from Supabase calls the
Vercel function, which sends at most one "Keep your streak alive" per learner
per day, between 19:00 and 21:59 in the learner's own time zone. §4's flag flip
is the final step of the setup below. Never run a non-dry-run call, the
schedule, or the Vault/Vercel secret steps from an agent.

**Size.** One `claim_streak_reminders` call claims at most 100 learners, and a
run pages through up to 1,000. Anyone beyond that stays unclaimed for the next
tick inside the 3-hour window.

### Environment variables

| Name                                        | Scope                        | Content                                                                                                                                            |
| ------------------------------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUSH_CRON_SECRET`                          | Vercel Production, Sensitive | ≥ 32 random characters. The **same value** is Vault secret `push_cron_secret`.                                                                     |
| `FIREBASE_SERVICE_ACCOUNT`                  | Vercel Production, Sensitive | The whole downloaded JSON key of the FCM-only service account.                                                                                     |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | existing                     | unchanged                                                                                                                                          |
| `VITE_PUSH_ENABLED`                         | native build pin             | `false` in every commit until the last setup step. The device smoke test uses a local, uncommitted build (`STORE_SUBMISSION_CHECKLIST.md` item 9). |

Set the two new variables in **Production only**, as Sensitive. Never Preview (a
preview deployment must not ring real devices), never Development, and never
with a `VITE_` prefix: Vite inlines `VITE_` values into the public bundle. Both
are documented, commented out, in `.env.example`.

### Setup, in order

Steps 1–3 are done above: both migrations (§1), the Firebase apps and the APNs
key (§2, §3), and the Xcode package (§3). The numbering continues from 4.

**Order matters.** The device test (step 8) comes before the schedule (step 9).
Once the tick is scheduled, a run between 19:00 and 21:59 your time can claim
your reminder first, and the `only=` test would then report `due: 0`.

4. **Service account.** Google Cloud console (the Firebase project) → IAM →
   create a service account with only **Firebase Cloud Messaging API Admin**.
   Create a JSON key and paste the whole file into Vercel
   `FIREBASE_SERVICE_ACCOUNT` (Production, Sensitive). Delete the local key
   file.
   - If key creation is blocked by an organization policy, the project is under
     an org, and Workload Identity Federation becomes necessary (a design
     change, tell Claude Code).
5. **Cron secret.** Generate `PUSH_CRON_SECRET` (`openssl rand -base64 48`) and
   set it in Vercel Production (Sensitive). Add the same value in Supabase
   Dashboard → Vault as `push_cron_secret`.
6. **Redeploy production.** Environment changes apply only to new deployments.
7. **Dry-run smoke test** (the smoke test below, steps 1–3).
8. **Device smoke test** (the smoke test below, steps 4–6), on a **local,
   uncommitted test build**. `isPushAvailable()` needs `VITE_PUSH_ENABLED=true`
   at build time and `build:mobile` pins it `false`, so, on your machine with
   `android/app/google-services.json` and `GoogleService-Info.plist` in place:
   temporarily change that pin in the `build:mobile` script of `package.json` to
   `VITE_PUSH_ENABLED=true`, run `npm run build:mobile`, build and install the
   app on the iPhone and the Android device, then **change the pin back**
   (`git diff package.json` must be empty). Never commit it:
   `src/lib/buildMobileScript.test.js` pins `false`, and the pre-commit hook
   runs it against your working tree, so a leftover edit blocks your next
   commit.
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

   The schedule stays in Supabase because Vercel Cron cannot drive this
   endpoint as-is: it always sends `Authorization: Bearer $CRON_SECRET`, which
   the endpoint deliberately refuses (that is the league's secret). Moving to
   Vercel Cron, on a plan that allows hourly crons, would mean changing the
   endpoint to accept that secret too.

10. **First scheduled tick** (the smoke test below, step 7).
11. **Release, the last step.** One release commit: change the `build:mobile`
    pin to `true`, update `src/lib/buildMobileScript.test.js` in the same
    commit, ship the approved privacy copy and bump `PRIVACY_VERSION`. That
    copy change is ready but deliberately held back for this release. Then
    finish `docs/STORE_SUBMISSION_CHECKLIST.md` item 9, including the App
    Privacy / Data Safety answers (§4, §5).

### Manual smoke test

Steps 1–3 are setup step 7, steps 4–6 are setup step 8, step 7 is setup step 10.

Run these on a trusted machine: the `Authorization` header is visible in `ps`
while curl runs. Paste each secret at its prompt, the same pattern as §1, so
nothing is echoed and nothing lands in shell history:

```bash
read -s S   # paste PUSH_CRON_SECRET
read -s L   # paste CRON_SECRET, the league's secret (step 1 only)
U=https://deutsch-app-dusky.vercel.app/api/v1/push/streak-reminder
```

1. `curl -s -o /dev/null -w '%{http_code}\n' -X POST "$U"` → `401`. Also try
   `-H "Authorization: Bearer $L"` (the league secret) → `401`.
2. `curl -s -X POST -H "Authorization: Bearer $S" "$U?dryRun=1"` → `200` with
   `dryRun: true`. `devicesWithoutZone` counts old rows that have not
   re-registered with a zone yet.
3. `curl -s -X POST -H "Authorization: Bearer $S" "$U?only=not-a-uuid&dryRun=1"`
   → `400`.
4. **Delivery only (no sender code).**
   - Opt in on the test iPhone and Android with the local test builds from
     setup step 8.
   - In the SQL editor:
     `select platform, time_zone, updated_at from public.user_devices where user_id = '<owner uuid>';`
     There are two rows, each with a zone.
   - Firebase console → Messaging → _Send test message_ to each token (copy it
     from the same table).
   - Both phones ring. If the iPhone does not, fix the APNs key or capability
     before continuing.
5. **Opt-out, dry runs only.** On a day when the owner's streak counted yesterday
   and today's goal is not met yet (`only=` ignores the 19:00 window, so any
   hour works):
   1. `curl -s -X POST -H "Authorization: Bearer $S" "$U?only=<owner uuid>&dryRun=1"`
      → `due: 1, devices: 2`.
   2. Turn notifications off on one phone. The row is gone, and the same dry
      run shows `devices: 1`.
   3. Turn them back on there. The same dry run shows `devices: 2` again.
6. **Sender end to end.** The only call here that sends. Same day, same
   conditions:
   1. `curl -s -X POST -H "Authorization: Bearer $S" "$U?only=<owner uuid>"` →
      `sent: 2`, and both phones show "Keep your streak alive".
   2. Run it again → `due: 0` (claimed: idempotent). That also means a dry run
      for the owner now shows `due: 0` until the next local day.

   Then `unset S L`.

7. **First scheduled tick.** After setup step 9, wait for the next `:05`. Then
   `select status_code, content from net._http_response order by created desc limit 1;`
   → `200` and a summary with `aborted: null`.

### Rollback

| Need                         | Do                                                                                                                                                                                 | Effect                                            |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Stop sending **now**         | `select cron.unschedule('streak-reminder');` (or `cron.alter_job(<id>, active := false)`)                                                                                          | Takes effect immediately; no deploy               |
| Stop without database access | Remove or rotate `PUSH_CRON_SECRET` in Vercel, then redeploy                                                                                                                       | Every tick answers 401                            |
| Bad code                     | Vercel Instant Rollback, then revert the PR                                                                                                                                        | Restores `api/chat.js` too (harmless)             |
| Bad schema                   | Nothing to undo in a hurry: everything is additive and old clients stay compatible (`p_time_zone` defaults to `NULL`). If needed, a **forward** migration drops the RPC and table. | Never `db reset`, `migration repair` or `db push` |
| Bad iOS build                | The committed `VITE_PUSH_ENABLED` pin stays `false` until the release step. The Firebase code is compile-guarded and plist-guarded                                                 | —                                                 |

### Is it working?

There is no server-side Sentry in this project. The sender uses what already
exists:

| Signal                      | Where                                                                                                                          | Retention                       |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| Run summary (JSON response) | `net._http_response` (`select status_code, content, error_msg, created from net._http_response order by created desc limit 5`) | 6 h                             |
| Run summary (log line)      | Vercel runtime logs, `event:"streak_reminder_run"`                                                                             | Short on Hobby, so read it soon |
| Tick fired                  | `cron.job_run_details`                                                                                                         | Until pruned                    |
| Learners reached per day    | `select local_day, count(*) from push_reminder_claims group by 1 order by 1 desc`                                              | 8 days                          |

The summary's fields are: `dryRun`, `due`, `devices`, `sent`, `dead`, `failed`,
`configErrors`, `released`, `devicesWithoutZone`, `aborted`
(`null | 'quota' | 'fatal' | 'deadline'`) and `ms`.

**What "healthy" looks like.**

- `configErrors = 0` and `aborted = null`.
- `devicesWithoutZone` small and not rising.
- In the evening ticks, `sent ≈ devices`.

A non-200 in `net._http_response` is the alarm. Alerting is out of scope.

## How it behaves

- **One row per device, keyed by token.** A learner with a phone and a tablet
  has two rows. A device a second account opts in on moves to that account.
- **Opt-out** deletes the row and unregisters with the OS. Either one stops the
  device ringing, so it still works offline.
- **Sign-out** does the same **before** the session ends (the RPC acts as the
  signed-in user), bounded to 3 seconds so a dead network cannot stall it.
- **Every signed-in launch** re-registers an opted-in device, because APNs and
  FCM can rotate a token and only say so on the next `register()`. It never
  prompts. If notifications were since blocked in the OS, the row is dropped.
- **At most 10 devices per account.** The least recently registered fall off.
- **Account deletion** removes every row through the `auth.users` cascade, like
  every other user-owned table.
