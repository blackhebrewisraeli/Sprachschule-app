import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mockAuth = {
  signInWithOtp: vi.fn(() => Promise.resolve({ data: {}, error: null })),
  signInWithOAuth: vi.fn(() => Promise.resolve({ data: {}, error: null })),
  verifyOtp: vi.fn(() => Promise.resolve({ data: {}, error: null })),
  signOut: vi.fn(() => Promise.resolve({ error: null })),
  getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  updateUser: vi.fn(() => Promise.resolve({ data: {}, error: null })),
  exchangeCodeForSession: vi.fn(() => Promise.resolve({ data: {}, error: null })),
  setSession: vi.fn(() => Promise.resolve({ data: {}, error: null })),
};
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ auth: mockAuth })) }));

// Capacitor plugins, reached only in the native app. Each call is forwarded to
// a hoisted stub so a test can drive what the OS would do: open the app with a
// URL, or have the user close the browser.
const nativePlugins = vi.hoisted(() => ({
  urlListener: null,
  launchUrl: null,
  browserFinished: null,
  browserOpen: null,
  browserClose: null,
  appAddListener: null,
}));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: (...args) => nativePlugins.appAddListener(...args),
    getLaunchUrl: async () =>
      nativePlugins.launchUrl ? { url: nativePlugins.launchUrl } : undefined,
  },
}));
vi.mock('@capacitor/browser', () => ({
  Browser: {
    addListener: async (_event, fn) => {
      nativePlugins.browserFinished = fn;
      return { remove: async () => {} };
    },
    open: (...args) => nativePlugins.browserOpen(...args),
    close: (...args) => nativePlugins.browserClose(...args),
  },
}));

describe('auth actions', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    vi.resetModules();
    Object.values(mockAuth).forEach((fn) => fn.mockClear?.());
  });
  afterEach(() => vi.unstubAllEnvs());

  it('signInWithMagicLink sends an OTP with a redirect back to the app', async () => {
    const { signInWithMagicLink } = await import('./auth.js');
    const { error } = await signInWithMagicLink('a@b.com');
    expect(error).toBeNull();
    expect(mockAuth.signInWithOtp).toHaveBeenCalledWith({
      email: 'a@b.com',
      options: { emailRedirectTo: window.location.origin },
    });
  });

  it('verifyCode verifies the 6-digit email token', async () => {
    const { verifyCode } = await import('./auth.js');
    await verifyCode('a@b.com', '123456');
    expect(mockAuth.verifyOtp).toHaveBeenCalledWith({
      email: 'a@b.com',
      token: '123456',
      type: 'email',
    });
  });

  it('signOut delegates to the client', async () => {
    const { signOut } = await import('./auth.js');
    await signOut();
    expect(mockAuth.signOut).toHaveBeenCalled();
  });

  it('actions no-op with an error when auth is not configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    vi.resetModules();
    const { signInWithMagicLink } = await import('./auth.js');
    const { error } = await signInWithMagicLink('a@b.com');
    expect(error).toBeTruthy();
    expect(mockAuth.signInWithOtp).not.toHaveBeenCalled();
  });

  // Admission is Supabase Auth's decision (the before-user-created hook). The
  // client keeps no list to pre-check against — a stale VITE_ variable left in
  // the build environment must change nothing.
  it('sends the magic link for any address and ignores a leftover client list', async () => {
    vi.stubEnv('VITE_SIGNUP_EMAIL_ALLOWLIST', 'listed@example.test');
    vi.resetModules();
    const { signInWithMagicLink, verifyCode } = await import('./auth.js');
    expect((await signInWithMagicLink('unlisted@example.test')).error).toBeNull();
    expect(mockAuth.signInWithOtp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'unlisted@example.test' })
    );
    expect((await verifyCode('unlisted@example.test', '123456')).error).toBeNull();
    expect(mockAuth.verifyOtp).toHaveBeenCalled();
  });

  it("passes the Auth hook's refusal back untouched for the form to explain", async () => {
    const { BETA_SIGNUP_DENIED_MESSAGE } = await import('./signupAllowlist.js');
    const refusal = { message: BETA_SIGNUP_DENIED_MESSAGE, status: 403 };
    mockAuth.signInWithOtp.mockResolvedValueOnce({ data: {}, error: refusal });
    const { signInWithMagicLink, humanAuthError } = await import('./auth.js');
    const { error } = await signInWithMagicLink('unlisted@example.test');
    expect(error).toBe(refusal);
    expect(humanAuthError(error)).toMatch(/isn't invited to the beta/i);
  });

  it('signOut reports success (not an error) when auth is not configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    vi.resetModules();
    const { signOut } = await import('./auth.js');
    const { error } = await signOut();
    expect(error).toBeNull();
    expect(mockAuth.signOut).not.toHaveBeenCalled();
  });

  it('getAccessToken returns the access token from the current session', async () => {
    const sessionMock = vi.fn().mockResolvedValue({
      data: { session: { access_token: 'tok-abc' } },
    });
    mockAuth.getSession = sessionMock;

    const { getAccessToken } = await import('./auth.js');
    const token = await getAccessToken();
    expect(token).toBe('tok-abc');
    expect(sessionMock).toHaveBeenCalled();
  });

  it('getAccessToken returns null when no session exists', async () => {
    const sessionMock = vi.fn().mockResolvedValue({ data: { session: null } });
    mockAuth.getSession = sessionMock;

    const { getAccessToken } = await import('./auth.js');
    const token = await getAccessToken();
    expect(token).toBeNull();
    expect(sessionMock).toHaveBeenCalled();
  });
});

