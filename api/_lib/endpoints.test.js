import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { chatHandler as chat, gradeHandler as grade, deckHandler as deck } from './aiEndpoints.js';

const { rewrites } = JSON.parse(readFileSync('vercel.json', 'utf8'));

describe('AI endpoints', () => {
  it('every route exports a handler function', () => {
    expect(typeof chat).toBe('function');
    expect(typeof grade).toBe('function');
    expect(typeof deck).toBe('function');
  });

  // /api/chat was a function file of its own (api/chat.js) until the push
  // sender needed its slot under the Hobby cap. A rewrite keeps the URL on the
  // same handler without costing a function.
  it('the legacy /api/chat URL is rewritten onto the v1 chat handler', () => {
    expect(rewrites).toContainEqual({ source: '/api/chat', destination: '/api/v1/ai?op=chat' });
  });
});
