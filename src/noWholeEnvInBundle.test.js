import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// vitest runs from the repo root — avoid `process` (ESLint browser globals).
const SRC_DIR = 'src';

// Vite statically replaces `import.meta.env.VITE_X` with that one value. Any
// other use of `import.meta.env` — a default parameter, optional chaining, a
// bracket lookup, passing the object along — makes it inline the WHOLE env
// object, i.e. every VITE_ variable set at build time, into the public bundle.
// That is how the closed-beta tester list (a VITE_ variable) shipped to every
// visitor while no code even read it. Mirrors noPromptsInComponents.test.js: a
// source-level guard, not a runtime check.
const WHOLE_ENV = /import\.meta\.env(?!\.[A-Za-z_$])/;

// The tester list now lives in Supabase Auth's allowlist table only. A client
// reference to the old variable would bring the inlining risk straight back.
const BETA_LIST_VAR = 'VITE_SIGNUP_EMAIL_ALLOWLIST';

function walkSource(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walkSource(full, out);
      continue;
    }
    if (!/\.jsx?$/.test(name)) continue;
    // Tests run under vitest, never in the bundle, and stub the env freely.
    if (/\.test\.jsx?$/.test(name)) continue;
    out.push(full.replace(/\\/g, '/'));
  }
  return out;
}

describe('client bundle env exposure', () => {
  const files = walkSource(SRC_DIR);

  it('scanned the client source — the denominator, not just the findings', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain('src/lib/auth.js');
  });

  it('reads import.meta.env only as plain member expressions', () => {
    const offenders = [];
    for (const file of files) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (WHOLE_ENV.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
        });
    }
    expect(offenders).toEqual([]);
  });

  it('never references the old client-side tester list', () => {
    const offenders = files.filter((file) => readFileSync(file, 'utf8').includes(BETA_LIST_VAR));
    expect(offenders).toEqual([]);
  });
});
