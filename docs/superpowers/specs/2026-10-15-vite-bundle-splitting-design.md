# Main bundle under 500 kB — design

**Status:** Design only. No application code, Vite or service-worker
configuration, dependency, lockfile or build script was changed. Every code
change below is a **proposal** for a later mission.
Plan: `docs/superpowers/plans/2026-10-15-vite-bundle-splitting.md`.

Audit taken against `origin/main` at `428af79d` (2026-10-15) with
`npm run build`. Apple configuration, signing and store work were not
inspected; they are out of scope.

**Labels used in this document**

- **MEASURED**: taken from this audit's build output or from the module graph
  of that build (method in §11).
- **ESTIMATE**: derived from the measurements. The method and its error are
  stated where it is used.
- **UNVERIFIED**: not checked by this audit. Each one names the PR that must
  check it.

---

## 1. Intent

**Goal.** Bring the entry chunk under Vite's 500 kB warning by moving code that
the first screens never need behind `React.lazy` boundaries. Do not hide the
warning, and do not just move the same first-paint bytes into a second file.

**Non-goals.** Making the German pack load asynchronously, changing storage
keys, changing the service-worker strategy, reworking `App.jsx`, or anything
Apple-specific.

**Hard constraints.** These come from the brief and `AGENTS.md`:

- Anonymous-first start, the guest trial wall, every `localStorage` key, auth
  and sync start-up, direct `/privacy` `/terms` `/delete-account`, offline
  reload, the service-worker update flow and native behaviour all stay as they
  are.
- No German-specific branching in engine code.
- Inline styles from theme tokens only.
- A failed chunk shows a recoverable UI, never a blank screen.

---

## 2. Measured baseline (MEASURED, `428af79d`)

Toolchain, from the installed `package.json` files:

| Package | Version |
| --- | --- |
| `vite` | 8.3.0 |
| `rolldown` | 1.2.9 (the bundler under Vite 8) |
| `@vitejs/plugin-react` | 6.1.1 |
| `react`, `react-dom` | 18.3.1 |
| `vite-plugin-pwa` | 1.3.0 |
| `workbox-build`, `workbox-precaching`, `workbox-routing`, `workbox-window` | 7.4.1 |
| `@capacitor/core`, `@capacitor/cli`, `@capacitor/android` | 8.5.2 |
| `@supabase/supabase-js` | 2.108.1 |
| `@sentry/react` | 10.59.0 |

`rollup` 4.61.1 is installed, but Vite 8 bundles with Rolldown, so Rollup does
not build the app.

### 2.1 JavaScript assets (Vite reporter, gzip as reported)

| Asset | Raw kB | Gzip kB | What it is | Loaded |
| --- | ---: | ---: | --- | --- |
| `assets/index-BZ772h_Y.js` | **625.24** | **194.36** | entry: React, `App.jsx` and almost every component | first paint |
| `assets/dist-BxpGChcy.js` | 200.02 | 51.03 | `@supabase/supabase-js` (`src/lib/auth.js` dynamic import) | on demand |
| `assets/esm-CrijOwc9.js` | 83.81 | 28.34 | `@sentry/react` (`src/lib/observability.js` dynamic import) | on demand |
| `assets/dist-CgbWuuq4.js` | 7.74 | 3.09 | `@capacitor/core` shared by the plugin chunks | on demand |
| `assets/VitalsOverlay-DRkf6nB6.js` | 4.81 | 2.17 | `?vitals` overlay (`src/main.jsx`) | on demand |
| 7 Capacitor plugin chunks (`esm-*`, `web-*`) | 2.44 total | 1.67 total | `@capacitor/app`, `browser`, `splash-screen`, `push-notifications` | on demand |
| **All JS** | **924.06** | **280.56** | | |

- `index.html` (6.66 kB, 2.64 kB gzip) loads only the entry script and
  `registerSW.js` (0.13 kB). There is no `modulepreload` for any other chunk.
