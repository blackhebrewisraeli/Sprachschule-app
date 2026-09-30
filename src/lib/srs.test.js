// SRS (Leitner) tests. Storage shape:
//   state.srs: {
//     '<deckId>:<de>': { box, lastReviewed, nextDue, reps }
//   }
//
// Verdict model — Anki-style:
//   again  → Box 1, due soon          (used when the underlying answer was wrong,
//                                       or user self-rates as failed)
//   hard   → same box, refresh dueTs  (got it but struggled)
//   good   → next box                  (clean correct)
//   easy   → advance 2 boxes           (trivially correct)
//
// VocabTab calls recordVocabAnswer with the SRS verdict the user picked from
// the Hard / Good / Easy buttons (or 'again' on a wrong answer's required
// Again button).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  LEITNER_INTERVALS_MS,
  MASTERED_BOX,
  SRS_VERDICTS,
  srsKey,
  srsApply,
  getDueCards,
  getDueCount,
  getNewCount,
  getMasteredCount,
  recordVocabAnswer,
} from './srs';
import { loadState } from './storage';

const STORAGE_KEY = 'deutsch-app-state-v1';
const DAY = 24 * 60 * 60 * 1000;

// ─── Constants ────────────────────────────────────────────────

describe('Leitner constants', () => {
  it('intervals are monotonically increasing across boxes 1..5', () => {
    expect(LEITNER_INTERVALS_MS).toHaveLength(5);
    for (let i = 1; i < 5; i++) {
      expect(LEITNER_INTERVALS_MS[i]).toBeGreaterThan(LEITNER_INTERVALS_MS[i - 1]);
    }
  });

  it('Box 1 is 1 day, Box 5 is 30 days', () => {
    expect(LEITNER_INTERVALS_MS[0]).toBe(1 * DAY);
    expect(LEITNER_INTERVALS_MS[4]).toBe(30 * DAY);
  });

  it('MASTERED_BOX is 5', () => {
    expect(MASTERED_BOX).toBe(5);
  });

  it('SRS_VERDICTS is the 4-level Anki-style classification', () => {
    expect(SRS_VERDICTS).toEqual(['again', 'hard', 'good', 'easy']);
  });
});

// ─── srsKey ───────────────────────────────────────────────────

describe('srsKey', () => {
  it('joins deckId and German word with a colon', () => {
    expect(srsKey('greetings', 'Hallo')).toBe('greetings:Hallo');
    expect(srsKey('food', 'das Brot')).toBe('food:das Brot');
  });
});

// ─── srsApply ─────────────────────────────────────────────────

