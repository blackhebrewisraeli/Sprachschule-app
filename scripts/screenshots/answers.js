// Answer keys the in-app driver needs to show a *correct* exercise state.
//
// The driver runs inside the WebView and cannot see the pack. It reads the
// prompt on screen, then looks it up here: a Vocab card's English meaning by
// its German term, and a Translate sentence's blank word(s) by its English
// prompt. Both come from the shipped pack, so the screenshot shows the app
// grading a real right answer, never an edited one.

/**
 * @param {{ decks: Record<string, Array<{ de: string, en: string }>>,
 *           translateSentences: Record<string, Array<object>> }} content
 * @returns {{ vocab: Record<string, string>, translate: Record<string, string[]> }}
 */
export function answerKeys(content) {
  const vocab = {};
  for (const cards of Object.values(content.decks ?? {})) {
    for (const card of cards) if (card?.de && card?.en) vocab[card.de] = card.en;
  }
  const translate = {};
  for (const rows of Object.values(content.translateSentences ?? {})) {
    for (const row of rows) {
      if (!row?.en) continue;
      // A2 rows carry `blanks: [{ word }]`; A1 and B1 rows carry one `blank`.
      const words = row.blanks?.map((b) => b.word) ?? (row.blank ? [row.blank] : []);
      if (words.length) translate[row.en] = words;
    }
  }
  return { vocab, translate };
}
