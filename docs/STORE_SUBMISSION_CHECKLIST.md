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
AI history is dark; the native Supabase callback is allow-listed; Anthropic has
a $10 monthly spend ceiling, auto-reload off, and alerts at $5 / $8 / $9
(owner-confirmed 2026-10-03). **No production-safety P0 was found.**

### P0 — blocks TestFlight, Play Internal Testing, or production safety

| #    | Blocker                                                                                                                                                                                                                                                                | Owner / agent                          | Prerequisite                                                                                    | Verification                                                                                                                                                                            | Needs              |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| P0-1 | ✅ **Dashboard configured.** Owner screenshot on 2026-10-03 confirms `com.sprachschule.deutsch://login-callback` already exists in Supabase Redirect URLs. Client side is ready (`nativeApp.js`, `Info.plist` scheme, Android intent filter on host `login-callback`). | —                                      | —                                                                                               | The dashboard portion is complete. The two `openurl` / `adb` checks and real-device magic-link / Google return remain part of P0-4.                                                     | device             |
| P0-2 | **iOS cannot be archived yet.** No `DEVELOPMENT_TEAM` in the project (Automatic signing, team unset); version 1.0 / build 1; no App Store Connect record verified.                                                                                                     | Owner (Xcode)                          | Apple Developer Program team; App Store Connect app with bundle id `com.sprachschule.deutsch`   | `npm run build:mobile`, Product → Archive → Distribute to App Store Connect; build appears in TestFlight. CI only builds an unsigned Simulator app, so nothing automated proves signing | dashboard + device |
| P0-3 | **Android release signing is local-only.** `android/keystore.properties` exists on this machine (contents not read); the Gradle task refuses `bundleRelease` without it. Whether the keystore and passwords are backed up is unknown.                                  | Owner (Android Studio)                 | Keystore outside the repo, backed up (`NATIVE_BUILD.md` §4); Play Console app; Play App Signing | `cd android && ./gradlew bundleRelease` writes a signed `.aab`; Play Console accepts it to Internal Testing. Backup: **owner confirmation required**                                    | dashboard + device |
| P0-4 | **No native build has been exercised on a real device.** Auth, offline, voice, deep links and the six screenshot scenes are all untested outside the Simulator build.                                                                                                  | Owner, with an agent for the checklist | P0-1 to P0-3                                                                                    | The `MOBILE_AUTH_SETUP.md` device steps, plus a pass through all six tabs, sign-out, and in-app **Delete account** on a throwaway user                                                  | device             |

### P1 — blocks public beta or store review

