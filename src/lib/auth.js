// Identity surface for B2 — language-blind. The only module that imports
// @supabase/supabase-js. Reads the PUBLIC Supabase vars (anon key is public
// by design; RLS is the authorization layer). When the vars are absent
// (CI, or any environment before B2.3 wires them), the module no-ops and
// isAuthConfigured() is false, so the app behaves exactly as it does today.
import { captureAppleRefreshToken } from './appleRevokeToken.js';
import { useState, useEffect } from 'react';
import {
  isBetaSignupDenial,
  SIGNUP_NOT_ALLOWED_CODE,
  SIGNUP_NOT_ALLOWED_MESSAGE,
} from './signupAllowlist.js';
import {
  isNativeApp,
  isNativeAuthCallback,
  listenForAppUrls,
  openAuthBrowser,
  closeAuthBrowser,
  NATIVE_AUTH_CALLBACK_URL,
} from './nativeApp.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export function isAuthConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

/**
 * Google sign-in needs both an auth backend AND the flag, because the flag
 * alone cannot tell you whether an owner finished the Google Cloud + Supabase
 * provider setup (docs/AUTH_GOOGLE_OAUTH_RUNBOOK.md). Absent var means OFF,
 * matching SYNC_ENABLED / LEAGUES_ENABLED.
 *
 * NOTE: Vite inlines env at build time, so flipping this in a dashboard does
 * nothing until the app is rebuilt.
 */
export function isGoogleAuthConfigured() {
  return isAuthConfigured() && import.meta.env.VITE_GOOGLE_AUTH_ENABLED === 'true';
}

/**
 * GitHub sign-in: the same two facts as Google, with its own flag, because the
 * two providers are set up (and can be rolled back) independently —
 * docs/AUTH_GITHUB_OAUTH_RUNBOOK.md. Same build-time caveat as above.
 */
export function isGitHubAuthConfigured() {
  return isAuthConfigured() && import.meta.env.VITE_GITHUB_AUTH_ENABLED === 'true';
}

/**
 * Sign in with Apple: its own flag again, because it has its own dashboard
 * setup (docs/AUTH_APPLE_OAUTH_RUNBOOK.md) and must stay dark until that setup,
 * and the Apple token revocation on account deletion, are done. Same build-time
 * caveat as above.
 */
export function isAppleAuthConfigured() {
  return isAuthConfigured() && import.meta.env.VITE_APPLE_AUTH_ENABLED === 'true';
}

/**
 * Where Supabase sends the learner back to after a magic link, an OAuth consent
 * screen, or an email-change confirmation. Every one of those flows uses this
 * value, so each environment needs one allow-list entry, not one per flow.
 *
 * Web: this origin. Native: the app's URL scheme. The webview's origin
 * (capacitor://localhost, https://localhost) is not somewhere a mail app or
 * the system browser can hand a link back to, so a native sign-in that
 * redirected there opened the website instead of the app. Both values must be
 * on the Supabase Redirect URLs allow-list: docs/MOBILE_AUTH_SETUP.md.
 */
export function authRedirectUrl() {
  return isNativeApp() ? NATIVE_AUTH_CALLBACK_URL : window.location.origin;
}

// Native sign-in uses PKCE. The web keeps the implicit flow it has always used.
//
// A native callback travels through a URL scheme that any other app on the
// device can also register. Under PKCE what travels is a one-time code that is
// worthless without the verifier this webview stored when the flow started.
// The implicit flow would hand an interceptor the session itself
// (RFC 8252 §8.1). The same property blocks a crafted callback link from
// signing the learner into someone else's account.
//
// The web stays implicit because PKCE ties a magic link to the browser that
// requested it, and opening the email somewhere else would then fail.
// detectSessionInUrl is off on native because the webview's own URL never
// carries a callback. Callbacks arrive through handleNativeAuthCallback.
function platformAuthOptions() {
  return isNativeApp() ? { flowType: 'pkce', detectSessionInUrl: false } : {};
}

// @supabase/supabase-js pulls in ~816KB of source (auth, postgrest, storage,
// realtime, functions) and none of it is needed to paint the app — a guest can
// use every tab without it. It is loaded on demand instead, so it lands in its
// own chunk rather than in the critical path.
//
// The promise is cached, not the client, so concurrent callers during the load
// share one import and one createClient rather than racing to build several.
// Notified the first time a client actually exists. useAuth uses this to pick
// up a session for a visitor who arrived as a guest (so the chunk was skipped)
// and then signed in — signing in loads the client, and this is how the hook
// finds out it can finally subscribe.
const clientReadyListeners = new Set();

