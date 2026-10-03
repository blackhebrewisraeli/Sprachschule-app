#!/usr/bin/env node
/**
 * Store screenshots from the real native app (docs/store-metadata/store-screenshot-plan.md).
 *
 *   npm run screenshots:capture                       # iPhone + iPad + Play + feature graphic
 *   npm run screenshots:capture -- --targets iphone   # any of iphone, ipad, play
 *   npm run screenshots:capture -- --scenes home,vocab
 *   npm run screenshots:capture -- --skip-build       # reuse the last native builds
 *
 * What it does, in order:
 *   1. `npm run build:mobile`: the exact flags of a store build, synced into
 *      both native projects.
 *   2. Injects driver.js into the COPIED bundles only (gitignored
 *      ios/App/App/public and android/app/src/main/assets/public).
 *   3. Builds the iOS Release app for the Simulator and the Android debug APK
 *      (see buildAndroid for why debug).
 *   4. On a dedicated "Deutsch Shots" Simulator per iOS target (created on
 *      first run, so wiping its app data touches nothing of yours) and on the
 *      first attached Android emulator or phone: English (U.S.), light mode,
 *      a clean 9:41 status bar, a fresh install.
 *   5. Serves the scene queue to the driver (HTTP on 127.0.0.1 for iOS, a
 *      DevTools binding for Android) and takes each native screenshot
 *      (`simctl io screenshot` / `adb exec-out screencap`) when the driver
 *      reports the scene ready.
 *   6. Composites, verifies sizes and alpha, writes store-screenshots/REPORT.md.
 *   7. Restores the clean bundles with `npx cap copy`, even on failure.
 *
 * Seeded guest state comes from scripts/dev/screenshot-seed.js. Scene 5 (league)
 * is skipped by design: see scenes.js.
 */

import { execFile, execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { homedir } from 'node:os';
import { chromium } from 'playwright';
import { activePack } from '../../src/packs/index.js';
import { screenshotSeed } from '../dev/screenshot-seed.js';
import { answerKeys } from './answers.js';
import { SCENES, TARGETS, FEATURE_GRAPHIC, capturableScenes } from './scenes.js';
import { composeScreenshot, composeFeatureGraphic } from './compose.mjs';
import { exportProblems, pngInfo } from './png.js';
import { parseArgs, injectDriver, reportMarkdown, mergeEarlierExports } from './lib.js';

const exec = promisify(execFile);
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP_ID = 'com.sprachschule.deutsch';
const PORT = Number(process.env.SHOTS_PORT ?? 8787);
const HOST = `http://127.0.0.1:${PORT}`;
const ANDROID_SDK = process.env.ANDROID_HOME ?? join(homedir(), 'Library/Android/sdk');
const ADB = existsSync(join(ANDROID_SDK, 'platform-tools/adb'))
  ? join(ANDROID_SDK, 'platform-tools/adb')
  : 'adb';
// Gradle 8.14 cannot compile build scripts on Java 25 (Android Studio's bundled
// JDK), and Capacitor 8 needs at least 21 to compile, so 17 is out too. CI pins
// Temurin 21; prefer a local 21 the same way. docs/NATIVE_BUILD.md §4.
function androidJavaHome() {
  try {
    return execFileSync('/usr/libexec/java_home', ['-v', '21'], { encoding: 'utf8' }).trim();
  } catch {
    const studio = '/Applications/Android Studio.app/Contents/jbr/Contents/Home';
    return existsSync(studio) ? studio : null;
  }
}
const BUNDLES = {
  ios: join(REPO, 'ios/App/App/public/index.html'),
  android: join(REPO, 'android/app/src/main/assets/public/index.html'),
};

// Interrupted runs must not leave the driver in a bundle a later native build
// would pick up.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`[shots] ${sig}: restoring the clean web bundles…`);
    try {
      execFileSync('npx', ['cap', 'copy'], { cwd: REPO, stdio: 'inherit' });
    } finally {
      process.exit(130);
    }
  });
}

const opts = parseArgs(process.argv.slice(2));
const OUT = resolve(REPO, opts.out);
const RAW = join(OUT, 'raw');
const BUILD = join(OUT, '.build');
const log = (...a) => console.log('[shots]', ...a);

