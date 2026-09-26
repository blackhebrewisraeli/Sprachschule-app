import { useEffect, useState } from 'react';
import { getSupabase } from './auth.js';
import { LEAGUES_ENABLED, fetchMyMembership, fetchProfile, fetchStandings } from './leagues.js';
import { currentPeriodStart } from './leagueCountdown.js';
import { zoneCounts } from './leagueZones.js';
import { leagueWindow } from './leagueWindow.js';

// The caller's live league standing for Home, as two cohort reads plus up to
// three best-effort profile GETs for the compact preview, and no writes.
//
// Why not reuse the leaderboard's fetch: LeaderboardSection calls joinLeague()
// and refreshLeague() before reading, and both are WRITES — join can create a
// league row and a membership. Home is the landing tab, opened every session,
// so running that sequence here would turn every app open into two database
// writes. If there is no membership for this period the mission simply does not
// fire; a learner who has not joined a league has no standing to be at risk of,
// and Home must not create one for them.
//
// Why rank is derived rather than read: league_members.rank is written only by
// the weekly settle cron, so it is NULL during the live week. Position has to
// come from the ordering of weekly_xp within the cohort — the same thing
// LeaderboardSection does — and the drop-zone size comes from zoneCounts, which
// settlement itself uses, so what the mission claims matches what will happen.
//
// Freshness: weekly_xp is only as current as the last refresh call, so this can
// lag XP earned since. That is accepted, not fixed here — refreshing is the
// write we are avoiding. The mission is a nudge; the Leagues tab stays the
// accurate surface.

/**
 * @param {string|undefined} userId
 * @returns {{tier: number, rank: number, cohortSize: number, inDemotionZone: boolean,
 *   slots: Array<{rank: number, member: object|null}>}|null}
 *   `slots` is always three places around the caller (see leagueWindow);
 *   `member` is null for a place the cohort has not filled.
 */
export function useLeagueStanding(userId) {
  const [standing, setStanding] = useState(null);

  useEffect(() => {
    if (!LEAGUES_ENABLED || !userId) {
      setStanding(null);
      return undefined;
    }
    let cancelled = false;

    (async () => {
      try {
        const supabase = await getSupabase();
        const membership = await fetchMyMembership(supabase, userId, currentPeriodStart());
        if (cancelled) return;
        if (!membership?.league_id) {
          setStanding(null);
          return;
        }

        const rows = await fetchStandings(supabase, membership.league_id);
        if (cancelled) return;

        const cohortSize = rows.length;
        const placement = leagueWindow(rows, userId);
        if (!placement) {
          setStanding(null);
          return;
        }
        const { rank } = placement;

        const { demote } = zoneCounts(cohortSize);
        const slots = placement.slots.map(({ rank: place, member }) => ({
          rank: place,
          member: member ? { ...member, profile: null } : null,
        }));
        const nextStanding = {
          // The tier rides along with the membership read — it costs nothing
          // extra (it is an embedded to-one on the same row) and it is what
          // Home's league badge renders. Without it Home would have to call
          // joinLeague to find out, which is the write this whole hook exists
          // to avoid.
          tier: membership.tier ?? 0,
          rank,
          cohortSize,
          inDemotionZone: demote > 0 && rank > cohortSize - demote,
          slots,
        };

        // Publish the standing immediately: missions and the league badge do
        // not wait for avatar/name decoration. The profile requests — one per
        // FILLED visible slot, never the whole cohort — are independent
        // best-effort reads; a missing passport leaves that row on its
        // denormalised @handle instead of taking the whole Home hub down.
        setStanding(nextStanding);
        const enrichedSlots = await Promise.all(
          slots.map(async (slot) => {
            if (!slot.member) return slot;
            try {
              return {
                ...slot,
                member: { ...slot.member, profile: await fetchProfile(slot.member.user_id) },
              };
            } catch {
              return slot;
            }
          })
        );
        if (!cancelled) setStanding({ ...nextStanding, slots: enrichedSlots });
      } catch {
        // Best-effort: a failed league read must never break Home. The mission
        // just does not appear.
        if (!cancelled) setStanding(null);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Fetched once per user, not per render: Home re-renders on every progress
    // event, and a standing changes at most a few times a day.
  }, [userId]);

  return standing;
}
