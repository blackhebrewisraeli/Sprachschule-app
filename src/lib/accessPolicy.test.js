import { describe, it, expect } from 'vitest';
import { MODELS } from './ai-routing/catalog.js';
import {
  DAILY_LIMITS,
  DAILY_POOLS,
  REWARDED_AD,
  routerTierFor,
  unitsFor,
  clampModel,
  nextUtcReset,
} from './accessPolicy.js';

describe('accessPolicy', () => {
  it('carries the spec §6.1 starting numbers', () => {
    expect(DAILY_LIMITS.chat).toEqual({ guest: 10, free: 20, premium: 150 });
    expect(DAILY_LIMITS.grade).toEqual({ guest: 40, free: 150, premium: 300 });
    expect(DAILY_LIMITS.deck).toEqual({ guest: 1, free: 3, premium: 15 });
    expect(DAILY_POOLS.chat).toEqual({ guest: 2000, free: 20000 });
    expect(DAILY_POOLS.grade).toEqual({ guest: 5000, free: 40000 });
    expect(DAILY_POOLS.deck).toEqual({ guest: 200, free: 1000 });
    expect(REWARDED_AD).toEqual({ meter: 'chat', units: 5, dailyCap: 2 });
  });

  it('maps premium to the router ceiling key pro', () => {
    expect(routerTierFor('premium')).toBe('pro');
    expect(routerTierFor('free')).toBe('free');
    expect(routerTierFor('guest')).toBe('guest');
    expect(routerTierFor('nonsense')).toBe('guest');
  });

  it('weights chat by model profile and charges 1 elsewhere', () => {
    expect(unitsFor('chat', MODELS.haiku.id)).toBe(1);
    expect(unitsFor('chat', MODELS.sonnet.id)).toBe(2);
    expect(unitsFor('chat', MODELS.opus.id)).toBe(4);
    expect(unitsFor('grade', MODELS.sonnet.id)).toBe(1);
    expect(unitsFor('deck', MODELS.opus.id)).toBe(1);
  });

  it('charges an unknown chat model the maximum weight (fail expensive)', () => {
    expect(unitsFor('chat', 'claude-made-up')).toBe(4);
  });

  it('clamps a guest to the cheapest model and keeps an in-tier pick', () => {
    expect(clampModel(MODELS.opus.id, 'guest')).toBe(MODELS.haiku.id);
    expect(clampModel(MODELS.haiku.id, 'guest')).toBe(MODELS.haiku.id);
    expect(clampModel(MODELS.opus.id, 'premium')).toBe(MODELS.opus.id);
  });

  it('clamps to the most capable model within the ceiling', () => {
    // Free's ceiling is whatever TIERS.free.maxCost says (D2) — derive, don't hardcode.
    const freeTop = clampModel(MODELS.opus.id, 'free');
    expect([MODELS.haiku.id, MODELS.sonnet.id]).toContain(freeTop);
  });

  it('clamps an unknown model id to the ceiling rather than passing it through', () => {
    expect(clampModel('claude-made-up', 'premium')).toBe(MODELS.opus.id);
    expect(clampModel('claude-made-up', 'guest')).toBe(MODELS.haiku.id);
  });

  it('resets at the next 00:00 UTC', () => {
    expect(nextUtcReset(new Date('2026-10-01T23:59:59Z')).toISOString()).toBe(
      '2026-10-02T00:00:00.000Z'
    );
    expect(nextUtcReset(new Date('2026-10-02T00:00:00Z')).toISOString()).toBe(
      '2026-10-03T00:00:00.000Z'
    );
  });
});