describe('srsApply', () => {
  // ── New card (no prior entry) ──
  it('seeds a new card at Box 1 on "again"', () => {
    const next = srsApply({}, 'greetings', 'Hallo', 'again', 1000);
    const entry = next['greetings:Hallo'];
    expect(entry.box).toBe(1);
    expect(entry.lastReviewed).toBe(1000);
    expect(entry.nextDue).toBe(1000 + LEITNER_INTERVALS_MS[0]);
    expect(entry.reps).toBe(1);
  });

  it('seeds a new card at Box 1 on "hard" (stays, no demotion possible)', () => {
    const next = srsApply({}, 'greetings', 'Hallo', 'hard', 1000);
    expect(next['greetings:Hallo'].box).toBe(1);
  });

  it('advances a new card to Box 2 on "good"', () => {
    const next = srsApply({}, 'greetings', 'Hallo', 'good', 1000);
    expect(next['greetings:Hallo'].box).toBe(2);
    expect(next['greetings:Hallo'].nextDue).toBe(1000 + LEITNER_INTERVALS_MS[1]);
  });

  it('advances a new card to Box 3 on "easy" (skips a box)', () => {
    const next = srsApply({}, 'greetings', 'Hallo', 'easy', 1000);
    expect(next['greetings:Hallo'].box).toBe(3);
    expect(next['greetings:Hallo'].nextDue).toBe(1000 + LEITNER_INTERVALS_MS[2]);
  });

  // ── Existing card transitions ──
  it('"hard" on an existing card keeps the box and refreshes timestamps', () => {
    let srs = {};
    srs = srsApply(srs, 'greetings', 'Hallo', 'good', 1000); // box 2
    srs = srsApply(srs, 'greetings', 'Hallo', 'good', 2000); // box 3
    srs = srsApply(srs, 'greetings', 'Hallo', 'hard', 3000); // stays at 3
    expect(srs['greetings:Hallo'].box).toBe(3);
    expect(srs['greetings:Hallo'].lastReviewed).toBe(3000);
    expect(srs['greetings:Hallo'].nextDue).toBe(3000 + LEITNER_INTERVALS_MS[2]);
  });

  it('"again" sends an advanced card all the way back to Box 1', () => {
    let srs = {};
    for (let i = 0; i < 4; i++) {
      srs = srsApply(srs, 'food', 'das Brot', 'good', 1000 + i * 1000);
    }
    expect(srs['food:das Brot'].box).toBe(MASTERED_BOX);
    srs = srsApply(srs, 'food', 'das Brot', 'again', 9999);
    expect(srs['food:das Brot'].box).toBe(1);
    expect(srs['food:das Brot'].nextDue).toBe(9999 + LEITNER_INTERVALS_MS[0]);
  });

  it('"good" advances exactly one box, "easy" advances two', () => {
    let srs = {};
    srs = srsApply(srs, 'food', 'das Brot', 'good', 1); // box 2
    expect(srs['food:das Brot'].box).toBe(2);
    srs = srsApply(srs, 'food', 'das Brot', 'easy', 2); // box 4
    expect(srs['food:das Brot'].box).toBe(4);
  });

  it('"easy" past Box 5 caps at MASTERED_BOX', () => {
    let srs = {};
    srs = srsApply(srs, 'food', 'das Brot', 'easy', 1); // 3
    srs = srsApply(srs, 'food', 'das Brot', 'easy', 2); // 5
    srs = srsApply(srs, 'food', 'das Brot', 'easy', 3); // would be 7, capped
    expect(srs['food:das Brot'].box).toBe(MASTERED_BOX);
  });

  it('"good" past Box 5 caps at MASTERED_BOX', () => {
    let srs = {};
    for (let i = 0; i < 10; i++) {
      srs = srsApply(srs, 'food', 'das Brot', 'good', 1000 + i);
    }
    expect(srs['food:das Brot'].box).toBe(MASTERED_BOX);
  });

  it('increments reps on every interaction', () => {
    let srs = {};
    srs = srsApply(srs, 'travel', 'der Pass', 'good', 1);
    srs = srsApply(srs, 'travel', 'der Pass', 'again', 2);
    srs = srsApply(srs, 'travel', 'der Pass', 'hard', 3);
    srs = srsApply(srs, 'travel', 'der Pass', 'easy', 4);
    expect(srs['travel:der Pass'].reps).toBe(4);
  });

  it('does not mutate the input srs map', () => {
    const before = {};
    srsApply(before, 'greetings', 'Hallo', 'good', 1);
    expect(before).toEqual({});
  });

  it('throws on an invalid verdict', () => {
    expect(() => srsApply({}, 'greetings', 'Hallo', 'correct', 1)).toThrow(/verdict/);
    expect(() => srsApply({}, 'greetings', 'Hallo', 'maybe', 1)).toThrow(/verdict/);
  });
});

// ─── getDueCards ──────────────────────────────────────────────

