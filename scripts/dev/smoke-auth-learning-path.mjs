#!/usr/bin/env node
/**
 * Browser smoke for the AUTHENTICATED learning path.
 *
 * Sibling of `smoke-learning-path.mjs`, which walks the same journey as a
 * guest. That one proves local persistence survives a reload. This one is
 * about the half a guest can never reach: the sync lane, leagues, and the
 * account controls.
 *
 * ── What it proves ───────────────────────────────────────────────────────
 *   1. A stub session restores without secrets (no real token, no network).
 *   2. Finishing an exercise puts THAT answer's event on the sync wire.
 *   3. A reload rebuilds progress from the server after a local wipe.
 *   4. Leagues renders a real standings table, not the soft error line.
 *   5. Account controls are present and sign-out returns to the guest shell.
 *   6. None of the above overflows or clips at 1280 / 375 / 320.
 *
 * ── Why this builds its own target (do not "simplify" this away) ──────────
 * The signed-in pass seeds a Supabase session into localStorage. A build
 * carrying a developer's REAL VITE_SUPABASE_* REJECTS that seed, and the run
 * dies with "the session seed no longer satisfies useAuth" on a developer box
 * while passing in CI. So with no AUDIT_BASE we build with STUB Supabase
 * config into a scratch dir. Same lesson audit-contrast.mjs documents at
 * length; see its header before changing this.
 *
 * Nothing here is a credential. `isAuthConfigured()` only checks both values
 * are truthy, and every outbound call is intercepted.
 *
 * Usage:
 *   npm run smoke:auth-learning-path                    # builds and serves itself
 *   AUDIT_BASE=http://localhost:5290 node scripts/dev/smoke-auth-learning-path.mjs
 *   AUDIT_SKIP_BUILD=1 npm run smoke:auth-learning-path # reuse dist-smoke-auth/
 *
 * Same AUDIT_BASE / AUDIT_SKIP_BUILD / AUDIT_PORT contract as
 * smoke-learning-path.mjs and audit-contrast.mjs.
 *
 * Exit 0 on a clean walk of all three viewports; 1 on failure. A failing
 * viewport also writes smoke-auth-failure-<name>-<width>.png.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DECK_ID, STATE_KEY, learningPathSeed, openDeckPicker } from './learning-path-seed.js';
// The SAME pure module LeaderboardSection and the settle endpoint both use, so
// the zone dividers this smoke expects can never drift from the ones the app
// draws. Importing it beats hardcoding 7/5 here.
import { zoneCounts } from '../../src/lib/leagueZones.js';

// Absolute path to the pinned vite binary rather than bare `npx vite`: npx is
// resolved through PATH and will fetch-and-execute an uninstalled name from
// the registry, so a shadowed PATH entry becomes arbitrary code mid-build
// (Sonar S4036). Derived from this file's location, not process.cwd(), so the
// script behaves the same however it is invoked.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VITE_BIN = join(REPO_ROOT, 'node_modules', '.bin', 'vite');

// Stub Supabase config, NOT credentials. See the header note.
const STUB_ENV = {
  VITE_SUPABASE_URL: 'https://stub.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'stub-anon-key-not-a-secret',
  VITE_LEAGUES_ENABLED: 'true',
  // Step 3 measures the RECONCILE lane, which `sync.js` makes a no-op unless
  // this is 'true' — without it step 3 would assert on a lane that never ran.
  // Step 2 does not need it: the progress flush is gated on a JWT, not on
  // this flag, so answers are never stranded by sync being off.
  VITE_SYNC_ENABLED: 'true',
};

// Its own scratch dir and port, so this never clobbers `dist/`, `dist-smoke/`
// (the guest smoke) or `dist-audit/` (the contrast audit), and never collides
// with one of them already being served.
const OUT_DIR = 'dist-smoke-auth';
const SMOKE_PORT = Number(process.env.AUDIT_PORT ?? 5295);
const EXPLICIT_BASE = process.env.AUDIT_BASE;
const BASE = EXPLICIT_BASE ?? `http://localhost:${SMOKE_PORT}`;

// 375 is the iPhone-class width the brief names. The contrast audit uses 390;
// both are worth having — 375 is the tighter of the two and 320 is the floor
// where the header budget is only ~10px.
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'phone', width: 375, height: 800 },
  { name: 'narrow', width: 320, height: 800 },
];

// VocabTab's click-lock swallows the next choice for 200ms after a verdict.
const CLICK_LOCK_MS = 250;

// supabase-js stores its session under `sb-<project-ref>-auth-token`, where
// the ref is the first label of the API host. Derived, not hardcoded, so this
// works against the stub build and against a developer box pointed at the
// real project.
const SUPABASE_REF = (process.env.VITE_SUPABASE_URL ?? STUB_ENV.VITE_SUPABASE_URL)
  .replace(/^https?:\/\//, '')
  .split('.')[0];
const SESSION_KEY = `sb-${SUPABASE_REF}-auth-token`;

// src/lib/progressQueue.js owns this key; the queue is the only place the
// id a given answer enqueued is observable from outside the bundle.
const QUEUE_KEY = 'deutsch-app-progress-queue-v1';

/** Set by step 5 to stop the init script re-seeding the session after logout. */
const NO_RESEED_FLAG = '__smoke_auth_no_reseed';

let previewServer = null;

function stopPreview() {
  if (previewServer && !previewServer.killed) previewServer.kill('SIGTERM');
  previewServer = null;
}
process.on('exit', stopPreview);
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    stopPreview();
    process.exit(130);
  });
}

function run(cmd, args, env = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', env: { ...process.env, ...env } });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolvePromise() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))
    );
  });
}

async function waitForServer(url, seconds = 60) {
  for (let i = 0; i < seconds; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return i;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return -1;
}

function newestMtime(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(full) : statSync(full).mtimeMs);
  }
  return newest;
}

/** Build with STUB env + serve, unless the caller says they own the server. */
async function provisionTarget() {
  if (process.env.AUDIT_SKIP_BUILD === '1') {
    const built = `${OUT_DIR}/index.html`;
    if (!existsSync(built)) {
      throw new Error(
        `AUDIT_SKIP_BUILD=1 but ${OUT_DIR}/ has no build to reuse. Run once without it.`
      );
    }
    console.log(`Reusing the existing ${OUT_DIR}/ build (AUDIT_SKIP_BUILD=1).`);
    const srcMs = newestMtime('src');
    const builtMs = statSync(built).mtimeMs;
    if (srcMs > builtMs) {
      const mins = Math.round((srcMs - builtMs) / 60000);
      console.log(
        `⚠ src/ is ${mins} minute(s) NEWER than ${OUT_DIR}/ — you are smoking a stale ` +
          'build. Drop AUDIT_SKIP_BUILD to rebuild.'
      );
    }
  } else {
    console.log(`Building with stub Supabase config → ${OUT_DIR}/`);
    await run(VITE_BIN, ['build', '--outDir', OUT_DIR], STUB_ENV);
  }

  console.log(`Serving ${OUT_DIR}/ on :${SMOKE_PORT}`);
  previewServer = spawn(
    VITE_BIN,
    ['preview', '--outDir', OUT_DIR, '--port', String(SMOKE_PORT), '--strictPort'],
    { stdio: 'ignore' }
  );
  previewServer.on('error', (err) => {
    console.error(`preview server failed to start: ${err.message}`);
  });

  const waited = await waitForServer(BASE);
  if (waited < 0) {
    throw new Error(
      `preview never answered on ${BASE}. If something else holds :${SMOKE_PORT}, ` +
        'set AUDIT_PORT, or set AUDIT_BASE to smoke a server you are running yourself.'
    );
  }
  console.log(`preview up after ${waited}s`);
}

