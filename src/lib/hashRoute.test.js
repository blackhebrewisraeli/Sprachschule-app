import { describe, it, expect } from 'vitest';
import { isUnknownHashRoute, SETTINGS_HASH } from './hashRoute';

describe('isUnknownHashRoute', () => {
  it.each(['#/nope', '#/settingz', '#/privacy/extra', '#/home'])('flags %s', (hash) => {
    expect(isUnknownHashRoute(hash)).toBe(true);
  });

  it.each([
    ['no hash at all', ''],
    ['the bare root', '#/'],
    ['settings', SETTINGS_HASH],
    ['settings with a trailing slash', '#/settings/'],
    ['the legal fallback forms', '#/privacy'],
    ['the deletion page', '#/delete-account'],
    // Not routes: Supabase's callback fragments must reach AuthCallbackLanding.
    ['a magic-link token', '#access_token=abc&type=magiclink'],
    ['an auth error', '#error=access_denied&error_description=x'],
    ['an in-page anchor', '#main'],
  ])('leaves %s alone', (_name, hash) => {
    expect(isUnknownHashRoute(hash)).toBe(false);
  });
});
