// German pack theme — flag gold/red accents + house typefaces.
// Structural colours (ground, success/error, …) live in src/lib/themeTokens.js.

export const accent = {
  fill: '#FFCE00', // mode-independent — always ink on top
  onFill: '#0D0D0F',
  // Text / border / icon — the one place the accent is a foreground rather than
  // a fill, so it must clear AA against every ground and surface in its mode.
  // `#8A6A00` cleared light.day (4.53) but only reached 3.59 on light.night's
  // dimmer parchment; `#6E5400` clears all four light palettes (5.07 worst case)
  // and lets the contrast test hold every palette to the same 4.5:1 floor.
  // Worth revisiting in the redesign, when light mode leaves parchment entirely.
  fg: { light: '#6E5400', dark: '#FFCE00' },
};

export const accentAlt = {
  fill: { light: '#C92A2A', dark: '#FF6B6B' },
  onFill: { light: '#FFFFFF', dark: '#0D0D0F' },
};

/** Flag sweep for progress affordances: ground → red → gold. */
export const progress = ['ground', 'accentAlt', 'accent'];

// The families are vendored into public/fonts/ by `npm run vendor:fonts` and
// served same-origin; nothing here is fetched from a CDN at runtime.
//
// `axes` asks for continuous ranges, not the discrete instances this used to
// request. Google honours the difference literally: pinning six weights returns
// six static files per subset, and the precache pulls all of them eagerly even
// though a browser would have lazily fetched two or three. Measured over
// latin+latin-ext that is 869.5 KB against 165.9 KB for the ranges below, which
// cover every weight in between and keep `opsz` continuous as well.
//
// `subsets` sits on the family, not the pack, because the faces render
// different alphabets. Prose needs latin (ä ö ü ß and the „quotes" are all
// inside it) plus latin-ext for the odd foreign proper noun.
//
// IPA has its own face (owner's call, 2026-10-03). It used to ride on the mono
// face, which turned out to lack 26 of the 38 phonetic characters the content
// uses (the stress mark ˈ, ː, ɐ, ɛ, ɡ, ʁ and the combining marks among them)
// even though its latin-ext file DECLARES that range. iOS and desktop quietly
// borrowed the glyphs from system fonts; Android has none to borrow and drew
// every pronunciation as boxes. Noto Sans Mono has all of them. `text: 'ipa'`
// vendors exactly the characters under the content's `ipa` keys (~6 KB, one
// weight), which also reaches the combining marks no named Google subset
// serves (U+032F, as in diːɐ̯, alone is used 1,239 times).
//
// src/lib/fontCoverage.test.js fails if a subset that is carrying real content
// gets dropped, and if the IPA face lacks a glyph any `ipa` string uses,
// checked against each file's own glyph map rather than its declared ranges.
/**
 * Body sans — adopted 2026-09-01, on the product owner's call.
 *
 * It was vendored ahead of time precisely so the decision would cost one line
 * here rather than a fetch, a licence check and a manifest regeneration. This
 * is that line. AGENTS.md's typography rule was updated in the same change, so
 * the rule and the code do not disagree.
 *
 * Display stays Fraunces. The serif is the brand at headword scale — the vocab
 * card, the hero titles, the chat bubble's German line — and none of those are
 * what the switch was for. What changed is *prose*: paragraphs, glosses and
 * form copy, which Fraunces set at 13–15px more decoratively than legibly.
 *
 * IPA is not affected and must not be. Phonetics render through `TEXT.ipa`,
 * which is pinned to the `ipa` stack below, never to this latin-only sans.
 *
 * Weights stop at 700: body copy uses regular through bold, and asking for the
 * full 200..800 range widens each subset file for two weights nothing renders.
 */
export const BODY_SANS = "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif";

export const font = {
  display: "'Fraunces', Georgia, serif",
  body: BODY_SANS,
  mono: "'JetBrains Mono', 'Courier New', monospace",
  // Phonetics only (TEXT.ipa). JetBrains Mono stays behind it for any character
  // a new IPA string adds before the next `npm run vendor:fonts`.
  ipa: "'Noto Sans Mono', 'JetBrains Mono', monospace",
  families: [
    { name: 'Fraunces', axes: 'opsz,wght@9..144,300..900', subsets: ['latin', 'latin-ext'] },
    {
      name: 'JetBrains Mono',
      axes: 'wght@400..700',
      subsets: ['latin', 'latin-ext', 'greek', 'vietnamese'],
    },
    // Prose subsets only — the sans never renders IPA, so it needs neither the
    // greek nor the vietnamese subset the mono face carries.
    { name: 'Plus Jakarta Sans', axes: 'wght@400..700', subsets: ['latin', 'latin-ext'] },
    // TEXT.ipa sets one weight, so one is all it ships.
    { name: 'Noto Sans Mono', axes: 'wght@400', text: 'ipa' },
  ],
};

export const theme = { accent, accentAlt, progress, font };