/**
 * A well-formed stub session — no credentials, nothing real to leak.
 *
 * `useAuth` takes its status from `client.auth.getSession()`, which
 * supabase-js resolves out of storage with no network round-trip so long as
 * the session has not expired. Only `getUser()` round-trips. So this is
 * enough to render the whole signed-in shell.
 *
 * `expires_at` sits comfortably ahead of the run so supabase-js never tries
 * to refresh mid-walk.
 *
 * A plain factory rather than a page function: it is serialised into the init
 * script, and `EXPECTED_BEARER` below reads the same object, so the token the
 * app presents and the token step 2 asserts on can never drift apart.
 */
function stubSession() {
  return {
    access_token: 'smoke.stub.token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'smoke-stub-refresh',
    user: {
      id: '00000000-0000-4000-8000-000000000002',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'smoke@example.test',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-01-01T00:00:00.000Z',
    },
  };
}

/** The bearer the flush must present. Derived, so the two cannot drift. */
const EXPECTED_BEARER = `Bearer ${stubSession().access_token}`;

/**
 * Baseline LOCAL state, installed before first paint.
 *
 * Not the session — step 1 adds that on top. This is only the guest-side
 * blob the guest smoke also seeds (level, tutorial flag, deck progress).
 * Without `deutsch-level` the build lands on the placement test ("Find your
 * level") and never reaches the shell at all.
 *
 * `addInitScript`, not goto → evaluate → reload: the guest smoke lost that
 * race on CI, where App's persist effect reads empty state and then writes
 * `{ ...current, learnedWords: {} }` over the seed. Init scripts run before
 * page JS.
 *
 * sessionStorage marks the seed applied so a later reload keeps what the
 * learner just did instead of resetting to the seed.
 */
async function installBaselineSeed(context, seed) {
  await context.addInitScript((entries) => {
    try {
      if (sessionStorage.getItem('__smoke_auth_learning_path_seeded') === '1') return;
      for (const [key, value] of Object.entries(entries)) {
        localStorage.setItem(key, value);
      }
      sessionStorage.setItem('__smoke_auth_learning_path_seeded', '1');
    } catch {
      // private mode — dismissEntryScreens fails loudly if the shell never appears
    }
  }, seed.localStorage);
}

/**
 * The SESSION, installed before first paint — step 1's half of the seed.
 *
 * Separate from `installBaselineSeed` on purpose: that one is the guest-side
 * blob the guest smoke also writes, this one is what makes the run signed in.
 * Keeping them apart means a failure says which half did not take.
 *
 * Same `addInitScript` reasoning: `useAuth` reads
 * `client.auth.getSession()` during mount, so a session written after the
 * first paint leaves the app rendered as a guest and every signed-in
 * assertion below measures the wrong shell.
 */
async function installSignedInSeed(context, key) {
  await context.addInitScript(
    ({ storageKey, session, stopFlag }) => {
      try {
        // Step 5 sets this before signing out. Without it the seed would run
        // again on the hard reload `signOutAndReset` performs, put the session
        // straight back, and a COMPLETELY BROKEN logout would look like a
        // working one. sessionStorage is the right home for the flag:
        // `clearUserLocalState` wipes localStorage only, so it survives the
        // very reload it has to survive.
        if (sessionStorage.getItem(stopFlag) === '1') return;
        localStorage.setItem(storageKey, JSON.stringify(session));
      } catch {
        // private mode — stepRestoreSession fails loudly on the guest shell
      }
    },
    { storageKey: key, session: stubSession(), stopFlag: NO_RESEED_FLAG }
  );
}

/**
 * Refuse to run against anything real.
 *
 * The seeded token is a fake string, not a signed JWT, and the build is made
 * with a stub host. This asserts both, so that "fixing" a flake by pointing
 * the smoke at a real project fails here instead of quietly sending a walk of
 * synthetic progress at production.
 *
 * Skipped only when the caller set AUDIT_BASE, which means they are supplying
 * the server and own that decision.
 */
function assertNoRealCredentials() {
  if (EXPLICIT_BASE) {
    console.log('AUDIT_BASE set — skipping the stub-host guard; you own that server.');
    return;
  }
  const { access_token: token } = stubSession();
  // A real Supabase access token is a JWT: three base64url segments, first
  // decoding to a JSON header. Ours must not look like one.
  if (token.split('.').length === 3 && /^eyJ/.test(token)) {
    throw new Error('smoke-auth-learning-path: the seeded token looks like a real JWT.');
  }
  if (SUPABASE_REF !== 'stub') {
    throw new Error(
      `smoke-auth-learning-path: built against project ref "${SUPABASE_REF}", not the stub. ` +
        'This smoke must never run against a real project.'
    );
  }
}

/**
 * Entry gate + tutorial.
 *
 * The guest gate renders only when the BUILD has VITE_SUPABASE_* — which this
 * one always does, unlike the guest smoke's build, so this is NOT a no-op
 * here. The tutorial scrim is the other trap: it eats every click, and
 * writing `deutsch-tutorial-completed` does NOT dismiss it. Click
 * "Skip tutorial".
 */
async function dismissEntryScreens(page) {
  const gate = await page.$('[data-entry="guest"]');
  if (gate) {
    await gate.click();
    await page.waitForTimeout(200);
  }
  const skip = page.getByRole('button', { name: /skip tutorial/i });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click();
    await page.waitForTimeout(200);
  }
  const onShell = await page.evaluate(() => Boolean(document.querySelector('header')));
  if (!onShell) {
    throw new Error(
      'smoke-auth-learning-path: never reached the app shell — the entry flow changed.'
    );
  }
}

/**
 * The masthead's AccountChip trigger, scoped to the banner landmark.
 *
 * `aria-label="Account"` is NOT unique in the document: #311 gave the
 * Settings segmented control a section button with the same accessible name
 * (`SETTINGS_SECTIONS` in `src/components/settings/SettingsRoute.jsx`). An
 * unscoped `getByRole('button', { name: 'Account' })` therefore matched two
 * elements the moment a step stood on `#/settings`, and step 5 died of a
 * Playwright strict-mode violation — which is how this smoke went red one
 * day after it shipped. Both names are legitimate on their own surface, so
 * the test scopes instead of asking the UI to rename anything.
 *
 * `<header>` is the app shell's only banner (it is not nested in a
 * `<section>` or `<article>`), so this holds regardless of what the page
 * body grows next.
 */
function mastheadAccountButton(page) {
  return page.getByRole('banner').getByRole('button', { name: 'Account', exact: true });
}

/**
 * Fail in this file's own words if the masthead ever grows a SECOND
 * "Account" button — the scope above only rules out collisions in the page
 * body. Without this the next collision surfaces as a raw strict-mode stack
 * trace, or worse as some unrelated step's error text.
 *
 * It fails ONLY on more than one. Absence is not this function's business:
 * step 1 waits for the chip to appear and step 5 asserts it is there, and
 * both say something more useful about a missing chip than this could.
 */
