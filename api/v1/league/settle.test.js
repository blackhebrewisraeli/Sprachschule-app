import { it, expect, vi, afterEach, beforeEach } from 'vitest';

vi.mock('../../_lib/supabase.js', () => ({ serviceClient: vi.fn() }));

import handler from './settle.js';
import { serviceClient } from '../../_lib/supabase.js';
import { createRes } from '../../_lib/test-helpers.js';

const req = (token = 'secret', method = 'POST') => ({
  method,
  headers: { authorization: `Bearer ${token}` },
});

beforeEach(() => {
  process.env.CRON_SECRET = 'secret';
});
afterEach(() => vi.clearAllMocks());

it('rejects without the cron secret (401)', async () => {
  serviceClient.mockReturnValue({});
  const res = createRes();
  await handler(req('wrong'), res);
  expect(res.statusCode).toBe(401);
});

it('settles past leagues and writes ranks/results', async () => {
  const past = [{ id: 'L1', period_start: '2026-06-15' }];
  const members = [
    { user_id: 'a', weekly_xp: 50, updated_at: 't1', rank: null },
    { user_id: 'b', weekly_xp: 10, updated_at: 't2', rank: null },
  ];
  const calls = [];
  const db = {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      lt: vi.fn().mockResolvedValue({ data: past, error: null }),
      eq: vi.fn().mockResolvedValue({ data: members, error: null }),
    })),
    rpc: vi.fn((fn, args) => {
      calls.push({ fn, args });
      return Promise.resolve({ error: null });
    }),
  };
  serviceClient.mockReturnValue(db);

  const res = createRes();
  await handler(req('secret'), res);
  expect(res.statusCode).toBe(200);
  expect(res.body.settled).toBe(1);
  expect(res.body.failed).toBe(0);
  // The ranking still reaches the database, now as one payload rather than as
  // one UPDATE per member: winner 'a' got rank 1, and the loser is ranked too.
  expect(calls).toHaveLength(1);
  expect(calls[0].fn).toBe('apply_league_results');
  expect(calls[0].args.p_league_id).toBe('L1');
  const winner = calls[0].args.p_results.find((r) => r.user_id === 'a');
  expect(winner.rank).toBe(1);
  expect(calls[0].args.p_results.find((r) => r.user_id === 'b').rank).toBe(2);
});

it('skips a league that is already fully settled (idempotent)', async () => {
  const past = [{ id: 'L1', period_start: '2026-06-15' }];
  const members = [
    { user_id: 'a', weekly_xp: 50, updated_at: 't1', rank: 1 },
    { user_id: 'b', weekly_xp: 10, updated_at: 't2', rank: 2 },
  ];
  // Asserts against the CURRENT write mechanism. The previous version of this
  // test watched `update`, which the handler no longer calls at all — it would
  // now pass with settlement entirely deleted.
  const rpcSpy = vi.fn().mockResolvedValue({ error: null });
  const db = {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      lt: vi.fn().mockResolvedValue({ data: past, error: null }),
      eq: vi.fn().mockResolvedValue({ data: members, error: null }),
    })),
    rpc: rpcSpy,
  };
  serviceClient.mockReturnValue(db);

  const res = createRes();
  await handler(req('secret'), res);
  expect(res.statusCode).toBe(200);
  expect(res.body.settled).toBe(0);
  expect(rpcSpy).not.toHaveBeenCalled();
});

it('isolates a failing league and still settles the others (200, failed counted)', async () => {
  const past = [
    { id: 'L_bad', period_start: '2026-06-15' },
    { id: 'L_ok', period_start: '2026-06-15' },
  ];
  const membersByLeague = {
    L_bad: [{ user_id: 'x', weekly_xp: 30, updated_at: 't1', rank: null }],
    L_ok: [{ user_id: 'y', weekly_xp: 20, updated_at: 't2', rank: null }],
  };
  const okSettled = [];
  const db = {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      lt: vi.fn().mockResolvedValue({ data: past, error: null }),
      // league_members: resolve the member set for the scoped league_id
      eq: vi.fn((_col, id) => Promise.resolve({ data: membersByLeague[id], error: null })),
    })),
    rpc: vi.fn((_fn, args) => {
      if (args.p_league_id === 'L_bad') {
        return Promise.resolve({ error: { message: 'DB write failed' } });
      }
      okSettled.push(args);
      return Promise.resolve({ error: null });
    }),
  };
  serviceClient.mockReturnValue(db);

  const res = createRes();
  await handler(req('secret'), res);
  expect(res.statusCode).toBe(200);
  expect(res.body.settled).toBe(1); // L_ok
  expect(res.body.failed).toBe(1); // L_bad
  expect(okSettled.flatMap((a) => a.p_results).some((r) => r.user_id === 'y')).toBe(true);
});

