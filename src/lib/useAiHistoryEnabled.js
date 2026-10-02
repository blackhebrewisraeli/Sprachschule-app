import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { isAuthConfigured } from './auth.js';
import { isAiHistoryConfigured, fetchHistoryEnabled, saveHistoryEnabled } from './aiHistory.js';

// One shared answer, so Settings' switch and Chat's sending agree without
// either owning the other. In memory only: nothing is persisted on the device.
//   status: 'idle' (nothing asked) | 'loading' | 'ready' | 'error'
let state = { userId: null, enabled: false, status: 'idle' };
const listeners = new Set();
const set = (next) => {
  state = { ...state, ...next };
  listeners.forEach((fn) => fn());
};
const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
const snapshot = () => state;

/** Test hook: forget everything, as a fresh page load would. */
export function resetAiHistoryState() {
  state = { userId: null, enabled: false, status: 'idle' };
  listeners.forEach((fn) => fn());
}

/**
 * Whether tutor turns are being saved for `userId`.
 *
 *   available  the build has the feature on, auth is configured, and the
 *              learner is signed in. Otherwise render nothing and send nothing.
 *   enabled    only true once the server said so. Unknown or failed is false,
 *              so an unreadable answer never saves anything.
 *   setEnabled resolves { ok }. Turning OFF applies locally first and is kept
 *              even if the server write fails (so this device stops sending at
 *              once); turning ON applies only after the server confirms.
 */
export function useAiHistoryEnabled(userId) {
  const s = useSyncExternalStore(subscribe, snapshot, snapshot);
  const available = Boolean(userId) && isAiHistoryConfigured() && isAuthConfigured();
  const mine = s.userId === userId;

  useEffect(() => {
    if (!available) return;
    if (state.userId === userId && state.status !== 'idle') return;
    set({ userId, enabled: false, status: 'loading' });
    void fetchHistoryEnabled(userId).then(
      (enabled) => state.userId === userId && set({ enabled, status: 'ready' }),
      () => state.userId === userId && set({ enabled: false, status: 'error' })
    );
  }, [available, userId]);

  const setEnabled = useCallback(
    async (next) => {
      if (!userId) return { ok: false };
      if (!next) set({ userId, enabled: false, status: 'ready' });
      try {
        await saveHistoryEnabled(userId, next);
        if (next) set({ userId, enabled: true, status: 'ready' });
        return { ok: true };
      } catch {
        return { ok: false };
      }
    },
    [userId]
  );

  return {
    available,
    enabled: available && mine && s.enabled,
    loading: available && (!mine || s.status === 'loading' || s.status === 'idle'),
    setEnabled,
  };
}
