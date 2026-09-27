# Native builds — IPA and APK / AAB

How to turn `main` into a signed iOS and Android build on the owner's Mac. The
native projects (`ios/`, `android/`) are committed; the web bundle inside them
is not. `ios/App/App/public` and `android/app/src/main/assets/public` are
gitignored and rebuilt by `npm run build:mobile`, so **every native build starts
with that command**, on the machine that runs Xcode or Android Studio.

| What              | Value                                                     |
| ----------------- | --------------------------------------------------------- |
| Bundle ID / appId | `com.sprachschule.deutsch` (`capacitor.config.ts`)        |
| Display name      | `Deutsch App`                                             |
| iOS minimum       | 15.0 · Swift Package Manager (no CocoaPods)               |
| Android           | minSdk 24 · target/compile 36                             |
| Toolchain         | Node 22 (`.nvmrc`), current Xcode, current Android Studio |

## 1. Production env — once per machine

Vite inlines every `VITE_*` value **at build time**, into the bundle the app
ships. A native build therefore takes whatever `.env*` files are on disk — and
the committed `.env.example` points Supabase at the local Docker stack
(`127.0.0.1`), which on a phone means sign-in that can never connect.

Create `.env.production.local` in the repo root (`.env*` is gitignored; Vite
reads this file for `vite build` and it overrides `.env`). Copy the **production**
values from Vercel → Project → Settings → Environment Variables, `VITE_*` only —
never a server secret such as `ANTHROPIC_API_KEY` or the service-role key:

```bash
VITE_SUPABASE_URL=…
VITE_SUPABASE_ANON_KEY=…
VITE_SYNC_ENABLED=true
VITE_LEAGUES_ENABLED=true
VITE_GOOGLE_AUTH_ENABLED=true
VITE_GITHUB_AUTH_ENABLED=…   # whatever Production has
VITE_PUSH_ENABLED=true       # ONLY with android/app/google-services.json — docs/MOBILE_PUSH_SETUP.md
VITE_SENTRY_DSN=…            # optional, as Production has them
VITE_SENTRY_ENVIRONMENT=…
```

…plus any other `VITE_*` Production carries (e.g. `VITE_SIGNUP_EMAIL_ALLOWLIST`
once owner action #8 is enabled).

`VITE_API_BASE_URL` is **not** in this list: `npm run build:mobile` sets it to
production itself, because a Capacitor webview has no `/api` of its own.

Native sign-in also needs owner action #11 in `docs/BACKLOG.md` (the
`com.sprachschule.deutsch://login-callback` redirect URL in Supabase). Without it
every sign-in lands on the website instead of back in the app.

## 2. Build and sync

```bash
cd ~/Projects/deutsch-app
git checkout main && git pull
nvm use                            # or any Node 22
npm install --legacy-peer-deps
npm run build:mobile               # vite build + npx cap sync
```

Then open each IDE:

```bash
npx cap open ios                   # Xcode — ios/App/App.xcodeproj
npx cap open android               # Android Studio — android/
```

## 3. iOS — IPA

1. **App target → Signing & Capabilities:** pick your Team (Automatic signing).
2. **App target → General:** raise _Version_ (`MARKETING_VERSION`) and _Build_
   (`CURRENT_PROJECT_VERSION`). Every App Store Connect upload needs a higher
   build number.
3. Destination: **Any iOS Device (arm64)**, then **Product → Archive**.
4. The Organizer opens: **Distribute App** → _App Store Connect_ to upload
   (TestFlight / review), or _Release Testing_ / _Debugging_ to export an
   `.ipa` for devices registered on your account.

## 4. Android — APK or AAB

1. Raise `versionCode` (integer, must increase every upload) and `versionName`
   in `android/app/build.gradle`.
2. **Build → Generate Signed App Bundle or APK…**
   - **Android App Bundle (`.aab`)** for Google Play — Play no longer accepts
     APKs for new apps.
   - **APK** to side-load onto a phone.
3. First time only: **Create new…** keystore, saved **outside the repo** —
   `android/.gitignore` leaves `*.jks` commented out, so a keystore inside
   `android/` would show up as committable. Back the file and both passwords
   up somewhere safe: losing them means you can never ship an update under the
   same listing.
4. Choose **release**. Output lands in `android/app/release/`.

An unsigned debug APK for a quick device test needs no keystore:
`cd android && ./gradlew assembleDebug` → `android/app/build/outputs/apk/debug/app-debug.apk`.

## Icons and launch screens

Every launcher icon and launch screen in both projects is drawn by
`npm run gen:assets` from the same geometry as the PWA icons
(`scripts/gen-assets/mark.js`, file list in `scripts/gen-assets/native.js`).
Don't replace them from Xcode, Android Studio's Image Asset wizard or
`@capacitor/assets`: the next `gen:assets` overwrites them, and
`src/brandAssets.test.js` checks the invariants the stores enforce (for example,
no alpha channel on the 1024 iOS icon).

The mark is the Fraunces "D." baked to outlines in
`scripts/gen-assets/glyphs.js`. Re-run `scripts/gen-assets/extract-glyphs.py`
(instructions in its header) only when the vendored Fraunces changes;
`brandAssets.test.js` fails when it has.

### The launch screen hand-off

`@capacitor/splash-screen` holds the launch screen until the web app lifts it
(`launchAutoHide: false` in `capacitor.config.ts`), so the webview is never
uncovered before it has painted. `hideLaunchScreen()` in `src/lib/nativeApp.js`
lifts it, called from `App`'s first commit and from `ErrorBoundary` in case
`App` throws first. **Anything new that can render before `App` must call it
too**, or the app never gets past its launch screen. Adding a native plugin
means `npx cap sync` and committing what it writes to both projects;
`nativeApp.test.js` checks this one is registered.
