// The app's in-document routes (`#/…`), and the one question the shell asks
// of any other: is this a route we do not have?
//
// Pure and DOM-free, like legalRoute.js beside it, so the rule is testable
// without rendering App.

import { legalRouteFor } from './legalRoute';

// Settings lives inside the Profile tab. The hash keeps that view deep-linkable
// and reload-safe; the separate seventh nav slot is reserved for verified admins.
export const SETTINGS_HASH = '#/settings';

/**
 * True for a `#/…` route no screen answers to — which used to fall through to
 * Home silently, so a stale link looked like the app had ignored it.
 *
 * Only `#/…` is a route. Supabase hands auth results back as
 * `#access_token=…` or `#error=…`; those are not routes, and
 * AuthCallbackLanding has to keep seeing them.
 */
export function isUnknownHashRoute(hash = '') {
  if (!hash.startsWith('#/')) return false;
  // Trailing slashes are equivalent; a backward scan rather than a `/\/+$/`
  // regex, for the reason legalRoute.js gives.
  let end = hash.length;
  while (end > 2 && hash.charAt(end - 1) === '/') end -= 1;
  const route = hash.slice(0, end);
  if (route === '#/' || route === SETTINGS_HASH) return false;
  return legalRouteFor({ hash: route }) === null;
}
