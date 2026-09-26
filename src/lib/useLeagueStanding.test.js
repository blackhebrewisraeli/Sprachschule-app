import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

// Only auth is mocked. leagues.js runs FOR REAL so that "Home issues no writes"
// is an assertion about the actual query code rather than about a stub: if
// someone reintroduces joinLeague()/refreshLeague() here, the real post() runs
// and the fetch spy catches it. Mocking leagues.js wholesale would make that
// test incapable of failing.
const getSupabase = vi.fn();
vi.mock('./auth.js', () => ({
  getSupabase: (...a) => getSupabase(...a),
  getAccessToken: vi.fn().mockResolvedValue('tok'),
}));

// A cohort ordered by weekly_xp desc, which is how fetchStandings returns rows.
const cohort = (size, meAt) =>
  Array.from({ length: size }, (_, i) => ({
    user_id: i + 1 === meAt ? 'me' : `u${i + 1}`,
    handle: `H${i + 1}`,
    weekly_xp: (size - i) * 10,
    rank: null, // null during the live week — the whole reason rank is derived
  }));

function fakeSupabase({ membership = null, standings = [], failOn = null } = {}) {
  const seen = { tables: [], selects: [], filters: [] };
  const from = vi.fn((table) => {
    seen.tables.push(table);
    const chain = {
      select: vi.fn((cols) => {
        seen.selects.push(cols);
        return chain;
      }),
      eq: vi.fn((col, val) => {
        seen.filters.push([col, val]);
        return chain;
      }),
      maybeSingle: vi.fn(async () =>
        failOn === 'membership'
          ? { data: null, error: new Error('membership read failed') }
          : { data: membership, error: null }
      ),
      order: vi.fn(async () =>
        failOn === 'standings'
          ? { data: null, error: new Error('standings read failed') }
          : { data: standings, error: null }
      ),
    };
    return chain;
  });
  return { client: { from }, seen };
}

async function loadHook({ enabled = true } = {}) {
  vi.resetModules();
  vi.stubEnv('VITE_LEAGUES_ENABLED', enabled ? 'true' : 'false');
  return (await import('./useLeagueStanding.js')).useLeagueStanding;
}

