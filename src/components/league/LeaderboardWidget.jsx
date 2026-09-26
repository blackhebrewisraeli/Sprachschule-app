import { LeagueEmptyRow, LeaguePanel, LeagueRow } from './LeagueTable';
import { leagueCopy } from './leagueFormat';

// Home's league glance: exactly three places, chosen around the learner by
// leagueWindow() — the podium while they are on or next to it, otherwise the
// places either side of them. A place nobody holds yet (a cohort of one or
// two) is drawn as an open seat, so the preview never changes height.
//
// Read-only: nothing here is pressable. PersonalHub renders no controls, and
// the full, clickable standings live on the Profile tab.
export default function LeaderboardWidget({ slots = [], rank = null, cohortSize = null, userId }) {
  const copy = leagueCopy();
  if (slots.length === 0) return null;

  // "Top 3" is only true when the window starts at first place.
  const podium = slots[0]?.rank === 1;
  const title = podium
    ? (copy.leaderboardTitle ?? 'Top 3')
    : (copy.leaderboardNearbyTitle ?? 'Your league');
  const listLabel = podium
    ? (copy.leaderboardLabel ?? 'Top 3 leaderboard')
    : (copy.leaderboardNearbyLabel ?? 'League places around you');
  const position =
    rank && cohortSize ? (copy.leaderboardPosition?.(rank, cohortSize) ?? `#${rank}`) : null;

  return (
    <LeaguePanel
      testId="home-leaderboard-widget"
      title={title}
      aside={position}
      listLabel={listLabel}
    >
      {slots.map(({ rank: place, member }) =>
        member ? (
          <LeagueRow
            key={member.user_id}
            rank={place}
            member={member}
            isMe={Boolean(userId) && member.user_id === userId}
            copy={copy}
          />
        ) : (
          <LeagueEmptyRow key={`open-${place}`} rank={place} copy={copy} />
        )
      )}
    </LeaguePanel>
  );
}
