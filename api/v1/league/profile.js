import { sendError } from '../../_lib/respond.js';
import { serviceClient } from '../../_lib/supabase.js';
import { requireAuth } from '../../_lib/auth-middleware.js';
import { currentPeriodStart } from '../../_lib/leagueLogic.js';
import { xpForDay } from '../../../src/lib/xpCore.js';
import { withCors } from '../../_lib/origin.js';

// Longest run of consecutive calendar days present in the sorted key list.
export function longestStreak(dayKeys) {
  const days = [...new Set(dayKeys)].sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const key of days) {
    const t = Date.parse(key + 'T00:00:00Z');
    if (prev !== null && t - prev === 86400000) run += 1;
    else run = 1;
    best = Math.max(best, run);
    prev = t;
  }
  return best;
}

/**
 * The YEAR someone joined, never the date.
 *
 * "Member since 2026" is the passport line; the exact day is a fact about a
 * stranger that a leaderboard has no reason to publish.
 */
export function joinYear(createdAt) {
  if (!createdAt) return null;
  const year = new Date(createdAt).getUTCFullYear();
  return Number.isFinite(year) ? year : null;
}

/**
 * Badge ids, READ from what the learner's own client already synced.
 *
 * `settings.data.achievements` is an id -> earned-at map, it is inside
 * settingsToRow's allowlist, and App only ever ADDS to it. So it is both
 * authoritative and monotone — exactly the properties a public badge list wants.
 *
 * The alternative was recomputing them here, and it does not survive contact:
 * the achievement engine lives in src/lib/gamification.js, which imports
 * `../packs` (the entire German pack) and reaches src/lib/stats.js, which
 * touches localStorage — neither belongs in a serverless function, and several
 * of those modules omit the `.js` extensions native Node ESM requires. A
 * hand-rolled server copy would then be a SECOND definition of every threshold,
 * free to drift from the one the learner actually earned against.
 *
 * The decisive argument is empirical: the only badge on the production account
 * is `deck1`, which depends on deck mastery and could not have been recomputed
 * from public activity at all. Recomputing would have shown that learner zero
 * badges while their own app showed one.
 *
 * Sorted by when they were earned — oldest first, so a passport reads as a
 * history. The timestamps themselves are NOT returned: the order is the useful
 * part, the exact times are just activity metadata about someone else.
 */
export function publicAchievements(settingsData) {
  const earned = settingsData?.achievements;
  if (!earned || typeof earned !== 'object' || Array.isArray(earned)) return [];
  return Object.entries(earned)
    .filter(([id]) => typeof id === 'string' && id)
    .sort((a, b) => (Number(a[1]) || 0) - (Number(b[1]) || 0))
    .map(([id]) => id);
}

/**
 * Who everyone in one league is — name, handle, avatar — in ONE read, for the
 * Profile standings' rows.
 *
 * The standings read carries handles only, and `profiles` is own-row under
 * RLS, so without this a row could show a league-mate's uploaded avatar only
 * after the passport below was opened for them. Calling that passport once
 * per row would work, but it is seven queries per person; a cohort of 25 is
 * 175 queries to paint 25 faces.
 *
 * The gate is league membership, which is exactly who the "read my league
 * rows" policy (20260627000000) already lets read these members' handles. The
 * fields are the passport's identity half and nothing more — no XP, streak or
 * badges — and a private learner's name rides along as the passport ships it,
 * because leagueDisplayName is what decides to lead with the handle.
 *
 * A query mode on this file rather than a new file: the deployment is at the
 * 12-function Hobby cap (see api/v1/social.js).
 */
async function leagueIdentities(res, db, callerId, leagueId) {
  try {
    const { data: members, error } = await db
      .from('league_members')
      .select('user_id')
      .eq('league_id', leagueId);
    if (error) throw error;
    const ids = (members ?? []).map((m) => m.user_id);
    if (!ids.includes(callerId)) return sendError(res, 'forbidden', 'Not in your league.');

    const { data: profiles, error: profileError } = await db
      .from('profiles')
      .select('user_id, display_name, handle, avatar_path, is_private')
      .in('user_id', ids);
    if (profileError) throw profileError;
    return res.status(200).json(profiles ?? []);
  } catch {
    return sendError(res, 'server_error', 'Failed to load profiles.');
  }
}

