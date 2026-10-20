# Main bundle under 500 kB — implementation plan

**Spec:** `docs/superpowers/specs/2026-10-15-vite-bundle-splitting-design.md`.
Read it first; the numbers, the boundaries (B1–B6), the first-run rule (§4)
and the loading and error UX (§7) live there.

**Status (2026-10-20): complete.** PRs 1–5 merged as #477–#481. PR 4 shipped
without Settings and PR 5 without Alphabet, because each of those boundaries
added a preloaded chunk. The last step moved Settings into the Profile chunk
and landed with PR 6 (the CI budget). The entry is 483.78 kB raw / 154.33 kB
gzip. Only PR 7 remains, and it stays conditional. Spec §12 holds the
measurements and the rejected candidates.

**Goal.** Move the entry chunk from 625.24 kB to below 500 kB raw (target
≤ 485 kB) with `React.lazy` boundaries. Do it without changing the
first-Vocab path, storage keys, auth and sync start-up, legal URLs, the
offline reload, the service-worker update flow or native behaviour.

## Global constraints (every PR)

- **One boundary family per PR,** branched from up-to-date `origin/main`. Each
  PR can be reverted alone.
- **Scope.** No change to `vite.config.js`, the PWA or Workbox options,
  dependencies or lockfiles. No `chunkSizeWarningLimit` change and no
  `manualChunks`/`codeSplitting` groups. No new `localStorage` key.
- **Stay eager:** `HomeTab`, `VocabTab`, `WelcomeGate`, `PlacementTest`,
  `TrialWall`, `AuthSheet`, `TutorialOverlay`, `AcceptanceGate`,
  `AuthCallbackLanding`, the header and nav, and `activePack` (spec §4).
- **Code rules.** Every `lazy()` is declared at module top level in
  `src/App.jsx`. Inline styles from `src/lib/theme.js` tokens only. No German
  strings or branches in engine code.
- **Apple is out of scope.** For a native check, sync Android only
  (`npx cap sync android`), never a bare `cap sync`.
- **Every PR description records:**
  - the Vite report for the entry chunk and the new chunk(s), raw and gzip;
  - the gzip total for all JS;
  - `npm test`, `npm run lint`, `npm run format:check` and `git diff --check`;
  - both Learning-path smokes and `Contrast · Rendered DOM` (CI);
  - `npm run smoke:lazy-chunks` once PR 1 adds it.

## Mission map

| PR | Content | Entry after: ESTIMATE → MEASURED | Depends on | Status |
| --- | --- | ---: | --- | --- |
| 1 | `LazyBoundary` + B1 legal pages + lazy-chunk smoke | ~605 → 597.52 kB | — | Merged, #477 |
| 2 | B2 Admin tab | ~591 → 579.10 kB | 1 | Merged, #478 |
| 3 | B3 Chat tab | ~561 → 550.05 kB | 1 | Merged, #479 |
| 4 | B4 Profile tab (`StatsTab`); `SettingsRoute` held back | ~503 → 530.47 kB | 1 | Merged, #480 |
| 5 | B5 Translate; B6 Alphabet rejected (spec §12.3) | ~479 → 514.41 kB | 1 | Merged, #481 |
| 4b + 6 | Settings into the Profile chunk (spec §12.4), size budget, lazy smoke in CI | **483.78 kB** | 4, 5 | This PR |
| 7 | Automatic reload on `vite:preloadError` | — | 1, plus evidence | **Conditional** |

PRs 2–5 are independent of each other once PR 1 is in. Merge them in any order;
the estimates assume the order shown. If PR 5 measures above 485 kB, add the
spec's reserve (§5.2) to PR 5 or a PR 5b. Never take anything from the
first-run or signed-in start list.

---

## PR 1 — prove one boundary: `LazyBoundary` + lazy legal pages

**Why legal first.**
- It needs no sign-in, so CI can drive it.
- It sits on the early-return path in `App.jsx`, with no tab state.
- It never touches the first-Vocab path.
- It exercises everything the later PRs need: a direct URL, an in-app link,
  offline reload, a failed chunk and an upgraded worker.

It does **not** commit the project to the full split.

**Branch:** `perf/lazy-legal-pages`

**Files:**
- `src/components/ui/LazyBoundary.jsx` (new)
- `src/components/ui/LazyBoundary.test.jsx` (new)
- `src/App.jsx`: three imports become `lazy()`, and the three early returns
  wrap in `<LazyBoundary>` outside `ViewIn`
