// Avatars: two tiers, one resolver, and a generated fallback that costs
// nothing.
//
//     uploaded image  →  generated identicon
//
// ONE RESOLVER. Before this, "no avatar" rendered as 🦊 on Home and 🙂
// in ProfileCard — the same absence, drawn two different ways, because each
// call site invented its own fallback inline. Everything now goes through
// avatarFor(), and a guard test fails if a second hard-coded glyph appears.

/** FNV-1a, same shape as the quest seed: deterministic, tiny, no crypto. */
export function hashSeed(input) {
  let h = 0x811c9dc5;
  const s = String(input ?? '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h >>> 0;
}

/** Grid is 5 wide; only the left 3 columns are drawn and then mirrored. */
export const GRID = 5;
const HALF = Math.ceil(GRID / 2);

/**
 * A deterministic identicon as an SVG string.
 *
 * SEEDED BY USER ID, NEVER BY HANDLE. A handle is editable; an avatar that
 * changes because you renamed yourself is a bug, not a feature. The caller is
 * responsible for passing the id — `avatarFor` does.
 *
 * Mirrored left-to-right, which is what makes a random bit field read as a
 * deliberate mark rather than as noise.
 *
 * Colours are computed, not themed: this is generated content keyed to an
 * identity, so it must be the SAME on light and dark. Two hues a third of the
 * wheel apart keeps foreground and background legible without a contrast pass.
 */
export function identicon(seed, { size = 64 } = {}) {
  const h = hashSeed(seed);
  const hue = h % 360;
  const fg = `hsl(${hue} 62% 45%)`;
  const bg = `hsl(${(hue + 120) % 360} 32% 92%)`;

  // One bit per cell in the left half, taken from a second hash so the pattern
  // is independent of the hue — otherwise similar hues would share a shape.
  const bits = hashSeed(`${seed}:cells`);
  const cell = size / GRID;
  const rects = [];

  for (let col = 0; col < HALF; col += 1) {
    for (let row = 0; row < GRID; row += 1) {
      // 15 cells, 32 bits — no wraparound, so no cell repeats another's bit.
      const on = (bits >>> (col * GRID + row)) & 1;
      if (!on) continue;
      const mirrored = GRID - 1 - col;
      rects.push(`<rect x="${col * cell}" y="${row * cell}" width="${cell}" height="${cell}"/>`);
      if (mirrored !== col) {
        rects.push(
          `<rect x="${mirrored * cell}" y="${row * cell}" width="${cell}" height="${cell}"/>`
        );
      }
    }
  }

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" ` +
    `width="${size}" height="${size}" role="img" aria-hidden="true">` +
    `<rect width="${size}" height="${size}" fill="${bg}"/>` +
    `<g fill="${fg}">${rects.join('')}</g>` +
    `</svg>`
  );
}

/** An identicon as a data URI, for use as an <img src>. */
export function identiconDataUri(seed, options) {
  // encodeURIComponent, not btoa: the SVG is ASCII here, and a URI-encoded
  // payload stays readable in devtools and avoids base64's 33% inflation.
  return `data:image/svg+xml,${encodeURIComponent(identicon(seed, options))}`;
}

/**
 * Where an uploaded avatar actually lives.
 *
 * Composed here rather than stored, because the storage origin differs between
 * the local stack and production — a URL frozen into a row would be wrong in
 * whichever environment it was not written in.
 *
 * A plain member read, deliberately not optional chaining: Vite replaces only
 * the plain form, and any other spelling inlines the whole env object — every
 * VITE_ variable — into the bundle (src/noWholeEnvInBundle.test.js).
 */
export function avatarUrl(path, base = import.meta.env.VITE_SUPABASE_URL) {
  if (!path || !base) return null;
  return `${String(base).replace(/\/+$/, '')}/storage/v1/object/public/avatars/${path}`;
}

/**
 * Resolve which of the two tiers to draw.
 *
 * @returns {{kind: 'image'|'identicon', src: string}}
 *   `kind` is what a component switches on; it never has to know the order.
 */
export function avatarFor({ profile, userId, base } = {}) {
  const url = avatarUrl(profile?.avatar_path, base);
  if (url) return { kind: 'image', src: url };

  // Seeded by the id. A learner with no id at all (a guest) still gets a stable
  // mark for the session rather than a blank square.
  return { kind: 'identicon', src: identiconDataUri(userId ?? 'guest') };
}
