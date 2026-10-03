// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { SCENES, TARGETS, FEATURE_GRAPHIC, capturableScenes } from './scenes.js';
import { answerKeys } from './answers.js';
import { pngInfo, exportProblems } from './png.js';
import { screenshotLayout, HEADLINE_SHARE, SAFE_SHARE } from './layout.js';
import { parseArgs, injectDriver, reportMarkdown, DRIVER_MARK } from './lib.js';
import { activePack } from '../../src/packs/index.js';

const PLAN = readFileSync(
  new URL('../../docs/store-metadata/store-screenshot-plan.md', import.meta.url),
  'utf8'
);
// Prettier wraps long lines, so compare prose with whitespace collapsed.
const FLAT = PLAN.replace(/\s+/g, ' ');

// A minimal valid PNG: signature, IHDR, optional extra chunks, IDAT, IEND.
// CRCs are not checked by pngInfo, so zeros keep the fixture readable.
function png({ width, height, colorType = 2, bitDepth = 8, extra = [] }) {
  const chunk = (type, data = Buffer.alloc(0)) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepth;
  ihdr[9] = colorType;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    ...extra.map((t) => chunk(t, Buffer.from([0, 0]))),
    chunk('IDAT', deflateSync(Buffer.alloc(4))),
    chunk('IEND'),
  ]);
}

describe('scenes', () => {
  it('follows the plan’s six-screen story: filenames, headlines and alt text', () => {
    expect(SCENES).toHaveLength(6);
    for (const s of SCENES) {
      expect(PLAN).toContain(s.file);
      expect(PLAN).toContain(`**${s.headline}**`);
      expect(FLAT).toContain(s.alt);
      expect(s.alt.length).toBeLessThanOrEqual(140); // Play's alt-text limit
    }
    expect(PLAN).toContain(FEATURE_GRAPHIC.file);
    expect(FLAT).toContain(FEATURE_GRAPHIC.alt);
  });

  it('skips only the league scene, and says why', () => {
    expect(SCENES.filter((s) => s.skip).map((s) => s.id)).toEqual(['stats']);
    expect(capturableScenes().map((s) => s.id)).toEqual([
      'chat',
      'translate',
      'vocab',
      'home',
      'alphabet',
    ]);
  });

  it('exports at the plan’s exact sizes', () => {
    const size = (t) => `${t.width} × ${t.height}`;
    expect([TARGETS.iphone, TARGETS.ipad, TARGETS.play, FEATURE_GRAPHIC].map(size)).toEqual([
      '1320 × 2868',
      '2064 × 2752',
      '1080 × 1920',
      '1024 × 500',
    ]);
    for (const t of [TARGETS.iphone, TARGETS.ipad, TARGETS.play]) expect(PLAN).toContain(size(t));
  });

  it('gives the chat scene a learner turn with a mistake to correct', () => {
    const chat = SCENES.find((s) => s.id === 'chat');
    expect(chat.message).toMatch(/\bein Kaffee\b/); // accusative: einen Kaffee
  });
});

describe('answerKeys', () => {
  const keys = answerKeys(activePack.content);

  it('maps every preset card’s German term to its English meaning', () => {
    for (const cards of Object.values(activePack.content.decks)) {
      for (const card of cards) expect(keys.vocab[card.de]).toBe(card.en);
    }
    expect(keys.vocab['Wie geht es dir?']).toBe('How are you?');
  });

  it('answers every translate prompt, with A2’s blanks in order', () => {
    expect(keys.translate['The red car is fast.']).toEqual(['rote']);
    const all = Object.values(activePack.content.translateSentences).flat();
    for (const row of all) expect(keys.translate[row.en]?.length).toBeGreaterThan(0);
  });

  it('ignores rows with nothing to answer', () => {
    expect(
      answerKeys({ decks: { d: [{ de: 'x' }] }, translateSentences: { A1: [{ en: 'e' }] } })
    ).toEqual({
      vocab: {},
      translate: {},
    });
  });
});

describe('png checks', () => {
  it('reads size, depth and colour type from the header', () => {
    expect(pngInfo(png({ width: 1320, height: 2868 }))).toEqual({
      width: 1320,
      height: 2868,
      bitDepth: 8,
      colorType: 2,
      hasAlpha: false,
    });
  });

  it('flags an alpha channel, including transparency via tRNS', () => {
    expect(pngInfo(png({ width: 1, height: 1, colorType: 6 })).hasAlpha).toBe(true);
    expect(pngInfo(png({ width: 1, height: 1, colorType: 4 })).hasAlpha).toBe(true);
    expect(pngInfo(png({ width: 1, height: 1, colorType: 2, extra: ['tRNS'] })).hasAlpha).toBe(
      true
    );
    expect(pngInfo(png({ width: 1, height: 1, colorType: 2, extra: ['pHYs'] })).hasAlpha).toBe(
      false
    );
  });

  it('passes an exact, opaque export and names each problem otherwise', () => {
    const want = { width: 1080, height: 1920 };
    expect(exportProblems(png(want), want)).toEqual([]);
    expect(exportProblems(png({ width: 1080, height: 2400, colorType: 6 }), want)).toEqual([
      'is 1080×2400, needs exactly 1080×1920',
      'has an alpha channel (the stores reject it)',
    ]);
    expect(exportProblems(png({ ...want, bitDepth: 16 }), want)).toEqual([
      'is 16-bit, Play wants 24-bit (8 per channel)',
    ]);
    expect(exportProblems(Buffer.from('nope'), want)).toEqual(['not a PNG']);
  });
});

