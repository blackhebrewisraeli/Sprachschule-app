#!/usr/bin/env node
/**
 * Regenerates every brand bitmap from one source of geometry: the web set in
 * public/ and the canonical native sources in assets/. @capacitor/assets turns
 * those sources into the platform resolution sets after this script finishes.
 *
 *   npm run gen:assets
 *
 * Playwright is already the engine behind `audit:contrast` and `audit:layout`,
 * so the canonical rasters need no machine-global image tooling.
 *
 * Reproducibility, which is the whole reason this exists:
 *   - the icons are pure geometry — no text, no font, no gradient, no emoji;
 *   - the social card sets only the three VENDORED families, served from this
 *     repo over localhost, so nothing is fetched from a CDN here or at runtime;
 *   - every raster is screenshotted at deviceScaleFactor 1 with the viewport
 *     already at the target edge, so no resampling step can vary.
 */

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { BRAND, MARK, iconSvg, maskableClearance, maskableSafeRadius, needsAlpha } from './mark.js';
import { ADAPTIVE_SOURCE } from './native.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const publicDir = join(root, 'public');
const mobileAssetsDir = join(root, 'assets');

/**
 * The four mask contracts, and why the mark is a different size in each.
 *
 * `any`       — nothing masks it, so the artwork supplies its own rounded plane.
 * `maskable`  — Android may crop to the central circle at 80% of the canvas, so
 *               the plane is full-bleed and the mark lives inside r = 0.4·size.
 * apple-touch — iOS ALWAYS applies its own squircle. Baking corners here would
 *               round it twice and show ground in the notches, so radius is 0.
 *               The squircle is far wider than the maskable circle, so the mark
 *               can sit larger than it does there.
 * favicon     — decided at 16px, not 32, and drawn in the `small` optical cut:
 *               the display cut's hairlines are a fifth of a pixel there and
 *               the D falls apart into a stem and an arc. The small cut is also
 *               wider, hence the lower mark height.
 */
const ICONS = [
  { file: 'pwa-192.png', size: 192, radius: 36, markHeight: 96 },
  { file: 'pwa-512.png', size: 512, radius: 96, markHeight: 256 },
  // 240, not 256: the maskable is the one variant a platform may crop, and the
  // Fraunces mark at 256 overshoots the safe circle by 6.2px; 240 clears it by
  // 6.9px. See the clearance guard in main().
  { file: 'pwa-maskable-512.png', size: 512, radius: 0, markHeight: 240, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, radius: 0, markHeight: 92 },
  { file: 'favicon-32.png', size: 32, radius: 5, markHeight: 18, cut: 'small' },
];

/** SVGs committed to public/ as well as rasterised. */
const SVGS = [
  // The canonical, human-readable mark. Nothing links it; it is the file you
  // open to see what the brand is.
  { file: 'icon-base.svg', size: 512, radius: 96, markHeight: 256 },
  // Served, and linked from index.html as the primary favicon.
  { file: 'favicon.svg', size: 32, radius: 5, markHeight: 18, cut: 'small' },
];

const SOCIAL = { file: 'social-preview.png', width: 1200, height: 630 };

const MOBILE_COLORS = {
  light: BRAND.ink,
  dark: BRAND.plane,
};

const MOBILE_SOURCES = [
  {
    file: 'icon-only.png',
    size: 1024,
    svg: () =>
      iconSvg({
        size: ADAPTIVE_SOURCE.size,
        radius: 0,
        markHeight: 524,
        colors: { plane: MOBILE_COLORS.dark, ink: MOBILE_COLORS.light, dot: MOBILE_COLORS.light },
      }),
  },
  {
    file: 'icon-background.png',
    size: 1024,
    svg: () => solidSvg(1024, MOBILE_COLORS.dark),
  },
  {
    file: 'icon-foreground.png',
    size: 1024,
    transparent: true,
    svg: () =>
      iconSvg({
        size: 1024,
        radius: 0,
        // @capacitor/assets adds a 16.7% inset to the adaptive layer. At 540px
        // the visible Fraunces mark lands back on Android's 66dp safe circle.
        markHeight: ADAPTIVE_SOURCE.markHeight,
        plane: false,
        colors: { plane: MOBILE_COLORS.dark, ink: MOBILE_COLORS.light, dot: MOBILE_COLORS.light },
      }),
  },
  {
    file: 'splash.png',
    size: 2732,
    svg: (origin) =>
      mobileSplashSvg({ origin, ground: MOBILE_COLORS.light, ink: MOBILE_COLORS.dark }),
  },
  {
    file: 'splash-dark.png',
    size: 2732,
    svg: (origin) =>
      mobileSplashSvg({ origin, ground: MOBILE_COLORS.dark, ink: MOBILE_COLORS.light }),
  },
];

