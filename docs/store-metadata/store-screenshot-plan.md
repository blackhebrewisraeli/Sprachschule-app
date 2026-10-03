# Store screenshot plan — English (U.S.)

Production brief for the first App Store and Google Play screenshot set. The
screens must be captured from the release-candidate native builds, not recreated
as mock UI. Marketing overlays may label what is already visible, but must not
promise Premium, ads, push notifications, or another feature before that feature
ships in the submitted build.

## Delivery matrix

| Store surface                 | Deliverable                                | Export                                                       |
| ----------------------------- | ------------------------------------------ | ------------------------------------------------------------ |
| App Store — iPhone            | Six portrait screenshots                   | `1320 × 2868` PNG or JPEG, no alpha (accepted 6.9-inch size) |
| App Store — iPad              | The same six scenes, recomposed for tablet | `2064 × 2752` PNG or JPEG, no alpha (accepted 13-inch size)  |
| Google Play — phone           | Six portrait screenshots                   | `1080 × 1920` JPEG or 24-bit PNG, no alpha                   |
| Google Play — feature graphic | One text-light brand composition           | `1024 × 500` JPEG or 24-bit PNG, no alpha                    |

The iPad set is required because the Xcode project targets device families 1
and 2. App Store Connect accepts one to ten screenshots for each required
device family. Google Play requires at least two screenshots; four or more
9:16 phone screenshots at 1080p also satisfy Google's recommendation for
large-format promotional eligibility.

Use the highest-resolution iPhone and iPad sets above and let App Store Connect
scale them for smaller displays. Do not upload a landscape set for this first
release.

## Visual direction

- Keep the shipped Fraunces / Plus Jakarta Sans / JetBrains Mono system and the
  cream, charcoal and red palette. This is a product demonstration, not a
  second visual identity.
- Use the light theme throughout the first set so the six images read as one
  story. The app's dark mode remains a listing-copy claim, but does not need a
  separate screenshot.
- Show the app itself prominently. A short headline may occupy the upper
  15–20% of the canvas; the remaining area is a real capture from the native
  app. Do not put the capture inside a device frame.
- Keep all important text and the visible UI away from the outer 5% of the
  canvas. Google may crop promotional surfaces.
- Do not use store badges, star ratings, rankings, testimonials, prices,
  limited-time claims, or calls to action such as “Download now.”

## Six-screen story

Capture the same story on iPhone, iPad and Android. Recompose rather than
stretching: the iPad image must be a real iPad capture and the Android image a
real Android capture.

| #   | Overlay headline                 | Native state to capture                                                                    | What the image proves                                            | Google Play alt text (≤ 140 characters)                                                  |
| --- | -------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 1   | **Talk through real situations** | Chat in the café scene: Anna has replied in German and one correction is expanded          | Scenario-based AI conversation and useful correction             | German café conversation with the AI tutor and an expanded language correction.          |
| 2   | **Practice at your level**       | Translate at A1 or A2 with a partially completed tile or fill-in-the-blank exercise        | Guided practice changes with the learner's level                 | A German translation exercise with guided word choices and progress feedback.            |
| 3   | **Remember more words**          | Vocabulary drill on a rich card showing the German term, English meaning, IPA and progress | Vocabulary, pronunciation support and spaced practice            | Vocabulary practice card with a German word, English meaning and IPA pronunciation.      |
| 4   | **Make progress every day**      | Populated Home dashboard with a live streak, daily goal and three quests                   | Streaks, goals and quests exist in the shipped product           | Home dashboard showing a daily streak, learning goal and three German practice quests.   |
| 5   | **See how far you’ve come**      | Stats with XP/level progress and an expanded weekly league table                           | Progress tracking and optional leagues                           | Progress dashboard with XP, learning statistics and the weekly language league.          |
| 6   | **Hear German clearly**          | Alphabet or listening practice with a letter/sound selected and its audio control visible  | Sound-focused practice without claiming recorded speech analysis | German alphabet and listening practice with pronunciation controls for a selected sound. |

If the final release build cannot produce one of these exact states without a
debug-only control, replace that scene with another real shipped state. Never
add a control, score, response, or correction in the image editor.

## Automated capture

```bash
npm run screenshots:capture
```

One command produces the iPhone, iPad and Play sets plus the feature graphic in
`store-screenshots/` (gitignored), with a `REPORT.md` listing every file, its
verified size, the Play alt text, and this plan's export checklist ticked only
where the run can prove it. Flags: `--targets iphone,ipad,play`,
`--scenes chat,home`, `--skip-build` (reuse the last native builds). The code is
in `scripts/screenshots/`.

How it stays inside this plan's rules:

- **Real native captures.** It runs `npm run build:mobile` (the store build's
  flags: push, saved conversations, Sentry and Apple sign-in off), builds the
  iOS **Release** app for the Simulator and the Android **debug** APK, and
  takes each frame with `simctl io screenshot` / `adb exec-out screencap`. The
  iPad set is a real iPad layout and the Play set a real Android one. Android
  uses the debug shell because the driver talks to it over the WebView's
  DevTools socket, which release builds switch off: Android refuses cleartext
  HTTP even to `127.0.0.1`, and opening it would mean loosening the app's
  manifest. The web bundle inside is the same `build:mobile` output.
