import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// App Store Connect reads the app's own PrivacyInfo.xcprivacy and the
// export-compliance key from the built bundle. Both are easy to lose: the
// manifest must be a Resources build file of the App target, not just a file
// on disk, and Capacitor's `cap sync` never rewrites either. The collected
// types mirror the unconditional rows of the audited App Privacy table in
// docs/STORE_SUBMISSION_CHECKLIST.md; push and saved conversations are
// conditional and dark, so they are not declared until they ship.
const read = (path) => readFileSync(path, 'utf8');
const manifest = read('ios/App/App/PrivacyInfo.xcprivacy');

describe('iOS privacy manifest', () => {
  it('declares no tracking and no tracked domains', () => {
    expect(manifest).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
    expect(manifest).toMatch(/<key>NSPrivacyTrackingDomains<\/key>\s*<array\/>/);
  });

  it('declares no required-reason API use (the app target calls none)', () => {
    expect(manifest).toMatch(/<key>NSPrivacyAccessedAPITypes<\/key>\s*<array\/>/);
  });

  it('declares exactly the unconditional collected data types, linked, for app functionality', () => {
    const types = [
      ...manifest.matchAll(/NSPrivacyCollectedDataType(?!Purpose)(\w+)<\/string>/g),
    ].map((m) => m[1]);
    expect(types.sort()).toEqual(
      [
        'EmailAddress',
        'Name',
        'OtherUserContent',
        'PhotosorVideos',
        'ProductInteraction',
        'UserID',
      ].sort()
    );
    expect(manifest.match(/<key>NSPrivacyCollectedDataTypeLinked<\/key>\s*<true\/>/g)).toHaveLength(
      6
    );
    expect(manifest).not.toMatch(/<key>NSPrivacyCollectedDataTypeTracking<\/key>\s*<true\/>/);
    expect(manifest.match(/PurposeAppFunctionality/g)).toHaveLength(6);
  });

  it('is bundled as a resource of the App target', () => {
    const pbx = read('ios/App/App.xcodeproj/project.pbxproj');
    expect(pbx).toMatch(/PrivacyInfo\.xcprivacy in Resources \*\/ = \{isa = PBXBuildFile/);
    expect(pbx).toMatch(/PrivacyInfo\.xcprivacy in Resources \*\/,/);
  });

  it('answers export compliance: HTTPS only, so exempt', () => {
    expect(read('ios/App/App/Info.plist')).toMatch(
      /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/
    );
  });
});
