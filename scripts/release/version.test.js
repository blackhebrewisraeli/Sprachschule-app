// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  readNativeVersions,
  nextBuild,
  setVersions,
  versionDrift,
  parseBumpArgs,
} from './version.js';

const real = () => ({
  packageJson: readFileSync('package.json', 'utf8'),
  gradle: readFileSync('android/app/build.gradle', 'utf8'),
  pbxproj: readFileSync('ios/App/App.xcodeproj/project.pbxproj', 'utf8'),
});

// Shaped like the real files: one gradle defaultConfig, two Xcode build configurations.
const fixture = (name = '1.0', build = 3, iosBuilds = [build, build]) => ({
  packageJson: `{\n  "name": "x",\n  "version": "1.2.3",\n  "private": true\n}\n`,
  gradle: `defaultConfig {\n        versionCode ${build}\n        versionName "${name}"\n}\n`,
  pbxproj: iosBuilds
    .map((b) => `\t\t\t\tCURRENT_PROJECT_VERSION = ${b};\n\t\t\t\tMARKETING_VERSION = ${name};\n`)
    .join(''),
});

describe('repository versions', () => {
  // The guard this module exists for: an upload with a stale or mismatched
  // number is rejected by the store, and nothing else in CI would notice.
  it('agree across package.json, Android and iOS', () => {
    expect(versionDrift(real())).toEqual([]);
  });
});

describe('readNativeVersions', () => {
  it('reads Android and every iOS build configuration', () => {
    expect(readNativeVersions(fixture('1.0', 3, [3, 4]))).toEqual({
      android: { name: '1.0', build: 3 },
      ios: { names: ['1.0', '1.0'], builds: [3, 4] },
    });
  });

  it('refuses files without the fields rather than guessing', () => {
    expect(() => readNativeVersions({ gradle: '', pbxproj: fixture().pbxproj })).toThrow(
      'build.gradle'
    );
    expect(() => readNativeVersions({ gradle: fixture().gradle, pbxproj: '' })).toThrow(
      'project.pbxproj'
    );
  });
});

describe('nextBuild', () => {
  it('goes one above the highest number either platform has used', () => {
    expect(nextBuild(readNativeVersions(fixture('1.0', 3, [5, 4])))).toBe(6);
  });
});

describe('setVersions', () => {
  it('writes one version and build into all three files', () => {
    const out = setVersions(fixture(), { version: '1.4.0', build: 4 });
    expect(JSON.parse(out.packageJson).version).toBe('1.4.0');
    expect(readNativeVersions(out)).toEqual({
      android: { name: '1.4.0', build: 4 },
      ios: { names: ['1.4.0', '1.4.0'], builds: [4, 4] },
    });
    expect(versionDrift(out)).toEqual([]);
  });

  it('touches nothing but the version fields', () => {
    const before = fixture();
    const out = setVersions(before, { version: '1.4.0', build: 4 });
    expect(out.packageJson.replace('1.4.0', '1.2.3')).toBe(before.packageJson);
    expect(out.gradle.replace('4', '3').replace('1.4.0', '1.0')).toBe(before.gradle);
  });

  it('refuses a build number that does not rise, which the stores would reject', () => {
    expect(() => setVersions(fixture('1.0', 3, [3, 5]), { version: '1.0.0', build: 5 })).toThrow(
      'not above 5'
    );
  });

  it('refuses versions Apple would reject and builds Play would', () => {
    expect(() => setVersions(fixture(), { version: '1.0', build: 9 })).toThrow('MAJOR.MINOR.PATCH');
    expect(() => setVersions(fixture(), { version: '1.0.0.1', build: 9 })).toThrow(
      'MAJOR.MINOR.PATCH'
    );
    expect(() => setVersions(fixture(), { version: '1.0.0', build: 2.5 })).toThrow('whole number');
    expect(() => setVersions(fixture(), { version: '1.0.0', build: 2_200_000_000 })).toThrow(
      'whole number'
    );
  });
});

describe('versionDrift', () => {
  it('names each disagreement', () => {
    expect(versionDrift(fixture('1.0', 3, [3, 4]))).toEqual([
      'Android versionName 1.0 ≠ package.json 1.2.3',
      'iOS MARKETING_VERSION 1.0 ≠ package.json 1.2.3',
      'iOS build 4 ≠ Android versionCode 3',
    ]);
  });
});

describe('parseBumpArgs', () => {
  it('reads a bare version, a build number, both, or neither', () => {
    expect(parseBumpArgs([])).toEqual({ version: null, build: null });
    // The first argument used to be dropped whenever --build was absent.
    expect(parseBumpArgs(['1.1.0'])).toEqual({ version: '1.1.0', build: null });
    expect(parseBumpArgs(['--build', '7'])).toEqual({ version: null, build: 7 });
    expect(parseBumpArgs(['1.1.0', '--build', '7'])).toEqual({ version: '1.1.0', build: 7 });
    expect(parseBumpArgs(['--build', '7', '1.1.0'])).toEqual({ version: '1.1.0', build: 7 });
  });

  it('refuses what it cannot read instead of bumping something else', () => {
    expect(() => parseBumpArgs(['--build'])).toThrow('whole number');
    expect(() => parseBumpArgs(['--version', '1.1.0'])).toThrow('unknown flag --version');
    expect(() => parseBumpArgs(['1.1.0', '1.2.0'])).toThrow('unexpected argument 1.2.0');
  });
});
