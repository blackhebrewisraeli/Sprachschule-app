// Regenerable disk-cache targets for `npm run clean`.
//
// Allowlist only: every path here is gitignored scratch that a later
// `npm run dev` / `build` / `test` / `audit:contrast` / `smoke:learning-path` /
// `smoke:auth-learning-path` / `import:lexicon` / `supabase start` / Gradle build
// recreates. Secrets, source, and `supabase/migrations` are never on this list.
//
// `.vercel` is deliberately absent. It is gitignored, but it is the local
// `vercel link` project (org/project ids in `.vercel/project.json`), not a
// build cache. `npm run dev:full` needs that link. Deleting it would force
// a re-link; that is config, not cruft.

import { existsSync, rmSync } from 'node:fs';
import { isAbsolute, join, normalize } from 'node:path';

export const CACHE_TARGETS = [
  // Vite / PWA build output
  'node_modules/.vite',
  'node_modules/.vite-temp',
  '.vite',
  'dist',
  'dev-dist',
  'dist-audit',
  'dist-smoke',
  'dist-smoke-auth',
  // Test / coverage / Playwright agent scratch
  'coverage',
  '.playwright-mcp',
  // Tooling + lexicon raw-download caches
  'node_modules/.cache',
  '.cache',
  // Gradle and Android compilation output. Keep android/app/release: it holds
  // signed store artifacts and is release evidence, not a cache.
  'android/.gradle',
  'android/build',
  'android/app/build',
  // Supabase CLI local-stack scratch (see .gitignore / supabase/.gitignore)
  'supabase/.temp',
  'supabase/.branches',
];

// A target may leave `cwd` only if it contains `..` or is absolute. The
// allowlist never does either; this rejects a bad caller before rm.
export function isSafeCacheTarget(target) {
  if (typeof target !== 'string' || target.length === 0) return false;
  if (isAbsolute(target)) return false;
  const normalized = normalize(target);
  if (normalized.startsWith('..') || normalized.split(/[/\\]/).includes('..')) {
    return false;
  }
  return true;
}

// Belt-and-suspenders: even a caller who passes a custom `targets` list
// cannot delete secrets, source, migrations, or the Vercel link.
export function isProtectedTarget(target) {
  if (typeof target !== 'string' || target.length === 0) return true;
  const normalized = normalize(target);
  if (normalized === '.env' || normalized.startsWith('.env.') || normalized.startsWith('.env/')) {
    return true;
  }
  if (normalized === 'node_modules') return true;
  if (normalized === 'src' || normalized.startsWith('src/')) return true;
  if (normalized === 'api' || normalized.startsWith('api/')) return true;
  if (normalized === 'supabase/migrations' || normalized.startsWith('supabase/migrations/')) {
    return true;
  }
  if (normalized === '.vercel' || normalized.startsWith('.vercel/')) return true;
  return false;
}

export function removeCacheTargets({
  targets = CACHE_TARGETS,
  cwd = process.cwd(),
  exists = existsSync,
  rm = rmSync,
  log = console.log,
} = {}) {
  let removed = 0;
  const removedPaths = [];

  for (const target of targets) {
    if (!isSafeCacheTarget(target) || isProtectedTarget(target)) continue;
    const path = join(cwd, target);
    if (!exists(path)) continue;
    rm(path, { recursive: true, force: true });
    log(`  removed ${target}`);
    removed += 1;
    removedPaths.push(target);
  }

  log(
    removed
      ? `Done — cleared ${removed} cache path(s). Next dev/build rebuilds fresh.`
      : 'Nothing to clean — no cache paths present.'
  );

  return { removed, removedPaths };
}
