#!/usr/bin/env node
/**
 * Entry-chunk budget: fails when the JS file dist/index.html loads as its
 * entry is 500,000 bytes or more. That is Vite's own "chunks larger than
 * 500 kB" warning line (build.chunkSizeWarningLimit, left at its default), so
 * this turns the warning into a red build instead of a line in the log.
 *
 * The budget is that threshold, not today's measured size. Do not raise it,
 * and do not pass this by moving first-paint code into another eagerly loaded
 * chunk: docs/superpowers/specs/2026-10-15-vite-bundle-splitting-design.md.
 *
 * Usage: npm run build && npm run check:bundle-budget   (optional arg: dist dir)
 */

import { readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const BUDGET_BYTES = 500_000;

/** The entry chunk index.html loads, and its size on disk in bytes. */
export function entryChunk(distDir) {
  const htmlPath = join(distDir, 'index.html');
  const src = readFileSync(htmlPath, 'utf8').match(
    /<script\b[^>]*\bsrc="\/?(assets\/index-[^"/]+\.js)"/
  )?.[1];
  if (!src) throw new Error(`no assets/index-*.js entry script in ${htmlPath}`);
  return { file: src, bytes: statSync(join(distDir, src)).size };
}

export function checkBundleBudget(distDir) {
  const { file, bytes } = entryChunk(distDir);
  const ok = bytes < BUDGET_BYTES;
  return {
    ok,
    message: `${ok ? 'ok' : 'OVER BUDGET'}: ${file} is ${bytes} bytes; budget is < ${BUDGET_BYTES} bytes`,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { ok, message } = checkBundleBudget(resolve(process.argv[2] ?? 'dist'));
    (ok ? console.log : console.error)(`bundle-budget ${message}`);
    process.exit(ok ? 0 : 1);
  } catch (err) {
    console.error(`bundle-budget: ${err.message}`);
    process.exit(1);
  }
}
