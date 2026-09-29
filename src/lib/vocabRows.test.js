import { describe, it, expect } from 'vitest';
import {
  toVocabRows,
  filterVocabRows,
  pageOfRows,
  statusCounts,
  glossText,
  ROWS_PER_PAGE,
} from './vocabRows.js';
import { srsKey, MASTERED_BOX } from './srs.js';
import { activePack } from '../packs';

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

// A lexicon-resolved card, as resolveCard() produces it.
const lexCard = (over = {}) => ({
  id: 'n:brot',
  de: 'das Brot',
  lemma: 'Brot',
  en: 'bread',
  glosses: ['bread', 'loaf'],
  ipa: '[bʁoːt]',
  article: 'das',
  plural: 'Brote',
  pos: 'noun',
  cefr: 'A1',
  tags: ['food'],
  antonyms: ['Hunger'],
  examples: [{ de: 'Ich esse Brot.', en: 'I eat bread.' }],
  verb: null,
  ...over,
});

// An AI-generated custom-deck card. The prompt asks for de/en/ipa and nothing
// else, so this really is the whole shape — see lib/prompts.js deckPrompts.
const customCard = (over = {}) => ({ id: 'das Wetter', de: 'das Wetter', en: 'weather', ...over });

describe('toVocabRows', () => {
  it('splits the article off the composed headword', () => {
    const [row] = toVocabRows({ cards: [lexCard()], deckId: 'food', now: NOW });
    expect(row.word).toBe('Brot');
    expect(row.article).toBe('das');
    // The composed form survives alongside it — the card face's headword.
    expect(row.display).toBe('das Brot');
  });

  it('carries every column the table renders', () => {
    const [row] = toVocabRows({
      cards: [lexCard()],
      deckId: 'food',
      deckName: 'Food & Drink',
      now: NOW,
    });
    expect(row).toMatchObject({
      id: 'n:brot',
      deckId: 'food',
      deckName: 'Food & Drink',
      level: 'A1',
      pos: 'noun',
      plural: 'Brote',
      ipa: '[bʁoːt]',
    });
    expect(row.glosses).toEqual(['bread', 'loaf']);
    expect(glossText(row)).toBe('bread · loaf');
  });

  // The failure this guards is a table that prints "undefined" down four
  // columns for every generated deck, which is what a row built by spreading
  // the card would do.
  it('degrades to nulls on a custom card that carries no article, level or glosses', () => {
    const [row] = toVocabRows({ cards: [customCard()], deckId: 'custom-1', now: NOW });
    expect(row.word).toBe('das Wetter'); // no lemma to split — `de` is all there is
    expect(row.article).toBeNull();
    expect(row.level).toBeNull();
    expect(row.pos).toBeNull();
    expect(row.plural).toBeNull();
    // `en` is promoted to a one-entry gloss list so the Translation column
    // still has something to print.
    expect(row.glosses).toEqual(['weather']);
    expect(glossText(row)).toBe('weather');
  });

  it('drops cards with no usable id — they are untrackable by learned or SRS', () => {
    const rows = toVocabRows({
      cards: [lexCard(), { de: 'kein Ausweis' }, null, { id: '' }],
      deckId: 'food',
      now: NOW,
    });
    expect(rows).toHaveLength(1);
  });

  it('returns an empty array rather than throwing on a deck that has not loaded', () => {
    expect(toVocabRows({ cards: null, deckId: 'cefr-b1' })).toEqual([]);
    expect(toVocabRows()).toEqual([]);
  });

  describe('status', () => {
    it('is new, and NOT due, for a card with no SRS row', () => {
      // Nothing is owed on a card nobody has studied. It used to be due too,
      // which put a red Due pill on every row of a fresh learner's browser.
      const [row] = toVocabRows({ cards: [lexCard()], deckId: 'food', srs: {}, now: NOW });
      expect(row.status).toBe('new');
      expect(row.due).toBe(false);
      expect(row.box).toBeNull();
    });

    it('is learning while the box is below mastered', () => {
      const srs = { [srsKey('food', 'n:brot')]: { box: 2, nextDue: NOW + DAY, lastReviewed: NOW } };
      const [row] = toVocabRows({ cards: [lexCard()], deckId: 'food', srs, now: NOW });
      expect(row.status).toBe('learning');
      expect(row.due).toBe(false);
      expect(row.box).toBe(2);
    });

    // The whole reason status and due are two fields. A collapsed enum has to
    // drop one of these, and it would drop exactly the row a learner filtering
    // for "due" came to find.
    it('reports a mastered card whose interval has elapsed as BOTH mastered and due', () => {
      const srs = {
        [srsKey('food', 'n:brot')]: {
          box: MASTERED_BOX,
          nextDue: NOW - DAY,
          lastReviewed: NOW - 31 * DAY,
        },
      };
      const [row] = toVocabRows({ cards: [lexCard()], deckId: 'food', srs, now: NOW });
      expect(row.status).toBe('mastered');
      expect(row.due).toBe(true);
    });

    it('treats a row with an unusable nextDue as due rather than never surfacing it', () => {
      const srs = { [srsKey('food', 'n:brot')]: { box: 3, nextDue: undefined } };
      const [row] = toVocabRows({ cards: [lexCard()], deckId: 'food', srs, now: NOW });
      expect(row.due).toBe(true);
    });

    // SRS is keyed `<deckId>:<cardId>`, so the same word in two decks carries
    // two independent review states. A row reading the wrong key would show a
    // freshly-opened deck as already mastered.
    it('reads the SRS row for THIS deck, not for the same card in another', () => {
      const srs = {
        [srsKey('cefr-a1', 'n:brot')]: { box: MASTERED_BOX, nextDue: NOW + 30 * DAY },
      };
      const [row] = toVocabRows({ cards: [lexCard()], deckId: 'food', srs, now: NOW });
      expect(row.status).toBe('new');
    });
  });

  describe('learned', () => {
    it('reads the deck-scoped map first', () => {
      const [row] = toVocabRows({
        cards: [lexCard()],
        deckId: 'food',
        learnedByDeck: { food: { 'n:brot': true } },
        now: NOW,
      });
      expect(row.learned).toBe(true);
    });

    it('falls back to the legacy flat map', () => {
      const [row] = toVocabRows({
        cards: [lexCard()],
        deckId: 'food',
        learnedWords: { 'n:brot': true },
        now: NOW,
      });
      expect(row.learned).toBe(true);
    });

    it('does not count a word learned in a DIFFERENT deck under the scoped map', () => {
      const [row] = toVocabRows({
        cards: [lexCard()],
        deckId: 'food',
        learnedByDeck: { 'cefr-a1': { 'n:brot': true } },
        now: NOW,
      });
      expect(row.learned).toBe(false);
    });
  });
});

