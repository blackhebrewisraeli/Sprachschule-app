import { describe, it, expect, afterEach, vi } from 'vitest';
import { legalRouteFor, currentLegalRoute, LEGAL_ROUTES } from './legalRoute';

describe('legalRouteFor', () => {
  it('matches the bare paths', () => {
    expect(legalRouteFor({ pathname: '/privacy', hash: '' })).toBe('privacy');
    expect(legalRouteFor({ pathname: '/terms', hash: '' })).toBe('terms');
  });

  it('treats a trailing slash as the same route', () => {
    expect(legalRouteFor({ pathname: '/privacy/', hash: '' })).toBe('privacy');
  });

  it('accepts the hash fallback, for hosts with no SPA rewrite', () => {
    expect(legalRouteFor({ pathname: '/', hash: '#/privacy' })).toBe('privacy');
    expect(legalRouteFor({ pathname: '/', hash: '#/terms' })).toBe('terms');
  });

  it('matches the account-deletion page, bare, slashed and hashed', () => {
    expect(legalRouteFor({ pathname: '/delete-account', hash: '' })).toBe('delete-account');
    expect(legalRouteFor({ pathname: '/delete-account/', hash: '' })).toBe('delete-account');
    expect(legalRouteFor({ pathname: '/', hash: '#/delete-account' })).toBe('delete-account');
  });

  it('does not claim the app root or unrelated routes', () => {
    expect(legalRouteFor({ pathname: '/', hash: '' })).toBeNull();
    expect(legalRouteFor({ pathname: '/vocab', hash: '' })).toBeNull();
    // The settings hash must keep working — it is a different router.
    expect(legalRouteFor({ pathname: '/', hash: '#/settings' })).toBeNull();
  });

  it('does not match a path that merely contains a route name', () => {
    expect(legalRouteFor({ pathname: '/privacy-policy', hash: '' })).toBeNull();
    expect(legalRouteFor({ pathname: '/app/terms', hash: '' })).toBeNull();
  });

  it('tolerates an empty location', () => {
    expect(legalRouteFor({})).toBeNull();
    expect(legalRouteFor()).toBeNull();
  });
});

describe('legalRouteFor trailing slashes', () => {
  it('collapses any number of trailing slashes', () => {
    expect(legalRouteFor({ pathname: '/privacy///', hash: '' })).toBe('privacy');
    expect(legalRouteFor({ pathname: '/terms//////', hash: '' })).toBe('terms');
    expect(legalRouteFor({ pathname: '/', hash: '#/privacy//' })).toBe('privacy');
  });

  it('leaves a path that is only slashes as the root, not an empty key', () => {
    // '' must never index LEGAL_ROUTES — an empty key would be a silent match
    // if one were ever added.
    expect(legalRouteFor({ pathname: '///', hash: '' })).toBeNull();
    expect(LEGAL_ROUTES['']).toBeUndefined();
  });

  // Regression guard for the SonarCloud finding: the old `/\/+$/` backtracked,
  // so a long run of slashes was super-linear. The single-pass scan is linear —
  // if this ever goes quadratic again the budget catches it long before a
  // human notices the page hanging.
  it('stays fast on a pathological run of slashes', () => {
    const evil = `/privacy${'/'.repeat(50000)}`;
    const started = Date.now();
    expect(legalRouteFor({ pathname: evil, hash: '' })).toBe('privacy');
    expect(Date.now() - started).toBeLessThan(1000);
  });
});

describe('currentLegalRoute', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.pushState(null, '', '/');
  });

  it('reads the live location', () => {
    window.history.pushState(null, '', '/privacy');
    expect(currentLegalRoute()).toBe('privacy');
    window.history.pushState(null, '', '/terms');
    expect(currentLegalRoute()).toBe('terms');
  });

  it('is null on the app root', () => {
    window.history.pushState(null, '', '/');
    expect(currentLegalRoute()).toBeNull();
  });

  it('resolves the hash fallback from the live location', () => {
    window.history.pushState(null, '', '/#/terms');
    expect(currentLegalRoute()).toBe('terms');
  });

  it('returns null with no window, rather than throwing', () => {
    // The module is imported by App.jsx, which is rendered in environments
    // without a DOM; a throw here would take the whole app down.
    vi.stubGlobal('window', undefined);
    expect(currentLegalRoute()).toBeNull();
  });
});
