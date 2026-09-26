// Which three places Home's league preview shows. Pure — no imports, no I/O.
//
// Home is a glance, not the standings: it always prints exactly THREE rows, and
// which three depends on where the learner is, because a "Top 3" that never
// contains you says nothing about your week once you are fourth.
//
//   rank 1 or 2            → places 1, 2, 3
//   rank 3, last in league → places 1, 2, 3
//   rank 3, not last       → places 2, 3, 4
//   rank > 3, last         → the two places above you, then you
//   rank > 3, not last     → one place above you, you, one place below
//
// Rank 3 is not a special case of its own: "last looks up two, everyone else
// keeps a neighbour on each side" produces both of its rows. Only ranks 1 and 2
// are pinned to the top, because there is no second place above them to show.
//
// A cohort smaller than three still yields three slots; the missing places come
// back as `member: null` so the UI can draw an open seat instead of shrinking.

export const HOME_WINDOW_SIZE = 3;

/**
 * The first place Home shows for a learner at `rank` in a cohort of `cohortSize`.
 * @param {number} rank        1-based position in the cohort
 * @param {number} cohortSize  members in the cohort
 * @returns {number} 1-based first place of the window
 */
export function windowStart(rank, cohortSize) {
  if (rank <= 2) return 1;
  return rank >= cohortSize ? rank - 2 : rank - 1;
}

/**
 * Home's three league slots around the caller.
 *
 * @param {Array<{user_id: string}>} rows  the cohort, already ordered by weekly_xp desc
 * @param {string} userId                  the caller
 * @returns {{rank: number, slots: Array<{rank: number, member: object|null}>}|null}
 *   null when the caller is not in `rows`.
 */
export function leagueWindow(rows, userId) {
  const list = Array.isArray(rows) ? rows : [];
  const rank = list.findIndex((row) => row?.user_id === userId) + 1;
  if (rank === 0) return null;

  const start = windowStart(rank, list.length);
  const slots = Array.from({ length: HOME_WINDOW_SIZE }, (_, i) => {
    const place = start + i;
    return { rank: place, member: list[place - 1] ?? null };
  });
  return { rank, slots };
}
