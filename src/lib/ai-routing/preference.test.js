import { describe, it, expect } from 'vitest';
import { MODELS, DEFAULT_TIER } from './catalog.js';
import {
  AUTO_MODEL,
  MODEL_PREFERENCES,
  sanitizePreferredModel,
  userTierOf,
  modelForProfile,
  preferenceFitsTier,
  preferenceOption,
} from './preference.js';

describe('sanitizePreferredModel', () => {
  it('keeps known preference ids', () => {
    expect(sanitizePreferredModel('auto')).toBe(AUTO_MODEL);
    expect(sanitizePreferredModel('fast')).toBe('fast');
    expect(sanitizePreferredModel('balanced')).toBe('balanced');
    expect(sanitizePreferredModel('capable')).toBe('capable');
  });

  it('drops unknown, non-string, and empty values to auto', () => {
    expect(sanitizePreferredModel(undefined)).toBe(AUTO_MODEL);
    expect(sanitizePreferredModel(null)).toBe(AUTO_MODEL);
    expect(sanitizePreferredModel('')).toBe(AUTO_MODEL);
    expect(sanitizePreferredModel('sonnet')).toBe(AUTO_MODEL);
    expect(sanitizePreferredModel('claude-haiku-4-5-20251001')).toBe(AUTO_MODEL);
    expect(sanitizePreferredModel(['fast'])).toBe(AUTO_MODEL);
    expect(sanitizePreferredModel({ id: 'fast' })).toBe(AUTO_MODEL);
  });

  it('lists Auto plus every catalog profile exactly once', () => {
    const ids = MODEL_PREFERENCES.map((p) => p.id);
    expect(ids[0]).toBe(AUTO_MODEL);
    const profiles = Object.values(MODELS).map((m) => m.profile);
    expect(ids.slice(1).sort()).toEqual([...profiles].sort());
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('userTierOf', () => {
  it('treats a missing user as guest', () => {
    expect(userTierOf(undefined)).toBe(DEFAULT_TIER);
    expect(userTierOf(null)).toBe(DEFAULT_TIER);
    expect(userTierOf({})).toBe(DEFAULT_TIER);
    expect(userTierOf({ id: '' })).toBe(DEFAULT_TIER);
    expect(userTierOf(['u1'])).toBe(DEFAULT_TIER);
  });

  it('treats a signed-in user as free', () => {
    expect(userTierOf({ id: 'u1' })).toBe('free');
  });

  it('does not treat isAdmin as a paid plan', () => {
    expect(userTierOf({ id: 'u1', isAdmin: true, isSystemAccount: true })).toBe('free');
    expect(userTierOf({ id: 'u1', role: 'admin' })).toBe('free');
  });

  it('reserves pro for an explicit plan/tier flag', () => {
    expect(userTierOf({ id: 'u1', plan: 'pro' })).toBe('pro');
    expect(userTierOf({ id: 'u1', tier: 'pro' })).toBe('pro');
    expect(userTierOf({ id: 'u1', plan: 'free' })).toBe('free');
  });
});

describe('modelForProfile / preferenceFitsTier', () => {
  it('resolves catalog rows by profile', () => {
    expect(modelForProfile('fast').id).toBe(MODELS.haiku.id);
    expect(modelForProfile('balanced').id).toBe(MODELS.sonnet.id);
    expect(modelForProfile('capable').id).toBe(MODELS.opus.id);
    expect(modelForProfile('auto')).toBeNull();
    expect(modelForProfile('nope')).toBeNull();
  });

  it('lets auto through every tier and blocks picks above the ceiling', () => {
    expect(preferenceFitsTier('auto', 'guest')).toBe(true);
    expect(preferenceFitsTier('fast', 'guest')).toBe(true);
    expect(preferenceFitsTier('balanced', 'guest')).toBe(false);
    expect(preferenceFitsTier('capable', 'guest')).toBe(false);
    expect(preferenceFitsTier('balanced', 'free')).toBe(false); // Premium perk (D2)
    expect(preferenceFitsTier('capable', 'free')).toBe(false);
    expect(preferenceFitsTier('capable', 'pro')).toBe(true);
  });

  it('looks up picker copy by id', () => {
    expect(preferenceOption('balanced')).toEqual({
      id: 'balanced',
      label: 'Balanced',
      detail: 'Sonnet',
    });
    expect(preferenceOption('nope').id).toBe(AUTO_MODEL);
  });
});
