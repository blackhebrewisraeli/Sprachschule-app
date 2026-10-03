import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

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

  // Dark until docs/AUTH_APPLE_OAUTH_RUNBOOK.md is done: a live button over an
  // unconfigured Supabase provider is a sign-in that cannot work, on the
  // platform that rejects apps for exactly that. Flip in the release commit.
  it('pins Sign in with Apple off', () => {
    expect(script).toMatch(/(^|\s)VITE_APPLE_AUTH_ENABLED=false(\s|$)/);
  });

  it('pins saved tutor conversations off', () => {
    expect(script).toMatch(/(^|\s)VITE_AI_HISTORY_ENABLED=false(\s|$)/);
  });

  it('pins the Sentry DSN empty, so native builds send no crash data', () => {
    expect(script).toMatch(/(^|\s)VITE_SENTRY_DSN=(\s|$)/);
  });
});
