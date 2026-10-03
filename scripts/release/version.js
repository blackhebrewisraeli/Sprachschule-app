// One version for the web app and both store builds.
//
// `package.json` holds the version string; the build number lives in the
// native projects, where the stores read it: Android's `versionCode` and iOS's
// `CURRENT_PROJECT_VERSION` (Info.plist reads both iOS values from these build
// settings). Every upload to TestFlight or Play needs a build number higher
// than the last, so the two platforms share one counter and it only goes up.

// Apple allows at most three period-separated integers; Play takes any string,
// so the stricter rule wins.
const VERSION_RE = /^\d+\.\d+\.\d+$/;
// Play's ceiling for versionCode.
const MAX_BUILD = 2_100_000_000;

const GRADLE_CODE = /^(\s*versionCode\s+)(\d+)\s*$/m;
const GRADLE_NAME = /^(\s*versionName\s+)"([^"]*)"\s*$/m;
const PBX_BUILD = /(CURRENT_PROJECT_VERSION = )([^;]+);/g;
const PBX_NAME = /(MARKETING_VERSION = )([^;]+);/g;

/** @returns {{ android: { name: string, build: number }, ios: { names: string[], builds: number[] } }} */
export function readNativeVersions({ gradle, pbxproj }) {
  const code = gradle.match(GRADLE_CODE);
  const name = gradle.match(GRADLE_NAME);
  if (!code || !name) throw new Error('build.gradle has no single versionCode / versionName line');
  const builds = [...pbxproj.matchAll(PBX_BUILD)].map((m) => Number(m[2]));
  const names = [...pbxproj.matchAll(PBX_NAME)].map((m) => m[2].trim());
  if (!builds.length || !names.length) {
    throw new Error('project.pbxproj has no CURRENT_PROJECT_VERSION / MARKETING_VERSION');
  }
  return { android: { name: name[2], build: Number(code[2]) }, ios: { names, builds } };
}

/** The next build number: one above the highest either platform has used. */
export function nextBuild(versions) {
  return Math.max(versions.android.build, ...versions.ios.builds) + 1;
}

/**
 * @param {{ gradle: string, pbxproj: string, packageJson: string }} files
 * @param {{ version: string, build: number }} next
 * @returns {{ gradle: string, pbxproj: string, packageJson: string }}
 */
export function setVersions(files, { version, build }) {
  if (!VERSION_RE.test(version)) {
    throw new Error(`version "${version}" must be MAJOR.MINOR.PATCH (Apple allows no more)`);
  }
  if (!Number.isInteger(build) || build < 1 || build > MAX_BUILD) {
    throw new Error(`build ${build} must be a whole number from 1 to ${MAX_BUILD}`);
  }
  const current = readNativeVersions(files);
  const highest = nextBuild(current) - 1;
  if (build <= highest) {
    throw new Error(
      `build ${build} is not above ${highest}; the stores reject a build number that does not increase`
    );
  }
  if (!/"version":\s*"[^"]*"/.test(files.packageJson))
    throw new Error('package.json has no "version"');
  return {
    packageJson: files.packageJson.replace(/("version":\s*")[^"]*(")/, `$1${version}$2`),
    gradle: files.gradle
      .replace(GRADLE_CODE, (_, lead) => `${lead}${build}`)
      .replace(GRADLE_NAME, (_, lead) => `${lead}"${version}"`),
    pbxproj: files.pbxproj
      .replace(PBX_BUILD, (_, lead) => `${lead}${build};`)
      .replace(PBX_NAME, (_, lead) => `${lead}${version};`),
  };
}

/** Disagreements between the three files, as readable lines. Empty = in sync. */
export function versionDrift(files) {
  const version = JSON.parse(files.packageJson).version;
  const v = readNativeVersions(files);
  const drift = [];
  if (v.android.name !== version)
    drift.push(`Android versionName ${v.android.name} ≠ package.json ${version}`);
  for (const n of new Set(v.ios.names))
    if (n !== version) drift.push(`iOS MARKETING_VERSION ${n} ≠ package.json ${version}`);
  for (const b of new Set(v.ios.builds)) {
    if (b !== v.android.build)
      drift.push(`iOS build ${b} ≠ Android versionCode ${v.android.build}`);
  }
  return drift;
}

/**
 * `release:bump` arguments: an optional version and an optional `--build N`.
 * @returns {{ version: string | null, build: number | null }}
 */
export function parseBumpArgs(argv) {
  let version = null;
  let build = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--build') {
      build = Number(argv[++i]);
      if (!Number.isInteger(build)) throw new Error('--build needs a whole number');
    } else if (arg.startsWith('--')) {
      throw new Error(`unknown flag ${arg}`);
    } else if (version === null) {
      version = arg;
    } else {
      throw new Error(`unexpected argument ${arg}`);
    }
  }
  return { version, build };
}
