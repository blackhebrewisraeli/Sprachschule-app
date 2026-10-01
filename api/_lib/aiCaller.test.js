import { describe, it, expect, vi, afterEach } from 'vitest';
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
