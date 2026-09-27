import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import {
  MARK,
  CUTS,
  BRAND,
  adaptiveSafeRadius,
  iconSvg,
  maskableClearance,
  maskableSafeRadius,
  needsAlpha,
} from '../scripts/gen-assets/mark.js';
import { GLYPHS } from '../scripts/gen-assets/glyphs.js';
import {
  ADAPTIVE_SOURCE,
  MOBILE_COLORS,
  MOBILE_SOURCES,
  NATIVE_ICONS,
  NATIVE_SPLASHES,
} from '../scripts/gen-assets/native.js';

/**
 * The brand assets are the one part of the app no other test can see: they are
 * bytes in public/ and attributes in two config files, and every failure mode
 * below leaves a build that is green, deployable and wrong.
 *
 * Scope is deliberate. Nothing here hashes a PNG — that is a test which fails
 * on a Chromium upgrade and tells you nothing — and nothing here judges whether
 * the artwork is any good. A human looked at it at 16px; these assert the
 * invariants a human cannot re-check on every commit.
 */

const html = readFileSync('index.html', 'utf8');
const viteConfig = readFileSync('vite.config.js', 'utf8');

/** AGENTS.md → "Linked environments". index.html duplicates it; this is the pin. */
const ORIGIN = 'https://deutsch-app-dusky.vercel.app';

/** Every SVG the app ships as artwork. `google-g.svg` is a third-party logo. */
const OWN_SVGS = ['public/favicon.svg', 'public/icon-base.svg'];

/**
 * @param {string} attr `property` for Open Graph, `name` for Twitter
 * @param {string} key
 */
function meta(attr, key) {
  const m = html.match(new RegExp(`<meta[^>]*\\b${attr}="${key}"[^>]*>`, 's'));
  if (!m) return null;
  const c = m[0].match(/content="([^"]*)"/s);
  return c ? c[1] : null;
}