- **The warning comes from `index-BZ772h_Y.js`** ("Some chunks are larger than
  500 kB after minification").
- The 500 kB budget needs at least **125.2 kB** removed from the entry.

### 2.2 Other assets

- **CSS:** none. Styles are inline, and `src/lib/injectGlobalStyles.js` writes
  the global sheet at run time.
- **Fonts** (`dist/fonts/**`, woff2): Fraunces 67.4 + 59.5 kB, JetBrains Mono
  31.3 + 11.6 + 6.8 + 5.9 kB, Plus Jakarta Sans 27.3 + 21.7 kB, Noto Sans Mono
  IPA 5.7 kB.
- **Lexicon:** `dist/lexicon/de/index.json` 373.1 kB and `chunk-00…08.json`
  161.5–280.0 kB each. These are not in the JS bundle. They are fetched on
  demand and runtime-cached (`lexicon-json`, StaleWhileRevalidate).
- **Images:** `social-preview.png` 55.3 kB, PWA icons 4.6–12.9 kB.
- **Legal shells:** `privacy.html` 6.8 kB, `terms.html` 6.7 kB,
  `delete-account.html` 7.5 kB.
- **Service worker:** `sw.js` 4.4 kB plus `workbox-a3c94b52.js` 21.7 kB.
- **Precache:** 47 entries, 1251.19 KiB. It holds every `assets/*.js` file, so
  the on-demand chunks above are already precached.

---

## 3. What is in the entry chunk (MEASURED)

**Method.** The module list and import graph came from Rolldown's own output
for this exact build; the hash `index-BZ772h_Y.js` was reproduced (§11). Each
module's rendered code was minified with the same oxc minifier Vite uses, and
gzipped.

**Accuracy.** Per-module minification sums to 720.1 kB, against the real
623.7 kB chunk. Whole-chunk minification also renames and drops wrappers
across modules. The estimates below therefore multiply per-module sizes by
**0.866**, and should be read as ±10%.

### 3.1 Largest single modules (minified, per module)

| Module | kB |
| --- | ---: |
| `react-dom/cjs/react-dom.production.min.js` | 128.5 |
| `src/App.jsx` | 26.3 |
| `scripts/seed-data/apify_raw_sentences.json` (via `src/packs/de/travelBasics.js`) | 13.8 |
| `src/components/legal/PrivacyPolicy.jsx` | 12.4 |
| `src/lib/injectGlobalStyles.js` | 11.4 |
| `src/components/gamification/BadgeIcon.jsx` (via `ui/Toast.jsx`) | 10.9 |
| `src/components/VocabTab.jsx` | 9.3 |
| `src/components/vocab/VocabTable.jsx` | 9.1 |
| `src/components/PlacementTest.jsx` | 8.9 |
| `src/components/settings/SettingsRoute.jsx` | 8.1 |
| `src/components/AlphabetTab.jsx` | 8.1 |
| `src/packs/de/lexicon.js` | 7.7 |
| `src/components/ChatTab.jsx` | 7.2 |
| `src/components/legal/TermsOfService.jsx` | 7.1 |
| `react/cjs/react.production.min.js` | 6.5 |
| `src/components/admin/GodMode.jsx` | 6.4 |

### 3.2 By area (rendered, before minification)

| Area | kB |
| --- | ---: |
| `react-dom` | 184.5 |
| `src/lib/*` (top level) | 182.4 |
| other `src/components/*` (top level) | 161.9 |
| `vocab/` | 60.1 |
| `App.jsx` | 45.6 |
| `settings/` | 45.1 |
| `chat/` | 41.4 |
| `packs/de` | 41.3 |
| `stats/` | 31.2 |
| `auth/` | 26.8 |
| `admin/` | 26.0 |
| `gamification/` | 25.7 |
| `legal/` | 25.3 |
| `lucide-react` (tree-shaken icons) | 24.2 |
| `ui/` | 23.5 |
| `translate/` | 15.9 |
| `league/` | 14.3 |

### 3.3 Why it is all in one chunk

`src/App.jsx` statically imports every tab and route. That covers Home, Vocab,
Alphabet, Translate, Chat, Stats, Settings, Admin, the three legal pages,
404, the search modal, placement, the welcome and trial gates, auth sheets and
overlays, plus the German pack through `src/packs/index.js`. The only
`import()` calls are for vendor code and the vitals overlay.

**Already split correctly:** Supabase (200 kB), Sentry (84 kB) and the
Capacitor plugins. **There is no large vendor module left to defer.**
`react-dom` (128.5 kB min) is needed before first paint, and `lucide-react`
icons are used by the header, nav and first screens.

---

## 4. Startup surfaces (from `src/main.jsx` and `src/App.jsx`)

| Surface | Needs at first render |
| --- | --- |
| Anonymous welcome and level | `main.jsx` → `ErrorBoundary`, `themeMode`/`injectGlobalStyles`, `App.jsx`, `WelcomeGate`, `PlacementTest` (optional; default A1), header chips, `HomeTab` (default tab), `ui/*`, `activePack` |
| First Vocab session | Home → `VocabTab` (+ `vocab/*`), `PracticeLane`, `TrialWall` (guest wall over practice tabs), `GoalStrip`, lexicon JSON (already fetched separately) |
| Returning signed-in start and sync | `lib/auth.js` (Supabase chunk, already lazy), `lib/sync*`, `progressQueue`, `AccountChip`, `StatusChip`, `AcceptanceGate`, `AuthCallbackLanding` |
| Offline reload | `index.html` and every chunk from the precache (`NavigationRoute` → `/index.html`, `/api/` excluded) |
| Direct legal URL | `vercel.json` rewrites to `privacy.html` etc. (the same entry script). `App.jsx` returns early on `currentLegalRoute()` (`src/lib/legalRoute.js`, path or hash). With the service worker active, the precache answers `/privacy` from `privacy.html` (Workbox clean URLs). |
| Native (Capacitor) launch | `capacitor.config.ts`: `webDir: 'dist'`, no `server.url`, so assets are served locally. Launch calls `hideLaunchScreen()`, which already runs `import('@capacitor/splash-screen')` |

**Rule.** The first-run path stays eager in every phase. That means
`WelcomeGate`, `PlacementTest`, `HomeTab`, `VocabTab`, `TrialWall`,
`AuthSheet`, `TutorialOverlay`, the header and nav, and `activePack`. The
first Vocab session therefore needs no extra JS request.

---

## 5. Proposed chunk architecture

### 5.1 Mechanisms evaluated separately

- **`React.lazy` + `Suspense` + an error boundary: chosen.**
  - Only the active tab is mounted (`tab === 'x' && <XTab/>`), and legal pages
    are early returns, so each is a natural boundary.
  - Per react.dev (`reference/react/lazy`): the load promise and its result
    are cached, a rejection is thrown "for the nearest Error Boundary", and
    `lazy` must be declared at module top level.
- **Bare `import()` without React: kept for non-component code.** It is
  already used for Supabase, Sentry and Capacitor. It is not used for UI,
  because a component needs Suspense for its loading state.
- **Rolldown `codeSplitting` groups (Vite 8's successor to Rollup
  `manualChunks`; the installed Vite names `build.rolldownOptions.output.codeSplitting`):
  rejected for this work.**
  - A vendor group would move `react-dom` out of the entry. The warning would
    disappear, but the same ~130 kB is still needed before first paint, plus
    one more request.
  - That hides the metric without improving start-up (§8). Revisit only with
    evidence of a caching benefit.

### 5.2 Boundaries

"Removes" is the code that leaves the entry when that boundary alone is lazy:
modules that only that boundary reaches (ESTIMATE ±10%, minified, ×0.866).

| # | Boundary (`React.lazy` root) | Removes | Loads when | Signed-in vs guest |
| --- | --- | ---: | --- | --- |
| B1 | Legal: `legal/PrivacyPolicy`, `TermsOfService`, `DeleteAccountPage` (+ `LegalPage`) | ~20.1 kB | a legal route renders (direct URL or in-app link) | same |
| B2 | `admin/AdminTab` (+ 7 admin modules) | ~13.8 kB | an admin opens the Admin tab | admins only |
| B3 | `ChatTab` (+ `chat/*`, `ModelPopover`) | ~30.3 kB | the Chat tab is opened | same; AI calls unchanged |
| B4 | `StatsTab` + `settings/SettingsRoute` (+ `stats/*`, `profile/*`, `settings/*`) | ~54.8 kB | the Profile tab opens; Settings when its view renders (`#settings`) | same |
| B5 | `TranslateTab` (+ `translate/*`) | ~11.5 kB | the Translate tab is opened | same; trial wall unchanged |
| B6 | `AlphabetTab` | ~7.0 kB | the Alphabet tab is opened | same |

**Shared code.** Some modules are shared only between lazy boundaries. They
leave the entry once both owners are lazy, and the bundler puts them in a small
shared chunk:

- Chat with Translate, ~5.3 kB: `chat/FillBlank`, `ScaffoldActions`,
  `ScaffoldComposer`, `SendButton`, `WordBank`, `lib/chatInputModes`.
- Chat with Stats/Settings, ~3.6 kB: `ModelPicker`, `lib/aiHistory`,
  `lib/useAiHistoryEnabled`.

Every lazy chunk imports from the entry, never the reverse, so no chunk cycle
can form.

**Cumulative (ESTIMATE):**

| After | Removed | Entry ≈ |
| --- | ---: | ---: |
| B1 + B2 | 33.9 kB | 591 kB |
| + B3 | 64.2 kB | 561 kB |
| + B4 | 122.5 kB | 503 kB |
| + B5 + B6 | **146.3 kB** | **479 kB** |

So B1–B6 are needed to clear 500 kB with margin. B1–B4 alone is within the
estimate's error of the line.

**Reserve, if B1–B6 measure short:** `FeedbackDialog` 4.5 kB,
`WelcomeBackOverlay` 1.2 kB and `SearchModal` 0.4 kB. None is on the first-run
or signed-in start path. `AcceptanceGate` (2.9 kB) and `AuthCallbackLanding`
(2.7 kB) are on the signed-in start path, so they stay eager.

**Kept eager (evaluated, rejected as boundaries):**

- `HomeTab` (18.7 kB), `VocabTab` (45.1 kB), `WelcomeGate`, `PlacementTest`
  (7.7 kB), `TrialWall`, `AuthSheet`, `TutorialOverlay`: they are on the first
  Vocab path.
- `react-dom`, `lucide-react`, `injectGlobalStyles`: needed at first paint.
- The German pack (`src/packs/de/*`, including the 13.8 kB
  `scripts/seed-data/apify_raw_sentences.json` that `travelBasics.js` imports).
  `activePack` is read synchronously by the language-blind engine. Making it
  async is the Phase 4 kind of change that `AGENTS.md` reserves for Claude Code
  design. It is out of scope; §8 records it.

### 5.3 Per-boundary behaviour

All six use one shared wrapper, `LazyBoundary` (§7). The table lists only what
differs between them.

| | B1 legal | B2 admin | B3 chat | B4 profile/settings | B5 translate | B6 alphabet |
| --- | --- | --- | --- | --- | --- | --- |
| Where the wrapper sits | around each early-return page, outside `ViewIn` | inside the `tab === 'admin'` branch | inside `PracticeLane`, around `ViewIn` | around `StatsTab`, and around `SettingsRoute` in `settingsPanel` | as B3 | as B3 |
| Focus | none moved; the back button is the first stop when content arrives | tab button keeps focus | tab button keeps focus; ChatTab's on-mount scroll runs on arrival | as B2 | as B2 | as B2 |
| Offline after the service worker installed | precached, works | works | works; AI calls fail as today | works | works | works |
| Offline before the worker installed | fallback, then error UI | same | same | same | same | same |
| Tests that change | `App.test.jsx` legal cases → `findBy*`; the page tests in `legal/*.test.jsx` import the pages directly and are unaffected | the admin case → `findBy*` | chat cases → `findBy*`; `audit-contrast` must wait for Chat content | profile/settings cases, including `#settings` start | translate cases | alphabet cases |

The tab buttons already keep focus on click and mark the active tab with
`aria-current="page"` (`App.jsx` nav). A lazy tab does not change that.

---

## 6. PWA and offline design

**Precache.** `workbox.globPatterns: ['**/*.{js,…}']` already precaches every
emitted `assets/*.js` (MEASURED: all 12 JS chunks are in `sw.js`'s manifest).
New lazy chunks join it with **no configuration change**. The installed worker
downloads them during `install`. So:

- An offline first visit to a previously unopened tab works once the worker
  has installed.
- Total bytes fetched on a first visit stay about the same: the precache
  still downloads every chunk. The gain is less JS to parse and run before
  first paint, not fewer bytes over the network. Success metrics (§9) say so.

**Before the worker installs.** A lazy chunk is a normal network request.
Offline at that moment means the fallback, then the error UI (§7). This window
already exists for the Supabase and Sentry chunks.

**Update flow (unchanged).** `registerType: 'autoUpdate'` builds a worker with
`skipWaiting()`, `clientsClaim()` and `cleanupOutdatedCaches()`. During
`activate`, Workbox "deletes assets that are no longer present in the current
precache manifest" (developer.chrome.com `docs/workbox/modules/workbox-precaching`).

**Stale-chunk failure (new risk).**
1. A tab is running deploy N, and a lazy chunk with a hash from N has not yet
   loaded.
2. Deploy N+1's worker activates, for example from another tab or a resumed
   installed PWA, and deletes N's chunks.
3. Vercel no longer serves them, so the import fails.

App chunks change hash on most deploys. Vendor-only chunks like Supabase's
change only when the dependency changes, which is why this has not shown up so
far.

**Defence:**

1. Every boundary renders the error UI, never a blank screen.
2. "Reload" fetches deploy N+1's entry, whose chunks are precached.
3. Progress lives in `localStorage` (`deutsch-app-state-v1` and friends), so a
   reload loses only the in-memory tab choice. The app opens on Home, or on
   Profile for `#settings`.

The installed Vite 8.3.0 preload helper dispatches a **cancelable
`vite:preloadError`** event, then rethrows unless it is cancelled
(`node_modules/vite/dist/node/chunks/node.js`, `handlePreloadError`; typed in
`node_modules/vite/client.d.ts` as `VitePreloadErrorEvent`). An automatic
reload on that event is **deferred** (plan, PR 7): it needs a loop guard for
the offline case, and the manual Reload already recovers.

**Retry semantics.**
- `React.lazy` caches a rejected promise (react.dev), so "Try again" cannot
  simply re-render.
- Browsers may also cache a failed module fetch for the life of the document
  (UNVERIFIED; PR 1 checks Chromium).
- Recovery is therefore `window.location.reload()`, which needs no new storage
  key.

**Runtime caching.** No change. The `lexicon-json` rule is unrelated.

**Testing an upgrade from an older worker** (plan, PR 1). Playwright is
already a devDependency.
1. Serve build A with `vite preview`, load it, and wait for
   `navigator.serviceWorker.controller`.
2. Rebuild to B, so the chunk hashes differ, and serve B from the same origin.
3. Call `registration.update()` and wait for `controllerchange`.
4. In the still-open A page, open a lazy tab. Expect the error UI, not a blank
   screen, and expect Reload to recover on B.
5. Also: go offline after install (`context.setOffline(true)`), reload, and
   open each lazy surface. Each must render.

---

## 7. Loading and error UX

**One new primitive, `src/components/ui/LazyBoundary.jsx`:** an error-boundary
class wrapped around `<Suspense>`. `src/components/ErrorBoundary.jsx` is the
model.

- **Loading fallback:**
  - `role="status"`, `aria-live="polite"`, the visible text "Loading…", theme
    tokens only.
  - It reserves a `min-height` close to the surface, so the only shift is the
    deliberate loading state.
  - It has no spinner animation. If any motion is added, it respects
    `prefers-reduced-motion`.
  - It is not focusable, and it does not take focus.
- **Error UI:**
  - `role="alert"`, with a short sentence ("This section could not load.")
    and one `Button` labelled "Reload".
  - It is reachable with Tab, and it does not steal focus.
  - The header and nav stay usable, so the user can leave for any eager tab.
  - `componentDidCatch` → `reportError` (`src/lib/observability.js`), as the
    root boundary does.
- **Narrow screens:** both states wrap at 320 px and 375 px (`bp.tiny`); the
  button grows to full width at `bp.tiny`.
- **`ViewIn`:** the boundary sits outside `ViewIn`, so the fade-in plays when
  the real content arrives, not on the fallback.
- **Language:** all strings are English UI chrome with no German specifics,
  which keeps the engine rule.
- **Deferred:** `startTransition` on tab change. It would keep the old tab
  visible until the new chunk loads, but it delays `aria-current`. Decide after
  PR 3 with measured load times.

---

## 8. Native design

- **Local assets only.** `webDir: 'dist'` with no `server.url`, so a dynamic
  import resolves to `/assets/*.js` on the WebView's local origin. No network
  dependency is added.
- **Precedent (MEASURED in code, device-verified earlier).**
  - Native launch already depends on dynamic chunks:
    `hideLaunchScreen()` → `import('@capacitor/splash-screen')`, plus
    `@capacitor/app` and `@capacitor/browser` (`src/lib/nativeApp.js`).
  - The Android release APK launched, switched tabs and handed off Google
    sign-in on the Android 16 emulator on 2026-10-04
    (`docs/STORE_SUBMISSION_CHECKLIST.md`, P0-3).
- **Service worker in the WebView (UNVERIFIED).** Whether `registerSW.js`
  registers inside the Android WebView is not established. It does not change
  this design, because assets are local either way. PR 1 records it via
  `chrome://inspect`.
- **Builds.** Verify with an Android build only (`npx cap sync android`, then
  Gradle). Do not run `npm run build:mobile`'s full `cap sync`, which also
  syncs the paused Apple platform. iOS is out of scope and not assessed.

---

## 9. Success metrics

Each PR measures these, and PR 6 must meet all of them:

1. The entry chunk is **< 500 kB raw** in the Vite report, with no
   `chunkSizeWarningLimit` change. Target ≤ 485 kB for margin.
2. **Gzip total for all JS ≤ 280.56 kB + 2%.** Splitting costs a little
   compression; a larger rise needs a stated reason.
3. **No extra JS request on the minimum first-Vocab path:** fresh guest →
   level → Home → Vocab → first card. Count only the `assets/*.js` loads the
   page itself makes. Take them from the page's
   `performance.getEntriesByType('resource')`, or from Playwright requests whose
   `serviceWorker()` is null, before and after. The service worker's
   install-time precache downloads fetch every chunk whether the page imports
   it or not (§6), so they are excluded from this count. They are covered by
   metric 6 instead.
4. `npm test`, `npm run lint`, `npm run format:check`, both Learning-path
   smokes, `Contrast · Rendered DOM` and the RLS job are unchanged and green.
5. The new offline and upgrade check (§6) is green.
6. The precache stays about the same size (±2% of 1251.19 KiB). The entry
   count rises only by the new chunks.
7. Informational: `npm run bench:perf` cold FCP is not worse.

---

## 10. Risks and rejected alternatives

**Risks:**

| Risk | Mitigation |
| --- | --- |
| Stale chunk after a deploy | §6 error UI and Reload; automatic reload deferred |
| Tests that assert synchronously after a tab click | convert to `findBy*` per PR; touch no other assertion |
| A first-run component made lazy by mistake | the first-run rule (§4); metric 3 |
| Size estimate off by ±10% | each PR reports the real number; reserve list (§5.2) |
| Android service-worker behaviour unknown | UNVERIFIED; recorded in PR 1, and the design holds either way |

**Rejected alternatives:**

- **Raising `chunkSizeWarningLimit`.** It only hides the warning.
- **A generic vendor group.** Same first-paint bytes, one more request (§5.1).
- **An async German pack.** It touches the language-blind engine contract (§5.2).
- **Lazy Home or Vocab.** They are on the first-run path.
- **Idle prefetch of every lazy chunk.** It brings back most of the cost. A
  targeted prefetch can be reconsidered later with data.
- **A router library.** The app's hash and path handling works, and the split
  does not need one.

---

## 11. Rollback and method

**Rollback.**
- Each boundary is one PR and one commit. Reverting it restores the static
  import.
- There is no storage, schema or service-worker change to undo.
- Users with a tab open across the rollback deploy hit the same stale-chunk
  path, and §7 covers it.

**Reproducing the measurement** (scratch only, nothing committed):
1. Write a throwaway config outside the repo that imports `vite.config.js`
   unchanged.
2. Add a `generateBundle` plugin that records each chunk's
   `modules[id].renderedLength` and code, plus
   `this.getModuleInfo(id).importedIds`. Build into a scratch `outDir`.
3. Confirm the entry hash matches `npm run build`.
4. Minify each module with `minifySync` from `rolldown/experimental`
   (installed), and gzip it at level 9.
5. "Removes" for a boundary is the set of entry modules no longer statically
   reachable from `src/main.jsx` once that boundary's root is cut.

**Sources:**
- Installed: `vite@8.3.0` (`client.d.ts`, `dist/node/chunks/node.js`, and the
  reporter's own warning text), `vite-plugin-pwa@1.3.0`, and this build's
  `dist/sw.js` and `dist/registerSW.js`.
- Web: react.dev/reference/react/lazy and
  developer.chrome.com/docs/workbox/modules/workbox-precaching.