function run(cmd, args, { cwd = REPO, env = {} } = {}) {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
    child.on('error', fail);
    child.on('exit', (code) =>
      code === 0 ? ok() : fail(new Error(`${cmd} ${args.join(' ')} → ${code}`))
    );
  });
}
const sh = async (cmd, args, o) => (await exec(cmd, args, { maxBuffer: 64 << 20, ...o })).stdout;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- host server

/** One target at a time: the queue the driver pulls from. */
const session = {
  target: null,
  queue: [],
  jobs: new Map(),
  results: new Map(),
  shoot: null,
  onIdle: null,
  watchdog: null,
};

function jobFor(scene) {
  return {
    scene,
    seed: screenshotSeed().localStorage,
    answers: answerKeys(activePack.content),
    settleMs: scene.id === 'chat' ? 1500 : 900,
  };
}

function armWatchdog(scene) {
  clearTimeout(session.watchdog);
  session.watchdog = setTimeout(
    () =>
      finish(
        scene.id,
        { ok: false, error: `no answer from the app within ${scene.timeoutMs ?? 60000} ms` },
        { restart: true }
      ),
    scene.timeoutMs ?? 60000
  );
}

async function finish(id, result, { restart = false } = {}) {
  clearTimeout(session.watchdog);
  const scene = SCENES.find((s) => s.id === id);
  const attempt = (session.results.get(id)?.attempt ?? 0) + 1;
  const retry = !result.ok && attempt < 2 && scene;
  session.results.set(id, { ...result, attempt, final: !retry });
  if (retry) session.queue.unshift(scene);
  log(
    `  ${id}: ${result.ok ? 'captured' : retry ? `${result.error}; retrying once` : `FAILED: ${result.error}`}`
  );
  if (restart) await session.target?.relaunch();
  const allFinal = [...session.jobs.keys()].every((k) => session.results.get(k)?.final);
  if (allFinal && !session.queue.length) session.onIdle?.();
}

/** The driver protocol, shared by both transports (HTTP on iOS, CDP on Android). */
async function handle(path, body = {}) {
  if (path === '/next') {
    const scene = session.queue.shift();
    if (!scene) return { done: true };
    const job = jobFor(scene);
    session.jobs.set(scene.id, job);
    armWatchdog(scene);
    return { job };
  }
  if (path === '/job') return { job: session.jobs.get(body.id) };
  if (path === '/ready') {
    try {
      const file = await session.shoot(body.id);
      await finish(body.id, { ok: true, file });
    } catch (err) {
      await finish(body.id, { ok: false, error: `screenshot: ${err.message}` });
    }
    return { ok: true };
  }
  if (path === '/fail') {
    if (body.id !== 'driver') await finish(body.id, { ok: false, error: body.error });
    else log('  driver error:', body.error);
    return { ok: true };
  }
  return { error: `unknown path ${path}` };
}

const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  let body = {};
  try {
    body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
  } catch {
    body = {};
  }
  const reply = req.method === 'OPTIONS' ? {} : await handle(new URL(req.url, HOST).pathname, body);
  res.writeHead(200, {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'content-type': 'application/json',
  });
  res.end(JSON.stringify(reply));
});

async function shootAll(target, scenes, shoot) {
  session.target = target;
  session.queue = [...scenes];
  session.jobs = new Map(scenes.map((s) => [s.id, null]));
  session.results = new Map();
  session.shoot = shoot;
  const idle = new Promise((ok) => (session.onIdle = ok));
  const budget = scenes.reduce((t, s) => t + 2 * (s.timeoutMs ?? 60000), 60000);
  await target.relaunch();
  // Clear the losing timer, or it holds the process open for the whole budget.
  let budgetTimer;
  await Promise.race([idle, new Promise((ok) => (budgetTimer = setTimeout(ok, budget)))]);
  clearTimeout(budgetTimer);
  clearTimeout(session.watchdog);
  for (const s of scenes)
    if (!session.results.has(s.id))
      session.results.set(s.id, { ok: false, error: 'never reached' });
  return new Map(session.results);
}

