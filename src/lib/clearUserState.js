// Sign-out must not leave the previous account's progress in this browser.
// Theme is a per-device preference (themeMode.js), not account data, so it
// survives. Everything else in localStorage is user-specific: the state blob,
// CEFR level, sync baseline, tutorial/welcome flags, leftover auth tokens.
//
// Sequence is load-bearing:
//   0. forget this device's push registration — while the session still exists,
//      because the RPC that drops the token acts as the signed-in user. After
//      signOut it could not, and the device would keep ringing with the
//      previous account's streak and league pushes. Bounded and never throws,
//      so it cannot stall or fail the sign-out.
//   1. await supabase signOut — the session has to die first. Wiping storage
//      while still authenticated would let sync push an empty blob to the
//      account. Reloading before signOut resolves would leave the session.
//   2. clearUserLocalState — so the next hydrate cannot restore XP / SRS.
//   3. window.location.reload() — React memory (stats, learnedWords, level,
//      the gateDismissed latch) has no other bulletproof reset in this SPA.
//      Same-URL assign('/') is a no-op on `/`.
import { signOut as authSignOut } from './auth.js';
import { forgetPushDevice } from './pushNotifications.js';
import { clearAppleRefreshToken } from './appleRevokeToken.js';
import { freezePersist } from './storage.js';
import { THEME_MODE_KEY } from './themeMode.js';

/**
 * Device chrome that must survive a sign-out. Theme is the recorded
 * exception; do not add account data here.
 */
export const PRESERVED_LOCAL_KEYS = Object.freeze([THEME_MODE_KEY]);

/**
 * Overridable in tests so jsdom does not have to fake window.location.
 * Production always reloads the document — a full load, not a client-side swap.
 *
 * `location.assign('/')` / `href = '/'` is a same-document no-op when the
 * PWA is already at `/` (every screen: tabs are React state, not routes).
 * That is why Sign Out flipped the header to SIGN IN while XP / level /
 * streak stayed mounted. `reload()` always tears down the JS heap.
 */
export const locationReset = {
  go() {
    window.location.href = '/';
    window.location.reload();
  },
};

/** Wipe every localStorage key except device theme. */
export function clearUserLocalState() {
  freezePersist();
  clearAppleRefreshToken();
  try {
    const preserved = {};
    for (const key of PRESERVED_LOCAL_KEYS) {
      const value = localStorage.getItem(key);
      if (value !== null) preserved[key] = value;
    }
    localStorage.clear();
    for (const [key, value] of Object.entries(preserved)) {
      localStorage.setItem(key, value);
    }
  } catch {
    // private browsing / blocked storage — the hard reload still drops memory
  }
}

/**
 * Wipe user persistence then hard-reset the SPA. Always runs the reset after
 * signOut settles — supabase can clear the local session and still return
 * `{ error }` on a failed server call.
 *
 * @param {{
 *   signOut?: () => Promise<{ error?: unknown }>,
 *   forgetDevice?: () => Promise<void>,
 *   reload?: () => void,
 * }} [opts]
 * @returns {Promise<{ error: unknown }>}
 */
export async function signOutAndReset(opts = {}) {
  const signOutFn = opts.signOut ?? authSignOut;
  const forgetDevice = opts.forgetDevice ?? forgetPushDevice;
  try {
    await forgetDevice();
  } catch {
    // forgetPushDevice never throws; an injected one might. Sign out regardless.
  }
  let error;
  try {
    const result = await signOutFn();
    error = result?.error ?? null;
  } catch (err) {
    error = err;
  }
  // Local session is already gone even when the server call fails. Wipe and
  // hard-navigate anyway — skipping this is how SIGN IN appeared with XP still
  // on screen.
  clearUserLocalState();
  if (opts.reload) opts.reload();
  else locationReset.go();
  return { error };
}
