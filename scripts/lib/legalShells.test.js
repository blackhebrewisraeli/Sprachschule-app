import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LEGAL_SHELLS, renderLegalShell } from './legalShells.js';
import { LEGAL_ROUTES } from '../../src/lib/legalRoute.js';

const index = readFileSync('index.html', 'utf8');
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8'));
const deletePage = readFileSync('src/components/legal/DeleteAccountPage.jsx', 'utf8');

describe('legal route shells', () => {
  it('cover exactly the routes the app serves', () => {
    expect(Object.keys(LEGAL_SHELLS).sort()).toEqual(Object.values(LEGAL_ROUTES).sort());
    for (const [route, shell] of Object.entries(LEGAL_SHELLS)) {
      expect(LEGAL_ROUTES[shell.path]).toBe(route);
    }
  });

  it('are what vercel.json serves for each path, not the generic shell', () => {
    for (const [route, shell] of Object.entries(LEGAL_SHELLS)) {
      const rewrite = vercel.rewrites.find((r) => r.source === shell.path);
      expect(rewrite?.destination).toBe(`/${route}.html`);
    }
  });

  it.each(Object.keys(LEGAL_SHELLS))('%s: own title, canonical and sharing metadata', (route) => {
    const shell = LEGAL_SHELLS[route];
    const html = renderLegalShell(index, route);
    const url = `https://www.sprachschule-app.com${shell.path}`;
    expect(html).toContain(`<title>${shell.title}</title>`);
    expect(html).toContain(`<link rel="canonical" href="${url}"`);
    expect(html).toContain(`property="og:url" content="${url}"`);
    expect(html).toContain(`property="og:title" content="${shell.title}"`);
    expect(html).not.toContain('<title>sprachschule-app</title>');
    // Still the same app: bundle, root and the rest of the head untouched.
    expect(html).toContain('<div id="root">');
    expect(html).toContain('social-preview.png');
  });

  it('puts the noscript statement in the served HTML, before the root', () => {
    const html = renderLegalShell(index, 'delete-account');
    expect(html.indexOf('<noscript>')).toBeLessThan(html.indexOf('<div id="root">'));
    expect(html).toContain('Shimon Esterkin');
    expect(html).toContain('Account Deletion Request - Deutsch Sprachschule');
    expect(html).toContain('within 30 days');
  });

  // The deletion shell repeats facts from the approved page. Each must still
  // be in that page, so editing the page without the shell fails here.
  it('deletion facts match DeleteAccountPage.jsx', () => {
    const facts = [
      'Shimon Esterkin',
      'sprachschule.support@gmail.com',
      'Account Deletion Request - Deutsch Sprachschule',
      'Profile → Settings → Account controls',
      'Delete account',
      'within 30 days',
      'Delete your Deutsch Sprachschule account',
      'include your private relay address',
      '@privaterelay.appleid.com',
    ];
    const shellText = LEGAL_SHELLS['delete-account'].noscript.join(' ');
    for (const fact of facts) {
      expect(deletePage).toContain(fact);
      expect(shellText).toContain(fact);
    }
  });

  it('escapes text and fails loudly when index.html changes shape', () => {
    expect(() => renderLegalShell('<html></html>', 'privacy')).toThrow(/no <title>/);
    expect(() => renderLegalShell(index, 'nope')).toThrow(/unknown route/);
  });
});
