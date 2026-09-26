import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../_lib/supabase.js', () => ({ serviceClient: vi.fn() }));
vi.mock('../../_lib/auth-middleware.js', () => ({ requireAuth: vi.fn() }));

import handler, { longestStreak } from './profile.js';
import { serviceClient } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth-middleware.js';
import { createRes } from '../../_lib/test-helpers.js';

const USER = { userId: 'me', email: 'a@b.com' };
const req = (userId) => ({
  method: 'GET',
  query: { userId },
  headers: { authorization: 'Bearer t' },
});

afterEach(() => vi.clearAllMocks());

describe('longestStreak', () => {
  it('finds the longest run of consecutive days', () => {
    expect(longestStreak(['2026-06-20', '2026-06-21', '2026-06-23'])).toBe(2);
    expect(longestStreak([])).toBe(0);
  });
});

it('rejects when requester shares no league with target (403)', async () => {
  requireAuth.mockResolvedValue(USER);
  const sharedRpc = vi.fn().mockResolvedValue({ data: false, error: null });
  serviceClient.mockReturnValue({ rpc: sharedRpc });
  const res = createRes();
  await handler(req('other'), res);
  expect(res.statusCode).toBe(403);
});

it('returns 400 when userId missing', async () => {
  requireAuth.mockResolvedValue(USER);
  serviceClient.mockReturnValue({ rpc: vi.fn() });
  const res = createRes();
  await handler(req(undefined), res);
  expect(res.statusCode).toBe(400);
});

// ── The passport payload ──────────────────────────────────────

import { joinYear, publicAchievements } from './profile.js';

describe('joinYear', () => {
  it('is the year alone, never the date', () => {
    expect(joinYear('2026-06-19T10:20:30Z')).toBe(2026);
  });

  it('is null when unknown', () => {
    expect(joinYear(null)).toBeNull();
    expect(joinYear(undefined)).toBeNull();
    expect(joinYear('not a date')).toBeNull();
  });
});

// Badges are READ from what the learner's own client synced, never recomputed.
// The decisive case is real: the only badge on the production account is
// `deck1`, which depends on deck mastery — a server recomputation from public
// activity could not have produced it at all.
describe('publicAchievements', () => {
  it('returns the earned ids', () => {
    expect(publicAchievements({ achievements: { vol100: 5, deck1: 9 } })).toEqual([
      'vol100',
      'deck1',
    ]);
  });

  it('orders them oldest-earned first, so a passport reads as a history', () => {
    expect(publicAchievements({ achievements: { late: 900, early: 100, mid: 500 } })).toEqual([
      'early',
      'mid',
      'late',
    ]);
  });

  it('does NOT leak the earned timestamps', () => {
    const out = publicAchievements({ achievements: { vol100: 1785469058935 } });
    expect(out).toEqual(['vol100']);
    expect(JSON.stringify(out)).not.toContain('1785469058935');
  });

  it('is empty for a learner who has never synced', () => {
    expect(publicAchievements(undefined)).toEqual([]);
    expect(publicAchievements({})).toEqual([]);
    expect(publicAchievements({ achievements: null })).toEqual([]);
  });

  it('ignores a corrupted shape rather than throwing', () => {
    expect(publicAchievements({ achievements: ['vol100'] })).toEqual([]);
    expect(publicAchievements({ achievements: 'vol100' })).toEqual([]);
  });
});

// A full-payload mock: enough tables that the handler's Promise.all resolves.
const passportDb = (over = {}) => {
  const rows = {
    profiles: {
      handle: 'Rival',
      avatar_path: 'other/a.webp',
      created_at: '2026-06-19T00:00:00Z',
      ...over.profile,
    },
    stats_daily: over.stats ?? [
      { day: '2026-06-20', counters: { byLevel: { a1: { correct: 10 } } } },
      { day: '2026-06-21', counters: { byLevel: { a1: { correct: 10 } } } },
    ],
    wins: over.wins ?? [{ league_id: 'l1' }, { league_id: 'l2' }],
    settings:
      'settings' in over ? over.settings : { data: { achievements: { deck1: 100, vol100: 200 } } },
  };
  // followers = rows pointing AT the target; following = rows FROM them. The
  // two differ only by which column is filtered, so the mock has to remember
  // the column or it cannot tell the two counts apart — and a test that cannot
  // tell them apart would pass with the endpoint's two queries swapped.
  const follows = over.follows ?? { followed_id: 3, follower_id: 5 };
  return {
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    from: vi.fn((table) => {
      let eqField = null;
      const q = {
        select: vi.fn(() => q),
        eq: vi.fn((field) => {
          eqField = field;
          return q;
        }),
        order: vi.fn(() => q),
        limit: vi.fn(() => q),
        maybeSingle: vi.fn(() =>
          Promise.resolve({
            data:
              table === 'profiles'
                ? rows.profiles
                : table === 'settings'
                  ? rows.settings
                  : { leagues: { tier: 1 } },
          })
        ),
        then: (resolve) => {
          if (table === 'profile_follows') {
            return resolve({ count: follows[eqField] ?? 0, error: null });
          }
          return resolve({
            data: table === 'stats_daily' ? rows.stats_daily : rows.wins,
            error: null,
          });
        },
      };
      return q;
    }),
  };
};

