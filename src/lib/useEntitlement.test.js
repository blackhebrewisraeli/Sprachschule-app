import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

vi.mock('./auth.js', () => ({ getSupabase: vi.fn() }));

import { getSupabase } from './auth.js';
import { ENTITLEMENT_CACHE_KEY, useEntitlement } from './useEntitlement.js';
import { getAccessTier } from './accessTier.js';

const DAY = 24 * 60 * 60 * 1000;
const future = () => new Date(Date.now() + DAY).toISOString();
const past = () => new Date(Date.now() - DAY).toISOString();

// from('entitlements').select(...).eq('user_id', id) resolves to the result.
const backend = (result) => {
  const eq = vi.fn(async () => result);
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  getSupabase.mockResolvedValue({ from });
  return { from, eq };
};
const cache = () => JSON.parse(localStorage.getItem(ENTITLEMENT_CACHE_KEY));

describe('useEntitlement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('is guest and fetches nothing without a userId', async () => {
    const { result } = renderHook(() => useEntitlement({ userId: null }));
    expect(result.current.tier).toBe('guest');
    expect(getSupabase).not.toHaveBeenCalled();
    expect(getAccessTier()).toBe('guest');
  });

  it.each([
    ['no expiry', null],
    ['a future expiry', future()],
  ])('an active row (%s) is premium and is cached with the user', async (_n, expires_at) => {
    backend({ data: [{ source: 'manual', expires_at }], error: null });
    const { result } = renderHook(() => useEntitlement({ userId: 'u1' }));
    await waitFor(() => expect(result.current.tier).toBe('premium'));
    expect(result.current.source).toBe('manual');
    expect(cache()).toMatchObject({ userId: 'u1', tier: 'premium' });
    expect(getAccessTier()).toBe('premium');
  });

  it.each([
    ['only expired rows', [{ source: 'manual', expires_at: past() }]],
    ['no rows', []],
  ])('%s is free', async (_n, data) => {
    backend({ data, error: null });
    const { result } = renderHook(() => useEntitlement({ userId: 'u1' }));
    await waitFor(() => expect(result.current.tier).toBe('free'));
    expect(getAccessTier()).toBe('free');
  });

  it('on a fetch error uses a fresh cache for the same user', async () => {
    localStorage.setItem(
      ENTITLEMENT_CACHE_KEY,
      JSON.stringify({ userId: 'u1', tier: 'premium', at: Date.now() - DAY })
    );
    backend({ data: null, error: { message: 'down' } });
    const { result } = renderHook(() => useEntitlement({ userId: 'u1' }));
    await waitFor(() => expect(result.current.tier).toBe('premium'));
  });

  it('on a fetch error ignores a stale cache (unknown, never premium)', async () => {
    localStorage.setItem(
      ENTITLEMENT_CACHE_KEY,
      JSON.stringify({ userId: 'u1', tier: 'premium', at: Date.now() - 8 * DAY })
    );
    const { from } = backend({ data: null, error: { message: 'relation does not exist' } });
    const { result } = renderHook(() => useEntitlement({ userId: 'u1' }));
    await waitFor(() => expect(from).toHaveBeenCalled());
    await waitFor(() => expect(result.current.tier).toBeNull());
    expect(getAccessTier()).toBeNull();
  });

  it('ignores a cache that belongs to another user', async () => {
    localStorage.setItem(
      ENTITLEMENT_CACHE_KEY,
      JSON.stringify({ userId: 'someone-else', tier: 'premium', at: Date.now() })
    );
    backend({ data: null, error: { message: 'down' } });
    const { result } = renderHook(() => useEntitlement({ userId: 'u1' }));
    await waitFor(() => expect(getSupabase).toHaveBeenCalled());
    await waitFor(() => expect(result.current.tier).toBeNull());
  });

  it('refresh() re-reads', async () => {
    const { eq } = backend({ data: [], error: null });
    const { result } = renderHook(() => useEntitlement({ userId: 'u1' }));
    await waitFor(() => expect(result.current.tier).toBe('free'));
    backend({ data: [{ source: 'manual', expires_at: null }], error: null });
    await act(async () => result.current.refresh());
    await waitFor(() => expect(result.current.tier).toBe('premium'));
    expect(eq).toHaveBeenCalledTimes(1);
  });
});