async function assertNoMastheadAccountAmbiguity(page, label) {
  const count = await mastheadAccountButton(page).count();
  if (count > 1) {
    throw new Error(
      `smoke-auth-learning-path: the masthead has ${count} "Account" buttons at ${label}, ` +
        'so every account assertion in this walk is ambiguous. Give the new one a distinct ' +
        'accessible name rather than widening this locator.'
    );
  }
}

function horizontalOverflow() {
  return document.documentElement.scrollWidth - document.documentElement.clientWidth;
}

/**
 * `window.innerWidth` GROWS with the overflow, so it cannot detect one.
 * Measure `scrollWidth - clientWidth` on the documentElement instead.
 */
async function assertNoOverflow(page, label) {
  const overflow = await page.evaluate(horizontalOverflow);
  if (overflow > 1) {
    throw new Error(
      `smoke-auth-learning-path: horizontal overflow ${overflow}px at ${label} ` +
        `(viewport ${page.viewportSize().width}px)`
    );
  }
}

async function dumpPage(page, label) {
  try {
    const url = page.url();
    const text = (
      await page.evaluate(() => (document.body?.innerText || '').slice(0, 800))
    ).replace(/\s+/g, ' ');
    console.error(`smoke-auth-learning-path dump (${label}) ${url}: ${text}`);
  } catch (err) {
    console.error(`smoke-auth-learning-path dump (${label}) failed: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// SERVER FIXTURE
//
// `pullAndMerge` reads srs_state, decks, settings and stats_daily over
// PostgREST. Answering them all with `[]` (as the guest smoke does) makes the
// reconcile a no-op, and a no-op reconcile cannot show that anything was
// restored — so steps 3 and 4 get a POPULATED server instead.
//
// Everything here is synthetic and never leaves the intercepted page.
// ─────────────────────────────────────────────────────────────────────────

/** A day well before the run, so it can only have come from the server. */
const SERVER_ONLY_DAY = '2026-01-15';
/** Values local storage never held. Their presence after a reload IS the proof. */
const SERVER_ONLY_BEST_STREAK = 77;
const SERVER_ONLY_DAY_TOTAL = 9;
const LEAGUE_ID = 'smoke-league';
/** A league already settled AND already claimed — step 4 asserts it is not re-paid. */
const CLAIMED_LEAGUE_ID = 'smoke-league-past';

function mondayOfThisWeek() {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function serverSettingsRow() {
  return {
    data: {
      goal: 50,
      soundOn: false,
      achievements: {},
      lastGoalMet: null,
      frozenDays: {},
      // Server-only sentinel #1.
      bestStreak: SERVER_ONLY_BEST_STREAK,
      lastReconcileDay: null,
      // The past league is ALREADY claimed. useLeagueRewards must therefore
      // pay nothing, even though the settled result below says we won it.
      leagueClaimed: [CLAIMED_LEAGUE_ID],
      learnedWords: {},
      level: 'a1',
      levelUpdatedAt: 1,
      settingsUpdatedAt: 1,
    },
    learned_by_deck: {},
  };
}

function serverDailyRows() {
  return [
    {
      // Server-only sentinel #2: a day the local blob has never seen.
      day: SERVER_ONLY_DAY,
      counters: {
        total: SERVER_ONLY_DAY_TOTAL,
        bonusXp: 0,
        byTab: { chat: 0, alphabet: 0, vocab: SERVER_ONLY_DAY_TOTAL, translate: 0 },
        byLevel: {
          a1: { correct: SERVER_ONLY_DAY_TOTAL, almost: 0, wrong: 0 },
          a2: { correct: 0, almost: 0, wrong: 0 },
          b1: { correct: 0, almost: 0, wrong: 0 },
        },
      },
    },
  ];
}

/**
 * Cohort size for the fixture.
 *
 * NOT 12. At n=12 `zoneCounts` gives promote=7 / demote=5, so
 * relegationStart (12-5=7) is not > promote (7): the two zones meet exactly
 * and the widget draws ONE divider, correctly. A 12-row fixture therefore
 * cannot show the relegation label, and a smoke that demanded it would be
 * asserting a bug that is not one. 15 rows separates them (7 and 10).
 */
const LEAGUE_ROWS = 15;

/** Rows enough to fill the promotion zone, the relegation zone and the middle. */
function serverStandingsRows(selfId) {
  return Array.from({ length: LEAGUE_ROWS }, (_, i) => ({
    user_id: i === 3 ? selfId : `peer-${i}`,
    handle: i === 3 ? 'Smoke' : `Lernende ${i + 1}`,
    // Step must keep every row positive across LEAGUE_ROWS: weekly XP is a
    // count and a negative one would be fixture noise, not a real standing.
    weekly_xp: 900 - i * 55,
    rank: i + 1,
  }));
}

/**
 * Answer Supabase + the league API with the fixture.
 *
 * PostgREST puts both `league_members` reads on the same path and they are
 * told apart by `select=`: the standings ask for handle/weekly_xp, the
 * settled-results read asks for `result`. Dispatching on that is what lets
 * one route serve both without either shadowing the other.
 */
async function routeServerFixture(page, selfId) {
  const json = (body, status = 200) => ({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });

  await page.route('**/rest/v1/**', (route) => {
    const url = route.request().url();
    if (route.request().method() !== 'GET') return route.fulfill(json([]));
    if (url.includes('/league_members')) {
      if (/select=[^&]*result/.test(url)) {
        // Settled and WON — but its id is in `leagueClaimed` already.
        return route.fulfill(json([{ league_id: CLAIMED_LEAGUE_ID, rank: 1, result: 'won' }]));
      }
      return route.fulfill(json(serverStandingsRows(selfId)));
    }
    if (url.includes('/settings')) return route.fulfill(json([serverSettingsRow()]));
    if (url.includes('/stats_daily')) return route.fulfill(json(serverDailyRows()));
    return route.fulfill(json([]));
  });

  const monday = mondayOfThisWeek();
  await page.route('**/api/v1/league/join', (r) =>
    r.fulfill(json({ league_id: LEAGUE_ID, tier: 2, period_start: monday.toISOString() }))
  );
  await page.route('**/api/v1/league/refresh', (r) => r.fulfill(json({ ok: true })));
  await page.route('**/api/v1/league/profile*', (r) =>
    r.fulfill(json({ handle: 'Smoke', tier: 2, total_xp: 4200, longest_streak: 31 }))
  );
}

/**
 * Watch the reconcile's reads so step 3 can wait for it to FINISH.
 *
 * `syncStatus.settled` is the right signal and it is not reachable from here:
 * it lives in a module closure in the bundle and is never put on `window` or
 * in the DOM. The nearest honest external equivalent is "the reconcile's
 * table reads have come back", which — like `settled`, and unlike
 * `lastSyncedAt` — is satisfied whether they succeeded or failed.
 *
 * The waiter therefore never throws on timeout. If the reconcile really did
 * not happen, the restore assertions say so with a real message instead.
 */
function watchReconcile(page) {
  const seen = new Set();
  page.on('response', (res) => {
    const url = res.url();
    if (!url.includes('/rest/v1/')) return;
    for (const table of ['settings', 'stats_daily', 'srs_state']) {
      if (url.includes(`/${table}`)) seen.add(table);
    }
  });
  return seen;
}

async function waitForReconcile(page, seen, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  const wanted = ['settings', 'stats_daily', 'srs_state'];
  while (Date.now() < deadline) {
    if (wanted.every((t) => seen.has(t))) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────
// SMOKE STEPS
// ─────────────────────────────────────────────────────────────────────────

/**
 * STEP 1 — Mock session restoration, without secrets.  ✅ IMPLEMENTED
 *
 * The seed itself is installed in `main` via `installSignedInSeed`, before
 * the context's first page exists — see that function for why it cannot be
 * done here with `evaluate`.
 *
 * What this asserts is that the app ACCEPTED it. "A header exists" is not
 * that test: the header renders for a guest too, and an earlier draft of
 * this file passed on the guest shell for exactly that reason. AccountChip
 * is the discriminator — signed out it renders a "Sign in" button, signed in
 * it renders a `aria-label="Account"` avatar button with the email initial.
 * Both directions are asserted, so a chip that renders BOTH (a half-restored
 * session) fails too.
 */
async function stepRestoreSession(context, page, seed) {
  void context;
  void seed;

  const account = mastheadAccountButton(page);
  const signIn = page.getByRole('button', { name: 'Sign in', exact: true });

  try {
    await account.waitFor({ state: 'visible', timeout: 10000 });
  } catch (err) {
    // Ambiguity reaches this catch too — `waitFor` on a 2-match locator throws
    // a strict-mode violation, not a timeout — and blaming the session seed for
    // it sends the next reader to entirely the wrong layer. Ask which failure
    // this actually is before naming a cause.
    await assertNoMastheadAccountAmbiguity(page, 'session restore');
    throw new Error(
      'smoke-auth-learning-path: signed-in pass never reached the account chrome. ' +
        'The session seed no longer satisfies useAuth — check SESSION_KEY ' +
        `(${SESSION_KEY}) and expires_at.`,
      { cause: err }
    );
  }

  if (await signIn.isVisible().catch(() => false)) {
    throw new Error(
      'smoke-auth-learning-path: "Sign in" is showing alongside the account chip — ' +
        'the session restored only partially.'
    );
  }

  // The seed is a fake string, not a credential, and it must stay that way.
  const seeded = await page.evaluate((key) => {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
      return null;
    }
  }, SESSION_KEY);
  if (!seeded || seeded.access_token !== stubSession().access_token) {
    throw new Error(
      'smoke-auth-learning-path: the stored session is not the stub one this run seeded.'
    );
  }
}

/**
 * Capture the progress-sync lane.
 *
 * Registered BEFORE the catch-all so it wins: Playwright matches the most
 * recently registered handler first.
 *
 * It ANSWERS 200 rather than 503 like the guest smoke does. A 503 leaves the
 * event at the head of the queue and `flushQueue` returns, so the queue never
 * drains and the round-trip half of the assertion could not be made.
 */
async function captureProgressSync(page) {
  const posts = [];
  await page.route('**/api/v1/progress/events', async (route) => {
    const req = route.request();
    let body;
    try {
      body = JSON.parse(req.postData() ?? 'null');
    } catch {
      body = { __unparseable: req.postData() };
    }
    posts.push({ method: req.method(), auth: req.headers().authorization ?? null, body });
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true }),
    });
  });
  return posts;
}

/** The card currently on screen, matched by headword. */
async function visibleCard(page, cards) {
  return page.evaluate((payload) => {
    const text = document.body.innerText || '';
    return payload.find((card) => text.includes(card.de)) ?? null;
  }, cards);
}

/**
 * Answer with `choice` and return the id that answer enqueued.
 *
 * The answer click itself enqueues (VocabTab's chooseOption → recordEvent →
 * `enqueue`, which APPENDS), so the queue tail right after that handler is
 * this answer's event. The click and the read run in ONE browser task: a flush
 * already in flight can only resume after the task ends, so it cannot send or
 * shift the event in between. Reading after a later step (the old read came
 * after GOOD) raced the flush and could find the queue already empty.
 *
 * The trial click keeps Playwright's actionability checks — visible, enabled,
 * not covered by an overlay — that a bare `el.click()` would skip.
 *
 * This is what makes step 2 specific. Counting POSTs cannot work — see the
 * backlog note on `stepCompleteExerciseAndSync`.
 */
async function answerAndCaptureId(choice) {
  await choice.click({ trial: true });
  return choice.evaluate((el, key) => {
    el.click();
    try {
      const q = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(q) && q.length ? (q[q.length - 1]?.id ?? null) : null;
    } catch {
      return null;
    }
  }, QUEUE_KEY);
}

/**
 * Answer through the queue until DeckCompleteBanner. Ported from the guest
 * smoke, plus the per-answer id capture.
 *
 * @returns {Promise<string[]>} the id enqueued by each answer, in order.
 */
async function practiceUntilComplete(page, seed) {
  const empty = page.getByText('Select a deck to start.');
  const complete = page.getByText(/Deck complete/);
  await page.waitForFunction(
    (des) => des.some((de) => (document.body.innerText || '').includes(de)),
    seed.cards.map((card) => card.de),
    { timeout: 10000 }
  );
  const budget = seed.cards.length + 2;
  const enqueued = [];

  for (let i = 0; i < budget; i += 1) {
    if (await complete.isVisible().catch(() => false)) return enqueued;
    if (await empty.isVisible().catch(() => false)) {
      throw new Error(
        'smoke-auth-learning-path: empty "Select a deck to start." state after a card'
      );
    }

    const card = await visibleCard(page, seed.cards);
    if (!card) {
      throw new Error(`smoke-auth-learning-path: no food-deck headword visible on card ${i + 1}`);
    }

    const choice = page.getByRole('button', { name: card.en, exact: true });
    await choice.waitFor({ state: 'visible', timeout: 10000 });
    const id = await answerAndCaptureId(choice);

    const good = page.getByRole('button', { name: 'GOOD', exact: true });
    await good.waitFor({ state: 'visible', timeout: 10000 });
    await good.click();

    if (!id) {
      throw new Error(
        `smoke-auth-learning-path: answering card ${i + 1} enqueued nothing — ` +
          'recordEvent is not reaching the progress queue.'
      );
    }
    if (enqueued.includes(id)) {
      throw new Error(
        `smoke-auth-learning-path: card ${i + 1} reused idempotency id ${id} — ` +
          'newEventId is not producing a fresh key per answer.'
      );
    }
    enqueued.push(id);

    // VocabTab's click-lock swallows the next choice for 200ms after a verdict.
    await page.waitForTimeout(CLICK_LOCK_MS);
  }

  if (!(await complete.isVisible().catch(() => false))) {
    throw new Error('smoke-auth-learning-path: queue emptied without DeckCompleteBanner');
  }
  return enqueued;
}

/** Wait until every id in `wanted` has been seen on the wire. */
async function waitForSyncedIds(page, posts, wanted, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  const seen = () => new Set(posts.map((p) => p.body?.id));
  while (Date.now() < deadline) {
    const have = seen();
    if (wanted.every((id) => have.has(id))) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

/** Poll the progress queue to empty. Polled, not read once: a flush cycle is async. */
async function waitForQueueDrained(page, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await page.evaluate((key) => {
      try {
        return JSON.parse(localStorage.getItem(key) || '[]')?.length ?? null;
      } catch {
        return null;
      }
    }, QUEUE_KEY);
    if (last === 0) return 0;
    await page.waitForTimeout(250);
  }
  return last;
}

/**
 * STEP 2 — Complete an exercise and check the sync request.  ✅ IMPLEMENTED
 *
 * The lane: answering dispatches `deutsch:progress` → App schedules a flush
 * (500ms) → `flushQueue` POSTs each queued event to
 * `/api/v1/progress/events` with a bearer token. Note this flush is gated on
 * a JWT, NOT on VITE_SYNC_ENABLED — sync off must not strand answers. That is
 * why step 2 works without the flag and step 3 will need it.
 *
 * ── Why this keys on ids and never on counts ─────────────────────────────
 * A first draft asserted "at least as many POSTs as cards answered" and went
 * green reporting 65 events for 3 cards. Those 62 extras are real:
 * `expandGuestBacklog` diffs local daily counters against what the server
 * has, and our `/rest/v1` stub always answers empty, so the whole local day
 * is re-expanded into catch-up events on EVERY flush. They are synthesised
 * to be indistinguishable from real ones — same tab, same level, same
 * dateKey — so no payload filter can separate them either.
 *
 * That assertion would therefore have passed with per-answer sync entirely
 * dead. The fix is to capture the id each answer actually enqueues (the
 * queue tail at the answer click, see `answerAndCaptureId`) and require THOSE
 * exact ids on the wire.
 * If `recordEvent` stops enqueuing, the capture fails; if the flush stops
 * POSTing, the ids never arrive. Backlog noise cannot satisfy either.
 *
 * Asserted here, rather than "no error appeared" — a dead sync lane is
 * silent, so absence of an error is not evidence a request was made:
 *   - one freshly-enqueued event per answered card, ids distinct;
 *   - every one of those ids reaching /api/v1/progress/events;
 *   - each carrying the stub bearer and a well-formed UUID id;
 *   - the payload matching what the learner did (vocab / a1 / de, today,
 *     a real verdict);
 *   - the queue draining, which is the round-trip half: `flushQueue` only
 *     shifts an event off after a 200.
 */
async function stepCompleteExerciseAndSync(page, seed, posts) {
  const enqueued = await practiceUntilComplete(page, seed);
  if (enqueued.length < 1) {
    throw new Error('smoke-auth-learning-path: the deck was already complete — nothing practised.');
  }

  if (!(await waitForSyncedIds(page, posts, enqueued))) {
    const seen = new Set(posts.map((p) => p.body?.id));
    const missing = enqueued.filter((id) => !seen.has(id));
    throw new Error(
      `smoke-auth-learning-path: ${missing.length} of ${enqueued.length} answered event(s) ` +
        `never reached /api/v1/progress/events (${missing.join(', ')}) — the sync lane is ` +
        `not firing. ${posts.length} POST(s) were seen in total.`
    );
  }

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const today = new Date();
  const dateKey = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');

  const byId = new Map();
  for (const post of posts) {
    if (post.body?.id && !byId.has(post.body.id)) byId.set(post.body.id, post);
  }

  for (const id of enqueued) {
    const { method, auth, body } = byId.get(id);
    if (method !== 'POST') {
      throw new Error(`smoke-auth-learning-path: progress event sent as ${method}, not POST.`);
    }
    if (auth !== EXPECTED_BEARER) {
      // Never print the header: say which check failed, not what it held.
      throw new Error(
        'smoke-auth-learning-path: progress POST did not carry the seeded bearer token.'
      );
    }
    if (!UUID.test(body.id)) {
      throw new Error(`smoke-auth-learning-path: idempotency id is not a UUID (${body.id}).`);
    }
    if (body.tab !== 'vocab') {
      throw new Error(`smoke-auth-learning-path: expected tab "vocab", got "${body.tab}".`);
    }
    if (body.level !== 'a1') {
      throw new Error(`smoke-auth-learning-path: expected level "a1", got "${body.level}".`);
    }
    if ((body.packId ?? 'de') !== 'de') {
      throw new Error(`smoke-auth-learning-path: expected packId "de", got "${body.packId}".`);
    }
    if (body.dateKey !== dateKey) {
      throw new Error(
        `smoke-auth-learning-path: dateKey ${body.dateKey} is not today (${dateKey}).`
      );
    }
    if (!['correct', 'almost', 'wrong'].includes(body.verdict)) {
      throw new Error(`smoke-auth-learning-path: unknown verdict "${body.verdict}".`);
    }
  }

  const left = await waitForQueueDrained(page);
  if (left !== 0) {
    throw new Error(
      `smoke-auth-learning-path: progress queue did not drain after the server acked ` +
        `(${left ?? 'unreadable'} left).`
    );
  }

  console.log(
    `  step 2: ${enqueued.length} answered event(s) synced and acked ` +
      `(${posts.length} POSTs total, incl. guest-backlog catch-up)`
  );
}

/**
 * STEP 3 — Refresh and verify progress persistence.  ✅ IMPLEMENTED
 *
 * The weak version of this step reloads and checks localStorage still holds
 * the progress. That passes with the reconcile lane completely dead, because
 * localStorage is the offline source of truth and survives a reload on its
 * own. It proves nothing about sync.
 *
 * So this WIPES the local blob first and reloads with only the session left,
 * then requires the state to come back from the server fixture. Two values
 * are seeded that local never held — `bestStreak: 77` and a whole day at
 * 2026-01-15 — and their arrival is the proof: they can only have come down
 * the reconcile.
 *
 * Double-count check: with local emptied, `mergeDailyAdditive` contributes
 * local−lastSynced = 0, so the merged day must equal the server's exactly.
 * A day that comes back at 2x the fixture is the additive-merge runaway.
 */
async function stepRefreshAndVerifyPersistence(page, seed) {
  void seed;

  // Keep the session and the level key; drop everything the reconcile should
  // be able to rebuild. The level key stays because losing it opens the
  // placement gate, which is a different surface and not what this measures.
  await page.evaluate(
    ({ stateKey, queueKey }) => {
      localStorage.removeItem(stateKey);
      localStorage.removeItem(queueKey);
      // Let the baseline init script re-seed nothing: we WANT an empty blob.
      sessionStorage.setItem('__smoke_auth_learning_path_seeded', '1');
    },
    { stateKey: STATE_KEY, queueKey: QUEUE_KEY }
  );

  const wiped = await page.evaluate((k) => localStorage.getItem(k), STATE_KEY);
  if (wiped) {
    throw new Error('smoke-auth-learning-path: could not clear local state before the reload.');
  }

  const reconciled = watchReconcile(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await dismissEntryScreens(page);
  await waitForReconcile(page, reconciled);

  // Poll: the merge lands a tick after the reads resolve.
  let restored = null;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    restored = await page.evaluate((k) => {
      try {
        return JSON.parse(localStorage.getItem(k) || 'null');
      } catch {
        return null;
      }
    }, STATE_KEY);
    if (restored?.daily?.[SERVER_ONLY_DAY]) break;
    await page.waitForTimeout(250);
  }

  if (!restored) {
    throw new Error(
      'smoke-auth-learning-path: local state was still empty after the reload — ' +
        `the reconcile did not restore anything (tables seen: ${[...reconciled].join(', ') || 'none'}).`
    );
  }

  const day = restored.daily?.[SERVER_ONLY_DAY];
  if (!day) {
    throw new Error(
      `smoke-auth-learning-path: ${SERVER_ONLY_DAY} is absent after the reload. That day exists ` +
        'only on the server, so progress did NOT come back down the reconcile ' +
        `(tables seen: ${[...reconciled].join(', ') || 'none'}).`
    );
  }
  if (day.total !== SERVER_ONLY_DAY_TOTAL) {
    throw new Error(
      `smoke-auth-learning-path: ${SERVER_ONLY_DAY} came back at total=${day.total}, expected ` +
        `${SERVER_ONLY_DAY_TOTAL}. A doubled total is the additive daily merge re-adding a ` +
        'delta on top of an already-incremented row.'
    );
  }

  const best = restored.gamification?.bestStreak;
  if (best !== SERVER_ONLY_BEST_STREAK) {
    throw new Error(
      `smoke-auth-learning-path: bestStreak is ${best}, expected the server's ` +
        `${SERVER_ONLY_BEST_STREAK} — settings did not survive the reconcile.`
    );
  }

  console.log(
    `  step 3: restored from server after a local wipe ` +
      `(${SERVER_ONLY_DAY} total=${day.total}, bestStreak=${best})`
  );
}

