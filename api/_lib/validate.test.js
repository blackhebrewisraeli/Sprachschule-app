import { describe, it, expect } from 'vitest';
import { validateAiBody, ALLOWED_MODELS, MAX_TOKENS_CAP } from './validate.js';

const valid = () => ({
  model: 'claude-haiku-4-5-20251001',
  max_tokens: 1000,
  system: 'You are a tutor',
  messages: [{ role: 'user', content: 'Hallo' }],
});

describe('validateAiBody', () => {
  it('accepts a valid body and returns only known-safe fields', () => {
    const result = validateAiBody({ ...valid(), tools: [{ evil: true }], metadata: { x: 1 } });
    expect(result.ok).toBe(true);
    expect(result.safeBody).toEqual({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      system: 'You are a tutor',
      messages: [{ role: 'user', content: 'Hallo' }],
    });
    expect(Object.keys(result.safeBody).sort()).toEqual([
      'max_tokens',
      'messages',
      'model',
      'system',
    ]);
  });

  it('parses a JSON string body and rejects a malformed one', () => {
    expect(validateAiBody(JSON.stringify(valid())).ok).toBe(true);
    expect(validateAiBody('{not json').ok).toBe(false);
  });

  it('rejects non-object bodies', () => {
    expect(validateAiBody(null).ok).toBe(false);
    expect(validateAiBody(42).ok).toBe(false);
  });

  it('rejects unknown models', () => {
    expect(validateAiBody({ ...valid(), model: 'claude-opus-4-8' }).ok).toBe(false);
    expect(ALLOWED_MODELS).toContain('claude-haiku-4-5-20251001');
  });

  it('accepts every catalog model id the router can pick', () => {
    expect(validateAiBody({ ...valid(), model: 'claude-sonnet-5-5' }).ok).toBe(true);
    expect(validateAiBody({ ...valid(), model: 'claude-opus-5-5' }).ok).toBe(true);
    expect(ALLOWED_MODELS).toEqual([
      'claude-haiku-4-5-20251001',
      'claude-sonnet-5-5',
      'claude-opus-5-5',
    ]);
  });

  it('rejects the retired ids the catalog used to carry', () => {
    expect(validateAiBody({ ...valid(), model: 'claude-sonnet-4-5' }).ok).toBe(false);
    expect(validateAiBody({ ...valid(), model: 'claude-opus-4-1' }).ok).toBe(false);
  });

  it('clamps max_tokens to the cap and defaults bad values', () => {
    expect(validateAiBody({ ...valid(), max_tokens: 999999 }).safeBody.max_tokens).toBe(
      MAX_TOKENS_CAP
    );
    expect(validateAiBody({ ...valid(), max_tokens: 'lots' }).safeBody.max_tokens).toBe(1000);
    expect(validateAiBody({ ...valid(), max_tokens: -5 }).safeBody.max_tokens).toBe(1000);
  });

  it('rejects a non-string system prompt', () => {
    expect(validateAiBody({ ...valid(), system: { inject: true } }).ok).toBe(false);
  });

  it('omits system from safeBody when not provided', () => {
    const body = valid();
    delete body.system;
    const result = validateAiBody(body);
    expect(result.ok).toBe(true);
    expect('system' in result.safeBody).toBe(false);
  });

  it('rejects empty, oversized, or malformed message arrays', () => {
    expect(validateAiBody({ ...valid(), messages: [] }).ok).toBe(false);
    expect(validateAiBody({ ...valid(), messages: 'hi' }).ok).toBe(false);
    const tooMany = Array.from({ length: 101 }, () => ({ role: 'user', content: 'x' }));
    expect(validateAiBody({ ...valid(), messages: tooMany }).ok).toBe(false);
    expect(validateAiBody({ ...valid(), messages: [{ role: 'system', content: 'x' }] }).ok).toBe(
      false
    );
    expect(validateAiBody({ ...valid(), messages: [{ role: 'user', content: 7 }] }).ok).toBe(false);
  });

  it('rejects when total characters exceed the budget', () => {
    const huge = 'x'.repeat(100001);
    expect(validateAiBody({ ...valid(), messages: [{ role: 'user', content: huge }] }).ok).toBe(
      false
    );
  });
});
