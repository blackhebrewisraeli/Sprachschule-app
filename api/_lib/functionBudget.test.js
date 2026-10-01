import { it, expect } from 'vitest';
import { readdirSync } from 'node:fs';

// Vercel deploys every .js file under api/ as its own function (except
// underscore-prefixed paths and the *.test.js files .vercelignore drops), and
// on the Hobby plan it refuses a deployment with more than 12. The account,
// progress, AI and admin lanes were each merged into one dispatcher to stay
// under that; this makes a 13th file fail CI instead of the deploy.
const HOBBY_FUNCTION_CAP = 12;

function deployedFunctions(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('_')) return [];
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return deployedFunctions(path);
    return entry.name.endsWith('.js') && !entry.name.endsWith('.test.js') ? [path] : [];
  });
}

it('stays within the Hobby plan function cap', () => {
  const functions = deployedFunctions('api');
  expect(functions.length, functions.join('\n')).toBeLessThanOrEqual(HOBBY_FUNCTION_CAP);
});
