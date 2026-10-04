import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// build:mobile pins every VITE_* flag a native build must not inherit from a
// local .env file. Push stays OFF until docs/STORE_SUBMISSION_CHECKLIST.md is done.
// Saved tutor conversations and Sentry are pinned off too: the App Privacy and
// Data Safety answers describe a native build with neither, so a stray line in
// .env.production.local must not be able to make those answers untrue.
describe('build:mobile', () => {
  const script = JSON.parse(readFileSync('package.json', 'utf8')).scripts['build:mobile'];

  it('pins push notifications off', () => {
    expect(script).toMatch(/(^|\s)VITE_PUSH_ENABLED=false(\s|$)/);
  });

  // The owner completed docs/AUTH_APPLE_OAUTH_RUNBOOK.md: Apple Developer,
  // Supabase and the server-side deletion credentials are configured. Keep the
  // native release flag explicit so a local .env cannot hide the review login.
  it('pins Sign in with Apple on', () => {
    expect(script).toMatch(/(^|\s)VITE_APPLE_AUTH_ENABLED=true(\s|$)/);
  });

  it('pins saved tutor conversations off', () => {
    expect(script).toMatch(/(^|\s)VITE_AI_HISTORY_ENABLED=false(\s|$)/);
  });

  // The store answers say "no ads", and Vercel Hobby forbids them (spec §8).
  it('pins ads off', () => {
    expect(script).toMatch(/(^|\s)VITE_ADS_ENABLED=false(\s|$)/);
  });

  it('pins the Sentry DSN empty, so native builds send no crash data', () => {
    expect(script).toMatch(/(^|\s)VITE_SENTRY_DSN=(\s|$)/);
  });

  // These came from the owner's local .env, which sets both to false for the
  // Docker stack. Vite's production build reads .env too, so every native
  // build from that Mac shipped with sync and leagues OFF while production
  // web has both on, and a clean clone (Xcode Cloud, CI) has no .env at all.
  it('pins sync and leagues on, as production web ships them', () => {
    expect(script).toMatch(/(^|\s)VITE_SYNC_ENABLED=true(\s|$)/);
    expect(script).toMatch(/(^|\s)VITE_LEAGUES_ENABLED=true(\s|$)/);
  });

  // The class of bug above, guarded for good: a feature flag the app reads but
  // build:mobile does not pin is whatever the building machine's .env says.
  it('pins every VITE_*_ENABLED flag the app reads', () => {
    const files = (dir) =>
      readdirSync(dir).flatMap((f) => {
        const path = join(dir, f);
        if (statSync(path).isDirectory()) return files(path);
        return /\.(js|jsx)$/.test(f) && !/\.test\./.test(f) ? [path] : [];
      });
    const read = new Set(
      files('src').flatMap((f) =>
        [...readFileSync(f, 'utf8').matchAll(/VITE_[A-Z_]+_ENABLED/g)].map((m) => m[0])
      )
    );
    expect(read.size).toBeGreaterThanOrEqual(7);
    const unpinned = [...read].filter((flag) => !new RegExp(`(^|\\s)${flag}=`).test(script));
    expect(unpinned).toEqual([]);
  });
});
