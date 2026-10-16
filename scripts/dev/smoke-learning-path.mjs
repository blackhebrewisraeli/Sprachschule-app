#!/usr/bin/env node
/**
 * Browser smoke for the learning path:
 *   Recommendation → Practice → Finish → refresh → progress retained
 *
 * Proves, in a real Chromium page against a production build:
 *   1. A Home recommendation that names a deck opens Vocab on that deck (#277),
 *      as the focused session — no deck library beside it.
 *   2. Completing the last card in the queue shows DeckCompleteBanner (#276),
 *      not the empty "Select a deck to start." state, and not over the library;
 *      Back to decks then returns to the library.
 *   3. After a full reload, the same `deutsch-app-state-v1` blob still holds
 *      learnedByDeck + SRS rows for that practice. No new persistence.
 *
 * Guest-only. No auth, no leagues, no AI. Network to /api and Supabase is
 * stubbed closed so a developer's .env cannot turn this into a flake.
 *
 * Usage:
 *   npm run smoke:learning-path                         # builds and serves itself
 *   AUDIT_BASE=http://localhost:5290 npm run smoke:learning-path
 *   AUDIT_SKIP_BUILD=1 npm run smoke:learning-path      # reuse dist-smoke/
 *
 * Same AUDIT_BASE / AUDIT_SKIP_BUILD contract as audit-contrast.mjs. CI
 * builds and serves in the workflow so the artifact under test is the same
 * production build the other jobs produce.
 *
 * Exit 0 on a clean walk of both viewports; 1 on failure.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DECK_ID,
  STATE_KEY,
  focusedSessionProblem,
  learningPathSeed,
  srsKey,
} from './learning-path-seed.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VITE_BIN = join(REPO_ROOT, 'node_modules', '.bin', 'vite');

const OUT_DIR = 'dist-smoke';
const SMOKE_PORT = Number(process.env.AUDIT_PORT ?? 5294);
const EXPLICIT_BASE = process.env.AUDIT_BASE;
const BASE = EXPLICIT_BASE ?? `http://localhost:${SMOKE_PORT}`;

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'narrow', width: 320, height: 800 },
];

const CLICK_LOCK_MS = 250;

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
    console.log(`Building → ${OUT_DIR}/`);
    await run(VITE_BIN, ['build', '--outDir', OUT_DIR]);
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
 * Guest gate is optional: it only renders when the BUILD has VITE_SUPABASE_*.
 * CI's own provision does not, so this is a no-op there; a developer box with
 * a populated .env still has to click through. Same hook as audit-contrast.
 */
async function dismissEntryScreens(page) {
  const gate = await page.$('[data-entry="guest"]');
  if (gate) {
    await gate.click();
    await page.waitForTimeout(200);
  }
  const onShell = await page.evaluate(() => Boolean(document.querySelector('header')));
  if (!onShell) {
    throw new Error(
      'smoke-learning-path: never reached the app shell — the entry flow changed.'
    );
  }
}

