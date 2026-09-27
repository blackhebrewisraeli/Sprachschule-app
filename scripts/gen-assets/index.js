#!/usr/bin/env node
/**
 * Regenerates every brand bitmap from one source of geometry: the web set in
 * public/, and the launcher icons and launch screens in the iOS and Android
 * projects (listed in native.js).
 *
 *   npm run gen:assets
 *
 * Replaces scripts/gen-icons.js, which could not actually be run: it imported
 * `sharp`, which its own header admitted was not installed, and it rasterised
 * the font-dependent <text> described in mark.js. Playwright is already a
 * devDependency and already the engine behind `audit:contrast` and
 * `audit:layout`, so this adds no dependency at all.
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

import {
  adaptiveSafeRadius,
  iconSvg,
  maskableClearance,
  maskableSafeRadius,
  needsAlpha,
  splashSvg,
} from './mark.js';
import { ANDROID_COLORS, NATIVE_ICONS, NATIVE_SPLASHES, colorResourceXml } from './native.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const publicDir = join(root, 'public');

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
  for (const icon of NATIVE_ICONS.filter((i) => i.adaptive)) {
    const clearance = maskableClearance(icon);
    const safe = adaptiveSafeRadius(icon.size);
    if (clearance > safe) {
      throw new Error(
        `${icon.file}: mark half-diagonal ${clearance.toFixed(1)} exceeds the ` +
          `adaptive-icon safe radius ${safe.toFixed(1)} (66dp of 108dp). Reduce markHeight.`
      );
    }
  }

  await mkdir(publicDir, { recursive: true });

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

    for (const spec of NATIVE_ICONS) {
      const out = join(root, spec.file);
      await mkdir(dirname(out), { recursive: true });
      await rasteriseSvg(browser, iconSvg(spec), spec.size, spec.size, out, {
        transparent: needsAlpha(spec),
      });
      report(spec.file, `${spec.size}x${spec.size}`);
    }

    for (const spec of NATIVE_SPLASHES) {
      const out = join(root, spec.file);
      await mkdir(dirname(out), { recursive: true });
      await rasteriseSvg(browser, splashSvg(spec), spec.width, spec.height, out);
      report(spec.file, `${spec.width}x${spec.height}`);
    }

    for (const color of ANDROID_COLORS) {
      await writeFile(join(root, color.file), colorResourceXml(color), 'utf8');
      report(color.file, color.value);
    }
  } finally {
    await browser.close();
    await server.close();
  }
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