describe('filterVocabRows', () => {
  const rows = toVocabRows({
    cards: [
      lexCard(),
      lexCard({ id: 'n:kaese', de: 'der Käse', lemma: 'Käse', en: 'cheese', glosses: ['cheese'] }),
      lexCard({
        id: 'n:strasse',
        de: 'die Straße',
        lemma: 'Straße',
        en: 'street',
        glosses: ['street', 'road'],
      }),
    ],
    deckId: 'food',
    now: NOW,
  });

  it('matches the German word', () => {
    expect(filterVocabRows(rows, { query: 'brot' }).map((r) => r.id)).toEqual(['n:brot']);
  });

  it('matches an English gloss, including one that is not the first', () => {
    expect(filterVocabRows(rows, { query: 'loaf' }).map((r) => r.id)).toEqual(['n:brot']);
    expect(filterVocabRows(rows, { query: 'road' }).map((r) => r.id)).toEqual(['n:strasse']);
  });

  it('matches the composed form with its article', () => {
    expect(filterVocabRows(rows, { query: 'das brot' }).map((r) => r.id)).toEqual(['n:brot']);
  });

  it('matches a substring from the middle, not just a prefix', () => {
    expect(filterVocabRows(rows, { query: 'rot' }).map((r) => r.id)).toEqual(['n:brot']);
  });

  // The reason SEARCH flips stripCombiningMarks to true where CHOICE and
  // ANSWER leave it false: an ASCII keyboard has to be able to reach "Käse".
  it('finds an umlaut word typed without the umlaut', () => {
    expect(filterVocabRows(rows, { query: 'kase' }).map((r) => r.id)).toEqual(['n:kaese']);
  });

  // Only reachable with the PACK's replacements layered on, which is what
  // LibraryPane passes. The engine default alone cannot do this.
  it('finds ß typed as ss when the caller supplies the pack rules', () => {
    const rules = { ...activePack.validation.target, stripCombiningMarks: true };
    expect(filterVocabRows(rows, { query: 'strasse', rules }).map((r) => r.id)).toEqual([
      'n:strasse',
    ]);
  });

  it('returns every row for an empty or whitespace query', () => {
    expect(filterVocabRows(rows, { query: '' })).toHaveLength(3);
    expect(filterVocabRows(rows, { query: '   ' })).toHaveLength(3);
  });

  describe('status filter', () => {
    const srs = {
      [srsKey('food', 'n:brot')]: { box: MASTERED_BOX, nextDue: NOW + 30 * DAY },
      [srsKey('food', 'n:kaese')]: { box: 2, nextDue: NOW - DAY },
    };
    const mixed = toVocabRows({
      cards: [
        lexCard(),
        // `glosses` must be overridden alongside `en`: lexCard() defaults it to
        // the Brot glosses, and a row keeps `glosses` in preference to `en`.
        lexCard({
          id: 'n:kaese',
          de: 'der Käse',
          lemma: 'Käse',
          en: 'cheese',
          glosses: ['cheese'],
        }),
        lexCard({
          id: 'n:strasse',
          de: 'die Straße',
          lemma: 'Straße',
          en: 'street',
          glosses: ['street'],
        }),
      ],
      deckId: 'food',
      srs,
      learnedByDeck: { food: { 'n:brot': true } },
      now: NOW,
    });

    it('narrows to one bucket each', () => {
      expect(filterVocabRows(mixed, { status: 'mastered' }).map((r) => r.id)).toEqual(['n:brot']);
      expect(filterVocabRows(mixed, { status: 'learning' }).map((r) => r.id)).toEqual(['n:kaese']);
      expect(filterVocabRows(mixed, { status: 'new' }).map((r) => r.id)).toEqual(['n:strasse']);
      expect(filterVocabRows(mixed, { status: 'learned' }).map((r) => r.id)).toEqual(['n:brot']);
    });

    it('collects the overdue card under due, and leaves the never-seen one to new', () => {
      expect(filterVocabRows(mixed, { status: 'due' }).map((r) => r.id)).toEqual(['n:kaese']);
      expect(filterVocabRows(mixed, { status: 'new' }).map((r) => r.id)).toEqual(['n:strasse']);
    });

    it('combines with the query rather than replacing it', () => {
      expect(filterVocabRows(mixed, { status: 'due', query: 'cheese' }).map((r) => r.id)).toEqual([
        'n:kaese',
      ]);
    });

    it('ignores an unrecognised status instead of emptying the table', () => {
      expect(filterVocabRows(mixed, { status: 'bogus' })).toHaveLength(3);
    });
  });
});

