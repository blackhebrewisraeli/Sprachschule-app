// The exact characters the IPA face must draw: every character of every string
// stored under an `ipa` key, in the pack's own content and in the lexicon.
//
// Derived, not hand-listed, so new phonetic content widens the request on the
// next `npm run vendor:fonts` instead of shipping a glyph the face lacks.
// Letters and brackets are included on purpose: a base letter and its
// combining mark (n̩, ɐ̯) must come from the same face, or the browser falls
// the whole cluster back and draws a box.

function* ipaStrings(value, depth = 0) {
  if (depth > 8 || value == null || typeof value !== 'object') return;
  for (const [key, v] of Object.entries(value)) {
    if (key === 'ipa' && typeof v === 'string') yield v;
    else yield* ipaStrings(v, depth + 1);
  }
}

/**
 * @param {...unknown} sources pack content, lexicon chunks, …
 * @returns {string} the distinct characters, sorted by codepoint. The plain
 *   space is kept (it sits between IPA words, and borrowing it from another
 *   face lets that face's metrics into the line box); other whitespace is not.
 */
export function ipaText(...sources) {
  const seen = new Set();
  for (const source of sources) {
    for (const s of ipaStrings(source))
      for (const ch of s) if (ch === ' ' || ch.trim()) seen.add(ch);
  }
  return [...seen].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join('');
}