- `src/App.test.jsx`: legal cases use `findBy*`
- `scripts/dev/smoke-lazy-chunks.mjs` (new; uses the existing `playwright`
  devDependency)
- `package.json`: add `"smoke:lazy-chunks"` to `scripts` only, no dependency

**Steps:**

1. **Write the `LazyBoundary` tests first (red):**
   - It renders the fallback (`role="status"`, text "Loading…") while a lazy
     child is pending.
   - It renders the child once resolved.
   - A rejected `lazy()` renders `role="alert"` with a "Reload" button and
     calls `reportError` once; mock `../../lib/observability.js`.
   - The button calls `window.location.reload` (stub it).
   - Neither the fallback nor the error UI moves focus: `document.activeElement`
     is unchanged.
2. **Implement `LazyBoundary`:**
   - an error-boundary class around `<Suspense fallback>`, modelled on
     `src/components/ErrorBoundary.jsx`;
   - a fallback `min-height` prop;
   - theme tokens only;
   - full-width button at `bp.tiny`.
3. **`App.jsx`:**
   - `const PrivacyPolicy = lazy(() => import('./components/legal/PrivacyPolicy'))`,
     and the same for `TermsOfService` and `DeleteAccountPage`;
   - wrap each early return as
     `<LazyBoundary><ViewIn key="privacy"><PrivacyPolicy …/></ViewIn></LazyBoundary>`.
4. **`App.test.jsx`:** change only the assertions that run straight after a
   legal route renders to `await screen.findBy…`. Touch no other test.
5. **`smoke-lazy-chunks.mjs`**, against `vite preview`:
   1. Load `/privacy`, `/terms` and `/delete-account` directly; each heading
      renders.
   2. From `/`, open Privacy through an in-app link; the fallback (if seen)
      gives way to the page.
   3. Wait for `navigator.serviceWorker.controller`, run
      `context.setOffline(true)`, reload `/privacy`, and check the page renders.
   4. Route the legal chunk's URL to a 404, open `/terms` in a fresh context
      with no worker, and check that `role="alert"` with "Reload" appears and
      the page is not blank.
   5. Upgrade check (spec §6):
      - serve build A, wait for its worker, and build B with a changed legal
        component so the hashes differ;
      - swap the served directory, call `registration.update()` and wait for
        `controllerchange`;
      - in the A page, navigate in-app to a legal page;
      - expect the error UI or a correct render, never a blank page;
      - Reload must land on B.
6. **Measure and record** in the PR:
   - the entry and legal chunk sizes;
   - the JS gzip total;
   - the number of `assets/*.js` loads the page itself makes on the
     first-Vocab path, before and after; it must be unchanged. Take them from
     `performance.getEntriesByType('resource')`, or Playwright requests whose
     `serviceWorker()` is null. The service worker's install-time precache
     downloads are excluded (spec §9, metric 3).
7. **Record the two spec UNVERIFIEDs:**
   - whether Chromium re-fetches a failed dynamic import in the same document;
   - whether the worker registers in the Android WebView, checked on the
     emulator with `chrome://inspect`.

   Android build: take the `build:mobile` environment prefix from
   `package.json`, then run `npm run build && npx cap sync android` and the
   Gradle debug build. Do not use the full `cap sync`.

**Done when:**
- the legal chunk is emitted and the entry shrinks (expect about 20 kB);
- every verification is green;
- the smoke passes in all five scenarios;
- the native check shows the legal pages open from the app's legal links on Android.

**Rollback:** revert the PR. Static imports return; no storage or worker change.

---

## PR 2 — B2 Admin tab

**Branch:** `perf/lazy-admin-tab`. Files: `src/App.jsx` and `src/App.test.jsx`
(the "lets a server-confirmed admin open the isolated Admin tab" case →
`findBy*`).

- Make `AdminTab` a top-level `lazy()`, wrapped in `LazyBoundary` inside
  `tab === 'admin' && isAdmin`.
- Leave `useAdminSession` and the nav badge eager: they decide whether the tab
  exists.

**Done when:** the entry shrinks by about 14 kB, the admin test is green, and
there is no change for non-admins (no admin chunk request in the guest smoke).

## PR 3 — B3 Chat tab

**Branch:** `perf/lazy-chat-tab`. Files: `src/App.jsx`, `src/App.test.jsx`
(chat cases → `findBy*`; the existing `scrollIntoView` stub stays), and
`scripts/dev/audit-contrast.mjs` if it reads Chat content straight after the
tab click (wait for the content).

