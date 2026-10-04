#!/usr/bin/env node
/**
 * Archive the iOS app and upload it to App Store Connect (TestFlight).
 *
 *   npm run release:bump               # first: every upload needs a new build number
 *   npm run ios:upload                 # build:mobile → archive → export + upload
 *   npm run ios:upload -- --archive-only   # stop after the archive (no upload)
 *   npm run ios:upload -- --skip-build     # reuse the current web bundle
 *
 * Signs with the Team picked in Xcode (Automatic signing) and authenticates
 * as the Apple ID signed in to Xcode → Settings → Accounts; nothing secret
 * lives in the repo. Archives and logs go to store-builds/ios/ (gitignored).
 * On failure it prints the step to take (iosUpload.js) and keeps the log.
 */

import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { teamIdFrom, exportOptionsPlist, explainXcodeFailure } from './iosUpload.js';
import { readNativeVersions, versionDrift } from './version.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PROJECT = join(REPO, 'ios/App/App.xcodeproj');
const args = new Set(process.argv.slice(2));
for (const a of args) {
  if (!['--archive-only', '--skip-build'].includes(a)) {
    console.error(`unknown flag ${a} (use --archive-only, --skip-build)`);
    process.exit(2);
  }
}
const log = (...a) => console.log('[ios]', ...a);

/** Runs a command, streaming its output, and returns everything it printed. */
function run(cmd, argv, logFile) {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, argv, { cwd: REPO });
    let out = '';
    const take = (stream, sink) =>
      stream.on('data', (d) => {
        out += d;
        sink.write(d);
      });
    take(child.stdout, process.stdout);
    take(child.stderr, process.stderr);
    child.on('error', fail);
    child.on('exit', (code) => {
      if (logFile) writeFileSync(logFile, out);
      code === 0
        ? ok(out)
        : fail(Object.assign(new Error(`${cmd} exited ${code}`), { output: out }));
    });
  });
}

const files = {
  packageJson: readFileSync(join(REPO, 'package.json'), 'utf8'),
  gradle: readFileSync(join(REPO, 'android/app/build.gradle'), 'utf8'),
  pbxproj: readFileSync(join(PROJECT, 'project.pbxproj'), 'utf8'),
};

async function main() {
  const teamId = teamIdFrom(files.pbxproj);
  const drift = versionDrift(files);
  if (drift.length)
    throw new Error(`versions disagree, run npm run release:bump:\n  ${drift.join('\n  ')}`);
  const version = JSON.parse(files.packageJson).version;
  const build = readNativeVersions(files).android.build;
  log(`version ${version} (${build}), team ${teamId}`);

  if (!args.has('--skip-build')) await run('npm', ['run', 'build:mobile']);

  // Local time, so the folder sorts by the clock the owner reads.
  const stamp = new Date().toLocaleString('sv-SE').replace(/[: ]/g, '-');
  const dir = join(REPO, 'store-builds/ios', `${version}-${build}-${stamp}`);
  mkdirSync(dir, { recursive: true });
  const archive = join(dir, 'App.xcarchive');

  log('archiving (Release, generic iOS device)…');
  await run(
    'xcodebuild',
    ['-project', PROJECT, '-scheme', 'App', '-configuration', 'Release', '-destination', 'generic/platform=iOS',
      '-archivePath', archive, '-allowProvisioningUpdates', '-quiet', 'archive'],
    join(dir, 'archive.log')
  ); // prettier-ignore
  log(`archive: ${archive}`);
  if (args.has('--archive-only')) return log('stopped after the archive (--archive-only).');

  const plist = join(dir, 'ExportOptions.plist');
  writeFileSync(plist, exportOptionsPlist({ teamId }));
  log('exporting and uploading to App Store Connect…');
  await run(
    'xcodebuild',
    ['-exportArchive', '-archivePath', archive, '-exportOptionsPlist', plist, '-exportPath', join(dir, 'export'),
      '-allowProvisioningUpdates'],
    join(dir, 'upload.log')
  ); // prettier-ignore
  log(
    `uploaded ${version} (${build}). It shows in App Store Connect → TestFlight after Apple processes it (usually 5–30 minutes).`
  );
  // main takes no direct pushes, so the bump lands like any other change.
  log(
    'Land the version bump if it is not on main yet: a branch and a PR with package.json, android/ and ios/.'
  );
}

main().catch((err) => {
  console.error(`\n[ios] FAILED: ${err.message}`);
  if (err.output) console.error(`[ios] next step: ${explainXcodeFailure(err.output)}`);
  process.exitCode = 1;
});
