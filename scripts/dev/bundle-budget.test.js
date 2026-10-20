import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BUDGET_BYTES, checkBundleBudget } from './bundle-budget.mjs';

const dirs = [];
/** A fake dist/: index.html loading `entry`, plus each file at its byte size. */
function dist(entry, files) {
  const dir = mkdtempSync(join(tmpdir(), 'bundle-budget-'));
  dirs.push(dir);
  mkdirSync(join(dir, 'assets'));
  writeFileSync(
    join(dir, 'index.html'),
    `<head><script type="module" crossorigin src="/${entry}"></script></head>`
  );
  for (const [name, bytes] of Object.entries(files)) {
    writeFileSync(join(dir, name), Buffer.alloc(bytes, 'a'));
  }
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('checkBundleBudget', () => {
  it("is Vite's 500 kB warning line, in bytes", () => {
    expect(BUDGET_BYTES).toBe(500_000);
  });

  it('passes one byte under the budget and reports the size', () => {
    const result = checkBundleBudget(
      dist('assets/index-a1.js', { 'assets/index-a1.js': BUDGET_BYTES - 1 })
    );
    expect(result.ok).toBe(true);
    expect(result.message).toBe('ok: assets/index-a1.js is 499999 bytes; budget is < 500000 bytes');
  });

  it('fails at exactly the budget', () => {
    const result = checkBundleBudget(
      dist('assets/index-a1.js', { 'assets/index-a1.js': BUDGET_BYTES })
    );
    expect(result.ok).toBe(false);
    expect(result.message).toBe(
      'OVER BUDGET: assets/index-a1.js is 500000 bytes; budget is < 500000 bytes'
    );
  });

  // The budget follows index.html, not a glob: a stale or unrelated large
  // index-*.js next to it must neither pass nor fail the check.
  it('measures the entry index.html loads, not another index-*.js', () => {
    const files = { 'assets/index-new.js': 10, 'assets/index-old.js': BUDGET_BYTES * 2 };
    expect(checkBundleBudget(dist('assets/index-new.js', files)).ok).toBe(true);
    expect(checkBundleBudget(dist('assets/index-old.js', files)).ok).toBe(false);
  });

  it('throws when index.html has no entry script', () => {
    const dir = dist('assets/main.js', { 'assets/main.js': 10 });
    expect(() => checkBundleBudget(dir)).toThrow(/no assets\/index-\*\.js entry script/);
  });
});