/**
 * STEP 4 — Open leagues and check the table.  ✅ IMPLEMENTED
 *
 * The surface fails SOFT: any throw in LeaderboardSection's effect renders
 * "Couldn't load your league." — one short line where a twelve-row table
 * should be. A run that only asserted "the Ligen heading is present" would
 * pass on that error line, which is exactly the state that hides every row.
 * So the error line and the loading line are both asserted ABSENT first, and
 * the rows are then read positively.
 *
 * The 12-row fixture is sized to populate all three row styles the widget
 * distinguishes: the promotion zone, the untouched middle, and the
 * relegation zone.
 *
 * Rows are real `<button>`s inside the `<li>`, not clickable list items —
 * 14 of them once shipped dead to Tab with 1600 tests green, so their
 * presence in the tab order is asserted, not assumed.
 *
 * Re-claim: the fixture reports a settled league we WON whose id is already
 * in `leagueClaimed`. Nothing may be paid out for it again — that is the
 * #298/#303 bug class, where a load-time decision reads "absence" out of
 * local state before the reconcile has landed.
 */
async function stepOpenLeagues(page) {
  // The leagues surface lives in StatsTab, which the nav labels "Profile"
  // (section 06) — there is no "Stats" tab to click, and since the segmented
  // control went, no sub-tab either: opening Profile IS opening leagues.
  const nav = page.getByRole('navigation');
  const profile = nav.getByRole('button', { name: /Profile/i });
  await profile.waitFor({ state: 'visible', timeout: 10000 });
  await profile.click();

  // No click from here on. Leagues used to be a segment in a STATS / LEAGUES /
  // SETTINGS control with its own "Ligen" hero; the Profile tab is one page
  // now, so the league card and the full standings are already on screen once
  // Profile opens. Waiting for the card is what tells us the page has painted
  // — the standings below it load separately and are handled after this.
  await page.locator('[data-testid="profile-league"]').waitFor({
    state: 'visible',
    timeout: 10000,
  });

  // The soft-failure surfaces. Wait for the table rather than asserting on a
  // still-loading widget.
  const errorLine = page.getByText(/Couldn.t load your league/i);
  const rowButtons = page.locator('li > button');
  const deadline = Date.now() + 15000;
  let count = 0;
  while (Date.now() < deadline) {
    if (await errorLine.isVisible().catch(() => false)) {
      throw new Error(
        'smoke-auth-learning-path: leagues rendered "Couldn\'t load your league." — the ' +
          'fixture did not satisfy join → refresh → standings, so no row is measurable.'
      );
    }
    count = await rowButtons.count();
    if (count >= LEAGUE_ROWS) break;
    await page.waitForTimeout(250);
  }
  if (
    await page
      .getByText('Loading league…')
      .isVisible()
      .catch(() => false)
  ) {
    throw new Error('smoke-auth-learning-path: leagues never left the loading state.');
  }
  if (count !== LEAGUE_ROWS) {
    throw new Error(
      `smoke-auth-learning-path: leagues showed ${count} row(s), expected the fixture's ` +
        `${LEAGUE_ROWS}.`
    );
  }

  // Rank order: the widget numbers rows itself, so read the rendered rank
  // bubble rather than trusting the fixture's own `rank` column. The caller's
  // row is the one the table marks as theirs (`data-me` on its list item) —
  // weight alone no longer identifies it, because the gold first-place row is
  // set bold too.
  const rendered = await rowButtons.evaluateAll((els) =>
    els.map((el) => ({
      text: (el.innerText || '').replace(/\s+/g, ' ').trim(),
      rank: (el.querySelector('[aria-label^="Rank "]')?.textContent || '').trim(),
      mine: el.parentElement?.hasAttribute('data-me') ?? false,
      tag: el.tagName,
    }))
  );

  // Capture an optional sign: `\d+` alone reads "-80 XP" as 80, which would
  // turn a negative standing into an ascending-order failure pointing at the
  // wrong thing (it did, once).
  const xps = rendered.map((r) => Number(/(-?\d+)\s*XP/.exec(r.text)?.[1] ?? NaN));
  if (xps.some(Number.isNaN)) {
    throw new Error('smoke-auth-learning-path: a league row rendered no XP figure.');
  }
  for (let i = 1; i < xps.length; i += 1) {
    if (xps[i] > xps[i - 1]) {
      throw new Error(
        `smoke-auth-learning-path: league rows are not in descending XP order ` +
          `(row ${i} has ${xps[i]} XP after ${xps[i - 1]}).`
      );
    }
  }
  for (let i = 0; i < rendered.length; i += 1) {
    if (rendered[i].rank !== String(i + 1)) {
      throw new Error(
        `smoke-auth-learning-path: row ${i + 1} is numbered "${rendered[i].rank}" ` +
          `("${rendered[i].text.slice(0, 20)}").`
      );
    }
  }

  // The caller's own row is the 4th in the fixture and must be the marked one.
  const mine = rendered.filter((r) => r.mine);
  if (mine.length !== 1 || !mine[0].text.includes('Smoke')) {
    throw new Error(
      `smoke-auth-learning-path: expected exactly one highlighted row (the caller's), ` +
        `got ${mine.length}.`
    );
  }
  if (!rendered[3].mine) {
    throw new Error("smoke-auth-learning-path: the highlighted row is not the caller's rank 4.");
  }

  // Zone dividers, predicted by the same pure module the widget uses — and
  // by the widget's own render conditions, so this tracks the app rather than
  // a number copied out of it.
  const { promote, demote } = zoneCounts(LEAGUE_ROWS);
  const relegationStart = LEAGUE_ROWS - demote;
  const expectPromote = promote > 0 && promote < LEAGUE_ROWS;
  const expectRelegate = demote > 0 && relegationStart > promote;
  if (!expectPromote || !expectRelegate) {
    throw new Error(
      `smoke-auth-learning-path: the ${LEAGUE_ROWS}-row fixture no longer separates the zones ` +
        `(promote=${promote}, demote=${demote}) — resize it so both dividers render.`
    );
  }
  // The arrows are icons now (the zone colour lives on them and on the rules,
  // not on the label text), so match the label word.
  for (const [label, re] of [
    ['Promotion', /^Promotion$/i],
    ['Relegation', /^Relegation$/i],
  ]) {
    if (
      !(await page
        .getByText(re)
        .first()
        .isVisible()
        .catch(() => false))
    ) {
      throw new Error(`smoke-auth-learning-path: zone label "${label}" is missing from the table.`);
    }
  }

  // Keyboard reachability: a native button, and focusable.
  if (rendered.some((r) => r.tag !== 'BUTTON')) {
    throw new Error(
      'smoke-auth-learning-path: a league row is not a native <button> — rows like that are ' +
        'dead to Tab however many tests pass.'
    );
  }
  const focusable = await rowButtons.first().evaluate((el) => {
    el.focus();
    return document.activeElement === el;
  });
  if (!focusable) {
    throw new Error('smoke-auth-learning-path: a league row would not take keyboard focus.');
  }

  // Already-claimed league must not pay out again.
  const claimToast = page.getByText(/Liga gewonnen|Ligen gewonnen/);
  if (await claimToast.isVisible().catch(() => false)) {
    throw new Error(
      'smoke-auth-learning-path: a league-winner reward fired for a league already in ' +
        'leagueClaimed — the bonus is being re-awarded on load.'
    );
  }

  console.log(
    `  step 4: ${count} league rows, ranked, caller highlighted, ` +
      `dividers at ${promote}/${relegationStart}, focus OK`
  );
}

