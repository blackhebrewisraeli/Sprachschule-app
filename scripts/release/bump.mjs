#!/usr/bin/env node
// Sets one version across package.json, Android and iOS, and raises the shared
// build number. See scripts/release/version.js.
//
//   npm run release:bump               # same version, next build number
//   npm run release:bump -- 1.1.0      # new version, next build number
//   npm run release:bump -- --build 7  # explicit build number (must still rise)

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readNativeVersions, nextBuild, setVersions, parseBumpArgs } from './version.js';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PATHS = {
  packageJson: join(REPO, 'package.json'),
  gradle: join(REPO, 'android/app/build.gradle'),
  pbxproj: join(REPO, 'ios/App/App.xcodeproj/project.pbxproj'),
};

const args = parseBumpArgs(process.argv.slice(2));

const files = Object.fromEntries(
  Object.entries(PATHS).map(([k, p]) => [k, readFileSync(p, 'utf8')])
);
const version = args.version ?? JSON.parse(files.packageJson).version;
const build = args.build ?? nextBuild(readNativeVersions(files));

const next = setVersions(files, { version, build });
for (const [k, p] of Object.entries(PATHS)) writeFileSync(p, next[k]);
console.log(
  `version ${version} · build ${build} → package.json, Android versionName/versionCode, iOS MARKETING_VERSION/CURRENT_PROJECT_VERSION`
);
