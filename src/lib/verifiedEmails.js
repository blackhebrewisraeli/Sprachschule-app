/**
 * Verified emails on a Supabase auth user.
 *
 * Shared by server identity classification (`api/_lib/roles.js`) and the
 * optional signup allowlist so "is this address proven?" has one definition.
 * Unverified addresses never count, even when they match an allowlist.
 */

export function normalizeEmail(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().toLowerCase();
}

// The provider's own word only. An `email` identity is NOT proof by itself: a
// password signup creates one before the address is confirmed. A completed
// magic link / OTP is proven by the user's `email_confirmed_at` (checked in
// verifiedEmailsFromUser) and by GoTrue marking the identity verified.
function identityEmailVerified(identity) {
  if (!identity || typeof identity !== 'object') return false;
  const data =
    identity.identity_data && typeof identity.identity_data === 'object'
      ? identity.identity_data
      : {};
  return data.email_verified === true || data.email_verified === 'true';
}

/**
 * Verified emails on this user: the primary when `email_confirmed_at` is set,
 * plus identities whose provider vouches for the address (`email_verified`).
 * Unverified addresses are omitted even when they match an allowlist.
 *
 * @param {object | null | undefined} user
 * @returns {string[]}
 */
export function verifiedEmailsFromUser(user) {
  const emails = new Set();
  if (!user || typeof user !== 'object') return [];

  const primary = normalizeEmail(user.email);
  if (primary && user.email_confirmed_at) emails.add(primary);

  const identities = Array.isArray(user.identities) ? user.identities : [];
  for (const identity of identities) {
    if (!identityEmailVerified(identity)) continue;
    const data =
      identity.identity_data && typeof identity.identity_data === 'object'
        ? identity.identity_data
        : {};
    const email = normalizeEmail(data.email || identity.email);
    if (email) emails.add(email);
  }
  return [...emails];
}
