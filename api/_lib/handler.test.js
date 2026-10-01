import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// resolveCaller asks GoTrue through serviceClient; tests control getUser here,
// the way auth-middleware.test.js does.
vi.mock('./supabase.js', () => ({ serviceClient: vi.fn() }));

import { createAiHandler } from './handler.js';
import { serviceClient } from './supabase.js';
import { MODELS } from '../../src/lib/ai-routing/catalog.js';
import { clampModel } from '../../src/lib/accessPolicy.js';

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

const bearer = (token, body = validBody()) =>
  postReq({ headers: { 'x-forwarded-for': '9.9.9.9', authorization: `Bearer ${token}` }, body });

// GoTrue knows exactly these tokens; anything else is rejected like a revoked one.
// Set AFTER createAiHandler: the limiter picks its store from serviceClient().
const goTrueKnows = (users) =>
  serviceClient.mockReturnValue({
    auth: {
      getUser: vi.fn(async (token) =>
        users[token]
          ? { data: { user: users[token] }, error: null }
          : { data: { user: null }, error: { status: 401, name: 'AuthApiError' } }
      ),
    },
  });

const sentModel = () => JSON.parse(fetch.mock.calls[0][1].body).model;

describe('createAiHandler', () => {
  beforeEach(() => {
    serviceClient.mockReturnValue(null);
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
    vi.restoreAllMocks();
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

  // Spec F1: the ceiling used to exist only in the client router, so a curl
  // could ask for the most expensive model at the IP rate limit.
  it.each([MODELS.sonnet.id, MODELS.opus.id])(
    'clamps a guest asking for %s to Haiku',
    async (model) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const res = createRes();
      await createAiHandler(wideOpen)(postReq({ body: { ...validBody(), model } }), res);
      expect(res.statusCode).toBe(200);
      expect(sentModel()).toBe(MODELS.haiku.id);
      const line = warn.mock.calls.map(([l]) => l).find((l) => l.includes('model_clamped'));
      expect(JSON.parse(line)).toEqual({
        event: 'model_clamped',
        from: model,
        to: MODELS.haiku.id,
        tier: 'guest',
      });
    }
  );

  it('keeps a guest on Haiku without logging a clamp', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await createAiHandler(wideOpen)(postReq(), createRes());
    expect(sentModel()).toBe(MODELS.haiku.id);
    expect(warn.mock.calls.flat().join('')).not.toContain('model_clamped');
  });

  // Holds under either D2 answer: the expectation is derived, not hardcoded.
  // Opus is above Free's ceiling under either D2 answer, so the clamp line is
  // always written and its tier shows the caller was mapped to Free, not Guest.
  it('applies the Free ceiling to a signed-in caller', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handler = createAiHandler(wideOpen);
    goTrueKnows({ t1: { id: 'u1' } });
    const res = createRes();
    await handler(bearer('t1', { ...validBody(), model: MODELS.opus.id }), res);
    expect(res.statusCode).toBe(200);
    expect(sentModel()).toBe(clampModel(MODELS.opus.id, 'free'));
    const line = warn.mock.calls.map(([l]) => l).find((l) => l.includes('model_clamped'));
    expect(JSON.parse(line).tier).toBe('free');
    expect(line).not.toContain('u1');
  });

  it('rejects a bad token with 401 before forwarding', async () => {
    const handler = createAiHandler(wideOpen);
    goTrueKnows({});
    const res = createRes();
    await handler(bearer('revoked'), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error.code).toBe('unauthorized');
    expect(fetch).not.toHaveBeenCalled();
  });

  // A classroom behind one NAT shares an IP; signed-in learners get their own.
  it('keys the burst limiter on the user, not the IP', async () => {
    const handler = createAiHandler({ name: 'ai.test', rate: { windowMs: 60000, max: 1 } });
    goTrueKnows({ a: { id: 'ua' }, b: { id: 'ub' } });
    const first = createRes();
    const other = createRes();
    const again = createRes();
    await handler(bearer('a'), first);
    await handler(bearer('b'), other);
    await handler(bearer('a'), again);
    expect(first.statusCode).toBe(200);
    expect(other.statusCode).toBe(200);
    expect(again.statusCode).toBe(429);
    expect(again.body.error.code).toBe('rate_limited');
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