/**
 * STEP 5 — Account controls and logout.  ✅ IMPLEMENTED
 *
 * Opens the AccountChip sheet and reads its CONTENTS, not just its trigger.
 * The trigger "rode along" in every earlier pass; the sheet's inside — the
 * email line and the red Sign out — is a surface that only exists once a
 * session does.
 *
 * Export and delete are NOT in this sheet: it is deliberately a
 * glance-and-escape, and full account management lives in the Settings
 * route. Both are checked there, and delete is only checked for PRESENCE —
 * it is destructive and there is no safe stub for it here.
 *
 * ── The logout collision ─────────────────────────────────────────────────
 * `signOutAndReset` hard-reloads, which re-runs the context init scripts. The
 * session seed would therefore reinstate the session and a broken logout
 * would pass. `NO_RESEED_FLAG` is set first, in sessionStorage, which
 * `clearUserLocalState` does not wipe — so the seed stands down for exactly
 * this one navigation and the assertion measures the app, not the harness.
 */
async function stepAccountControlsAndLogout(page) {
  // Settings first, while still signed in: export + delete live there.
  const nav = page.getByRole('navigation');
  await nav.getByRole('button', { name: /Profile/i }).click();
  // The door to Settings is a button on the profile page now, not a segment
  // in a STATS / LEAGUES / SETTINGS control. Signed in it reads "Edit
  // profile" — the spec's secondary self action, and the same destination the
  // account sheet opens.
  const settingsDoor = page.getByRole('button', { name: 'Edit profile', exact: true });
  await settingsDoor.waitFor({ state: 'visible', timeout: 10000 });
  await settingsDoor.click();

  for (const label of ['Export my data', 'Delete account']) {
    const control = page.getByRole('button', { name: label, exact: true });
    if (!(await control.isVisible().catch(() => false))) {
      throw new Error(`smoke-auth-learning-path: Settings is missing the "${label}" control.`);
    }
  }
  // Deliberately NOT clicked. Presence is the whole assertion for delete.

  // The chip sheet. Scoped to the banner: the Settings route this step is
  // standing on carries its own "Account" button (#311).
  await assertNoMastheadAccountAmbiguity(page, 'Settings');
  const account = mastheadAccountButton(page);
  await account.waitFor({ state: 'visible', timeout: 10000 });
  await account.click();

  const sheet = page.getByRole('dialog', { name: 'Account' });
  await sheet.waitFor({ state: 'visible', timeout: 10000 });

  const email = stubSession().user.email;
  if (
    !(await sheet
      .getByText(email, { exact: false })
      .isVisible()
      .catch(() => false))
  ) {
    throw new Error(
      `smoke-auth-learning-path: the account sheet does not show the signed-in email (${email}).`
    );
  }
  if (
    !(await sheet
      .getByRole('button', { name: 'Open settings' })
      .isVisible()
      .catch(() => false))
  ) {
    throw new Error('smoke-auth-learning-path: the account sheet is missing "Open settings".');
  }

  // The sheet carries BOTH destinations again. It had an "Open profile" row
  // beside Settings until #314, when the tabbed Settings route made the two a
  // second name for one place. That premise died when the Profile tab became
  // a single consolidated page and Settings became a route off it: they are
  // two destinations now, and the sheet names both.
  //
  // Still asserted as a COUNT and not just a presence, for the reason the old
  // version gave: a duplicated row passes a bare "is it there" check. Sign out
  // is excluded — it is not a navigation row.
  const navRows = await sheet
    .getByRole('button')
    .filter({ hasText: /Your profile|Settings/ })
    .allInnerTexts();
  const normalised = navRows.map((t) => t.trim()).sort();
  if (normalised.length !== 2 || normalised.join('|') !== 'Settings|Your profile') {
    throw new Error(
      'smoke-auth-learning-path: expected exactly two navigation rows ("Your profile", ' +
        `"Settings") in the account sheet, found ${navRows.length}: ${JSON.stringify(navRows)}`
    );
  }

  const signOut = sheet.getByRole('button', { name: 'Sign out', exact: true });
  if (!(await signOut.isVisible().catch(() => false))) {
    throw new Error('smoke-auth-learning-path: the account sheet has no Sign out control.');
  }

  // Stand the seed down for the reload signOutAndReset is about to perform.
  await page.evaluate((flag) => sessionStorage.setItem(flag, '1'), NO_RESEED_FLAG);

  await signOut.click();

  // The app hard-navigates; wait for the guest shell rather than a timeout.
  const signIn = page.getByRole('button', { name: 'Sign in', exact: true });
  try {
    await signIn.waitFor({ state: 'visible', timeout: 20000 });
  } catch (err) {
    throw new Error(
      'smoke-auth-learning-path: after Sign out the app never returned to the guest shell — ' +
        '"Sign in" never appeared.',
      { cause: err }
    );
  }

  if (await account.isVisible().catch(() => false)) {
    throw new Error('smoke-auth-learning-path: the account chip is still showing after Sign out.');
  }

  const stale = await page.evaluate((key) => localStorage.getItem(key), SESSION_KEY);
  if (stale) {
    throw new Error(
      'smoke-auth-learning-path: the session key survived Sign out — local state was not cleared.'
    );
  }

  console.log('  step 5: account sheet verified, signed out, session cleared');
}

