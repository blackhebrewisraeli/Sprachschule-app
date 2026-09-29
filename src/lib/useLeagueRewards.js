import { useEffect, useRef } from 'react';
import { loadState, saveState } from './storage.js';
import { todayKey } from './stats.js';
import { getSupabase } from './auth.js';
import { LEAGUES_ENABLED, fetchMyResults } from './leagues.js';
import { claimWinnerRewards, WINNER_BONUS_XP } from './leagueRewards.js';
import { stampSettings } from './settingsStamp.js';
import { markDirty } from './sync.js';

// Claims any unclaimed league-winner rewards into local state when a signed-in
// user loads the app — not only when they open the Leagues tab. Idempotent
// (claimWinnerRewards dedups via gamification.leagueClaimed), so running once
// per sign-in is enough; failures are swallowed so a reward claim never blocks
// the app. The credited bonus XP flows through the normal bonusXp → xpForDay →
// sync path; the gamification recompute picks up the badge on its next run.
//
// A claim MUST be stamped and pushed, not just saved. The claim set is the
// idempotency key, and saveState alone leaves it on this device only: the next
// reconcile pulls a server blob that has never heard of it, and the reward is
// awarded again on the following load (observed: +200 XP per refresh, forever).
// stampSettings gives the write an LWW clock; markDirty schedules the push.
// Nothing else does it for us — the claim credits bonusXp directly rather than
// emitting a progress event, so App's markDirty listener never fires.
//
// AND the claim set must have ARRIVED before we read it. Clear site data (or a
// second device, or a fresh browser) leaves `gamification.leagueClaimed` empty
// locally while the server's copy is intact and one reconcile away. Claiming
// from that empty set re-pays every past win: production showed four rank-1
// leagues re-awarded as +200 XP — Level 3 against a stats_daily with no rows.
// So, exactly like the placement gate, never decide from empty local state
// until the first reconcile of the session has FINISHED. `syncSettled` is the
// right signal rather than `lastSyncedAt`: a reconcile that failed settles too,
// and waiting on a success that will never come would disable claims offline.
//
// onClaimed(count, xp) fires once when a new win is claimed, so the caller can
// surface a celebration toast. It's held in a ref so passing a fresh inline
// callback each render does not re-trigger the effect.
//
// @param {boolean} [opts.syncEnabled] VITE_SYNC_ENABLED — is there a server the
//   claim set could still be coming from?
// @param {boolean} [opts.syncSettled] has the first reconcile of this session
//   finished (success or failure)?
export function useLeagueRewards(
  userId,
  onClaimed,
  { syncEnabled = false, syncSettled = false } = {}
) {
  const onClaimedRef = useRef(onClaimed);
  onClaimedRef.current = onClaimed;

  useEffect(() => {
    if (!LEAGUES_ENABLED || !userId) return undefined;
    // Sync is on and the merge has not landed: local `leagueClaimed` may be a
    // lie of omission. The effect re-runs when syncSettled flips true.
    if (syncEnabled && !syncSettled) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const results = await fetchMyResults(await getSupabase(), userId);
        if (cancelled) return;
        const cur = loadState() ?? {};
        const { state, claimedCount, changed } = claimWinnerRewards(cur, results, todayKey());
        if (!changed) return;
        saveState(state);
        // Only a real claim is a synced write. A `changed` with claimedCount 0
        // just corrected the derived, local-only stats.leagueWins — stamping
        // that would bump the shared settings clock for a field the server
        // never sees, and let this device win LWW over a peer's real edit.
        if (claimedCount > 0) {
          stampSettings();
          markDirty();
          if (onClaimedRef.current)
            onClaimedRef.current(claimedCount, claimedCount * WINNER_BONUS_XP);
        }
      } catch {
        // best-effort — never block the app on a reward claim
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, syncEnabled, syncSettled]);
}
