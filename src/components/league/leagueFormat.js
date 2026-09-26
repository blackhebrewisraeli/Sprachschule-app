import { activePack } from '../../packs';

// What a league row says, as opposed to how it looks (LeagueTable). Kept apart
// so the components file exports only components.

// Columns: rank bubble · avatar · name · XP. The name track is minmax(0, 1fr)
// so a long handle ellipsizes instead of widening the row past 320px.
export const LEAGUE_ROW_COLUMNS = '24px 28px minmax(0, 1fr) auto';

export function leagueCopy() {
  return activePack.content.identity ?? {};
}

function handleLabel(handle, fallback) {
  const value = typeof handle === 'string' ? handle.trim().replace(/^@+/, '') : '';
  return value ? `@${value}` : fallback;
}

/**
 * What a league row is allowed to print for a member.
 *
 * Private profiles deliberately lead with the public identifier rather than
 * the chosen full name. A row without a fetched profile (the Profile standings
 * read handles only) falls back to the same @handle.
 */
export function leagueDisplayName(member, copy = leagueCopy()) {
  const profile = member?.profile;
  const handle = profile?.handle || member?.handle;
  const fallback = copy.anonymousHandle ?? '@anonym';
  if (profile?.is_private) return handleLabel(handle, fallback);

  const display = typeof profile?.display_name === 'string' ? profile.display_name.trim() : '';
  return display || handleLabel(handle, fallback);
}

export function leagueXpLabel(xp, copy = leagueCopy()) {
  return copy.leaderboardXp?.(xp) ?? `${xp ?? 0} XP`;
}
