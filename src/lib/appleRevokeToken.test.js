import { describe, it, expect, beforeEach } from 'vitest';
import {
  captureAppleRefreshToken,
  readAppleRefreshToken,
  clearAppleRefreshToken,
} from './appleRevokeToken.js';

const appleSession = (token) => ({
  provider_refresh_token: token,
  user: { app_metadata: { provider: 'apple' } },
});

describe('Apple revoke token hand-off', () => {
  beforeEach(() => sessionStorage.clear());

  it('keeps the refresh token from an Apple sign-in, in sessionStorage only', () => {
    captureAppleRefreshToken(appleSession('r.apple'));
    expect(readAppleRefreshToken()).toBe('r.apple');
    expect(localStorage.getItem('deutsch-apple-revoke-token')).toBeNull();
  });

  it('ignores other providers, missing tokens and no session', () => {
    captureAppleRefreshToken({
      provider_refresh_token: 'r.google',
      user: { app_metadata: { provider: 'google' } },
    });
    captureAppleRefreshToken(appleSession(undefined));
    captureAppleRefreshToken(null);
    expect(readAppleRefreshToken()).toBeNull();
  });

  it('forgets it on clear', () => {
    captureAppleRefreshToken(appleSession('r.apple'));
    clearAppleRefreshToken();
    expect(readAppleRefreshToken()).toBeNull();
  });
});
