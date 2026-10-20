import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CACHE_TARGETS,
  isProtectedTarget,
  isSafeCacheTarget,
  removeCacheTargets,
} from './cleanCaches.js';

describe('CACHE_TARGETS', () => {
  it('lists the regenerable caches this repo actually produces', () => {
    expect(CACHE_TARGETS).toEqual([
      'node_modules/.vite',
      'node_modules/.vite-temp',
      '.vite',
      'dist',
      'dev-dist',
      'dist-audit',
      'dist-smoke',
      'dist-smoke-auth',
      'coverage',
      '.playwright-mcp',
      'node_modules/.cache',
      '.cache',
      'android/.gradle',
      'android/build',
      'android/app/build',
      'supabase/.temp',
      'supabase/.branches',
    ]);
  });

  it('does not include secrets, source, migrations, vercel link state, or signed releases', () => {
    const forbidden = [
      '.env',
      '.env.local',
      'node_modules',
      'src',
      'api',
      'supabase',
      'supabase/migrations',
      '.vercel',
      'android',
      'android/app',
      'android/app/release',
    ];
    for (const path of forbidden) {
      expect(CACHE_TARGETS).not.toContain(path);
    }
  });

  it('every listed path is a safe relative target and not protected', () => {
    for (const target of CACHE_TARGETS) {
      expect(isSafeCacheTarget(target)).toBe(true);
      expect(isProtectedTarget(target)).toBe(false);
    }
  });
});

describe('isSafeCacheTarget', () => {
  it('rejects absolute paths and parent-directory escapes', () => {
    expect(isSafeCacheTarget('/tmp/dist')).toBe(false);
    expect(isSafeCacheTarget('../.env')).toBe(false);
    expect(isSafeCacheTarget('foo/../../.env')).toBe(false);
    expect(isSafeCacheTarget('')).toBe(false);
  });
});

describe('isProtectedTarget', () => {
  it('blocks secrets, source trees, migrations, and .vercel', () => {
    expect(isProtectedTarget('.env')).toBe(true);
    expect(isProtectedTarget('.env.local')).toBe(true);
    expect(isProtectedTarget('src/App.jsx')).toBe(true);
    expect(isProtectedTarget('node_modules')).toBe(true);
    expect(isProtectedTarget('supabase/migrations/keep.sql')).toBe(true);
    expect(isProtectedTarget('.vercel/project.json')).toBe(true);
  });

  it('does not block allowlisted caches under node_modules or supabase', () => {
    expect(isProtectedTarget('node_modules/.vite')).toBe(false);
    expect(isProtectedTarget('node_modules/.cache')).toBe(false);
    expect(isProtectedTarget('supabase/.temp')).toBe(false);
  });
});

describe('removeCacheTargets', () => {
  it('removes only listed paths that exist and leaves secrets and source', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'deutsch-clean-'));
    try {
      mkdirSync(join(cwd, 'dist'), { recursive: true });
      mkdirSync(join(cwd, '.cache', 'lexicon-raw'), { recursive: true });
      mkdirSync(join(cwd, 'src'), { recursive: true });
      mkdirSync(join(cwd, '.vercel'), { recursive: true });
      mkdirSync(join(cwd, 'supabase', 'migrations'), { recursive: true });
      writeFileSync(join(cwd, '.env'), 'SECRET=1');
      writeFileSync(join(cwd, 'src', 'App.jsx'), '// stay');
      writeFileSync(join(cwd, '.vercel', 'project.json'), '{}');
      writeFileSync(join(cwd, 'supabase', 'migrations', 'keep.sql'), '-- stay');

      const logs = [];
      const result = removeCacheTargets({ cwd, log: (msg) => logs.push(msg) });

      expect(result.removed).toBe(2);
      expect(result.removedPaths).toEqual(['dist', '.cache']);
      expect(existsSync(join(cwd, 'dist'))).toBe(false);
      expect(existsSync(join(cwd, '.cache'))).toBe(false);
      expect(existsSync(join(cwd, '.env'))).toBe(true);
      expect(existsSync(join(cwd, 'src', 'App.jsx'))).toBe(true);
      expect(existsSync(join(cwd, '.vercel', 'project.json'))).toBe(true);
      expect(existsSync(join(cwd, 'supabase', 'migrations', 'keep.sql'))).toBe(true);
      expect(logs).toContain('  removed dist');
      expect(logs).toContain('  removed .cache');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('prints nothing-to-clean and removes zero paths when none exist', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'deutsch-clean-empty-'));
    try {
      const logs = [];
      const result = removeCacheTargets({ cwd, log: (msg) => logs.push(msg) });
      expect(result.removed).toBe(0);
      expect(result.removedPaths).toEqual([]);
      expect(logs.at(-1)).toBe('Nothing to clean — no cache paths present.');
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('does not follow `..` out of cwd and refuses a custom .env target', () => {
    const parent = mkdtempSync(join(tmpdir(), 'deutsch-clean-parent-'));
    const cwd = join(parent, 'repo');
    try {
      mkdirSync(cwd);
      writeFileSync(join(parent, '.env'), 'SECRET=1');
      writeFileSync(join(cwd, '.env'), 'SECRET=2');
      const logs = [];
      const result = removeCacheTargets({
        cwd,
        targets: ['../.env', '.env'],
        log: (msg) => logs.push(msg),
      });
      expect(result.removed).toBe(0);
      expect(existsSync(join(parent, '.env'))).toBe(true);
      expect(existsSync(join(cwd, '.env'))).toBe(true);
      expect(logs.at(-1)).toBe('Nothing to clean — no cache paths present.');
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });
});
