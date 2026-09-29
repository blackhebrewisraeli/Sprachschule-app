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

const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

// Renders the hook and records every status it returns, tagged with the user it was rendered for.
function renderRecorded(initialUser) {
  const seen = [];
  const utils = renderHook(
    ({ user }) => {
      const value = useLegalAcceptance(user);
      seen.push({ id: user?.id ?? null, status: value.status });
      return value;
    },
    { initialProps: { user: initialUser } }
  );
  return { ...utils, seen };
}
const statusesFor = (seen, id) => seen.filter((s) => s.id === id).map((s) => s.status);
const storedHint = () => JSON.parse(localStorage.getItem(LEGAL_ACCEPTED_KEY));

describe('useLegalAcceptance: switching users and retrying', () => {
  it("never renders the previous user's accepted state for the next user", async () => {
    writeAcceptedHint('a');
    const b = deferred();
    api.fetch.mockReturnValue(b.promise);
    const { result, rerender, seen } = renderRecorded({ id: 'a' });
    expect(result.current.status).toBe('accepted');

    rerender({ user: { id: 'b' } });
    expect(result.current.status).toBe('checking');
    expect(statusesFor(seen, 'b')).not.toContain('accepted');

    await act(async () => {
      b.resolve({ current: true, hasPrior: true });
    });
    await waitFor(() => expect(result.current.status).toBe('accepted'));
    expect(api.fetch).toHaveBeenCalledWith('b');
  });

  it('drops a late fetch answer for the previous user (no status, no hint)', async () => {
    const a = deferred();
    const b = deferred();
    api.fetch.mockImplementation((id) => (id === 'a' ? a.promise : b.promise));
    const { result, rerender, seen } = renderRecorded({ id: 'a' });
    expect(result.current.status).toBe('checking');

    rerender({ user: { id: 'b' } });
    await act(async () => {
      a.resolve({ current: true, hasPrior: true });
    });
    expect(result.current.status).toBe('checking');
    expect(statusesFor(seen, 'b')).not.toContain('accepted');
    expect(localStorage.getItem(LEGAL_ACCEPTED_KEY)).toBeNull();

    await act(async () => {
      b.resolve({ current: false, hasPrior: false });
    });
    expect(result.current.status).toBe('required');
  });

  it("drops a late intent-accept for the previous user (hint stays the current user's)", async () => {
    recordIntent();
    const rpcA = deferred();
    api.accept.mockReturnValueOnce(rpcA.promise);
    const { result, rerender } = renderRecorded({ id: 'a' });
    await waitFor(() => expect(api.accept).toHaveBeenCalledTimes(1));

    rerender({ user: { id: 'b' } });
    await waitFor(() => expect(result.current.status).toBe('accepted'));
    expect(storedHint().userId).toBe('b');

    await act(async () => {
      rpcA.resolve();
    });
    expect(storedHint().userId).toBe('b');
    expect(result.current.status).toBe('accepted');
  });

  it("does not render 'checking' when an online retry refetches while required", async () => {
    const { result, seen } = renderRecorded({ id: 'u1' });
    await waitFor(() => expect(result.current.status).toBe('required'));
    const mark = seen.length;

    const again = deferred();
    api.fetch.mockReturnValue(again.promise);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(api.fetch).toHaveBeenCalledTimes(2));
    expect(result.current.status).toBe('required');

    await act(async () => {
      again.resolve({ current: false, hasPrior: false });
    });
    expect(result.current.status).toBe('required');
    expect(seen.slice(mark).map((s) => s.status)).not.toContain('checking');
  });

  it('keeps required when the online retry itself fails', async () => {
    const { result, seen } = renderRecorded({ id: 'u1' });
    await waitFor(() => expect(result.current.status).toBe('required'));
    const mark = seen.length;

    const again = deferred();
    api.fetch.mockReturnValue(again.promise);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await waitFor(() => expect(api.fetch).toHaveBeenCalledTimes(2));
    await act(async () => {
      again.reject(new Error('offline'));
    });
    expect(result.current.status).toBe('required');
    expect(seen.slice(mark).map((s) => s.status)).toEqual(seen.slice(mark).map(() => 'required'));
  });

  it('accept() resolving after a switch neither accepts the new user nor writes the old hint', async () => {
    const rpc = deferred();
    api.accept.mockReturnValue(rpc.promise);
    const { result, rerender, seen } = renderRecorded({ id: 'a' });
    await waitFor(() => expect(result.current.status).toBe('required'));

    let pending;
    act(() => {
      pending = result.current.accept();
    });
    rerender({ user: { id: 'b' } });
    await waitFor(() => expect(api.fetch).toHaveBeenCalledWith('b'));
    await waitFor(() => expect(result.current.status).toBe('required'));

    let outcome;
    await act(async () => {
      rpc.resolve();
      outcome = await pending;
    });
    expect(outcome.ok).toBe(false);
    expect(result.current.status).toBe('required');
    expect(statusesFor(seen, 'b')).not.toContain('accepted');
    expect(localStorage.getItem(LEGAL_ACCEPTED_KEY)).toBeNull();
  });
});

describe('useLegalAcceptance: a leftover intent is consumed by any settled session', () => {
  it('a hint-covered session clears the intent without any network call', () => {
    writeAcceptedHint('u1');
    recordIntent();
    const { result } = renderHook(() => useLegalAcceptance(U));
    expect(result.current.status).toBe('accepted');
    expect(hasValidIntent()).toBe(false);
    expect(api.fetch).not.toHaveBeenCalled();
    expect(api.accept).not.toHaveBeenCalled();
  });

  it('a server-confirmed session clears the intent without calling the RPC', async () => {
    api.fetch.mockResolvedValue({ current: true, hasPrior: true });
    recordIntent();
    const { result } = renderHook(() => useLegalAcceptance(U));
    await waitFor(() => expect(result.current.status).toBe('accepted'));
    expect(hasValidIntent()).toBe(false);
    expect(api.accept).not.toHaveBeenCalled();
  });

  it("never credits user A's leftover intent to a later user B with no record", async () => {
    recordIntent();
    api.fetch.mockImplementation(async (id) =>
      id === 'a' ? { current: true, hasPrior: true } : { current: false, hasPrior: false }
    );
    const { result, rerender, seen } = renderRecorded({ id: 'a' });
    await waitFor(() => expect(result.current.status).toBe('accepted'));

    rerender({ user: { id: 'b' } });
    await waitFor(() => expect(result.current.status).toBe('required'));
    expect(statusesFor(seen, 'b')).not.toContain('accepted');
    expect(api.accept).not.toHaveBeenCalled();
    expect(storedHint().userId).toBe('a');
  });
});
