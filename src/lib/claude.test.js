import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { callClaude } from './claude';
import { MODELS, TASKS, COMPLEXITY_BUMP_AT } from './ai-routing/catalog.js';

function postedBody() {
  return JSON.parse(fetch.mock.calls.at(-1)[1].body);
}

describe('callClaude', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              content: [
                { type: 'text', text: 'Hallo' },
                { type: 'tool_use', id: 'x' },
                { type: 'text', text: ' Welt' },
              ],
            }),
        })
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs system prompt, user message, and history to the API URL', async () => {
    const history = [{ role: 'assistant', content: 'Hi' }];
    const result = await callClaude('You are a tutor', 'Wie geht es dir?', history);

    expect(result).toBe('Hallo\n Welt');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('/api/v1/ai/chat');
    expect(options.method).toBe('POST');
    const body = JSON.parse(options.body);
    expect(body.system).toBe('You are a tutor');
    expect(body.messages).toEqual([
      { role: 'assistant', content: 'Hi' },
      { role: 'user', content: 'Wie geht es dir?' },
    ]);
    expect(body.model).toBe(MODELS.haiku.id);
  });

  it('posts classified level and vocab extras on the chat endpoint only', async () => {
    await callClaude('sys', 'msg', [], { level: 'a1', vocab: ['hello', 'please'] });
    expect(postedBody().level).toBe('a1');
    expect(postedBody().vocab).toEqual(['hello', 'please']);

    await callClaude('sys', 'msg', [], {
      endpoint: 'grade',
      level: 'b1',
      vocab: ['hello'],
      routingContext: { taskType: 'translation_check', userTier: 'guest' },
    });
    expect(postedBody().level).toBeUndefined();
    expect(postedBody().vocab).toBeUndefined();
  });

  it('defaults a missing routingContext to the cheapest baseline (Haiku)', async () => {
    await callClaude('sys', 'msg');
    expect(postedBody().model).toBe(MODELS.haiku.id);
    expect(postedBody().max_tokens).toBe(TASKS.chat.maxTokens);
  });

  it.each([
    {
      name: 'guest translation check',
      routingContext: { taskType: 'translation_check', userTier: 'guest' },
      model: MODELS.haiku.id,
      maxTokens: TASKS.translation_check.maxTokens,
    },
    {
      name: 'free chat',
      routingContext: { taskType: 'chat', userTier: 'free' },
      model: MODELS.haiku.id,
      maxTokens: TASKS.chat.maxTokens,
    },
    {
      name: 'pro chat',
      routingContext: { taskType: 'chat', userTier: 'pro' },
      model: MODELS.sonnet.id,
      maxTokens: TASKS.chat.maxTokens,
    },
    {
      name: 'complex pro chat',
      routingContext: {
        taskType: 'chat',
        userTier: 'pro',
        complexityScore: COMPLEXITY_BUMP_AT,
      },
      model: MODELS.opus.id,
      maxTokens: TASKS.chat.maxTokens,
    },
    {
      name: 'pro deck generation',
      routingContext: { taskType: 'deck_generation', userTier: 'pro' },
      model: MODELS.sonnet.id,
      maxTokens: TASKS.deck_generation.maxTokens,
    },
  ])(
    'sends the routed $name model in the fetch payload',
    async ({ routingContext, model, maxTokens }) => {
      await callClaude('sys', 'msg', [], { routingContext });
      const body = postedBody();
      expect(body.model).toBe(model);
      expect(body.max_tokens).toBe(maxTokens);
    }
  );

  it('honours an in-tier preferredModel instead of the automatic pick', async () => {
    await callClaude('sys', 'msg', [], {
      routingContext: { taskType: 'chat', userTier: 'pro', preferredModel: 'fast' },
    });
    expect(postedBody().model).toBe(MODELS.haiku.id);
    expect(postedBody().max_tokens).toBe(TASKS.chat.maxTokens);
  });

  it('falls back to the automatic route when preferredModel exceeds the tier', async () => {
    await callClaude('sys', 'msg', [], {
      routingContext: { taskType: 'chat', userTier: 'guest', preferredModel: 'balanced' },
    });
    expect(postedBody().model).toBe(MODELS.haiku.id);

    await callClaude('sys', 'msg', [], {
      routingContext: { taskType: 'chat', userTier: 'free', preferredModel: 'capable' },
    });
    expect(postedBody().model).toBe(MODELS.haiku.id);
  });

  it('keeps endpoint routing independent of the selected model', async () => {
    await callClaude('sys', 'msg', [], {
      endpoint: 'grade',
      routingContext: { taskType: 'translation_check', userTier: 'free' },
    });
    expect(fetch.mock.calls[0][0]).toBe('/api/v1/ai/grade');
    expect(postedBody().model).toBe(MODELS.haiku.id);
    expect(postedBody().max_tokens).toBe(TASKS.translation_check.maxTokens);
  });

  it('routes to the requested endpoint and defaults to chat', async () => {
    await callClaude('sys', 'msg');
    expect(fetch.mock.calls[0][0]).toBe('/api/v1/ai/chat');

    await callClaude('sys', 'msg', [], { endpoint: 'grade' });
    expect(fetch.mock.calls[1][0]).toBe('/api/v1/ai/grade');

    await callClaude('sys', 'msg', [], { endpoint: 'deck' });
    expect(fetch.mock.calls[2][0]).toBe('/api/v1/ai/deck');
  });

  it('throws with API status and message on non-OK response', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ error: { message: 'overloaded' } }),
    });

    await expect(callClaude('sys', 'user')).rejects.toThrow('API call failed (503): overloaded');
  });

  it('falls back to stringified error body when message is missing', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ reason: 'bad request' }),
    });

    await expect(callClaude('sys', 'user')).rejects.toThrow('API call failed (400)');
  });

  it('handles unparseable error JSON gracefully', async () => {
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('invalid json')),
    });

    await expect(callClaude('sys', 'user')).rejects.toThrow('API call failed (500): {}');
  });
});
