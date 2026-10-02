// Origin allow-list (mandatory in production via the ALLOWED_ORIGINS env var,
// unset elsewhere). A present-but-unlisted Origin is rejected; an absent
// Origin passes — non-browser clients can omit or spoof it, so per-identity
// rate limiting remains the real abuse control.

// The Capacitor webview's own origin: iOS serves the bundle from
// capacitor://localhost, Android from https://localhost. Allowed in code rather
// than through ALLOWED_ORIGINS because the app cannot work without them, and a
// Production env var is one dashboard edit away from locking every installed
// copy out. No public website can be served from either origin.
export const NATIVE_APP_ORIGINS = ['capacitor://localhost', 'https://localhost'];

export function parseAllowedOrigins(raw) {
  return (raw || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

export function originAllowed(req, allowed = parseAllowedOrigins(process.env.ALLOWED_ORIGINS)) {
  const origin = req.headers.origin;
  if (allowed.length === 0 || !origin) return true;
  return allowed.includes(origin) || NATIVE_APP_ORIGINS.includes(origin);
}

// The web app calls /api same-origin and needs no CORS. The native app is
// cross-origin, so every endpoint it calls is wrapped in this: it answers the
// preflight and echoes the origin on the real response. No
// Allow-Credentials: auth is a bearer header, never a cookie.
export function withCors(handler) {
  return async function corsHandler(req, res) {
    const origin = req.headers?.origin;
    res.setHeader('Vary', 'Origin');
    if (NATIVE_APP_ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      // progressQueue reads Retry-After to back off a 429; the AI client reads
      // X-Quota-* to render the daily allowance, and X-Conversation-Saved to say
      // whether a tutor turn was kept.
      res.setHeader(
        'Access-Control-Expose-Headers',
        'Retry-After, X-Quota-Limit, X-Quota-Used, X-Quota-Reset, X-Quota-Tier, X-Conversation-Saved'
      );
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type');
        res.setHeader('Access-Control-Max-Age', '86400');
        return res.status(204).end();
      }
    }
    return handler(req, res);
  };
}
