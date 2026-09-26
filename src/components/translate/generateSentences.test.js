import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateMoreSentences } from './generateSentences';
import { callClaude } from '../../lib/claude';
import { setUserLevel } from '../../lib/levelPref';
import { SENTENCE_TOPICS } from '../../lib/prompts';

vi.mock('../../lib/claude', () => ({
  callClaude: vi.fn(),
}));

const row = { en: 'Hello', de: 'Hallo', blank: 'Hallo', distractors: ['Tschüss'] };

describe('generateMoreSentences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setUserLevel('a1');
  });

  it('sends grammar_generation routingContext, defaulting userTier to guest', async () => {
    callClaude.mockResolvedValue(JSON.stringify([row]));

    await expect(generateMoreSentences('a1')).resolves.toEqual([row]);
    expect(callClaude).toHaveBeenCalledWith(expect.any(String), expect.any(String), [], {
      endpoint: 'grade',
      routingContext: { taskType: 'grammar_generation', userTier: 'guest' },
    });
  });

  it('asks for A1 sentences when classified A1 even if called with b1', async () => {
    callClaude.mockResolvedValue(JSON.stringify([row]));
    await generateMoreSentences('b1');
    const [, user] = callClaude.mock.calls[0];
    expect(user).toMatch(/A1 level/);
    expect(user).not.toMatch(/B1 level/);
  });

  it('sets the batch in the scene it is given', async () => {
    callClaude.mockResolvedValue(JSON.stringify([row]));
    await generateMoreSentences('a1', 'a rock concert');
    expect(callClaude.mock.calls[0][1]).toContain('scene: a rock concert');
  });

  it('picks a scene from the topic list when none is given', async () => {
    callClaude.mockResolvedValue(JSON.stringify([row]));
    await generateMoreSentences('a1');
    const [, user] = callClaude.mock.calls[0];
    expect(SENTENCE_TOPICS.some((t) => user.includes(`scene: ${t}`))).toBe(true);
  });

  it('drops rows missing the English or the German', async () => {
    callClaude.mockResolvedValue(JSON.stringify([row, { en: 'No German' }, { de: 'Kein' }, null]));
    await expect(generateMoreSentences('a1')).resolves.toEqual([row]);
  });

  // The tab's catch reshuffles the bank; without the throw, a non-array would
  // reach `[...prev, ...more]` in a state updater and crash the render.
  it.each([
    ['an object', { en: 'x', de: 'y' }],
    ['an empty array', []],
  ])('throws on %s so the caller falls back to the bank', async (_what, payload) => {
    callClaude.mockResolvedValue(JSON.stringify(payload));
    await expect(generateMoreSentences('a1')).rejects.toThrow();
  });
});
