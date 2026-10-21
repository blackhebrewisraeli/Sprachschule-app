# Store submission — owner checklist (sprachschule-app)

> **RELEASE GATE — DONE.** `legal_acceptances` was applied to production on
> 2026-09-30 at 14:36 UTC, before the terms-acceptance client merged (#382,
> 19:29 UTC). Verified read-only the same day: table, RLS, one read-own policy,
> no anon access, RPC callable by `authenticated` only.

Code alone does not make the app compliant. Each item below needs an account or
a judgement only the owner has. Tick them in order: several gate the next.

## Release status — 2026-10-18 (release source `a8c71353`; main `1eab4623`)

This is the current status and supersedes the 2026-10-09 Play hold. Each
external claim names its evidence; the repository alone cannot prove an
upload, dashboard state or device result.

The build number in the source says what the next upload will be called, not
that it was uploaded. Anything not under the first label is unproven.

**VERIFIED IN REPO** (tree, Git history, GitHub checks)

- Source version **1.0.1, build 9**: `package.json`, `android/app/build.gradle`
  (`versionName` / `versionCode`) and the iOS project (`MARKETING_VERSION` /
  `CURRENT_PROJECT_VERSION`); `scripts/release/version.test.js` fails on drift.
- Merged: #488 routes native pronunciation through the OS text-to-speech
  engine; #489 improves the no-audio notice; #490 bumps the shared build number
  to 9; #491 prevents the native app from serving an older cached web build.
- `build:mobile` pins push, saved tutor conversations and the Sentry DSN off.
- Re-checked locally on 2026-10-18 from `a8c71353`: 5,230 Vitest tests, ESLint,
  Prettier, the Vite production build, Android unit tests, Android release lint
  and `:app:bundleRelease` all passed. The signed AAB manifest reports package
  `com.sprachschule.deutsch`, version `1.0.1` and `versionCode` 9.

**VERIFIED ANDROID ARTIFACTS / PLAY TRACKS** (local artifact audit, owner
screenshots and read-only Play Console check, 2026-10-17/18)

| Build                 | Local AAB SHA-256 | Internal Testing | Closed Testing – Alpha |
| --------------------- | ----------------- | ---------------- | ---------------------- |
| 1.0.1 (8)             | `ba655390…682bce` | superseded by 9  | superseded by 9        |
| 1.0.1 (9) – audio fix | `633a53aa…916786` | active           | active                 |

- Both AABs use the same upload key (certificate SHA-256 starts
  `02:81:4D:93`). Build 8's artifact is retained under
  `android/app/release/build8/`.
- A tester updating from Build 8 must fully close and reopen the app once:
  Build 8's service worker can serve its old code on the first launch. #491
  prevents that on later updates.

**VERIFIED IN PLAY CONSOLE / ON DEVICE** (owner screenshots and confirmation,
plus a read-only console check on 2026-10-18)

- Google Play Internal Testing shows **Build 9 - audio fix** as active and
  available to internal testers. The Play Store displays the Internal Early
  Access listing, the release notes and an installed **Open** state.
- Build 9 is installed on a physical Samsung Android device. After fully
  closing and reopening the app, the owner confirmed audible pronunciation in
  both **Vokabeln** and **Alphabet**. The Android audio regression is closed.
- Publishing overview has no unpublished changes and says the app was last
  published on 2026-10-17. App content says **You're all caught up**: no policy
  declaration needs attention.
- Closed Testing – Alpha serves **Build 9 - audio fix**. The selected
  `Internal testers` email list contains two users; the production-access
  dashboard reports **0 testers currently opted-in**. The feedback field is
  empty.
- **2026-10-18, owner-approved in chat:** Build 9 was promoted from Internal
  to Closed Testing – Alpha. The release includes bundle 9 only, rolls out to
  100% and keeps the release notes from Internal. Its only warning is the known
  native debug symbols one. Publishing overview held exactly that one change
  and shows it as **Changes in review**. Managed publishing is off, so it goes
  live on approval. **Approved and live the same day** (read-only check):
  Publishing overview says last published 2026-10-18 with no pending changes,
  and the Alpha track shows Build 9 as "Available to selected testers",
  version code 9, released 2026-10-18 3:53 PM.
- The production-access requirement definitely applies to this account: Play
  requires at least 12 testers opted in continuously for 14 days.
