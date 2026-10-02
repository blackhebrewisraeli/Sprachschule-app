# Store submission — owner checklist (sprachschule-app)

> **RELEASE GATE — DONE.** `legal_acceptances` was applied to production on
> 2026-09-30 at 14:36 UTC, before the terms-acceptance client merged (#382,
> 19:29 UTC). Verified read-only the same day: table, RLS, one read-own policy,
> no anon access, RPC callable by `authenticated` only.

Code alone does not make the app compliant. Each item below needs an account or
a judgement only the owner has. Tick them in order: several gate the next.

## Blocker matrix — audited 2026-10-03 (main `a66292bf`)

The ranked view of everything below and in the companion docs. **Evidence**
column: _repo_ = read from the tree, _prod-read_ = read-only Supabase/HTTP/GitHub
check on 2026-10-03, _owner confirmation required_ = cannot be verified without
the dashboard or a device, so it is not assumed either way. Needs: **code**,
**dashboard** (external account), **device** (real iPhone/Android), **counsel**.

**Verified healthy, not blockers:** production has all 39 repo migrations by
name, and every version equals its filename (no rename owed); Migration Drift,
CI, iOS Simulator, Android debug APK and Uptime are green on `main`;
`/`, `/privacy`, `/terms`, `/delete-account` return 200 on
`www.sprachschule-app.com` and the apex 308-redirects to `www`; push stays off
(`build:mobile` pins `VITE_PUSH_ENABLED=false`); AI quota is shadow-only and
AI history is dark. **No production-safety P0 was found.**

### P0 — blocks TestFlight, Play Internal Testing, or production safety

| #    | Blocker                                                                                                                                                                                                                                                                                       | Owner / agent                          | Prerequisite                                                                                    | Verification                                                                                                                                                                                                | Needs              |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| P0-1 | **Native sign-in callback not allow-listed.** `com.sprachschule.deutsch://login-callback` must be in Supabase Redirect URLs; otherwise every native sign-in lands on the website. Client side is ready (`nativeApp.js`, `Info.plist` scheme, Android intent filter on host `login-callback`). | Owner                                  | Supabase → Authentication → URL Configuration; keep all five entries (`MOBILE_AUTH_SETUP.md`)   | The two `openurl` / `adb` commands in `MOBILE_AUTH_SETUP.md` §Verify open "Sign-in cancelled"; then magic link and Google on a phone both land in the app. Dashboard state: **owner confirmation required** | dashboard + device |
| P0-2 | **iOS cannot be archived yet.** No `DEVELOPMENT_TEAM` in the project (Automatic signing, team unset); version 1.0 / build 1; no App Store Connect record verified.                                                                                                                            | Owner (Xcode)                          | Apple Developer Program team; App Store Connect app with bundle id `com.sprachschule.deutsch`   | `npm run build:mobile`, Product → Archive → Distribute to App Store Connect; build appears in TestFlight. CI only builds an unsigned Simulator app, so nothing automated proves signing                     | dashboard + device |
| P0-3 | **Android release signing is local-only.** `android/keystore.properties` exists on this machine (contents not read); the Gradle task refuses `bundleRelease` without it. Whether the keystore and passwords are backed up is unknown.                                                         | Owner (Android Studio)                 | Keystore outside the repo, backed up (`NATIVE_BUILD.md` §4); Play Console app; Play App Signing | `cd android && ./gradlew bundleRelease` writes a signed `.aab`; Play Console accepts it to Internal Testing. Backup: **owner confirmation required**                                                        | dashboard + device |
| P0-4 | **No native build has been exercised on a real device.** Auth, offline, voice, deep links and the six screenshot scenes are all untested outside the Simulator build.                                                                                                                         | Owner, with an agent for the checklist | P0-1 to P0-3                                                                                    | The `MOBILE_AUTH_SETUP.md` device steps, plus a pass through all six tabs, sign-out, and in-app **Delete account** on a throwaway user                                                                      | device             |

### P1 — blocks public beta or store review

