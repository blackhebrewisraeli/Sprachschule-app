import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../_lib/supabase.js', () => ({ serviceClient: vi.fn() }));
vi.mock('../../_lib/auth-middleware.js', () => ({ requireAuth: vi.fn() }));

import {
  exportHandler as handler,
  EXPORTED_TABLES,
  EXCLUDED_TABLES,
} from '../../_lib/accountEndpoints.js';
import { serviceClient } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth-middleware.js';
import { createRes, getReq } from '../../_lib/test-helpers.js';

const USER = { userId: 'uid-1', email: 'a@b.com' };

// Every user-owned table, i.e. everything with an `on delete cascade` FK to
// auth.users. Mirrors USER_OWNED in supabase/tests/rls/cascade.test.js: that
// suite proves deletion covers them all, this one proves the export has an
// opinion about them all. A new table must be classified in both.
const USER_OWNED = [
  'profiles',
  'srs_state',
  'stats_daily',
  'decks',
  'settings',
  'league_members',
  'progress_events_seen',
  'feedback',
  'token_ledger',
  'user_devices',
  'legal_acceptances',
];

// Distinct rows per table. The previous fixture returned the SAME row for every
// table, so it could not tell whether a key held its own data — an assertion
// that `decks` was present would have passed against a payload that put
// stats_daily rows under it.
const ROWS = {
  srs_state: [{ srs_key: 'greetings:Hallo', box: 2 }],
  stats_daily: [{ day: '2026-06-27', counters: { total: 3 } }],
  decks: [{ deck_id: 'custom', name: 'My deck', cards: [{ de: 'Hallo' }] }],
  settings: [{ data: { goal: 50 } }],
};

let queried;
const mockDb = () => ({
  from: vi.fn((table) => {
    queried.push(table);
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: ROWS[table] ?? [], error: null }),
    };
  }),
});

describe('export payload coverage', () => {
  // The guard that would have caught the original defect. `decks` was neither
  // exported nor consciously excluded — it was simply forgotten, and nothing
  // said so.
  it('classifies every user-owned table as either exported or excluded', () => {
    const classified = [...Object.keys(EXPORTED_TABLES), ...Object.keys(EXCLUDED_TABLES)].sort();
    expect(classified).toEqual([...USER_OWNED].sort());
  });

  it('never lists a table as both exported and excluded', () => {
    const both = Object.keys(EXPORTED_TABLES).filter((t) => t in EXCLUDED_TABLES);
    expect(both).toEqual([]);
  });

  it('gives every exclusion a stated reason', () => {
    for (const [table, reason] of Object.entries(EXCLUDED_TABLES)) {
      expect(reason, `${table} is excluded without saying why`).toEqual(expect.any(String));
      expect(reason.trim().length, `${table}'s reason is too thin to be a reason`).toBeGreaterThan(
        15
      );
    }
  });

  it('exports the custom decks a learner actually created', () => {
    expect(Object.keys(EXPORTED_TABLES)).toContain('decks');
  });
});

describe('GET /api/v1/account/export', () => {
  beforeEach(() => {
    queried = [];
    requireAuth.mockResolvedValue(USER);
    serviceClient.mockReturnValue(mockDb());
  });
  afterEach(() => vi.clearAllMocks());

  it('returns 405 for non-GET methods', async () => {
    const res = createRes();
    await handler({ method: 'POST', headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('returns 401 when requireAuth throws unauthorized', async () => {
    requireAuth.mockRejectedValue({
      code: 'unauthorized',
      message: 'Missing authorization token.',
    });
    const res = createRes();
    await handler(getReq('1.1.1.1', null), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('reads exactly the tables it declares, and no others', async () => {
    const res = createRes();
    await handler(getReq('1.1.1.2', 'tok'), res);
    expect(res.statusCode).toBe(200);
    expect([...queried].sort()).toEqual(Object.keys(EXPORTED_TABLES).sort());
    for (const excluded of Object.keys(EXCLUDED_TABLES)) {
      expect(queried).not.toContain(excluded);
    }
  });

  it('puts each table’s own rows under its own key', async () => {
    const res = createRes();
    await handler(getReq('1.1.1.3', 'tok'), res);
    const { data } = res.body;
    expect(data.srs).toEqual(ROWS.srs_state);
    expect(data.daily).toEqual(ROWS.stats_daily);
    expect(data.decks).toEqual(ROWS.decks);
  });

  it('includes the learner’s custom decks, cards and all', async () => {
    const res = createRes();
    await handler(getReq('1.1.1.4', 'tok'), res);
    expect(res.body.data.decks).toHaveLength(1);
    expect(res.body.data.decks[0]).toMatchObject({ deck_id: 'custom', name: 'My deck' });
    expect(res.body.data.decks[0].cards).toEqual([{ de: 'Hallo' }]);
  });

  // settings is one row per user; the existing shape is a bare object, and
  // consumers already parse it that way.
  it('keeps settings a single object while collections stay arrays', async () => {
    const res = createRes();
    await handler(getReq('1.1.1.5', 'tok'), res);
    expect(Array.isArray(res.body.data.settings)).toBe(false);
    expect(res.body.data.settings).toEqual(ROWS.settings[0]);
    expect(Array.isArray(res.body.data.decks)).toBe(true);
  });

  it('answers with an empty collection, not null, when a table has no rows', async () => {
    serviceClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: [], error: null }),
      })),
    });
    const res = createRes();
    await handler(getReq('1.1.1.6', 'tok'), res);
    expect(res.body.data.decks).toEqual([]);
    expect(res.body.data.settings).toBeNull();
  });

  it('carries the envelope the download relies on', async () => {
    const res = createRes();
    await handler(getReq('1.1.1.7', 'tok'), res);
    expect(res.body.email).toBe('a@b.com');
    expect(res.body.exportedAt).toBeDefined();
    expect(res.headers['Content-Disposition']).toMatch(/sprachschule-export\.json/);
  });

  it('returns 500 when a db query fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    serviceClient.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({ data: null, error: { message: 'db error' } }),
      })),
    });
    const res = createRes();
    await handler(getReq('1.1.1.8', 'tok'), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error.code).toBe('server_error');
    spy.mockRestore();
  });
});
