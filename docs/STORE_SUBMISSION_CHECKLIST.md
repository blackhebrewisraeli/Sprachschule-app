# Store submission — owner checklist (sprachschule-app)

> **RELEASE GATE — DONE.** `legal_acceptances` was applied to production on
> 2026-09-30 at 14:36 UTC, before the terms-acceptance client merged (#382,
> 19:29 UTC). Verified read-only the same day: table, RLS, one read-own policy,
> no anon access, RPC callable by `authenticated` only.

Code alone does not make the app compliant. Each item below needs an account or
a judgement only the owner has. Tick them in order: several gate the next.

## Release status — 2026-10-09 (main `3aaf364c`)

The build number in the source says what the next upload will be called, not
that it was uploaded. Anything not under the first label is unproven.

**VERIFIED IN REPO** (tree, Git history, GitHub checks)

- Source version **1.0.1, build 7**: `package.json`, `android/app/build.gradle`
  (`versionName` / `versionCode`) and the iOS project (`MARKETING_VERSION` /
  `CURRENT_PROJECT_VERSION`); `scripts/release/version.test.js` fails on drift.
- Merged: #442 turned Apple sign-in on in `build:mobile` (2026-10-04); #447
  bumped to build 7 (2026-10-06); #448 put the Play lane on hold; #449 and #450
  landed the store-ready Terms and Privacy Policy, Apple copy included
  (`TERMS_VERSION` and `PRIVACY_VERSION` `2026-10-06`).
- `build:mobile` pins push, saved tutor conversations and the Sentry DSN off.
- Every check on `main` `3aaf364c` is green, including the iOS Simulator and
  Android debug builds. Neither is a store build.

**OWNER CONFIRMATION REQUIRED** (dashboard or device only)

- Whether 1.0.1 (7) was uploaded to App Store Connect, processed, and installs
  from TestFlight Internal Testing. The repo records uploads of (2)–(6) from
  the owner's local logs (P0-2); it holds no record of (7).
- Whether a signed build-7 `.aab` exists and the keystore is backed up (P0-3).
- The device pass on build 7 (P0-4) and the Apple §Verify run (P1-4).
- Console state: App Privacy (P1-2), listing fields (P1-7), screenshot review
  (P1-6), Google OAuth publishing status and the sign-up posture (P1-8), and
  the Apple Services ID, key and client-secret renewal date (P1-4).

**BLOCKED / EXTERNAL DEPENDENCY**

- **Google Play:** every Play Console step (upload, Internal and Closed
  Testing, Data Safety, listing, P1-9's 14-day closed test) waits for Play
  developer-account verification (on hold since 2026-10-06, below).
- **Counsel:** review of the Privacy Policy and Terms, plus the IP-address and
  AI-text form lines (P1-1, P1-2).
- **Apple:** processing, export-compliance and privacy verdicts appear only
  after an upload (P1-5); App Review only after submission.

## Play Console — ON HOLD (2026-10-06)

The Google Play lane is paused at the owner's request while Play Console
developer-account verification is incomplete. The hold covers the Play app and
Play App Signing setup, build 7 `.aab` upload, Internal/Closed Testing, Play
Data Safety and listing forms, screenshots, content rating, and production
access (P0-3, the Play portions of P1-2/P1-6/P1-7, and P1-9).

Resume only after Play Console reports the developer account and any required
physical-device verification as complete. Do **not** bump or rebuild solely
because verification is pending: build 7 (`versionCode` 7 on `main`) remains
the release candidate. Whether a signed build-7 `.aab` already exists is not
recorded here (owner confirmation required). TestFlight/iOS work, keystore backup, local Android builds, legal
review, and checks that do not require Play Console are not paused.

## Blocker matrix — audited 2026-10-05 (main `0223fde3`)

Rows P0-2, P0-3, P1-1 and P1-4, "At a glance" and the shortest path were
refreshed on 2026-10-09 (`3aaf364c`) for #447–#450; the rest is as audited.

The ranked view of everything below and in the companion docs. **Evidence**
labels: _repo_ = read from the tree or Git history; _prod-read_ = read-only
check on 2026-10-05 (GitHub checks, public HTTP, Supabase's public auth
settings, Vercel variable **names**; no values were read); _local_ = the
owner's Mac (`store-builds/ios/`, gitignored: the `ios:upload` logs and the
archives they sent); _owner confirmation required_ = only a dashboard or a
device can show it, so it is not assumed either way. Needs: **code**,
**dashboard** (external account), **device** (real iPhone/Android), **counsel**.