let fetchSpy;
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in this test'));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('useLeagueStanding', () => {
  it('reports the demotion zone for a last-place member of a full cohort', async () => {
    // 25 members → zoneCounts gives demote 5 → ranks 21..25 are at risk.
    const { client } = fakeSupabase({
      membership: { league_id: 'L1', weekly_xp: 10, leagues: { tier: 2 } },
      standings: cohort(25, 25),
    });
    getSupabase.mockResolvedValue(client);

    const useLeagueStanding = await loadHook();
    const { result } = renderHook(() => useLeagueStanding('me'));

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current).toMatchObject({
      tier: 2,
      rank: 25,
      cohortSize: 25,
      inDemotionZone: true,
    });
    // Last place looks up: the two members above, then the caller.
    expect(result.current.slots.map((s) => s.rank)).toEqual([23, 24, 25]);
    expect(result.current.slots[2].member.user_id).toBe('me');
  });

  it('does not report the demotion zone for a mid-table member', async () => {
    const { client } = fakeSupabase({
      membership: { league_id: 'L1', weekly_xp: 160, leagues: { tier: 2 } },
      standings: cohort(25, 10),
    });
    getSupabase.mockResolvedValue(client);

    const useLeagueStanding = await loadHook();
    const { result } = renderHook(() => useLeagueStanding('me'));

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current).toMatchObject({
      tier: 2,
      rank: 10,
      cohortSize: 25,
      inDemotionZone: false,
    });
  });

  it('treats the first at-risk rank as in the zone and the one above it as safe', async () => {
    for (const [rank, expected] of [
      [20, false],
      [21, true],
    ]) {
      const { client } = fakeSupabase({
        membership: { league_id: 'L1', weekly_xp: 1, leagues: { tier: 2 } },
        standings: cohort(25, rank),
      });
      getSupabase.mockResolvedValue(client);
      const useLeagueStanding = await loadHook();
      const { result } = renderHook(() => useLeagueStanding('me'));
      await waitFor(() => expect(result.current).not.toBeNull());
      expect(result.current.inDemotionZone).toBe(expected);
    }
  });

  it('never reports a zone when the cohort is too small to demote anyone', async () => {
    // zoneCounts clamps demote to 0 for a cohort of 1, so last place is not "at risk".
    const { client } = fakeSupabase({
      membership: { league_id: 'L1', weekly_xp: 10, leagues: { tier: 2 } },
      standings: cohort(1, 1),
    });
    getSupabase.mockResolvedValue(client);

    const useLeagueStanding = await loadHook();
    const { result } = renderHook(() => useLeagueStanding('me'));

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current).toMatchObject({
      tier: 2,
      rank: 1,
      cohortSize: 1,
      inDemotionZone: false,
    });
    // Still three slots: the caller, then two open seats rather than a list
    // that shrinks to one row.
    expect(result.current.slots).toEqual([
      { rank: 1, member: expect.objectContaining({ user_id: 'me' }) },
      { rank: 2, member: null },
      { rank: 3, member: null },
    ]);
  });

  it('returns null when there is no membership for the current period', async () => {
    const { client } = fakeSupabase({ membership: null });
    getSupabase.mockResolvedValue(client);

    const useLeagueStanding = await loadHook();
    const { result } = renderHook(() => useLeagueStanding('me'));

    await waitFor(() => expect(getSupabase).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('returns null when the caller is missing from their own cohort rows', async () => {
    const { client } = fakeSupabase({
      membership: { league_id: 'L1', weekly_xp: 10, leagues: { tier: 2 } },
      standings: cohort(5, 0), // nobody is 'me'
    });
    getSupabase.mockResolvedValue(client);

    const useLeagueStanding = await loadHook();
    const { result } = renderHook(() => useLeagueStanding('me'));

    await waitFor(() => expect(getSupabase).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it.each([['membership'], ['standings']])(
    'returns null when the %s read fails',
    async (failOn) => {
      const { client } = fakeSupabase({
        membership: { league_id: 'L1', weekly_xp: 10, leagues: { tier: 2 } },
        standings: cohort(25, 25),
        failOn,
      });
      getSupabase.mockResolvedValue(client);

      const useLeagueStanding = await loadHook();
      const { result } = renderHook(() => useLeagueStanding('me'));

      await waitFor(() => expect(getSupabase).toHaveBeenCalled());
      expect(result.current).toBeNull();
    }
  );

  it('returns null and touches nothing when userId is absent', async () => {
    const useLeagueStanding = await loadHook();
    const { result } = renderHook(() => useLeagueStanding(undefined));

    expect(result.current).toBeNull();
    expect(getSupabase).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null without touching the network when leagues are disabled', async () => {
    const { client } = fakeSupabase({
      membership: { league_id: 'L1', weekly_xp: 10, leagues: { tier: 2 } },
      standings: cohort(25, 25),
    });
    getSupabase.mockResolvedValue(client);

    const useLeagueStanding = await loadHook({ enabled: false });
    const { result } = renderHook(() => useLeagueStanding('me'));

    expect(result.current).toBeNull();
    expect(getSupabase).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('issues NO writes — no join, no refresh, no POST of any kind', async () => {
    // §2.4 of the design: Home is the landing tab and the leaderboard's fetch
    // path does two writes on mount. This is the assertion most likely to be
    // quietly broken later by someone reusing joinLeague()/refreshLeague().
    const { client, seen } = fakeSupabase({
      membership: { league_id: 'L1', weekly_xp: 10, leagues: { tier: 2 } },
      standings: cohort(25, 25),
    });
    getSupabase.mockResolvedValue(client);

    const useLeagueStanding = await loadHook();
    const { result } = renderHook(() => useLeagueStanding('me'));
    await waitFor(() => expect(result.current).not.toBeNull());

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(3));
    expect(fetchSpy.mock.calls.every(([, init]) => !init?.method || init.method === 'GET')).toBe(
      true
    );
    expect(seen.tables).toEqual(['league_members', 'league_members']);
  });

  it('enriches only the three visible rows and keeps private-profile metadata', async () => {
    // Caller is 3rd of 5, not last → the window is places 2, 3, 4.
    const standings = cohort(5, 3);
    const { client } = fakeSupabase({
      membership: { league_id: 'L1', weekly_xp: 10, leagues: { tier: 2 } },
      standings,
    });
    getSupabase.mockResolvedValue(client);
    fetchSpy.mockImplementation(async (url) => {
      const userId = new URL(url, 'https://example.test').searchParams.get('userId');
      return {
        ok: true,
        json: async () => ({
          display_name: `Name ${userId}`,
          handle: `profile-${userId}`,
          avatar_path: `${userId}.webp`,
          is_private: userId === 'u2',
        }),
      };
    });

    const useLeagueStanding = await loadHook();
    const { result } = renderHook(() => useLeagueStanding('me'));

    await waitFor(() => {
      expect(result.current).not.toBeNull();
      expect(result.current.slots[2].member.profile).not.toBeNull();
    });
    expect(result.current.slots.map((s) => [s.rank, s.member.user_id])).toEqual([
      [2, 'u2'],
      [3, 'me'],
      [4, 'u4'],
    ]);
    expect(result.current.slots[0].member.profile).toMatchObject({
      display_name: 'Name u2',
      is_private: true,
    });
    // Never the whole cohort: one GET per visible row, and u1 / u5 untouched.
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    const asked = fetchSpy.mock.calls.map(([url]) =>
      new URL(url, 'https://example.test').searchParams.get('userId')
    );
    expect(asked.sort()).toEqual(['me', 'u2', 'u4']);
  });

  it('fetches no profile for an open seat', async () => {
    const { client } = fakeSupabase({
      membership: { league_id: 'L1', weekly_xp: 10, leagues: { tier: 0 } },
      standings: cohort(2, 1),
    });
    getSupabase.mockResolvedValue(client);

    const useLeagueStanding = await loadHook();
    const { result } = renderHook(() => useLeagueStanding('me'));

    await waitFor(() => expect(result.current).not.toBeNull());
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2));
    expect(result.current.slots[2]).toEqual({ rank: 3, member: null });
  });

  it('reads only the caller row for the current league week, then the cohort', async () => {
    const { client, seen } = fakeSupabase({
      membership: { league_id: 'L1', weekly_xp: 10, leagues: { tier: 2 } },
      standings: cohort(25, 25),
    });
    getSupabase.mockResolvedValue(client);

    const useLeagueStanding = await loadHook();
    const { result } = renderHook(() => useLeagueStanding('me'));
    await waitFor(() => expect(result.current).not.toBeNull());

    // The tier is an embedded to-one on the SAME row, not a second round trip:
    // Home renders the league badge from it, and asking joinLeague instead
    // would make opening the landing tab a write.
    expect(seen.selects[0]).toBe('league_id, weekly_xp, leagues!inner(tier)');
    expect(seen.filters[0]).toEqual(['user_id', 'me']);
    // period_start is a Monday (UTC) in YYYY-MM-DD — the current league week.
    const [col, period] = seen.filters[1];
    expect(col).toBe('period_start');
    expect(period).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(`${period}T00:00:00Z`).getUTCDay()).toBe(1);
    expect(seen.filters[2]).toEqual(['league_id', 'L1']);
  });

  it('does not set state after unmount', async () => {
    const { client } = fakeSupabase({
      membership: { league_id: 'L1', weekly_xp: 10, leagues: { tier: 2 } },
      standings: cohort(25, 25),
    });
    getSupabase.mockResolvedValue(client);

    const useLeagueStanding = await loadHook();
    const { result, unmount } = renderHook(() => useLeagueStanding('me'));
    unmount();
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current).toBeNull();
  });
});
