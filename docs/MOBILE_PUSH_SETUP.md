# Mobile push setup: Firebase, APNs and the build flag

**Owner action.** The app side of push notifications is built and ships dark.
Turning it on needs a Firebase project, an Apple capability and a build flag,
none of which anyone without those accounts can set up. Until then the
Notifications switch in Settings does not appear, on any platform.

## What is built, and what is not

| Piece                                                 | Where                                                                   | Status         |
| ----------------------------------------------------- | ----------------------------------------------------------------------- | -------------- |
| Plugin (`@capacitor/push-notifications`)              | `package.json`, synced into `android/` and `ios/App/CapApp-SPM`         | Built          |
| Opt-in switch                                         | Settings → System → Notifications (`NotificationsSection.jsx`)          | Built, dark    |
| Permission → register → token → save                  | `src/lib/pushNotifications.js`                                          | Built          |
| Token refresh on launch, drop on opt-out and sign-out | same file, wired from `App.jsx` and `clearUserState.js`                 | Built          |
| Device registry + RPCs                                | `supabase/migrations/20260927120000_user_devices.sql`                   | Needs applying |
| iOS token hand-off (AppDelegate)                      | `ios/App/App/AppDelegate.swift`                                         | Built          |
| **Sending** (streak reminders, league updates)        | nothing yet: a server job reading `user_devices` and calling FCM / APNs | **Not built**  |

The switch collects tokens. Nothing sends to them until the sender exists. That
is a separate piece of work with its own design (what to send, when, and how
often).

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

Dashboard SQL editor on Sprachschule (`xcnnlczvxmuwcqwychox`), after the PR
merges: paste `supabase/migrations/20260927120000_user_devices.sql`. Never
`migration repair`, `db push` or MCP `apply_migration` (AGENTS.md). The
Migration Drift check reports it missing until then, which is expected.

Order does not matter against the flag: without the migration the switch shows
"Could not turn on push notifications" and saves nothing. But apply it first
anyway, so the first build with the flag works end to end.

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
   service (APNs)**. Keep the `.p8`, its Key ID and your Team ID somewhere
   safe. The sender will need them. Nothing in the app does.
3. The token hand-off is already in `AppDelegate.swift`. Without it the plugin
   never hears from APNs; `pushNotifications.test.js` pins it.

The iOS plugin returns a **raw APNs device token**, not an FCM token. That is
why `user_devices` records `platform`: the sender sends iOS tokens through APNs
directly, or registers them with FCM first if it wants one API for both.

## 4. Turn the flag on for native builds

`npm run build:mobile` pins `VITE_PUSH_ENABLED=false`, so no local env file can
turn push on by accident. Turn it on only after every push item in
`docs/STORE_SUBMISSION_CHECKLIST.md` is done: change that pin to `true` in
`package.json`, on a machine that has step 2's `google-services.json`, then
`npm run build:mobile`.

Leave it **off** in Vercel. The web never shows the switch anyway, and keeping
the flag a native-build decision keeps it next to the file it depends on.

## 5. Privacy policy

A device push token is new personal data. The privacy policy is supplied legal
copy (`src/components/legal/PrivacyPolicy.jsx` reproduces it verbatim), so its
new wording has to come from you before push is switched on for real learners.

## On-device check

1. Sign in on the device, Settings → System → **Notifications** → tap
   **Push notifications: off**. The OS prompt appears (Android 13+, iOS).
2. Allow. The button reads **on**, and a row appears for your account:
   `select platform, updated_at from public.user_devices where user_id = '<your id>';`
3. Tap it again: the row is gone.
4. Turn it on, then **sign out**: the row is gone again. The next account on
   that device is not pushed the previous one's streak.
5. Deny the prompt instead: the button stays **off** and says where to allow
   notifications.

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
