import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createAiHandler } from './handler.js';

function createRes() {
  return {
    statusCode: 0,
    headers: {},
    body: undefined,
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

const validBody = () => ({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 100,
  system: 'sys',
  messages: [{ role: 'user', content: 'Hallo' }],
});

const postReq = (overrides = {}) => ({
  method: 'POST',
  headers: { 'x-forwarded-for': '9.9.9.9' },
  body: validBody(),
  ...overrides,
});

const wideOpen = { name: 'ai.test', rate: { windowMs: 60000, max: 100 } };

describe('createAiHandler', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key');
    vi.stubEnv('ALLOWED_ORIGINS', '');
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
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('rejects non-POST methods with the envelope', async () => {
    const res = createRes();
    await createAiHandler(wideOpen)(postReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(405);
    expect(res.body.error.code).toBe('method_not_allowed');
  });

  it('rejects an unlisted Origin when the allow-list is configured', async () => {
    vi.stubEnv('ALLOWED_ORIGINS', 'https://good.example');
    const res = createRes();
    await createAiHandler(wideOpen)(
      postReq({ headers: { origin: 'https://evil.example', 'x-forwarded-for': '9.9.9.9' } }),
      res
    );
    expect(res.statusCode).toBe(403);
    expect(res.body.error.code).toBe('forbidden');
  });

  it('responds 500 when the server has no API key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    const res = createRes();
    await createAiHandler(wideOpen)(postReq(), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.error.code).toBe('server_error');
  });

  it('enforces the per-endpoint quota with Retry-After', async () => {
    const handler = createAiHandler({ name: 'ai.test', rate: { windowMs: 60000, max: 2 } });
    const r1 = createRes();
    const r2 = createRes();
    const r3 = createRes();
    await handler(postReq(), r1);
    await handler(postReq(), r2);
    await handler(postReq(), r3);
    expect(r1.statusCode).toBe(200);
    expect(r2.statusCode).toBe(200);
    expect(r3.statusCode).toBe(429);
    expect(r3.body.error.code).toBe('rate_limited');
    expect(Number(r3.headers['Retry-After'])).toBeGreaterThan(0);
  });

  it('rejects invalid bodies before calling upstream', async () => {
    const res = createRes();
    await createAiHandler(wideOpen)(postReq({ body: { model: 'nope' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('bad_request');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('forwards a clean body with server-side credentials and passes the response through', async () => {
    const res = createRes();
    await createAiHandler(wideOpen)(postReq({ body: { ...validBody(), tools: ['x'] } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ content: [{ type: 'text', text: 'ok' }] });
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(options.headers['x-api-key']).toBe('test-key');
    expect(options.headers['anthropic-version']).toBe('2023-06-01');
    const sent = JSON.parse(options.body);
    expect('tools' in sent).toBe(false);
    expect(sent.model).toBe('claude-haiku-4-5-20251001');
  });

  it('runs afterValidate and forwards the rewritten body', async () => {
    const afterValidate = vi.fn((safeBody) => ({
      ok: true,
      safeBody: { ...safeBody, system: `${safeBody.system}\n\nappendix` },
    }));
    const res = createRes();
    await createAiHandler({ ...wideOpen, afterValidate })(postReq(), res);
    expect(res.statusCode).toBe(200);
    expect(afterValidate).toHaveBeenCalled();
    expect(JSON.parse(fetch.mock.calls[0][1].body).system).toContain('appendix');
  });

  it('maps afterValidate failure to 400 and skips upstream', async () => {
    const res = createRes();
    await createAiHandler({
      ...wideOpen,
      afterValidate: () => ({ ok: false, message: 'Invalid vocab list' }),
    })(postReq(), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error.code).toBe('bad_request');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('forwards a routed Sonnet model id to Anthropic', async () => {
    const res = createRes();
    await createAiHandler(wideOpen)(
      postReq({ body: { ...validBody(), model: 'claude-sonnet-5-5' } }),
      res
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(fetch.mock.calls[0][1].body).model).toBe('claude-sonnet-5-5');
  });

  it('passes upstream error statuses through unchanged', async () => {
    fetch.mockResolvedValueOnce({
      status: 429,
      json: () =>
        Promise.resolve({ type: 'error', error: { type: 'rate_limit_error', message: 'busy' } }),
    });
    const res = createRes();
    await createAiHandler(wideOpen)(postReq(), res);
    expect(res.statusCode).toBe(429);
    expect(res.body.error.message).toBe('busy');
  });

  it('maps network failures to 502 upstream_error', async () => {
    fetch.mockRejectedValueOnce(new Error('boom'));
    const res = createRes();
    await createAiHandler(wideOpen)(postReq(), res);
    expect(res.statusCode).toBe(502);
    expect(res.body.error.code).toBe('upstream_error');
  });
});
