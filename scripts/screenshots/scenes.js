// The store screenshot story (docs/store-metadata/store-screenshot-plan.md,
// "Six-screen story"), as data. Filenames, headlines and alt text are the
// plan's own; scenes.test.js holds them to the plan's limits.
//
// `skip` marks a scene this pipeline cannot produce honestly. Scene 5 needs
// the weekly league table, which is server state that only a signed-in
// account has; the plan forbids faking it, so it is captured by hand from the
// dedicated fictional account instead.

export const SCENES = [
  {
    id: 'chat',
    file: '01-chat-real-situations.png',
    headline: 'Talk through real situations',
    alt: 'German café conversation with the AI tutor and an expanded language correction.',
    // The learner turn. "ein Kaffee" is a deliberate accusative slip
    // (einen Kaffee), so the real AI flow has a correction to show.
    message: 'Ich möchte ein Kaffee mit Milch, bitte.',
    timeoutMs: 150_000,
  },
  {
    id: 'translate',
    file: '02-translate-your-level.png',
    headline: 'Practice at your level',
    alt: 'A German translation exercise with guided word choices and progress feedback.',
  },
  {
    id: 'vocab',
    file: '03-vocab-remember-more.png',
    headline: 'Remember more words',
    alt: 'Vocabulary practice card with a German word, English meaning and IPA pronunciation.',
  },
  {
    id: 'home',
    file: '04-home-daily-progress.png',
    headline: 'Make progress every day',
    alt: 'Home dashboard showing a daily streak, learning goal and three German practice quests.',
  },
  {
    id: 'stats',
    file: '05-stats-and-leagues.png',
    headline: 'See how far you’ve come',
    alt: 'Progress dashboard with XP, learning statistics and the weekly language league.',
    skip: 'needs the weekly league table, which only a signed-in account has; capture it from the fictional account',
  },
  {
    id: 'alphabet',
    file: '06-alphabet-listening.png',
    headline: 'Hear German clearly',
    alt: 'German alphabet and listening practice with pronunciation controls for a selected sound.',
    letter: 'Ä',
  },
];

export const FEATURE_GRAPHIC = {
  file: 'google-play-feature-graphic.png',
  width: 1024,
  height: 500,
  headline: 'GERMAN YOU CAN USE',
  alt: 'German conversation and vocabulary motifs in the cream, charcoal and red Deutsch Sprachschule visual style.',
};

// Export canvases from the plan's delivery matrix. `simulator` is the device
// type each capture comes from; its native pixels are what get composited.
export const TARGETS = {
  iphone: {
    label: 'App Store — iPhone 6.9"',
    width: 1320,
    height: 2868,
    platform: 'ios',
    simulator: 'com.apple.CoreSimulator.SimDeviceType.iPhone-18-Pro-Max',
  },
  ipad: {
    label: 'App Store — iPad 13"',
    width: 2064,
    height: 2752,
    platform: 'ios',
    simulator: 'com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M5-12GB',
  },
  play: {
    label: 'Google Play — phone',
    width: 1080,
    height: 1920,
    platform: 'android',
  },
};

export const capturableScenes = () => SCENES.filter((s) => !s.skip);
