// SRS engine — Leitner with Anki-style Hard / Good / Easy verdicts.
//
// Storage shape (extends `deutsch-app-state-v1`):
//   srs: {
//     '<deckId>:<id>': {
//       box:          1..5,    // current Leitner box (5 = mastered)
//       lastReviewed: number,  // ms timestamp of last interaction
//       nextDue:      number,  // ms timestamp when card surfaces again
//       reps:         number,  // total interactions (informational)
//     }
//   }
//
// Verdicts:
//   again  → Box 1, due soon         (wrong answer, or self-rated as failed)
//   hard   → same box, refresh due   (correct but struggled)
//   good   → next box                (clean correct)
//   easy   → advance 2 boxes         (trivially correct)
//
// VocabTab shows the user 3 buttons (Hard / Good / Easy) on correct or almost
// answers, and a single Again button on wrong answers.

import { loadState, saveState } from './storage';

const DAY = 24 * 60 * 60 * 1000;

// Intervals for boxes 1..5 — review again after this many days from now.
export const LEITNER_INTERVALS_MS = [1 * DAY, 3 * DAY, 7 * DAY, 14 * DAY, 30 * DAY];

export const MASTERED_BOX = 5;

export const SRS_VERDICTS = ['again', 'hard', 'good', 'easy'];

// ─── Key helper ───────────────────────────────────────────────

export function srsKey(deckId, id) {
  return `${deckId}:${id}`;
}

// ─── Pure transition ──────────────────────────────────────────

function nextBox(prevBox, verdict) {
  switch (verdict) {
    case 'again':
      return 1;
    case 'hard':
      return prevBox;
    case 'good':
      return Math.min(prevBox + 1, MASTERED_BOX);
    case 'easy':
      return Math.min(prevBox + 2, MASTERED_BOX);
    default:
      throw new Error(`Invalid verdict: ${verdict}`);
  }
}

export function srsApply(srs, deckId, id, verdict, ts) {
  if (!SRS_VERDICTS.includes(verdict)) throw new Error(`Invalid verdict: ${verdict}`);

  const key = srsKey(deckId, id);
  const prev = srs[key];
  const prevBox = prev?.box ?? 1; // new cards start at Box 1
  const box = nextBox(prevBox, verdict);
  const updated = {
    box,
    lastReviewed: ts,
    nextDue: ts + LEITNER_INTERVALS_MS[box - 1],
    reps: (prev?.reps ?? 0) + 1,
  };

  return { ...srs, [key]: updated };
}

// ─── Queue derivation ─────────────────────────────────────────
//
// Returns an array of indices into `deck` ordered as:
//   1. Due cards (nextDue ≤ now), oldest-due first
//   2. New cards (no SRS entry), in original deck order
//   3. Over-review cards (not yet due), least-recently-reviewed first

export function getDueCards(srs, deck, deckId, now) {
  const due = [];
  const fresh = [];
  const overReview = [];

  deck.forEach((card, idx) => {
    const entry = srs[srsKey(deckId, card.id)];
    if (!entry) {
      fresh.push(idx);
    } else if (entry.nextDue <= now) {
      due.push({ idx, nextDue: entry.nextDue });
    } else {
      overReview.push({ idx, lastReviewed: entry.lastReviewed });
    }
  });

  due.sort((a, b) => a.nextDue - b.nextDue);
  overReview.sort((a, b) => a.lastReviewed - b.lastReviewed);

  return [...due.map((d) => d.idx), ...fresh, ...overReview.map((o) => o.idx)];
}

// ─── Aggregate queries (for Stats widget) ─────────────────────
//
// DUE and NEW are separate counts, and a card is never both.
//
//   due — the learner has seen it and its interval has elapsed: a review that
//         is owed. This is what the Profile nav badge, Home's `srs-due` mission
//         and the red DUE NOW figure mean, so it is the only count allowed to
//         raise attention.
//   new — no SRS row at all: a card nobody has studied yet. An invitation, not
//         a debt.
//
// These used to be one number. getDueCount counted unseen cards as due, so a
// learner opening the app for the first time was greeted by "40 cards are
// due", a red DUE NOW 40 and a red "9+" on the Profile tab before answering a
// single card. The QUEUE is unchanged: getDueCards above still serves new
// cards after the reviews that are due, which is how a first session starts.

export function getDueCount(srs, decks, now) {
  let count = 0;
  for (const [deckId, deck] of Object.entries(decks)) {
    for (const card of deck) {
      const entry = srs[srsKey(deckId, card.id)];
      if (entry && entry.nextDue <= now) count += 1;
    }
  }
  return count;
}

export function getNewCount(srs, decks) {
  let count = 0;
  for (const [deckId, deck] of Object.entries(decks)) {
    for (const card of deck) {
      if (!srs[srsKey(deckId, card.id)]) count += 1;
    }
  }
  return count;
}

export function getMasteredCount(srs) {
  return Object.values(srs).filter((e) => e.box === MASTERED_BOX).length;
}

// ─── Imperative recorder (uses storage) ──────────────────────

export function recordVocabAnswer(deckId, id, verdict) {
  try {
    const state = loadState() ?? {};
    const srs = srsApply(state.srs ?? {}, deckId, id, verdict, Date.now());
    saveState({ ...state, srs });
  } catch {
    // best-effort, never throw into the React tree
  }
}
