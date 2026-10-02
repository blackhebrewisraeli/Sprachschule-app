import { describe, it, expect, vi, afterEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { apiUrl } from './apiUrl.js';

describe('apiUrl', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('leaves the path relative on the web, where no base is configured', () => {
    vi.stubEnv('VITE_API_BASE_URL', '');
    expect(apiUrl('/api/v1/social')).toBe('/api/v1/social');
  });

  it('prefixes the native base, tolerating a trailing slash', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://www.sprachschule-app.com/');
    expect(apiUrl('/api/v1/ai/chat')).toBe('https://www.sprachschule-app.com/api/v1/ai/chat');
  });

  it.each([
    'https://evil.example',
    'https://www.sprachschule-app.com.evil.example',
    'https://evil.example@www.sprachschule-app.com',
    'https://www.sprachschule-app.com/api',
    'http://www.sprachschule-app.com',
  ])('refuses unapproved native API base %s', (base) => {
    vi.stubEnv('VITE_API_BASE_URL', base);
    expect(() => apiUrl('/api/v1/social')).toThrow(
      'VITE_API_BASE_URL is not the approved API origin'
    );
  });

  it.each([
    'https://evil.example/api/v1/social',
    '//evil.example/api/v1/social',
    '/auth/v1/token',
    'api/v1/social',
    '',
    undefined,
  ])('refuses %s — the bearer token must never leave our API', (path) => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://www.sprachschule-app.com');
    expect(() => apiUrl(path)).toThrow(TypeError);
  });

  it('keeps a hostile-looking path on our own host', () => {
    vi.stubEnv('VITE_API_BASE_URL', 'https://www.sprachschule-app.com');
    for (const path of ['/api/@evil.example', '/api/..//evil.example', '/api/v1/social?q=//evil']) {
      expect(new URL(apiUrl(path)).host).toBe('www.sprachschule-app.com');
    }
  });
});

// A relative /api fetch works on the web and fails only inside the native app,
// so no jsdom or browser test would ever notice one. Scan for them instead.
describe('every fetch under src/ goes through apiUrl', () => {
  // Static files under public/, copied into dist/ and served by the webview
  // itself — not the API, so they must stay relative.
  const BUNDLED_ASSETS = ['packs/lexiconStore.js'];

  const root = 'src';
  const calls = readdirSync(root, { recursive: true })
    .filter((f) => /\.jsx?$/.test(f) && !/\.test\./.test(f) && !BUNDLED_ASSETS.includes(f))
    .flatMap((f) => {
      const src = readFileSync(join(root, f), 'utf8');
      return src
        .split('\n')
        .filter((line) => /(^|[^\w.])fetch(Impl)?\(/.test(line) && !/^\s*(\/\/|\*)/.test(line))
        .map((line) => ({ where: `${f}: ${line.trim()}`, line, src }));
    });

  // Inline, or through a variable this same file assigned from apiUrl().
  const wrapped = ({ line, src }) => {
    const arg = line.match(/fetch(?:Impl)?\(\s*(\w+)/)?.[1];
    return arg === 'apiUrl' || (!!arg && new RegExp(`\\b${arg} = apiUrl\\(`).test(src));
  };

  it('finds the known call sites — a scan that sees nothing proves nothing', () => {
    expect(calls.length).toBeGreaterThanOrEqual(10);
  });

  it('wraps each one in apiUrl()', () => {
    expect(calls.filter((c) => !wrapped(c)).map((c) => c.where)).toEqual([]);
  });
});
