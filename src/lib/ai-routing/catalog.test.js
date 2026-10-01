import { describe, it, expect } from 'vitest';
import {
  MODELS,
  TASKS,
  TIERS,
  COMPLEXITY_BUMP_AT,
  MAX_CAPABILITY,
  DEFAULT_TIER,
} from './catalog.js';

describe('AI routing catalog', () => {
  it('orders models so cheaper is faster and less capable', () => {
    expect(MODELS.haiku.cost).toBeLessThan(MODELS.sonnet.cost);
    expect(MODELS.sonnet.cost).toBeLessThan(MODELS.opus.cost);
    expect(MODELS.haiku.capability).toBeLessThan(MODELS.sonnet.capability);
    expect(MODELS.sonnet.capability).toBeLessThan(MODELS.opus.capability);
    expect(MODELS.haiku.latencyMs).toBeLessThan(MODELS.sonnet.latencyMs);
    expect(MODELS.sonnet.latencyMs).toBeLessThan(MODELS.opus.latencyMs);
  });

  it('keeps Haiku on the production pin already used by callClaude', () => {
    expect(MODELS.haiku.id).toBe('claude-haiku-4-5-20251001');
    expect(MODELS.haiku.profile).toBe('fast');
    expect(MODELS.sonnet.profile).toBe('balanced');
    expect(MODELS.opus.profile).toBe('capable');
  });

  // Anthropic retired claude-opus-4-1 on 2026-08-05 and retires claude-sonnet-4-5
  // on 2026-11-30 (platform.claude.com/docs/en/about-claude/model-deprecations).
  // A retired id fails every request, so the catalog pins the live successors.
  it('pins live model ids — no retired or deprecated id', () => {
    expect(MODELS.sonnet.id).toBe('claude-sonnet-5-5');
    expect(MODELS.opus.id).toBe('claude-opus-5-5');
    const ids = Object.values(MODELS).map((m) => m.id);
    for (const retired of ['claude-opus-4-1', 'claude-sonnet-4-5']) {
      expect(ids).not.toContain(retired);
    }
  });

  // Both successors think by default, and thinking counts toward max_tokens —
  // which chat caps at 1000 for a short JSON reply. Each row carries the request
  // fields that keep the tutor fast and the reply inside that cap.
  it('fixes per-model request params so thinking cannot eat the reply budget', () => {
    expect(MODELS.haiku.params).toBeUndefined();
    expect(MODELS.sonnet.params).toEqual({ thinking: { type: 'between_tools' } });
    expect(MODELS.opus.params).toEqual({ output_config: { effort: 'low' } });
  });

  it('names a provider on every catalog row so the server adapter can dispatch', () => {
    for (const model of Object.values(MODELS)) {
      expect(model.provider).toBe('anthropic');
    }
  });

  it('sets translation_check cheaper and faster than generative tasks', () => {
    expect(TASKS.translation_check.minCapability).toBeLessThan(TASKS.chat.minCapability);
    expect(TASKS.translation_check.maxTokens).toBeLessThan(TASKS.chat.maxTokens);
    expect(TASKS.translation_check.defaultLatencyMs).toBeLessThan(TASKS.chat.defaultLatencyMs);
    expect(TASKS.chat.minCapability).toBe(TASKS.grammar_generation.minCapability);
    expect(TASKS.grammar_generation.minCapability).toBe(TASKS.deck_generation.minCapability);
  });

  it('caps guest below free below pro', () => {
    expect(TIERS.guest.maxCost).toBeLessThan(TIERS.free.maxCost);
    expect(TIERS.free.maxCost).toBeLessThan(TIERS.pro.maxCost);
    expect(TIERS.pro.maxCost).toBe(MODELS.opus.cost);
    expect(DEFAULT_TIER).toBe('guest');
  });

  it('bumps complexity below 1 so a 0.7 check is reachable', () => {
    expect(COMPLEXITY_BUMP_AT).toBeGreaterThan(0);
    expect(COMPLEXITY_BUMP_AT).toBeLessThan(1);
    expect(MAX_CAPABILITY).toBe(MODELS.opus.capability);
  });
});