- Wrap `ChatTab` inside `PracticeLane`, outside `ViewIn`.
- The trial wall stays a sibling, unchanged.
- The `chatAnchorRef` coach mark targets the tab button, not the content, and
  is unaffected. Assert it anyway.

**Done when:** the entry shrinks by about 30 kB, contrast and learning-path
smokes are green, and Chat opens offline after the worker installs
(lazy-chunk smoke extended with a Chat case).

## PR 4 — B4 Profile tab and Settings

**Branch:** `perf/lazy-profile-settings`. Files: `src/App.jsx` and
`src/App.test.jsx` (profile and settings cases, including the `#settings`
start → `findBy*`).

- Make `StatsTab` and `SettingsRoute` each a `lazy()`.
- `settingsPanel` keeps building its element in `App.jsx`; it loads only when
  `StatsTab` renders it.
- Settings start (`#settings` on load) must show the fallback, then Settings,
  with the hash and tab behaviour unchanged.
- Check that sign-out, export and delete in Settings still work in the
  signed-in smoke.

**Done when:** the entry shrinks by about 55 kB, and the signed-in smoke and
the `#settings` direct-load case are green.

**Outcome.** #480 shipped `StatsTab` alone, −19.58 kB. A `lazy()` of its own
for `SettingsRoute` made Rolldown hoist shared modules into extra preloaded
chunks. PR 4b avoided that by moving `SettingsRoute`'s import into `StatsTab`,
with no new dynamic entry: −31.73 kB, and the same preloads. See spec
§12.2–§12.4.

## PR 5 — B5 Translate and B6 Alphabet (crosses 500 kB)

**Branch:** `perf/lazy-translate-alphabet`. Files: `src/App.jsx` and
`src/App.test.jsx`.

- Both sit inside `PracticeLane`, as in PR 3.
- The trial wall over practice tabs is unchanged, and a guest still sees it.

**Done when:**
- the Vite report has **no 500 kB warning**, with the entry ≤ 485 kB;
- the JS gzip total is ≤ 280.56 kB + 2%;
- the first-Vocab request count is unchanged;
- every smoke is green.

If the entry is still over 485 kB, add the spec's reserve list (§5.2) here.

**Outcome.** #481 shipped Translate alone. Lazy Alphabet, alone or together
with Translate, added a preloaded `ui/Layout` + `ui/Text` chunk: 4 first-Vocab
loads. The reserve list fared the same way (spec §12.3), so PR 4b did the
crossing.

## PR 6 — keep it there

**Branch:** `ci/bundle-budget`.

- Add `scripts/dev/bundle-budget.mjs`, with no new dependency. After
  `npm run build`, it fails if the entry chunk (the `index-*.js` referenced by
  `dist/index.html`) is ≥ 500 kB raw.
- Run it, and `npm run smoke:lazy-chunks`, in the existing
  `Lint · Test · Build` job.
- This is a guard, not a limit change.

**Outcome (with PR 4b).**
- `npm run check:bundle-budget` fails at ≥ 500,000 bytes and prints the bytes
  either way. Its unit tests are in `scripts/dev/bundle-budget.test.js`.
- CI runs it after the build, then installs Chromium and runs the smoke.
- Smoke check 0 now also caps the first-Vocab page JS loads at 3, and the new
  scenario 7 covers Profile and Settings.

## PR 7 — automatic reload on stale chunks (conditional)

**Start only if** `reportError` events from `LazyBoundary` show stale-chunk
failures after PRs 1–5 ship.

- Add a `window` listener for `vite:preloadError` (installed Vite 8.3.0
  dispatches it as cancelable) that reloads **once**, guarded by a
  `sessionStorage` timestamp so an offline failure cannot loop.
- Extend the smoke's upgrade case to expect a silent recovery.

---

## Verification checklist (copy into each PR)

- `npm run build`: the entry chunk and new chunks (raw and gzip), and the JS
  gzip total.
- `npm test`, `npm run lint`, `npm run format:check`, `git diff --check`.
- `npm run smoke:lazy-chunks` (from PR 1).
- CI: both Learning-path smokes, `Contrast · Rendered DOM`, RLS, the Android
  debug APK.
- At 320 px and 375 px: the fallback and error UI wrap and nothing overflows.
- No new `localStorage` key: `git grep localStorage` diff is empty apart from
  tests.