// ---------------------------------------------------------------------- iOS

async function iosRuntime() {
  const { runtimes } = JSON.parse(await sh('xcrun', ['simctl', 'list', 'runtimes', '-j']));
  const ios = runtimes
    .filter((r) => r.platform === 'iOS' && r.isAvailable)
    .sort((a, b) => (a.version < b.version ? 1 : -1));
  if (!ios.length) throw new Error('no available iOS Simulator runtime');
  return ios[0].identifier;
}

async function iosDevice(key, target) {
  const name = `Deutsch Shots ${key === 'ipad' ? 'iPad' : 'iPhone'}`;
  const { devices } = JSON.parse(await sh('xcrun', ['simctl', 'list', 'devices', '-j']));
  const found = Object.values(devices)
    .flat()
    .find((d) => d.name === name && d.isAvailable);
  const udid =
    found?.udid ??
    (await sh('xcrun', ['simctl', 'create', name, target.simulator, await iosRuntime()])).trim();
  await exec('xcrun', ['simctl', 'boot', udid]).catch(() => {});
  await exec('xcrun', ['simctl', 'bootstatus', udid, '-b']);
  // English (U.S.) system UI; a language change only takes after a reboot.
  const lang = await sh('xcrun', [
    'simctl',
    'spawn',
    udid,
    'defaults',
    'read',
    '-g',
    'AppleLanguages',
  ]).catch(() => '');
  if (!/^\(\s*"?en-US"?/m.test(lang.trim())) {
    await exec('xcrun', [
      'simctl',
      'spawn',
      udid,
      'defaults',
      'write',
      '-g',
      'AppleLanguages',
      '-array',
      'en-US',
    ]);
    await exec('xcrun', [
      'simctl',
      'spawn',
      udid,
      'defaults',
      'write',
      '-g',
      'AppleLocale',
      '-string',
      'en_US',
    ]);
    await exec('xcrun', ['simctl', 'shutdown', udid]);
    await exec('xcrun', ['simctl', 'boot', udid]);
    await exec('xcrun', ['simctl', 'bootstatus', udid, '-b']);
  }
  await exec('xcrun', ['simctl', 'ui', udid, 'appearance', 'light']);
  await exec('xcrun', [
    'simctl',
    'status_bar',
    udid,
    'override',
    '--time',
    '9:41',
    '--dataNetwork',
    'wifi',
    '--wifiMode',
    'active',
    '--wifiBars',
    '3',
    '--cellularMode',
    'active',
    '--cellularBars',
    '4',
    '--batteryState',
    'discharging',
    '--batteryLevel',
    '100',
  ]);
  return udid;
}

async function iosTarget(key, target, appPath) {
  const udid = await iosDevice(key, target);
  log(`${target.label}: Simulator ${udid}`);
  await exec('xcrun', ['simctl', 'uninstall', udid, APP_ID]).catch(() => {});
  await exec('xcrun', ['simctl', 'install', udid, appPath]);
  // Notifications would prompt over the UI; the build pins push off, this is belt and braces.
  await exec('xcrun', ['simctl', 'privacy', udid, 'revoke', 'all', APP_ID]).catch(() => {});
  return {
    udid,
    relaunch: () =>
      exec('xcrun', ['simctl', 'launch', '--terminate-running-process', udid, APP_ID]),
    shoot: async (id) => {
      const scene = SCENES.find((s) => s.id === id);
      const file = join(RAW, key, scene.file);
      await exec('xcrun', ['simctl', 'io', udid, 'screenshot', '--type=png', file]);
      return file;
    },
    cleanup: async () => {
      await exec('xcrun', ['simctl', 'terminate', udid, APP_ID]).catch(() => {});
      await exec('xcrun', ['simctl', 'status_bar', udid, 'clear']).catch(() => {});
    },
  };
}

async function buildIos() {
  const derived = join(BUILD, 'ios');
  log('building the iOS Release app for the Simulator…');
  await run(
    'xcodebuild',
    [
      '-project',
      'App.xcodeproj',
      '-scheme',
      'App',
      '-configuration',
      'Release',
      '-sdk',
      'iphonesimulator',
      '-destination',
      'generic/platform=iOS Simulator',
      '-derivedDataPath',
      derived,
      'CODE_SIGNING_ALLOWED=NO',
      '-quiet',
      'build',
    ],
    { cwd: join(REPO, 'ios/App') }
  );
  return join(derived, 'Build/Products/Release-iphonesimulator/App.app');
}

// ------------------------------------------------------------------ Android

const adb = (...args) => sh(ADB, args);

async function androidSerial() {
  const lines = (await adb('devices'))
    .split('\n')
    .slice(1)
    .map((l) => l.trim().split(/\s+/))
    .filter((p) => p[1] === 'device');
  const pick = lines.find((p) => p[0].startsWith('emulator-')) ?? lines[0];
  if (!pick) return null;
  return pick[0];
}

// Android blocks cleartext HTTP even to loopback (ERR_CLEARTEXT_NOT_PERMITTED),
// and opening it would mean changing the app's manifest. So on Android the
// driver talks over the WebView's DevTools socket instead, which only a debug
// build exposes. Same web bundle as a release build; only the native shell's
// inspection flag differs.
async function buildAndroid() {
  log('building the Android APK (assembleDebug, for WebView inspection)…');
  const javaHome = androidJavaHome();
  const env = javaHome ? { JAVA_HOME: javaHome } : {};
  await run('./gradlew', ['-q', 'assembleDebug'], { cwd: join(REPO, 'android'), env });
  return join(REPO, 'android/app/build/outputs/apk/debug/app-debug.apk');
}

const CDP_PORT = Number(process.env.SHOTS_CDP_PORT ?? 9333);

/**
 * Attach to the app's WebView over DevTools and serve the driver protocol on
 * a `__shotsCall` binding. Returns a close function.
 */
async function attachCdp(serial) {
  const a = (...args) => adb('-s', serial, ...args);
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    const pid = (await a('shell', 'pidof', APP_ID).catch(() => '')).trim();
    if (pid) {
      await a('forward', `tcp:${CDP_PORT}`, `localabstract:webview_devtools_remote_${pid}`).catch(
        () => {}
      );
      const list = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)
        .then((r) => r.json())
        .catch(() => []);
      target = list.find((t) => t.type === 'page' && t.url.startsWith('https://localhost'));
    }
    if (!target) await sleep(500);
  }
  if (!target) throw new Error('could not reach the app WebView over DevTools');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => {
    ws.onopen = ok;
    ws.onerror = () => fail(new Error('DevTools socket failed'));
  });
  let seq = 0;
  const send = (method, params) => ws.send(JSON.stringify({ id: ++seq, method, params }));
  ws.onmessage = async (msg) => {
    const data = JSON.parse(msg.data);
    if (data.method !== 'Runtime.bindingCalled' || data.params.name !== '__shotsCall') return;
    const { id, path, body } = JSON.parse(data.params.payload);
    const reply = await handle(path, body ?? {});
    send('Runtime.evaluate', {
      expression: `window.__shotsReplies && window.__shotsReplies[${id}] && window.__shotsReplies[${id}](${JSON.stringify(reply)})`,
    });
  };
  send('Runtime.enable');
  send('Runtime.addBinding', { name: '__shotsCall' });
  return () => ws.close();
}