async function main() {
  // Fail loudly rather than shipping a clipped launcher icon. The test suite
  // asserts this too; having it here means `gen:assets` cannot produce the bad
  // artwork in the first place.
  for (const icon of ICONS.filter((i) => i.maskable)) {
    const clearance = maskableClearance(icon);
    const safe = maskableSafeRadius(icon.size);
    if (clearance > safe) {
      throw new Error(
        `${icon.file}: mark half-diagonal ${clearance.toFixed(1)} exceeds the ` +
          `maskable safe radius ${safe.toFixed(1)} (80% circle). Reduce markHeight.`
      );
    }
  }
  await mkdir(publicDir, { recursive: true });
  await mkdir(mobileAssetsDir, { recursive: true });

  const server = await serveRepo();
  const browser = await chromium.launch();
  try {
    for (const spec of SVGS) {
      await writeFile(join(publicDir, spec.file), iconSvg(spec), 'utf8');
      report(spec.file, `${spec.size}x${spec.size} svg`);
    }

    for (const spec of ICONS) {
      await rasteriseSvg(browser, iconSvg(spec), spec.size, spec.size, join(publicDir, spec.file), {
        transparent: needsAlpha(spec),
      });
      report(spec.file, `${spec.size}x${spec.size}`);
    }

    await shootSocial(browser, server.origin, join(publicDir, SOCIAL.file));
    report(SOCIAL.file, `${SOCIAL.width}x${SOCIAL.height}`);

    for (const spec of MOBILE_SOURCES) {
      const out = join(mobileAssetsDir, spec.file);
      await rasteriseSvg(browser, spec.svg(server.origin), spec.size, spec.size, out, {
        transparent: spec.transparent,
      });
      report(`assets/${spec.file}`, `${spec.size}x${spec.size}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

function solidSvg(size, fill) {
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `  <rect width="${size}" height="${size}" fill="${fill}"/>`,
    `</svg>`,
    '',
  ].join('\n');
}

/** The exact Fraunces mark and wordmark, reversed across light and dark. */
function mobileSplashSvg({ origin, ground, ink }) {
  const size = 2732;
  const markHeight = 600;
  const scale = markHeight / MARK.height;
  const markWidth = MARK.width * scale;
  const x = (size - markWidth) / 2;
  const y = 720;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `  <style>`,
    `    @font-face { font-family: 'Fraunces'; font-style: normal; font-weight: 300 900; src: url('${origin}/fonts/fraunces/fraunces-latin-normal-300-900.woff2') format('woff2'); }`,
    `    .wordmark { font-family: 'Fraunces'; font-optical-sizing: auto; text-anchor: middle; }`,
    `  </style>`,
    `  <rect width="${size}" height="${size}" fill="${ground}"/>`,
    `  <g transform="translate(${x} ${y}) scale(${scale})" fill="${ink}">`,
    `    <path d="${MARK.letter}"/>`,
    `    <path d="${MARK.period}"/>`,
    `  </g>`,
    `  <text class="wordmark" x="1366" y="1590" fill="${ink}" font-size="220" font-weight="750">Deutsch</text>`,
    `  <text class="wordmark" x="1366" y="1810" fill="${ink}" font-size="150" font-weight="520" letter-spacing="2">Sprachschule</text>`,
    `</svg>`,
    '',
  ].join('\n');
}

/**
 * Screenshot an SVG at exactly `width` x `height`.
 *
 * The SVG is placed in a zero-margin document whose viewport is already the
 * target size, and the page is captured rather than the element, so the output
 * is the canvas 1:1 with no scaling pass anywhere in the pipeline.
 *
 * Opaque by default, and that is load-bearing: Chromium then writes an RGB PNG
 * with no alpha channel at all, which App Store Connect requires of the iOS
 * icon. `transparent` is for artwork that leaves canvas uncovered — see
 * needsAlpha in mark.js.
 *
 * @param {import('playwright').Browser} browser
 * @param {string} svg
 * @param {number} width
 * @param {number} height
 * @param {string} out
 * @param {{ transparent?: boolean }} [opts]
 */
async function rasteriseSvg(browser, svg, width, height, out, { transparent = false } = {}) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  try {
    await page.setContent(
      `<!doctype html><html><head><style>
         html,body{margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden}
         svg{display:block}
       </style></head><body>${svg}</body></html>`,
      { waitUntil: 'load' }
    );
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: out, type: 'png', omitBackground: transparent });
  } finally {
    await page.close();
  }
}

/**
 * @param {import('playwright').Browser} browser
 * @param {string} origin
 * @param {string} out
 */
async function shootSocial(browser, origin, out) {
  const page = await browser.newPage({
    viewport: { width: SOCIAL.width, height: SOCIAL.height },
    deviceScaleFactor: 1,
  });
  try {
    await page.goto(`${origin}/scripts/gen-assets/social-preview.html`, {
      waitUntil: 'networkidle',
    });
    // `networkidle` says the woff2 requests finished, not that layout has been
    // redone with the real metrics. Without this the card can be captured in
    // the fallback face — the exact silent, machine-dependent render this
    // rewrite exists to stop.
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: out, type: 'png' });
  } finally {
    await page.close();
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

/**
 * Serve the repo root so the card can <link> the app's OWN
 * public/fonts/<family>/face.css, whose src URLs are absolute (`/fonts/...`) and
 * therefore unreachable over file://. Linking the real stylesheet rather than
 * re-declaring @font-face here means re-vendoring the fonts updates the card.
 *
 * Port 0: the OS picks a free one, so this cannot collide with a dev server.
 */
function serveRepo() {
  const server = createServer(async (req, res) => {
    // `public/` is the web root for /fonts/..., the repo root for the template.
    const rel = normalize(decodeURIComponent((req.url || '/').split('?')[0])).replace(
      /^(\.\.[/\\])+/,
      ''
    );
    for (const base of [publicDir, root]) {
      const file = join(base, rel);
      if (!file.startsWith(base)) continue;
      try {
        if ((await stat(file)).isFile()) {
          res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
          createReadStream(file).pipe(res);
          return;
        }
      } catch {
        /* try the next base */
      }
    }
    res.writeHead(404).end('not found');
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = /** @type {import('node:net').AddressInfo} */ (server.address());
      resolve({
        origin: `http://127.0.0.1:${port}`,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

/**
 * @param {string} file
 * @param {string} detail
 */
function report(file, detail) {
  console.log(`  ${file.padEnd(24)} ${detail}`);
}

await main();
