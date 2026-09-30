# Store submission — owner checklist (sprachschule-app)

> **RELEASE GATE — DONE.** `legal_acceptances` was applied to production on
> 2026-09-30 at 14:36 UTC, before the terms-acceptance client merged (#382,
> 19:29 UTC). Verified read-only the same day: table, RLS, one read-own policy,
> no anon access, RPC callable by `authenticated` only.

Code alone does not make the app compliant. Each item below needs an account or
a judgement only the owner has. Tick them in order: several gate the next.

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
   `https://deutsch-app-dusky.vercel.app/privacy`.
5. **Google Play Console → App content → Privacy policy:** same URL.
6. **Google Play → Data safety → account deletion URL — BLOCKED:** do not enter
   `/privacy` yet. Google requires a prominent external web path where a
   logged-out user can request deletion. The current page only explains the
   in-app control; its contact-email mention is about leftover profile
   pictures, not an account-deletion request. Before submission, ship either a
   dedicated public deletion-request page/form or explicit deletion-request
   instructions on `/privacy`, then verify the URL while signed out and enter
   that deployed URL in Play Console.
7. **Apple App Privacy answers** — use the draft below, taken from the audit in
   `docs/superpowers/specs/2026-09-29-store-legal-consent-design.md` §3. Check
   every line against the build you submit: the native app today has **no
   Sentry DSN** and **no Vercel Analytics**; if either changes, so do the
   answers.
8. **Google Data Safety answers** — use the same audited draft below and check
   every line against the submitted build. Item 6 must be resolved separately;
   data-safety disclosure does not replace the external deletion pathway.

| Data                                    | Collected by the native app?     | Linked to identity  | Purpose           | Notes                                          |
| --------------------------------------- | -------------------------------- | ------------------- | ----------------- | ---------------------------------------------- |
| Email address                           | Yes                              | Yes                 | App functionality | Sign-in                                        |
| Name                                    | Yes (optional)                   | Yes                 | App functionality | Profile; OAuth providers also share one        |
| Photos (profile picture)                | Yes (optional)                   | Yes                 | App functionality | Public bucket, unguessable URL                 |
| User ID                                 | Yes                              | Yes                 | App functionality |                                                |
| Other user content (problem reports)    | Yes                              | Yes when signed in  | App functionality |                                                |
| Text sent to AI features                | Sent to Anthropic via our server | No identifiers sent | App functionality | Counsel: "collected" vs processed in real time |
| Product interaction / learning progress | Yes                              | Yes                 | App functionality | Synced when signed in                          |
| Device ID / push token                  | Only if push is enabled          | Yes                 | App functionality | Declare once push ships                        |
| Crash data                              | No (web only today)              | —                   | —                 | Re-answer if a DSN is added to native builds   |
| Audio                                   | Not by us                        | —                   | —                 | OS speech recognition; see item 11             |

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
| Vercel project / URL                | `deutsch-app-dusky.vercel.app`                | Supabase redirect allow-list, `build:mobile`, policy URL in the stores        |
| Supabase project                    | `Sprachschule` (`xcnnlczvxmuwcqwychox`)       | Project ref is baked into every client                                        |
| Bundle / application ID, URL scheme | `com.sprachschule.deutsch`                    | Changing it makes a different app in both stores and breaks the auth callback |
| localStorage keys                   | `deutsch-app-*` (incl. `deutsch-app-legal-*`) | AGENTS.md: never rename or migrate a storage key                              |
| Admin / allowlist identity          | `esterkinshimon712@gmail.com`                 | Authorization, not contact — `api/_lib/roles.js`                              |
| Sentry project                      | `javascript-react` (org `blackhebrewisraeli`) | Event history and alert rules                                                 |
