import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ADAPTERS, isAnyProviderConfigured, forwardToProvider } from './forward.js';
import { ANTHROPIC_PROVIDER } from '../../src/lib/ai-routing/providers.js';
import { MODELS } from '../../src/lib/ai-routing/catalog.js';

const body = {
  model: MODELS.haiku.id,
  max_tokens: 10,
  messages: [{ role: 'user', content: 'Hallo' }],
};

describe('forwardToProvider', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          status: 200,
          json: () => Promise.resolve({ content: [{ type: 'text', text: 'ok' }] }),
        })
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers only Anthropic in the MVP adapter map', () => {
    expect(Object.keys(ADAPTERS)).toEqual([ANTHROPIC_PROVIDER]);
    expect(ADAPTERS[ANTHROPIC_PROVIDER].envKey).toBe('ANTHROPIC_API_KEY');
  });

  it('treats ANTHROPIC_API_KEY as sufficient configuration', () => {
    expect(isAnyProviderConfigured({ ANTHROPIC_API_KEY: 'sk-ant-test' })).toBe(true);
    expect(isAnyProviderConfigured({})).toBe(false);
    expect(isAnyProviderConfigured({ ANTHROPIC_API_KEY: '' })).toBe(false);
    expect(isAnyProviderConfigured({ OPENAI_API_KEY: 'sk-openai' })).toBe(false);
  });

  it('forwards catalog models through the Anthropic adapter', async () => {
    const env = { ANTHROPIC_API_KEY: 'secret-key' };
    const { status, data } = await forwardToProvider(body, env);
    expect(status).toBe(200);
    expect(data).toEqual({ content: [{ type: 'text', text: 'ok' }] });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(options.headers['x-api-key']).toBe('secret-key');
    expect(JSON.parse(options.body).model).toBe(MODELS.haiku.id);
  });

  it('forwards a Sonnet id the same way — provider is looked up, not hardcoded per call', async () => {
    await forwardToProvider({ ...body, model: MODELS.sonnet.id }, { ANTHROPIC_API_KEY: 'k' });
    expect(JSON.parse(fetch.mock.calls[0][1].body).model).toBe(MODELS.sonnet.id);
  });

  it("adds the catalog row's request params server-side", async () => {
    await forwardToProvider({ ...body, model: MODELS.sonnet.id }, { ANTHROPIC_API_KEY: 'k' });
    await forwardToProvider({ ...body, model: MODELS.opus.id }, { ANTHROPIC_API_KEY: 'k' });
    await forwardToProvider(body, { ANTHROPIC_API_KEY: 'k' });
    const [sonnet, opus, haiku] = fetch.mock.calls.map(([, o]) => JSON.parse(o.body));
    expect(sonnet.thinking).toEqual({ type: 'between_tools' });
    expect(opus.output_config).toEqual({ effort: 'low' });
    expect(haiku).toEqual(body);
  });

  it('throws when the matching provider key is missing', async () => {
    await expect(forwardToProvider(body, {})).rejects.toThrow(/not configured/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