describe('screenshotLayout', () => {
  const cases = [
    ['iPhone', TARGETS.iphone, { width: 1320, height: 2868 }],
    ['iPad', TARGETS.ipad, { width: 2064, height: 2752 }],
    ['Play', TARGETS.play, { width: 1080, height: 1920 }],
  ];

  it.each(cases)(
    '%s: keeps the headline band within 20%% and inside the safe margin',
    (_, canvas, raw) => {
      const { headline } = screenshotLayout(canvas, raw);
      expect(headline.y + headline.height).toBeLessThanOrEqual(canvas.height * 0.2);
      expect(HEADLINE_SHARE).toBeLessThanOrEqual(0.2);
      expect(headline.x).toBeGreaterThanOrEqual(canvas.width * SAFE_SHARE - 1);
    }
  );

  it.each(cases)('%s: scales the capture proportionally inside the safe area', (_, canvas, raw) => {
    const { capture, scale } = screenshotLayout(canvas, raw);
    expect(capture.width / capture.height).toBeCloseTo(raw.width / raw.height, 2);
    expect(scale).toBeLessThan(1);
    expect(capture.x).toBeGreaterThanOrEqual(Math.round(canvas.width * SAFE_SHARE));
    expect(capture.x + capture.width).toBeLessThanOrEqual(
      canvas.width - Math.round(canvas.width * SAFE_SHARE)
    );
    expect(capture.y + capture.height).toBeLessThanOrEqual(
      canvas.height - Math.round(canvas.height * SAFE_SHARE)
    );
    // Centred.
    expect(Math.abs(capture.x - (canvas.width - capture.x - capture.width))).toBeLessThanOrEqual(1);
  });
});

describe('parseArgs', () => {
  it('defaults to every target and scene', () => {
    expect(parseArgs([])).toEqual({
      targets: ['iphone', 'ipad', 'play'],
      scenes: null,
      skipBuild: false,
      out: 'store-screenshots',
    });
  });

  it('reads both flag styles', () => {
    expect(
      parseArgs(['--targets', 'iphone', '--scenes=home,vocab', '--skip-build', '--out', 'x'])
    ).toEqual({
      targets: ['iphone'],
      scenes: ['home', 'vocab'],
      skipBuild: true,
      out: 'x',
    });
  });

  it('refuses unknown flags and targets instead of silently shooting everything', () => {
    expect(() => parseArgs(['--target', 'iphone'])).toThrow('unknown flag --target');
    expect(() => parseArgs(['--targets', 'android'])).toThrow('unknown target android');
  });
});

describe('injectDriver', () => {
  const html = '<html><head></head><body><div id="root"></div></body></html>';

  it('adds one configured driver before </body>', () => {
    const out = injectDriver(html, 'run();', { host: 'http://127.0.0.1:1', device: 'ios' });
    expect(out).toContain(
      `<script ${DRIVER_MARK}>window.__SHOTS__ = {"host":"http://127.0.0.1:1","device":"ios"};\nrun();</script></body>`
    );
  });

  it('is idempotent: re-injecting replaces the old driver', () => {
    const once = injectDriver(html, 'one();', { device: 'ios' });
    const twice = injectDriver(once, 'two();', { device: 'android' });
    expect(twice.match(new RegExp(DRIVER_MARK, 'g'))).toHaveLength(1);
    expect(twice).toContain('two();');
    expect(twice).not.toContain('one();');
  });

  it('cannot be closed early by a </script> inside the source', () => {
    const out = injectDriver(html, 'const s = "</script>";', {});
    expect(out.match(/<\/script>/g)).toHaveLength(1);
  });

  it('refuses a bundle with no body to inject into', () => {
    expect(() => injectDriver('<html></html>', 'x', {})).toThrow('no </body>');
  });
});

describe('reportMarkdown', () => {
  const base = { scenes: SCENES, targets: TARGETS, graphic: FEATURE_GRAPHIC, notes: [] };

  it('lists every row, the Play alt text, and ticks size checks only when nothing failed', () => {
    const rows = [
      {
        target: 'iphone',
        file: '04-home-daily-progress.png',
        status: 'ok',
        detail: '1320×2868, no alpha',
      },
      { target: 'iphone', file: '05-stats-and-leagues.png', status: 'skipped', detail: 'league' },
    ];
    const md = reportMarkdown({ ...base, rows });
    expect(md).toContain('| App Store — iPhone 6.9" | `04-home-daily-progress.png` | ok |');
    expect(md).toContain(FEATURE_GRAPHIC.alt);
    expect(md).toMatch(/- \[x\] Exports are exactly/);

    const failed = reportMarkdown({
      ...base,
      rows: [...rows, { ...rows[0], status: 'failed', detail: 'is 1×1' }],
    });
    expect(failed).toMatch(/- \[ \] Exports are exactly/);
  });

  it('never ticks the boxes only the owner can confirm', () => {
    const md = reportMarkdown({
      ...base,
      rows: [{ target: 'iphone', file: 'a.png', status: 'ok', detail: '' }],
    });
    for (const line of md.split('\n').filter((l) => l.includes('**owner')))
      expect(line).toMatch(/^- \[ \]/);
  });

  it('carries notes such as a skipped platform', () => {
    expect(reportMarkdown({ ...base, rows: [], notes: ['Play skipped'] })).toContain(
      '> Play skipped'
    );
  });
});