| #    | Blocker                                                                                                                                                                                                                                                                                                                                 | Owner / agent                              | Prerequisite                                                                                                        | Verification                                                                                                                                                 | Needs                       |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- |
| P1-1 | **Counsel review of the Privacy Policy and Terms** (item 3), including international transfers, minimum age 13 and the AI clause. The 2026-10-03 policy version adds saved tutor conversations.                                                                                                                                         | Owner + counsel                            | Final text (`PRIVACY_VERSION` `2026-10-03`)                                                                         | Written sign-off; any edit lands as a PR that bumps `PRIVACY_VERSION`                                                                                        | counsel                     |
| P1-2 | **App Privacy and Data Safety forms not filled.** Draft table (item 7–8) is current. Two inputs still open: whether native builds get `VITE_SENTRY_DSN` (`NATIVE_BUILD.md` calls it optional; a DSN makes crash data and IP "collected"), and whether native ships saved tutor conversations (dark today).                              | Owner                                      | Decide the Sentry DSN for native; keep `VITE_AI_HISTORY_ENABLED` unset in the submitted build                       | Each form line matches the submitted build, re-read at submission. Nothing but the owner can confirm what is entered                                         | dashboard                   |
| P1-3 | **App name mismatch.** Store name is "Deutsch Sprachschule"; the installed app is labelled `sprachschule-app` (`Info.plist` `CFBundleDisplayName`, Android `app_name`, `capacitor.config.ts` `appName`). The listing note that claimed they match was wrong and is corrected. Google checks the deletion page against the listing name. | Agent (code) after owner confirms the name | Owner confirms the home-screen label (the 320 px header-budget note in item 14 concerns the web wordmark, not this) | After the change, the device home-screen label equals the listing name; `nativeApp.test.js` / brand tests updated in the same PR                             | code                        |
| P1-4 | **Sign in with Apple (Guideline 4.8).** iOS offers Google sign-in. Apple requires an equivalent privacy-preserving login unless an exemption applies; whether passwordless email OTP satisfies a reviewer is a judgement, not a fact the repo can settle.                                                                               | Owner (decision), then agent               | Decide: argue the exemption in review notes, or add Apple as a Supabase provider                                    | **Owner confirmation required**; the only real proof is Apple's review of the first submission                                                               | dashboard (+ code if added) |
| P1-5 | **No iOS privacy manifest and no export-compliance key.** There is no `PrivacyInfo.xcprivacy` in the app target and no `ITSAppUsesNonExemptEncryption` in `Info.plist`; uploads will prompt for export compliance on every build and may warn on required-reason APIs.                                                                  | Agent (code)                               | None                                                                                                                | First TestFlight upload shows no ITMS privacy warnings. Whether the Capacitor plugin manifests cover it: **owner confirmation required** after upload        | code + device               |
| P1-6 | **Screenshots do not exist.** Only the plan is tracked (`store-screenshot-plan.md`): 6 iPhone `1320×2868`, 6 iPad `2064×2752`, 6 Play `1080×1920`, one `1024×500` feature graphic. They must come from release-candidate native builds with a seeded fictional account.                                                                 | Owner (capture), agent (composite)         | P0-2 to P0-4; seeded account                                                                                        | Every box in the plan's "Export and submission checks" ticked, sizes exact                                                                                   | device                      |
| P1-7 | **Listing and policy fields not entered.** Privacy URL (items 4–5), deletion URL (item 6), age/content ratings, category, support contact. The deletion page is a client-rendered SPA route: `curl` returns the app shell, so Google's crawler seeing "Deutsch Sprachschule" is unproven.                                               | Owner                                      | P1-3                                                                                                                | Open `/delete-account` signed out in a private window and read the app name; confirm in Play Console that the URL validates. **Owner confirmation required** | dashboard                   |
| P1-8 | **Public sign-up posture and Google OAuth status.** Closed-beta allowlist is off (BACKLOG #8), and the Google consent screen still shows `xcnnlczvxmuwcqwychox.supabase.co`. If the Google OAuth app is in "Testing", only listed test users can sign in.                                                                               | Owner                                      | Decide open vs invite-only; Google Cloud → OAuth consent screen                                                     | A non-test Google account signs in on the production site. Publishing status: **owner confirmation required**                                                | dashboard                   |
| P1-9 | **Play Console closed-testing rule.** A personal developer account created after Nov 2023 must run a closed test with 12+ testers for 14 days before it may apply for production.                                                                                                                                                       | Owner                                      | Account type                                                                                                        | **Owner confirmation required** of the account type and the Play Console release dashboard                                                                   | dashboard                   |

### P2 — post-launch polish

| #    | Item                                                                                                                                                                                                                                                                                                         | Owner / agent | Prerequisite                                     | Verification                                                                | Needs              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | ------------------------------------------------ | --------------------------------------------------------------------------- | ------------------ |
| P2-1 | **Push, iOS half.** Android has `google-services.json` committed (#374). iOS lacks the Push capability and `.entitlements`, `GoogleService-Info.plist` and the FirebaseMessaging package; APNs key, `FIREBASE_SERVICE_ACCOUNT`, `PUSH_CRON_SECRET`, pg_cron/pg_net and the device smoke test are all undone. | Owner         | `MOBILE_PUSH_SETUP.md` §2–§6, in that order      | §6 smoke test steps 1–7 on both phones; then the item 9 release commit      | dashboard + device |
| P2-2 | **AI history release.** Waits for the shadow-week review (~2026-10-09/10). Native builds get it only with the flag baked in, and the store forms must be updated first (P1-2).                                                                                                                               | Owner         | `AI_HISTORY_RELEASE_RUNBOOK.md` §0               | Runbook §3 smoke test, §4 purge check                                       | dashboard          |
| P2-3 | **Sentry source maps.** Dormant until `SENTRY_AUTH_TOKEN` exists in Vercel; native builds are local and upload only if the token is in that shell. Whether the token is set: **owner confirmation required**.                                                                                                | Owner         | `BACKLOG.md` §Sentry source-map upload           | Build log has no `SENTRY SOURCE-MAP UPLOAD FAILED`; release lists artifacts | dashboard          |
| P2-4 | **Fallback-domain stragglers.** Uptime and both native CI builds still point at `deutsch-app-dusky.vercel.app`; docs keep it as the allow-listed provider fallback on purpose. Production is `www.sprachschule-app.com` everywhere a user sees it.                                                           | Agent (code)  | Decide whether CI should track the custom domain | Uptime run green against `www`                                              | code               |
| P2-5 | Leaked-password advisor (no passwords exist, `PRE_BETA_OWNER_CHECKLIST.md` §7), Universal/App Links, Android `minifyEnabled`, GitHub sign-in on web (item 13), voice input on native (item 11), in-app wordmark rename (item 14).                                                                            | Owner / agent | —                                                | —                                                                           | mixed              |

### Account deletion and export coverage (verified from `api/_lib/accountEndpoints.js`)

In-app **Delete account** removes the avatar folder first, then the user, and
every user-owned table cascades. Export maps `legal_acceptances`,
`ai_conversations` and `ai_messages` (paged) and deliberately omits
`user_devices` (push tokens are device credentials, with the reason recorded in
code). `delete.test.js` and `export.test.js` cover both. Web `/delete-account`
exists for Google's external-deletion requirement. Gap: none found in code; the
device pass in P0-4 is the proof.

### Shortest safe path

1. **Internal native testing (days):** P0-1 → P0-2 / P0-3 in parallel → P0-4. Nothing here needs code; P1-3 (name) and P1-5 (privacy manifest) are small PRs worth landing first so the first uploaded build is the right one.
2. **Public beta (about two weeks, driven by P1-9 if it applies):** P1-8 (decide sign-up posture, publish Google OAuth) → P1-6 screenshots from the TestFlight/Internal builds → P1-2, P1-7 forms → P1-1 counsel in parallel from day one, because it is the longest wait you do not control.
3. **Store submission:** all P1 closed; submit iOS with review notes covering P1-4 and the guest path; submit Android after the P1-9 clock. Keep push, premium, ads and saved conversations out of the submitted build so the forms stay true.

## Before merging the terms-acceptance PR

1. ✅ **Applied `supabase/migrations/20260930143614_legal_acceptances.sql` to
   production** through Supabase's Management API **Apply a migration**
   endpoint, which records the migration name the Migration Drift check reads.

   That endpoint records the **apply time** as the version, not the file's
   timestamp. The file was written as `20260929120000_…` and renamed to the
   recorded `20260930143614_…` afterwards; until it was, the Supabase Preview
   check on `main` failed with "Remote migration versions not found in local
   migrations directory". Any future migration applied this way needs the same
   rename, in a PR, to the version production records.

   Never paste a migration into the production SQL Editor (it bypasses
   migration history), and never use `db push`, `migration repair`, or MCP
   `apply_migration` in this repo.

2. **Keep the email-provider line true.** The policy names Supabase Auth as the
   sender of sign-in emails (owner answer, 2026-09-29, re-confirmed
   2026-09-30). If a custom SMTP provider is ever configured under Supabase →
   Auth → SMTP Settings, add it to the policy's service-provider list and bump
   `PRIVACY_VERSION`.
3. **Have qualified counsel review** the final Privacy Policy and Terms,
   including international transfers, the minimum age (Terms say 13), and
   whether the optional AI clause is wanted.

## Store listings

4. **App Store Connect → App Privacy → Privacy Policy URL:**
   `https://www.sprachschule-app.com/privacy`.
5. **Google Play Console → App content → Privacy policy:** same URL.
6. **Google Play → Data safety → account deletion URL:**
   `https://www.sprachschule-app.com/delete-account`. Open it in a private
   window (signed out) and confirm it loads before entering it. Google checks
   that the page names the app as the store listing does: the page says
   **Deutsch Sprachschule** (owner decision, 2026-10-01), so both store
   listings must use that exact app name. The tracked App Store copy is in
   `docs/store-metadata/app-store-listing.md`; the tracked Play Console copy is
   in `docs/store-metadata/google-play-listing.md`; the shared capture sizes,
   six-screen story and export checks are in
   `docs/store-metadata/store-screenshot-plan.md`.

   **Handling an emailed request.** The subject is "Account Deletion Request -
   Deutsch Sprachschule", and the page promises deletion within 30 days.
   1. Check that the sender's address is the account's email: Supabase →
      Authentication → Users → search by email. If it isn't, reply asking them
      to write from that address or to delete in the app.
   2. Copy the user's **User UID**.
   3. Storage → `avatars` → delete the folder named with that UID, if there is
      one. Do this first: once the user is gone, nothing records which folder
      was theirs.
   4. Authentication → Users → that user → **Delete user**. Every table holding
      their data references the user with `on delete cascade`, so this removes
      the rest, exactly as the in-app Delete account button does.
   5. Reply to confirm it is done.

7. **Apple App Privacy answers** — use the draft below, taken from the audit in
   `docs/superpowers/specs/2026-09-29-store-legal-consent-design.md` §3. Check
   every line against the build you submit: the native app today has **no
   Sentry DSN** and **no Vercel Analytics**; if either changes, so do the
   answers.
8. **Google Data Safety answers** — use the same audited draft below and check
   every line against the submitted build. Item 6 must be resolved separately;
   data-safety disclosure does not replace the external deletion pathway.

| Data                                           | Collected by the native app?     | Linked to identity  | Purpose           | Notes                                                                                                                                                                                      |
| ---------------------------------------------- | -------------------------------- | ------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Email address                                  | Yes                              | Yes                 | App functionality | Sign-in                                                                                                                                                                                    |
| Name                                           | Yes (optional)                   | Yes                 | App functionality | Profile; OAuth providers also share one                                                                                                                                                    |
| Photos (profile picture)                       | Yes (optional)                   | Yes                 | App functionality | Public bucket, unguessable URL                                                                                                                                                             |
| User ID                                        | Yes                              | Yes                 | App functionality |                                                                                                                                                                                            |
| Other user content (problem reports)           | Yes                              | Yes when signed in  | App functionality |                                                                                                                                                                                            |
| Text sent to AI features                       | Sent to Anthropic via our server | No identifiers sent | App functionality | Counsel: "collected" vs processed in real time                                                                                                                                             |
| Other user content (saved tutor conversations) | Only if the learner opts in      | Yes                 | App functionality | Off by default; deleted after ~90 days or with the account. Apple: User Content → Other User Content. Google: Messages → Other in-app messages. Re-check each form's wording at submission |
| Product interaction / learning progress        | Yes                              | Yes                 | App functionality | Synced when signed in                                                                                                                                                                      |
| Device ID / push token                         | Only if push is enabled          | Yes                 | App functionality | Declare once push ships                                                                                                                                                                    |
| Crash data                                     | No (web only today)              | —                   | —                 | Re-answer if a DSN is added to native builds                                                                                                                                               |
| Audio                                          | Not by us                        | —                   | —                 | OS speech recognition; see item 11                                                                                                                                                         |

## Before turning push on

9. Push is pinned **off** in `build:mobile`. Also remove
   `VITE_PUSH_ENABLED=true` from your local `.env.production.local`.
   Turn it on only when all of these are done: `user_devices` migration applied
   (`docs/MOBILE_PUSH_SETUP.md` §1); Firebase and APNs set up (§2–§3); the
   approved policy and disclosure are live; **the notification sender is built,
   configured, and end-to-end delivery is verified on a real iPhone and Android
   device**; and the registration/opt-out check in `docs/MOBILE_PUSH_SETUP.md`
   passes on both devices. Then change the pin to `true`, rebuild, and update
   the App Privacy / Data Safety answers for the push token.

## Worth doing, not blocking

10. Sentry → Project Settings → Security & Privacy → **Prevent Storing of IP
    Addresses**.
11. Verify voice input in the native app. If the microphone prompt can appear,
    add `NSMicrophoneUsageDescription` and `NSSpeechRecognitionUsageDescription`
    to `ios/App/App/Info.plist` and declare Audio Data.
12. Confirm Vercel still documents Web Analytics and Speed Insights as
    cookieless (the policy says so).
13. Decide whether GitHub sign-in should be on for the web
    (`VITE_GITHUB_AUTH_ENABLED` is unset in Vercel Production; the policy
    mentions GitHub because the apps use it).
14. Decide whether the in-app "Deutsch." wordmark and the rendered
    `public/social-preview.png` follow the new name. Both were left alone on
    purpose: the wordmark sits in a header whose 320px budget has ~10px of
    slack, so a longer name is a layout change, not a rename.
15. Update the production-side copies of the brand (owner-only settings; the
    repo copies are already renamed): Supabase → Auth → Email Templates →
    Magic Link subject and body (paste from `supabase/config.toml` and
    `supabase/templates/magic_link.html`, `docs/AUTH_EMAIL_TEMPLATE_RUNBOOK.md`);
    the Google OAuth consent-screen app name
    (`docs/AUTH_GOOGLE_OAUTH_RUNBOOK.md`); the GitHub OAuth application name
    (`docs/AUTH_GITHUB_OAUTH_RUNBOOK.md`); and the App Store Connect / Play
    Console app name.

## Identifiers that keep the old name (by design)

The product is `sprachschule-app`, and the contact address is
`sprachschule.support@gmail.com`. These stable identifiers were NOT renamed,
because renaming them needs a migration or infrastructure change:

| Identifier                          | Value                                         | Why it stays                                                                  |
| ----------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------- |
| GitHub repository                   | `blackhebrewisraeli/deutsch-app`              | Remotes, CI, Sonar, Vercel link                                               |
| Public production origin            | `www.sprachschule-app.com`                    | Supabase redirect allow-list, `build:mobile`, policy URL in the stores        |
| Vercel fallback URL                 | `deutsch-app-dusky.vercel.app`                | Provider-owned alias retained for rollback and diagnostics                    |
| Supabase project                    | `Sprachschule` (`xcnnlczvxmuwcqwychox`)       | Project ref is baked into every client                                        |
| Bundle / application ID, URL scheme | `com.sprachschule.deutsch`                    | Changing it makes a different app in both stores and breaks the auth callback |
| localStorage keys                   | `deutsch-app-*` (incl. `deutsch-app-legal-*`) | AGENTS.md: never rename or migrate a storage key                              |
| Admin / allowlist identity          | `esterkinshimon712@gmail.com`                 | Authorization, not contact — `api/_lib/roles.js`                              |
| Sentry project                      | `javascript-react` (org `blackhebrewisraeli`) | Event history and alert rules                                                 |