let clientPromise = null;
function getClient() {
  if (!isAuthConfigured()) return Promise.resolve(null);
  if (!clientPromise) {
    clientPromise = import('@supabase/supabase-js').then(({ createClient }) => {
      const c = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, ...platformAuthOptions() },
      });
      for (const fn of clientReadyListeners) fn(c);
      return c;
    });
  }
  return clientPromise;
}

/**
 * Classify the current URL as an auth callback without loading the SDK.
 *
 * - `'pending'` — credential present (PKCE `?code=` or implicit hash tokens)
 * - `'error'` — provider reported failure (`?error=` / `#error=` / expired OTP)
 * - `null` — not an auth callback
 *
 * Patterns live here once. `mayHaveSession()` reuses this so the detection
 * regexes are never hand-copied (same defect class as duplicated palettes).
 */
export function authCallbackKind(loc = typeof window !== 'undefined' ? window.location : null) {
  if (!loc) return null;
  const search = loc.search || '';
  const hash = loc.hash || '';

  // Errors win — an expired-link hash still carries type=magiclink-style noise
  // in some providers, but `error=` is the signal the user must see.
  if (/[?&](error|error_description|error_code)=/.test(search)) return 'error';
  if (/(?:^|[&#])(error|error_description|error_code)=/.test(hash)) return 'error';

  if (/[?&]code=/.test(search)) return 'pending';
  if (/access_token=|refresh_token=|type=(magiclink|recovery|invite|signup)/.test(hash)) {
    return 'pending';
  }
  return null;
}

/**
 * Why did this auth callback fail? Companion to authCallbackKind — the URL
 * patterns live here, in one place, and are never re-derived in a component.
 *
 * - `'not_invited'` — Supabase Auth's closed-beta hook refused to create the
 *                     account (see signupAllowlist.js)
 * - `'cancelled'` — the user backed out of the provider's consent screen
 * - `'expired'`   — a magic link that timed out or was already used
 * - `'failed'`    — any other reported error
 * - `null`        — not an error callback at all
 *
 * The hook's refusal arrives as `error=access_denied` — the OAuth name for a
 * 403 — so it is recognised by its message before the cancel check, or every
 * uninvited sign-up would be told they cancelled.
 *
 * ORDER MATTERS. Supabase reports an expired magic link as
 * `error=access_denied&error_code=otp_expired&…` — BOTH signals in one URL —
 * so testing access_denied first would label every expired link a
 * cancellation. Expired is checked first for exactly that reason.
 *
 * Deliberately separate from authCallbackKind rather than folded into it:
 * that function's `'pending' | 'error' | null` contract is what
 * mayHaveSession() branches on, and mayHaveSession() must stay fail-open.
 */
export function authCallbackReason(loc = typeof window !== 'undefined' ? window.location : null) {
  if (!loc) return null;
  if (authCallbackKind(loc) !== 'error') return null;

  const raw = `${loc.search || ''}${loc.hash || ''}`;
  let blob;
  try {
    blob = decodeURIComponent(raw).toLowerCase();
  } catch {
    // A malformed percent-escape is not a reason to lose the error entirely.
    blob = raw.toLowerCase();
  }

  if (isBetaSignupDenial(blob)) return 'not_invited';
  if (/otp_expired|expired/.test(blob)) return 'expired';
  if (/access_denied|user_denied|user_cancelled|consent_required/.test(blob)) return 'cancelled';
  return 'failed';
}

/**
 * Could this visitor possibly be signed in, without loading the SDK to ask?
 *
 * supabase-js persists its session in localStorage under `sb-<ref>-auth-token`.
 * If no such key exists and the URL is not an auth callback, there is nothing
 * for the client to restore — so a guest never pays for the 207KB chunk.
 *
 * Deliberately fail-open: every ambiguous case returns true and loads the SDK.
 * The storage key is a supabase-js implementation detail, so if it ever changes
 * the worst outcome is that we load the client exactly as we did before — never
 * that someone silently stops being signed in.
 */
export function mayHaveSession() {
  if (!isAuthConfigured()) return false;
  if (typeof window === 'undefined') return true;

  // Auth callback (pending credential or error) — client must load to finish
  // or so the UI can explain the failure. Fail-open: keep loading the SDK.
  if (authCallbackKind() !== null) return true;

  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && /^sb-.*-auth-token$/.test(key) && localStorage.getItem(key)) return true;
    }
    return false;
  } catch {
    // localStorage unavailable (private mode) — cannot rule a session out.
    return true;
  }
}

