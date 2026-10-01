// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { resolveCaller } from './aiCaller.js';

const req = (authorization) => ({
  headers: { 'x-forwarded-for': '9.9.9.9', ...(authorization ? { authorization } : {}) },
});
const clientWith = (impl) => ({ auth: { getUser: vi.fn(impl) } });
const userClient = (user) => clientWith(async () => ({ data: { user }, error: null }));

describe('resolveCaller', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('no header → guest keyed by IP', async () => {
    expect(await resolveCaller(req(), clientWith())).toEqual({ kind: 'guest', key: 'ip:9.9.9.9' });
  });

  it('valid token → user keyed by id', async () => {
    const c = userClient({ id: 'u1', email: 'a@b.c' });
    expect(await resolveCaller(req('Bearer t'), c)).toEqual({
      kind: 'user',
      userId: 'u1',
      key: 'user:u1',
    });
    expect(c.auth.getUser).toHaveBeenCalledWith('t');
  });

  it('rejected token → 401 so the client refreshes', async () => {
    const c = clientWith(async () => ({ data: {}, error: { status: 401, name: 'AuthApiError' } }));
    await expect(resolveCaller(req('Bearer t'), c)).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('a revoked session (403 session_not_found) → 401', async () => {
    const c = clientWith(async () => ({
      data: { user: null },
      error: { status: 403, name: 'AuthApiError', code: 'session_not_found' },
    }));
    await expect(resolveCaller(req('Bearer t'), c)).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('GoTrue unreachable → degraded guest, not an outage', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = clientWith(async () => ({
      data: {},
      error: { status: 0, name: 'AuthRetryableFetchError' },
    }));
    expect(await resolveCaller(req('Bearer t'), c)).toEqual({
      kind: 'guest',
      key: 'ip:9.9.9.9',
      degraded: true,
    });
  });

  it('GoTrue 5xx or throttling us → degraded guest, never the learner’s 401', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const status of [500, 503, 429]) {
      const c = clientWith(async () => ({ data: {}, error: { status, name: 'AuthApiError' } }));
      expect((await resolveCaller(req('Bearer t'), c)).degraded).toBe(true);
    }
  });

  it('a thrown getUser → degraded guest', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = clientWith(async () => {
      throw new Error('ECONNRESET');
    });
    expect((await resolveCaller(req('Bearer t'), c)).degraded).toBe(true);
  });

  it('no data lane configured → degraded guest', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect((await resolveCaller(req('Bearer t'), null)).degraded).toBe(true);
  });

  it('logs a degraded caller without the token or the address', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = clientWith(async () => {
      throw new Error('ECONNRESET');
    });
    await resolveCaller(req('Bearer secret-token'), c);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = warn.mock.calls[0][0];
    expect(JSON.parse(line)).toMatchObject({ event: 'ai_caller_degraded' });
    expect(line).not.toContain('secret-token');
    expect(line).not.toContain('9.9.9.9');
  });

  it('malformed header → 401', async () => {
    await expect(resolveCaller(req('Basic x'), clientWith())).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  it('an empty bearer → 401 without asking GoTrue', async () => {
    const c = clientWith();
    await expect(resolveCaller(req('Bearer '), c)).rejects.toMatchObject({
      code: 'unauthorized',
    });
    expect(c.auth.getUser).not.toHaveBeenCalled();
  });

  it('a session without a user → 401', async () => {
    const c = clientWith(async () => ({ data: { user: null }, error: null }));
    await expect(resolveCaller(req('Bearer t'), c)).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('applies the signup allowlist the account lane applies', async () => {
    vi.stubEnv('SIGNUP_EMAIL_ALLOWLIST', 'invited@example.com');
    const c = userClient({
      id: 'u2',
      email: 'stranger@example.com',
      email_confirmed_at: '2026-10-01T00:00:00Z',
    });
    await expect(resolveCaller(req('Bearer t'), c)).rejects.toMatchObject({
      code: 'signup_not_allowed',
    });
  });
});

// The classification above runs on hand-built errors. These run the REAL
// supabase-js client against a stubbed GoTrue, so the error classes and
// statuses are the ones production sees — including AuthUnknownError, which
// carries no status at all for a non-JSON error body.
describe('resolveCaller against real supabase-js errors', () => {
  const goTrue = (status, body, contentType = 'application/json') =>
    createClient('https://stub.supabase.co', 'service-role-key', {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: async () => new Response(body, { status, headers: { 'content-type': contentType } }),
      },
    });
  const html = (status) => goTrue(status, '<html>Bad Gateway</html>', 'text/html');

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('a user GoTrue returns → user', async () => {
    const c = goTrue(200, JSON.stringify({ id: 'u1', aud: 'authenticated' }));
    expect(await resolveCaller(req('Bearer t'), c)).toMatchObject({ kind: 'user', userId: 'u1' });
  });

  it.each([
    [401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' }],
    [403, { code: 403, error_code: 'session_not_found', msg: 'Session does not exist' }],
  ])('a JSON %s verdict on the token → 401', async (status, body) => {
    const c = goTrue(status, JSON.stringify(body));
    await expect(resolveCaller(req('Bearer t'), c)).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it.each([500, 429, 503])('an HTML %s from GoTrue or a proxy → degraded guest', async (status) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await resolveCaller(req('Bearer t'), html(status))).toMatchObject({
      kind: 'guest',
      degraded: true,
    });
  });

  it.each([500, 429])('a JSON %s from GoTrue → degraded guest', async (status) => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const c = goTrue(status, JSON.stringify({ code: status, msg: 'busy' }));
    expect((await resolveCaller(req('Bearer t'), c)).degraded).toBe(true);
  });

  it('a hung GoTrue → degraded guest after the timeout, not a 504', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.useFakeTimers();
    const c = clientWith(() => new Promise(() => {}));
    const pending = resolveCaller(req('Bearer t'), c);
    await vi.advanceTimersByTimeAsync(3000);
    expect(await pending).toEqual({ kind: 'guest', key: 'ip:9.9.9.9', degraded: true });
    expect(JSON.parse(warn.mock.calls[0][0])).toEqual({
      event: 'ai_caller_degraded',
      reason: 'auth_timeout',
    });
  });
});
