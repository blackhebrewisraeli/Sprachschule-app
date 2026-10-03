// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { woff2Codepoints } from './woff2Cmap.js';

const JB = 'public/fonts/jetbrains-mono';
const cps = (file) => woff2Codepoints(readFileSync(`${JB}/${file}`));
const cp = (ch) => ch.codePointAt(0);

describe('woff2Codepoints', () => {
  it('reads the glyphs a real vendored file contains', () => {
    const latin = cps('jetbrains-mono-latin-normal-400-700.woff2');
    for (const ch of 'AZaz09[]/') expect(latin.has(cp(ch)), ch).toBe(true);
  });

  // The reason this reader exists. face.css declares U+0250–02BA for this
  // file, so a check built on declared ranges calls these IPA letters covered.
  it('tells a declared range apart from the glyphs actually in the file', () => {
    const face = readFileSync(`${JB}/face.css`, 'utf8');
    expect(face).toMatch(/U\+0100-02BA/);
    const ext = cps('jetbrains-mono-latin-ext-normal-400-700.woff2');
    expect(ext.has(cp('ə'))).toBe(true);
    expect(ext.has(cp('ɐ'))).toBe(false);
    expect(ext.has(cp('ɡ'))).toBe(false);
    expect(ext.has(0x02c8)).toBe(false); // ˈ, the stress mark
  });

  it('rejects a file that is not WOFF2', () => {
    expect(() => woff2Codepoints(Buffer.from('wOFF' + '\0'.repeat(60)))).toThrow('not a WOFF2');
    expect(() => woff2Codepoints(Buffer.alloc(10))).toThrow('not a WOFF2');
  });
});