const NOT_CONFIGURED = { error: { message: 'Sign-in is not available right now.' } };

/** Map Supabase/auth errors to short human copy — never surface raw SDK text. */
export function humanAuthError(error) {
  if (!error) return '';
  const raw = `${error.message || ''} ${error.code || ''} ${error.error_description || ''}`;
  // The API's closed-list code, or Supabase Auth's closed-beta hook refusing a
  // new address (a 403 that carries only its message).
  if (error.code === SIGNUP_NOT_ALLOWED_CODE || isBetaSignupDenial(raw)) {
    return SIGNUP_NOT_ALLOWED_MESSAGE;
  }
  const msg = raw.toLowerCase();
  if (error.status === 429 || /rate.?limit|too many|over_email_send_rate_limit/.test(msg)) {
    return 'Too many attempts — try again in a minute.';
  }
  if (/expired|otp_expired|token has expired|email link is invalid/.test(msg)) {
    return 'That code expired — resend.';
  }
  return 'Something went wrong — try again.';
}

// No allowlist pre-check: admission is Supabase Auth's call (signupAllowlist.js).
// An uninvited address comes back from signInWithOtp as the hook's 403, which
// humanAuthError turns into the closed-beta copy.
export async function signInWithMagicLink(email) {
  const c = await getClient();
  if (!c) return NOT_CONFIGURED;
  return c.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: authRedirectUrl() },
  });
}

/**
 * Start the Google OAuth round trip. `redirectTo` is authRedirectUrl(), the
 * same value signInWithMagicLink passes as emailRedirectTo, so both flows need
 * one allow-list entry per environment instead of two.
 *
 * The flag is checked here as well as in the UI: a stale tab left open across
 * a deploy that switched Google off must not be able to start a flow into a
 * provider that is no longer configured.
 */
export async function signInWithGoogle() {
  if (!isGoogleAuthConfigured()) return NOT_CONFIGURED;
  return startOAuth('google');
}

/**
 * Start the GitHub OAuth round trip. Same redirect target and the same
 * stale-tab guard as Google. No `scopes`: Supabase already asks GitHub for
 * `user:email`, which is all it needs to find a verified address — anything
 * more would be a wider grant than signing in requires.
 */
export async function signInWithGitHub() {
  if (!isGitHubAuthConfigured()) return NOT_CONFIGURED;
  return startOAuth('github');
}

/**
 * Start the Apple OAuth round trip: the same redirect target, stale-tab guard
 * and (on native) system-browser path as Google and GitHub. It is the OAuth
 * web flow, not the native ASAuthorization sheet, so it needs a Services ID
 * and no extra app entitlement. No `scopes`: Supabase requests name and email,
 * which is all Apple will return and all the app uses.
 */
export async function signInWithApple() {
  if (!isAppleAuthConfigured()) return NOT_CONFIGURED;
  return startOAuth('apple');
}

const BROWSER_FAILED = { error: { message: 'Could not open the sign-in page.' } };

/**
 * Web: Supabase navigates this tab to the provider, and the promise settles
 * as the page leaves.
 *
 * Native: the provider opens in the system browser (see openAuthBrowser for
 * why it cannot be the webview). The promise settles once that browser has
 * closed, whether the learner signed in or backed out, so the caller can
 * re-enable its button. The session itself arrives separately, through
 * handleNativeAuthCallback.
 */
async function startOAuth(provider) {
  const c = await getClient();
  if (!c) return NOT_CONFIGURED;
  if (!isNativeApp()) {
    return c.auth.signInWithOAuth({ provider, options: { redirectTo: authRedirectUrl() } });
  }
  const { data, error } = await c.auth.signInWithOAuth({
    provider,
    options: { redirectTo: authRedirectUrl(), skipBrowserRedirect: true },
  });
  if (error) return { data, error };
  // The callback can only land if something is listening for it.
  startNativeAuthCallbacks();
  try {
    await openAuthBrowser(data.url);
  } catch {
    return BROWSER_FAILED;
  }
  return { data, error: null };
}

