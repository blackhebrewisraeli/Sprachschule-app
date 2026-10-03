// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { teamIdFrom, exportOptionsPlist, explainXcodeFailure } from './iosUpload.js';

const pbx = (...teams) =>
  teams
    .map((t) => `\t\t\t\tCODE_SIGN_STYLE = Automatic;\n\t\t\t\tDEVELOPMENT_TEAM = ${t};\n`)
    .join('');

describe('teamIdFrom', () => {
  it('reads the team both build configurations share', () => {
    expect(teamIdFrom(pbx('AB12CD34EF', 'AB12CD34EF'))).toBe('AB12CD34EF');
  });

  it('tells the owner where to pick a team when none is set', () => {
    expect(() => teamIdFrom('CODE_SIGN_STYLE = Automatic;')).toThrow('Signing & Capabilities');
  });

  it('refuses two different teams or a malformed one', () => {
    expect(() => teamIdFrom(pbx('AB12CD34EF', 'ZZ99YY88XX'))).toThrow('more than one team');
    expect(() => teamIdFrom(pbx('"$(TEAM)"'))).toThrow('not a 10-character');
  });
});

describe('exportOptionsPlist', () => {
  const plist = exportOptionsPlist({ teamId: 'AB12CD34EF' });

  it('uploads to App Store Connect with automatic signing for that team', () => {
    expect(plist).toMatch(/<key>method<\/key>\s*<string>app-store-connect<\/string>/);
    expect(plist).toMatch(/<key>destination<\/key>\s*<string>upload<\/string>/);
    expect(plist).toMatch(/<key>teamID<\/key>\s*<string>AB12CD34EF<\/string>/);
  });

  // release:bump owns the numbers; Xcode renumbering would desync Android.
  it('never lets Xcode renumber the build', () => {
    expect(plist).toMatch(/<key>manageAppVersionAndBuildNumber<\/key>\s*<false\/>/);
  });
});

describe('explainXcodeFailure', () => {
  const cases = [
    ['error: No Accounts: Add a new account in Accounts settings.', 'Settings → Accounts'],
    [
      'Team "Shimon Esterkin" is a personal development team',
      'cannot upload to App Store Connect yet',
    ],
    [
      `error: No profiles for 'com.sprachschule.deutsch' were found: Xcode couldn't find any iOS App Store provisioning profiles`,
      'cannot upload',
    ],
    ['No suitable application records were found. Verify your bundle identifier', 'New App'],
    [
      'The bundle version must be higher than the previously uploaded version: ‘2’.',
      'release:bump',
    ],
    ['error: Signing for "App" requires a development team.', 'Pick a Team'],
    ['You must accept the latest Program License Agreement', 'agreement'],
  ];
  it.each(cases)('%s → a concrete next step', (output, expected) => {
    expect(explainXcodeFailure(output)).toContain(expected);
  });

  it('says so when it does not recognise the failure, rather than guessing', () => {
    expect(explainXcodeFailure('segmentation fault')).toContain('does not recognise');
  });
});
