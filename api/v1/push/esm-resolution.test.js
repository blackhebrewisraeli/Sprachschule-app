import { it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

// Same guard as api/v1/league/esm-resolution.test.js: Vercel runs functions
// under native Node ESM, which does not resolve extensionless relative imports
// the way Vitest does. Import the deployed module in a real node process.
it('api/v1/push/streak-reminder.js resolves all imports under native Node ESM', () => {
  expect(() =>
    execFileSync(
      'node',
      ['--input-type=module', '-e', "await import('./api/v1/push/streak-reminder.js')"],
      {
        cwd: process.cwd(),
        stdio: 'pipe',
      }
    )
  ).not.toThrow();
});