export async function verifyCode(email, token) {
  const c = await getClient();
  if (!c) return NOT_CONFIGURED;
  return c.auth.verifyOtp({ email, token, type: 'email' });
}

/**
 * Ask Supabase to move this account to `email`.
 *
 * Nothing changes yet. Supabase mails a confirmation, and under "Secure email
 * change" — the default — it mails BOTH the current address and the new one,
 * and the change lands only once both are confirmed. That dual confirmation is
 * the real control on this flow: an attacker holding a stolen session still
 * cannot move the account without reaching the ORIGINAL mailbox.
 *
 * Deliberately NOT proxied through our own API. `auth.admin.updateUserById`
 * would let the server do it with the service-role key, but that skips the
 * confirmation emails entirely — trading the strongest control here for the
 * ability to run a server-side gate. The client call is the safer one.
 */
export async function requestEmailChange(email) {
  const c = await getClient();
  if (!c) return NOT_CONFIGURED;
  return c.auth.updateUser({ email }, { emailRedirectTo: authRedirectUrl() });
}

/**
 * Confirm ONE side of an email change with the code from that inbox.
 *
 * `type: 'email_change'`, not `'email'` — the sign-in verifier's type would be
 * rejected for these codes. Which address the code came from decides what to
 * pass as `email`: the old address confirms the release, the new one confirms
 * the claim, and under secure email change both are required in either order.
 */
export async function verifyEmailChange(email, token) {
  const c = await getClient();
  if (!c) return NOT_CONFIGURED;
  return c.auth.verifyOtp({ email, token, type: 'email_change' });
}

// ---------------------------------------------------------------------------
// Native callbacks. On the web a callback is this page's own URL, which
// supabase-js reads at load and AuthCallbackLanding reads at mount. In the
// native app a callback arrives through the URL scheme, and it can arrive at
// any moment, including while the app is already running.

const nativeCallbackListeners = new Set();
let nativeCallbacksStarted = false;

function emitNativeCallback(event) {
  for (const fn of nativeCallbackListeners) fn(event);
}

/** Start receiving callbacks through the app's URL scheme. Idempotent; inert on the web. */
function startNativeAuthCallbacks() {
  if (nativeCallbacksStarted || !isNativeApp()) return;
  nativeCallbacksStarted = true;
  listenForAppUrls((url) => {
    void handleNativeAuthCallback(url);
  }).catch(() => {
    // Plugin missing or failed to load. Allow a later subscriber to try again.
    nativeCallbacksStarted = false;
  });
}

/**
 * Follow sign-in callbacks that reach the native app. `fn` receives
 * `{ kind: 'pending' | 'error', reason }`, the vocabulary authCallbackKind and
 * authCallbackReason already give the web landing, so AuthCallbackLanding
 * shows the same screens on both. Subscribing also starts listening, so the
 * landing (always mounted) catches a link that cold-starts the app. Returns an
 * unsubscribe function.
 */
export function onNativeAuthCallback(fn) {
  nativeCallbackListeners.add(fn);
  startNativeAuthCallbacks();
  return () => nativeCallbackListeners.delete(fn);
}

/**
 * Finish a sign-in that came back through the app's URL scheme.
 *
 * Only a PKCE `?code=` is accepted. A link that carries tokens is ignored,
 * because anyone can build one; see platformAuthOptions. A callback with
 * neither a code nor an error is ignored as well. That is the first half of a
 * secure email change ("now confirm the other address"): there is nothing to
 * exchange yet, and nothing has failed.
 */
export async function handleNativeAuthCallback(url) {
  if (!isNativeAuthCallback(url)) return;
  void closeAuthBrowser();
  const loc = new URL(url);
  if (authCallbackKind(loc) === 'error') {
    emitNativeCallback({ kind: 'error', reason: authCallbackReason(loc) });
    return;
  }
  const code = loc.searchParams.get('code');
  if (!code) return;
  emitNativeCallback({ kind: 'pending', reason: null });
  let error;
  try {
    // Inside the try as well: offline, the client chunk itself can fail to load.
    const c = await getClient();
    error = c ? (await c.auth.exchangeCodeForSession(code)).error : NOT_CONFIGURED.error;
  } catch (e) {
    error = e;
  }
  if (!error) return; // onAuthStateChange delivers the session to useAuth.
  const detail = `${error.code || ''} ${error.message || ''}`;
  emitNativeCallback({ kind: 'error', reason: /expired/i.test(detail) ? 'expired' : 'failed' });
}