async function stubOutboundNetwork(page) {
  const json = (body, status = 200) => ({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
  await page.route('**/api/**', (r) => r.fulfill(json({ error: 'smoke-offline' }, 503)));
  await page.route('**/auth/v1/**', (r) => r.fulfill(json({})));
  await page.route('**/rest/v1/**', (r) => r.fulfill(json([])));
}

/**
 * Install the guest seed BEFORE the app's first paint.
 *
 * A goto → evaluate(setItem) → reload race lost on CI: App's persist effect
 * reads empty state, then `saveState({ ...current, learnedWords: {} })` after
 * our write and clobbers `deck-unfinished`. Init scripts run before page JS.
 *
 * sessionStorage marks the seed as applied so the post-practice reload keeps
 * the learner's new SRS/learned rows instead of resetting them.
 */
async function installGuestSeed(context, seed) {
  await context.addInitScript((entries) => {
    try {
      if (sessionStorage.getItem('__smoke_learning_path_seeded') === '1') return;
      for (const [key, value] of Object.entries(entries)) {
        localStorage.setItem(key, value);
      }
      sessionStorage.setItem('__smoke_learning_path_seeded', '1');
    } catch {
      // private mode — dismissEntryScreens will fail loudly if the shell never appears
    }
  }, seed.localStorage);
}

async function dumpPage(page, label) {
  try {
    const url = page.url();
    const text = (await page.evaluate(() => (document.body?.innerText || '').slice(0, 800))).replace(
      /\s+/g,
      ' '
    );
    console.error(`smoke-learning-path dump (${label}) ${url}: ${text}`);
  } catch (err) {
    console.error(`smoke-learning-path dump (${label}) failed: ${err.message}`);
  }
}

function horizontalOverflow() {
  return document.documentElement.scrollWidth - document.documentElement.clientWidth;
}

async function assertNoOverflow(page, label) {
  const overflow = await page.evaluate(horizontalOverflow);
  if (overflow > 1) {
    throw new Error(
      `smoke-learning-path: horizontal overflow ${overflow}px at ${label} ` +
        `(viewport ${page.viewportSize().width}px)`
    );
  }
}

async function assertNavTab(page, name, current) {
  const nav = page.getByRole('navigation');
  const tab = nav.getByRole('button', { name, exact: true });
  await tab.waitFor({ state: 'visible', timeout: 8000 });
  const aria = await tab.getAttribute('aria-current');
  if (current && aria !== 'page') {
    throw new Error(`smoke-learning-path: expected ${name} to be the active tab (aria-current)`);
  }
  if (!current && aria === 'page') {
    throw new Error(`smoke-learning-path: ${name} was active; it should not be`);
  }
}

async function visibleCard(page, cards) {
  return page.evaluate((payload) => {
    const text = document.body.innerText || '';
    return payload.find((card) => text.includes(card.de)) ?? null;
  }, cards);
}

async function practiceUntilComplete(page, seed) {
  const empty = page.getByText('Select a deck to start.');
  const complete = page.getByText(/Deck complete/);
  await page.waitForFunction(
    (des) => des.some((de) => (document.body.innerText || '').includes(de)),
    seed.cards.map((card) => card.de),
    { timeout: 8000 }
  );
  const budget = seed.cards.length + 2;

  for (let i = 0; i < budget; i += 1) {
    if (await complete.isVisible().catch(() => false)) return;
    if (await empty.isVisible().catch(() => false)) {
      throw new Error(
        'smoke-learning-path: empty "Select a deck to start." state after a card — #276 regressed'
      );
    }

    const card = await visibleCard(page, seed.cards);
    if (!card) {
      throw new Error(
        `smoke-learning-path: no food-deck headword visible on card ${i + 1}/${seed.cards.length}`
      );
    }

    const choice = page.getByRole('button', { name: card.en, exact: true });
    await choice.waitFor({ state: 'visible', timeout: 8000 });
    await choice.click();

    const good = page.getByRole('button', { name: 'GOOD', exact: true });
    await good.waitFor({ state: 'visible', timeout: 8000 });
    await good.click();
    // VocabTab's click-lock swallows the next choice for 200ms after a verdict.
    await page.waitForTimeout(CLICK_LOCK_MS);
  }

  if (!(await complete.isVisible().catch(() => false))) {
    throw new Error('smoke-learning-path: queue emptied without DeckCompleteBanner (#276)');
  }
}

function assertPersistedProgress(state, seed) {
  if (!state || typeof state !== 'object') {
    throw new Error('smoke-learning-path: deutsch-app-state-v1 missing after practice');
  }
  const scoped = state.learnedByDeck?.[DECK_ID] ?? {};
  const flat = state.learnedWords ?? {};
  const srs = state.srs ?? {};
  const missingLearned = [];
  const staleSrs = [];
  for (const card of seed.remainingCards) {
    if (scoped[card.id] !== true && !flat[card.id]) missingLearned.push(card.id);
  }
  for (const card of seed.cards) {
    const row = srs[srsKey(DECK_ID, card.id)];
    // Seed writes lastReviewed: 1. A real practice stamps Date.now().
    if (!row || row.lastReviewed < 1e12 || !(row.reps >= 1)) staleSrs.push(card.id);
  }
  if (missingLearned.length) {
    throw new Error(
      `smoke-learning-path: remaining cards not marked learned: ${missingLearned.join(', ')}`
    );
  }
  if (staleSrs.length) {
    throw new Error(
      `smoke-learning-path: srs rows not updated by practice: ${staleSrs.join(', ')}`
    );
  }
}

async function walkViewport(page, vp, seed) {
  const label = `${vp.name}@${vp.width}`;
  console.log(`→ ${label}`);
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await stubOutboundNetwork(page);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await dismissEntryScreens(page);

  try {
    await page.getByRole('heading', { name: /recommended for you/i }).waitFor({ timeout: 15000 });
  } catch (err) {
    await dumpPage(page, `${label} home`);
    throw new Error(
      `smoke-learning-path: Recommended heading missing at ${label}: ${err.message}`
    );
  }
  await assertNoOverflow(page, `${label} home`);

  const rec = page
    .locator('section[aria-labelledby="recommended-heading"]')
    .getByRole('button', { name: seed.recommendation });
  try {
    await rec.waitFor({ state: 'visible', timeout: 8000 });
  } catch (err) {
    await dumpPage(page, `${label} recommendation`);
    throw new Error(
      `smoke-learning-path: deck-unfinished recommendation missing at ${label}: ${err.message}`
    );
  }
  await rec.click();

  await assertNavTab(page, 'Vocab', true);
  const handoff = await focusedSessionProblem(page, 'Food & Drink');
  if (handoff) {
    await dumpPage(page, `${label} vocab-handoff`);
    throw new Error(
      `smoke-learning-path: recommendation did not open a Food & Drink session (#277): ${handoff}`
    );
  }
  await assertNoOverflow(page, `${label} vocab-handoff`);

  await practiceUntilComplete(page, seed);

  const banner = page.getByText(/Deck complete — \d+ words? learned/);
  await banner.waitFor({ state: 'visible', timeout: 8000 });
  if (await page.getByText('Select a deck to start.').isVisible().catch(() => false)) {
    throw new Error('smoke-learning-path: finish surface and empty state both showing');
  }
  if (await page.getByRole('tablist', { name: 'Vocabulary mode' }).count()) {
    throw new Error('smoke-learning-path: the deck library renders under the completion screen');
  }
  await assertNoOverflow(page, `${label} deck-complete`);

  const afterPractice = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || 'null'),
    STATE_KEY
  );
  assertPersistedProgress(afterPractice, seed);

  await page.getByRole('button', { name: 'Back to decks' }).click();
  try {
    await page
      .getByRole('tablist', { name: 'Vocabulary mode' })
      .waitFor({ state: 'visible', timeout: 8000 });
  } catch (err) {
    throw new Error(
      `smoke-learning-path: Back to decks did not return to the library: ${err.message}`
    );
  }
  await assertNoOverflow(page, `${label} back-to-decks`);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);
  await dismissEntryScreens(page);

  const afterReload = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key) || 'null'),
    STATE_KEY
  );
  assertPersistedProgress(afterReload, seed);

  await page.getByRole('heading', { name: /recommended for you/i }).waitFor({ timeout: 8000 });
  const leftover = page.getByRole('button', { name: /left in your deck/i });
  if (await leftover.isVisible().catch(() => false)) {
    throw new Error(
      'smoke-learning-path: deck-unfinished recommendation survived a finished deck after reload'
    );
  }
  await assertNoOverflow(page, `${label} after-reload`);
  console.log(`✓ ${label}`);
}

