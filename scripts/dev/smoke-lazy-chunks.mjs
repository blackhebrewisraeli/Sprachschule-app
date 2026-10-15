#!/usr/bin/env node
/**
 * Browser smoke for lazily loaded chunks (bundle-splitting PR 1: legal pages).
 *
 * Proves, in real Chromium against production builds:
 *   0. The first-Vocab path (fresh guest → level → Home → Vocab → first card)
 *      loads no lazy chunk: every JS file the PAGE fetches is one index.html
 *      asks for up front. Service-worker precache downloads are excluded by
 *      reading the page's own resource timing.
 *   1. /privacy, /terms and /delete-account render on a direct load.
 *   2. An in-app footer link from / renders a legal page.
 *   3. With the service worker in control, /privacy reloads OFFLINE.
 *   4. A legal chunk that 404s (fresh context, no worker) shows a recoverable
 *      role="alert" with Reload, never a blank page; the "Loading…" fallback
 *      and the alert both fit at 320px and 375px; Reload recovers. Also
 *      records whether Chromium re-fetches a failed dynamic import in the
 *      same document.
 *   5. Service-worker upgrade: a page running build A, after build B's worker
 *      takes control, opens a legal page whose A-chunk is gone. It must show
 *      the page or the recoverable alert, never a blank screen, and Reload
 *      must land on build B.
 *
 * Builds A and B go to a temporary directory, never the working tree. B is
 * the same source with a marker export appended to each legal page module,
 * so its legal chunk hashes differ from A's.
 *
 * Usage: npm run smoke:lazy-chunks   (AUDIT_PORT overrides the port, default 5296)
 * Exit 0 when every scenario passes; 1 otherwise.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { activePack } from '../../src/packs/index.js';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VITE_BIN = join(REPO_ROOT, 'node_modules', '.bin', 'vite');
const PORT = Number(process.env.AUDIT_PORT ?? 5296);
const BASE = `http://localhost:${PORT}`;
const WORK = mkdtempSync(join(tmpdir(), 'smoke-lazy-chunks-'));
const LEGAL = /\/assets\/(PrivacyPolicy|TermsOfService|DeleteAccountPage|LegalPage)-[^/]+\.js$/;
const HEADINGS = {
  '/privacy': 'Privacy Policy',
  '/terms': 'Terms of Service',
  '/delete-account': 'Delete your Deutsch Sprachschule account',
};

let server = null;
const results = [];

function stopServer() {
  if (server && !server.killed) server.kill('SIGTERM');
  server = null;
}
function cleanup() {
  stopServer();
  rmSync(WORK, { recursive: true, force: true });
}
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    cleanup();
    process.exit(130);
  });
}

function run(cmd, args) {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, args, { cwd: REPO_ROOT, stdio: 'inherit' });
    child.on('error', fail);
    child.on('exit', (code) =>
      code === 0 ? ok() : fail(new Error(`${cmd} ${args.join(' ')} exited ${code}`))
    );
  });
}

async function serve(outDir) {
  stopServer();
  // Wait for the previous server to release the port before reusing it.
  for (let i = 0; i < 40; i += 1) {
    try {
      await fetch(BASE);
    } catch {
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  server = spawn(
    VITE_BIN,
    ['preview', '--outDir', outDir, '--port', String(PORT), '--strictPort'],
    {
      cwd: REPO_ROOT,
      stdio: 'ignore',
    }
  );
  for (let i = 0; i < 120; i += 1) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`preview never answered on ${BASE} for ${outDir}`);
}

/** Build B: identical source plus a marker export on each legal page module. */
async function buildB(outDir) {
  const config = join(WORK, 'vite.config.b.mjs');
  writeFileSync(
    config,
    `import repoConfig from ${JSON.stringify(pathToFileURL(join(REPO_ROOT, 'vite.config.js')).href)};
const marker = {
  name: 'smoke-build-b-marker',
  transform(code, id) {
    if (!/src\\/components\\/legal\\/(PrivacyPolicy|TermsOfService|DeleteAccountPage|LegalPage)\\.jsx$/.test(id)) return null;
    return { code: code + "\\nexport const __smokeBuild = 'B';\\n", map: null };
  },
};
export default { ...repoConfig, root: ${JSON.stringify(REPO_ROOT)}, plugins: [...repoConfig.plugins, marker] };
`
  );
  await run(VITE_BIN, ['build', '--config', config, '--outDir', outDir, '--emptyOutDir']);
}