- The local App Store Connect upload record proves that iOS 1.0.1 (7) uploaded
  successfully on 2026-10-06. The TestFlight app on this Mac shows build 7 **In
  Testing**, installed and openable, released 2026-10-06 and expiring
  2027-01-04. This does not prove an iPhone install or device pass.
- **iOS 1.0.1 (9) uploaded 2026-10-18** (agent, owner-approved in chat). The
  archive was built from `main` `1834c6d1`, whose code matches the Android
  Build 9 source `a8c71353` (only docs differ). It records bundle
  `com.sprachschule.deutsch`, 1.0.1 (9) and Team `XN53VLQT47`, and has
  `TextToSpeechPlugin` registered. The export used `ios:upload`'s options.
  `xcodebuild` reported `Upload succeeded`, Delivery UUID `08d759a2…b94a`,
  with no ITMS warning. **Verified 2026-10-19 in the TestFlight app on this
  Mac:** build 9 is processed and available as an update in Internal Testing,
  version 1.0.1 (9), released 2026-10-18 and expiring 2027-01-16. An iPhone
  install and device pass are **not yet verified**.

**OWNER CONFIRMATION REQUIRED** (dashboard or device only)

- Whether the Android release keystore is backed up (P0-3).
- The remaining Android auth/account checks, an iPhone install of the current
  release candidate, the iOS device pass and the Apple §Verify run (P0-4,
  P1-4). The previously recorded Android learning/progress checks must not be
  repeated; see "Completed manual checks" below.
- Apple App Privacy and App Store listing state, the final screenshot review,
  opening sign-up before the first store submission (P1-8, decided
  2026-10-19), what Play Console's App access text currently says, and the
  Apple Services ID, key and client-secret renewal date (P1-4). Google OAuth
  was checked on 2026-10-18: **In production**, External, no sensitive scopes
  (`docs/AUTH_BETA_ALLOWLIST_RUNBOOK.md`, "Adding beta testers").

**BLOCKED / EXTERNAL DEPENDENCY**

- **Google Play production access:** Closed Testing serves Build 9, but it
  has 0 of the required 12 opted-in testers. The 14-day clock has not
  started.
- **Counsel:** review of the Privacy Policy and Terms, plus the IP-address and
  AI-text form lines (P1-1, P1-2).
- **Apple:** build 9 is processed and available in TestFlight Internal
  Testing. It still needs iPhone installation and the current privacy/listing
  verdicts. App Review only starts after submission.

## Current next actions — no-repeat queue (audited 2026-10-20)

This is the canonical short queue. Earlier build-7/build-8 instructions below
are historical evidence, not permission to repeat completed work.

1. **Before inviting outside testers:** paste the hosted Confirm signup email
   template and verify one new invited account receives both a code and a link.
   In parallel, finish the Resend DPA and counsel review. The policy already
   names Resend: #499 merged on 2026-10-19 and the same day's Production
   deployment serves it (`PRIVACY_VERSION` `2026-10-19`, so every signed-in
   user re-accepts once). It shipped before the review it was meant to wait
   for. Counsel now reviews the live wording against the seven points in
   #499's description. Any change they ask for needs another
   `PRIVACY_VERSION` bump and another re-accept. These are the two recorded
   closed-beta follow-ups, not new work.
2. ✅ **Closed Android track:** Closed Testing Alpha serves **Build 9 - audio
   fix** (approved and live 2026-10-18). Recruiting can start.
3. **Start the Play clock:** grow the selected list from 2 to at least 12
   Google accounts. For testers who will sign in, add each sign-in address to
   the allowlist table **and** to `SIGNUP_EMAIL_ALLOWLIST`
   (`docs/AUTH_BETA_ALLOWLIST_RUNBOOK.md`, "Adding beta testers"). Then add the
   support feedback address and send the web opt-in link
   `https://play.google.com/apps/testing/com.sprachschule.deutsch`, and verify
   the dashboard reaches at least 12 opted-in testers. Keep at least 12 opted
   in continuously for 14 days, then apply for production access.
4. **Finish only the unproven device checks:** Android Google and magic-link
   return, sign out/in, Chat send, and Delete account on a throwaway user; iOS
   Google, Apple (including Hide My Email), magic link, sign out/in, all six
   tabs and Delete account. Do not repeat the Android learning/progress/audio
   checks recorded below.
