/**
 * The compliance routes: the two legal documents, and the public account-deletion
 * page Google Play's Data safety form links to.
 *
 * Path-based (`/privacy`, `/terms`, `/delete-account`) because a legal document gets linked to
 * from outside the app and a bare path is what people paste. The hash forms
 * are accepted as well so a deep link still resolves where the host has no
 * SPA rewrite and `/privacy` would 404 on a cold load — in-app navigation
 * uses pushState and never touches the server either way.
 *
 * Pure and dependency-free so both the router and its tests can read it.
 */
export const LEGAL_ROUTES = {
  '/privacy': 'privacy',
  '/terms': 'terms',
  '/delete-account': 'delete-account',
};

/**
 * Strip trailing slashes with a single backward scan.
 *
 * Deliberately not `replace(/\/+$/, '')`. A `+` quantifier anchored at the end
 * backtracks: on a long run of slashes the engine retries from each position,
 * which is super-linear and what SonarCloud flags. This walks the string once,
 * never re-examines a character, and allocates one slice.
 */
function stripTrailingSlashes(value) {
  let end = value.length;
  while (end > 0 && value.charAt(end - 1) === '/') end -= 1;
  return value.slice(0, end);
}

/** @returns {'privacy'|'terms'|'delete-account'|null} the route for a location, or null. */
export function legalRouteFor({ pathname = '', hash = '' } = {}) {
  // Trailing slashes are equivalent: /privacy and /privacy/ are one route.
  const path = stripTrailingSlashes(pathname) || '/';
  if (LEGAL_ROUTES[path]) return LEGAL_ROUTES[path];
  // startsWith/slice rather than an anchored regex, for the same reason.
  const bare = hash.startsWith('#') ? hash.slice(1) : hash;
  const fromHash = stripTrailingSlashes(bare);
  if (LEGAL_ROUTES[fromHash]) return LEGAL_ROUTES[fromHash];
  return null;
}

/** The current route, read from `window`. Null outside a browser. */
export function currentLegalRoute() {
  if (typeof window === 'undefined') return null;
  return legalRouteFor(window.location);
}
