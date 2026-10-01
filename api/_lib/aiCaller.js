import { clientKey } from './ratelimit.js';
import { serviceClient } from './supabase.js';
import { assertSignupAllowed, readServerSignupAllowlist } from '../../src/lib/signupAllowlist.js';

// Optional identity for the AI lane. Unlike requireAuth, a missing header is a
// GUEST, and an auth OUTAGE degrades to a guest instead of a 401: only a token
// GoTrue actually rejected is the caller's problem (spec §6.3, §6.8).
//
// So a 401 needs a definite 4xx verdict on the token. Everything else is an
// outage: the network, a 5xx, GoTrue throttling this server (429), and a
// non-JSON error body, which supabase-js reports as AuthUnknownError with no
// status at all. Misreading an outage as a rejection would tell every
// signed-in learner their session expired; misreading the other way only
// serves them as a guest.
const isRejection = (error) => error?.status >= 400 && error.status < 500 && error.status !== 429;

// A hung GoTrue would otherwise hold every signed-in AI call until the
// function's maxDuration. Signed-in calls did not wait on GoTrue before A3.
const AUTH_TIMEOUT_MS = 3000;
const TIMED_OUT = Symbol('timed out');

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
  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(resolve, AUTH_TIMEOUT_MS, TIMED_OUT);
  });
  try {
    result = await Promise.race([client.auth.getUser(token), timeout]);
  } catch {
    return degraded(guest, 'auth_unreachable');
  } finally {
    clearTimeout(timer);
  }
  if (result === TIMED_OUT) return degraded(guest, 'auth_timeout');
  const { data, error } = result ?? {};
  if (error) {
    if (!isRejection(error)) return degraded(guest, 'auth_unreachable');
    throw unauthorized('Invalid or expired token.');
  }
  if (!data?.user?.id) throw unauthorized('Invalid or expired token.');
  assertSignupAllowed(data.user, readServerSignupAllowlist(process.env));
  return { kind: 'user', userId: data.user.id, key: `user:${data.user.id}` };
}