const assetsOf = (dir) => readdirSync(join(dir, 'assets'));
const entryOf = (dir) =>
  readFileSync(join(dir, 'index.html'), 'utf8').match(/src="(\/assets\/index-[^"]+\.js)"/)[1];
const eagerOf = (dir) => {
  const html = readFileSync(join(dir, 'index.html'), 'utf8');
  return new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]));
};

function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function stubApi(page) {
  const json = (body, status = 200) => ({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
  await page.route('**/api/**', (r) => r.fulfill(json({ error: 'smoke-offline' }, 503)));
  await page.route('**/auth/v1/**', (r) => r.fulfill(json({})));
  await page.route('**/rest/v1/**', (r) => r.fulfill(json([])));
}

/** Fresh guest: entry gate → "start at A1" → app shell, tutorial skipped. */
async function enterAsGuest(page) {
  const gate = page.locator('[data-entry="guest"]');
  if (await gate.isVisible().catch(() => false)) await gate.click();
  const skipPlacement = page.locator('[data-entry="placement-skip"]');
  await skipPlacement.waitFor({ timeout: 5000 }).catch(() => {});
  if (await skipPlacement.isVisible().catch(() => false)) await skipPlacement.click();
  await page.locator('header').first().waitFor({ timeout: 15000 });
  const skipTutorial = page.getByRole('button', { name: 'Skip tutorial' });
  if (await skipTutorial.isVisible().catch(() => false)) await skipTutorial.click();
}

async function waitForController(page) {
  await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, {
    timeout: 30000,
  });
}

const overflowX = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const heading = (page, name) => page.getByRole('heading', { level: 1, name });

async function scenarioFirstVocab(browser, dirA) {
  const context = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const page = await context.newPage();
  await stubApi(page);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await enterAsGuest(page);
  await page.getByRole('navigation').getByRole('button', { name: 'Vocab', exact: true }).click();
  const picker = page.locator('details:has(summary:has-text("Deck"))');
  if ((await picker.count()) > 0 && !(await picker.evaluate((el) => el.open))) {
    await picker.locator('summary').click();
  }
  await page
    .getByRole('button', { name: /Greetings/i })
    .first()
    .click();
  const words = activePack.content.decks.greetings.map((c) => c.de);
  await page.waitForFunction(
    (des) => des.some((de) => (document.body.innerText || '').includes(de)),
    words,
    { timeout: 15000 }
  );
  const loads = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((e) => new URL(e.name).pathname)
      .filter((p) => p.startsWith('/assets/') && p.endsWith('.js'))
  );
  const eager = eagerOf(dirA);
  const extra = loads.filter((p) => !eager.has(p));
  check(
    '0 first-Vocab path loads only what index.html requests up front',
    extra.length === 0 && !loads.some((p) => LEGAL.test(p)),
    `${loads.length} page JS load(s): ${loads.join(', ')}${extra.length ? `; unexpected: ${extra.join(', ')}` : ''}`
  );
  await context.close();
}