async function androidTarget(serial, apkPath) {
  const a = (...args) => adb('-s', serial, ...args);
  await a('wait-for-device');
  for (
    let i = 0;
    i < 120 && (await a('shell', 'getprop', 'sys.boot_completed')).trim() !== '1';
    i++
  )
    await sleep(2000);
  await a('uninstall', APP_ID).catch(() => {});
  await a('install', '-r', apkPath);
  // Demo mode: a clean 9:41 status bar, full battery and signal, no icons.
  const demo = (cmd, extra = []) =>
    a(
      'shell',
      'am',
      'broadcast',
      '-a',
      'com.android.systemui.demo',
      '-e',
      'command',
      cmd,
      ...extra
    );
  await a('shell', 'settings', 'put', 'global', 'sysui_demo_allowed', '1');
  await demo('enter');
  await demo('clock', ['-e', 'hhmm', '0941']);
  await demo('battery', ['-e', 'level', '100', '-e', 'plugged', 'false']);
  // Wi-Fi only: demo mode's mobile icon reads "3G", which dates the image.
  await demo('network', ['-e', 'wifi', 'show', '-e', 'level', '4']);
  await demo('network', ['-e', 'mobile', 'hide']);
  await demo('notifications', ['-e', 'visible', 'false']);
  await a('shell', 'cmd', 'uimode', 'night', 'no').catch(() => {});
  // `monkey` launches too, but exits non-zero on some system images; start the
  // resolved launcher activity instead.
  let detach = null;
  const activity = (await a('shell', 'cmd', 'package', 'resolve-activity', '--brief', APP_ID))
    .trim()
    .split('\n')
    .pop();
  return {
    serial,
    relaunch: async () => {
      detach?.();
      await a('shell', 'am', 'force-stop', APP_ID);
      await a('shell', 'am', 'start', '-W', '-n', activity);
      detach = await attachCdp(serial);
    },
    shoot: async (id) => {
      const scene = SCENES.find((s) => s.id === id);
      const file = join(RAW, 'play', scene.file);
      const { stdout } = await exec(ADB, ['-s', serial, 'exec-out', 'screencap', '-p'], {
        encoding: 'buffer',
        maxBuffer: 64 << 20,
      });
      writeFileSync(file, stdout);
      return file;
    },
    cleanup: async () => {
      detach?.();
      await a('shell', 'am', 'force-stop', APP_ID).catch(() => {});
      await demo('exit').catch(() => {});
      await a('forward', '--remove', `tcp:${CDP_PORT}`).catch(() => {});
    },
  };
}