### At a glance

- **Done:** "Verified healthy" below, and P0-1, P1-3, P1-5, P2-3, P2-4. Sign in
  with Apple is switched on in `build:mobile` (#442).
- **Blocks internal testing:** a confirmed TestFlight install of build 7, the
  first build with Apple sign-in (P0-2), the Android upload (P0-3, on hold),
  and the device pass on both (P0-4).
- **Blocks public beta and store review:** P1-8 first (the sign-up allowlist
  turns away reviewers, unlisted testers and every Hide My Email address), then
  P1-4's device proof and privacy copy, P1-1 counsel, P1-2 / P1-7 forms, P1-6
  screenshot review and P1-9's closed-test clock.
- **Post-launch:** the P2 rows, and Premium and ads (Tracks B/C, `BACKLOG.md`
  owner action 14).
- **Who does what:** the Needs column. No repo work is known to be left before
  submission: the build-7 bump landed as #447 and the Apple privacy copy as
  #449/#450. Counsel's edits, if any, become a new PR.
- **Next action:** the owner confirms whether build 7 is in TestFlight, or
  uploads it (Shortest safe path, step 2), then starts the P0-4 device pass.

**Verified healthy, not blockers:** production has all 39 repo migrations by
name, including AI quota (`20261006120000`), usage retention (`20261007120000`)
and conversation history (`20261008120000`): Migration Drift is green on
`0223fde3` (2026-10-05), and every version equalled its filename on the
2026-10-03 read-only `list_migrations` (no migration was added since). CI, iOS
Simulator, Android debug APK, Xcode Cloud ("App | Default", which builds and
uploads nothing) and Uptime are green on `main`. `/`, `/privacy`, `/terms`,
`/delete-account` return 200 on `www.sprachschule-app.com` and the apex
308-redirects to `www` (re-checked 2026-10-05). Push stays off (`build:mobile`
pins `VITE_PUSH_ENABLED=false`). AI quota Track A (A1–A10) shipped in
#392–#400 and `AI_QUOTA_MODE` exists in Vercel Production; its value, `shadow`,
is owner-reported (values were not read). AI history is dark: `build:mobile`
pins it off and neither `AI_HISTORY_MODE` nor `VITE_AI_HISTORY_ENABLED` exists
in Vercel Production. The native Supabase callback is allow-listed. Anthropic
has a $10 monthly spend ceiling, auto-reload off, and alerts at $5 / $8 / $9
(owner-confirmed 2026-10-03). **No production-safety P0 was found.**

### P0 — blocks internal testing (TestFlight, Play Internal Testing) or production safety

| #    | Blocker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Owner / agent                          | Prerequisite                                                                                    | Verification                                                                                                                                                        | Needs              |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| P0-1 | ✅ **Dashboard configured; deep links verified on both platforms.** `com.sprachschule.deutsch://login-callback` is in Supabase Redirect URLs (owner screenshot, 2026-10-03). The iOS Simulator `openurl` check (2026-10-03) and the Android emulator `adb` check on the shrunk release build (2026-10-04) both open the **Sign-in cancelled** panel.                                                                                                                                                                                                                                                                                                                                                                       | —                                      | —                                                                                               | Real-device magic-link / Google return remain part of P0-4.                                                                                                         | device             |
| P0-2 | **Uploads work; build 7 is the first with Sign in with Apple, and its upload is not recorded.** _local_ (recorded 2026-10-05): `npm run ios:upload` logged "Upload succeeded" for 1.0.1 (2) at 02:22 on 2026-10-04, before #431 (sync and leagues off: never give it to testers), then for (3), (4), (5) and (6). All five archives have Apple sign-in compiled **off**: (6) was uploaded at 12:57, before #442 merged at 13:46. _repo_: `main` has been 1.0.1 (7) since #447 (2026-10-06). Whether (7) was uploaded: **owner confirmation required**. The paid team kept Team ID `XN53VLQT47`.                                                                                                                            | Owner (upload)                         | ✅ #442 and #447 on `main`                                                                      | Build 7 appears in TestFlight → Internal Testing and installs on the iPhone. Upload, processing, the tester group and the install: **owner confirmation required**  | dashboard + device |
| P0-3 | **Signed, shrunk `.aab` builds locally; backup and Play Console unverified.** Version 1.0.1; `versionCode` follows the shared build number (7 on `main` since #447). R8 shrinking is on (APK 6.8 → 3.7 MB) and the release APK was exercised on the Android 16 emulator on 2026-10-04: launch, tabs, the Google hand-off to the browser, the deep link. Gradle needs JDK 21 (`NATIVE_BUILD.md` §4). `keystore.properties` contents not read. Keystore backup and the Play upload are still open.                                                                                                                                                                                                                           | Owner (Android Studio)                 | Keystore outside the repo, backed up (`NATIVE_BUILD.md` §4); Play Console app; Play App Signing | `cd android && ./gradlew bundleRelease` writes a signed `.aab`; Play Console accepts it to Internal Testing. Backup and Play state: **owner confirmation required** | dashboard + device |
| P0-4 | **Real-device pass in progress; finish it on build 7.** Recorded: on an iPhone with an Xcode install (2026-10-03) the magic link opens the app and signs in ✅. Owner reports fixed since: signing out and back in on the iPhone reopened the placement test (#438, in build 5); the sign-in sheet stayed open after a native Google sign-in on the iPhone 17 Simulator (#440, in build 6). Still to do on build 7 or later: Google and Apple on the iPhone, Google and the magic link on Android, all six tabs, sign out and back in, in-app Delete account on a throwaway user, the home-screen label (P1-3). An unlisted tester gets server errors once signed in (P1-8): test as a guest or add them to the allowlist. | Owner, with an agent for the checklist | P0-2 (build 7); P0-3 for Android                                                                | The `MOBILE_AUTH_SETUP.md` device steps, plus a pass through all six tabs, sign-out, and in-app **Delete account** on a throwaway user                              | device             |

### P1 — blocks public beta or store review

| #    | Blocker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Owner / agent                                      | Prerequisite                                                    | Verification                                                                                                                                                                 | Needs                        |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| P1-1 | **Counsel review of the Privacy Policy and Terms** (item 3), including international transfers, minimum age 13, the AI clause and the Apple sign-in wording P1-4 needs. The 2026-10-03 policy version added saved tutor conversations; the 2026-10-06 version (#449/#450) added Apple sign-in, the rights and Children sections, and the emailed-deletion route.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Owner + counsel                                    | Final text (`PRIVACY_VERSION` `2026-10-06`)                     | Written sign-off; any edit lands as a PR that bumps `PRIVACY_VERSION`                                                                                                        | counsel                      |
| P1-2 | **App Privacy and Data Safety forms not filled in the consoles.** The answers are now form-ready ("Form mapping" below) and the submitted build is fixed to match: `build:mobile` pins push, saved tutor conversations and the Sentry DSN off (test-guarded). Sign in with Apple is in the build since #442; it supplies an email address (possibly an Apple private relay address) and optionally a name, which the Email and Name lines already cover. Still open: the IP-address category, the AI-text "collected vs processed" question, and entering the forms.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Owner (+ counsel on the two judgement lines)       | A submitted build from `npm run build:mobile`                   | Each form line matches the build, re-read at submission. Console state: **owner confirmation required**                                                                      | dashboard                    |
| P1-3 | ✅ **Fixed (#414).** The installed app is labelled "Deutsch Sprachschule" like the stores; `nativeDisplayName.test.js` pins it. Device home-screen label (may truncate at ~12 characters) still to be eyeballed in P0-4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | —                                                  | —                                                               | Home-screen label on an iPhone and an Android phone                                                                                                                          | device                       |
| P1-4 | **Sign in with Apple (Guideline 4.8): on in `build:mobile` since #442, not yet proven.** _prod-read_: Supabase lists the Apple provider as enabled, and `APPLE_SERVICES_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` exist in Vercel Production. The Apple Developer Services ID and key are owner-stated in #442; they, and a calendar date for renewing the client-secret JWT (it expires within six months), need **owner confirmation**. Still open: (a) a confirmed upload of build 7, the first build that contains it (P0-2); (b) runbook §Verify on an iPhone, including Hide My Email and the Apple ID check after Delete account, which needs P1-8 first, because a relay address can never be on the allowlist; (c) ✅ Apple copy for the Privacy Policy and the deletion page merged in #449/#450 (`PRIVACY_VERSION` `2026-10-06`); counsel's read stays under P1-1; (d) compare the button with Apple's official artwork. Submitting without it is a likely Guideline 4.8 rejection; see `store-metadata/app-review-notes.md`.                                 | Owner (device; copy with counsel), agent (copy PR) | P0-2 (build 7); P1-8; `docs/AUTH_APPLE_OAUTH_RUNBOOK.md`        | Runbook §Verify on an iPhone, including Hide My Email and a delete-account check in Apple ID settings; Vercel logs show no `Apple token NOT revoked`                         | dashboard + device + counsel |
| P1-5 | ✅ **Fixed (#415).** `PrivacyInfo.xcprivacy` is bundled in the App target and `ITSAppUsesNonExemptEncryption` is `false`. Apple's verdict only shows on the first TestFlight upload.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | —                                                  | —                                                               | First upload shows no ITMS privacy or export-compliance warnings                                                                                                             | device                       |
| P1-6 | **Screenshots: automated and current (2026-10-04), owner review left.** `npm run screenshots:capture` produces the iPhone `1320×2868`, iPad `2064×2752` and Play `1080×1920` sets plus the `1024×500` feature graphic from the native release-candidate apps (Simulator / emulator), seeded with a fictional guest and verified for exact size and no alpha; see the plan's "Automated capture". Scene 5 (league) needs the fictional signed-in account and is captured by hand. IPA renders correctly on every platform since the font fix (#427).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Agent (pipeline), owner (review, scene 5, upload)  | P0-2 / Play Console for upload; fictional account for scene 5   | `store-screenshots/REPORT.md` all `ok`; owner ticks the review boxes in it                                                                                                   | device                       |
| P1-7 | **Listing and policy fields not entered in the consoles.** Privacy URL (items 4–5), deletion URL (item 6), age/content ratings, category, support contact. The three compliance routes now return their own static HTML (title, canonical and a `<noscript>` statement of the facts), so a crawler that does not run JavaScript sees the app name, developer and deletion steps; see `scripts/lib/legalShells.js`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Owner                                              | P1-3                                                            | Open `/delete-account` signed out in a private window and read the app name; confirm in Play Console that the URL validates. **Owner confirmation required**                 | dashboard                    |
| P1-8 | **The sign-up allowlist blocks review and external testers.** _prod-read_: `SIGNUP_EMAIL_ALLOWLIST` and `VITE_SIGNUP_EMAIL_ALLOWLIST` are set on Vercel Production and Preview (the client list holds two addresses, read from the live bundle on 2026-10-04), so the website is invite-only. Native builds do not carry the client list, but they call the same server (`VITE_API_BASE_URL`), where `requireAuth` and `resolveCaller` answer `signup_not_allowed` to any unlisted verified email. So an App Reviewer, a Hide My Email Apple account or an unlisted tester can sign in on the phone, and then every account, progress, league and AI call fails, Delete account included (BACKLOG #8). Pick one posture before P1-4's device check, P1-9 and submission: open (remove both variables, redeploy), or invite-only with every tester listed, which is fine for internal testing but cannot pass review. Separately, the Google consent screen still shows `xcnnlczvxmuwcqwychox.supabase.co`, and if the Google OAuth app is in "Testing", only listed test users can sign in. | Owner                                              | Decide open vs invite-only; Google Cloud → OAuth consent screen | An unlisted Google account and a Hide My Email Apple account each sign in on the iPhone and can delete themselves. Google publishing status: **owner confirmation required** | dashboard                    |
| P1-9 | **Play Console closed-testing rule.** A personal developer account created after Nov 2023 must run a closed test with 12+ testers for 14 days before it may apply for production.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Owner                                              | Account type                                                    | **Owner confirmation required** of the account type and the Play Console release dashboard                                                                                   | dashboard                    |

### P2 — post-launch polish

| #    | Item                                                                                                                                                                                                                                                                                                         | Owner / agent | Prerequisite                                | Verification                                                           | Needs              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | ------------------------------------------- | ---------------------------------------------------------------------- | ------------------ |
| P2-1 | **Push, iOS half.** Android has `google-services.json` committed (#374). iOS lacks the Push capability and `.entitlements`, `GoogleService-Info.plist` and the FirebaseMessaging package; APNs key, `FIREBASE_SERVICE_ACCOUNT`, `PUSH_CRON_SECRET`, pg_cron/pg_net and the device smoke test are all undone. | Owner         | `MOBILE_PUSH_SETUP.md` §2–§6, in that order | §6 smoke test steps 1–7 on both phones; then the item 9 release commit | dashboard + device |
| P2-2 | **AI history release.** Merged and dark (H1–H6, #405–#411); neither switch exists in Vercel Production (2026-10-05). Waits for the shadow-week review (~2026-10-09/10), then the owner runs the runbook. Native builds get it only with the flag baked in, and the store forms must be updated first (P1-2). | Owner         | `AI_HISTORY_RELEASE_RUNBOOK.md` §0          | Runbook §3 smoke test, §4 purge check                                  | dashboard          |
| P2-3 | ✅ **Sentry source maps upload on production web builds.** `SENTRY_AUTH_TOKEN` exists in Vercel Production, and the build log of `0223fde3` (2026-10-04) shows "Uploaded files to Sentry" for that release. Native builds ship no DSN, so they need none.                                                    | —             | —                                           | Next production build log has no `SENTRY SOURCE-MAP UPLOAD FAILED`     | dashboard          |
| P2-4 | ✅ **CI tracks the custom domain.** Uptime and both native CI builds now use `www.sprachschule-app.com`; docs keep `deutsch-app-dusky.vercel.app` as the allow-listed provider fallback on purpose.                                                                                                          | —             | —                                           | Next scheduled Uptime run green against `www`                          | code               |
| P2-5 | Leaked-password advisor (no passwords exist, `PRE_BETA_OWNER_CHECKLIST.md` §7), Universal/App Links, GitHub sign-in on web (item 13), in-app wordmark rename (item 14).                                                                                                                                      | Owner / agent | —                                           | —                                                                      | mixed              |

### Account deletion and export coverage (verified from `api/_lib/accountEndpoints.js`)

In-app **Delete account** revokes the Apple token first for an Apple account
(#419), then removes the avatar folder, then the user, and every user-owned
table cascades. Export maps `legal_acceptances`, `ai_conversations` and
`ai_messages` (paged) and deliberately omits `user_devices` (push tokens are
device credentials, with the reason recorded in code). `delete.test.js` and
`export.test.js` cover both. Web `/delete-account` exists for Google's
external-deletion requirement. Gap: none found in code. The device pass in P0-4
is the proof, and while the allowlist is on, an unlisted account cannot reach
either endpoint (P1-8).

### Shortest safe path (ordered by dependency, 2026-10-05)

**Internal testing**

1. ✅ **Agent:** `npm run release:bump` to build 7, landed as #447
   (2026-10-06). It is the first build with Apple sign-in, and App Store
   Connect already holds 6.
2. **Owner:** `npm run ios:upload` from that `main`, TestFlight → Internal
   Testing, install on the iPhone (P0-2). Not recorded in the repo: **owner
   confirmation required**.
3. ⏸ **Play on hold:** back up the keystore now if needed, but wait for account
   verification before creating/configuring the Play app, Play App Signing or
   uploading build 7's `.aab` (P0-3).
4. **Owner, with an agent's checklist:** the P0-4 device pass on those builds.

**Public beta and store review**

5. **Owner, decide now:** the P1-8 sign-up posture, and publish the Google
   consent screen. It gates step 6, every external tester and the reviewer.
6. **Owner, on the iPhone:** P1-4 runbook §Verify on build 7 (Hide My Email,
   deletion revokes the token).
7. **Owner and counsel, start today:** P1-1, including the Apple wording. It is
   the longest wait nobody here controls. The Apple wording is already in
   (#449/#450); an agent lands any counsel edits with a `PRIVACY_VERSION` bump.
8. **Owner, in the consoles:** App Store forms and screenshot review may
   continue. The Play portions of P1-2, P1-6 and P1-7, plus P1-9's 12-tester,
   14-day closed test, stay on hold until verification completes.
9. **Submit:** iOS may continue with `store-metadata/app-review-notes.md`;
   Android stays on hold, then follows the P1-9 clock. Keep push, Premium, ads
   and saved conversations out of the submitted build so the forms stay true.

**Post-launch:** the P2 rows; AI history after the shadow-week review (P2-2);
Premium and ads after decisions D1 and D3–D5 and Vercel Pro (`BACKLOG.md` owner
action 14).

**Repo work left before submission:** none known. Step 1 landed as #447; a
counsel-edit PR in step 7 only if counsel changes the text. Everything else is
owner, dashboard, device or counsel work.

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
      to write from that address or to delete in the app. **Apple Hide My
      Email:** a relay address (`…@privaterelay.appleid.com`) cannot send, so
      the page lets these learners write from any address and quote the relay.
      Search for the relay address, then email it asking them to reply to
      confirm; Apple forwards it to their real inbox. Delete only after they
      reply.
   2. Copy the user's **User UID**.
   3. Storage → `avatars` → delete the folder named with that UID, if there is
      one. Do this first: once the user is gone, nothing records which folder
      was theirs.
   4. Authentication → Users → that user → **Delete user**. Every table holding
      their data references the user with `on delete cascade`, so this removes
      the rest, as the in-app Delete account button does. One difference: an
      emailed deletion cannot revoke the learner's Apple token (only the app
      holds it), which the page says; Apple learners remove the app in their
      Apple Account settings.
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
11. ✅ **Voice input is off in the native app** (2026-10-03). `ChatInput` hides
    the mic when `isNativeApp()` or when the browser has no speech recognition:
    Android's WebView has none, and iOS kills an app that reaches the
    microphone without `NSMicrophoneUsageDescription` /
    `NSSpeechRecognitionUsageDescription`. So the native build never asks for
    the mic and declares no Audio Data. To ship voice on native, add both
    Info.plist strings, update the App Privacy / Data Safety answers, and lift
    the gate in one PR.
12. Confirm Vercel still documents Web Analytics and Speed Insights as
    cookieless (the policy says so).
13. Decide whether GitHub sign-in should be on for the web
    (`VITE_GITHUB_AUTH_ENABLED` is unset in Vercel Production; the policy
    mentions GitHub because the apps use it).
14. Decide whether the in-app "Deutsch." wordmark and the rendered
    `public/social-preview.png` follow the new name. Both were left alone on
    purpose: the wordmark sits in a header whose 320px budget has ~10px of
    slack, so a longer name is a layout change, not a rename.
15. Update the production-side copies of the brand (owner-only settings). The
    Magic Link email is done: re-pasted 2026-10-03, keeping "Deutsch ·
    Sprachschule" by owner choice (#424). Still open: the Google OAuth
    consent-screen app name
    (`docs/AUTH_GOOGLE_OAUTH_RUNBOOK.md`); the GitHub OAuth application name
    (`docs/AUTH_GITHUB_OAUTH_RUNBOOK.md`); and the App Store Connect / Play
    Console app name.

## Identifiers that keep the old name (by design)

The product is `sprachschule-app`, and the contact address is
`sprachschule.support@gmail.com`. The GitHub repository has since been renamed
to `blackhebrewisraeli/Sprachschule-app` (the old `deutsch-app` URL redirects).
These stable identifiers were NOT renamed, because renaming them needs a
migration or infrastructure change:

| Identifier                          | Value                                         | Why it stays                                                                  |
| ----------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------- |
| SonarCloud project key              | `blackhebrewisraeli_deutsch-app`              | `sonar-project.properties` and the SonarCloud project must change together    |
| Public production origin            | `www.sprachschule-app.com`                    | Supabase redirect allow-list, `build:mobile`, policy URL in the stores        |
| Vercel fallback URL                 | `deutsch-app-dusky.vercel.app`                | Provider-owned alias retained for rollback and diagnostics                    |
| Supabase project                    | `Sprachschule` (`xcnnlczvxmuwcqwychox`)       | Project ref is baked into every client                                        |
| Bundle / application ID, URL scheme | `com.sprachschule.deutsch`                    | Changing it makes a different app in both stores and breaks the auth callback |
| localStorage keys                   | `deutsch-app-*` (incl. `deutsch-app-legal-*`) | AGENTS.md: never rename or migrate a storage key                              |
| Admin / allowlist identity          | `esterkinshimon712@gmail.com`                 | Authorization, not contact — `api/_lib/roles.js`                              |
| Sentry project                      | `javascript-react` (org `blackhebrewisraeli`) | Event history and alert rules                                                 |