describe('GET /api/v1/league/profile — the passport', () => {
  it('carries every field the card renders', async () => {
    requireAuth.mockResolvedValue(USER);
    serviceClient.mockReturnValue(passportDb());
    const res = createRes();
    await handler(req('other'), res);

    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({
      handle: 'Rival',
      avatar_path: 'other/a.webp',
      join_year: 2026,
      tier: 1,
      total_xp: 200,
      longest_streak: 2,
      league_wins: 2,
      achievements: ['deck1', 'vol100'],
    });
    expect(res.body).not.toHaveProperty('avatar_emoji');
  });

  it('carries the display name and the follower counts', async () => {
    requireAuth.mockResolvedValue(USER);
    serviceClient.mockReturnValue(
      passportDb({
        profile: { display_name: 'Sam Vimes' },
        follows: { followed_id: 3, follower_id: 5 },
      })
    );
    const res = createRes();
    await handler(req('other'), res);
    expect(res.body.display_name).toBe('Sam Vimes');
    // followers = people pointing at them; following = people they point at.
    // Asserting different numbers is the point: equal fixtures would pass with
    // the two queries transposed.
    expect(res.body.followers_count).toBe(3);
    expect(res.body.following_count).toBe(5);
  });

  it('reports zero rather than null for a profile nobody follows', async () => {
    requireAuth.mockResolvedValue(USER);
    serviceClient.mockReturnValue(passportDb({ follows: {} }));
    const res = createRes();
    await handler(req('other'), res);
    expect(res.body.followers_count).toBe(0);
    expect(res.body.following_count).toBe(0);
  });

  it('never leaks WHO follows whom, only how many', async () => {
    // The counts are public; the edges are not. A profile card that shipped
    // the follower list would publish the social graph of everyone in the
    // league, which no screen asks for.
    requireAuth.mockResolvedValue(USER);
    serviceClient.mockReturnValue(passportDb());
    const res = createRes();
    await handler(req('other'), res);
    expect(res.body).not.toHaveProperty('followers');
    expect(res.body).not.toHaveProperty('following');
    expect(JSON.stringify(res.body)).not.toContain('follower_id');
  });

  // The client's stats.leagueWins has NEVER synced — `stats` is absent from
  // settingsToRow's allowlist — so the server is the only correct source.
  it('counts league wins from rank-1 memberships', async () => {
    requireAuth.mockResolvedValue(USER);
    serviceClient.mockReturnValue(passportDb({ wins: [] }));
    const res = createRes();
    await handler(req('other'), res);
    expect(res.body.league_wins).toBe(0);
  });

  it('is empty-but-valid for a player who has never synced settings', async () => {
    requireAuth.mockResolvedValue(USER);
    serviceClient.mockReturnValue(passportDb({ settings: null }));
    const res = createRes();
    await handler(req('other'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.achievements).toEqual([]);
  });

  it('returns nothing from the settings row except the badge ids', async () => {
    requireAuth.mockResolvedValue(USER);
    serviceClient.mockReturnValue(
      passportDb({
        settings: {
          data: {
            achievements: { deck1: 1 },
            goal: 100,
            soundOn: true,
            learnedWords: { Haus: true },
            level: 'b1',
          },
        },
      })
    );
    const res = createRes();
    await handler(req('other'), res);

    const body = JSON.stringify(res.body);
    expect(res.body.achievements).toEqual(['deck1']);
    for (const leak of ['goal', 'soundOn', 'learnedWords', 'Haus', 'b1']) {
      expect(body).not.toContain(leak);
    }
  });

  // is_private (20260924120000) locks the passport for everyone but its owner:
  // name, handle and avatar, and NOTHING else. Asserted as the exact key set —
  // a lock that let one metric through would still read as locked to a test
  // that only checked for the flag.
  it('locks a private passport to name, handle and avatar for anyone else', async () => {
    requireAuth.mockResolvedValue(USER);
    serviceClient.mockReturnValue(
      passportDb({ profile: { display_name: 'Sam Vimes', is_private: true } })
    );
    const res = createRes();
    await handler(req('other'), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      display_name: 'Sam Vimes',
      handle: 'Rival',
      avatar_path: 'other/a.webp',
      is_private: true,
    });
  });

  it('still shows a private learner their own full passport', async () => {
    requireAuth.mockResolvedValue(USER);
    serviceClient.mockReturnValue(passportDb({ profile: { is_private: true } }));
    const res = createRes();
    await handler(req(USER.userId), res);
    expect(res.body).toMatchObject({ is_private: true, total_xp: 200, league_wins: 2 });
  });

  it('marks a public passport as public and keeps every metric', async () => {
    requireAuth.mockResolvedValue(USER);
    serviceClient.mockReturnValue(passportDb());
    const res = createRes();
    await handler(req('other'), res);
    expect(res.body).toMatchObject({ is_private: false, total_xp: 200 });
  });

  it('lets a learner fetch their OWN passport without a league check', async () => {
    requireAuth.mockResolvedValue(USER);
    const db = passportDb();
    serviceClient.mockReturnValue(db);
    const res = createRes();
    await handler(req(USER.userId), res);
    expect(res.statusCode).toBe(200);
    expect(db.rpc).not.toHaveBeenCalled();
  });
});