// --------------------------------------------------------------------- main

async function main() {
  const targets = opts.targets.filter((t) => TARGETS[t]);
  const scenes = capturableScenes().filter((s) => !opts.scenes || opts.scenes.includes(s.id));
  mkdirSync(BUILD, { recursive: true });
  for (const t of targets) mkdirSync(join(RAW, t), { recursive: true });

  const wantIos = targets.some((t) => TARGETS[t].platform === 'ios');
  const wantAndroid = targets.some((t) => TARGETS[t].platform === 'android');
  const results = {};
  const notes = [];

  if (!opts.skipBuild) await run('npm', ['run', 'build:mobile']);
  const driver = readFileSync(join(REPO, 'scripts/screenshots/driver.js'), 'utf8');

  await new Promise((ok) => server.listen(PORT, '127.0.0.1', ok));
  try {
    if (wantIos) {
      writeFileSync(
        BUNDLES.ios,
        injectDriver(readFileSync(BUNDLES.ios, 'utf8'), driver, { host: HOST, device: 'ios' })
      );
      const app =
        opts.skipBuild &&
        existsSync(join(BUILD, 'ios/Build/Products/Release-iphonesimulator/App.app'))
          ? join(BUILD, 'ios/Build/Products/Release-iphonesimulator/App.app')
          : await buildIos();
      if (opts.skipBuild) {
        // The bundle inside a reused .app is the one it was built with; re-copy the injected one.
        await run('rsync', ['-a', '--delete', `${dirname(BUNDLES.ios)}/`, join(app, 'public/')]);
      }
      for (const key of targets.filter((t) => TARGETS[t].platform === 'ios')) {
        const target = await iosTarget(key, TARGETS[key], app);
        try {
          results[key] = await shootAll(target, scenes, target.shoot);
        } finally {
          await target.cleanup();
        }
      }
    }
    if (wantAndroid) {
      const serial = await androidSerial();
      if (!serial) {
        notes.push(
          'Google Play phone set skipped: no Android emulator or phone attached (`adb devices` was empty).'
        );
      } else {
        writeFileSync(
          BUNDLES.android,
          injectDriver(readFileSync(BUNDLES.android, 'utf8'), driver, {
            device: 'android',
            transport: 'cdp',
          })
        );
        const apk = await buildAndroid();
        const target = await androidTarget(serial, apk);
        log(`${TARGETS.play.label}: ${serial}`);
        try {
          results.play = await shootAll(target, scenes, target.shoot);
        } finally {
          await target.cleanup();
        }
      }
    }
  } finally {
    server.close();
    log('restoring the clean web bundles…');
    await run('npx', ['cap', 'copy']).catch((err) =>
      log('cap copy failed — run it yourself:', err.message)
    );
  }

  // Composite, then verify every export from its own bytes.
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const rows = [];
  try {
    for (const [key, byScene] of Object.entries(results)) {
      const target = TARGETS[key];
      mkdirSync(join(OUT, key), { recursive: true });
      for (const scene of SCENES) {
        if (scene.skip) {
          rows.push({ target: key, file: scene.file, status: 'skipped', detail: scene.skip });
          continue;
        }
        const r = byScene.get(scene.id);
        if (!r) continue;
        if (!r.ok) {
          rows.push({ target: key, file: scene.file, status: 'failed', detail: r.error });
          continue;
        }
        const out = join(OUT, key, scene.file);
        const rawSize = pngInfo(readFileSync(r.file));
        await composeScreenshot(page, {
          repoRoot: REPO,
          workDir: BUILD,
          raw: r.file,
          rawSize,
          canvas: target,
          headline: scene.headline,
          out,
        });
        const problems = exportProblems(readFileSync(out), target);
        rows.push({
          target: key,
          file: scene.file,
          status: problems.length ? 'failed' : 'ok',
          detail: problems.join('; ') || `${target.width}×${target.height}, no alpha`,
        });
      }
    }
    if (targets.includes('play')) {
      mkdirSync(join(OUT, 'play'), { recursive: true });
      const out = join(OUT, 'play', FEATURE_GRAPHIC.file);
      await composeFeatureGraphic(page, {
        repoRoot: REPO,
        workDir: BUILD,
        graphic: FEATURE_GRAPHIC,
        out,
      });
      const problems = exportProblems(readFileSync(out), FEATURE_GRAPHIC);
      rows.push({
        target: 'play',
        file: FEATURE_GRAPHIC.file,
        status: problems.length ? 'failed' : 'ok',
        detail: problems.join('; ') || '1024×500, no alpha',
      });
    }
  } finally {
    await browser.close();
    rmSync(join(BUILD, 'compose.html'), { force: true });
  }

  // Keep the exports this run did not touch in the report, re-verified.
  const existing = new Map();
  for (const [key, target] of Object.entries(TARGETS)) {
    for (const f of [...SCENES, ...(key === 'play' ? [FEATURE_GRAPHIC] : [])]) {
      const file = join(OUT, key, f.file);
      if (!existsSync(file)) continue;
      const size = f === FEATURE_GRAPHIC ? FEATURE_GRAPHIC : target;
      existing.set(`${key}/${f.file}`, {
        problems: exportProblems(readFileSync(file), size),
        // Local time, so it matches the clock the owner reads.
        date: statSync(file).mtime.toLocaleString('sv-SE').slice(0, 16),
      });
    }
  }
  const allRows = mergeEarlierExports({
    rows,
    scenes: SCENES,
    targets: TARGETS,
    graphic: FEATURE_GRAPHIC,
    existing,
  });
  writeFileSync(
    join(OUT, 'REPORT.md'),
    reportMarkdown({
      rows: allRows,
      notes,
      scenes: SCENES,
      targets: TARGETS,
      graphic: FEATURE_GRAPHIC,
    })
  );
  for (const r of allRows)
    log(`${r.status.padEnd(7)} ${r.target.padEnd(6)} ${r.file} — ${r.detail}`);
  for (const n of notes) log(n);
  log(`report: ${join(OUT, 'REPORT.md')}`);
  process.exitCode = allRows.some((r) => r.status === 'failed') ? 1 : 0;
}

main().catch((err) => {
  console.error('[shots] fatal:', err);
  process.exitCode = 1;
  server.close();
  // Never leave the driver in a bundle a later native build might pick up.
  spawn('npx', ['cap', 'copy'], { cwd: REPO, stdio: 'inherit' });
});
