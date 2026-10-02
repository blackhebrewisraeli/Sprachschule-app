import { describe, it, expect, vi } from 'vitest';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { originAllowed, parseAllowedOrigins, withCors, NATIVE_APP_ORIGINS } from './origin.js';
import { createRes } from './test-helpers.js';

describe('parseAllowedOrigins', () => {
  it('splits, trims, and drops empties', () => {
    expect(parseAllowedOrigins(' https://a.com , https://b.com ,')).toEqual([
      'https://a.com',
      'https://b.com',
    ]);
    expect(parseAllowedOrigins(undefined)).toEqual([]);
  });
});

describe('originAllowed', () => {
  it('passes everything when no allow-list is configured', () => {
    expect(originAllowed({ headers: { origin: 'https://evil.com' } }, [])).toBe(true);
  });

  it('passes requests without an Origin header (non-browser clients)', () => {
    expect(originAllowed({ headers: {} }, ['https://a.com'])).toBe(true);
  });

  it('passes a listed origin and rejects an unlisted one', () => {
    const allowed = ['https://a.com'];
    expect(originAllowed({ headers: { origin: 'https://a.com' } }, allowed)).toBe(true);
    expect(originAllowed({ headers: { origin: 'https://evil.com' } }, allowed)).toBe(false);
  });

  it('passes the native app origins even when the Production list omits them', () => {
    const allowed = ['https://deutsch-app-dusky.vercel.app'];
    for (const origin of NATIVE_APP_ORIGINS) {
      expect(originAllowed({ headers: { origin } }, allowed)).toBe(true);
    }
    expect(originAllowed({ headers: { origin: 'http://localhost' } }, allowed)).toBe(false);
  });
});

describe('withCors', () => {
  const req = (method, origin) => ({ method, headers: origin ? { origin } : {} });

  it('answers a native preflight itself, without running the endpoint', async () => {
    const inner = vi.fn();
    const res = createRes();
    await withCors(inner)(req('OPTIONS', 'capacitor://localhost'), res);
    expect(inner).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(204);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('capacitor://localhost');
    expect(res.headers['Access-Control-Allow-Headers']).toBe('authorization, content-type');
    expect(res.headers['Access-Control-Allow-Methods']).toBe('GET, POST, PATCH, DELETE');
    expect(res.headers['Access-Control-Allow-Credentials']).toBeUndefined();
  });

  it('echoes the native origin on the real request and runs the endpoint', async () => {
    const inner = vi.fn((_req, res) => res.status(200).json({ ok: true }));
    const res = createRes();
    await withCors(inner)(req('POST', 'https://localhost'), res);
    expect(inner).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(200);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://localhost');
    const exposed = res.headers['Access-Control-Expose-Headers'];
    expect(exposed).toContain('Retry-After');
    expect(exposed).toContain('X-Quota-Reset');
    expect(exposed).toContain('X-Conversation-Saved');
  });

  it('grants nothing to any other origin, preflight included', async () => {
    for (const origin of ['https://evil.com', 'http://localhost', undefined]) {
      const inner = vi.fn((_req, res) => res.status(405).json({}));
      const res = createRes();
      await withCors(inner)(req('OPTIONS', origin), res);
      expect(inner).toHaveBeenCalledOnce();
      expect(res.statusCode).toBe(405);
      expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
      expect(res.headers.Vary).toBe('Origin');
    }
  });
});

// A native call to an unwrapped endpoint fails its preflight in the app and
// nowhere else, so enumerate the entries rather than trust a list.
describe('every browser-facing api/v1 entry answers a native preflight', () => {
  // Cron endpoints: server-to-server, each guarded by its own bearer secret
  // (CRON_SECRET, PUSH_CRON_SECRET), and no browser has any business calling them.
  const NOT_BROWSER_FACING = ['league/settle.js', 'push/streak-reminder.js'];
  const entries = readdirSync('api/v1', { recursive: true }).filter(
    (f) => f.endsWith('.js') && !f.endsWith('.test.js')
  );
  const browserFacing = entries.filter((f) => !NOT_BROWSER_FACING.includes(f));

  const preflight = async (f) => {
    const { default: handler } = await import(resolve('api/v1', f));
    const res = createRes();
    await handler({ method: 'OPTIONS', headers: { origin: 'capacitor://localhost' } }, res);
    return res;
  };

  it('finds every entry — an enumeration that sees nothing proves nothing', () => {
    expect(browserFacing.length).toBe(10);
  });

  it.each(browserFacing)('%s', async (f) => {
    const res = await preflight(f);
    expect(res.statusCode).toBe(204);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('capacitor://localhost');
  });

  it.each(NOT_BROWSER_FACING)('%s stays closed', async (f) => {
    const res = await preflight(f);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });
});
