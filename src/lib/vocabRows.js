// The Vocabulary Library's data layer: one row per card, assembled from the
// three sources the app already holds separately — the resolved deck, the
// learned maps, and the SRS store.
//
// Pure. No storage reads, no network, no DOM — everything is injected, the same
// discipline as lib/missions.js and lib/deckProgress.js. That is what lets the
// whole of the table's behaviour (status, search, paging) be tested without
// rendering anything.
//
// WHY A ROW IS NOT A CARD
//
// A card is what the drill needs; a row is what a table column needs. The two
// differ in three places worth naming:
//
//   - `card.de` is a DISPLAY string with the article already composed in
//     ("das Brot"). A table that wants an Article column and a Word column
//     needs them apart, which is what `lemma` is for.
//   - a card carries no status at all. Learned-ness lives in two maps and
//     review state lives in the SRS store, keyed `<deckId>:<cardId>`.
//   - AI-generated custom cards ship only `{ id, de, en, ipa }` — no article,
//     no cefr, no glosses. Every field below is therefore optional, and the
//     table renders an em dash rather than pretending.

import { srsKey, MASTERED_BOX } from './srs.js';
import { isLearned } from './learnedWords.js';
import { normalizeText, SEARCH } from './textRules.js';

/** The status filters the Library and Review panes offer. */
export const STATUS_FILTERS = ['all', 'new', 'learning', 'mastered', 'due', 'learned'];

/** Rows per page. Chosen against the real lexicon, not by taste — see below. */
export const ROWS_PER_PAGE = 50;

/**
 * One card's review state, from the SRS store.
 *
 * `status` and `due` are deliberately SEPARATE rather than one collapsed value.
 * A box-5 card whose interval has elapsed is both mastered and due, and a single
 * enum would have to drop one of those — which is precisely the row a learner
 * filtering for "due" is looking for.
 *
 * A card with no SRS row is `new` and NOT due. It was both until 2026-09-29, so
 * every unstudied word in the browser wore a red "Due" pill and the Due filter
 * listed the whole deck for a learner who had never answered a card. The New
 * filter is how to find those; Due is reviews actually owed — the same rule as
 * lib/srs getDueCount.
 */
function reviewStateOf(srs, deckId, cardId, now) {
  const entry = srs?.[srsKey(deckId, cardId)];
  if (!entry) return { status: 'new', due: false, box: null, nextDue: null, reps: 0 };

  const box = Number.isFinite(entry.box) ? entry.box : 1;
  const nextDue = Number.isFinite(entry.nextDue) ? entry.nextDue : null;
  return {
    status: box >= MASTERED_BOX ? 'mastered' : 'learning',
    // A row with no usable nextDue is treated as due. Failing OPEN is right
    // here: the cost is one extra card offered for review, against a card that
    // silently never surfaces again.
    due: nextDue === null || nextDue <= now,
    box,
    nextDue,
    reps: Number.isFinite(entry.reps) ? entry.reps : 0,
  };
}

/**
 * Assemble the table's rows for one deck.
 *
 * @param {object} args
 * @param {object[]} args.cards resolved cards, as the drill consumes them
 * @param {string} args.deckId
 * @param {string} [args.deckName] shown in the Deck column
 * @param {Record<string, unknown>} [args.learnedWords] legacy flat map
 * @param {Record<string, Record<string, true>>} [args.learnedByDeck]
 * @param {Record<string, object>} [args.srs] keyed `<deckId>:<cardId>`
 * @param {number} [args.now]
 * @returns {object[]}
 */