describe('useAuth', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    vi.resetModules();
    Object.values(mockAuth).forEach((fn) => fn.mockClear?.());
    mockAuth.getSession.mockResolvedValue({ data: { session: null } });
    mockAuth.signOut.mockResolvedValue({ error: null });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('subscribes to auth changes when a persisted session may exist', async () => {
    localStorage.setItem('sb-xcnn-auth-token', JSON.stringify({ access_token: 'x' }));
    const { useAuth } = await import('./auth.js');
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.status).not.toBe('loading'));
    expect(result.current.session).toBeNull();
    expect(mockAuth.onAuthStateChange).toHaveBeenCalled();
    localStorage.clear();
  });

  it('settles a guest as anonymous without loading the client at all', async () => {
    localStorage.clear();
    const { useAuth } = await import('./auth.js');
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    // The whole point of the split: no session to restore, no 207KB chunk.
    expect(mockAuth.onAuthStateChange).not.toHaveBeenCalled();
  });

  it('still subscribes if a guest signs in, which loads the client', async () => {
    localStorage.clear();
    const mod = await import('./auth.js');
    const { result } = renderHook(() => mod.useAuth());
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    expect(mockAuth.onAuthStateChange).not.toHaveBeenCalled();

    // Signing in is what pulls the client in — the hook must notice and attach,
    // otherwise the UI would never reflect the new session.
    await mod.signInWithMagicLink('a@b.com');
    await waitFor(() => expect(mockAuth.onAuthStateChange).toHaveBeenCalled());
  });

  it('reports status "anonymous" when auth is not configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    vi.resetModules();
    const { useAuth } = await import('./auth.js');
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
  });

  // Supabase Auth only creates invited accounts, so a restored session is
  // trusted as-is: no bundled list, no client-side sign-out, even if a stale
  // VITE_ list is still in the build environment.
  it('restores a session without consulting any client-side list', async () => {
    vi.stubEnv('VITE_SIGNUP_EMAIL_ALLOWLIST', 'someone-else@example.test');
    vi.resetModules();
    localStorage.setItem('sb-xcnn-auth-token', JSON.stringify({ access_token: 'x' }));
    const session = {
      access_token: 'tok',
      user: {
        id: 'u-learner',
        email: 'learner@example.test',
        email_confirmed_at: '2026-09-18T00:00:00Z',
      },
    };
    mockAuth.getSession.mockResolvedValue({ data: { session } });
    const { useAuth } = await import('./auth.js');
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    expect(result.current.user.email).toBe('learner@example.test');
    expect(result.current).not.toHaveProperty('signupRejected');
    expect(mockAuth.signOut).not.toHaveBeenCalled();
    localStorage.clear();
  });
});

describe('isAuthConfigured', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('is false when the Supabase env vars are absent', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    vi.resetModules();
    const { isAuthConfigured } = await import('./auth.js');
    expect(isAuthConfigured()).toBe(false);
  });

  it('is true when both env vars are present', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    vi.resetModules();
    const { isAuthConfigured } = await import('./auth.js');
    expect(isAuthConfigured()).toBe(true);
  });
});

// The Supabase client is code-split. A guest must settle as anonymous without
// ever fetching that chunk, but no real session may be missed to achieve it.
describe('mayHaveSession', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://xcnn.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    vi.resetModules();
    localStorage.clear();
    window.history.replaceState({}, '', '/');
  });

  it('is false for a clean guest, so the chunk is never fetched', async () => {
    const { mayHaveSession } = await import('./auth.js');
    expect(mayHaveSession()).toBe(false);
  });

  it('is true when a persisted supabase session key exists', async () => {
    localStorage.setItem('sb-xcnn-auth-token', JSON.stringify({ access_token: 'x' }));
    const { mayHaveSession } = await import('./auth.js');
    expect(mayHaveSession()).toBe(true);
  });

  it('ignores an empty session key', async () => {
    localStorage.setItem('sb-xcnn-auth-token', '');
    const { mayHaveSession } = await import('./auth.js');
    expect(mayHaveSession()).toBe(false);
  });

  it('is true on a PKCE callback, where storage is still empty', async () => {
    window.history.replaceState({}, '', '/?code=abc123');
    const { mayHaveSession } = await import('./auth.js');
    expect(mayHaveSession()).toBe(true);
  });

  it('is true on an implicit-flow callback carried in the hash', async () => {
    window.history.replaceState({}, '', '/#access_token=abc&type=magiclink');
    const { mayHaveSession } = await import('./auth.js');
    expect(mayHaveSession()).toBe(true);
  });

  it('is true when the callback reports an error, so it can be surfaced', async () => {
    window.history.replaceState({}, '', '/?error=access_denied&error_description=expired');
    const { mayHaveSession } = await import('./auth.js');
    expect(mayHaveSession()).toBe(true);
  });

  it('is false when auth is not configured at all', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    vi.resetModules();
    const { mayHaveSession } = await import('./auth.js');
    expect(mayHaveSession()).toBe(false);
  });
});

