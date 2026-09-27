import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { adminClient, createSignedInUser } from './helpers.js';
import { xpForDay } from '../../../src/lib/xpCore.js';
import { currentPeriodStart } from '../../../src/lib/leagueCountdown.js';

// L1: apply_progress_event must maintain league_members.weekly_xp.
//
// Before this suite, api/v1/league/refresh.js was the ONLY writer of a
// non-zero weekly_xp, and it updates only the caller's own row. Since E4/E5
// moved progress writes server-side into the RPC, a member's league XP
// advanced only when THEY personally opened the Stats tab, so every rival on
// the leaderboard was displayed at their last-tab-visit XP.
//
// Which tests earn their own red, and which are proven by mutation:
//   - "moves the actor's row" and "leaves a rival untouched" FAIL before the
//     migration (weekly_xp stays 0 where 10 is expected).
//   - "replaying an event", "a settled league" and "an event from a previous
//     week" would all pass trivially against the broken code, because nothing
//     wrote weekly_xp at all. Each therefore FIRST asserts the value the
//     feature must produce (which fails today) and only then asserts the
//     guard. Their guard halves are additionally proven by deleting the
//     corresponding SQL clause and re-running — see the plan's teeth check.

const admin = adminClient();

const PERIOD = currentPeriodStart();
// A day inside the current league week. period_start is the Monday, so the
// Monday itself is always in-week and never drifts past today.
const DAY = PERIOD;
// The Sunday before it — same league, previous week.
const PREV_WEEK_DAY = new Date(Date.parse(`${PERIOD}T00:00:00Z`) - 86400000)
  .toISOString()
  .slice(0, 10);

let A;
let B;
let leagueId;

const event = (over = {}) => ({
  p_user_id: A.id,
  p_pack_id: 'de',
  p_day: DAY,
  p_tab: 'vocab',
  p_level: 'a1',
  p_verdict: 'correct',
  p_bonus_xp: 0,
  p_event_id: crypto.randomUUID(),
  ...over,
});

const callAsService = (over = {}) => admin.rpc('apply_progress_event', event(over));

const weeklyXpOf = async (userId) => {
  const { data, error } = await admin
    .from('league_members')
    .select('weekly_xp')
    .eq('user_id', userId)
    .eq('league_id', leagueId)
    .single();
  if (error) throw new Error(error.message);
  return data.weekly_xp;
};

const setRank = (userId, rank) =>
  admin.from('league_members').update({ rank }).match({ league_id: leagueId, user_id: userId });

beforeAll(async () => {
  [A, B] = await Promise.all([
    createSignedInUser('league-xp-a'),
    createSignedInUser('league-xp-b'),
  ]);

  const { data: league, error } = await admin
    .from('leagues')
    .insert({ tier: 0, period_start: PERIOD })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  leagueId = league.id;

  // TWO members. A single-member fixture cannot express the defect: the bug is
  // that a rival's row does not move, and with no rival there is nothing to
  // observe.
  const { error: mErr } = await admin.from('league_members').insert([
    { league_id: leagueId, user_id: A.id, handle: 'a-handle', weekly_xp: 0, period_start: PERIOD },
    { league_id: leagueId, user_id: B.id, handle: 'b-handle', weekly_xp: 0, period_start: PERIOD },
  ]);
  if (mErr) throw new Error(mErr.message);
});

afterAll(async () => {
  for (const u of [A, B]) {
    if (!u?.id) continue;
    await admin.from('progress_events_seen').delete().eq('user_id', u.id);
    await admin.from('stats_daily').delete().eq('user_id', u.id);
  }
  // Remove only OUR members, and the league only once it is empty. This league
  // is a tier-0 cohort in the REAL current week, so assign_user_to_bucket (the
  // oldest cohort with room) places league-bucket.test.js's first-XP learner
  // into it when the two files overlap. Deleting by league_id wiped that
  // learner before its assertion ran — main's RLS job failed on it 2026-09-27.
  if (leagueId) {
    const ours = [A?.id, B?.id].filter(Boolean);
    await admin.from('league_members').delete().eq('league_id', leagueId).in('user_id', ours);
    const { count } = await admin
      .from('league_members')
      .select('*', { count: 'exact', head: true })
      .eq('league_id', leagueId);
    if (count === 0) await admin.from('leagues').delete().eq('id', leagueId);
  }
});

describe('apply_progress_event maintains league weekly_xp', () => {
  it("moves the actor's weekly_xp to match the day's XP", async () => {
    const { data, error } = await callAsService();
    expect(error).toBeNull();
    // The invariant that matters: the SQL and xpForDay agree exactly. One
    // correct a1 answer is XP_PER_VERDICT.correct = 10.
    expect(xpForDay(data)).toBe(10);
    expect(await weeklyXpOf(A.id)).toBe(10);
  });

  it('leaves a rival in the same league untouched', async () => {
    expect(await weeklyXpOf(B.id)).toBe(0);
  });

  it('accumulates across events, staying equal to the recomputed week', async () => {
    const { data, error } = await callAsService({ p_verdict: 'almost', p_bonus_xp: 5 });
    expect(error).toBeNull();
    // 10 (correct) + 6 (almost) + 5 (bonus) = 21.
    expect(xpForDay(data)).toBe(21);
    expect(await weeklyXpOf(A.id)).toBe(21);
  });

  it('does not double-count a replayed event_id', async () => {
    const replayed = event({ p_verdict: 'correct', p_bonus_xp: 0 });
    const first = await admin.rpc('apply_progress_event', replayed);
    expect(first.error).toBeNull();
    const after = await weeklyXpOf(A.id);
    // Establishes a non-zero baseline the broken code cannot reach, so this
    // test is red today rather than passing vacuously.
    expect(after).toBe(31);

    const second = await admin.rpc('apply_progress_event', replayed);
    expect(second.error).toBeNull();
    expect(await weeklyXpOf(A.id)).toBe(31);
  });

  it('never mutates a settled league', async () => {
    await setRank(A.id, 3);
    const before = await weeklyXpOf(A.id);
    expect(before).toBe(31);

    const { error } = await callAsService();
    expect(error).toBeNull();
    expect(await weeklyXpOf(A.id)).toBe(31);

    await setRank(A.id, null);
  });

  it('ignores an event dated in a previous league week', async () => {
    const before = await weeklyXpOf(A.id);
    expect(before).toBe(31);

    const { error } = await callAsService({ p_day: PREV_WEEK_DAY });
    expect(error).toBeNull();
    // The previous week's XP belongs to a membership row that does not exist
    // here; it must not leak into the current week's standing.
    expect(await weeklyXpOf(A.id)).toBe(31);
  });
});
