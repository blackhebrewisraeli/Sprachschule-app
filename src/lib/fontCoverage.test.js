import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { activePack } from '../packs/index';
import { familySlug } from './injectFonts';
import { woff2Codepoints } from '../../scripts/vendor-fonts/woff2Cmap.js';

// Guards the vendored fonts against the text the app actually renders.
//
// The naive form of this test — "every shipped codepoint is covered" — cannot
// pass and should not: the authored content contains emoji (👋 🍞 ✈) and
// Tatoeba example sentences contain mathematical alphanumerics (𝐾 = 𝑚𝑏) and
// set notation (⊂). No text font carries those; they fall back to a system
// face and always have.
//
// The question worth asking is narrower and has a right answer: *was this
// glyph on offer, and did we drop it?* Google splits each family into subsets;
// the pack picks some, and `npm run vendor:fonts` records the ranges of the
// ones it skipped. A shipped codepoint landing inside a skipped range means a
// subset that is carrying real content got dropped — which is how restricting
// the mono face to latin+latin-ext silently downgraded IPA's θ and χ during
// this mission, before the greek subset was added back.
//
// vitest runs from the repo root, so repo-relative paths resolve here.

const FONT_DIR = 'public/fonts';
const LEXICON_DIR = 'public/lexicon/de';

const manifest = JSON.parse(readFileSync(`${FONT_DIR}/manifest.json`, 'utf8'));

/** Parse `unicode-range: U+0-FF, U+2192;` descriptors into [lo, hi] pairs. */
function parseRanges(text) {
  const ranges = [];
  for (const m of text.matchAll(/unicode-range:\s*([^;]+);/gi)) ranges.push(...tokens(m[1]));
  return ranges;
}

function tokens(list) {
  const out = [];
  for (const token of list.split(',')) {
    const t = token.trim().replace(/^u\+/i, '');
    if (!t) continue;
    if (t.includes('?')) {
      // Wildcard form, e.g. U+04??. Google does not emit it today, but the spec
      // allows it and mis-parsing it would overstate coverage.
      out.push([parseInt(t.replace(/\?/g, '0'), 16), parseInt(t.replace(/\?/g, 'F'), 16)]);
    } else if (t.includes('-')) {
      const [lo, hi] = t.split('-');
      out.push([parseInt(lo, 16), parseInt(hi, 16)]);
    } else {
      out.push([parseInt(t, 16), parseInt(t, 16)]);
    }
  }
  return out;
}

const covers = (ranges, cp) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi);
const show = (cp) =>
  `U+${cp.toString(16).toUpperCase().padStart(4, '0')} ${String.fromCodePoint(cp)}`;

/** Every string reachable in a value, however nested. */
function* strings(value, depth = 0) {
  if (depth > 8 || value == null) return;
  if (typeof value === 'string') yield value;
  else if (Array.isArray(value)) for (const v of value) yield* strings(v, depth + 1);
  else if (typeof value === 'object')
    for (const v of Object.values(value)) yield* strings(v, depth + 1);
}

/**
 * Every string reachable in a value EXCEPT the ones stored under an `ipa` key.
 *
 * Phonetics render through `TEXT.ipa`, which is pinned to the mono face, so
 * they are the mono face's content and never the body face's. Scanning them
 * while auditing the body face asks that face to carry glyphs nothing sets in
 * it — and 28 lexicon entries put χ (greek) in `ipa`, which the body sans is
 * deliberately latin-only and cannot render.
 *
 * The exclusion is by KEY, not by codepoint: it stays correct if a new
 * phonetic glyph is added, and it fails loudly if `TEXT.ipa` ever stops
 * pinning the mono face, because `theme.test.js` guards that pin separately.
 */
function* prose(value, depth = 0) {
  if (depth > 8 || value == null) return;
  if (typeof value === 'string') yield value;
  else if (Array.isArray(value)) for (const v of value) yield* prose(v, depth + 1);
  else if (typeof value === 'object')
    for (const [key, v] of Object.entries(value)) if (key !== 'ipa') yield* prose(v, depth + 1);
}

// Whitespace and C1 controls are never rendered as glyphs.
const rendered = (cp) => cp > 0x20 && !(cp >= 0x7f && cp <= 0x9f);

/** codepoint → an example string containing it. */
function codepoints(iterable) {
  const seen = new Map();
  for (const s of iterable) {
    for (const ch of s) {
      const cp = ch.codePointAt(0);
      if (rendered(cp) && !seen.has(cp)) seen.set(cp, s);
    }
  }
  return seen;
}

