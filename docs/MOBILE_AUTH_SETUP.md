# Mobile auth setup: deep-link redirect URLs

**Owner action.** Native sign-in needs one Supabase dashboard change that no one
without dashboard access can make. Until it is done, magic links and Google
sign-in started in the iOS / Android app open the **website** instead of the
app.

## Why

Inside the native app, every auth flow asks Supabase to redirect to the app's
own URL scheme instead of the website:

| Where the flow starts      | `redirectTo` sent to Supabase               |
| -------------------------- | ------------------------------------------- |
| Web (browser / PWA)        | `window.location.origin`, unchanged         |
| Native app (iOS / Android) | `com.sprachschule.deutsch://login-callback` |

Supabase only honours a `redirectTo` that is on the project's **Redirect URLs**
allow-list. Anything else is **silently replaced with the Site URL**, which is
the website. There is no error; the learner just ends up in a browser tab. That
is exactly the bug this setup fixes.

The value is built in `src/lib/nativeApp.js` (`NATIVE_AUTH_CALLBACK_URL`) and
registered with the OS in `ios/App/App/Info.plist` (`CFBundleURLTypes`) and
`android/app/src/main/AndroidManifest.xml` (intent filter, host
`login-callback`). `src/lib/nativeApp.test.js` pins all of them together.

## The change: add one Redirect URL

Supabase dashboard → project `xcnnlczvxmuwcqwychox` → **Authentication → URL
Configuration → Redirect URLs** → **Add URL**:

```
com.sprachschule.deutsch://login-callback
```

- **Keep every existing entry.** The web still needs
  `https://www.sprachschule-app.com`, `http://localhost:5173` and
  `http://127.0.0.1:5173`.
- **Don't change the Site URL.** It stays the production website.
- **Enter it exactly as shown**, with no trailing slash and no wildcard.
  Supabase appends `?code=…` itself, so no pattern is needed. A wildcard would
  only widen what the allow-list accepts.

After the change, the Redirect URLs list should read:

| Redirect URL                                | Used by              |
| ------------------------------------------- | -------------------- |
| `https://www.sprachschule-app.com`          | Web (production)     |
| `http://localhost:5173`                     | Local dev            |
| `http://127.0.0.1:5173`                     | Local dev            |
| `com.sprachschule.deutsch://login-callback` | **Native app (new)** |

## What does NOT need changing

- **Google Cloud Console.** Google redirects to Supabase's own callback
  (`https://xcnnlczvxmuwcqwychox.supabase.co/auth/v1/callback`), not to the
  app. That URI is already registered (`docs/AUTH_GOOGLE_OAUTH_RUNBOOK.md` §4).
- **GitHub OAuth app** (`docs/AUTH_GITHUB_OAUTH_RUNBOOK.md`): same reason. Its
  callback is Supabase's, and the GitHub button goes through the same
  `redirectTo` and the same system-browser flow as Google.
- **Email templates.** `supabase/templates/magic_link.html` links through
  `{{ .ConfirmationURL }}`, which carries the `redirectTo` above. The copy
  "tap this link to sign in in your browser" reads a little oddly now that the
  link opens the app. Rewording it is optional.

## How the native flow behaves (for testing)

- **Google** opens in the system browser (SFSafariViewController on iOS,
  Custom Tabs on Android), not in the app's webview, because Google blocks
  sign-in from embedded webviews. After consent, the app comes back to the
  front and shows "Signing you in…".
- **Magic link:** tap the link in the email on the **same phone** that
  requested it. Native sign-in uses PKCE, so a link only completes on the
  device that asked for it. That is a security property, not a bug:
  intercepting the link through the URL scheme gains nothing. The **6-digit
  code** in the same email works from any device, as before.
- **iOS** may ask "Open in sprachschule-app?" the first time. That prompt comes from
  the OS and is expected.

## Verify

1. Build and sync: `npm run build:mobile`. The script pins the cloud
   `VITE_SUPABASE_*` values, `VITE_API_BASE_URL`,
   `VITE_GOOGLE_AUTH_ENABLED=true` and `VITE_GITHUB_AUTH_ENABLED=true` inline,
   because Vite inlines them at build time and `.env` points at the local
   stack by design. Don't move them into `.env`. Without a provider's flag the
   app hides that provider's button, and `signInWithGoogle()` /
   `signInWithGitHub()` refuses to start.
2. Check that the OS routes the scheme to the app without signing in. Each
   command should open the app on a **"Sign-in cancelled"** panel:
   - iOS Simulator:
     `xcrun simctl openurl booted "com.sprachschule.deutsch://login-callback?error=access_denied"`
   - Android emulator / device:
     `adb shell am start -W -a android.intent.action.VIEW -d "com.sprachschule.deutsch://login-callback?error=access_denied" com.sprachschule.deutsch`
3. On a device, sign in with a magic link, then with Google. Both should land
   back **in the app** and show "Signed in".

**If the flow lands on the website instead:** the Redirect URL is missing or
mistyped. Supabase fell back to the Site URL. Re-check the entry character by
character.

## Not covered here

- **Universal Links / App Links** (https-based deep links). These would stop any
  other app from claiming the scheme. PKCE already makes an intercepted
  callback useless, so this is hardening, not a blocker. It needs an
  `apple-app-site-association` / `assetlinks.json` hosted on the domain.
- **App Store Review Guideline 4.8** (login services). Before submitting an
  iOS build that offers Google sign-in, check whether Sign in with Apple is
  required as well.