// Vercel Cron triggers its path with a GET, not a POST. This endpoint opened
// with a POST-only guard that ran *before* the secret check, so every scheduled
// run since launch was answered with 405 and no league was ever settled — which
// also killed tier progression, because join.js derives the next tier from a
// settled `result` and filters `.not('result', 'is', null)`.
//
// The original suite could not catch it: its request helper hardcoded POST, so
// the test encoded the same wrong assumption as the code it was checking.
it('settles when Vercel Cron issues a GET', async () => {
  const past = [{ id: 'L1', period_start: '2026-06-15' }];
  const members = [
    { user_id: 'a', weekly_xp: 50, updated_at: 't1', rank: null },
    { user_id: 'b', weekly_xp: 10, updated_at: 't2', rank: null },
  ];
  const calls = [];
  const db = {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      lt: vi.fn().mockResolvedValue({ data: past, error: null }),
      eq: vi.fn().mockResolvedValue({ data: members, error: null }),
    })),
    rpc: vi.fn((fn, args) => {
      calls.push({ fn, args });
      return Promise.resolve({ error: null });
    }),
  };
  serviceClient.mockReturnValue(db);

  const res = createRes();
  await handler(req('secret', 'GET'), res);
  expect(res.statusCode).toBe(200);
  expect(res.body.settled).toBe(1);
  expect(calls[0].args.p_results.find((r) => r.user_id === 'a').rank).toBe(1);
});

// Accepting GET must not widen the security boundary: the secret is what
// protects this endpoint, and it is now the *only* thing protecting it.
it('rejects a GET without the cron secret (401)', async () => {
  serviceClient.mockReturnValue({});
  const res = createRes();
  await handler(req('wrong', 'GET'), res);
  expect(res.statusCode).toBe(401);
});

it('still rejects methods neither Vercel nor a manual run uses (405)', async () => {
  serviceClient.mockReturnValue({});
  const res = createRes();
  await handler(req('secret', 'DELETE'), res);
  expect(res.statusCode).toBe(405);
});

// L3: settle issued one UPDATE per member. A full cohort is LEAGUE_SIZE (25),
// so a single league cost 26 round trips and the whole run cost 26 x L, all
// sequential, inside one 300s function. It is also not atomic per league: a
// failure halfway leaves some members ranked and some not, which is only
// survivable because re-settlement re-ranks the full set.
//
// Counting round trips rather than timing: a timing assertion would be flaky
// and would not say WHY it was slow.
it('settles a full 25-member cohort in at most two round trips', async () => {
  const past = [{ id: 'L1', period_start: '2026-06-15' }];
  const members = Array.from({ length: 25 }, (_, i) => ({
    user_id: `u${i}`,
    handle: `h${i}`,
    weekly_xp: 100 - i,
    updated_at: `t${i}`,
    rank: null,
  }));

  let memberTrips = 0;
  const db = {
    from: vi.fn((table) => {
      if (table === 'leagues') {
        return {
          select: vi.fn().mockReturnThis(),
          lt: vi.fn().mockResolvedValue({ data: past, error: null }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn(() => {
          memberTrips += 1;
          return Promise.resolve({ data: members, error: null });
        }),
        update: vi.fn(() => ({
          match: vi.fn(() => {
            memberTrips += 1;
            return Promise.resolve({ error: null });
          }),
        })),
      };
    }),
    rpc: vi.fn(() => {
      memberTrips += 1;
      return Promise.resolve({ error: null });
    }),
  };
  serviceClient.mockReturnValue(db);

  const res = createRes();
  await handler(req('secret'), res);

  expect(res.statusCode).toBe(200);
  expect(res.body.settled).toBe(1);
  // One read of the member set, one write of the whole ranking.
  expect(memberTrips).toBeLessThanOrEqual(2);
});

it('?job=purge sweeps AI usage and conversations and never touches leagues', async () => {
  const results = {
    purge_ai_usage: { usage: 7, grants: 1 },
    purge_ai_conversations: { conversations: 2, messages: 9 },
  };
  const db = {
    from: vi.fn(),
    rpc: vi.fn(async (name) => ({ data: results[name], error: null })),
  };
  serviceClient.mockReturnValue(db);
  const res = createRes();
  await handler({ ...req('secret', 'GET'), query: { job: 'purge' } }, res);
  expect(res.statusCode).toBe(200);
  expect(res.body).toEqual({ purged: { usage: 7, grants: 1, conversations: 2, messages: 9 } });
  expect(db.rpc.mock.calls.map((c) => c[0])).toEqual(['purge_ai_usage', 'purge_ai_conversations']);
  expect(db.from).not.toHaveBeenCalled();
});

it('?job=purge needs the cron secret', async () => {
  const db = { rpc: vi.fn() };
  serviceClient.mockReturnValue(db);
  const denied = createRes();
  await handler({ ...req('wrong', 'GET'), query: { job: 'purge' } }, denied);
  expect(denied.statusCode).toBe(401);
  expect(db.rpc).not.toHaveBeenCalled();
});

it.each([
  ['purge_ai_usage', 'AI usage', 'purge_ai_conversations'],
  ['purge_ai_conversations', 'AI conversations', 'purge_ai_usage'],
])(
  '?job=purge still runs the other sweep when %s fails, and reports 500',
  async (bad, label, other) => {
    const db = {
      rpc: vi.fn(async (name) =>
        name === bad ? { data: null, error: { message: 'boom' } } : { data: {}, error: null }
      ),
    };
    serviceClient.mockReturnValue(db);
    const res = createRes();
    await handler({ ...req('secret', 'GET'), query: { job: 'purge' } }, res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error.message).toContain(label);
    expect(db.rpc.mock.calls.map((c) => c[0])).toContain(other);
  }
);
