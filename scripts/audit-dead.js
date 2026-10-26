#!/usr/bin/env node
// `npm run audit:dead` — flag candidate dead code: modules under src/ that
// nothing imports, then those only tests import. Importers are read from src/,
// api/ and scripts/ (the server reaches into src/lib), lazy `import()` counts,
// and a root page's `<script src>` is an entry. Heuristic, not gospel — review
// before deleting. Always exits 0 (reporting tool, not a gate).
import { readdirSync, readFileSync } from 'node:fs';
import { collectSources } from './lib/collect.js';
import { buildGraph, findOrphans } from './lib/moduleGraph.js';

const TEST = /\.test\.(jsx?|mjs|tsx?)$/;
const files = collectSources(['src', 'api', 'scripts']);
const graph = buildGraph(files);

// index.html and exercise-preview.html mount their module by URL, not import.
const pageScripts = new Set(
  readdirSync('.')
    .filter((f) => f.endsWith('.html'))
    .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/<script[^>]*\ssrc="\/([^"]+)"/g)])
    .map((m) => m[1])
);
const ENTRY = [/(^|\/)test-setup\.js$/, TEST];
const inScope = (p) => p.startsWith('src/') && !pageScripts.has(p);

const orphans = findOrphans(files, graph, { entryPatterns: ENTRY }).filter(inScope);
const orphanSet = new Set(orphans);
const testOnly = findOrphans(files, graph, { entryPatterns: ENTRY, ignoreDependents: TEST })
  .filter(inScope)
  .filter((p) => !orphanSet.has(p));

if (orphans.length === 0) {
  console.log('✓ No orphan modules under src/.');
} else {
  console.log(`Found ${orphans.length} orphan module(s) under src/ — nothing imports them:\n`);
  for (const p of orphans) console.log(`  - ${p}`);
  console.log(
    '\nHeuristic: a hit may be an intended entrypoint or loaded by a computed path. Review before deleting.'
  );
}
if (testOnly.length) {
  console.log(`\n${testOnly.length} module(s) under src/ are imported only by tests:\n`);
  for (const p of testOnly) console.log(`  - ${p}  ← ${graph[p].dependents.join(', ')}`);
  console.log('\nExpected for test kits and contract validators; otherwise dead in the app.');
}
