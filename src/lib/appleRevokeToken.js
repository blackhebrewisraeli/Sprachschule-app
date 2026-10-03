// Apple token hand-off for account deletion (docs/AUTH_APPLE_OAUTH_RUNBOOK.md).
//
// Apple requires the learner's Apple token to be revoked when they delete their
// account. Supabase hands the provider's refresh token to the client exactly
// once, in the session that finishes an Apple sign-in, and never again. Account
// deletion already demands a sign-in within the last 15 minutes
// (REAUTH_MAX_AGE_SEC), so an Apple learner re-authenticates with Apple first,
// and that fresh session is where the token comes from.
//
// It is kept in sessionStorage only: gone with the tab, never synced, never in
// the account blob, and removed on sign-out and after a successful deletion. It
// is a credential for revoking, not for signing in.
const KEY = 'deutsch-apple-revoke-token';

/** Remember the token from a session that just completed an Apple sign-in. */
export function captureAppleRefreshToken(session) {
  const token = session?.provider_refresh_token;
  if (!token || session?.user?.app_metadata?.provider !== 'apple') return;
  try {
    sessionStorage.setItem(KEY, token);
  } catch {
    // blocked storage: deletion then asks the learner to sign in with Apple again
  }
}

export function readAppleRefreshToken() {
  try {
    return sessionStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

export function clearAppleRefreshToken() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
}