/**
 * Per-child right-edge overflow.
 *
 * `scrollWidth - clientWidth` on the documentElement cannot see this class of
 * break: `minWidth: 0` on a flex child means the overflow renders as
 * text-on-text and NEVER widens the container, so the page reports zero
 * overflow while content is illegibly stacked. The only way to catch it is to
 * compare each child's right edge against its own parent's.
 *
 * Scoped to the chrome that has a fixed width budget (header, nav, footer) —
 * a blanket sweep of every node reports scrolling regions as findings.
 */
async function assertNoChildOverflow(page, label) {
  const spills = await page.evaluate(() => {
    const out = [];
    const roots = document.querySelectorAll('header, nav, footer');
    for (const root of roots) {
      const parentRight = root.getBoundingClientRect().right;
      for (const child of root.querySelectorAll('*')) {
        const r = child.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        // 1px of rounding is not a finding.
        if (r.right > parentRight + 1) {
          out.push({
            tag: child.tagName,
            text: (child.textContent || '').trim().slice(0, 30),
            over: Math.round(r.right - parentRight),
          });
        }
      }
    }
    return out;
  });
  if (spills.length) {
    const worst = spills.sort((a, b) => b.over - a.over)[0];
    throw new Error(
      `smoke-auth-learning-path: ${spills.length} element(s) spill past their container at ` +
        `${label} — worst is <${worst.tag}> "${worst.text}" by ${worst.over}px.`
    );
  }
}

