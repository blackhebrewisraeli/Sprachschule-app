// Versioned acceptance of the Terms and Privacy Policy — language-blind.
//
// The AUTHORITY is public.legal_acceptances (20260929120000), written only by
// the accept_legal_terms RPC as auth.uid(). The two localStorage keys here are
// hints: one lets a known device skip the network, the other carries a ticked
// box across an OAuth redirect. Neither can make anyone "accepted" on its own
// except the device that already saw the server confirm it.
import { getSupabase } from './auth.js';

/** Effective dates of the documents in src/components/legal. Bumping either re-asks everyone. */
export const TERMS_VERSION = '2026-09-29';
export const PRIVACY_VERSION = '2026-09-29';

/**
 * The page's "Last Updated" line, from a document version: '2026-09-29' →
 * 'Last Updated: September 29, 2026'. Derived, never typed, so the copy and the
 * version that re-asks acceptance cannot drift. UTC, so the day is the same in
 * every reader's time zone.
 */
export function lastUpdatedLine(version) {
  const date = new Date(`${version}T00:00:00Z`);
  const text = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
  return `Last Updated: ${text}`;
}

export const LEGAL_ACCEPTED_KEY = 'deutsch-app-legal-accepted-v1';
export const LEGAL_INTENT_KEY = 'deutsch-app-legal-intent-v1';
export const INTENT_TTL_MS = 30 * 60 * 1000;

function read(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Blocked storage: the server is still the record; we just re-check next time.
  }
}

const isCurrent = (v) => v?.terms === TERMS_VERSION && v?.privacy === PRIVACY_VERSION;

export function hintCovers(userId) {
  const hint = read(LEGAL_ACCEPTED_KEY);
  return Boolean(userId) && hint?.userId === userId && isCurrent(hint);
}

export function writeAcceptedHint(userId) {
  write(LEGAL_ACCEPTED_KEY, { userId, terms: TERMS_VERSION, privacy: PRIVACY_VERSION });
}

export function recordIntent(now = Date.now()) {
  write(LEGAL_INTENT_KEY, { terms: TERMS_VERSION, privacy: PRIVACY_VERSION, at: now });
}

export function clearIntent() {
  try {
    localStorage.removeItem(LEGAL_INTENT_KEY);
  } catch {
    // nothing to clear
  }
}

export function hasValidIntent(now = Date.now()) {
  const intent = read(LEGAL_INTENT_KEY);
  return isCurrent(intent) && typeof intent.at === 'number' && now - intent.at <= INTENT_TTL_MS;
}

async function client() {
  const c = await getSupabase();
  if (!c) throw new Error('No backend configured.');
  return c;
}

export async function fetchAcceptances(userId) {
  const c = await client();
  const { data, error } = await c
    .from('legal_acceptances')
    .select('terms_version, privacy_version')
    .eq('user_id', userId);
  if (error) throw error;
  const rows = data ?? [];
  return {
    current: rows.some(
      (r) => r.terms_version === TERMS_VERSION && r.privacy_version === PRIVACY_VERSION
    ),
    hasPrior: rows.length > 0,
  };
}

export async function acceptCurrentTerms() {
  const c = await client();
  const { error } = await c.rpc('accept_legal_terms', {
    p_terms_version: TERMS_VERSION,
    p_privacy_version: PRIVACY_VERSION,
  });
  if (error) throw error;
}
