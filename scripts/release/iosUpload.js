// Pure pieces of `npm run ios:upload` (ios-upload.mjs): reading the signing
// team, the export options, and turning xcodebuild's failures into the step the
// owner actually has to take.

/** The one DEVELOPMENT_TEAM the App target signs with. */
export function teamIdFrom(pbxproj) {
  const ids = [
    ...new Set([...pbxproj.matchAll(/DEVELOPMENT_TEAM = ([^;]+);/g)].map((m) => m[1].trim())),
  ];
  if (ids.length === 0) {
    throw new Error(
      'No signing team in the Xcode project. Open ios/App/App.xcodeproj → App target → Signing & Capabilities, pick your Team, save, and run this again.'
    );
  }
  if (ids.length > 1)
    throw new Error(`The Xcode project names more than one team: ${ids.join(', ')}`);
  if (!/^[A-Z0-9]{10}$/.test(ids[0]))
    throw new Error(`"${ids[0]}" is not a 10-character Apple Team ID`);
  return ids[0];
}

/**
 * ExportOptions.plist for an App Store Connect upload. Version and build stay
 * ours (`npm run release:bump`), so Xcode must not renumber them.
 */
export function exportOptionsPlist({ teamId }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>destination</key>
  <string>upload</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>teamID</key>
  <string>${teamId}</string>
  <key>uploadSymbols</key>
  <true/>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
</dict>
</plist>
`;
}

// Ordered: the first match is the most specific explanation.
const HINTS = [
  [
    /No Accounts|No account for team|not signed in|sign in with your Apple ID|Authentication failed|Unable to authenticate/i,
    'Xcode is not signed in with your developer Apple ID: Xcode → Settings → Accounts → +, sign in, then run this again.',
  ],
  [
    /Program License Agreement|PLA Update|agreement.*(not|has not been) (been )?(accepted|signed)/i,
    'Apple needs a new agreement accepted: sign in to developer.apple.com (and App Store Connect → Business) and accept it.',
  ],
  [
    /personal (development )?team|not (a member of|enrolled in) the Apple Developer Program|team .* (cannot|can't|does not) .*(distribut|App Store)|No signing certificate "(iOS|Apple) Distribution"|No profiles for '.*' were found.*(App Store|app-store)/i,
    'This team cannot upload to App Store Connect yet. A free Personal Team never can; a new paid membership can until Apple activates it (watch for the activation email), then make sure the project uses the paid team.',
  ],
  [
    /No suitable application records|Cannot determine the Apple ID|app record|no App Store Connect app|bundle identifier .* (is not available|cannot be found)/i,
    'App Store Connect has no app for com.sprachschule.deutsch yet: App Store Connect → Apps → + → New App, with that bundle ID, then run this again.',
  ],
  [
    /bundle version must be higher|CFBundleVersion.*(previously|already)|redundant binary|already been (used|uploaded)/i,
    'That build number was already uploaded: run `npm run release:bump`, commit, and run this again.',
  ],
  [
    /requires a development team|Signing for "App" requires/i,
    'Pick a Team: ios/App/App.xcodeproj → App target → Signing & Capabilities.',
  ],
];

/** The owner's next step for an xcodebuild failure, from its output. */
export function explainXcodeFailure(output) {
  for (const [pattern, hint] of HINTS) if (pattern.test(output)) return hint;
  return 'xcodebuild failed for a reason this script does not recognise; the full log is saved next to the archive.';
}