async function scenarioDirect(browser) {
  const context = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const page = await context.newPage();
  for (const [path, name] of Object.entries(HEADINGS)) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    const ok = await heading(page, name)
      .waitFor({ timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    check(`1 direct load ${path}`, ok, ok ? `"${name}" rendered` : 'heading never rendered');
  }
  await context.close();
}

async function scenarioInApp(browser) {
  const context = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const page = await context.newPage();
  await stubApi(page);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await enterAsGuest(page);
  await page.getByRole('link', { name: 'Privacy', exact: true }).click();
  const ok = await heading(page, 'Privacy Policy')
    .waitFor({ timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  check('2 in-app footer link / → /privacy', ok, new URL(page.url()).pathname);
  await context.close();
}

async function scenarioOffline(browser) {
  const context = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/privacy`, { waitUntil: 'load' });
  await heading(page, 'Privacy Policy').waitFor({ timeout: 15000 });
  await waitForController(page);
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const ok = await heading(page, 'Privacy Policy')
    .waitFor({ timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  check('3 service-worker-controlled offline reload of /privacy', ok);
  await context.setOffline(false);
  await context.close();
}

async function scenarioFailedChunk(browser, dirA) {
  // Fallback first: hold the chunk so "Loading…" stays up long enough to measure.
  {
    const context = await browser.newContext({
      viewport: { width: 320, height: 800 },
      serviceWorkers: 'block',
    });
    const page = await context.newPage();
    let release;
    const held = new Promise((r) => {
      release = r;
    });
    await page.route(LEGAL, async (route) => {
      await held;
      await route.continue();
    });
    await page.goto(`${BASE}/privacy`, { waitUntil: 'domcontentloaded' });
    const status = page.getByRole('status').filter({ hasText: 'Loading…' });
    const shown = await status
      .waitFor({ timeout: 10000 })
      .then(() => true)
      .catch(() => false);
    const at320 = await overflowX(page);
    await page.setViewportSize({ width: 375, height: 800 });
    const at375 = await overflowX(page);
    release();
    const arrived = await heading(page, 'Privacy Policy')
      .waitFor({ timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    check(
      '4a "Loading…" fallback fits, then the page arrives',
      shown && at320 <= 0 && at375 <= 0 && arrived,
      `fallback=${shown} overflow320=${at320} overflow375=${at375} arrived=${arrived}`
    );
    await context.close();
  }

  const context = await browser.newContext({
    viewport: { width: 320, height: 800 },
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await page.route(LEGAL, (route) => route.fulfill({ status: 404, body: 'gone' }));
  await page.goto(`${BASE}/terms`, { waitUntil: 'domcontentloaded' });
  const alert = page.getByRole('alert').filter({ hasText: /could not load/i });
  const shown = await alert
    .waitFor({ timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  const reload = page.getByRole('button', { name: 'Reload' });
  const hasReload = await reload.isVisible().catch(() => false);
  const text = await page.evaluate(() => document.body.innerText.trim().length);
  const at320 = await overflowX(page);
  await page.setViewportSize({ width: 375, height: 800 });
  const at375 = await overflowX(page);
  check(
    '4b 404 legal chunk shows a recoverable alert, not a blank page',
    shown && hasReload && text > 0 && at320 <= 0 && at375 <= 0,
    `alert=${shown} reload=${hasReload} bodyChars=${text} overflow320=${at320} overflow375=${at375}`
  );

  // Diagnostic: does Chromium re-fetch a failed import() of the same URL in
  // the same document once the server answers again?
  const termsChunk = `/assets/${assetsOf(dirA).find((f) => f.startsWith('TermsOfService-'))}`;
  await page.unroute(LEGAL);
  const retry = await page.evaluate(async (url) => {
    try {
      await import(url);
      return 'resolved (re-fetched)';
    } catch (err) {
      return `rejected again (failure cached): ${err.message}`;
    }
  }, termsChunk);
  console.log(`  diagnostic: same-document re-import of ${termsChunk} → ${retry}`);
  results.push({ name: 'diagnostic: Chromium failed-import retry', ok: true, detail: retry });

  await reload.click();
  const recovered = await heading(page, 'Terms of Service')
    .waitFor({ timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  check('4c Reload recovers once the chunk is reachable', recovered);
  await context.close();
}

async function scenarioUpgrade(browser, dirA, dirB) {
  const legalA = assetsOf(dirA).filter((f) => LEGAL.test(`/assets/${f}`));
  const legalB = assetsOf(dirB).filter((f) => LEGAL.test(`/assets/${f}`));
  const differ = legalA.length > 0 && legalA.every((f) => !legalB.includes(f));
  check(
    '5a builds A and B have different legal chunk hashes',
    differ,
    `A=${legalA.join(',')} B=${legalB.join(',')}`
  );
  const entryA = entryOf(dirA);
  const entryB = entryOf(dirB);

  await serve(dirA);
  const context = await browser.newContext({ viewport: { width: 375, height: 800 } });
  const page = await context.newPage();
  await stubApi(page);
  await page.goto(BASE, { waitUntil: 'load' });
  await enterAsGuest(page);
  await waitForController(page);

  await serve(dirB);
  const swapped = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const changed = new Promise((r) =>
      navigator.serviceWorker.addEventListener('controllerchange', () => r(true), { once: true })
    );
    await reg.update();
    return Promise.race([changed, new Promise((r) => setTimeout(() => r(false), 30000))]);
  });
  // Workbox deletes A's precache entries during activate; wait for that.
  const termsA = `/assets/${legalA.find((f) => f.startsWith('TermsOfService-'))}`;
  const purged = await page
    .waitForFunction(
      async (url) => {
        for (const name of await caches.keys()) {
          const cache = await caches.open(name);
          if (await cache.match(new URL(url, location.origin).href, { ignoreSearch: true })) {
            return false;
          }
        }
        return true;
      },
      termsA,
      { timeout: 15000 }
    )
    .then(() => true)
    .catch(() => false);
  check(
    "5b build B worker took control and purged A's legal chunk",
    swapped && purged,
    `controllerchange=${swapped} purged=${purged}`
  );

  const stillA = await page.evaluate(() =>
    document.querySelector('script[type="module"][src*="/assets/index-"]')?.getAttribute('src')
  );
  await page.getByRole('link', { name: 'Terms', exact: true }).click();
  const outcome = await Promise.race([
    heading(page, 'Terms of Service')
      .waitFor({ timeout: 15000 })
      .then(() => 'content'),
    page
      .getByRole('alert')
      .filter({ hasText: /could not load/i })
      .waitFor({ timeout: 15000 })
      .then(() => 'alert'),
  ]).catch(() => 'blank');
  const text = await page.evaluate(() => document.body.innerText.trim().length);
  check(
    '5c old page opens a legal page after the swap: content or alert, never blank',
    outcome !== 'blank' && text > 0,
    `page entry=${stillA} (A=${entryA}) outcome=${outcome} bodyChars=${text}`
  );

  if (outcome === 'alert') await page.getByRole('button', { name: 'Reload' }).click();
  else await page.reload();
  await page.waitForLoadState('domcontentloaded');
  const landed = await heading(page, 'Terms of Service')
    .waitFor({ timeout: 15000 })
    .then(() => true)
    .catch(() => false);
  const entryNow = await page.evaluate(() =>
    document.querySelector('script[type="module"][src*="/assets/index-"]')?.getAttribute('src')
  );
  check(
    '5d Reload lands on build B',
    landed && entryNow === entryB,
    `entry=${entryNow} (B=${entryB})`
  );
  await context.close();
}

async function main() {
  const dirA = join(WORK, 'A');
  const dirB = join(WORK, 'B');
  console.log(`Building A → ${dirA}`);
  await run(VITE_BIN, ['build', '--outDir', dirA, '--emptyOutDir']);
  console.log(`Building B → ${dirB}`);
  await buildB(dirB);

  const browser = await chromium.launch();
  try {
    await serve(dirA);
    await scenarioFirstVocab(browser, dirA);
    await scenarioDirect(browser);
    await scenarioInApp(browser);
    await scenarioOffline(browser);
    await scenarioFailedChunk(browser, dirA);
    await scenarioUpgrade(browser, dirA, dirB);
  } finally {
    await browser.close();
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`\nsmoke-lazy-chunks: ${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`smoke-lazy-chunks: ${err.stack || err.message}`);
  process.exit(1);
});
