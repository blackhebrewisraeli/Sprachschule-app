// Safe capture state for the store screenshots (docs/store-metadata/store-screenshot-plan.md).
//
// The plan asks for a fictional learner with a believable, modest history: a
// seven-day streak, a daily goal still in progress, three quests and a populated
// league. This builds the guest-side half (everything that lives in
// localStorage) from the app's own keys and shapes, so the same state can be
// loaded into the iOS Simulator and an Android emulator.
//
// Nothing here invents a blob or a key: it reuses learning-path-seed's keys and
// the real daily-log shape, and derives its numbers with the app's own
// currentStreak / xpForDay in screenshot-seed.test.js, which is where the
// numbers are proved (src/ imports are extensionless, so plain `node` cannot
// load them; this file must stay runnable with `npm run seed:screenshots`). It
// holds no email, name, avatar or user id.
//
// NOT covered, because they live on the server: the weekly league table and a
// signed-in profile. Capture those scenes with the dedicated fictional account
// the plan describes.
import { activePack } from '../../src/packs/index.js';
import { STATE_KEY, TUTORIAL_KEY, LEVEL_KEY, srsKey } from './learning-path-seed.js';

export const SEED_GOAL = 50;
export const SEED_STREAK_DAYS = 7;
const LEARNED_PER_DECK = 6;

// Verdict counts per past day: every day clears the 50 XP goal by a plausible,
// uneven margin so the heatmap does not look generated.
const PAST_DAYS = [
  { correct: 7, almost: 1 },
  { correct: 6, almost: 2 },
  { correct: 9, almost: 0 },
  { correct: 7, almost: 2 },
  { correct: 8, almost: 1 },
  { correct: 6, almost: 1 },
  { correct: 8, almost: 2 },
];

function day(counts, level) {
  const empty = { correct: 0, almost: 0, wrong: 0 };
  const total = (counts.correct ?? 0) + (counts.almost ?? 0) + (counts.wrong ?? 0);
  return {
    total,
    bonusXp: 0,
    byTab: { chat: 1, alphabet: 0, vocab: Math.max(total - 2, 0), translate: 1 },
    byLevel: {
      a1: level === 'a1' ? { ...empty, ...counts } : { ...empty },
      a2: level === 'a2' ? { ...empty, ...counts } : { ...empty },
      b1: { ...empty },
    },
  };
}

function todayKey(date) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

function shiftDay(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * @param {{ now?: Date }} [opts]
 * @returns {{ localStorage: Record<string, string>, goal: number }}
 */
export function screenshotSeed({ now = new Date() } = {}) {
  const daily = {};
  // Seven completed days ending yesterday; today is deliberately unfinished so
  // the goal ring shows progress and the streak is alive, not just banked.
  PAST_DAYS.forEach((counts, i) => {
    daily[todayKey(shiftDay(now, -(PAST_DAYS.length - i)))] = day(counts, 'a2');
  });
  const today = todayKey(now);
  daily[today] = day({ correct: 2, almost: 1 }, 'a2');

  const learnedWords = {};
  const learnedByDeck = {};
  const srs = {};
  const later = now.getTime() + 3 * 24 * 60 * 60 * 1000;
  for (const [deckId, cards] of Object.entries(activePack.content.decks)) {
    const learned = cards.slice(0, LEARNED_PER_DECK);
    if (!learned.length) continue;
    learnedByDeck[deckId] = Object.fromEntries(learned.map((c) => [c.id, true]));
    for (const card of learned) {
      learnedWords[card.id] = true;
      srs[srsKey(deckId, card.id)] = {
        box: 2,
        lastReviewed: now.getTime(),
        nextDue: later,
        reps: 2,
      };
    }
  }

  return {
    goal: SEED_GOAL,
    localStorage: {
      [TUTORIAL_KEY]: 'true',
      [LEVEL_KEY]: 'a2',
      'deutsch-onboarded': '1',
      'deutsch-welcome-dismissed': '1',
      [STATE_KEY]: JSON.stringify({
        learnedWords,
        learnedByDeck,
        srs,
        daily,
        gamification: { goal: SEED_GOAL },
        stats: { streak: SEED_STREAK_DAYS, learnedCount: Object.keys(learnedWords).length },
      }),
    },
  };
}

/** A paste-able snippet for the WebView inspector (Safari Develop menu, chrome://inspect). */
export function pasteSnippet(seed = screenshotSeed()) {
  return `Object.entries(${JSON.stringify(seed.localStorage)}).forEach(([k, v]) => localStorage.setItem(k, v)); location.reload();`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seed = screenshotSeed();
  console.error(
    `Seed: ${SEED_STREAK_DAYS}-day streak, goal ${seed.goal}. Paste into the WebView console:`
  );
  console.log(pasteSnippet(seed));
}