| #    | Blocker                                                                                                                                                                                                                                                                                                                                                                                                            | Owner / agent                                | Prerequisite                                                    | Verification                                                                                                                                                 | Needs                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| P1-1 | **Counsel review of the Privacy Policy and Terms** (item 3), including international transfers, minimum age 13 and the AI clause. The 2026-10-03 policy version adds saved tutor conversations.                                                                                                                                                                                                                    | Owner + counsel                              | Final text (`PRIVACY_VERSION` `2026-10-03`)                     | Written sign-off; any edit lands as a PR that bumps `PRIVACY_VERSION`                                                                                        | counsel                   |
| P1-2 | **App Privacy and Data Safety forms not filled in the consoles.** The answers are now form-ready ("Form mapping" below) and the submitted build is fixed to match: `build:mobile` pins push, saved tutor conversations and the Sentry DSN off (test-guarded). Still open: the IP-address category, the AI-text "collected vs processed" question, and entering the forms.                                          | Owner (+ counsel on the two judgement lines) | A submitted build from `npm run build:mobile`                   | Each form line matches the build, re-read at submission. Console state: **owner confirmation required**                                                      | dashboard                 |
| P1-3 | ✅ **Fixed (#414).** The installed app is labelled "Deutsch Sprachschule" like the stores; `nativeDisplayName.test.js` pins it. Device home-screen label (may truncate at ~12 characters) still to be eyeballed in P0-4.                                                                                                                                                                                           | —                                            | —                                                               | Home-screen label on an iPhone and an Android phone                                                                                                          | device                    |
| P1-4 | **Sign in with Apple (Guideline 4.8).** The code is merged dark (`VITE_APPLE_AUTH_ENABLED`, pinned `false` in `build:mobile`). Still needed before the flag flips: Apple Services ID, key and Supabase provider; revoking the Apple token on account deletion (built; needs the `APPLE_*` Vercel variables, runbook step 4); Apple added to the privacy copy.                                                      | Owner (setup, copy), agent (revocation PR)   | `docs/AUTH_APPLE_OAUTH_RUNBOOK.md` steps 1–5                    | Runbook §Verify on an iPhone, including Hide My Email and a delete-account check in Apple ID settings                                                        | dashboard + code + device |
| P1-5 | ✅ **Fixed (#415).** `PrivacyInfo.xcprivacy` is bundled in the App target and `ITSAppUsesNonExemptEncryption` is `false`. Apple's verdict only shows on the first TestFlight upload.                                                                                                                                                                                                                               | —                                            | —                                                               | First upload shows no ITMS privacy or export-compliance warnings                                                                                             | device                    |
| P1-6 | **Screenshots do not exist.** Only the plan is tracked (`store-screenshot-plan.md`): 6 iPhone `1320×2868`, 6 iPad `2064×2752`, 6 Play `1080×1920`, one `1024×500` feature graphic. They must come from release-candidate native builds with a seeded fictional account.                                                                                                                                            | Owner (capture), agent (composite)           | P0-2 to P0-4; seeded account                                    | Every box in the plan's "Export and submission checks" ticked, sizes exact                                                                                   | device                    |
| P1-7 | **Listing and policy fields not entered in the consoles.** Privacy URL (items 4–5), deletion URL (item 6), age/content ratings, category, support contact. The three compliance routes now return their own static HTML (title, canonical and a `<noscript>` statement of the facts), so a crawler that does not run JavaScript sees the app name, developer and deletion steps; see `scripts/lib/legalShells.js`. | Owner                                        | P1-3                                                            | Open `/delete-account` signed out in a private window and read the app name; confirm in Play Console that the URL validates. **Owner confirmation required** | dashboard                 |
| P1-8 | **Public sign-up posture and Google OAuth status.** Closed-beta allowlist is off (BACKLOG #8), and the Google consent screen still shows `xcnnlczvxmuwcqwychox.supabase.co`. If the Google OAuth app is in "Testing", only listed test users can sign in.                                                                                                                                                          | Owner                                        | Decide open vs invite-only; Google Cloud → OAuth consent screen | A non-test Google account signs in on the production site. Publishing status: **owner confirmation required**                                                | dashboard                 |
| P1-9 | **Play Console closed-testing rule.** A personal developer account created after Nov 2023 must run a closed test with 12+ testers for 14 days before it may apply for production.                                                                                                                                                                                                                                  | Owner                                        | Account type                                                    | **Owner confirmation required** of the account type and the Play Console release dashboard                                                                   | dashboard                 |

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
   every line against the build you submit: the native build has **no
   Sentry DSN** (pinned empty in `build:mobile`) and **no Vercel Analytics**; if
   either changes, so do the answers.
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
| Crash data                                     | No (web only)                    | —                   | —                 | `build:mobile` pins `VITE_SENTRY_DSN` empty, so no local env file can add it (test-guarded). Re-answer if that pin is ever removed                                                         |
| IP address, user agent                         | Yes, server side                 | Yes                 | Security          | Supabase Auth sessions and the AI/abuse rate limiter (`rate_limits`) hold the IP. Neither form has a plain "IP address" type; see the form mapping below                                   |
| Audio                                          | Not by us                        | —                   | —                 | OS speech recognition; see item 11                                                                                                                                                         |

### Form mapping (re-read each form's wording at submission)

The submitted build is fixed by `npm run build:mobile`, which pins push, saved
tutor conversations and the Sentry DSN **off**. Under that contract these are
the answers; each line that changes needs its own pin removed in a PR first.

| Data                                              | Apple App Privacy (type, linked, purpose)                                                                         | Google Data safety (category, collected, shared)                                                                     |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Email address                                     | Contact Info → Email Address; linked; App Functionality                                                           | Personal info → Email address; collected; not shared                                                                 |
| Name                                              | Contact Info → Name; linked; App Functionality                                                                    | Personal info → Name; collected, optional; not shared                                                                |
| Profile picture                                   | User Content → Photos or Videos; linked; App Functionality                                                        | Photos and videos → Photos; collected, optional; not shared                                                          |
| User ID                                           | Identifiers → User ID; linked; App Functionality                                                                  | Personal info → User IDs; collected; not shared                                                                      |
| Problem reports                                   | User Content → Other User Content; linked; App Functionality                                                      | App activity → Other user-generated content; collected, optional; not shared                                         |
| Learning progress                                 | Usage Data → Product Interaction; linked; App Functionality                                                       | App activity → App interactions; collected; not shared                                                               |
| Text sent to AI (not stored by us)                | Not declared as collected if processed only in real time; **counsel confirms** (see table)                        | Same. Anthropic acts as a service provider, so "shared" is for counsel to settle                                     |
| IP address (security, rate limits)                | **Owner/counsel decision.** No exact type; the conservative choice is Other Data Types, linked, App Functionality | **Owner/counsel decision.** No exact category; the conservative choice is Device or other IDs, collected, not shared |
| Push token, saved tutor conversations, crash data | Not collected in the submitted build. Do not declare                                                              | Same                                                                                                                 |

Also set on Google: data is encrypted in transit (HTTPS only), users can
request deletion (in-app and `/delete-account`), and the account-deletion URL is
item 6. On Apple: tracking is **No** and the tracking-domains list is empty,
matching `ios/App/App/PrivacyInfo.xcprivacy`.

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