function lexicon() {
  const files = readdirSync(LEXICON_DIR).filter((f) => /^chunk-\d+\.json$/.test(f));
  expect(files.length).toBeGreaterThan(0);
  return files.map((f) => JSON.parse(readFileSync(`${LEXICON_DIR}/${f}`, 'utf8')));
}

describe('vendored fonts', () => {
  const families = activePack.theme.font.families;

  it('vendored every family the pack declares, with its licence', () => {
    for (const family of families) {
      const dir = `${FONT_DIR}/${familySlug(family.name)}`;
      expect(
        existsSync(`${dir}/face.css`),
        `${dir}/face.css missing — run npm run vendor:fonts`
      ).toBe(true);
      // Self-hosting makes us the redistributor; OFL 1.1 allows that only if
      // the licence travels with the files.
      expect(existsSync(`${dir}/OFL.txt`), `${dir}/OFL.txt missing`).toBe(true);
    }
  });

  it('every woff2 the stylesheets reference exists on disk', () => {
    // The failure this catches is a half-written public/fonts: a download that
    // 404s mid-run once left one family vendored and the other with none.
    for (const family of families) {
      const slug = familySlug(family.name);
      const refs = [
        ...readFileSync(`${FONT_DIR}/${slug}/face.css`, 'utf8').matchAll(/url\(([^)]+)\)/g),
      ].map((m) => m[1].trim());
      expect(refs.length).toBeGreaterThan(0);
      for (const ref of refs) {
        expect(ref.startsWith('/fonts/'), `${ref} is not a local path`).toBe(true);
        expect(existsSync(`public${ref}`), `${ref} referenced but not vendored`).toBe(true);
      }
    }
  });

  it('reaches no third-party host', () => {
    for (const family of families) {
      const css = readFileSync(`${FONT_DIR}/${familySlug(family.name)}/face.css`, 'utf8');
      expect(css).not.toContain('gstatic.com');
      expect(css).not.toContain('googleapis.com');
    }
  });
});