5. **Bring iOS to the current candidate:** build 9 is processed and available
   in TestFlight Internal Testing. Install it on the iPhone. Do not upload
   build 9 again.
6. **Store review:** complete the Apple App Privacy/listing fields, final asset
   review and counsel sign-off. Then open sign-up (P1-8, decided 2026-10-19:
   `docs/AUTH_BETA_ALLOWLIST_RUNBOOK.md`, "Opening sign-up at launch"). Submit
   only after the device passes above and that runbook's never-listed sign-up
   and delete check.
7. ✅ **Optional Google account chooser (#502).** Merged 2026-10-19 as
   `df8a31d3`. It adds `prompt=select_account` to Google OAuth on web and
   native so a previous Google session cannot silently choose the wrong
   account on a shared device. The web has it: the Production deployment of
   `8097c924` (2026-10-20) includes it. Native Build 9 was built before it
   merged, so the apps get it with the next native build. It does not replace
   or unblock any owner, device, dashboard or counsel action above.
8. ✅ **Launch hardening, non-blocking: main bundle under 500 kB (#503).**
   The web entry chunk is 483.78 kB raw / 154.33 kB gzip, down from 515.51,
   and Vite's 500 kB warning is gone. The first-Vocab path still makes 3 page
   JS loads. Settings now ships in the lazy Profile chunk, and CI fails any
   build whose entry reaches 500,000 bytes (`npm run check:bundle-budget`).
   Repo-only and verified by build and smoke. It needs no owner, device or
   dashboard step, and it does not change or unblock items 1–6.

### Completed manual checks — do not ask for these again

- Android Build 8 installed from Play and opened on a physical Samsung phone.
  The owner completed a 10-word vocabulary deck; XP moved 835 → 1000; the
  daily goal, streak and quests updated; leagues, achievements and activity
  loaded; progress survived a full reopen; and bottom content cleared the
  Android navigation bar.
- The Build 8 Android audio failure was reproduced, fixed by #488/#491, shipped
  in Build 9, and then verified after a full close/reopen in both Vokabeln and
  Alphabet. It is closed.
- Emulator coverage already includes guest onboarding and placement, all six
  tabs, vocabulary grading and XP, restart persistence, offline grading, and
  320px/375px layout. Repeat only a real-device item named in action 4.
- Play's advertising-ID declaration is **No**; the 14 pending setup changes
  were submitted and published; App content currently reports no item needing
  attention. Do not redo the Play setup questionnaire.

## Closed beta and database — 2026-10-14, re-checked 2026-10-15 (main `719792ed`)

Evidence and the full list: `docs/AUTH_BETA_ALLOWLIST_RUNBOOK.md`, "Production
state — 2026-10-14" and its 2026-10-15 re-check. No address is recorded in
either file.

**VERIFIED IN REPO**

- 47 migrations in `supabase/migrations/` on `719792ed`, counted from the tree.
  On 2026-10-14 there were 41. #463 and #466–#470 added one each; #464, #465,
  #471 and #472 added none.
- #472 wires the **Confirm signup** email to the same code-and-link template as
  Magic Link (`supabase/config.toml`, `src/authEmailTemplates.test.js`). That
  file configures only the local stack; hosted Auth needs a dashboard paste
  (below).

**VERIFIED IN PRODUCTION**

- Postgres was upgraded on 2026-10-14. The project is `ACTIVE_HEALTHY` on
  `17.11.0.003`.
- The closed-beta hook, the three-row allowlist and the `profiles` write
  lockdown were re-checked after the upgrade on 2026-10-14 and were unchanged.
  They were not re-checked on 2026-10-15.
- 2026-10-15, read-only `list_migrations`: production lists 47 migrations,
  identical to the repository by version and name. Migration Drift run
  `38736350948` (scheduled, on `7794b963`) "compared 47 repo migration(s)
  against 47 applied" and passed. `719792ed` changed no migration. Uptime run
  `38724294155` passed on 2026-10-15.
- `VITE_SIGNUP_EMAIL_ALLOWLIST` is absent from Vercel. Four unwanted accounts
  are banned until 2026-11-13, not deleted.
- Custom SMTP through Resend is live, and its sending domain is verified.
- The live security advisors on 2026-10-15 are unchanged: five SECURITY DEFINER
  warnings and leaked-password protection.
- The live performance advisor on 2026-10-15:
  - The unindexed foreign key on `feedback.handled_by` is gone (#463).
  - The 14 `auth_rls_initplan` warnings are gone (#466–#470, on the #465
    baseline; #471 strengthened a test).
  - Seven INFO `unused_index` findings remain: the six from 2026-10-14, plus
    the new `feedback_handled_by_idx`, which the plan expected. They wait for
    the read-only observation O1, no earlier than 2026-11-13.

**OWNER CONFIRMATION REQUIRED**

- **Not done (owner-only):** paste the template into the hosted **Confirm
  signup** template, then check that a new invited tester receives a working
  one-time code and link (`docs/AUTH_EMAIL_TEMPLATE_RUNBOOK.md`, "Verify:
  Confirm signup"). Until then, a first-time native or installed-PWA tester
  gets no code.
- The **Continue as guest** control on the denial landing (runbook 6c).
- The value of `SIGNUP_EMAIL_ALLOWLIST`, a Vercel Secret in Production and
  Preview.
- The deletion review of the four banned accounts, around 2026-10-21.

**BLOCKED / EXTERNAL DEPENDENCY**

- ~~The Privacy Policy must name Resend before any outside tester joins.~~
  Done: #499 names Resend and set `PRIVACY_VERSION` to `2026-10-19`; it is
  live in Production since 2026-10-19. The Resend DPA and counsel's review of
  that wording remain (item 2 under "Before merging the terms-acceptance PR").

## Play Console — hold lifted (2026-10-18)

The 2026-10-06 hold is lifted. Track state and the Build 9 device check live
only in the 2026-10-18 release status at the top.

Still open on the Play lane: confirm the release-keystore backup; finish the
rest of the P0-4 real-device pass; finish the tester-readiness items above; grow the cohort from 2 listed / 0
opted in to at least 12 opted in; keep that level for 14 continuous days; and
review every uploaded listing asset before applying for production access.

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

- **Done:** "Verified healthy" below, P0-1, the iOS build-7 upload, the Android
  Build 9 Internal Testing upload and audio proof, Build 9 live on Closed
  Alpha, the iOS build-9 upload, Play App content/setup
  declarations, P1-3, P1-5, P2-3 and P2-4. Sign in with Apple is switched on in
  `build:mobile` (#442).
- **Blocks starting the external closed-beta cohort cleanly:** hosted Confirm
  signup template verification, the Resend DPA and counsel review of the
  already-live Resend disclosure (#499), and at least 12 real Google accounts. Closed Alpha serves Build 9 with 2 listed / 0
  opted-in testers.
- **Blocks public release/store review:** opening sign-up (P1-8); the
  remaining device-auth and account deletion checks; P1-4's Apple proof; P1-1
  counsel; Apple App Privacy/listing forms; the final screenshot review; and P1-9's 12-tester/14-day clock.
- **Post-launch:** the P2 rows, and Premium and ads (Tracks B/C, `BACKLOG.md`
  owner action 14).
- **Who does what:** the Needs column. No release-blocking repo edit is known:
  the Resend privacy disclosure shipped as #499. A counsel-requested change to
  it would be the next one. Everything else is owner, dashboard, device or
  counsel work.
- **Next action:** complete the tester-readiness pair, then invite the cohort
  to Closed Alpha (it serves Build 9).

**Verified healthy, not blockers:** production had all 39 repo migrations by
name on 2026-10-05 (47 of 47 on 2026-10-15, "Closed beta and database" above),
including AI quota (`20261006120000`), usage retention (`20261007120000`)
and conversation history (`20261008120000`): Migration Drift is green on
`0223fde3` (2026-10-05), and every version equalled its filename on the
2026-10-03 read-only `list_migrations` (no migration was added between that
read and this 2026-10-05 audit). CI, iOS
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

| #    | Blocker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Owner / agent                          | Prerequisite                            | Verification                                                                                                                             | Needs              |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| P0-1 | ✅ **Dashboard configured; deep links verified on both platforms.** `com.sprachschule.deutsch://login-callback` is in Supabase Redirect URLs (owner screenshot, 2026-10-03). The iOS Simulator `openurl` check (2026-10-03) and the Android emulator `adb` check on the shrunk release build (2026-10-04) both open the **Sign-in cancelled** panel.                                                                                                                                                                                                                                                                                                                                                | —                                      | —                                       | Real-device magic-link / Google return remain part of P0-4.                                                                              | device             |
| P0-2 | **iOS build 9 is processed and available in TestFlight Internal Testing.** It was uploaded 2026-10-18 from `main` `1834c6d1` (Delivery UUID `08d759a2…b94a`). The TestFlight app on this Mac shows 1.0.1 (9), released 2026-10-18, expiring 2027-01-16 and available as an update. Build 7 was the first uploaded build with Apple sign-in; its upload, processing and Mac install are historical and must not be repeated.                                                                                                                                                                                                                                                                         | Owner (iPhone)                         | —                                       | Install build 9 from TestFlight on the iPhone.                                                                                           | device             |
| P0-3 | **Android Build 9 is signed, accepted and proven in Internal Testing; backup remains.** Local release checks passed; Play serves Build 9 internally; the owner installed it on a physical Samsung phone and verified native pronunciation. Closed Alpha serves Build 9 (live 2026-10-18). The release-keystore backup is the only unverified build-integrity item.                                                                                                                                                                                                                                                                                                                                  | Owner                                  | Keystore outside the repo and backed up | Owner confirms the backup; Play Closed Alpha serves Build 9. Internal upload and audio proof are complete.                               | dashboard + device |
| P0-4 | **Real-device pass in progress; do not restart it.** Android physical-device learning/progress/persistence and Build 9 audio are complete (details in "Completed manual checks"). Emulator coverage includes all six tabs, offline and narrow layouts. Still open on Android: Google and magic-link return, sign out/in, Chat send, home-screen label and in-app Delete account on a throwaway user. On iOS, an earlier Xcode install proved magic-link return; the current candidate still needs TestFlight build 9, Google, Apple/Hide My Email, all six tabs, sign out/in, label and Delete account. An unlisted tester is refused by P1-8: test as a guest or add the address to the allowlist. | Owner, with an agent for the checklist | P0-2 (build 9); P0-3 for Android        | Run only the remaining checks named here and the Apple runbook §Verify; do not repeat the recorded Android learning/progress/audio pass. | device             |

### P1 — blocks public beta or store review

| #    | Blocker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Owner / agent                                     | Prerequisite                                                                                                                   | Verification                                                                                                                                                                                                                     | Needs                        |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| P1-1 | **Counsel review of the Privacy Policy and Terms** (item 3), including international transfers, minimum age 13, the AI clause and the Apple sign-in wording P1-4 needs. The 2026-10-03 policy version added saved tutor conversations; the 2026-10-06 version (#449/#450) added Apple sign-in, the rights and Children sections, and the emailed-deletion route; the 2026-10-19 version (#499) names Resend as the email provider and went live before counsel saw it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Owner + counsel                                   | Final text (`PRIVACY_VERSION` `2026-10-19`)                                                                                    | Written sign-off; any edit lands as a PR that bumps `PRIVACY_VERSION`                                                                                                                                                            | counsel                      |
| P1-2 | **Google Data Safety is actioned; Apple App Privacy remains unverified.** Play App content reports no declaration needing attention, and the submitted setup changes were published on 2026-10-17. The answers below remain the audited source for checking each store against the submitted build. Apple still needs dashboard confirmation. Counsel must still confirm the IP-address and real-time AI-text classifications before final store review or any policy edit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Owner (+ counsel on the two judgement lines)      | A submitted build from `npm run build:mobile`                                                                                  | Play remains all caught up; Apple App Privacy matches the build; counsel records the two classification decisions.                                                                                                               | dashboard + counsel          |
| P1-3 | ✅ **Fixed (#414).** The installed app is labelled "Deutsch Sprachschule" like the stores; `nativeDisplayName.test.js` pins it. Device home-screen label (may truncate at ~12 characters) still to be eyeballed in P0-4.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | —                                                 | —                                                                                                                              | Home-screen label on an iPhone and an Android phone                                                                                                                                                                              | device                       |
| P1-4 | **Sign in with Apple (Guideline 4.8): included and available in TestFlight, not yet proven on an iPhone.** `build:mobile` has enabled it since #442; build 9 is processed and available in TestFlight Internal Testing. Supabase lists the provider as enabled and the four `APPLE_*` variables exist in Vercel Production. Still open: confirm the Services ID, key and client-secret renewal date; run §Verify on an iPhone including Hide My Email and the Apple ID check after Delete account; compare the button with Apple's official artwork; retain counsel review of the merged Apple privacy copy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Owner (device; copy with counsel)                 | P0-2 (build 9); P1-8; `docs/AUTH_APPLE_OAUTH_RUNBOOK.md`                                                                       | Runbook §Verify on an iPhone; Vercel logs show no `Apple token NOT revoked`; renewal date recorded.                                                                                                                              | dashboard + device + counsel |
| P1-5 | ✅ **Fixed (#415).** `PrivacyInfo.xcprivacy` is bundled in the App target and `ITSAppUsesNonExemptEncryption` is `false`. Apple's verdict only shows on the first TestFlight upload.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | —                                                 | —                                                                                                                              | First upload shows no ITMS privacy or export-compliance warnings                                                                                                                                                                 | device                       |
| P1-6 | **Play assets were submitted; final visual review and Apple assets remain.** The 2026-10-17 Play setup submission included the filled store listing. #487 fixed the Wi-Fi demo indicator and regenerated the Play set. The pipeline produces the required iPhone, iPad and Play sizes plus the feature graphic and byte-checks them; scene 5 still needs the fictional signed-in account. The owner must visually confirm exactly which generated/manual files are uploaded in each store.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Agent (pipeline), owner (review, scene 5, upload) | Current generated sets; fictional account for scene 5                                                                          | Uploaded store previews match the current files; no focus ring, cropped quest, personal data or stale Wi-Fi indicator.                                                                                                           | dashboard + device           |
| P1-7 | **Play listing and policy fields are published; App Store state is unverified.** Play has no unpublished changes and App content is all caught up. The Privacy Policy and deletion routes validate there. Apple category, support contact, listing text and URLs still need a dashboard check. The three compliance routes return crawlable static HTML; see `scripts/lib/legalShells.js`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Owner                                             | P1-3                                                                                                                           | Play remains published with no pending setup; App Store fields match the tracked listing and `/delete-account` validates signed out.                                                                                             | dashboard                    |
| P1-8 | **The sign-up allowlist blocks review and external testers.** _repo, 2026-10-11_: admission moves to Supabase Auth. A before-user-created hook refuses any email missing from `private.beta_signup_allowlist`, on web and native alike, before an account exists, and the client list `VITE_SIGNUP_EMAIL_ALLOWLIST` is removed (it published the testers in the bundle). An unlisted App Reviewer, Hide My Email address or tester now sees "This email isn't invited" and gets no account, instead of a half-working one. _prod-read, 2026-10-04/05 (historical)_: both env variables were set on Vercel Production and Preview. _prod-read, 2026-10-14_: **verified in production.** The migrations are applied, the list holds three rows (admin, tester, support), the hook is on, and `VITE_SIGNUP_EMAIL_ALLOWLIST` is absent; four unwanted accounts are banned until 2026-11-13 (`docs/AUTH_BETA_ALLOWLIST_RUNBOOK.md`, "Production state — 2026-10-14"). The 6c **Continue as guest** control: **owner confirmation required**. _owner decision, 2026-10-19_: **sign-up opens at launch.** Before the first store submission, the owner deletes the four banned accounts, deletes `SIGNUP_EMAIL_ALLOWLIST` and redeploys, then disables the hook, so reviewers use their own accounts, Hide My Email included. The other postures considered were a pre-listed review Google account, a hook exception for Apple sign-ins, and opening only during each review. `store-metadata/app-review-notes.md` already describes the open state. _prod-read, 2026-10-18_: the table holds five rows, but `SIGNUP_EMAIL_ALLOWLIST` was last changed 2026-10-14, so a tester must be added to both (runbook "Adding beta testers"). Google Auth Platform shows **In production**, External, with no sensitive scopes, so Google runs the OAuth flow for any Google account. Getting an account still requires the address to be on the allowlist, because the before-user-created hook refuses unlisted ones. The consent screen still names `xcnnlczvxmuwcqwychox.supabase.co`. | Owner                                             | Runbook "Opening sign-up at launch" and its prerequisites: Resend disclosure, Confirm signup template, banned-account deletion | Before submission, on the submitted build: never-listed email, Google and Hide My Email accounts each sign up without "This email isn't invited" and delete themselves. Google publishing status: **In production** (2026-10-18) | dashboard                    |
| P1-9 | **Play Console closed-testing rule applies and is not yet counting.** The dashboard requires at least 12 testers continuously opted in for 14 days. Closed Alpha serves Build 9 (live 2026-10-18), the selected list has 2 users, and the dashboard says 0 testers currently opted in. Reach and retain 12+.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Owner                                             | Tester-readiness items; Build 9 on Closed Alpha                                                                                | Dashboard shows 12+ opted in and the 14-day requirement complete; then the production-access button enables.                                                                                                                     | dashboard                    |

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
is the proof. Once the beta hook is enabled, an unlisted person never gets an
account, so nothing is stranded. An unlisted account that predates the hook
still cannot reach either endpoint while `SIGNUP_EMAIL_ALLOWLIST` is set (P1-8).

### Shortest safe path (ordered by dependency, 2026-10-18)

**Tester readiness — do these once**

1. **Owner:** paste the Confirm signup template into hosted Supabase Auth and
   verify one new invited account receives both the one-time code and link.
2. **Owner decision, 2026-10-21:** the Resend DPA and qualified-counsel review
   are deferred until after the controlled beta. They do not block recruiting
   closed-beta testers. Finish both before public store release; if counsel
   changes the live Resend wording (#499, `PRIVACY_VERSION` `2026-10-19`), an
   agent applies the edit with another `PRIVACY_VERSION` bump.

**Google Play closed beta**

3. ✅ **Internal candidate:** Build 9 is active in Internal Testing, installed
   on a Samsung phone and its audio fix is proven.
4. ✅ **Closed Alpha:** Build 9 approved and live on 2026-10-18.
5. **Owner:** expand the selected tester list from 2 to at least 12 Google
   accounts. Allowlist each sign-in address in both places (runbook "Adding
   beta testers"). Then set the feedback address, send the existing web opt-in
   link and verify that at least 12 actually opt in. Being listed is not
   enough.
6. **Owner:** keep at least 12 testers continuously opted in for 14 days. Use
   the waiting period for only the unproven Android device checks in P0-4.
7. **Owner:** when Play marks the requirement complete, answer the production
   access questions and apply. App content/Data Safety setup is already
   actioned; do not redo it.

**iOS beta and store review, in parallel**

8. **Owner:** build 9 is processed and available in TestFlight Internal
   Testing. Do not upload it again; install it on the iPhone.
9. **Owner, on the iPhone:** run only the remaining P0-4 and P1-4 checks,
   including Apple/Hide My Email and account deletion.
10. **Owner + counsel, after the controlled beta:** finish the Resend DPA,
    Apple App Privacy/listing fields, uploaded-asset review and legal sign-off.
    Open sign-up (P1-8, runbook "Opening sign-up at launch"), then submit with
    `store-metadata/app-review-notes.md`.

Keep push, Premium, ads and saved conversations out of the submitted builds so
the existing form answers stay true.

**Post-launch:** the P2 rows; AI history after the shadow-week review (P2-2);
Premium and ads after decisions D1 and D3–D5 and Vercel Pro (`BACKLOG.md` owner
action 14).

**Repo work left before submission:** no blocking work is known. The optional
Google account chooser shipped as #502. The Resend privacy disclosure
shipped as #499; only a counsel-requested edit would add blocking work, with
its own `PRIVACY_VERSION` bump. No feature implementation
or build-number bump is currently queued. Everything else is owner, dashboard,
device or counsel work.

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

2. **Keep the email-provider line true.** The policy's service-provider list
   names whoever sends sign-in emails: Supabase Auth until 2026-10-19 (owner
   answer, 2026-09-29, re-confirmed 2026-09-30), Resend since #499. If the
   SMTP provider under Supabase → Auth → SMTP Settings changes again, update
   that list and bump `PRIVACY_VERSION`.

   **Triggered 2026-10-14; policy edit live 2026-10-19.** Custom SMTP through
   Resend has been live since 2026-10-14. #499 merged on 2026-10-19 and that
   day's Production deployment serves it: §5 names Resend instead of Supabase
   Auth as the email sender, §2 says what Resend receives, and
   `PRIVACY_VERSION` is `2026-10-19`. It merged before the DPA and counsel
   review it was held for, so counsel reviews the live wording after the
   controlled beta and before public store release, against the
   seven points in #499's description. Any change they ask for is a new PR
   with another bump. Remove the `TODO(counsel)` comment in
   `src/components/legal/PrivacyPolicy.jsx` once the wording is approved.

3. **After the controlled beta, have qualified counsel review** the final
   Privacy Policy and Terms before public store release,
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
