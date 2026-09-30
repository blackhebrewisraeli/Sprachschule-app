// Firebase Cloud Messaging HTTP v1, the only push provider (owner decision;
// docs/superpowers/specs/2026-10-01-push-sender-design.md §9, §13).
//
// Stdlib only: the OAuth token is a service-account JWT signed with node:crypto
// and exchanged at Google's token endpoint, so no Google SDK ships in the
// function bundle. HTTP v1 has no batch send; the caller bounds concurrency.
import { createSign } from 'node:crypto';

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REQUEST_TIMEOUT_MS = 10000;
// Refresh this long before Google's expiry, so a token never dies mid-run.
const TOKEN_MARGIN_MS = 60000;
// One retry for a transient failure, waiting at most this long. Longer
// back-offs belong to the next hourly tick, not to a 300s function.
const MAX_RETRY_WAIT_MS = 5000;
const DEFAULT_RETRY_WAIT_MS = 1000;

/** Google refused (or could not be asked for) an access token. Nothing was sent. */
export class FcmAuthError extends Error {}

/**
 * FIREBASE_SERVICE_ACCOUNT holds the whole downloaded JSON key. Null when it is
 * absent or unusable, which callers treat as "not configured".
 */
export function parseServiceAccount(raw) {
  if (!raw) return null;
  try {
    const key = JSON.parse(raw);
    if (
      typeof key.project_id === 'string' &&
      typeof key.client_email === 'string' &&
      typeof key.private_key === 'string'
    ) {
      return {
        projectId: key.project_id,
        clientEmail: key.client_email,
        privateKey: key.private_key,
      };
    }
  } catch {
    // unparseable: not configured
  }
  return null;
}

const base64url = (text) => Buffer.from(text, 'utf8').toString('base64url');

/** RFC 7523 assertion for Google's token endpoint, scoped to FCM only. */
export function signAssertion({ clientEmail, privateKey }, nowSeconds) {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: clientEmail,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: nowSeconds,
      exp: nowSeconds + 3600,
    })
  );
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${claims}`)
    .sign(privateKey)
    .toString('base64url');
  return `${header}.${claims}.${signature}`;
}

/**
 * One failed FCM response → what the sender does about it (spec §13).
 *   dead    this token will never work again: delete the row
 *   retry   transient: another attempt may succeed
 *   quota   FCM asks for >= 1 minute of backoff: stop the run
 *   config  Firebase-side setup (APNs key, wrong project): keep tokens, report
 *   fatal   our request or credentials are wrong: stop the run
 */
export function classifyFcmError(status, body) {
  const error = body?.error ?? {};
  const details = Array.isArray(error.details) ? error.details : [];
  const code =
    details.find((detail) => typeof detail?.errorCode === 'string')?.errorCode ??
    error.status ??
    `HTTP_${status}`;
  const aboutToken =
    /registration token/i.test(error.message ?? '') ||
    details.some((detail) =>
      (detail?.fieldViolations ?? []).some((violation) => violation?.field === 'message.token')
    );

  if (code === 'UNREGISTERED') return { outcome: 'dead', code };
  if (code === 'INVALID_ARGUMENT') return { outcome: aboutToken ? 'dead' : 'fatal', code };
  // Every token comes from this app's one Firebase project, so a mismatch means
  // the SERVER's credentials point elsewhere. Deleting would wipe live tokens.
  if (code === 'SENDER_ID_MISMATCH' || code === 'THIRD_PARTY_AUTH_ERROR')
    return { outcome: 'config', code };
  if (code === 'QUOTA_EXCEEDED' || status === 429) return { outcome: 'quota', code };
  if (status >= 500) return { outcome: 'retry', code };
  return { outcome: 'fatal', code };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createFcmClient({
  serviceAccount,
  fetchImpl = fetch,
  now = Date.now,
  sleep = wait,
}) {
  let cached = null; // { token, expiresAt } — survives while the instance is warm

  async function accessToken() {
    if (cached && cached.expiresAt - TOKEN_MARGIN_MS > now()) return cached.token;
    const assertion = signAssertion(serviceAccount, Math.floor(now() / 1000));
    let response;
    try {
      response = await fetchImpl(TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion,
        }).toString(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new FcmAuthError(`token request failed: ${error?.name ?? 'error'}`);
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok || typeof body.access_token !== 'string') {
      throw new FcmAuthError(`token exchange refused (HTTP ${response.status})`);
    }
    cached = {
      token: body.access_token,
      expiresAt: now() + (Number(body.expires_in) || 3600) * 1000,
    };
    return cached.token;
  }

  async function attempt(message) {
    const token = await accessToken();
    let response;
    try {
      response = await fetchImpl(
        `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(serviceAccount.projectId)}/messages:send`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ message }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }
      );
    } catch {
      // Timeout or network: FCM may or may not have accepted it. A retry is
      // safe to show because the message carries a collapse key (spec §10).
      return { outcome: 'retry', code: 'NETWORK', retryAfterMs: null };
    }
    if (response.ok) return { outcome: 'sent' };
    const body = await response.json().catch(() => null);
    const seconds = Number(response.headers.get('retry-after'));
    return {
      ...classifyFcmError(response.status, body),
      retryAfterMs: Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null,
    };
  }

  async function send(message) {
    const first = await attempt(message);
    if (first.outcome === 'sent') return first;
    if (first.outcome !== 'retry') return { outcome: first.outcome, code: first.code };
    await sleep(Math.min(first.retryAfterMs ?? DEFAULT_RETRY_WAIT_MS, MAX_RETRY_WAIT_MS));
    const second = await attempt(message);
    return second.outcome === 'sent' ? second : { outcome: second.outcome, code: second.code };
  }

  return { accessToken, send };
}