describe('humanAuthError', () => {
  it('maps rate limits', async () => {
    const { humanAuthError } = await import('./auth.js');
    expect(humanAuthError({ status: 429, message: 'rate limit' })).toBe(
      'Too many attempts — try again in a minute.'
    );
    expect(humanAuthError({ message: 'over_email_send_rate_limit' })).toBe(
      'Too many attempts — try again in a minute.'
    );
  });

  it('maps expired codes', async () => {
    const { humanAuthError } = await import('./auth.js');
    expect(humanAuthError({ message: 'Token has expired', code: 'otp_expired' })).toBe(
      'That code expired — resend.'
    );
  });

  it('falls back without leaking raw SDK text', async () => {
    const { humanAuthError } = await import('./auth.js');
    expect(humanAuthError({ message: 'AuthApiError: boom at stack' })).toBe(
      'Something went wrong — try again.'
    );
    expect(humanAuthError(null)).toBe('');
  });

  it("maps the API's closed-list code without leaking the mailbox", async () => {
    const { humanAuthError } = await import('./auth.js');
    const { SIGNUP_NOT_ALLOWED_CODE, SIGNUP_NOT_ALLOWED_MESSAGE } =
      await import('./signupAllowlist.js');
    const error = { code: SIGNUP_NOT_ALLOWED_CODE, message: 'raw sdk stranger@example.test' };
    expect(humanAuthError(error)).toBe(SIGNUP_NOT_ALLOWED_MESSAGE);
    expect(humanAuthError(error)).not.toMatch(/@/);
  });

  // The before-user-created hook can set only a status and a message, so its
  // refusal arrives with no code — it is recognised by the message.
  it("maps Supabase Auth's closed-beta refusal to the not-invited copy", async () => {
    const { humanAuthError } = await import('./auth.js');
    const { BETA_SIGNUP_DENIED_MESSAGE, SIGNUP_NOT_ALLOWED_MESSAGE } =
      await import('./signupAllowlist.js');
    expect(humanAuthError({ message: BETA_SIGNUP_DENIED_MESSAGE, status: 403 })).toBe(
      SIGNUP_NOT_ALLOWED_MESSAGE
    );
    // Any other 403 is not dressed up as an invitation problem.
    expect(humanAuthError({ message: 'Signups not allowed for otp', status: 403 })).toBe(
      'Something went wrong — try again.'
    );
  });
});

describe('authCallbackKind', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('returns null on a clean URL', async () => {
    const { authCallbackKind } = await import('./auth.js');
    expect(authCallbackKind()).toBeNull();
  });

  it.each([
    ['pending', 'a PKCE code', '/?code=abc123'],
    ['pending', 'an implicit magic-link hash', '/#access_token=abc&type=magiclink'],
    ['error', 'a query-string error', '/?error=access_denied&error_code=otp_expired'],
    [
      'error',
      'an expired-link hash',
      '/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    ],
  ])('returns %s for %s', async (kind, _label, url) => {
    window.history.replaceState({}, '', url);
    const { authCallbackKind } = await import('./auth.js');
    expect(authCallbackKind()).toBe(kind);
  });
});

