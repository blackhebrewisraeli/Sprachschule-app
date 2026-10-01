import { getAccessToken, mayHaveSession, refreshAccessToken } from './auth.js';
import { apiUrl } from './apiUrl.js';

export const SESSION_EXPIRED_MESSAGE = 'Your session expired. Please sign in again and retry.';

/**
 * Call an authenticated endpoint, refreshing the token ONCE on a 401.
 *
 * A 401 means the token did not survive `auth.getUser()` on the server. The
 * token in local storage can be perfectly well-formed and still fail that
 * check, because GoTrue also requires the session behind it to exist — and a
 * sign-out anywhere else revokes it globally. Storage and PostgREST only check
 * the SIGNATURE, which is why an avatar's bytes upload fine and then the row
 * pointing at them cannot be saved.
 *
 * One refresh, one retry. Not a loop: if a fresh token is also rejected the
 * session is genuinely gone, and retrying only spends the learner's time
 * before telling them the same thing.
 *
 * Extracted from profile.js when the social lane became the second caller that
 * needed exactly this. Two copies of a refresh-once rule is how one of them
 * ends up looping, or not retrying at all.
 *
 * `optional` is for endpoints a guest may also call (the AI lane): with no
 * session the request goes out with no header instead of throwing. A guest
 * with no stored session never reads the token at all, because that would load
 * the Supabase chunk auth.js deliberately keeps off a guest's critical path.
 *
 * @returns {Promise<Response>} the response — callers decide what a non-ok
 *   status means, because "that handle is taken" and "no such account" are
 *   their endpoints' words, not this helper's.
 */
export async function authedFetch(url, init = {}, { optional = false } = {}) {
  // Resolved first: apiUrl throws on anything that is not one of our /api
  // paths, so a bad target never gets as far as reading the token.
  const target = apiUrl(url);
  const token = optional && !mayHaveSession() ? null : await getAccessToken();
  if (!token) {
    if (optional) return fetch(target, init);
    throw new Error('Please sign in again.');
  }

  const send = (bearer) =>
    fetch(target, {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${bearer}` },
    });

  let res = await send(token);
  if (res.status === 401) {
    const fresh = await refreshAccessToken();
    if (!fresh) throw new Error(SESSION_EXPIRED_MESSAGE);
    res = await send(fresh);
    if (res.status === 401) throw new Error(SESSION_EXPIRED_MESSAGE);
  }
  return res;
}

/**
 * The server's own wording for a failure, or `fallback`.
 *
 * Surfacing the endpoint's message rather than a generic one is the difference
 * between a fixable error and a baffling one — "That handle is taken" tells a
 * learner what to do next.
 */
export async function errorMessage(res, fallback) {
  const message = await res
    .json()
    .then((body) => body?.error?.message)
    .catch(() => null);
  return message ?? fallback;
}
