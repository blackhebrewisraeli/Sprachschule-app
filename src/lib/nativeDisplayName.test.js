import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The name people see under the icon, in the tab and on install. `cap sync`
// does not copy capacitor.config.ts's appName into ios/ or android/ after
// `cap add`, so these drift unless something pins them together. The bundle
// ID is an identity, not a name: a new one is a new app in both stores.
const read = (path) => readFileSync(path, 'utf8');

// The store listings are named "Deutsch Sprachschule" (owner decision,
// 2026-09-30), and Google checks the deletion page against that name. The
// installed app, the browser tab and the installed PWA carry the same name.
// Only the npm package keeps `sprachschule-app`, on purpose: it is an
// identifier nobody sees.
describe('declared app name', () => {
  it('capacitor.config.ts', () => {
    expect(read('capacitor.config.ts')).toMatch(/appName:\s*'Deutsch Sprachschule'/);
  });

  it('iOS CFBundleDisplayName', () => {
    expect(read('ios/App/App/Info.plist')).toMatch(
      /<key>CFBundleDisplayName<\/key>\s*<string>Deutsch Sprachschule<\/string>/
    );
  });

  it('Android app_name and activity title', () => {
    const xml = read('android/app/src/main/res/values/strings.xml');
    expect(xml).toMatch(/<string name="app_name">Deutsch Sprachschule<\/string>/);
    expect(xml).toMatch(/<string name="title_activity_main">Deutsch Sprachschule<\/string>/);
  });

  it('web title, home-screen title and PWA manifest', () => {
    const html = read('index.html');
    expect(html).toMatch(/<title>Deutsch Sprachschule — Learn German with an AI tutor<\/title>/);
    expect(html).toMatch(/name="apple-mobile-web-app-title" content="Deutsch Sprachschule"/);
    expect(read('vite.config.js')).toMatch(/\bname:\s*'Deutsch Sprachschule'/);
    expect(read('vite.config.js')).toMatch(/short_name:\s*'Deutsch Sprachschule'/);
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
