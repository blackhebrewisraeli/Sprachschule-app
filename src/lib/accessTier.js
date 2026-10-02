// The server-resolved access tier, as the client last learned it. A HINT for
// the UI (model picker ceiling, copy) — the AI lane re-decides the tier from
// entitlements on every call, so a wrong value here can never buy anything.
//
// Module-level state, a leaf with no imports: preference.js reads it without
// pulling in React or supabase-js. Same shape as xpEntitlement.js.
//   'guest' | 'free' | 'premium' | null (unknown)
let tier = null;

/** @param {'guest' | 'free' | 'premium' | null} next */
export function setAccessTier(next) {
  tier = next ?? null;
}

/** @returns {'guest' | 'free' | 'premium' | null} */
export function getAccessTier() {
  return tier;
}
