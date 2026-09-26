// Copy for the Home personal hub.
//
// Lives in the pack for the same reason the mission copy does: PersonalHub
// knows fields, not phrases, so no German reaches src/components.

export const IDENTITY = {
  /** Greets by name when there is one, and stays warm when there is not. */
  greeting: (name) => (name ? `Guten Tag, ${name}` : 'Guten Tag'),

  /**
   * "Member since Jun 2026". Formatting lives here rather than in the
   * component because month names are language, not layout.
   */
  memberSince: (date) =>
    `Member since ${date.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}`,

  /** Names the level chip for a screen reader, which sees only "A2" otherwise. */
  levelLabel: (level) => `Level ${level}`,

  /**
   * Compact league preview below today's work on Home, and the row vocabulary
   * the Profile standings share with it. Home shows the podium while the
   * learner is on or next to it and switches to the "nearby" title once the
   * three rows are the places around them rather than the top three.
   */
  leaderboardTitle: 'Top 3',
  leaderboardLabel: 'Top 3 leaderboard',
  leaderboardNearbyTitle: 'Deine Liga',
  leaderboardNearbyLabel: 'League places around you',
  leaderboardPosition: (rank, size) => `#${rank} / ${size}`,
  leaderboardXp: (xp) => `${Number(xp ?? 0).toLocaleString('en-GB')} XP`,
  leaderboardYou: 'Du',
  leaderboardEmptySlot: 'Freier Platz',
  leaderboardOpenSeats: (count) => `${count} freie ${count === 1 ? 'Platz' : 'Plätze'}`,
  anonymousHandle: '@anonym',
};
