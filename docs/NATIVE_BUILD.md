# Native builds — IPA and APK / AAB

How to turn `main` into a signed iOS and Android build on the owner's Mac. The
native projects (`ios/`, `android/`) are committed; the web bundle inside them
is not. `ios/App/App/public` and `android/app/src/main/assets/public` are
gitignored and rebuilt by `npm run build:mobile`, so **every native build starts
with that command**, on the machine that runs Xcode or Android Studio.

| What              | Value                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------- |
| Bundle ID / appId | `com.sprachschule.deutsch` (`capacitor.config.ts`)                                      |
| Display name      | `Deutsch Sprachschule` (`CFBundleDisplayName` / `app_name`), same as the store listings |
| iOS minimum       | 15.0 · Swift Package Manager (no CocoaPods)                                             |
| Android           | minSdk 24 · target/compile 36                                                           |
| Toolchain         | Node 22 (`.nvmrc`), current Xcode, current Android Studio, **JDK 21** for Gradle (§4)   |

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
# VITE_GITHUB_AUTH_ENABLED is pinned true by build:mobile (package.json); do not set it here
# VITE_PUSH_ENABLED is pinned OFF in build:mobile — see docs/MOBILE_PUSH_SETUP.md §4
```

`build:mobile` also pins `VITE_SENTRY_DSN` empty and `VITE_AI_HISTORY_ENABLED=false`,
so putting either in this file does nothing. The App Privacy and Data Safety
answers in `docs/STORE_SUBMISSION_CHECKLIST.md` describe a native build with no
crash reporting and no saved tutor conversations; to change that, remove the pin
in a PR together with the form answers.

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

## Version and build number — before every upload

```bash
npm run release:bump               # same version, next build number
npm run release:bump -- 1.1.0      # new version, next build number
```

One command keeps `package.json`, Android (`versionName` / `versionCode`) and
iOS (`MARKETING_VERSION` / `CURRENT_PROJECT_VERSION`) on one version and one
shared build number. Both stores reject an upload whose build number is not
higher than the last, so run it before each TestFlight or Play upload and
commit the result. `scripts/release/version.test.js` fails if the three files
ever disagree. Versions are `MAJOR.MINOR.PATCH`, the most Apple accepts.

## 3. iOS — IPA

**One command, for TestFlight / App Store Connect:**

```bash
npm run release:bump    # a new build number, then commit it
npm run ios:upload      # build:mobile → archive → sign → upload
```

`ios:upload` signs with the Team set in the project (Automatic signing, so
Xcode manages the distribution certificate in Apple's cloud) and uploads as the
Apple ID signed in to **Xcode → Settings → Accounts**; nothing secret is in the
repo. It needs the app record in App Store Connect (bundle ID
`com.sprachschule.deutsch`). On failure it prints the next step: not signed in,
team cannot distribute, no app record, build number already used. Archives and
logs land in `store-builds/ios/` (gitignored). `-- --archive-only` stops before
the upload. The build shows in TestFlight after Apple processes it.

**Or by hand in Xcode:**

1. **App target → Signing & Capabilities:** pick your Team (Automatic signing).
2. Version and build: `npm run release:bump` (above), not the General tab, so
   Android stays in step.
3. Destination: **Any iOS Device (arm64)**, then **Product → Archive**.
4. The Organizer opens: **Distribute App** → _App Store Connect_ to upload
   (TestFlight / review), or _Release Testing_ / _Debugging_ to export an
   `.ipa` for devices registered on your account.

## 4. Android — APK or AAB

1. Version and build: `npm run release:bump` (above).
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

**From the command line**, `cd android && ./gradlew bundleRelease` signs with
`android/keystore.properties` and writes
`android/app/build/outputs/bundle/release/app-release.aab`.

**Gradle needs JDK 21**, the version CI pins (Temurin 21). Capacitor 8 compiles
at Java 21, so JDK 17 fails (`invalid source release: 21`); Gradle 8.14 cannot
compile build scripts on Java 25, which is what Android Studio now bundles, so
that fails too (`Unsupported class file major version 69`), though only after a
`build.gradle` edit forces a recompile, which makes it look intermittent.
OpenJDK 26 also fails, in AGP's `jlink` step. Install Temurin 21 (user-level
is fine) and point Gradle at it:

```bash
JAVA_HOME=$(/usr/libexec/java_home -v 21) ./gradlew bundleRelease
```

If a build fails right after switching JDKs, run `./gradlew --stop` first: a
daemon started on another JDK keeps serving builds.

**Release builds are shrunk** (`minifyEnabled` + `shrinkResources`, R8). The
native shell went from 10.0 MB of DEX to 1.4 MB, the APK from 6.8 to 3.7 MB.
Capacitor's consumer rules keep every plugin and its `@PluginMethod`s, and the
R8 map ships inside the `.aab`, so Play shows readable crash traces. Shrinking
fails at runtime, not at build time, so after changing a plugin or the keep
rules, install the release APK on an emulator and check: launch past the
splash, open a tab, tap **Continue with Google** (opens the browser), and
`adb shell am start -a android.intent.action.VIEW -d
"com.sprachschule.deutsch://login-callback?error=access_denied"` (shows
**Sign-in cancelled**).

An unsigned debug APK for a quick device test needs no keystore:
`cd android && ./gradlew assembleDebug` → `android/app/build/outputs/apk/debug/app-debug.apk`.

## Icons and launch screens

Every launcher icon and launch screen in both projects comes from the canonical
PNGs under `assets/`. `npm run gen:assets` first draws those sources from the
same Fraunces geometry as the PWA icons, then runs `@capacitor/assets` to inject
all required iOS and Android resolutions, including dark launch screens. Don't
replace generated files from Xcode or Android Studio: the next `gen:assets`
overwrites them. `src/brandAssets.test.js` checks the package's output contract
and store invariants (for example, no alpha channel on the 1024 iOS icon).

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