// Google is gated by two independent facts: an auth backend exists, and an
// owner finished the Google Cloud + Supabase provider setup. Only the second
// needs a flag — nothing in the bundle can see a provider's dashboard state.
describe('signInWithGoogle', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('VITE_GOOGLE_AUTH_ENABLED', 'true');
    vi.resetModules();
    Object.values(mockAuth).forEach((fn) => fn.mockClear?.());
  });
  afterEach(() => vi.unstubAllEnvs());

  it('starts the OAuth round trip with the app origin as redirectTo', async () => {
    const { signInWithGoogle } = await import('./auth.js');
    const { error } = await signInWithGoogle();
    expect(error).toBeNull();
    expect(mockAuth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
  });

  // One allow-list entry per environment instead of two.
  it('uses the same redirect target the magic link does', async () => {
    const { signInWithGoogle, signInWithMagicLink } = await import('./auth.js');
    await signInWithGoogle();
    await signInWithMagicLink('a@b.com');
    expect(mockAuth.signInWithOAuth.mock.calls[0][0].options.redirectTo).toBe(
      mockAuth.signInWithOtp.mock.calls[0][0].options.emailRedirectTo
    );
  });

  it('refuses when auth is unconfigured, even with the flag on', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    vi.resetModules();
    const { signInWithGoogle } = await import('./auth.js');
    const { error } = await signInWithGoogle();
    expect(error).toBeTruthy();
    expect(mockAuth.signInWithOAuth).not.toHaveBeenCalled();
  });

  // A stale tab left open across a deploy that switched Google off must not be
  // able to start a flow into a provider that is no longer configured.
  it('refuses when the flag is off, even though auth is configured', async () => {
    vi.stubEnv('VITE_GOOGLE_AUTH_ENABLED', 'false');
    vi.resetModules();
    const { signInWithGoogle } = await import('./auth.js');
    const { error } = await signInWithGoogle();
    expect(error).toBeTruthy();
    expect(mockAuth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('refuses when the flag is absent entirely', async () => {
    vi.stubEnv('VITE_GOOGLE_AUTH_ENABLED', undefined);
    vi.resetModules();
    const { signInWithGoogle } = await import('./auth.js');
    expect((await signInWithGoogle()).error).toBeTruthy();
    expect(mockAuth.signInWithOAuth).not.toHaveBeenCalled();
  });
});

describe('isGoogleAuthConfigured', () => {
  afterEach(() => vi.unstubAllEnvs());

  const load = async (url, key, flag) => {
    vi.stubEnv('VITE_SUPABASE_URL', url);
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', key);
    vi.stubEnv('VITE_GOOGLE_AUTH_ENABLED', flag);
    vi.resetModules();
    return (await import('./auth.js')).isGoogleAuthConfigured();
  };

  it('is true only when auth is configured AND the flag is exactly "true"', async () => {
    expect(await load('https://x.supabase.co', 'anon-key', 'true')).toBe(true);
    expect(await load('https://x.supabase.co', 'anon-key', 'false')).toBe(false);
    expect(await load('https://x.supabase.co', 'anon-key', undefined)).toBe(false);
    expect(await load('', '', 'true')).toBe(false);
  });

  // The flag is a string compared to 'true' — nothing truthy-but-different
  // may switch a provider on by accident.
  it('does not accept truthy near-misses', async () => {
    expect(await load('https://x.supabase.co', 'anon-key', '1')).toBe(false);
    expect(await load('https://x.supabase.co', 'anon-key', 'TRUE')).toBe(false);
    expect(await load('https://x.supabase.co', 'anon-key', 'yes')).toBe(false);
  });
});

// Sign in with Apple: one more provider on its own flag, same redirect target
// and stale-tab guard. Dark until docs/AUTH_APPLE_OAUTH_RUNBOOK.md is done.
describe('signInWithApple', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('VITE_APPLE_AUTH_ENABLED', 'true');
    vi.resetModules();
    Object.values(mockAuth).forEach((fn) => fn.mockClear?.());
  });
  afterEach(() => vi.unstubAllEnvs());

  it('starts the OAuth round trip with the app origin as redirectTo and no extra scopes', async () => {
    const { signInWithApple } = await import('./auth.js');
    expect((await signInWithApple()).error).toBeNull();
    expect(mockAuth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'apple',
      options: { redirectTo: window.location.origin },
    });
  });

  it('refuses when the flag is off, even though auth is configured', async () => {
    vi.stubEnv('VITE_APPLE_AUTH_ENABLED', 'false');
    vi.resetModules();
    const { signInWithApple } = await import('./auth.js');
    expect((await signInWithApple()).error).toBeTruthy();
    expect(mockAuth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('is not switched on by the Google or GitHub flags', async () => {
    vi.stubEnv('VITE_APPLE_AUTH_ENABLED', undefined);
    vi.stubEnv('VITE_GOOGLE_AUTH_ENABLED', 'true');
    vi.stubEnv('VITE_GITHUB_AUTH_ENABLED', 'true');
    vi.resetModules();
    const { signInWithApple, isAppleAuthConfigured } = await import('./auth.js');
    expect(isAppleAuthConfigured()).toBe(false);
    expect((await signInWithApple()).error).toBeTruthy();
    expect(mockAuth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('refuses when auth is unconfigured, even with the flag on', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    vi.resetModules();
    const { signInWithApple } = await import('./auth.js');
    expect((await signInWithApple()).error).toBeTruthy();
    expect(mockAuth.signInWithOAuth).not.toHaveBeenCalled();
  });
});

// GitHub is gated exactly like Google, on its own flag: the two providers are
// set up — and rolled back — independently, so neither flag may switch the
// other one on.
describe('signInWithGitHub', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('VITE_GITHUB_AUTH_ENABLED', 'true');
    vi.resetModules();
    Object.values(mockAuth).forEach((fn) => fn.mockClear?.());
  });
  afterEach(() => vi.unstubAllEnvs());

  // No `scopes`: Supabase already requests user:email, and signing in needs
  // nothing wider.
  it('starts the OAuth round trip with the app origin as redirectTo and no extra scopes', async () => {
    const { signInWithGitHub } = await import('./auth.js');
    const { error } = await signInWithGitHub();
    expect(error).toBeNull();
    expect(mockAuth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'github',
      options: { redirectTo: window.location.origin },
    });
  });

  // Still one allow-list entry per environment, not three.
  it('uses the same redirect target as the magic link and Google', async () => {
    vi.stubEnv('VITE_GOOGLE_AUTH_ENABLED', 'true');
    vi.resetModules();
    const { signInWithGitHub, signInWithGoogle, signInWithMagicLink } = await import('./auth.js');
    await signInWithGitHub();
    await signInWithGoogle();
    await signInWithMagicLink('a@b.com');
    const [github, google] = mockAuth.signInWithOAuth.mock.calls.map(([arg]) => arg);
    expect(github.options.redirectTo).toBe(google.options.redirectTo);
    expect(github.options.redirectTo).toBe(
      mockAuth.signInWithOtp.mock.calls[0][0].options.emailRedirectTo
    );
  });

  it('refuses when auth is unconfigured, even with the flag on', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    vi.resetModules();
    const { signInWithGitHub } = await import('./auth.js');
    const { error } = await signInWithGitHub();
    expect(error).toBeTruthy();
    expect(mockAuth.signInWithOAuth).not.toHaveBeenCalled();
  });

  // The stale-tab guard: a tab left open across a deploy that switched GitHub
  // off must not start a flow into a provider that is no longer configured.
  it('refuses when the flag is off, even though auth is configured', async () => {
    vi.stubEnv('VITE_GITHUB_AUTH_ENABLED', 'false');
    vi.resetModules();
    const { signInWithGitHub } = await import('./auth.js');
    const { error } = await signInWithGitHub();
    expect(error).toBeTruthy();
    expect(mockAuth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('is not switched on by the Google flag', async () => {
    vi.stubEnv('VITE_GITHUB_AUTH_ENABLED', undefined);
    vi.stubEnv('VITE_GOOGLE_AUTH_ENABLED', 'true');
    vi.resetModules();
    const { signInWithGitHub } = await import('./auth.js');
    expect((await signInWithGitHub()).error).toBeTruthy();
    expect(mockAuth.signInWithOAuth).not.toHaveBeenCalled();
  });

  it('does not switch Google on either', async () => {
    vi.stubEnv('VITE_GOOGLE_AUTH_ENABLED', undefined);
    vi.resetModules();
    const { signInWithGoogle } = await import('./auth.js');
    expect((await signInWithGoogle()).error).toBeTruthy();
    expect(mockAuth.signInWithOAuth).not.toHaveBeenCalled();
  });
});

describe('isGitHubAuthConfigured', () => {
  afterEach(() => vi.unstubAllEnvs());

  const load = async (url, key, flag) => {
    vi.stubEnv('VITE_SUPABASE_URL', url);
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', key);
    vi.stubEnv('VITE_GITHUB_AUTH_ENABLED', flag);
    vi.resetModules();
    return (await import('./auth.js')).isGitHubAuthConfigured();
  };

  it('is true only when auth is configured AND the flag is exactly "true"', async () => {
    expect(await load('https://x.supabase.co', 'anon-key', 'true')).toBe(true);
    expect(await load('https://x.supabase.co', 'anon-key', 'false')).toBe(false);
    expect(await load('https://x.supabase.co', 'anon-key', undefined)).toBe(false);
    expect(await load('', '', 'true')).toBe(false);
  });

  it('does not accept truthy near-misses', async () => {
    expect(await load('https://x.supabase.co', 'anon-key', '1')).toBe(false);
    expect(await load('https://x.supabase.co', 'anon-key', 'TRUE')).toBe(false);
    expect(await load('https://x.supabase.co', 'anon-key', 'yes')).toBe(false);
  });
});

// Phase C rendered one story for every failure — "That link expired" — which
// is false after a user backs out of Google's consent screen. The patterns
// live here beside authCallbackKind so the component never re-derives them.
describe('authCallbackReason', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    vi.resetModules();
    window.history.replaceState({}, '', '/');
  });
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    // Google consent screen → Cancel.
    ['cancelled', 'a Google cancel hash', '/#error=access_denied&error_description=User+denied'],
    ['cancelled', 'a user_denied error_code', '/#error=server_error&error_code=user_denied'],
    ['cancelled', 'an access_denied query', '/?error=access_denied'],
    // GitHub's authorize page → Cancel, as Supabase forwards it.
    [
      'cancelled',
      'a GitHub cancel query',
      '/?error=access_denied&error_description=The+user+has+denied+your+application+access.',
    ],
    // THE TRAP: Supabase reports an expired magic link with access_denied AND
    // otp_expired in the same URL. Expired has to win, or every expired link
    // is mislabelled a cancellation.
    [
      'expired',
      'an expired magic-link hash carrying access_denied too',
      '/#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    ],
    ['expired', 'an otp_expired query', '/?error=access_denied&error_code=otp_expired'],
    ['failed', 'an unrecognised server error', '/?error=server_error&error_description=boom'],
    ['failed', 'a bare error_description', '/#error_description=something+broke'],
    // A GitHub account with no verified address: Supabase refuses it, and that
    // is a failure to explain — not a cancellation, not an expired link.
    [
      'failed',
      'a GitHub account with no verified email',
      '/?error=server_error&error_description=Error+getting+user+email+from+external+provider',
    ],
    // Supabase Auth's closed-beta hook refusing an OAuth sign-up: GoTrue sends a
    // 403 as access_denied, so without the message check this would read as a
    // cancellation. Query and fragment both carry it; spaces arrive as `+`.
    [
      'not_invited',
      'a closed-beta refusal in the query',
      '/?error=access_denied&error_code=&error_description=Sign-up+is+invite-only+during+the+beta.',
    ],
    [
      'not_invited',
      'a closed-beta refusal in the fragment',
      '/#error=access_denied&error_description=Sign-up+is+invite-only+during+the+beta.&sb=',
    ],
    [
      'not_invited',
      'a percent-encoded closed-beta refusal',
      '/?error=access_denied&error_description=Sign-up%20is%20invite-only%20during%20the%20beta.',
    ],
    // Not an error callback at all.
    [null, 'a clean URL', '/'],
    [null, 'a pending PKCE code', '/?code=abc123'],
    [null, 'a pending implicit hash', '/#access_token=abc&type=magiclink'],
  ])('returns %s for %s', async (reason, _label, url) => {
    window.history.replaceState({}, '', url);
    const { authCallbackReason } = await import('./auth.js');
    expect(authCallbackReason()).toBe(reason);
  });

  it('survives a malformed percent-escape rather than losing the error', async () => {
    window.history.replaceState({}, '', '/#error=access_denied&error_description=100%');
    const { authCallbackReason } = await import('./auth.js');
    expect(authCallbackReason()).toBe('cancelled');
  });

  // These two are load-bearing elsewhere and must not drift with the new
  // companion: mayHaveSession() branches on authCallbackKind's three-value
  // contract, and it has to stay fail-open — a stricter version risks a
  // signed-in user silently appearing signed out.
  it('leaves authCallbackKind and mayHaveSession untouched for a cancelled URL', async () => {
    window.history.replaceState({}, '', '/#error=access_denied&error_description=User+denied');
    const { authCallbackKind, mayHaveSession } = await import('./auth.js');
    expect(authCallbackKind()).toBe('error');
    expect(mayHaveSession()).toBe(true);
  });
});

