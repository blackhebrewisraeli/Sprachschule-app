import { describe, it, expect } from 'vitest';
import { parseFaces, renderFaceCss, localFileName } from './css.js';
import { buildGoogleFontsUrl } from './googleFontsUrl.js';

// A verbatim two-block excerpt of what css2 returns for the German pack.
const CSS = `/* latin-ext */
@font-face {
  font-family: 'Fraunces';
  font-style: normal;
  font-weight: 300 900;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/fraunces/v38/abc.woff2) format('woff2');
  unicode-range: U+0100-02BA, U+1E00-1E9F, U+2C60-2C7F;
}
/* latin */
@font-face {
  font-family: 'Fraunces';
  font-style: normal;
  font-weight: 300 900;
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/fraunces/v38/def.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+2192, U+2212;
}
`;

describe('parseFaces', () => {
  it('reads subset, family, weight and url from each block', () => {
    const faces = parseFaces(CSS);
    expect(faces).toHaveLength(2);
    expect(faces[0].subset).toBe('latin-ext');
    expect(faces[0].family).toBe('Fraunces');
    expect(faces[0].style).toBe('normal');
    expect(faces[0].weight).toBe('300 900');
    expect(faces[0].url).toBe('https://fonts.gstatic.com/s/fraunces/v38/abc.woff2');
    expect(faces[1].subset).toBe('latin');
  });

  it('keeps unicode-range exactly as sent', () => {
    // This is Google's own subsetting. Re-deriving it would mean owning a font
    // toolchain; a silent truncation here is a missing glyph in production.
    const [ext, latin] = parseFaces(CSS);
    expect(ext.unicodeRange).toBe('U+0100-02BA, U+1E00-1E9F, U+2C60-2C7F');
    expect(latin.unicodeRange).toBe('U+0000-00FF, U+2192, U+2212');
  });

  it('ignores a block with no src url rather than emitting a partial face', () => {
    expect(parseFaces('/* latin */\n@font-face {\n  font-family: X;\n}')).toEqual([]);
  });
});

// A verbatim `text=` response: one face, no subset comment.
const TEXT_CSS = `@font-face {
  font-family: 'Noto Sans Mono';
  font-style: normal;
  font-weight: 400;
  font-stretch: 100%;
  font-display: swap;
  src: url(https://fonts.gstatic.com/l/font?kit=abc&skey=def&v=v37) format('woff2');
  unicode-range: U+61-62, U+250;
}`;

describe('parseFaces on a text= response', () => {
  it('names the comment-less face with the given subset', () => {
    const [face] = parseFaces(TEXT_CSS, { subset: 'ipa' });
    expect(face).toMatchObject({ subset: 'ipa', family: 'Noto Sans Mono', weight: '400' });
    expect(face.url).toBe('https://fonts.gstatic.com/l/font?kit=abc&skey=def&v=v37');
    expect(face.unicodeRange).toBe('U+61-62, U+250');
  });

  it('skips a comment-less face when no subset name is given, as before', () => {
    expect(parseFaces(TEXT_CSS)).toEqual([]);
  });
});

describe('buildGoogleFontsUrl', () => {
  it('asks for named subsets by default', () => {
    expect(buildGoogleFontsUrl([{ name: 'JetBrains Mono', axes: 'wght@400..700' }])).toBe(
      'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400..700&display=swap'
    );
  });

  it('asks for exactly the given characters with text=, encoded', () => {
    expect(
      buildGoogleFontsUrl([{ name: 'Noto Sans Mono', axes: 'wght@400' }], { text: '[ɐ̯]' })
    ).toBe(
      'https://fonts.googleapis.com/css2?family=Noto+Sans+Mono:wght@400&text=%5B%C9%90%CC%AF%5D&display=swap'
    );
  });
});

describe('renderFaceCss', () => {
  const faces = parseFaces(CSS).map((f) => ({ ...f, localName: localFileName(f, 'fraunces') }));
  const out = renderFaceCss(faces, '/fonts/fraunces');

  it('points src at the local file', () => {
    expect(out).toContain(
      "src: url(/fonts/fraunces/fraunces-latin-normal-300-900.woff2) format('woff2')"
    );
    expect(out).not.toContain('fonts.gstatic.com');
  });

  it('carries unicode-range through untouched', () => {
    expect(out).toContain('unicode-range: U+0000-00FF, U+2192, U+2212;');
    expect(out).toContain('unicode-range: U+0100-02BA, U+1E00-1E9F, U+2C60-2C7F;');
  });

  it('preserves font-display: swap', () => {
    // The old CDN URL carried &display=swap. Losing it here would swap a
    // fallback-then-swap paint for an invisible-text pause on first load.
    expect(out.match(/font-display: swap;/g)).toHaveLength(2);
  });

  it('round-trips: the output parses back to the same faces', () => {
    const again = parseFaces(out);
    expect(again).toHaveLength(2);
    expect(again.map((f) => f.subset)).toEqual(['latin-ext', 'latin']);
    expect(again.map((f) => f.unicodeRange)).toEqual(faces.map((f) => f.unicodeRange));
  });
});

describe('localFileName', () => {
  it('is stable and readable rather than a content hash', () => {
    const [face] = parseFaces(CSS);
    expect(localFileName(face, 'fraunces')).toBe('fraunces-latin-ext-normal-300-900.woff2');
  });
});
