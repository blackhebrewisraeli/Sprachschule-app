// Deterministic guest seed for the Home → Vocab learning-path smoke.
//
// Uses the real Food & Drink curated deck (same source App.test.jsx uses for
// #277) and the real localStorage keys the app already persists. Nothing here
// invents a new blob, key, or SRS shape.
//
// One card is left unlearned so `deriveMissions` opens `deck-unfinished` with
// a named `deckId`. The other nine are marked learned in both maps App writes
// (`learnedByDeck` is the scoped record; `learnedWords` is the legacy mirror).

import { activePack } from '../../src/packs/index.js';

/** Same key `src/lib/storage.js` owns. */
export const STATE_KEY = 'deutsch-app-state-v1';

/** Same key `src/lib/tutorialPref.js` owns. */
export const TUTORIAL_KEY = 'deutsch-tutorial-completed';

/** Same key `src/lib/levelPref.js` owns. */
export const LEVEL_KEY = 'deutsch-level';

/** Curated deck that is not the Vocab default (`greetings`), so a wrong hop is visible. */
export const DECK_ID = 'food';

export function foodDeck() {
  const cards = activePack.content.decks[DECK_ID];
  if (!Array.isArray(cards) || cards.length < 2) {
    throw new Error(`learning-path-seed: pack deck "${DECK_ID}" is missing or too small`);
  }
  return cards;
}

export function srsKey(deckId, cardId) {
  return `${deckId}:${cardId}`;
}

/**
 * @param {{ remaining?: number }} [opts]
 * @returns {{
 *   deckId: string,
 *   cards: object[],
 *   learnedCards: object[],
 *   remainingCards: object[],
 *   remainingCount: number,
 *   recommendation: RegExp,
 *   localStorage: Record<string, string>,
 * }}
 */
export function learningPathSeed({ remaining = 1 } = {}) {
  const cards = foodDeck();
  if (remaining < 1 || remaining >= cards.length) {
    throw new Error(`learning-path-seed: remaining must be in 1..${cards.length - 1}`);
  }

  const learnedCards = cards.slice(0, cards.length - remaining);
  const remainingCards = cards.slice(cards.length - remaining);
  const learnedWords = Object.fromEntries(learnedCards.map((card) => [card.id, true]));
  const learnedByDeck = {
    [DECK_ID]: Object.fromEntries(learnedCards.map((card) => [card.id, true])),
  };

  // Park every curated card in a future box so no review is due and `srs-due`
  // cannot outrank `deck-unfinished` on the Recommended row. Until 2026-09-29
  // `getDueCount` treated a missing SRS row as due, so without this seed the hop
  // under test sat in Missionen instead of the two promoted cards. Unseen cards
  // are now new rather than due; the seed stays so every card's state is
  // explicit rather than resting on that default.
  const later = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const srs = {};
  for (const [id, deckCards] of Object.entries(activePack.content.decks)) {
    for (const card of deckCards) {
      srs[srsKey(id, card.id)] = { box: 2, lastReviewed: 1, nextDue: later, reps: 1 };
    }
  }

  // Goal already met: otherwise `goal-remaining` takes the second recommended
  // slot. `bonusXp` is the same field `xpForDay` already reads.
  const today = todayStamp();
  const daily = {
    [today]: {
      total: 1,
      bonusXp: 50,
      byTab: { chat: 0, alphabet: 0, vocab: 1, translate: 0 },
      byLevel: {
        a1: { correct: 1, almost: 0, wrong: 0 },
        a2: { correct: 0, almost: 0, wrong: 0 },
        b1: { correct: 0, almost: 0, wrong: 0 },
      },
    },
  };

  return {
    deckId: DECK_ID,
    cards,
    learnedCards,
    remainingCards,
    remainingCount: remainingCards.length,
    // Pack copy from src/packs/de/missions.js — singular when remaining === 1.
    recommendation: remaining === 1 ? /1 card left in your deck/i : /\d+ cards left in your deck/i,
    localStorage: {
      [TUTORIAL_KEY]: 'true',
      [LEVEL_KEY]: 'a1',
      // Written by the entry flow; audit-contrast seeds it for the same reason.
      'deutsch-onboarded': '1',
      'deutsch-welcome-dismissed': '1',
      [STATE_KEY]: JSON.stringify({
        learnedWords,
        learnedByDeck,
        srs,
        daily,
        gamification: { goal: 50 },
        stats: { streak: 0, learnedCount: learnedCards.length },
      }),
    },
  };
}

function todayStamp(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Expand the Vocab deck picker if it is collapsed. On mobile widths DeckPicker
 * folds into a <details> whose summary names only the current deck, so the
 * deck rows are not visible until it opens; on wide layouts there is no
 * <details> and this is a no-op. Checks `open` first rather than clicking the
 * summary blindly, because a click on an already-open disclosure closes it.
 *
 * @param {import('playwright').Page} page
 */
export async function openDeckPicker(page) {
  const picker = page.locator('details:has(summary:has-text("Deck"))');
  if ((await picker.count()) === 0) return;
  if (await picker.evaluate((el) => el.open)) return;
  await picker.locator('summary').click();
}