export async function signOut() {
  const c = await getClient();
  // No client → already effectively signed out; report success, not an error
  // (unlike signIn/verify, which genuinely cannot proceed).
  if (!c) return { error: null };
  return c.auth.signOut();
}

// React hook exposing { session, user, status }. status ∈
// 'loading' | 'authenticated' | 'anonymous'. When auth is not configured the
// hook settles on 'anonymous' immediately and never subscribes.
//
// It does not second-guess a session against an allowlist: Supabase Auth
// refuses to create an uninvited account in the first place, and a bundled
// list would publish the testers. An account that predates the hook is
// refused by the server gate (SIGNUP_EMAIL_ALLOWLIST) and handled by the
// owner (docs/AUTH_BETA_ALLOWLIST_RUNBOOK.md step 7).
export function useAuth() {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    let active = true;
    let unsubscribe = null;

    const applySession = (next) => {
      captureAppleRefreshToken(next);
      setSession(next);
      setStatus(next ? 'authenticated' : 'anonymous');
    };

    const attach = (c) => {
      // The effect can be torn down while the client chunk is still in flight.
      if (!active || !c || unsubscribe) return;
      void c.auth.getSession().then(({ data }) => {
        if (!active) return;
        applySession(data.session);
      });
      const { data: sub } = c.auth.onAuthStateChange((_event, next) => {
        if (!active) return;
        applySession(next);
      });
      unsubscribe = () => sub.subscription.unsubscribe();
    };

    if (mayHaveSession()) {
      void getClient().then((c) => {
        if (!active) return;
        if (!c) setStatus('anonymous');
        else attach(c);
      });
    } else {
      // Guest: settle immediately without fetching the Supabase chunk. If they
      // then sign in, that loads the client and this listener attaches, so the
      // UI still reacts to the new session.
      setStatus('anonymous');
      clientReadyListeners.add(attach);
    }

    return () => {
      active = false;
      clientReadyListeners.delete(attach);
      // Null when teardown beat the import; the `active` guard above then stops
      // the subscription from ever being created.
      unsubscribe?.();
    };
  }, []);

  return { session, user: session?.user ?? null, status };
}

/**
 * The Supabase client, or null when auth is not configured.
 * Returns a promise — the client is code-split, so callers must await it.
 */
export function getSupabase() {
  return getClient();
}

/** Returns the current session's JWT, or null if not signed in. */
export async function getAccessToken() {
  const c = await getClient();
  if (!c) return null;
  const { data } = await c.auth.getSession();
  return data?.session?.access_token ?? null;
}

/**
 * Trade the refresh token for a brand-new access token, and return it.
 *
 * `getAccessToken` hands back whatever is in local storage. That token is
 * SIGNED, which is all PostgREST and Storage check — but the account lane
 * verifies it with `auth.getUser()`, and GoTrue additionally requires the
 * SESSION behind the token to still exist. A session revoked elsewhere (a
 * sign-out on another tab or device, which supabase-js scopes globally by
 * default) leaves a token that storage still accepts and the API does not.
 *
 * That split is how a learner uploaded an avatar successfully and was then told
 * their profile could not be saved: production logs show the upload landing in
 * the bucket while GoTrue answered the server's getUser with
 * `403 session_not_found` and the PATCH returned 401.
 *
 * So: one refresh, then let the caller retry. Null means the session is
 * genuinely gone and the caller should ask the learner to sign in again rather
 * than reporting the operation itself as broken.
 *
 * @returns {Promise<string | null>}
 */
export async function refreshAccessToken() {
  const c = await getClient();
  if (!c) return null;
  try {
    const { data, error } = await c.auth.refreshSession();
    if (error) return null;
    return data?.session?.access_token ?? null;
  } catch {
    // Offline, or no refresh token at all. Indistinguishable to the caller
    // from a dead session, and handled the same way.
    return null;
  }
}
