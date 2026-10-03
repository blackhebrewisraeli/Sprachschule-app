// Which codepoints a WOFF2 file can actually draw, read from its own cmap.
//
// A face's `unicode-range` says what the file is ALLOWED to draw, not what it
// contains. JetBrains Mono's latin-ext file declares U+0250–02BA (the IPA
// letters) yet has none of ɐ ɛ ɡ ɪ ʁ ʃ in it, so a coverage check built on
// declared ranges called IPA covered while Android drew boxes. This reads the
// glyph map instead. No dependency: WOFF2 is a table directory plus one Brotli
// stream, and the cmap table is never transformed, so it can be read in place.

import { brotliDecompressSync } from 'node:zlib';

// The WOFF2 "known table" index: a directory entry stores a 6-bit index into
// this list instead of the 4-byte tag (spec §5.1).
const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca',
  'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea',
  'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL',
  'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar',
  'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat',
  'Gloc', 'Feat', 'Sill',
]; // prettier-ignore

/**
 * @param {Buffer} buf a WOFF2 file
 * @returns {Set<number>} every codepoint mapped to a real glyph
 */
export function woff2Codepoints(buf) {
  if (buf.length < 48 || buf.toString('latin1', 0, 4) !== 'wOF2')
    throw new Error('not a WOFF2 file');
  const numTables = buf.readUInt16BE(12);
  const compressedLength = buf.readUInt32BE(20);
  let off = 48;
  const base128 = () => {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      const byte = buf[off++];
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
    throw new Error('malformed UIntBase128 in the WOFF2 table directory');
  };

  // Tables sit in the decompressed stream back to back, in directory order,
  // at their transformed length when transformed (spec §5.2, §5.3).
  let pos = 0;
  let cmapAt = -1;
  for (let i = 0; i < numTables; i++) {
    const flags = buf[off++];
    let tag = KNOWN_TAGS[flags & 0x3f];
    if ((flags & 0x3f) === 63) {
      tag = buf.toString('latin1', off, off + 4);
      off += 4;
    }
    const version = flags >> 6;
    const origLength = base128();
    // glyf/loca use version 0 to MEAN transformed; every other table uses 0 for none.
    const transformed = tag === 'glyf' || tag === 'loca' ? version === 0 : version !== 0;
    const length = transformed ? base128() : origLength;
    if (tag === 'cmap') cmapAt = pos;
    pos += length;
  }
  if (cmapAt < 0) throw new Error('WOFF2 file has no cmap table');
  return readCmap(brotliDecompressSync(buf.subarray(off, off + compressedLength)), cmapAt);
}

function readCmap(data, at) {
  const records = [];
  for (let i = 0; i < data.readUInt16BE(at + 2); i++) {
    const r = at + 4 + i * 8;
    records.push(at + data.readUInt32BE(r + 4));
  }
  // Prefer the full-repertoire format 12 over the BMP-only format 4.
  const sub =
    records.find((s) => data.readUInt16BE(s) === 12) ??
    records.find((s) => data.readUInt16BE(s) === 4);
  if (sub === undefined) throw new Error('cmap has no format 4 or 12 subtable');
  const out = new Set();
  if (data.readUInt16BE(sub) === 12) {
    for (let g = 0; g < data.readUInt32BE(sub + 12); g++) {
      const q = sub + 16 + g * 12;
      for (let cp = data.readUInt32BE(q); cp <= data.readUInt32BE(q + 4); cp++) out.add(cp);
    }
    return out;
  }
  const segments = data.readUInt16BE(sub + 6) / 2;
  const ends = sub + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const offsets = deltas + segments * 2;
  for (let i = 0; i < segments; i++) {
    const start = data.readUInt16BE(starts + i * 2);
    const end = data.readUInt16BE(ends + i * 2);
    const delta = data.readInt16BE(deltas + i * 2);
    const rangeOffset = data.readUInt16BE(offsets + i * 2);
    for (let cp = start; cp <= end && cp !== 0xffff; cp++) {
      const glyph =
        rangeOffset === 0
          ? (cp + delta) & 0xffff
          : data.readUInt16BE(offsets + i * 2 + rangeOffset + (cp - start) * 2);
      if (glyph !== 0) out.add(cp);
    }
  }
  return out;
}
