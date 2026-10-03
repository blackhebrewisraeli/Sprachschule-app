# Sign in with Apple — owner runbook

**Owner-only.** Every step is a dashboard action in Apple Developer, Supabase or
Vercel. The code is merged dark behind `VITE_APPLE_AUTH_ENABLED`; `build:mobile`
pins it `false`, and nothing in the repo can verify these steps.

Why this exists: the iOS app offers Google and GitHub sign-in, so App Review
Guideline 4.8 asks for an equivalent privacy-preserving login (this is P1-4 in
`docs/STORE_SUBMISSION_CHECKLIST.md`). Whether passwordless email alone would
have passed is Apple's call, which is why this ships rather than being argued.
Sibling of `docs/AUTH_GITHUB_OAUTH_RUNBOOK.md`.

## What the code does

`isAppleAuthConfigured()` is `isAuthConfigured() && VITE_APPLE_AUTH_ENABLED === 'true'`.
`AppleButton` renders nothing otherwise, and `signInWithApple()` re-checks, so a
stale tab cannot start a flow. It is the **OAuth web flow** through Supabase (the
system browser on native), the same path as Google and GitHub, so it needs a
Services ID and **no** extra app entitlement. It appears on the welcome gate and
the sign-in / create sheets, under GitHub. The trial wall keeps its single
provider slot (unchanged).

## Turning it on takes five things, in this order

1. **Apple Developer → Identifiers.** Confirm the App ID `com.sprachschule.deutsch`
   exists. Create a **Services ID** (for example `com.sprachschule.deutsch.signin`),
   enable Sign in with Apple, and add the website domain and the return URL
   `https://xcnnlczvxmuwcqwychox.supabase.co/auth/v1/callback`.
2. **Apple Developer → Keys.** Create a key with Sign in with Apple enabled for
   that App ID. Download the `.p8` once; keep the Key ID and Team ID.
3. **Supabase → Authentication → Providers → Apple.** Enable it with the Services
   ID as the client ID and a **client secret JWT** generated from the key (Supabase
   documents the generator). **This secret expires after at most six months:**
   put the renewal date in your calendar, because an expired secret silently
   breaks Apple sign-in. No change to the Redirect URL allow-list is needed:
   `com.sprachschule.deutsch://login-callback` already covers the app.
4. **Account deletion must revoke the Apple token.** Apple requires an app that
   offers Sign in with Apple to revoke the user's token when they delete their
   account. Supabase's user deletion does not do this. **This is not built.** It
   needs the Apple key and a server call to Apple's revoke endpoint from the
   account-delete handler, so it is a follow-up PR that must land before the
   flag is flipped. Do not ship the button without it.
5. **Flip the flag.** In one release commit change the `build:mobile` pin to
   `VITE_APPLE_AUTH_ENABLED=true`, update `src/lib/buildMobileScript.test.js` in
   the same commit, and rebuild. Leave `VITE_APPLE_AUTH_ENABLED` **unset in
   Vercel** unless you also want the button on the website.

## Other owner items

- **Privacy Policy / Terms / deletion page** name the sign-in providers
  (Google, GitHub). Apple has to be added, and it is supplied legal copy, so the
  text comes from you and counsel; bump `PRIVACY_VERSION` with it. The store
  Apple/Google forms already cover email and name; Apple may return a private
  relay address instead of a real one, which is still an email address.
- **Button artwork.** `AppleButton` uses a plain Apple glyph on the app's own
  button style. Apple publishes official Sign in with Apple artwork and rules;
  compare and swap before submission.
- **Review notes** can then drop the 4.8 argument.

## Verify

1. Web or device, flag on: the button appears under GitHub on the welcome gate and
   the sheet; with the flag off it appears nowhere.
2. On an iPhone: Continue with Apple opens the system browser, completes, and
   returns to the app signed in ("Signed in"), including with **Hide My Email**.
3. Delete that account in the app, then confirm in Apple ID settings that the app
   no longer appears under Sign in with Apple (this proves step 4).
4. Sign in again with Apple on a second device; the same learner state loads.