/**
 * The nav drops its labels rather than clipping them when they stop fitting.
 *
 * At 320 the header budget is about 10px, so this is the width where the
 * decision has to have been made. Asserted as a biconditional: labels present
 * means they must fit; labels absent means they must not have.
 */
async function assertNavLabelPolicy(page, label, expectNav) {
  const nav = await page.evaluate(() => {
    const el = document.querySelector('nav');
    if (!el) return null;
    const buttons = [...el.querySelectorAll('button')];
    const withText = buttons.filter((b) => (b.textContent || '').trim().length > 2);
    return {
      buttons: buttons.length,
      labelled: withText.length,
      spills: buttons.some((b) => b.scrollWidth > b.clientWidth + 1),
    };
  });
  if (!nav) {
    // The entry screen genuinely has no nav — only the signed-in shell does.
    // Callers say which surface they are on rather than this guessing, so a
    // nav that vanishes from the SHELL is still a failure.
    if (!expectNav) return;
    throw new Error(`smoke-auth-learning-path: no <nav> at ${label}.`);
  }
  if (!expectNav) {
    throw new Error(
      `smoke-auth-learning-path: a <nav> is present at ${label}, where the entry screen ` +
        'should be showing — sign-out did not return to the guest surface.'
    );
  }
  if (nav.buttons === 0)
    throw new Error(`smoke-auth-learning-path: nav has no buttons at ${label}.`);
  if (nav.spills) {
    throw new Error(
      `smoke-auth-learning-path: a nav button clips its own label at ${label} — the nav should ` +
        'drop to icon-only before it truncates.'
    );
  }
}