describe('no dropped subset is carrying content', () => {
  // A codepoint counts as lost only if a skipped subset covered it and no kept
  // subset does. Google's subsets overlap: U+0329 (the syllabic mark under
  // /ɡəˈɡeːbn̩/) is listed by both `latin` and `vietnamese`, so testing
  // membership of the skipped ranges alone reports it as dropped when the
  // shipped latin file has it. Subtracting what is kept is what makes the
  // difference between a real regression and noise.
  const lost = Object.fromEntries(
    Object.entries(manifest.families).map(([name, f]) => {
      const kept = parseRanges(readFileSync(`${FONT_DIR}/${f.slug}/face.css`, 'utf8'));
      const gone = f.skipped.flatMap((s) => tokens(s.unicodeRange));
      return [name, (cp) => covers(gone, cp) && !covers(kept, cp)];
    })
  );

  // Resolved from the pack's font STACK, not from a position in `families`.
  // These were `families[0]` and `families[1]`, which happened to be right only
  // while body and display were the same serif: the moment `font.body` moved to
  // the sans, "the body face" below went on auditing Fraunces — a face nothing
  // sets prose in — and the sans shipped unchecked while the suite stayed green.
  // A positional index cannot notice that; reading the declaration can.
  const familyFor = (role) => {
    const first = (activePack.theme.font[role] ?? '').match(/'([^']+)'/)?.[1] ?? '';
    return activePack.theme.font.families.find((f) => f.name === first)?.name ?? null;
  };
  const bodyFamily = familyFor('body');
  // Phonetics render through TEXT.ipa, which is pinned to the mono face, so IPA
  // is the mono face's content and never the body face's.
  const monoFamily = familyFor('mono');

  it('resolves each role to a family that is actually vendored', () => {
    // A typo in the stack, or a family dropped from `families`, would otherwise
    // make `lost[undefined]` throw somewhere far less legible than here.
    for (const role of ['display', 'body', 'mono']) {
      expect(familyFor(role), `${role} resolves to a vendored family`).toBeTruthy();
    }
    // Body and mono must stay distinct faces: the IPA assertion below is only
    // meaningful if the mono face is not also the one setting prose.
    expect(bodyFamily).not.toBe(monoFamily);
  });

  it('the manifest records skipped subsets to check against', () => {
    // Guards the guard: if `skipped` were empty the assertions below would
    // pass vacuously no matter what got dropped.
    expect(Object.keys(lost)).toContain(bodyFamily);
    // A glyph in a skipped subset and in no kept one must be detectable, or
    // every assertion below passes no matter what got dropped. U+0400 (Ѐ) is
    // cyrillic, which neither family ships.
    expect(lost[monoFamily](0x0400)).toBe(true);
    expect(lost[monoFamily]('a'.codePointAt(0))).toBe(false);
    expect(
      parseRanges(
        readFileSync(`${FONT_DIR}/${manifest.families[bodyFamily].slug}/face.css`, 'utf8')
      ).length
    ).toBeGreaterThan(10);
  });

  /**
   * Every range ANY vendored family ships or could have shipped.
   *
   * This is what makes an outright coverage assertion possible at all. The
   * naive form — "the body face covers every authored codepoint" — cannot pass
   * and should not: the content holds emoji (👋 🍞 ✈) and arrows that no
   * text font here offers, and those fall back to a system face by design.
   * (IPA is not among them any more: it has its own face, checked glyph by
   * glyph at the bottom of this file.)
   *
   * Membership of this union is the difference between "we could have had this
   * glyph and did not take it" and "no font we vendor was ever going to supply
   * it". Measured against the real content, 24 authored codepoints are absent
   * from the body face and every one of them is outside this union.
   *
   * It is derived, not hand-listed, so adding a family or a subset widens the
   * scope automatically rather than needing an allowlist kept in step.
   */
  const obtainable = Object.values(manifest.families).flatMap((f) => [
    ...parseRanges(readFileSync(`${FONT_DIR}/${f.slug}/face.css`, 'utf8')),
    ...f.skipped.flatMap((sub) => tokens(sub.unicodeRange)),
  ]);
  const keptBy = Object.fromEntries(
    Object.entries(manifest.families).map(([name, f]) => [
      name,
      parseRanges(readFileSync(`${FONT_DIR}/${f.slug}/face.css`, 'utf8')),
    ])
  );

  /**
   * THE GAP THIS CLOSES. `lost` above only fires for a codepoint some SKIPPED
   * subset covered — it can see a subset we dropped, never one the face was
   * never offered. Greek is not in the body sans's `skipped` list because it
   * was never on offer, so χ would never be flagged there even though the sans
   * genuinely cannot draw it.
   *
   * This asks the question the other way round: of everything our vendor could
   * supply, does the face that renders prose actually have it?
   */
  const uncovered = (family, found) =>
    [...found].filter(([cp]) => !covers(keptBy[family], cp) && covers(obtainable, cp));

  it('the scope rule is neither vacuous nor everything', () => {
    // Guards the guard, in both directions.
    // χ is real content (28 lexicon `ipa` fields), IS obtainable — JetBrains
    // Mono ships greek — and is NOT in the body face. So it is exactly the
    // codepoint the assertions below would flag if IPA ever moved to the body
    // face, and proof the rule can fire at all.
    const chi = 'χ'.codePointAt(0);
    expect(covers(obtainable, chi), 'χ must be obtainable').toBe(true);
    expect(covers(keptBy[bodyFamily], chi), 'body face must not already cover χ').toBe(false);
    // And an emoji must stay OUT of scope, or the assertions become unpassable
    // for reasons that have nothing to do with a regression.
    expect(covers(obtainable, 0x1f44b), '👋 must be out of scope').toBe(false);
  });

  it('the IPA exclusion actually excludes something', () => {
    // If `prose` and `strings` saw the same text, the whole split would be
    // ceremony. This fails the moment the walker stops skipping the key.
    const withIpa = codepoints(strings(lexicon()));
    const withoutIpa = codepoints(prose(lexicon()));
    expect(withIpa.size).toBeGreaterThan(withoutIpa.size);
    expect(withIpa.has('χ'.codePointAt(0))).toBe(true);
    expect(withoutIpa.has('χ'.codePointAt(0))).toBe(false);
  });

  it('the body face can draw every prose glyph our vendor could supply', () => {
    const found = codepoints(prose(activePack.content));
    expect(found.size).toBeGreaterThan(40);
    expect(
      uncovered(bodyFamily, found).map(
        ([cp, ex]) => `${show(cp)} in ${JSON.stringify(ex.slice(0, 60))}`
      )
    ).toEqual([]);
  });

  it('and every prose glyph in the lexicon too', () => {
    const found = codepoints(prose(lexicon()));
    expect(found.size).toBeGreaterThan(40);
    expect(
      uncovered(bodyFamily, found).map(
        ([cp, ex]) => `${show(cp)} in ${JSON.stringify(ex.slice(0, 60))}`
      )
    ).toEqual([]);
  });

  it('the body face keeps every subset the authored content needs', () => {
    const found = codepoints(strings(activePack.content));
    expect(found.size).toBeGreaterThan(40);
    const dropped = [...found].filter(([cp]) => lost[bodyFamily](cp));
    expect(dropped.map(([cp, ex]) => `${show(cp)} in ${JSON.stringify(ex.slice(0, 60))}`)).toEqual(
      []
    );
  });

  it('the body face keeps every subset the lexicon headwords and glosses need', () => {
    const entries = lexicon().flatMap((chunk) => Object.values(chunk));
    const found = codepoints(
      (function* () {
        for (const e of entries) {
          if (e.de) yield e.de;
          for (const g of [].concat(e.en ?? [])) yield g;
          for (const ex of e.examples ?? []) yield `${ex.de ?? ''} ${ex.en ?? ''}`;
        }
      })()
    );
    expect(found.size).toBeGreaterThan(40);
    const dropped = [...found].filter(([cp]) => lost[bodyFamily](cp));
    expect(dropped.map(([cp, ex]) => `${show(cp)} in ${JSON.stringify(ex.slice(0, 60))}`)).toEqual(
      []
    );
  });

  // The ipa face draws IPA now; the mono face is its fallback in the stack, so
  // its greek subset still has to hold for θ and χ.
  it('the mono face keeps the greek subset the IPA fallback borrows θ and χ from', () => {
    const entries = lexicon().flatMap((chunk) => Object.values(chunk));
    const found = codepoints(
      (function* () {
        for (const e of entries) if (e.ipa) yield e.ipa;
      })()
    );
    expect(found.size).toBeGreaterThan(40);
    const dropped = [...found].filter(([cp]) => lost[monoFamily](cp));
    expect(dropped.map(([cp, ex]) => `${show(cp)} in ${JSON.stringify(ex.slice(0, 60))}`)).toEqual(
      []
    );
  });
});

