import { describe, it, expect } from 'vitest';
import { adsAllowed } from './ads.js';

describe('adsAllowed', () => {
  const prod = { enabled: true, native: true, dev: false };

  it('shows ads only to the Free tier in the native app', () => {
    expect(adsAllowed({ ...prod, tier: 'free' })).toBe(true);
    expect(adsAllowed({ ...prod, tier: 'premium' })).toBe(false);
    expect(adsAllowed({ ...prod, tier: 'guest' })).toBe(false);
    expect(adsAllowed({ ...prod, tier: null })).toBe(false);
    expect(adsAllowed({ ...prod, tier: 'free', native: false })).toBe(false);
  });

  it('shows nothing anywhere while the switch is off', () => {
    expect(adsAllowed({ ...prod, tier: 'free', enabled: false })).toBe(false);
    expect(adsAllowed({ ...prod, tier: 'free', enabled: false, dev: true })).toBe(false);
  });

  it('lets a dev server preview the placements whatever the tier', () => {
    expect(adsAllowed({ enabled: true, native: false, dev: true, tier: 'guest' })).toBe(true);
  });
});