/**
 * STEP 6 — Viewport responsive checks at 1280 / 375 / 320.  ✅ IMPLEMENTED
 *
 * Runs at every labelled surface in the walk, and the VIEWPORTS loop in
 * `main` drives all three widths, so each assertion below is made three
 * times against a differently-sized shell.
 */
async function stepViewportChecks(page, label, { expectNav = true } = {}) {
  await assertNoOverflow(page, label);
  await assertNoChildOverflow(page, label);
  await assertNavLabelPolicy(page, label, expectNav);
}

/** Navigate to Vocab and select the seeded deck. */
async function openSeededDeck(page) {
  const nav = page.getByRole('navigation');
  const vocab = nav.getByRole('button', { name: 'Vocab', exact: true });
  await vocab.waitFor({ state: 'visible', timeout: 10000 });
  await vocab.click();
  if ((await vocab.getAttribute('aria-current')) !== 'page') {
    throw new Error('smoke-auth-learning-path: Vocab did not become the active tab.');
  }

  await openDeckPicker(page);
  const food = page.getByRole('button', { name: /Food & Drink/i });
  await food.waitFor({ state: 'visible', timeout: 10000 });
  if ((await food.getAttribute('aria-pressed')) !== 'true') {
    await food.click();
    await page.waitForTimeout(300);
    // Picking a deck closes the mobile drawer, which takes the rows out of
    // the accessibility tree; reopen it so the check below can see them.
    await openDeckPicker(page);
  }
  if ((await food.getAttribute('aria-pressed')) !== 'true') {
    throw new Error('smoke-auth-learning-path: Food & Drink never became the selected deck.');
  }
}

/** One full signed-in walk at one viewport. */
async function walkViewport(context, page, vp, seed) {
  const label = `${vp.name}@${vp.width}`;
  console.log(`→ ${label}`);
  await page.setViewportSize({ width: vp.width, height: vp.height });

  // Closed to the real network first, then the progress lane on top — the
  // later registration wins in Playwright, so the specific route is the one
  // that answers. Unlike the guest smoke these ANSWER rather than 503,
  // because steps 2-4 assert on what comes back.
  const json = (body, status = 200) => ({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
  await page.route('**/api/**', (r) => r.fulfill(json({ error: 'smoke-offline' }, 503)));
  await page.route('**/auth/v1/**', (r) => r.fulfill(json({})));
  // Populated server + league API. Registered after the catch-alls so it wins.
  await routeServerFixture(page, stubSession().user.id);
  const posts = await captureProgressSync(page);

  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);

  await stepRestoreSession(context, page, seed);
  await dismissEntryScreens(page);
  await stepViewportChecks(page, `${label} home`);

  await openSeededDeck(page);
  await stepViewportChecks(page, `${label} vocab`);
  await stepCompleteExerciseAndSync(page, seed, posts);

  await stepRefreshAndVerifyPersistence(page, seed);
  await stepViewportChecks(page, `${label} after-reload`);

  await stepOpenLeagues(page);
  await stepViewportChecks(page, `${label} leagues`);

  await stepAccountControlsAndLogout(page);
  // Post-logout the entry screen is showing, which has no nav by design.
  await stepViewportChecks(page, `${label} signed-out`, { expectNav: false });

  console.log(`✓ ${label}`);
}

async function launchBrowser() {
  const args = ['--disable-dev-shm-usage'];
  try {
    return await chromium.launch({ headless: true, args });
  } catch (err) {
    const missing = /Executable doesn't exist|Failed to launch/i.test(String(err?.message ?? err));
    if (!missing) throw err;
    // CI installs Playwright's Chromium. A developer box (and the cloud VM)
    // may only have system Chrome; channel:'chrome' uses that instead of
    // failing a download from cdn.playwright.dev.
    console.log('Playwright Chromium not installed; falling back to system Chrome');
    return await chromium.launch({ headless: true, channel: 'chrome', args });
  }
}

async function main() {
  if (EXPLICIT_BASE) console.log(`Smoking the server at ${BASE} (AUDIT_BASE set).`);
  else await provisionTarget();

  assertNoRealCredentials();
  // Three remaining, not the guest smoke's one: a single event cannot show
  // that ids are DISTINCT, which is the assertion that catches a replay.
  const seed = learningPathSeed({ remaining: 3 });
  console.log(
    `Seed: ${seed.learnedCards.length}/${seed.cards.length} of ${DECK_ID} learned, ` +
      `${seed.remainingCount} left; session key ${SESSION_KEY}`
  );

  const browser = await launchBrowser();
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext();
      await installBaselineSeed(context, seed);
      await installSignedInSeed(context, SESSION_KEY);
      const page = await context.newPage();
      try {
        await walkViewport(context, page, vp, seed);
      } catch (err) {
        await dumpPage(page, `${vp.name}@${vp.width}`);
        // A CI red should say WHICH width broke without needing a rerun.
        try {
          const shot = `smoke-auth-failure-${vp.name}-${vp.width}.png`;
          await page.screenshot({ path: shot, fullPage: true });
          console.error(`smoke-auth-learning-path: screenshot written to ${shot}`);
        } catch {
          // a screenshot failure must not replace the real error
        }
        throw err;
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log(
    `✓ authenticated learning path clean on ${VIEWPORTS.map((v) => `${v.name}@${v.width}`).join(', ')}`
  );
  // The preview child keeps the event loop alive otherwise, so a clean walk
  // would hang until the job times out.
  process.exit(0);
}

main().catch((err) => {
  const message = err?.message || String(err);
  if (!message.startsWith('smoke-auth-learning-path:')) {
    console.error(`smoke-auth-learning-path: ${message}`);
  }
  console.error(err);
  process.exit(1);
});
