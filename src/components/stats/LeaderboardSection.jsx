import { useEffect, useRef, useState, Fragment } from 'react';
import { Users, AlertTriangle, ArrowDown, ArrowUp } from 'lucide-react';
import { useAuth, getSupabase } from '../../lib/auth.js';
import { joinLeague, refreshLeague, fetchStandings, LEAGUES_ENABLED } from '../../lib/leagues.js';
import { LEAGUE_SIZE, zoneCounts } from '../../lib/leagueZones.js';
import { weekRemaining } from '../../lib/leagueCountdown.js';
import { COLORS, FONTS, FONT_SIZE, SPACE } from '../../lib/theme.js';
import StatusNote from '../ui/StatusNote';
import { LeagueDivider, LeagueEmptyRow, LeaguePanel, LeagueRow } from '../league/LeagueTable';
import { leagueCopy } from '../league/leagueFormat';

const SPARSE_BELOW = 5; // show the "still filling up" note under this many members

// The standings table.
//
// It no longer prints the tier. It used to open with `<h3>{TIER} League</h3>`,
// which was the page's SECOND league display — the profile card above it stated
// a tier of its own, from a different source, and across a settle week the two
// disagreed. This section is the one place that knows which league the learner
// is really in this week (joinLeague resolves it), so it reports that upward
// through `onLeague` and the profile card renders it. One fetch, one tier, no
// way for the page to contradict itself.
//
// It draws the SAME rows as Home's preview (league/LeagueTable), so the two
// surfaces cannot drift into different pictures of one league again. Every
// member is listed, and every seat the cohort has not filled yet — a league
// holds LEAGUE_SIZE — is drawn as an open-seat row below them, so a new league
// reads as "room to climb" rather than as a short, finished list.
//
// @param onLeague — called with {tier, leagueId, rank, cohortSize} once the
//   standings resolve, and with null on failure. Optional: this section still
//   renders standalone.
// @param selfProfile — the caller's own profile row, if the page has it. The
//   standings read carries handles only, so without it every row — yours
//   included — falls back to its @handle and generated avatar.
export default function LeaderboardSection({ onSelectUser, onLeague, selfProfile = null }) {
  const { user } = useAuth();
  const userId = user?.id;
  const [state, setState] = useState({ status: 'idle', league: null, rows: [] });
  const [nonce, setNonce] = useState(0);

  // Held in a ref, NOT in the effect's dependency list. joinLeague() is a
  // WRITE; a parent that passes an inline arrow would give this callback a new
  // identity on every render and re-run the join each time. The ref keeps the
  // latest callback without making the effect depend on it.
  const onLeagueRef = useRef(onLeague);
  useEffect(() => {
    onLeagueRef.current = onLeague;
  }, [onLeague]);

  // Depend on the stable id, not the user object — a fresh object identity on
  // re-render would otherwise re-fire join/refresh and could double-create a
  // membership. `nonce` is the one deliberate exception: it only advances on
  // an explicit Retry click, and joinLeague is idempotent per period (it
  // looks up the caller's existing membership first, and recovers from a
  // unique-constraint race), so replaying the effect here is the same shape
  // as leaving the tab and coming back, which already unmounts and remounts
  // this component.
  useEffect(() => {
    if (!LEAGUES_ENABLED || !userId) return;
    // Retry re-runs this effect via `nonce` without remounting the section, so
    // a stale error from the previous attempt must be cleared here — otherwise
    // it stays 'error' and renders back over the refetch, and a second
    // failure looks identical to the first (nothing unmounts, nothing is
    // announced again).
    setState((s) => (s.status === 'error' ? { status: 'idle', league: null, rows: [] } : s));
    let cancelled = false;
    (async () => {
      try {
        const league = await joinLeague();
        await refreshLeague();
        const rows = await fetchStandings(await getSupabase(), league.league_id);
        if (cancelled) return;
        setState({ status: 'ready', league, rows });
        // Position is DERIVED, not read: league_members.rank is written only by
        // the weekly settle cron and is NULL during the live week, so the only
        // truthful ordering is the one this list is already showing.
        const rank = rows.findIndex((r) => r.user_id === userId) + 1;
        onLeagueRef.current?.({
          tier: league.tier,
          leagueId: league.league_id,
          rank: rank > 0 ? rank : null,
          cohortSize: rows.length,
        });
        // Reward claiming lives in the app-load useLeagueRewards hook so winners
        // are credited even without opening this tab.
      } catch {
        if (cancelled) return;
        setState({ status: 'error', league: null, rows: [] });
        // Tell the parent the tier is unknown rather than leaving a stale one
        // on screen beside an error note.
        onLeagueRef.current?.(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, nonce]);

  if (!LEAGUES_ENABLED) return null;

  if (!user) {
    return <StatusNote icon={Users}>Sign in to join a league and compete this week.</StatusNote>;
  }

  if (state.status === 'error') {
    return (
      <StatusNote
        tone="error"
        icon={AlertTriangle}
        action={{ label: 'Retry', onClick: () => setNonce((n) => n + 1) }}
      >
        Couldn&apos;t load your league.
      </StatusNote>
    );
  }
  if (state.status !== 'ready') {
    return <p style={{ color: COLORS.mute, padding: SPACE[4] }}>Loading league…</p>;
  }

  const copy = leagueCopy();
  const n = state.rows.length;
  // Promotion/relegation zones come from the SAME logic the settle job uses, so
  // the dividers reflect exactly who will advance/drop this week.
  const { promote, demote } = zoneCounts(n);
  const relegationStart = n - demote; // index of the first relegated row
  const openSeats = Math.max(0, LEAGUE_SIZE - n);
  const countdown = weekRemaining(state.league.period_start);

  return (
    <LeaguePanel
      testId="profile-leaderboard"
      // "Rangliste", not "<Tier> League". The tier belongs to the league card
      // above this section and is stated once, there.
      title="Rangliste"
      aside={countdown.ended ? 'Settling soon' : `Ends in ${countdown.label}`}
      listLabel="League standings"
      padding={SPACE[3]}
      footer={
        n < SPARSE_BELOW ? (
          <p
            style={{
              margin: `${SPACE[3]}px ${SPACE[1]}px 0`,
              fontFamily: FONTS.body,
              fontSize: FONT_SIZE.base,
              color: COLORS.mute,
            }}
          >
            Your league is still filling up — more learners will join this week.
          </p>
        ) : null
      }
    >
      {state.rows.map((row, i) => {
        const isMe = row.user_id === userId;
        const showPromote = promote > 0 && promote < n && i === promote;
        const showRelegate = demote > 0 && relegationStart > promote && i === relegationStart;
        return (
          <Fragment key={row.user_id}>
            {showPromote && <LeagueDivider text="Promotion" color={COLORS.green} icon={ArrowUp} />}
            {showRelegate && (
              <LeagueDivider text="Relegation" color={COLORS.red} icon={ArrowDown} />
            )}
            <LeagueRow
              rank={i + 1}
              member={isMe && selfProfile ? { ...row, profile: selfProfile } : row}
              isMe={isMe}
              onSelect={() => onSelectUser(row.user_id)}
              copy={copy}
            />
          </Fragment>
        );
      })}
      {openSeats > 0 && (
        <LeagueDivider
          text={copy.leaderboardOpenSeats?.(openSeats) ?? `${openSeats} open`}
          color={COLORS.mute}
        />
      )}
      {Array.from({ length: openSeats }, (_, k) => (
        <LeagueEmptyRow key={`open-${n + k + 1}`} rank={n + k + 1} copy={copy} />
      ))}
    </LeaguePanel>
  );
}
