import { clientKey } from './ratelimit.js';
import { serviceClient } from './supabase.js';
import { assertSignupAllowed, readServerSignupAllowlist } from '../../src/lib/signupAllowlist.js';

// Optional identity for the AI lane. Unlike requireAuth, a missing header is a
// GUEST, and an auth OUTAGE degrades to a guest instead of a 401: only a token
// GoTrue actually rejected is the caller's problem (spec §6.3, §6.8). A 429 is
// GoTrue throttling this server, not a verdict on the token, so it counts as an
// outage too — otherwise every signed-in learner would be told their session
// expired.
const isOutage = (error) =>
  error?.name === 'AuthRetryableFetchError' || error?.status === 429 || (error?.status ?? 0) >= 500;

const unauthorized = (message) => ({ code: 'unauthorized', message });

// Never the token, the address or the user: the reason is all ops needs.
function degraded(guest, reason) {
  console.warn(JSON.stringify({ event: 'ai_caller_degraded', reason }));
  return { ...guest, degraded: true };
}

/**
 * @returns {Promise<{ kind: 'guest' | 'user', key: string, userId?: string, degraded?: boolean }>}
 * @throws {{ code: 'unauthorized' | 'signup_not_allowed', message: string }}
 */
export async function resolveCaller(req, client = serviceClient()) {
  const header = req.headers?.authorization ?? '';
  const guest = { kind: 'guest', key: clientKey(req) };
  if (!header) return guest;
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw unauthorized('Malformed authorization header.');
  if (!client) return degraded(guest, 'no_data_lane');

  let result;
  try {
    result = await client.auth.getUser(token);
  } catch {
    return degraded(guest, 'auth_unreachable');
  }
  const { data, error } = result ?? {};
  if (error) {
    if (isOutage(error)) return degraded(guest, 'auth_unreachable');
    throw unauthorized('Invalid or expired token.');
  }
  if (!data?.user?.id) throw unauthorized('Invalid or expired token.');
  assertSignupAllowed(data.user, readServerSignupAllowlist(process.env));
  return { kind: 'user', userId: data.user.id, key: `user:${data.user.id}` };
}