describe('pageOfRows', () => {
  const rows = Array.from({ length: 125 }, (_, i) => ({ id: `c${i}` }));

  it('returns the first page and the caption range', () => {
    const p = pageOfRows(rows, 1, 50);
    expect(p.rows).toHaveLength(50);
    expect(p).toMatchObject({ page: 1, pageCount: 3, total: 125, from: 1, to: 50 });
  });

  it('returns a short last page', () => {
    const p = pageOfRows(rows, 3, 50);
    expect(p.rows).toHaveLength(25);
    expect(p).toMatchObject({ page: 3, from: 101, to: 125 });
  });

  // A filter that shrinks the result set below the current page must not leave
  // the learner staring at an empty table with no way back.
  it('clamps a page beyond the end onto the last page', () => {
    expect(pageOfRows(rows, 99, 50)).toMatchObject({ page: 3, from: 101, to: 125 });
  });

  it('clamps a zero or negative page onto the first', () => {
    expect(pageOfRows(rows, 0, 50).page).toBe(1);
    expect(pageOfRows(rows, -4, 50).page).toBe(1);
  });

  it('reports one empty page rather than zero pages for no rows', () => {
    expect(pageOfRows([], 1, 50)).toMatchObject({
      rows: [],
      page: 1,
      pageCount: 1,
      total: 0,
      from: 0,
      to: 0,
    });
  });

  it('defaults to ROWS_PER_PAGE and survives a nonsense page size', () => {
    expect(pageOfRows(rows).rows).toHaveLength(ROWS_PER_PAGE);
    expect(pageOfRows(rows, 1, 0).rows).toHaveLength(ROWS_PER_PAGE);
  });

  // The number this pager exists for: the biggest shipped deck.
  it('pages the largest real deck size into a bounded number of pages', () => {
    const big = Array.from({ length: 2144 }, (_, i) => ({ id: `c${i}` }));
    expect(pageOfRows(big, 1).pageCount).toBe(43);
  });
});

describe('statusCounts', () => {
  it('counts each bucket, with due and learned overlapping the others', () => {
    const srs = {
      [srsKey('food', 'n:brot')]: { box: MASTERED_BOX, nextDue: NOW - DAY },
      [srsKey('food', 'n:kaese')]: { box: 2, nextDue: NOW + DAY },
    };
    const rows = toVocabRows({
      cards: [
        lexCard(),
        lexCard({ id: 'n:kaese', de: 'der Käse', lemma: 'Käse' }),
        lexCard({ id: 'n:strasse', de: 'die Straße', lemma: 'Straße' }),
      ],
      deckId: 'food',
      srs,
      learnedByDeck: { food: { 'n:brot': true } },
      now: NOW,
    });

    expect(statusCounts(rows)).toEqual({
      all: 3,
      new: 1,
      learning: 1,
      mastered: 1,
      // the overdue mastered card only — the never-seen one is new, not due
      due: 1,
      learned: 1,
    });
  });

  it('is all zeroes for no rows', () => {
    expect(statusCounts([])).toMatchObject({ all: 0, due: 0, learned: 0 });
  });
});