export function toVocabRows({
  cards = [],
  deckId,
  deckName = '',
  learnedWords = null,
  learnedByDeck = null,
  srs = null,
  now = Date.now(),
} = {}) {
  if (!Array.isArray(cards)) return [];

  return cards
    .filter((c) => c && typeof c.id === 'string' && c.id)
    .map((card) => {
      const review = reviewStateOf(srs, deckId, card.id, now);
      return {
        id: card.id,
        deckId,
        deckName,
        // The bare word for the Word column. `lemma` is absent on custom cards,
        // where `de` is all there is — and there the article was never split
        // out in the first place, so showing the composed string is correct.
        word: card.lemma ?? card.de ?? '',
        // The composed form, kept whole for anything that wants the headword as
        // the learner meets it on the card face.
        display: card.de ?? '',
        article: card.article ?? null,
        glosses: Array.isArray(card.glosses) ? card.glosses : card.en ? [card.en] : [],
        level: card.cefr ?? null,
        pos: card.pos ?? null,
        tags: Array.isArray(card.tags) ? card.tags : [],
        // Detail fields — rendered only in the expanded row, never in a column.
        ipa: card.ipa ?? null,
        plural: card.plural ?? null,
        verb: card.verb ?? null,
        antonyms: Array.isArray(card.antonyms) ? card.antonyms : [],
        examples: Array.isArray(card.examples) ? card.examples : [],
        learned: isLearned({ learnedByDeck, learnedWords, deckId, cardId: card.id }),
        ...review,
      };
    });
}

/** The Translation column's text. Every gloss, joined the way the verdict joins them. */
export function glossText(row) {
  return row?.glosses?.length ? row.glosses.join(' · ') : '';
}

/**
 * Does this row match the typed query?
 *
 * Matches against the word, the composed display form and every gloss — so
 * "brot", "das Brot" and "bread" all find the same row. Substring rather than
 * prefix: a learner hunting a compound remembers the tail ("…zeit") at least as
 * often as the head.
 */
function matchesQuery(row, query, rules) {
  const needle = normalizeText(query, rules);
  if (!needle) return true;
  const haystack = [row.word, row.display, ...row.glosses];
  return haystack.some((s) => normalizeText(s ?? '', rules).includes(needle));
}

function matchesStatus(row, status) {
  switch (status) {
    case 'due':
      return row.due;
    case 'learned':
      return row.learned;
    case 'new':
    case 'learning':
    case 'mastered':
      return row.status === status;
    default:
      // Anything unrecognised behaves as 'all'. A filter that silently empties
      // the table is a worse failure than one that ignores a bad value.
      return true;
  }
}

/**
 * @param {object[]} rows
 * @param {{ query?: string, status?: string, rules?: object }} [opts]
 * @returns {object[]}
 */
export function filterVocabRows(rows, { query = '', status = 'all', rules = SEARCH } = {}) {
  if (!Array.isArray(rows)) return [];
  return rows.filter((r) => matchesStatus(r, status) && matchesQuery(r, query, rules));
}

/**
 * One page of rows, plus everything the pager needs to render itself.
 *
 * Paging rather than virtualization is a measured choice, not a shortcut. The
 * largest deck in the shipped lexicon is `cefr-b1` at 2,144 cards; a table that
 * mounts all of them is several thousand DOM nodes on a phone. Virtualization
 * would need a new runtime dependency in an app whose entire dependency list is
 * react, lucide, supabase and sentry — so the table pages instead, and the
 * search box above it is the real way through a deck that size.
 *
 * `page` is 1-based and always clamped into range: a filter that shrinks the
 * result set below the current page must land the learner on the last page
 * rather than on a blank one.
 */
export function pageOfRows(rows, page = 1, perPage = ROWS_PER_PAGE) {
  const all = Array.isArray(rows) ? rows : [];
  const size = Number.isFinite(perPage) && perPage > 0 ? Math.floor(perPage) : ROWS_PER_PAGE;
  const pageCount = Math.max(1, Math.ceil(all.length / size));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pageCount);
  const start = (current - 1) * size;
  const slice = all.slice(start, start + size);

  return {
    rows: slice,
    page: current,
    pageCount,
    total: all.length,
    // 1-based inclusive range for the "showing 1–50 of 2,144" caption. Both are
    // 0 on an empty result so the caption can branch on `total` alone.
    from: all.length === 0 ? 0 : start + 1,
    to: all.length === 0 ? 0 : start + slice.length,
  };
}

/** How many rows sit in each status bucket — the counts on the filter chips. */
export function statusCounts(rows) {
  const all = Array.isArray(rows) ? rows : [];
  return {
    all: all.length,
    new: all.filter((r) => r.status === 'new').length,
    learning: all.filter((r) => r.status === 'learning').length,
    mastered: all.filter((r) => r.status === 'mastered').length,
    due: all.filter((r) => r.due).length,
    learned: all.filter((r) => r.learned).length,
  };
}