describe('getDueCards', () => {
  const deck = [
    { id: 'Hallo', de: 'Hallo', en: 'Hello' },
    { id: 'Tschüss', de: 'Tschüss', en: 'Bye' },
    { id: 'Danke', de: 'Danke', en: 'Thanks' },
    { id: 'Bitte', de: 'Bitte', en: 'Please' },
  ];

  it('treats cards with no SRS entry as new (deck-order, after due cards)', () => {
    const queue = getDueCards({}, deck, 'greetings', 5000);
    expect(queue).toEqual([0, 1, 2, 3]);
  });

  it('puts due cards first (oldest nextDue first), then new', () => {
    const srs = {
      'greetings:Tschüss': { box: 1, lastReviewed: 100, nextDue: 200, reps: 1 },
      'greetings:Bitte': { box: 1, lastReviewed: 50, nextDue: 100, reps: 1 },
      // Hallo and Danke are new
    };
    const queue = getDueCards(srs, deck, 'greetings', 5000);
    // Bitte (idx 3) is oldest-due, then Tschüss (idx 1), then new in deck order: Hallo (0), Danke (2)
    expect(queue).toEqual([3, 1, 0, 2]);
  });

  it('puts not-yet-due cards last (over-review, least-recently-reviewed first)', () => {
    const farFuture = 999999999;
    const srs = {
      'greetings:Hallo': { box: 5, lastReviewed: 1000, nextDue: farFuture, reps: 10 },
      'greetings:Tschüss': { box: 5, lastReviewed: 500, nextDue: farFuture, reps: 10 },
      'greetings:Danke': { box: 5, lastReviewed: 2000, nextDue: farFuture, reps: 10 },
      'greetings:Bitte': { box: 5, lastReviewed: 1500, nextDue: farFuture, reps: 10 },
    };
    const queue = getDueCards(srs, deck, 'greetings', 5000);
    // No due, no new — all over-review. Oldest first: Tschüss(500), Hallo(1000), Bitte(1500), Danke(2000)
    expect(queue).toEqual([1, 0, 3, 2]);
  });

  it('correctly mixes due, new, and over-review buckets', () => {
    const srs = {
      'greetings:Hallo': { box: 1, lastReviewed: 100, nextDue: 200, reps: 1 }, // due
      'greetings:Tschüss': { box: 5, lastReviewed: 1000, nextDue: 999999999, reps: 5 }, // over-review
      // Danke and Bitte are new
    };
    const queue = getDueCards(srs, deck, 'greetings', 5000);
    expect(queue).toEqual([0, 2, 3, 1]);
  });
});

// ─── getDueCount ──────────────────────────────────────────────

describe('getDueCount', () => {
  it('counts cards across all decks where nextDue ≤ now', () => {
    const decks = {
      greetings: [
        { id: 'Hallo', de: 'Hallo' },
        { id: 'Tschüss', de: 'Tschüss' },
      ],
      food: [
        { id: 'das Brot', de: 'das Brot' },
        { id: 'der Käse', de: 'der Käse' },
      ],
    };
    const srs = {
      'greetings:Hallo': { box: 1, nextDue: 100, lastReviewed: 50, reps: 1 },
      'food:das Brot': { box: 2, nextDue: 5000, lastReviewed: 3000, reps: 2 },
      'food:der Käse': { box: 5, nextDue: 999999999, lastReviewed: 0, reps: 10 },
    };
    // At now=200: Hallo due (100<=200), Brot not-due (5000>200), Käse not-due (future)
    // Tschüss has no entry → NEW, not due
    expect(getDueCount(srs, decks, 200)).toBe(1); // Hallo only
  });

  // The first-launch rule. A brand-new learner has studied nothing, so nothing
  // is owed: no "40 cards are due", no red DUE NOW, no "9+" nav badge.
  it('does not count new cards (no SRS entry) as due', () => {
    const decks = {
      greetings: [
        { id: 'Hallo', de: 'Hallo' },
        { id: 'Tschüss', de: 'Tschüss' },
      ],
    };
    expect(getDueCount({}, decks, 100)).toBe(0);
  });

  it('returns 0 when everything is on a future review', () => {
    const decks = { greetings: [{ id: 'Hallo', de: 'Hallo' }] };
    const srs = {
      'greetings:Hallo': { box: 5, nextDue: 999999999, lastReviewed: 0, reps: 10 },
    };
    expect(getDueCount(srs, decks, 100)).toBe(0);
  });

  it('keys on card.id, not the surface form', () => {
    const deck = [{ id: 'g1', de: 'Hallo', en: 'Hello' }];
    const srs = { 'greetings:g1': { box: 5, nextDue: 999999999, lastReviewed: 0, reps: 9 } };
    // Entry exists under id 'g1', overdue → due → 1. If the engine keyed on
    // de ('Hallo') it would find no entry, read the card as new, and count 0.
    const overdue = { 'greetings:g1': { box: 2, nextDue: 500, lastReviewed: 0, reps: 2 } };
    expect(getDueCount(overdue, { greetings: deck }, 1000)).toBe(1);
    expect(getDueCount(srs, { greetings: deck }, 1000)).toBe(0);
  });
});

