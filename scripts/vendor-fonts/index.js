// Vendors the active pack's fonts into public/fonts/ so the app serves its own
// typography. Run: `npm run vendor:fonts`
//
// Idempotent: re-running with an unchanged pack rewrites identical bytes.
// The written manifest records the resolved upstream URL, sha256 and size of
// every file, so a later re-run that produces different bytes is visible in the
// diff rather than silent.

import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { activePack } from '../../src/packs/index.js';
import { buildGoogleFontsUrl } from './googleFontsUrl.js';
// One definition, shared with the runtime that reads these directories.
import { familySlug } from '../../src/lib/injectFonts.js';
import { parseFaces, renderFaceCss, localFileName } from './css.js';
import { ipaText } from './ipaText.js';
import { woff2Codepoints } from './woff2Cmap.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const OUT = join(ROOT, 'public', 'fonts');

// css2 content-negotiates on User-Agent: the default Node UA is served TTF,
// with a 200 and no hint that anything is wrong. Ask as a current browser.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Self-hosting makes us the redistributor, and OFL 1.1 permits that only if the
// licence travels with the files. Keyed by family so a pack that adds a face
// cannot quietly skip it — an unlisted family is a hard failure below.
const LICENSES = {
  Fraunces: 'https://raw.githubusercontent.com/undercasetype/Fraunces/master/OFL.txt',
  'JetBrains Mono': 'https://raw.githubusercontent.com/JetBrains/JetBrainsMono/master/OFL.txt',
  'Plus Jakarta Sans': 'https://raw.githubusercontent.com/tokotype/PlusJakartaSans/master/OFL.txt',
  'Noto Sans Mono': 'https://raw.githubusercontent.com/notofonts/latin-greek-cyrillic/main/OFL.txt',
};

// Families declared with `text` are fetched as an exact-characters subset
// instead of Google's named subsets. Each source names the content it covers.
const TEXT_SOURCES = {
  // Every character under an `ipa` key in the pack and in its lexicon.
  ipa: (pack) => {
    const dir = join(ROOT, 'public', 'lexicon', pack.meta.id);
    const chunks = existsSync(dir)
      ? readdirSync(dir)
          .filter((f) => /^chunk-\d+\.json$/.test(f))
          .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')))
      : [];
    return ipaText(pack.content, chunks);
  },
};

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`fetch failed ${res.status}: ${url}`);
  return res.text();
}

