import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The name people see under the icon, in the tab and on install. `cap sync`
// does not copy capacitor.config.ts's appName into ios/ or android/ after
// `cap add`, so these drift unless something pins them together. The bundle
// ID is an identity, not a name: a new one is a new app in both stores.
const read = (path) => readFileSync(path, 'utf8');

describe('declared app name', () => {
  it('capacitor.config.ts', () => {
    expect(read('capacitor.config.ts')).toMatch(/appName:\s*'sprachschule-app'/);
  });

  it('iOS CFBundleDisplayName', () => {
    expect(read('ios/App/App/Info.plist')).toMatch(
      /<key>CFBundleDisplayName<\/key>\s*<string>sprachschule-app<\/string>/
    );
  });

  it('Android app_name and activity title', () => {
    const xml = read('android/app/src/main/res/values/strings.xml');
    expect(xml).toMatch(/<string name="app_name">sprachschule-app<\/string>/);
    expect(xml).toMatch(/<string name="title_activity_main">sprachschule-app<\/string>/);
  });

  it('web title and PWA manifest', () => {
    expect(read('index.html')).toMatch(/<title>sprachschule-app<\/title>/);
    expect(read('vite.config.js')).toMatch(/\bname:\s*'sprachschule-app'/);
    expect(read('vite.config.js')).toMatch(/short_name:\s*'sprachschule-app'/);
  });

  it('npm package name', () => {
    expect(JSON.parse(read('package.json')).name).toBe('sprachschule-app');
  });

  it('keeps the bundle / application ID', () => {
    expect(read('capacitor.config.ts')).toMatch(/appId:\s*'com\.sprachschule\.deutsch'/);
    expect(read('android/app/src/main/res/values/strings.xml')).toMatch(
      /<string name="package_name">com\.sprachschule\.deutsch<\/string>/
    );
  });
});
