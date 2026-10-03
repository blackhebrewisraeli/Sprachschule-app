// api/v1/account/delete.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../_lib/supabase.js', () => ({ serviceClient: vi.fn() }));
vi.mock('../../_lib/auth-middleware.js', () => ({ requireAuth: vi.fn() }));

import { deleteHandler as handler } from '../../_lib/accountEndpoints.js';
import { serviceClient } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth-middleware.js';
import { createRes } from '../../_lib/test-helpers.js';
import { generateKeyPairSync } from 'node:crypto';

const USER = { userId: 'uid-1', email: 'a@b.com' };

// The route is a module singleton and its quota counters live for the whole test
// process, so every test gets a fresh IP and a fresh user id.
let seq = 0;
// A token whose amr says the caller authenticated `sec` ago. The re-auth gate
// reads amr, never iat — see api/_lib/authTime.js.
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export function freshToken(sec = 30) {
  const ts = Math.floor(Date.now() / 1000) - sec;
  return `${b64({ alg: 'HS256' })}.${b64({ amr: [{ method: 'otp', timestamp: ts }] })}.sig`;
}
function makeReq(method = 'DELETE', token = freshToken(), body = { confirm: 'DELETE' }) {
  seq += 1;
  return {
    method,
    headers: {
      'x-forwarded-for': `172.16.0.${seq}`,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body,
  };
}
const freshUser = () => ({ ...USER, userId: `uid-${++seq}` });

const deleteUser = vi.fn();
// `from` must never be reached; if it is, the test that asserts so will say which.
const from = vi.fn(() => ({
  delete: vi.fn().mockReturnThis(),
  eq: vi.fn().mockResolvedValue({ error: null }),
}));

// Storage is NOT in the auth.users cascade, so the handler must clear the
// user's avatar folder itself. These record what it asked for.
let storageOps;
let storageList;
const storageFrom = vi.fn((bucket) => ({
  list: vi.fn((prefix) => {
    storageOps.push({ op: 'list', bucket, prefix });
    return Promise.resolve(storageList);
  }),
  remove: vi.fn((paths) => {
    storageOps.push({ op: 'remove', bucket, paths });
    return Promise.resolve({ error: null });
  }),
}));
const mockDb = () => ({
  from,
  storage: { from: storageFrom },
  auth: { admin: { deleteUser } },
});

beforeEach(() => {
  storageOps = [];
  storageList = { data: [{ name: 'a.webp' }, { name: 'b.webp' }], error: null };
});

describe('DELETE /api/v1/account', () => {
  beforeEach(() => {
    requireAuth.mockResolvedValue(freshUser());
    deleteUser.mockResolvedValue({ error: null });
    serviceClient.mockReturnValue(mockDb());
  });
  afterEach(() => vi.clearAllMocks());

  it('returns 405 for non-DELETE methods', async () => {
    const res = createRes();
    await handler(makeReq('GET'), res);
    expect(res.statusCode).toBe(405);
  });

  it('returns 401 when requireAuth throws unauthorized', async () => {
    requireAuth.mockRejectedValue({
      code: 'unauthorized',
      message: 'Missing authorization token.',
    });
    const res = createRes();
    await handler(makeReq('DELETE', null, { confirm: 'DELETE' }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('deletes the auth user and returns 204', async () => {
    const user = freshUser();
    requireAuth.mockResolvedValue(user);
    const res = createRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(204);
    expect(deleteUser).toHaveBeenCalledWith(user.userId);
  });

  it('issues exactly ONE delete and touches no table directly — the FK cascade is the mechanism', async () => {
    const res = createRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(204);
    expect(deleteUser).toHaveBeenCalledTimes(1);
    // The old handler pre-deleted srs_state, stats_daily and settings before
    // calling deleteUser. That ordering is what allowed "data gone, account
    // alive" when the second step failed. Any table touched here reintroduces it.
    expect(from).not.toHaveBeenCalled();
  });

  it('returns 500 without a partial delete when deleteUser fails', async () => {
    deleteUser.mockResolvedValue({ error: { message: 'auth down' } });
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = createRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(500);
    expect(res.body.error.message).toBe('Failed to delete account.');
    // Nothing else was deleted, so the account is untouched rather than gutted.
    expect(from).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('logs the failure with the endpoint and the user, instead of swallowing it', async () => {
    const user = freshUser();
    requireAuth.mockResolvedValue(user);
    deleteUser.mockRejectedValue(new Error('network partition'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = createRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(500);
    const logged = spy.mock.calls.flat().join(' ');
    expect(logged).toContain('account.delete');
    expect(logged).toContain(user.userId);
    expect(logged).toContain('network partition');
    spy.mockRestore();
  });

  it('rate limits a repeat caller rather than accepting unlimited attempts', async () => {
    const ip = '172.31.7.7';
    const user = freshUser();
    requireAuth.mockResolvedValue(user);
    const mk = () => ({
      method: 'DELETE',
      headers: { 'x-forwarded-for': ip, authorization: 'Bearer tok' },
    });

    let limited = null;
    // userRate max is 5/hour; the 6th must be refused.
    for (let i = 0; i < 8 && !limited; i += 1) {
      const res = createRes();
      await handler(mk(), res);
      if (res.statusCode === 429) limited = res;
    }

    expect(limited).not.toBeNull();
    expect(limited.body.error.code).toBe('rate_limited');
    expect(limited.headers['Retry-After']).toBeDefined();
  });

  // ── §6.3 step 4: re-auth gate ───────────────────────────────────────────
  it('refuses a stale session with reauth_required and deletes nothing', async () => {
    const res = createRes();
    await handler(makeReq('DELETE', freshToken(3600)), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('reauth_required');
    expect(deleteUser).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  // ── §6.3 step 5: typed confirmation ─────────────────────────────────────
  // Not in the it.each below: passing `undefined` there would hit makeReq's
  // DEFAULT parameter and quietly send a valid confirm body, so the case could
  // never fail. Build the request without a `body` key at all.
  it('refuses a request with no body at all and deletes nothing', async () => {
    const res = createRes();
    seq += 1;
    await handler(
      {
        method: 'DELETE',
        headers: {
          'x-forwarded-for': `172.16.9.${seq}`,
          authorization: `Bearer ${freshToken()}`,
        },
      },
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('bad_request');
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it.each([
    ['an empty body', {}],
    ['the wrong phrase', { confirm: 'delete' }],
    ['a near miss', { confirm: 'DELETE ' }],
    ['a non-string', { confirm: true }],
  ])('refuses %s and deletes nothing', async (_label, body) => {
    const res = createRes();
    await handler(makeReq('DELETE', freshToken(), body), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('bad_request');
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('accepts the confirmation when the body arrives unparsed as a JSON string', async () => {
    const res = createRes();
    await handler(makeReq('DELETE', freshToken(), JSON.stringify({ confirm: 'DELETE' })), res);
    expect(res.statusCode).toBe(204);
    expect(deleteUser).toHaveBeenCalledTimes(1);
  });

  it('checks the confirmation before touching the auth admin API', async () => {
    const res = createRes();
    await handler(makeReq('DELETE', freshToken(), { confirm: 'nope' }), res);
    expect(deleteUser).not.toHaveBeenCalled();
  });
});

// A public bucket outlives the account otherwise: every user-owned TABLE goes
// with the auth row, but storage.objects is not in that foreign-key graph, so
// a deleted learner's photo would stay fetchable by anyone holding the URL.
describe('account deletion clears the avatar folder', () => {
  it("lists and removes the user's objects", async () => {
    const user = freshUser();
    requireAuth.mockResolvedValue(user);
    serviceClient.mockReturnValue(mockDb());
    const res = createRes();
    await handler(makeReq(), res);

    expect(res.statusCode).toBe(204);
    expect(storageOps).toContainEqual({ op: 'list', bucket: 'avatars', prefix: user.userId });
    expect(storageOps).toContainEqual({
      op: 'remove',
      bucket: 'avatars',
      paths: [`${user.userId}/a.webp`, `${user.userId}/b.webp`],
    });
  });

  // Afterwards there is no row left to say which objects were theirs.
  it('clears storage BEFORE deleting the auth user', async () => {
    const user = freshUser();
    let deletedAt = null;
    requireAuth.mockResolvedValue(user);
    deleteUser.mockImplementation(() => {
      deletedAt = storageOps.length;
      return Promise.resolve({ error: null });
    });
    serviceClient.mockReturnValue(mockDb());
    await handler(makeReq(), createRes());

    expect(deletedAt).toBeGreaterThan(0);
    expect(storageOps.some((o) => o.op === 'remove')).toBe(true);
  });

  it('removes nothing when the folder is empty', async () => {
    storageList = { data: [], error: null };
    requireAuth.mockResolvedValue(freshUser());
    serviceClient.mockReturnValue(mockDb());
    await handler(makeReq(), createRes());
    expect(storageOps.filter((o) => o.op === 'remove')).toHaveLength(0);
  });

  // An orphaned image must never block the deletion the person asked for —
  // a half-delete is the one outcome this endpoint's design forbids.
  it('still deletes the account when storage cleanup fails', async () => {
    requireAuth.mockResolvedValue(freshUser());
    serviceClient.mockReturnValue({
      from,
      storage: {
        from: () => ({
          list: () => Promise.reject(new Error('storage down')),
          remove: vi.fn(),
        }),
      },
      auth: { admin: { deleteUser } },
    });
    const res = createRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(204);
    expect(deleteUser).toHaveBeenCalled();
  });
});

// Sign in with Apple: the token is revoked BEFORE anything is erased
// (docs/AUTH_APPLE_OAUTH_RUNBOOK.md).
describe('DELETE /api/v1/account — Apple token revocation', () => {
  const APPLE_USER = () => ({
    ...freshUser(),
    user: { app_metadata: { provider: 'apple', providers: ['apple'] } },
  });
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const appleEnv = {
    APPLE_SERVICES_ID: 'com.example.signin',
    APPLE_TEAM_ID: 'TEAM123456',
    APPLE_KEY_ID: 'KEY1234567',
    APPLE_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
  const withToken = { confirm: 'DELETE', appleRefreshToken: 'r.apple' };
  let fetchSpy;
  const apple = (status, body = {}) =>
    fetchSpy.mockResolvedValue({ ok: status < 300, status, json: async () => body });

  beforeEach(() => {
    requireAuth.mockResolvedValue(APPLE_USER());
    deleteUser.mockResolvedValue({ error: null });
    serviceClient.mockReturnValue(mockDb());
    for (const [k, v] of Object.entries(appleEnv)) vi.stubEnv(k, v);
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    apple(200);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    fetchSpy.mockRestore();
    vi.clearAllMocks();
  });

  it('revokes the Apple token first, then deletes', async () => {
    const order = [];
    fetchSpy.mockImplementation(async () => {
      order.push('apple');
      return { ok: true, status: 200, json: async () => ({}) };
    });
    deleteUser.mockImplementation(async () => {
      order.push('delete');
      return { error: null };
    });
    const res = createRes();
    await handler(makeReq('DELETE', freshToken(), withToken), res);
    expect(res.statusCode).toBe(204);
    expect(order).toEqual(['apple', 'delete']);
    expect(new URLSearchParams(fetchSpy.mock.calls[0][1].body).get('token')).toBe('r.apple');
  });

  it('asks an Apple learner with no token to sign in with Apple, and deletes nothing', async () => {
    const res = createRes();
    await handler(makeReq('DELETE', freshToken(), { confirm: 'DELETE' }), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('apple_token_required');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
    expect(storageOps).toEqual([]);
  });

  it('fails without deleting when Apple is unreachable, so the learner can retry', async () => {
    apple(503);
    const res = createRes();
    await handler(makeReq('DELETE', freshToken(), withToken), res);
    expect(res.statusCode).toBe(500);
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('still deletes when Apple says the token is already gone', async () => {
    apple(400, { error: 'invalid_grant' });
    const res = createRes();
    await handler(makeReq('DELETE', freshToken(), withToken), res);
    expect(res.statusCode).toBe(204);
  });

  it('never blocks erasure on our own misconfiguration: logs and deletes', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    apple(400, { error: 'invalid_client' });
    let res = createRes();
    await handler(makeReq('DELETE', freshToken(), withToken), res);
    expect(res.statusCode).toBe(204);

    vi.stubEnv('APPLE_PRIVATE_KEY', '');
    requireAuth.mockResolvedValue(APPLE_USER());
    res = createRes();
    await handler(makeReq('DELETE', freshToken(), { confirm: 'DELETE' }), res);
    expect(res.statusCode).toBe(204);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('Apple token NOT revoked'));
    log.mockRestore();
  });

  it('does not touch Apple for anyone else', async () => {
    requireAuth.mockResolvedValue(freshUser());
    const res = createRes();
    await handler(makeReq(), res);
    expect(res.statusCode).toBe(204);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('never writes the token to the logs', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    apple(400, { error: 'invalid_client' });
    await handler(makeReq('DELETE', freshToken(), withToken), createRes());
    expect(JSON.stringify(log.mock.calls)).not.toContain('r.apple');
    log.mockRestore();
  });
});
