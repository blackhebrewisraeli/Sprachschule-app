import { getAccessToken } from './auth.js';
import { apiUrl } from './apiUrl.js';

export const LEAGUES_ENABLED = import.meta.env.VITE_LEAGUES_ENABLED === 'true';
// Re-exported, not redefined: TIER_NAMES lives in the pure leagueTier module
// so components can read it without importing this one (which owns the network
// calls and is therefore stubbed wholesale in component tests). Existing
// callers that import it from here keep working.
export { TIER_NAMES, tierName } from './leagueTier.js';

async function post(path) {
  const token = await getAccessToken();
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  });
  if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
  return res.json();
}

export function joinLeague() {
  return post('/api/v1/league/join');
}

export function refreshLeague() {
  return post('/api/v1/league/refresh');
}

export async function fetchProfile(userId) {
  const token = await getAccessToken();
  const res = await fetch(apiUrl(`/api/v1/league/profile?userId=${encodeURIComponent(userId)}`), {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`profile failed: ${res.status}`);
  return res.json();
}

// Every member's public identity (name, handle, avatar path) for one league, in
// one GET — what the Profile standings draw their rows from. Resolves an array
// of profile rows keyed by `user_id`.
export async function fetchLeagueProfiles(leagueId) {
  const token = await getAccessToken();
  const url = apiUrl(`/api/v1/league/profile?leagueId=${encodeURIComponent(leagueId)}`);
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`league profiles failed: ${res.status}`);
  return res.json();
}

export async function updateHandle(body) {
  const token = await getAccessToken();
  const res = await fetch(apiUrl('/api/v1/league/handle'), {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`handle update failed: ${res.status}`);
  return res.json();
}

// The caller's own settled results (RLS lets you read your own league_member rows).
export async function fetchMyResults(supabase, userId) {
  const { data, error } = await supabase
    .from('league_members')
    .select('league_id, rank, result')
    .eq('user_id', userId)
    .not('result', 'is', null);
  if (error) throw error;
  return data ?? [];
}

// The caller's membership for the CURRENT league week, or null if they have not
// joined one. An own-row read on league_members, plus the tier off the league
// it points at.
//
// The `leagues!inner(tier)` join is safe under RLS: the "read my leagues"
// policy is `is_league_member(id, auth.uid())`, so a member can read the row
// for their own league and nothing else. It is here because the tier is what
// Home's league badge renders, and the alternative — Home calling joinLeague
// to find out — is the write this function exists to avoid.
//
// Deliberately a READ. Home is the landing tab and must never join or refresh a
// league as a side effect of being opened — see useLeagueStanding.
export async function fetchMyMembership(supabase, userId, periodStart) {
  const { data, error } = await supabase
    .from('league_members')
    .select('league_id, weekly_xp, leagues!inner(tier)')
    .eq('user_id', userId)
    .eq('period_start', periodStart)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  // Flattened: callers want a membership, not a nested join shape. PostgREST
  // returns the embedded row as an object for a to-one relationship.
  return { league_id: data.league_id, weekly_xp: data.weekly_xp, tier: data.leagues?.tier ?? 0 };
}

// Standings via the RLS-scoped Supabase client (reads only the caller's league).
export async function fetchStandings(supabase, leagueId) {
  const { data, error } = await supabase
    .from('league_members')
    .select('user_id, handle, weekly_xp, rank')
    .eq('league_id', leagueId)
    .order('weekly_xp', { ascending: false });
  if (error) throw error;
  return data ?? [];
}
