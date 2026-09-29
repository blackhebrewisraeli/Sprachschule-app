// src/lib/useLegalAcceptance.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';

const api = vi.hoisted(() => ({
  fetch: vi.fn(),
  accept: vi.fn(),
}));
vi.mock('./legalAcceptance.js', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchAcceptances: (...a) => api.fetch(...a),
  acceptCurrentTerms: (...a) => api.accept(...a),
}));

import { useLegalAcceptance } from './useLegalAcceptance.js';
import {
  writeAcceptedHint,
  recordIntent,
  hasValidIntent,
  LEGAL_ACCEPTED_KEY,
} from './legalAcceptance.js';

const U = { id: 'u1' };

beforeEach(() => {
  localStorage.clear();
  api.fetch.mockReset().mockResolvedValue({ current: false, hasPrior: false });
  api.accept.mockReset().mockResolvedValue(undefined);
});

describe('useLegalAcceptance', () => {
  it('is none without a user and never calls the server', () => {
    const { result } = renderHook(() => useLegalAcceptance(null));
    expect(result.current.status).toBe('none');
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it('trusts a matching hint with no network (returning user, known device)', () => {
    writeAcceptedHint('u1');
    const { result } = renderHook(() => useLegalAcceptance(U));
    expect(result.current.status).toBe('accepted');
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it('accepts from the server on a new device and writes the hint', async () => {
    api.fetch.mockResolvedValue({ current: true, hasPrior: true });
    const { result } = renderHook(() => useLegalAcceptance(U));
    await waitFor(() => expect(result.current.status).toBe('accepted'));
    expect(localStorage.getItem(LEGAL_ACCEPTED_KEY)).toContain('u1');
    expect(api.accept).not.toHaveBeenCalled();
  });

  it('consumes a valid intent: records and accepts, no gate', async () => {
    recordIntent();
    const { result } = renderHook(() => useLegalAcceptance(U));
    await waitFor(() => expect(result.current.status).toBe('accepted'));
    expect(api.accept).toHaveBeenCalledTimes(1);
    expect(hasValidIntent()).toBe(false);
  });

  it('requires acceptance with no record and no intent (OAuth from a sign-in surface)', async () => {
    const { result } = renderHook(() => useLegalAcceptance(U));
    await waitFor(() => expect(result.current.status).toBe('required'));
    expect(result.current.hasPrior).toBe(false);
    expect(api.accept).not.toHaveBeenCalled();
  });

  it('ignores an expired intent', async () => {
    recordIntent(Date.now() - 31 * 60 * 1000);
    const { result } = renderHook(() => useLegalAcceptance(U));
    await waitFor(() => expect(result.current.status).toBe('required'));
    expect(api.accept).not.toHaveBeenCalled();
  });

  it('flags an older acceptance as hasPrior (updated terms)', async () => {
    api.fetch.mockResolvedValue({ current: false, hasPrior: true });
    const { result } = renderHook(() => useLegalAcceptance(U));
    await waitFor(() => expect(result.current.status).toBe('required'));
    expect(result.current.hasPrior).toBe(true);
  });

  it('goes unknown on a read error — never accepted, never required', async () => {
    api.fetch.mockRejectedValue({ code: 'PGRST205' });
    const { result } = renderHook(() => useLegalAcceptance(U));
    await waitFor(() => expect(result.current.status).toBe('unknown'));
  });

  it('retries when the browser comes back online', async () => {
    api.fetch
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ current: true, hasPrior: true });
    const { result } = renderHook(() => useLegalAcceptance(U));
    await waitFor(() => expect(result.current.status).toBe('unknown'));
    act(() => window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(result.current.status).toBe('accepted'));
  });

  it('releases a second tab when the first writes the hint', async () => {
    const { result } = renderHook(() => useLegalAcceptance(U));
    await waitFor(() => expect(result.current.status).toBe('required'));
    writeAcceptedHint('u1');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: LEGAL_ACCEPTED_KEY })));
    await waitFor(() => expect(result.current.status).toBe('accepted'));
  });

  it('removes the exact listeners it added on unmount', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = renderHook(() => useLegalAcceptance(U));
    const added = (type) => add.mock.calls.find(([t]) => t === type)?.[1];
    expect(added('online')).toBeTypeOf('function');
    expect(added('storage')).toBeTypeOf('function');
    unmount();
    expect(remove).toHaveBeenCalledWith('online', added('online'));
    expect(remove).toHaveBeenCalledWith('storage', added('storage'));
    add.mockRestore();
    remove.mockRestore();
  });

  it('accept() records and flips to accepted', async () => {
    const { result } = renderHook(() => useLegalAcceptance(U));
    await waitFor(() => expect(result.current.status).toBe('required'));
    let outcome;
    await act(async () => {
      outcome = await result.current.accept();
    });
    expect(outcome).toEqual({ ok: true });
    expect(result.current.status).toBe('accepted');
  });

  it('accept() reports failure and stays required', async () => {
    api.accept.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useLegalAcceptance(U));
    await waitFor(() => expect(result.current.status).toBe('required'));
    let outcome;
    await act(async () => {
      outcome = await result.current.accept();
    });
    expect(outcome.ok).toBe(false);
    expect(result.current.status).toBe('required');
  });
});
