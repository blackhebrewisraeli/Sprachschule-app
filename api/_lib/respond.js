// The error envelope — the single definition of machine codes → HTTP status.
// Contract: docs/api/README.md. `unauthorized` is reserved for phase B2 (JWTs).

export const ERROR_CODES = {
  bad_request: 400,
  unauthorized: 401,
  // Distinct from `unauthorized`: the token IS valid, but the operation is
  // destructive enough to demand a recent authentication. The client must
  // re-authenticate and retry rather than treat the session as expired.
  reauth_required: 401,
  // The learner signed in with Apple, so deleting the account must revoke their
  // Apple token, and only a fresh Apple sign-in carries one. The client sends
  // them through Apple again rather than deleting without revoking.
  apple_token_required: 401,
  forbidden: 403,
  // Distinct from `forbidden`: the token IS valid, but this verified email is
  // not on SIGNUP_EMAIL_ALLOWLIST. The client must sign the user out and
  // explain closed beta rather than treat it as an origin/admin miss.
  signup_not_allowed: 403,
  method_not_allowed: 405,
  rate_limited: 429,
  // Distinct from rate_limited: the burst limiter is about floods; this is the
  // daily product allowance (spec §6.9).
  quota_exhausted: 429,
  upstream_error: 502,
  server_error: 500,
};

export function sendError(res, code, message, extraHeaders = {}, details = {}) {
  for (const [key, value] of Object.entries(extraHeaders)) {
    res.setHeader(key, value);
  }
  return res.status(ERROR_CODES[code]).json({ error: { ...details, code, message } });
}