// ── ?leagueId= : every member's identity in one read ─────────────────────────

describe('league identities (?leagueId=)', () => {
  const leagueReq = (leagueId) => ({
    method: 'GET',
    query: { leagueId },
    headers: { authorization: 'Bearer t' },
  });

  // Records what each table was asked for, so a test can tell "returned the
  // members' identities" apart from "returned whatever the mock held".
  const leagueDb = (memberIds) => {
    const asked = {};
    const from = vi.fn((table) => {
      const q = {
        select: vi.fn((cols) => {
          asked[table] = { ...asked[table], cols };
          return q;
        }),
        eq: vi.fn((col, val) => {
          asked[table] = { ...asked[table], eq: [col, val] };
          return Promise.resolve({ data: memberIds.map((user_id) => ({ user_id })), error: null });
        }),
        in: vi.fn((col, vals) => {
          asked[table] = { ...asked[table], in: [col, vals] };
          return Promise.resolve({
            data: vals.map((user_id) => ({ user_id, handle: `h-${user_id}`, avatar_path: null })),
            error: null,
          });
        }),
      };
      return q;
    });
    return { db: { from, rpc: vi.fn() }, asked };
  };

  it('refuses a league the caller is not in, before reading any profile', async () => {
    requireAuth.mockResolvedValue(USER);
    const { db, asked } = leagueDb(['a', 'b']);
    serviceClient.mockReturnValue(db);
    const res = createRes();
    await handler(leagueReq('L1'), res);
    expect(res.statusCode).toBe(403);
    expect(asked.profiles).toBeUndefined();
  });

  it("returns the identity half of every member's passport, and nothing else", async () => {
    requireAuth.mockResolvedValue(USER);
    const { db, asked } = leagueDb(['a', USER.userId, 'b']);
    serviceClient.mockReturnValue(db);
    const res = createRes();
    await handler(leagueReq('L1'), res);

    expect(res.statusCode).toBe(200);
    expect(asked.league_members.eq).toEqual(['league_id', 'L1']);
    expect(asked.profiles.in).toEqual(['user_id', ['a', USER.userId, 'b']]);
    expect(asked.profiles.cols).toBe('user_id, display_name, handle, avatar_path, is_private');
    expect(res.body.map((p) => p.user_id)).toEqual(['a', USER.userId, 'b']);
    // One read per table — not the seven-query passport once per member.
    expect(db.from).toHaveBeenCalledTimes(2);
    expect(db.rpc).not.toHaveBeenCalled();
  });
});
