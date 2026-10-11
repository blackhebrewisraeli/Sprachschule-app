/**
 * Closed-beta admission — what the app knows about it.
 *
 * WHO MAY CREATE AN ACCOUNT is decided by Supabase Auth, not here: the
 * before-user-created hook refuses any email missing from
 * `private.beta_signup_allowlist` before `auth.users` is written
 * (supabase/migrations/20261011120000_beta_signup_allowlist_hook.sql). The
 * client carries no copy of that list — a `VITE_` list was inlined into the
 * public bundle, publishing every tester's address — so it only recognises
 * the hook's refusal and explains it.
 *
 * `SIGNUP_EMAIL_ALLOWLIST` (server env, never `VITE_`) remains a second gate
 * in `requireAuth` for accounts that existed before the hook. Unset or empty
 * means it is off. Exact match after trim + lowercase, verified emails only —
 * the same recipe as the admin allowlist in `api/_lib/roles.js`.
 */
import { normalizeEmail, verifiedEmailsFromUser } from './verifiedEmails.js';

export const SIGNUP_NOT_ALLOWED_CODE = 'signup_not_allowed';

export const SIGNUP_NOT_ALLOWED_MESSAGE =
  "This email isn't invited to the beta. Ask the owner for access.";

/**
 * The hook's refusal, byte for byte. GoTrue forwards only a status and this
 * message — a hook cannot set an error code — so the text is the contract.
 * signupAllowlist.test.js asserts the migration still says exactly this.
 */
export const BETA_SIGNUP_DENIED_MESSAGE = 'Sign-up is invite-only during the beta.';

/**
 * Is this text (an SDK error message, or an OAuth callback's decoded
 * `error_description`) the hook's refusal? Query strings encode spaces as `+`,
 * which decodeURIComponent leaves alone, so both spellings are accepted.
 *
 * @param {unknown} text
 */
export function isBetaSignupDenial(text) {
  if (typeof text !== 'string') return false;
  return text.replace(/\+/g, ' ').toLowerCase().includes(BETA_SIGNUP_DENIED_MESSAGE.toLowerCase());
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
export function parseSignupAllowlist(raw) {
  if (typeof raw !== 'string') return [];
  return [...new Set(raw.split(',').map(normalizeEmail).filter(Boolean))];
}

/** Empty / unset list = gate off. */
export function signupAllowlistActive(list) {
  return Array.isArray(list) && list.length > 0;
}

/**
 * May this authenticated user use the API against `list`?
 *
 * Open list → yes. Closed list → only a *verified* address on the list;
 * an unverified mailbox that matches is denied, same rule as admin
 * classification.
 *
 * @param {object | null | undefined} user
 * @param {string[]} list
 */
export function userAllowedBySignupList(user, list) {
  if (!signupAllowlistActive(list)) return true;
  return verifiedEmailsFromUser(user).some((email) => list.includes(email));
}

export function readServerSignupAllowlist(env) {
  return parseSignupAllowlist(env?.SIGNUP_EMAIL_ALLOWLIST);
}

/**
 * Server gate used by `requireAuth`. Throws the envelope `accountHandler`
 * already maps through `sendError`.
 *
 * @param {object | null | undefined} user
 * @param {string[]} list
 */
export function assertSignupAllowed(user, list) {
  if (userAllowedBySignupList(user, list)) return;
  throw { code: SIGNUP_NOT_ALLOWED_CODE, message: SIGNUP_NOT_ALLOWED_MESSAGE };
}