async function handler(req, res) {
  if (req.method !== 'GET') return sendError(res, 'method_not_allowed', 'Method not allowed');

  let auth;
  try {
    auth = await requireAuth(req);
  } catch (err) {
    return sendError(res, err.code ?? 'server_error', err.message ?? 'Unexpected error.');
  }

  const target = req.query?.userId;
  const leagueId = req.query?.leagueId;
  if (!target && !leagueId) return sendError(res, 'bad_request', 'Missing userId or leagueId.');

  const db = serviceClient();
  if (!db) return sendError(res, 'server_error', 'Server is not configured.');

  if (leagueId) return leagueIdentities(res, db, auth.userId, leagueId);

  const period = currentPeriodStart();

  try {
    if (target !== auth.userId) {
      const { data: shares } = await db.rpc('shares_league', {
        p_a: auth.userId,
        p_b: target,
        p_period: period,
      });
      if (!shares) return sendError(res, 'forbidden', 'Not in your league.');
    }

    const [
      { data: profile },
      { data: stats },
      { data: member },
      { data: wins },
      { data: settings },
      { count: followers_count },
      { count: following_count },
    ] = await Promise.all([
      db
        .from('profiles')
        .select('display_name, handle, avatar_path, created_at, is_private')
        .eq('user_id', target)
        .maybeSingle(),
      db.from('stats_daily').select('day, counters').eq('user_id', target),
      db
        .from('league_members')
        .select('leagues!inner(tier, period_start)')
        .eq('user_id', target)
        .order('period_start', { ascending: false, foreignTable: 'leagues' })
        .limit(1)
        .maybeSingle(),
      // Every settled league this player topped. NOT the client's
      // stats.leagueWins: `stats` is absent from settingsToRow's allowlist, so
      // that counter has never synced and is whatever the last device they
      // used happened to think.
      db.from('league_members').select('league_id').eq('user_id', target).eq('rank', 1),
      // Badges come from the row the learner's own client already syncs —
      // see publicAchievements for why they are read rather than recomputed.
      db.from('settings').select('data').eq('user_id', target).maybeSingle(),
      // COUNTS ONLY, never the edges. `head: true` asks PostgREST for the
      // count header and no rows, so the social graph itself never leaves the
      // database — a passport that shipped the follower LIST would publish who
      // follows whom for everyone in the league.
      //
      // followed_id = people pointing at this profile (its followers).
      // follower_id = people this profile points at (who it follows).
      db
        .from('profile_follows')
        .select('*', { count: 'exact', head: true })
        .eq('followed_id', target),
      db
        .from('profile_follows')
        .select('*', { count: 'exact', head: true })
        .eq('follower_id', target),
    ]);

    // A private learner (profiles.is_private, 20260924120000) shows anyone but
    // themselves only who they are — never what they have done. Decided before
    // a single metric is derived, so nothing below can leak into this shape.
    const isPrivate = Boolean(profile?.is_private);
    if (isPrivate && target !== auth.userId) {
      return res.status(200).json({
        display_name: profile?.display_name ?? null,
        handle: profile?.handle ?? null,
        avatar_path: profile?.avatar_path ?? null,
        is_private: true,
      });
    }

    const rows = stats ?? [];
    const total_xp = rows.reduce((s, r) => s + xpForDay(r.counters), 0);
    const longest_streak = longestStreak(rows.map((r) => r.day));

    return res.status(200).json({
      // display_name is the chosen name; handle stays the identifier. Both
      // ship, and the client decides which to lead with (src/lib/profile.js
      // profileName) so the passport, the profile header and the account
      // sheet cannot disagree about what to call someone.
      display_name: profile?.display_name ?? null,
      handle: profile?.handle ?? null,
      avatar_path: profile?.avatar_path ?? null,
      is_private: isPrivate,
      join_year: joinYear(profile?.created_at),
      tier: member?.leagues?.tier ?? 0,
      total_xp,
      longest_streak,
      league_wins: wins?.length ?? 0,
      // A profile nobody follows has zero followers, not an unknown number of
      // them — `null` here would render as an empty metric card.
      followers_count: followers_count ?? 0,
      following_count: following_count ?? 0,
      achievements: publicAchievements(settings?.data),
    });
  } catch {
    return sendError(res, 'server_error', 'Failed to load profile.');
  }
}

export default withCors(handler);