// Everything above reasons from DECLARED unicode-ranges, which is why it stayed
// green while Android drew IPA as boxes: JetBrains Mono's latin-ext file
// declares U+0250–02BA and contains none of ɐ ɛ ɡ ɪ ʁ ʃ, nor the stress mark
// ˈ. Desktop and iOS hid it by borrowing glyphs from system fonts; Android's
// WebView has none to borrow. These read each vendored file's own glyph map.
describe('the IPA face draws every phonetic glyph', () => {
  const { font } = activePack.theme;
  // The face TEXT.ipa renders with: the pack's `ipa` stack, else the mono one.
  const ipaFamily = (font.ipa ?? font.mono).match(/'([^']+)'/)?.[1];
  const monoFamily = font.mono.match(/'([^']+)'/)?.[1];

  const glyphs = (name) => {
    const slug = familySlug(name);
    const all = new Set();
    for (const [, ref] of readFileSync(`${FONT_DIR}/${slug}/face.css`, 'utf8').matchAll(
      /url\(([^)]+)\)/g
    )) {
      for (const cp of woff2Codepoints(readFileSync(`public${ref.trim()}`))) all.add(cp);
    }
    return all;
  };

  function* ipaFields(value, depth = 0) {
    if (depth > 8 || value == null || typeof value !== 'object') return;
    for (const [key, v] of Object.entries(value)) {
      if (key === 'ipa' && typeof v === 'string') yield v;
      else yield* ipaFields(v, depth + 1);
    }
  }
  const phonetic = codepoints(
    (function* () {
      yield* ipaFields(activePack.content);
      yield* ipaFields(lexicon());
    })()
  );
  const missingFrom = (name) => {
    const have = glyphs(name);
    return [...phonetic]
      .filter(([cp]) => !have.has(cp))
      .map(([cp, ex]) => `${show(cp)} in ${JSON.stringify(ex.slice(0, 40))}`);
  };

  it('reads real phonetic content, not an empty set', () => {
    expect(phonetic.size).toBeGreaterThan(30);
    for (const ch of 'ˈːəɐɡʁ\u032f') expect(phonetic.has(ch.codePointAt(0)), ch).toBe(true);
  });

  it('has a glyph for every character of every IPA string in the pack and the lexicon', () => {
    expect(missingFrom(ipaFamily)).toEqual([]);
  });

  // Guards the guard: the same check on the UI mono face must fail, or it is
  // reading declared ranges again rather than glyphs.
  it('would catch the face that drew boxes on Android', () => {
    expect(monoFamily).toBe('JetBrains Mono');
    expect(missingFrom(monoFamily).length).toBeGreaterThan(20);
  });
});