describe('native app (Capacitor)', () => {
  const CALLBACK = 'com.sprachschule.deutsch://login-callback';
  const AUTHORIZE = 'https://x.supabase.co/auth/v1/authorize?provider=google';

  beforeEach(() => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('VITE_GOOGLE_AUTH_ENABLED', 'true');
    vi.resetModules();
    Object.values(mockAuth).forEach((fn) => fn.mockClear?.());
    // What Capacitor's native runtime injects before any page script runs.
    window.Capacitor = { isNativePlatform: () => true };
    nativePlugins.urlListener = null;
    nativePlugins.launchUrl = null;
    nativePlugins.browserFinished = null;
    nativePlugins.appAddListener = vi.fn(async (_event, fn) => {
      nativePlugins.urlListener = fn;
      return { remove: vi.fn() };
    });
    nativePlugins.browserOpen = vi.fn(async () => {});
    nativePlugins.browserClose = vi.fn(async () => {});
  });
  afterEach(() => {
    delete window.Capacitor;
    vi.unstubAllEnvs();
  });

  it('authRedirectUrl is the app scheme in the app and the origin on the web', async () => {
    const { authRedirectUrl } = await import('./auth.js');
    expect(authRedirectUrl()).toBe(CALLBACK);
    delete window.Capacitor;
    expect(authRedirectUrl()).toBe(window.location.origin);
  });

  it('sends a magic link that opens the app, not the website', async () => {
    const { signInWithMagicLink } = await import('./auth.js');
    await signInWithMagicLink('a@b.com');
    expect(mockAuth.signInWithOtp).toHaveBeenCalledWith({
      email: 'a@b.com',
      options: { emailRedirectTo: CALLBACK },
    });
  });

  it('sends email-change confirmations back to the app', async () => {
    const { requestEmailChange } = await import('./auth.js');
    await requestEmailChange('new@b.com');
    expect(mockAuth.updateUser).toHaveBeenCalledWith(
      { email: 'new@b.com' },
      { emailRedirectTo: CALLBACK }
    );
  });

  // RFC 8252 §8.1: a custom scheme can be claimed by another app, so what
  // travels through it must be a code that is useless without this webview's
  // verifier, never the session itself.
  it('builds the client with PKCE and without URL detection', async () => {
    const { signInWithMagicLink } = await import('./auth.js');
    await signInWithMagicLink('a@b.com');
    const { createClient } = await import('@supabase/supabase-js');
    expect(createClient.mock.lastCall[2].auth).toEqual({
      persistSession: true,
      autoRefreshToken: true,
      flowType: 'pkce',
      detectSessionInUrl: false,
    });
  });

  it('leaves the web client exactly as it was', async () => {
    delete window.Capacitor;
    const { signInWithMagicLink } = await import('./auth.js');
    await signInWithMagicLink('a@b.com');
    const { createClient } = await import('@supabase/supabase-js');
    expect(createClient.mock.lastCall[2].auth).toEqual({
      persistSession: true,
      autoRefreshToken: true,
    });
  });

  describe('Google', () => {
    beforeEach(() => {
      mockAuth.signInWithOAuth.mockResolvedValueOnce({
        data: { provider: 'google', url: AUTHORIZE },
        error: null,
      });
    });

    it('opens consent in the system browser, with the app scheme as redirect', async () => {
      const { signInWithGoogle } = await import('./auth.js');
      const pending = signInWithGoogle();
      await vi.waitFor(() => expect(nativePlugins.browserOpen).toHaveBeenCalled());
      expect(mockAuth.signInWithOAuth).toHaveBeenCalledWith({
        provider: 'google',
        options: { redirectTo: CALLBACK, skipBrowserRedirect: true },
      });
      expect(nativePlugins.browserOpen).toHaveBeenCalledWith({ url: AUTHORIZE });
      nativePlugins.browserFinished();
      expect(await pending).toEqual({
        data: { provider: 'google', url: AUTHORIZE },
        error: null,
      });
    });

    // Otherwise the button stays busy forever for someone who backed out.
    it('settles once the learner closes the browser', async () => {
      const { signInWithGoogle } = await import('./auth.js');
      let settled = false;
      const pending = signInWithGoogle().then(() => {
        settled = true;
      });
      await vi.waitFor(() => expect(nativePlugins.browserOpen).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 0));
      expect(settled).toBe(false);
      nativePlugins.browserFinished();
      await pending;
      expect(settled).toBe(true);
    });

    it('closes the browser and settles when the callback comes back', async () => {
      const { signInWithGoogle } = await import('./auth.js');
      const pending = signInWithGoogle();
      await vi.waitFor(() => expect(nativePlugins.urlListener).toBeTypeOf('function'));
      await vi.waitFor(() => expect(nativePlugins.browserOpen).toHaveBeenCalled());
      nativePlugins.urlListener({ url: `${CALLBACK}?code=abc` });
      await pending;
      expect(nativePlugins.browserClose).toHaveBeenCalledTimes(1);
      await vi.waitFor(() => expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith('abc'));
    });

    it('reports an error when the browser cannot open', async () => {
      nativePlugins.browserOpen = vi.fn(async () => {
        throw new Error('Unable to display URL');
      });
      const { signInWithGoogle } = await import('./auth.js');
      const { error } = await signInWithGoogle();
      expect(error).toBeTruthy();
    });

    it('does not open a browser when Supabase refuses to start', async () => {
      mockAuth.signInWithOAuth.mockReset();
      mockAuth.signInWithOAuth.mockResolvedValueOnce({
        data: { provider: 'google', url: null },
        error: { message: 'provider disabled' },
      });
      const { signInWithGoogle } = await import('./auth.js');
      const { error } = await signInWithGoogle();
      expect(error).toEqual({ message: 'provider disabled' });
      expect(nativePlugins.browserOpen).not.toHaveBeenCalled();
      mockAuth.signInWithOAuth.mockImplementation(() => Promise.resolve({ data: {}, error: null }));
    });
  });

  // GitHub shares startOAuth with Google, so it must take the same native path:
  // system browser, app scheme, never the webview.
  it('sends GitHub through the system browser too', async () => {
    vi.stubEnv('VITE_GITHUB_AUTH_ENABLED', 'true');
    vi.resetModules();
    const url = 'https://x.supabase.co/auth/v1/authorize?provider=github';
    mockAuth.signInWithOAuth.mockResolvedValueOnce({
      data: { provider: 'github', url },
      error: null,
    });
    const { signInWithGitHub } = await import('./auth.js');
    const pending = signInWithGitHub();
    await vi.waitFor(() => expect(nativePlugins.browserOpen).toHaveBeenCalledWith({ url }));
    expect(mockAuth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'github',
      options: { redirectTo: CALLBACK, skipBrowserRedirect: true },
    });
    nativePlugins.browserFinished();
    expect((await pending).error).toBeNull();
  });

  it('sends Apple through the system browser too', async () => {
    vi.stubEnv('VITE_APPLE_AUTH_ENABLED', 'true');
    vi.resetModules();
    const url = 'https://x.supabase.co/auth/v1/authorize?provider=apple';
    mockAuth.signInWithOAuth.mockResolvedValueOnce({
      data: { provider: 'apple', url },
      error: null,
    });
    const { signInWithApple } = await import('./auth.js');
    const pending = signInWithApple();
    await vi.waitFor(() => expect(nativePlugins.browserOpen).toHaveBeenCalledWith({ url }));
    expect(mockAuth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'apple',
      options: { redirectTo: CALLBACK, skipBrowserRedirect: true },
    });
    nativePlugins.browserFinished();
    expect((await pending).error).toBeNull();
  });

  describe('handleNativeAuthCallback', () => {
    async function subscribe() {
      const auth = await import('./auth.js');
      const events = [];
      auth.onNativeAuthCallback((e) => events.push(e));
      return { auth, events };
    }

    it('exchanges the PKCE code and reports it as pending', async () => {
      const { auth, events } = await subscribe();
      await auth.handleNativeAuthCallback(`${CALLBACK}?code=abc`);
      expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith('abc');
      expect(events).toEqual([{ kind: 'pending', reason: null }]);
    });

    it('reports a provider error without exchanging anything', async () => {
      const { auth, events } = await subscribe();
      await auth.handleNativeAuthCallback(
        `${CALLBACK}?error=access_denied&error_description=The+user+denied`
      );
      expect(events).toEqual([{ kind: 'error', reason: 'cancelled' }]);
      expect(mockAuth.exchangeCodeForSession).not.toHaveBeenCalled();
    });

    it('reports an expired link', async () => {
      const { auth, events } = await subscribe();
      await auth.handleNativeAuthCallback(
        `${CALLBACK}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`
      );
      expect(events).toEqual([{ kind: 'error', reason: 'expired' }]);
    });

    it('turns a failed exchange into an error', async () => {
      mockAuth.exchangeCodeForSession.mockResolvedValueOnce({
        data: {},
        error: { message: 'invalid request: both auth code and code verifier should be non-empty' },
      });
      const { auth, events } = await subscribe();
      await auth.handleNativeAuthCallback(`${CALLBACK}?code=abc`);
      expect(events).toEqual([
        { kind: 'pending', reason: null },
        { kind: 'error', reason: 'failed' },
      ]);
    });

    it('calls a failed exchange of an expired code expired', async () => {
      mockAuth.exchangeCodeForSession.mockResolvedValueOnce({
        data: {},
        error: { code: 'flow_state_expired', message: 'Flow state has expired' },
      });
      const { auth, events } = await subscribe();
      await auth.handleNativeAuthCallback(`${CALLBACK}?code=abc`);
      expect(events.at(-1)).toEqual({ kind: 'error', reason: 'expired' });
    });

    it('reports a failure, not an endless spinner, when the client cannot load', async () => {
      const { createClient } = await import('@supabase/supabase-js');
      createClient.mockImplementationOnce(() => {
        throw new Error('Failed to fetch dynamically imported module');
      });
      const { auth, events } = await subscribe();
      await auth.handleNativeAuthCallback(`${CALLBACK}?code=abc`);
      expect(events.at(-1)).toEqual({ kind: 'error', reason: 'failed' });
    });

    it('treats a thrown exchange like a failed one', async () => {
      mockAuth.exchangeCodeForSession.mockRejectedValueOnce(new Error('offline'));
      const { auth, events } = await subscribe();
      await auth.handleNativeAuthCallback(`${CALLBACK}?code=abc`);
      expect(events.at(-1)).toEqual({ kind: 'error', reason: 'failed' });
    });

    // Anyone can build a link that carries tokens. Accepting it would sign the
    // learner into whichever account the link's author chose.
    it('ignores a link that carries tokens instead of a code', async () => {
      const { auth, events } = await subscribe();
      await auth.handleNativeAuthCallback(
        `${CALLBACK}#access_token=planted&refresh_token=planted&type=magiclink`
      );
      expect(mockAuth.setSession).not.toHaveBeenCalled();
      expect(mockAuth.exchangeCodeForSession).not.toHaveBeenCalled();
      expect(events).toEqual([]);
    });

    // The first half of a secure email change: nothing to exchange yet.
    it('stays quiet for a callback with neither code nor error', async () => {
      const { auth, events } = await subscribe();
      await auth.handleNativeAuthCallback(
        `${CALLBACK}#message=Confirmation+link+accepted.+Please+proceed+to+confirm+link+sent+to+the+other+email`
      );
      expect(events).toEqual([]);
    });

    it.each([
      ['another host on our scheme', 'com.sprachschule.deutsch://settings?code=abc'],
      ['another scheme', 'com.example.other://login-callback?code=abc'],
    ])('ignores %s', async (_label, url) => {
      const { auth, events } = await subscribe();
      await auth.handleNativeAuthCallback(url);
      expect(mockAuth.exchangeCodeForSession).not.toHaveBeenCalled();
      expect(events).toEqual([]);
    });

    it('stops notifying a listener that unsubscribed', async () => {
      const auth = await import('./auth.js');
      const fn = vi.fn();
      const off = auth.onNativeAuthCallback(fn);
      off();
      await auth.handleNativeAuthCallback(`${CALLBACK}?code=abc`);
      expect(fn).not.toHaveBeenCalled();
    });
  });

  describe('onNativeAuthCallback', () => {
    it('finishes a sign-in that opens the running app', async () => {
      const { onNativeAuthCallback } = await import('./auth.js');
      onNativeAuthCallback(() => {});
      await vi.waitFor(() => expect(nativePlugins.urlListener).toBeTypeOf('function'));
      nativePlugins.urlListener({ url: `${CALLBACK}?code=warm` });
      await vi.waitFor(() => expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith('warm'));
    });

    it('finishes a sign-in that cold-started the app', async () => {
      nativePlugins.launchUrl = `${CALLBACK}?code=cold`;
      const { onNativeAuthCallback } = await import('./auth.js');
      onNativeAuthCallback(() => {});
      await vi.waitFor(() => expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith('cold'));
    });

    it('listens once however many subscribe', async () => {
      const { onNativeAuthCallback } = await import('./auth.js');
      onNativeAuthCallback(() => {});
      onNativeAuthCallback(() => {});
      await vi.waitFor(() => expect(nativePlugins.appAddListener).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 0));
      expect(nativePlugins.appAddListener).toHaveBeenCalledTimes(1);
    });

    it('never loads the App plugin on the web', async () => {
      delete window.Capacitor;
      const { onNativeAuthCallback } = await import('./auth.js');
      onNativeAuthCallback(() => {});
      await new Promise((r) => setTimeout(r, 0));
      expect(nativePlugins.appAddListener).not.toHaveBeenCalled();
    });
  });
});
