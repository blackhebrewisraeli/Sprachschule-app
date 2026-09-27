/**
 * The "Deutsch." mark, as geometry.
 *
 * Every brand bitmap in public/ and in the two native projects is rendered from
 * this one module, and none of them may depend on a font at render time. The
 * sources before #356 drew the D with an SVG <text> element asking for
 * `Georgia, 'Times New Roman', serif`; neither face is vendored, so the glyph
 * was whatever serif the rasterising machine happened to have. Same input,
 * different output, and nothing in CI could see it.
 *
 * #356 fixed that by CONSTRUCTING a D from lines and curves. This keeps the fix
 * and swaps the letter: the D and the period are now Fraunces, the app's
 * display face, so the icon is the first letter of the wordmark the masthead
 * and the pre-JS shell already set live. They arrive as OUTLINES, not text:
 * extract-glyphs.py reads the vendored woff2 once and writes the path data to
 * glyphs.js, so the artwork is still byte-identical on every machine and still
 * contains no <text> and no font reference.
 *
 * Geometry lives on a box 100 units tall. `MARK` is exported as data rather
 * than baked into the SVG string so brandAssets.test.js can do arithmetic on
 * the same numbers the renderer uses, instead of parsing them back out of
 * markup.
 */

import { MODE_COLORS, FLAG_STRIPES } from '../../src/lib/themeTokens.js';
import { GLYPHS } from './glyphs.js';

/**
 * The letterform in its two optical cuts (see extract-glyphs.py for why two).
 * Each is `{ axes, width, height, letter, period }`, where `letter` and
 * `period` are path data on a `width` x `height` box. They are separate paths
 * because they take separate colours.
 *
 * Both paths use the nonzero fill rule, as TrueType outlines do: a variable
 * font's contours may overlap, and even-odd would punch a hole wherever two do.
 */
export const CUTS = {
  display: GLYPHS.display,
  small: GLYPHS.small,
};

/** The display cut, which every icon and launch screen uses. */
export const MARK = CUTS.display;

/**
 * An app icon has no theme. It is rasterised once and shown on a launcher, a
 * tab strip and a share card, none of which know anything about
 * `prefers-color-scheme` — so every colour here comes from a family
 * themeTokens.js documents as NOT varying by mode.
 *
 * - `accent-black` is "the only stable dark plane in the system", identical in
 *   LIGHT and DARK, and it is the masthead the app already wears.
 * - `accent-black-on` ships with that plane; its own comment calls the pairing
 *   "the contract".
 * - `flag-red` is a FLAG_STRIPES value — "brand colours, not theme colours".
 *   `accent-red` and `error` both flip by mode and would be a coin toss here.
 *
 * Read from the tokens rather than copied, so a palette change propagates to
 * `npm run gen:assets` instead of silently drifting. The three literals the old
 * artwork carried (#16110b, #FDF3C0, #D62828) are none of them reachable as a
 * current token.
 */
export const BRAND = {
  plane: MODE_COLORS.light['accent-black'],
  ink: MODE_COLORS.light['accent-black-on'],
  dot: FLAG_STRIPES['flag-red'],
};

/**
 * Light `ground`: the PWA manifest's `background_color` and the pre-JS shell's
 * default ground. Mode-dependent in the app, pinned to light here for the
 * reason splashSvg gives.
 */
export const SPLASH_GROUND = MODE_COLORS.light.ground;

/**
 * Half-diagonal of the mark's bounding box once scaled into `size`.
 *
 * Android's maskable contract is a safe zone of the central circle at 80% of
 * the canvas (r = 0.4 × size). Content is safe iff this value clears it — which
 * the pre-#356 `pwa-512.png` did not, which is why declaring it `maskable`
 * promised something the artwork never kept.
 *
 * @param {{ markHeight: number, cut?: keyof typeof CUTS }} opts
 */
export function maskableClearance({ markHeight, cut = 'display' }) {
  const mark = CUTS[cut];
  const scale = markHeight / mark.height;
  const w = (mark.width * scale) / 2;
  const h = (mark.height * scale) / 2;
  return Math.sqrt(w * w + h * h);
}

/** @param {number} size */
export function maskableSafeRadius(size) {
  return size * 0.4;
}