async function launchBrowser() {
  const args = ['--disable-dev-shm-usage'];
  try {
    return await chromium.launch({ headless: true, args });
  } catch (err) {
    const missing = /Executable doesn't exist|Failed to launch/i.test(String(err?.message ?? err));
    if (!missing) throw err;
    // CI installs Playwright's Chromium. A developer box (and this cloud VM)
    // may only have system Chrome; channel:'chrome' uses that instead of
    // failing a download from cdn.playwright.dev.
    console.log('Playwright Chromium not installed; falling back to system Chrome');
    return await chromium.launch({ headless: true, channel: 'chrome', args });
  }
}

async function main() {
  if (EXPLICIT_BASE) console.log(`Smoking the server at ${BASE} (AUDIT_BASE set).`);
  else await provisionTarget();

  const seed = learningPathSeed();
  console.log(
    `Seed: ${seed.learnedCards.length}/${seed.cards.length} of ${DECK_ID} learned, ` +
      `${seed.remainingCount} left`
  );

  const browser = await launchBrowser();
  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext();
      await installGuestSeed(context, seed);
      const page = await context.newPage();
      await walkViewport(page, vp, seed);
      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log(
    `✓ learning path clean on ${VIEWPORTS.map((v) => `${v.name}@${v.width}`).join(' and ')}`
  );
  // Contrast does this too: the preview child keeps the event loop alive
  // otherwise, so a clean walk would hang until the job times out.
  process.exit(0);
}

main().catch((err) => {
  const message = err?.message || String(err);
  if (!message.startsWith('smoke-learning-path:')) {
    console.error(`smoke-learning-path: ${message}`);
  }
  console.error(err);
  process.exit(1);
});
