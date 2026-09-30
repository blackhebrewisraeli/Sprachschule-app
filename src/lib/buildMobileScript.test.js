import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// build:mobile pins every VITE_* flag a native build must not inherit from a
// local .env file. Push stays OFF until docs/STORE_SUBMISSION_CHECKLIST.md is done.
describe('build:mobile', () => {
  const script = JSON.parse(readFileSync('package.json', 'utf8')).scripts['build:mobile'];

  it('pins push notifications off', () => {
    expect(script).toMatch(/(^|\s)VITE_PUSH_ENABLED=false(\s|$)/);
  });
});
