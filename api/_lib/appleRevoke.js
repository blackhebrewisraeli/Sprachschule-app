// Sign in with Apple token revocation (App Review 5.1.1(v)): an app that offers
// Sign in with Apple must revoke the learner's Apple token when they delete
// their account. Supabase's user deletion does not, so the delete handler does
// it first. Stdlib only, like fcm.js: the client secret is an ES256 JWT signed
// with node:crypto, so no JWT library ships in the function bundle.
// Runbook: docs/AUTH_APPLE_OAUTH_RUNBOOK.md.
import { createPrivateKey, sign } from 'node:crypto';

const REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const AUDIENCE = 'https://appleid.apple.com';
const REQUEST_TIMEOUT_MS = 10000;
// Apple allows up to six months; one request needs seconds.
const SECRET_LIFETIME_SEC = 300;

/**
 * APPLE_SERVICES_ID, APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY (the
 * downloaded .p8 PEM; `\n` escapes are accepted because dashboards flatten
 * newlines). Null unless all four are present and the key parses.
 */
export function readAppleConfig(env = process.env) {
  const { APPLE_SERVICES_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY } = env;
  if (!APPLE_SERVICES_ID || !APPLE_TEAM_ID || !APPLE_KEY_ID || !APPLE_PRIVATE_KEY) return null;
  try {
    const key = createPrivateKey(APPLE_PRIVATE_KEY.replace(/\\n/g, '\n'));
    return { servicesId: APPLE_SERVICES_ID, teamId: APPLE_TEAM_ID, keyId: APPLE_KEY_ID, key };
  } catch {
    return null;
  }
}

const b64url = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');

/** The `client_secret` Apple expects: a short-lived ES256 JWT (RFC 7515 raw r||s). */
export function buildClientSecret({ servicesId, teamId, keyId, key }, nowSeconds) {
  const header = b64url({ alg: 'ES256', kid: keyId });
  const claims = b64url({
    iss: teamId,
    iat: nowSeconds,
    exp: nowSeconds + SECRET_LIFETIME_SEC,
    aud: AUDIENCE,
    sub: servicesId,
  });
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), {
    key,
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  return `${header}.${claims}.${signature}`;
}

/**
 * Revoke one Apple refresh token. The result says what the caller should do:
 *   'revoked'   — Apple accepted it, or said the token is already invalid
 *                 (`invalid_grant`: revoked from Apple ID settings, or expired).
 *                 Either way nothing is left to revoke.
 *   'config'    — Apple rejected OUR credentials (`invalid_client`). Retrying
 *                 cannot help; the owner has to fix the key or Services ID.
 *   'transient' — network failure, timeout, 5xx or 429. Safe to retry.
 * The token is never logged, here or by callers.
 */
export async function revokeAppleToken(config, refreshToken, { fetchImpl = fetch, now } = {}) {
  const nowSeconds = now ?? Math.floor(Date.now() / 1000);
  const body = new URLSearchParams({
    client_id: config.servicesId,
    client_secret: buildClientSecret(config, nowSeconds),
    token: refreshToken,
    token_type_hint: 'refresh_token',
  });
  let res;
  try {
    res = await fetchImpl(REVOKE_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    return { outcome: 'transient' };
  }
  if (res.ok) return { outcome: 'revoked' };
  if (res.status === 429 || res.status >= 500) return { outcome: 'transient' };
  const error = await res
    .json()
    .then((b) => b?.error)
    .catch(() => null);
  if (error === 'invalid_grant') return { outcome: 'revoked' };
  return { outcome: 'config', status: res.status, error: error ?? null };
}

/** True when this Supabase user signed up or signed in with Apple. */
export function hasAppleIdentity(user) {
  const meta = user?.app_metadata;
  if (meta?.provider === 'apple' || meta?.providers?.includes?.('apple')) return true;
  return Boolean(user?.identities?.some?.((i) => i?.provider === 'apple'));
}