- **Only what a learner could do.** A small driver (`driver.js`) is injected
  into the _copied_ bundle (`ios/App/App/public`,
  `android/app/src/main/assets/public`, both gitignored) and removed with
  `npx cap copy` afterwards, even on failure. It taps the same controls a
  learner taps. Vocab and Translate answers come from the shipped pack
  (`answers.js`), so the app grades a genuinely right answer, and the Chat
  reply and correction come from the live AI flow.
- **Fictional, clean state.** Every scene starts from a cleared, seeded
  localStorage (`screenshot-seed.js`), on dedicated "Deutsch Shots" Simulators
  set to English (U.S.) and light mode, with a 9:41 status bar, full battery
  and signal, and no notifications (Android demo mode).
- **Composition.** The capture is scaled proportionally (never stretched)
  under a headline band of 17% of the canvas, inside the 5% safe margin, with
  no device frame (`layout.js`, `compose.mjs`). Every export is checked from
  its own bytes for exact size, 8-bit depth and no alpha (`png.js`).

**Still by hand:** scene 5 needs the weekly league table, which is server state
that only a signed-in account has, so the run skips it and says so. Capture it
from the dedicated fictional account. The Simulators and emulator stay on your
Mac; the first run creates them. Android needs an emulator or phone attached
(`adb devices`); without one the Play set is skipped and the report says so.

## Safe capture state

1. Build the exact release candidate. Keep every not-yet-launched flag off,
   including push, Premium and rewarded ads.
2. Use a dedicated fictional learner account and fictional content. Do not show
   a real email address, avatar, user ID, notification, or production learner.
3. Seed a believable but modest history: a seven-day streak, an in-progress
   daily goal, three quests, and a populated league. Avoid implausible scores
   or claims that look like a ranking endorsement.
   **Seeding the guest half.** `npm run seed:screenshots` prints a one-line
   snippet that loads exactly this state (A2, a seven-day streak ending
   yesterday, today at 26 of a 50 XP goal, 24 learned words across four decks)
   into the app's real localStorage keys; `scripts/dev/screenshot-seed.js`
   documents the shape and `screenshot-seed.test.js` proves the numbers with the
   app's own streak and XP functions. Run the app on the simulator or emulator,
   attach the WebView inspector (Safari → Develop on iOS, `chrome://inspect` on
   Android), paste the snippet and let the page reload. Then tap **Try it first**
   on the welcome gate (a guest sees it on every launch) and **Not now** on the
   "Ready to check your level?" card. The inspector only attaches to a **debug**
   build of the same web bundle, not to a release candidate, so seed on the
   debug build, or finish the state through the fictional account instead; the
   plan's "exact release candidate" rule is yours to relax or keep. The weekly
   league table and a signed-in profile are server state and are not seeded
   here: use the dedicated fictional account for scenes 4 and 5.
4. Capture the Chat reply through the real submitted AI flow. Review the German
   and correction before capture; do not expose model names, token limits, or
   internal errors.
5. Set the simulator/device language to English (U.S.), use a neutral time,
   silence notifications, and ensure Wi-Fi, cellular and battery indicators
   are clean and full where the platform displays them.
6. Capture portrait at the native target size. Composite only the approved
   headline and background extension; never scale the UI non-proportionally.

## Google Play feature graphic

- Canvas: `1024 × 500`, no alpha.
- Suggested line: **GERMAN YOU CAN USE**.
- Use one strong vocabulary/conversation motif from the brand asset system,
  with the focal point and text near the centre. Do not repeat the launcher
  icon at large scale and do not include device hardware.
- Keep edge decoration expendable because Google crops the graphic on some
  surfaces. Supply alt text: `German conversation and vocabulary motifs in the
cream, charcoal and red Deutsch Sprachschule visual style.`

## Export and submission checks

- [ ] All twelve Apple captures and six Android captures show the submitted
      build and the same six feature claims.
- [ ] The first three images prioritise real UI and the app's core learning
      experience.
- [ ] No screenshot contains personal data, production credentials, debug
      controls, ads, push, Premium, or an unshipped feature.
- [ ] Every overlay is English (U.S.), readable at thumbnail size and occupies
      no more than 20% of the image.
- [ ] PNG exports have no alpha channel; no image is blurry, stretched or
      rotated incorrectly.
- [ ] iPhone exports are exactly `1320 × 2868`; iPad exports are exactly
      `2064 × 2752`; Play phone exports are exactly `1080 × 1920`; the feature
      graphic is exactly `1024 × 500`.
- [ ] Each Play screenshot and the feature graphic receives the alt text from
      this brief.
- [ ] The final captures still match the claims in
      `app-store-listing.md` and `google-play-listing.md`.

Suggested filenames:

```text
01-chat-real-situations.png
02-translate-your-level.png
03-vocab-remember-more.png
04-home-daily-progress.png
05-stats-and-leagues.png
06-alphabet-listening.png
google-play-feature-graphic.png
```

## Official sources

- [Apple screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/)
  — accepted formats, one-to-ten limit, no alpha and current iPhone/iPad sizes;
  accessed 2026-10-02.
- [Apple: upload app previews and screenshots](https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots)
  — highest-resolution assets can scale to smaller displays; accessed
  2026-10-02.
- [Apple App Review Guidelines §2.3.3](https://developer.apple.com/app-store/review/guidelines/)
  — screenshots must show the app in use and may include text/image overlays;
  accessed 2026-10-02.
- [Google Play preview asset requirements](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en-en)
  — screenshot, feature-graphic, content and alt-text rules; accessed
  2026-10-02.