/** PNG width/height straight out of the IHDR chunk — bytes 16..24. */
function pngSize(file) {
  const buf = readFileSync(file);
  expect(buf.subarray(1, 4).toString('ascii')).toBe('PNG');
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** PNG colour type, IHDR byte 25: 2 = RGB, 6 = RGBA. */
function pngColorType(file) {
  return readFileSync(file)[25];
}

describe('icon sources carry no font dependency', () => {
  // The whole reason this mission existed. Both SVGs used to draw the D with
  // <text font-family="Georgia, 'Times New Roman', serif">, neither of which is
  // vendored — so the letterform was whatever serif the rasterising machine
  // had, and the committed pwa-512.png is a Times D that appears nowhere in the
  // app's type system. A <text> icon looks right on the machine that made it
  // and wrong everywhere else, which is exactly the class of bug a test exists
  // to catch and an eyeball cannot.
  for (const file of OWN_SVGS) {
    it(`${file} has no <text> element`, () => {
      expect(existsSync(file)).toBe(true);
      expect(readFileSync(file, 'utf8')).not.toMatch(/<text[\s>]/i);
    });

    it(`${file} names no font family`, () => {
      expect(readFileSync(file, 'utf8')).not.toMatch(/font-family/i);
    });
  }

  it('the generator itself cannot emit text or a font', () => {
    // Guards the source of every raster too, not just the two committed SVGs.
    const svg = iconSvg({ size: 512, radius: 96, markHeight: 256 });
    expect(svg).not.toMatch(/<text[\s>]/i);
    expect(svg).not.toMatch(/font-family/i);
  });
});

describe('the mark is Fraunces, baked to outlines', () => {
  // glyphs.js is extract-glyphs.py's output, and nothing re-runs that script:
  // it is Python, and CI never needs it. So if the vendored font changes, the
  // icons would quietly keep the old letterform. This is the tripwire.
  it('was extracted from the font file the app vendors today', () => {
    const font = readFileSync(GLYPHS.source.file);
    expect(createHash('sha256').update(font).digest('hex')).toBe(GLYPHS.source.sha256);
  });

  it('is the display face AGENTS.md names for the brand', () => {
    expect(GLYPHS.source.file).toMatch(/^public\/fonts\/fraunces\//);
    expect(GLYPHS.source.text).toBe('D.');
  });

  it('each optical cut is normalised onto the box mark.js draws in', () => {
    for (const [cut, g] of Object.entries(CUTS)) {
      expect(g.height, cut).toBe(100);
      expect(g.width, cut).toBeGreaterThan(g.height);
      expect(g.letter, cut).toMatch(/^M[\d. ]+/);
      expect(g.period, cut).toMatch(/^M[\d. ]+/);
    }
  });

  it('the committed SVGs were drawn from the current outlines, in their cut', () => {
    // The favicon is the one asset in the small cut; the canonical mark is display.
    expect(readFileSync('public/favicon.svg', 'utf8')).toContain(CUTS.small.letter);
    expect(readFileSync('public/icon-base.svg', 'utf8')).toContain(CUTS.display.letter);
  });
});

describe('only artwork with uncovered canvas carries alpha', () => {
  // Opaque is the default because App Store Connect rejects an iOS icon with an
  // alpha channel. But an opaque PNG paints a rounded plane's corners white, so
  // a launcher or tab strip shows a white square behind the icon.
  it('decides from the plane', () => {
    expect(needsAlpha({ radius: 0 })).toBe(false);
    expect(needsAlpha({ radius: 36 })).toBe(true);
    expect(needsAlpha({ radius: 0, plane: false })).toBe(true);
  });

  it('every native icon matches its decision', () => {
    for (const icon of NATIVE_ICONS) {
      expect(pngColorType(icon.file), icon.file).toBe(icon.colorType ?? (needsAlpha(icon) ? 6 : 2));
    }
  });

  it.each([
    ['public/pwa-192.png', 6],
    ['public/pwa-512.png', 6],
    ['public/favicon-32.png', 6],
    // Full-bleed: iOS and the maskable crop both apply their own mask.
    ['public/apple-touch-icon.png', 2],
    ['public/pwa-maskable-512.png', 2],
  ])('%s', (file, type) => {
    expect(pngColorType(file)).toBe(type);
  });
});

describe('the mark is coloured from mode-independent tokens', () => {
  it('uses no retired literal', () => {
    // #16110b (light `fg` used as a plane), #FDF3C0 (the retired parchment
    // ground) and #D62828 (the pre-theme-arc red) are what the old artwork
    // carried. None is reachable as a current token.
    for (const dead of ['#16110b', '#FDF3C0', '#D62828']) {
      for (const value of Object.values(BRAND)) {
        expect(value.toLowerCase()).not.toBe(dead.toLowerCase());
      }
    }
  });

  it('resolves all three roles', () => {
    for (const [role, value] of Object.entries(BRAND)) {
      expect(value, role).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

describe('the maskable icon clears the 80% safe circle', () => {
  // Android may crop a `maskable` icon to the central circle at 80% of the
  // canvas. The shipped geometry must fit inside it — asserted from the
  // generator's own numbers rather than by parsing the PNG, so the arithmetic
  // that produced the file is the arithmetic under test.
  const size = 512;
  const markHeight = 240;

  it('the shipped mark height fits', () => {
    expect(maskableClearance({ markHeight })).toBeLessThanOrEqual(maskableSafeRadius(size));
  });

  it('a mark large enough to be cropped does not', () => {
    // The negative control. Without it, a clearance function that returned 0
    // for every input would pass the assertion above.
    expect(maskableClearance({ markHeight: MARK.height * 5 })).toBeGreaterThan(
      maskableSafeRadius(size)
    );
  });
});

describe('the PWA manifest declares a real maskable icon', () => {
  /** @returns {{src: string, purpose: string}[]} */
  function manifestIcons() {
    const block = viteConfig.match(/icons:\s*\[([\s\S]*?)\n\s{8}\],/);
    expect(block, 'vite.config.js has no manifest icons array').toBeTruthy();
    return [...block[1].matchAll(/\{([\s\S]*?)\}/g)].map((m) => ({
      src: (m[1].match(/src:\s*'([^']+)'/) || [])[1],
      purpose: (m[1].match(/purpose:\s*'([^']+)'/) || [])[1],
    }));
  }

  it('lists a maskable entry', () => {
    expect(manifestIcons().some((i) => i.purpose === 'maskable')).toBe(true);
  });

  it('does not reuse one bitmap for both purposes', () => {
    // This is the defect as it shipped: pwa-512.png was declared twice, once
    // bare and once `maskable`. Declaring it is not the same as drawing it.
    const icons = manifestIcons();
    const maskable = icons.filter((i) => i.purpose === 'maskable').map((i) => i.src);
    const any = icons.filter((i) => i.purpose !== 'maskable').map((i) => i.src);
    for (const src of maskable) expect(any).not.toContain(src);
  });

  it('every declared icon exists in public/', () => {
    const icons = manifestIcons();
    expect(icons.length).toBeGreaterThan(0);
    for (const { src } of icons) expect(existsSync(join('public', src)), src).toBe(true);
  });
});

describe('index.html links assets that exist', () => {
  it('every local icon href resolves', () => {
    const hrefs = [...html.matchAll(/<link[^>]*\brel="(?:icon|apple-touch-icon)"[^>]*>/g)]
      .map((m) => (m[0].match(/href="([^"]+)"/) || [])[1])
      .filter(Boolean);
    // Guards the denominator: an empty match set would pass the loop silently.
    expect(hrefs.length).toBeGreaterThanOrEqual(3);
    for (const href of hrefs) {
      expect(href.startsWith('/'), href).toBe(true);
      expect(existsSync(join('public', href.slice(1))), href).toBe(true);
    }
  });

  it('links the PNG favicon fallback', () => {
    // It sat in public/ unreferenced, so a browser without SVG-favicon support
    // fell through to a /favicon.ico that has never existed.
    expect(html).toMatch(/<link[^>]*rel="icon"[^>]*href="\/favicon-32\.png"/);
  });
});

describe('sharing metadata', () => {
  it('declares the Open Graph set', () => {
    for (const key of ['og:type', 'og:title', 'og:description', 'og:url', 'og:image']) {
      expect(meta('property', key), key).toBeTruthy();
    }
  });

  it('declares a large-image Twitter card', () => {
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
    expect(meta('name', 'twitter:image')).toBeTruthy();
    expect(meta('name', 'twitter:description')).toBeTruthy();
  });

  it('gives both images absolute URLs on the canonical origin', () => {
    // A root-relative og:image is silently dropped by every crawler, which
    // looks exactly like having no card at all.
    for (const [attr, key] of [
      ['property', 'og:image'],
      ['name', 'twitter:image'],
      ['property', 'og:url'],
    ]) {
      expect(meta(attr, key), key).toMatch(new RegExp(`^${ORIGIN}/`));
    }
  });

  it('points og:image at a file the build ships', () => {
    const url = meta('property', 'og:image');
    expect(existsSync(join('public', url.slice(ORIGIN.length + 1)))).toBe(true);
  });

  it('declares the image dimensions the PNG actually has', () => {
    // A stale pair makes crawlers reserve the wrong box and letterbox the card.
    const url = meta('property', 'og:image');
    const { width, height } = pngSize(join('public', url.slice(ORIGIN.length + 1)));
    expect(Number(meta('property', 'og:image:width'))).toBe(width);
    expect(Number(meta('property', 'og:image:height'))).toBe(height);
  });

  it('uses the 1.91:1 Open Graph aspect', () => {
    const { width, height } = pngSize('public/social-preview.png');
    expect(width / height).toBeCloseTo(1.91, 1);
  });

  it('describes the image for screen readers', () => {
    expect(meta('property', 'og:image:alt')).toBeTruthy();
    expect(meta('name', 'twitter:image:alt')).toBeTruthy();
  });
});

describe('the social card fetches nothing at generation time', () => {
  it('references no remote font or image', () => {
    // The card this replaced @import-ed Google Fonts. The app vendored all
    // three families in #103 precisely to stop depending on that CDN.
    const card = readFileSync('scripts/gen-assets/social-preview.html', 'utf8');
    expect(card).not.toMatch(/https?:\/\/(?!127\.0\.0\.1)/);
    expect(card).not.toMatch(/@import/);
  });

  it('sets each of the three vendored families in its AGENTS.md role', () => {
    const card = readFileSync('scripts/gen-assets/social-preview.html', 'utf8');
    for (const family of ['Fraunces', 'Plus Jakarta Sans', 'JetBrains Mono']) {
      expect(card, family).toContain(`'${family}'`);
    }
    // Prose moved to the sans on 2026-09-01; the old card still set its tagline
    // in Fraunces italic, which is display-only now.
    expect(card).not.toMatch(/font-style:\s*italic/);
  });
});

describe('the native icons and launch screens', () => {
  // `npx cap add` seeds both projects with Capacitor's own logo, and nothing
  // in the web build or CI looks at them — a store build would have shipped it.
  // Canonical PNGs are drawn from the Fraunces outlines, then @capacitor/assets
  // injects every platform resolution. These check the invariants a store
  // upload or launcher enforces.

  it('keeps every canonical source at the package minimum with intentional alpha', () => {
    for (const { file, width, height, colorType } of MOBILE_SOURCES) {
      expect(pngSize(file), file).toEqual({ width, height });
      expect(pngColorType(file), file).toBe(colorType);
    }
  });

  it('every generated icon exists at the size the generator drew', () => {
    expect(NATIVE_ICONS.length).toBeGreaterThan(0);
    for (const { file, size } of NATIVE_ICONS) {
      expect(pngSize(file), file).toEqual({ width: size, height: size });
    }
  });

  it('every generated launch screen exists at the size the generator drew', () => {
    expect(NATIVE_SPLASHES.length).toBeGreaterThan(0);
    for (const { file, width, height } of NATIVE_SPLASHES) {
      expect(pngSize(file), file).toEqual({ width, height });
    }
  });

  it('the iOS marketing icon carries no alpha channel', () => {
    // App Store Connect rejects the upload otherwise ("can't be transparent or
    // contain an alpha channel"), and nothing short of an archive-and-upload
    // would surface it.
    const [ios] = NATIVE_ICONS.filter((i) => i.file.startsWith('ios/'));
    expect(ios.size).toBe(1024);
    expect(pngColorType(ios.file)).toBe(2);
  });

  it('the iOS asset catalog points at the generated files', () => {
    const icons = JSON.parse(
      readFileSync('ios/App/App/Assets.xcassets/AppIcon.appiconset/Contents.json', 'utf8')
    ).images.map((i) => i.filename);
    const splashes = JSON.parse(
      readFileSync('ios/App/App/Assets.xcassets/Splash.imageset/Contents.json', 'utf8')
    ).images.map((i) => i.filename);
    const generated = (dir) =>
      [...NATIVE_ICONS, ...NATIVE_SPLASHES]
        .filter((s) => s.file.includes(`/${dir}/`))
        .map((s) => s.file.split('/').pop());
    expect(icons.sort()).toEqual(generated('AppIcon.appiconset').sort());
    expect(splashes.sort()).toEqual(generated('Splash.imageset').sort());
  });

  it('the adaptive foreground clears the 66dp safe circle after the package inset', () => {
    expect(NATIVE_ICONS.filter((i) => i.adaptive)).toHaveLength(6);
    const visibleScale = 1 - ADAPTIVE_SOURCE.generatorInset * 2;
    const effectiveMarkHeight =
      (ADAPTIVE_SOURCE.markHeight / ADAPTIVE_SOURCE.size) *
      ADAPTIVE_SOURCE.androidLayerSize *
      visibleScale;
    expect(maskableClearance({ markHeight: effectiveMarkHeight })).toBeLessThanOrEqual(
      adaptiveSafeRadius(ADAPTIVE_SOURCE.androidLayerSize)
    );
  });

  it('the maskable proportion would NOT clear it', () => {
    // The negative control, and the reason the adaptive layer is sized on its
    // own: Android's 66/108 circle is tighter than the web's 80% one, so the
    // PWA maskable geometry reused here would be cropped.
    const size = 432;
    expect(maskableClearance({ markHeight: (size * 240) / 512 })).toBeGreaterThan(
      adaptiveSafeRadius(size)
    );
  });

  it('uses the mode-independent monochrome pair', () => {
    expect(MOBILE_COLORS).toEqual({
      light: BRAND.ink,
      dark: BRAND.plane,
      android12Splash: BRAND.ink,
    });
  });

  it('the adaptive icon and the API 31+ launch theme use the generated resources', () => {
    const res = 'android/app/src/main/res';
    for (const shape of ['ic_launcher', 'ic_launcher_round']) {
      const xml = readFileSync(`${res}/mipmap-anydpi-v26/${shape}.xml`, 'utf8');
      expect(xml, shape).toMatch(
        /<inset android:drawable="@mipmap\/ic_launcher_background" android:inset="16\.7%"\s*\/>/
      );
      expect(xml, shape).toMatch(
        /<inset android:drawable="@mipmap\/ic_launcher_foreground" android:inset="16\.7%"\s*\/>/
      );
    }
    expect(readFileSync(`${res}/values/splash_background.xml`, 'utf8')).toContain(
      MOBILE_COLORS.android12Splash.toUpperCase()
    );
    expect(readFileSync(`${res}/values-night/splash_background.xml`, 'utf8')).toContain(
      MOBILE_COLORS.dark.toUpperCase()
    );
    expect(readFileSync(`${res}/values/styles.xml`, 'utf8')).toMatch(
      /<item name="windowSplashScreenBackground">@color\/splash_background<\/item>/
    );
  });

  it('regenerates native resolutions through @capacitor/assets', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.devDependencies['@capacitor/assets']).toBeTruthy();
    expect(pkg.scripts['gen:assets']).toContain('capacitor-assets generate --ios --android');
  });
});