/**
 * Android's adaptive-icon contract, which is tighter than the web's maskable
 * one: the foreground layer is a 108dp canvas, and only the central 66dp circle
 * is guaranteed to survive every launcher mask and the parallax shift.
 *
 * @param {number} size foreground canvas edge, px
 */
export function adaptiveSafeRadius(size) {
  return (size * 33) / 108;
}

/**
 * Does this icon's bitmap need an alpha channel?
 *
 * Only where the artwork leaves part of the canvas uncovered: a plane with
 * rounded corners, or no plane at all (Android's adaptive foreground). An
 * opaque PNG fills those corners with the page's white, so a rounded launcher
 * icon sits on a white square. Everything full-bleed stays opaque, which is
 * what App Store Connect demands of the iOS icon.
 *
 * @param {{ radius: number, plane?: boolean }} spec
 */
export function needsAlpha({ radius, plane = true }) {
  return plane === false || radius > 0;
}

/**
 * Render the mark onto a plane.
 *
 * @param {object} opts
 * @param {number} opts.size          canvas edge, px
 * @param {number} opts.radius        plane corner radius. 0 for anything a
 *                                    platform masks itself (maskable, iOS).
 * @param {number} opts.markHeight    height of the mark's box (cap top to the
 *                                    period's overshoot below the baseline), px
 * @param {boolean} [opts.plane]      false omits the plane, leaving the mark on
 *                                    transparency — Android's adaptive
 *                                    foreground, whose plane is its own layer.
 * @param {keyof typeof CUTS} [opts.cut] optical cut; `small` for the favicon
 * @returns {string} standalone SVG, containing no <text> and no font reference
 */
export function iconSvg({ size, radius, markHeight, plane = true, cut = 'display' }) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    ...iconBody({ size, radius, markHeight, plane, cut }),
    `</svg>`,
    '',
  ].join('\n');
}

/**
 * A launch screen: the `any` icon, centred on the ivory ground.
 *
 * The same picture an installed PWA already shows on Android, which builds its
 * splash from `background_color` (light `ground`, see vite.config.js) plus the
 * icon — and the ground the pre-JS shell in index.html paints next, so the
 * hand-off from native splash to web shell does not flash. A launch screen is
 * as theme-blind as an icon: it is drawn before any JavaScript can read the
 * stored mode, so it takes the light ground in both.
 *
 * @param {object} opts
 * @param {number} opts.width     canvas width, px
 * @param {number} opts.height    canvas height, px
 * @param {number} opts.iconSize  edge of the centred icon, px
 * @returns {string} standalone SVG, containing no <text> and no font reference
 */
export function splashSvg({ width, height, iconSize }) {
  const x = round((width - iconSize) / 2);
  const y = round((height - iconSize) / 2);
  const icon = iconBody({
    size: iconSize,
    radius: round((iconSize * 96) / 512),
    markHeight: round(iconSize / 2),
    plane: true,
    cut: 'display',
  });
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `  <rect width="${width}" height="${height}" fill="${SPLASH_GROUND}"/>`,
    `  <g transform="translate(${x} ${y})">`,
    ...icon.map((line) => `  ${line}`),
    `  </g>`,
    `</svg>`,
    '',
  ].join('\n');
}

/** The plane and the mark, as SVG lines, for a `size`-edged canvas at 0,0. */
function iconBody({ size, radius, markHeight, plane, cut }) {
  const mark = CUTS[cut];
  const scale = markHeight / mark.height;
  const markW = mark.width * scale;
  const tx = (size - markW) / 2;
  const ty = (size - markHeight) / 2;

  return [
    ...(plane
      ? [`  <rect width="${size}" height="${size}" rx="${radius}" fill="${BRAND.plane}"/>`]
      : []),
    `  <g transform="translate(${round(tx)} ${round(ty)}) scale(${round(scale, 5)})">`,
    `    <path fill="${BRAND.ink}" d="${mark.letter}"/>`,
    `    <path fill="${BRAND.dot}" d="${mark.period}"/>`,
    `  </g>`,
  ];
}

/**
 * @param {number} n
 * @param {number} [places]
 */
function round(n, places = 3) {
  return Number(n.toFixed(places));
}