async function fetchBytes(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`fetch failed ${res.status}: ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function vendorFonts({ out = OUT, pack = activePack, log = console.log } = {}) {
  const { families } = pack.theme.font;
  if (!Array.isArray(families) || families.length === 0) {
    throw new Error('pack declares no font families');
  }
  for (const f of families) {
    if (f.text) {
      if (!TEXT_SOURCES[f.text]) throw new Error(`${f.name}: unknown text source "${f.text}"`);
    } else if (!Array.isArray(f.subsets) || f.subsets.length === 0) {
      throw new Error(`${f.name} declares no subsets — refusing to guess`);
    }
  }

  const missing = families.map((f) => f.name).filter((n) => !LICENSES[n]);
  if (missing.length) {
    throw new Error(`no licence source recorded for: ${missing.join(', ')}. Add it to LICENSES.`);
  }

  const named = families.filter((f) => !f.text);
  const url = buildGoogleFontsUrl(named);
  log(`css2  ${url}`);
  const css = await fetchText(url);
  if (!css.includes('woff2')) {
    throw new Error('css2 returned no woff2 — the User-Agent was not accepted');
  }

  const all = parseFaces(css);
  // `text` applies to every family in a css2 request, so each exact-characters
  // family gets its own.
  const wantedText = {};
  for (const family of families.filter((f) => f.text)) {
    const text = TEXT_SOURCES[family.text](pack);
    if (!text) throw new Error(`${family.name}: text source "${family.text}" is empty`);
    wantedText[family.name] = text;
    const textUrl = buildGoogleFontsUrl([family], { text });
    log(`css2  ${family.name}: ${[...text].length} characters (${family.text})`);
    all.push(...parseFaces(await fetchText(textUrl), { subset: family.text }));
  }
  const wanted = all.filter((f) => {
    const d = families.find((x) => x.name === f.family);
    return d?.text ? f.subset === d.text : (d?.subsets ?? []).includes(f.subset);
  });
  if (wanted.length === 0) throw new Error('no faces matched the declared subsets');
  log(`faces ${all.length} returned, ${wanted.length} kept`);

  // Everything is fetched before anything is written. css2 is served with
  // stale-while-revalidate=604800, so an intermediary can hand back week-old
  // CSS whose file URLs Google has already purged — one of these downloads
  // really did 404 mid-run during development. Deleting the tree first left
  // public/fonts holding one family and no fonts at all for the other, which a
  // build would have happily shipped.
  const staged = [];
  for (const family of families) {
    const slug = familySlug(family.name);
    const faces = wanted
      .filter((f) => f.family === family.name)
      .map((f) => ({ ...f, localName: localFileName(f, slug) }));
    if (faces.length === 0) throw new Error(`css2 returned no faces for ${family.name}`);

    const files = [];
    for (const face of faces) {
      const bytes = await fetchBytes(face.url);
      // Google returns a file for any request, quietly leaving out characters
      // the font lacks. Refuse it rather than ship boxes.
      if (family.text) {
        const have = woff2Codepoints(bytes);
        const lacking = [...wantedText[family.name]].filter((ch) => !have.has(ch.codePointAt(0)));
        if (lacking.length) {
          throw new Error(
            `${family.name} lacks ${lacking.length} requested glyphs: ${lacking.join(' ')}`
          );
        }
      }
      files.push({
        localName: face.localName,
        bytes,
        meta: {
          file: face.localName,
          subset: face.subset,
          weight: face.weight,
          style: face.style,
          from: face.url,
          bytes: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        },
      });
    }
    staged.push({
      family,
      slug,
      files,
      faceCss: renderFaceCss(faces, `/fonts/${slug}`),
      license: await fetchText(LICENSES[family.name]),
    });
  }

  // Rebuilt from scratch so a family or subset dropped from the pack cannot
  // leave an orphan file behind that the precache would still ship.
  if (existsSync(out)) rmSync(out, { recursive: true });
  mkdirSync(out, { recursive: true });

  const manifest = { generatedFrom: url, families: {} };
  let total = 0;

  for (const { family, slug, files, faceCss, license } of staged) {
    const dir = join(out, slug);
    mkdirSync(dir, { recursive: true });

    for (const f of files) {
      writeFileSync(join(dir, f.localName), f.bytes);
      total += f.bytes.length;
    }
    writeFileSync(join(dir, 'face.css'), faceCss);
    writeFileSync(join(dir, 'OFL.txt'), license);

    // The subsets Google offered and we chose not to ship. Recorded with their
    // ranges so fontCoverage.test.js can tell "this glyph was never on offer"
    // (emoji, mathematical alphanumerics — no text font has them) apart from
    // "this glyph was on offer and we dropped it", which is a real regression.
    // An exact-characters family skips nothing: it asked for what it needs.
    const skipped = family.text
      ? []
      : all
          .filter((f) => f.family === family.name && !family.subsets.includes(f.subset))
          .map((f) => ({ subset: f.subset, unicodeRange: f.unicodeRange }));

    manifest.families[family.name] = {
      slug,
      axes: family.axes ?? null,
      subsets: family.subsets ?? null,
      ...(family.text ? { text: family.text, characters: wantedText[family.name] } : {}),
      files: files.map((f) => f.meta),
      skipped,
    };
    const kb = (files.reduce((a, f) => a + f.bytes.length, 0) / 1024).toFixed(1);
    log(`  ${family.name.padEnd(16)} ${String(files.length).padStart(2)} files  ${kb} KB`);
  }

  manifest.totalBytes = total;
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  log(`total ${(total / 1024).toFixed(1)} KB into ${out}`);
  return manifest;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  vendorFonts().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
