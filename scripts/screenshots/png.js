// Store-export checks on a PNG's own bytes. Both stores reject an alpha
// channel, and both want exact pixel sizes, so these are read from the file
// rather than trusted from whatever produced it.

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// PNG colour types that carry an alpha channel: 4 = grey + alpha, 6 = RGBA.
const ALPHA_TYPES = new Set([4, 6]);

/**
 * @param {Buffer} buf
 * @returns {{ width: number, height: number, bitDepth: number, colorType: number, hasAlpha: boolean }}
 */
export function pngInfo(buf) {
  if (buf.length < 33 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('not a PNG');
  if (buf.toString('latin1', 12, 16) !== 'IHDR') throw new Error('PNG has no IHDR first');
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  // A tRNS chunk makes an RGB or palette image transparent without an alpha
  // channel; the stores treat that as alpha too.
  let hasTrns = false;
  for (let off = 8; off + 8 <= buf.length; ) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    if (type === 'tRNS') hasTrns = true;
    if (type === 'IDAT' || type === 'IEND') break; // tRNS must precede IDAT
    off += 12 + len;
  }
  return { width, height, bitDepth, colorType, hasAlpha: ALPHA_TYPES.has(colorType) || hasTrns };
}

/**
 * @param {Buffer} buf
 * @param {{ width: number, height: number }} want
 * @returns {string[]} problems; empty when the file is store-ready
 */
export function exportProblems(buf, want) {
  let info;
  try {
    info = pngInfo(buf);
  } catch (err) {
    return [err.message];
  }
  const problems = [];
  if (info.width !== want.width || info.height !== want.height) {
    problems.push(`is ${info.width}×${info.height}, needs exactly ${want.width}×${want.height}`);
  }
  if (info.hasAlpha) problems.push('has an alpha channel (the stores reject it)');
  if (info.bitDepth !== 8)
    problems.push(`is ${info.bitDepth}-bit, Play wants 24-bit (8 per channel)`);
  return problems;
}
