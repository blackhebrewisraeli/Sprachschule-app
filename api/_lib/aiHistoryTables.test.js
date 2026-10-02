import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

// Saved tutor conversations are private to the learner who wrote them
// (spec 2026-10-02 §11). This pins WHICH server code may name the tables:
// the account export (the learner's own copy) and nothing else. In particular
// no admin endpoint, support view, league, social or progress code can read
// them, and a new reader fails here until someone argues for it in review.
// The write path reaches them only through the append_ai_turn RPC, in
// aiHistory.js, which never names a table.
const ALLOWED = new Set(['api/_lib/accountEndpoints.js']);
// Whole names only: the purge RPC is called purge_ai_conversations.
const NAMES = /(?<!\w)(?:ai_conversations|ai_messages)(?!\w)/;

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return sources(path);
    return entry.name.endsWith('.js') && !entry.name.endsWith('.test.js') ? [path] : [];
  });
}

describe('saved conversation tables', () => {
  const files = sources('api');

  it('are named only by the account export', () => {
    const readers = files.filter((f) => NAMES.test(readFileSync(f, 'utf8')));
    expect(readers.filter((f) => !ALLOWED.has(f))).toEqual([]);
  });

  it('are never reachable from the admin lane', () => {
    for (const f of files.filter((p) => /admin/i.test(p))) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(NAMES);
    }
    expect(files.some((p) => /admin/i.test(p))).toBe(true);
  });

  it('guard sees the export (so an empty scan cannot pass)', () => {
    expect(files).toContain('api/_lib/accountEndpoints.js');
    expect(readFileSync('api/_lib/accountEndpoints.js', 'utf8')).toMatch(NAMES);
  });
});