// ─── getNewCount ──────────────────────────────────────────────

describe('getNewCount', () => {
  const decks = {
    greetings: [
      { id: 'Hallo', de: 'Hallo' },
      { id: 'Tschüss', de: 'Tschüss' },
    ],
    food: [{ id: 'das Brot', de: 'das Brot' }],
  };

  it('counts every card as new when nothing has been studied', () => {
    expect(getNewCount({}, decks)).toBe(3);
  });

  it('never counts a card as both new and due', () => {
    const srs = {
      // Overdue: due, not new.
      'greetings:Hallo': { box: 1, nextDue: 100, lastReviewed: 50, reps: 1 },
      // Scheduled ahead: neither.
      'food:das Brot': { box: 3, nextDue: 9999, lastReviewed: 50, reps: 3 },
    };
    expect(getNewCount(srs, decks)).toBe(1); // Tschüss
    expect(getDueCount(srs, decks, 200)).toBe(1); // Hallo
  });

  it('keys on card.id and the deck, so the same word in two decks is new in each', () => {
    const shared = { a: [{ id: 'x', de: 'x' }], b: [{ id: 'x', de: 'x' }] };
    const srs = { 'a:x': { box: 1, nextDue: 9999, lastReviewed: 0, reps: 1 } };
    expect(getNewCount(srs, shared)).toBe(1); // only b:x
  });
});

// ─── getMasteredCount ─────────────────────────────────────────

describe('getMasteredCount', () => {
  it('counts entries at MASTERED_BOX (Box 5)', () => {
    const srs = {
      'greetings:Hallo': { box: 5, nextDue: 0, lastReviewed: 0, reps: 10 },
      'greetings:Tschüss': { box: 4, nextDue: 0, lastReviewed: 0, reps: 5 },
      'food:das Brot': { box: 5, nextDue: 0, lastReviewed: 0, reps: 8 },
    };
    expect(getMasteredCount(srs)).toBe(2);
  });

  it('returns 0 for empty map', () => {
    expect(getMasteredCount({})).toBe(0);
  });
});

// ─── recordVocabAnswer (imperative wrapper) ───────────────────

describe('recordVocabAnswer', () => {
  beforeEach(() => {
    localStorage.removeItem(STORAGE_KEY);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists a card transition to state.srs', () => {
    recordVocabAnswer('greetings', 'Hallo', 'good');
    const state = loadState();
    expect(state.srs['greetings:Hallo']).toBeDefined();
    expect(state.srs['greetings:Hallo'].box).toBe(2);
  });

  it('preserves daily, stats, learnedWords, items on the saved state', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        stats: { streak: 3 },
        learnedWords: { Hallo: true },
        daily: { '2026-06-06': { total: 1, byTab: {}, byLevel: {} } },
        items: { 'vocab:greetings:Hallo': { tab: 'vocab', lastVerdict: 'wrong' } },
      })
    );
    recordVocabAnswer('greetings', 'Hallo', 'good');
    const state = loadState();
    expect(state.stats.streak).toBe(3);
    expect(state.learnedWords.Hallo).toBe(true);
    expect(state.daily['2026-06-06']).toBeDefined();
    expect(state.items['vocab:greetings:Hallo']).toBeDefined();
    expect(state.srs['greetings:Hallo']).toBeDefined();
  });

  it('silently no-ops when storage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => recordVocabAnswer('greetings', 'Hallo', 'good')).not.toThrow();
  });
});
