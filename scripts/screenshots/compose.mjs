// Composites raw native captures into store canvases, and draws the Play
// feature graphic. Rendering goes through Chromium so the headline uses the
// app's own vendored Fraunces, not whatever the machine has installed.
//
// The capture is placed whole and scaled proportionally (layout.js); nothing
// is drawn over it. Light theme palette, read from the shipped bundle's
// tokens (--c-ground, --c-fg, --c-error, --c-accent, --c-border).

import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { screenshotLayout } from './layout.js';

const PALETTE = {
  ground: '#FBF8F1',
  surface: '#FFFFFF',
  ink: '#16110b',
  muted: '#5C5142',
  red: '#C41E1E',
  accent: '#FFCE00',
  border: '#E2DDD2',
};

const fontFaces = (repoRoot) => {
  const f = (p) => pathToFileURL(resolve(repoRoot, 'public/fonts', p)).href;
  return `
    @font-face { font-family: 'Fraunces'; font-weight: 300 900; src: url('${f('fraunces/fraunces-latin-normal-300-900.woff2')}') format('woff2'); }
    @font-face { font-family: 'JetBrains Mono'; font-weight: 400 700; src: url('${f('jetbrains-mono/jetbrains-mono-latin-normal-400-700.woff2')}') format('woff2'); }
    @font-face { font-family: 'Plus Jakarta Sans'; font-weight: 400 700; src: url('${f('plus-jakarta-sans/plus-jakarta-sans-latin-normal-400-700.woff2')}') format('woff2'); }`;
};

const escapeHtml = (s) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

async function render(page, { html, width, height, workDir, out }) {
  const file = join(workDir, 'compose.html');
  writeFileSync(file, html);
  await page.setViewportSize({ width, height });
  await page.goto(pathToFileURL(file).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: out, type: 'png' });
}

/**
 * @param {import('playwright').Page} page
 * @param {{ repoRoot: string, workDir: string, raw: string, rawSize: { width: number, height: number },
 *           canvas: { width: number, height: number }, headline: string, out: string }} o
 */
export async function composeScreenshot(page, o) {
  const { headline: band, capture } = screenshotLayout(o.canvas, o.rawSize);
  const radius = Math.round(capture.width * 0.045);
  const fontSize = Math.round(
    o.canvas.width * (o.canvas.width > o.canvas.height * 0.6 ? 0.052 : 0.074)
  );
  const html = `<!doctype html><meta charset="utf-8"><style>
    ${fontFaces(o.repoRoot)}
    html, body { margin: 0; width: ${o.canvas.width}px; height: ${o.canvas.height}px; background: ${PALETTE.ground}; overflow: hidden; }
    .band { position: absolute; left: ${band.x}px; top: ${band.y}px; width: ${band.width}px; height: ${band.height}px;
            display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
    h1 { margin: 0; font: 700 ${fontSize}px/1.08 'Fraunces', serif; color: ${PALETTE.ink}; letter-spacing: -0.01em; }
    h1::after { content: '.'; color: ${PALETTE.red}; }
    img { position: absolute; left: ${capture.x}px; top: ${capture.y}px; width: ${capture.width}px; height: ${capture.height}px;
          border-radius: ${radius}px; border: ${Math.max(2, Math.round(o.canvas.width / 660))}px solid ${PALETTE.border};
          box-shadow: 0 ${Math.round(radius / 2)}px ${radius * 2}px rgba(22, 17, 11, 0.14); box-sizing: border-box; }
  </style>
  <div class="band"><h1>${escapeHtml(o.headline)}</h1></div>
  <img src="${pathToFileURL(o.raw).href}" alt="">`;
  await render(page, {
    html,
    width: o.canvas.width,
    height: o.canvas.height,
    workDir: o.workDir,
    out: o.out,
  });
}

/**
 * The Play feature graphic: a text-light brand composition, focal point and
 * headline near the centre so Google's edge crops lose only decoration.
 */
export async function composeFeatureGraphic(page, { repoRoot, workDir, graphic, out }) {
  const html = `<!doctype html><meta charset="utf-8"><style>
    ${fontFaces(repoRoot)}
    html, body { margin: 0; width: ${graphic.width}px; height: ${graphic.height}px; overflow: hidden; background: ${PALETTE.ground}; }
    .wrap { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 56px; }
    .edge { position: absolute; left: 0; right: 0; height: 22px; background: ${PALETTE.ink}; }
    .edge.top { top: 0; } .edge.bottom { bottom: 0; }
    .title { font: 800 64px/0.98 'Fraunces', serif; color: ${PALETTE.ink}; letter-spacing: -0.015em; width: 400px; }
    .title b { color: ${PALETTE.red}; font-weight: 800; }
    .stack { position: relative; width: 330px; height: 250px; }
    .card { position: absolute; left: 0; top: 18px; width: 290px; padding: 22px 24px; background: ${PALETTE.surface};
            border: 2px solid ${PALETTE.border}; border-radius: 22px; box-shadow: 0 10px 30px rgba(22,17,11,.12); }
    .de { font: 700 36px/1.1 'Fraunces', serif; color: ${PALETTE.ink}; }
    .ipa { margin-top: 8px; font: 500 15px 'JetBrains Mono', monospace; color: ${PALETTE.muted}; }
    .en { margin-top: 14px; font: 600 18px 'Plus Jakarta Sans', sans-serif; color: ${PALETTE.ink}; }
    .bubble { position: absolute; right: 0; bottom: 6px; padding: 14px 20px; background: ${PALETTE.accent}; border-radius: 22px 22px 6px 22px;
              font: 600 20px 'Plus Jakarta Sans', sans-serif; color: ${PALETTE.ink}; box-shadow: 0 8px 22px rgba(22,17,11,.14); }
  </style>
  <div class="edge top"></div><div class="edge bottom"></div>
  <div class="wrap">
    <div class="title">${escapeHtml(graphic.headline).replace(/USE$/, '<b>USE.</b>')}</div>
    <div class="stack">
      <div class="card"><div class="de">Wie geht es dir?</div><div class="ipa">[viː ɡeːt ɛs diːɐ̯]</div><div class="en">How are you?</div></div>
      <div class="bubble">Einen Kaffee, bitte!</div>
    </div>
  </div>`;
  await render(page, { html, width: graphic.width, height: graphic.height, workDir, out });
}
