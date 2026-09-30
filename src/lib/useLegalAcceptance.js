// src/lib/useLegalAcceptance.js
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  LEGAL_ACCEPTED_KEY,
  hintCovers,
  writeAcceptedHint,
  hasValidIntent,
  clearIntent,
  fetchAcceptances,
  acceptCurrentTerms,
} from './legalAcceptance.js';

/**
 * Where the signed-in account stands on the current Terms + Privacy versions.
 *
 *   none      no account — guests never touch any of this
 *   checking  asking the server
 *   accepted  on record (or this device already saw the server confirm it)
 *   required  no record for the current versions — App shows AcceptanceGate
 *   unknown   could not ask (offline, or the table is not deployed). Fails
 *             safe: App treats it like 'checking' — local practice only, no
 *             sync, no gate — and it retries on `online`. A retry never resets a
 *             settled status: `required` stays `required` while it refetches,
 *             and stays if the retry itself fails.
 *
 * The state is keyed to the user it was computed for; a different current user
 * always reads as `initial(userId)`, never the previous account's status.
 */
function initial(userId) {
  if (!userId) return { status: 'none', hasPrior: false };
  return hintCovers(userId)
    ? { status: 'accepted', hasPrior: true }
    : { status: 'checking', hasPrior: false };
}

export function useLegalAcceptance(user) {
  const userId = user?.id ?? null;
  // The state names the user it belongs to, so a switch can never hand the
  // previous account's status to the next one, not even for a single render.
  const [state, setState] = useState(() => ({ userId, ...initial(userId) }));
  const [attempt, setAttempt] = useState(0);
  const currentUserId = useRef(userId);
  currentUserId.current = userId;

  useEffect(() => {
    if (!userId || hintCovers(userId)) {
      // A session that needs no RPC still consumes the ticked-box intent, so it
      // can never be credited to a different account signing in later.
      if (userId) clearIntent();
      setState({ userId, ...initial(userId) });
      return undefined;
    }
    // Only a user change resets; a retry keeps the settled status while it refetches.
    setState((s) => (s.userId === userId ? s : { userId, ...initial(userId) }));
    // Still this effect run AND still the hook's user: a late answer is dropped.
    let active = true;
    const live = () => active && currentUserId.current === userId;
    const settle = (next) => setState({ userId, ...next });
    void (async () => {
      try {
        const { current, hasPrior } = await fetchAcceptances(userId);
        if (!live()) return;
        if (current) {
          clearIntent();
          writeAcceptedHint(userId);
          return settle({ status: 'accepted', hasPrior: true });
        }
        if (hasValidIntent()) {
          await acceptCurrentTerms();
          // The RPC ran as this session, so it consumed the tick even if the
          // hook has since moved on to another account; nothing else is ours to do then.
          clearIntent();
          if (!live()) return;
          writeAcceptedHint(userId);
          return settle({ status: 'accepted', hasPrior: true });
        }
        clearIntent();
        return settle({ status: 'required', hasPrior });
      } catch {
        if (!live()) return;
        // A failed retry keeps what we already knew; only a first attempt is 'unknown'.
        return setState((s) =>
          s.userId === userId && (s.status === 'required' || s.status === 'accepted')
            ? s
            : { userId, status: 'unknown', hasPrior: false }
        );
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, attempt]);

  // Offline → retry when the network is back. Another tab accepted → re-check.
  useEffect(() => {
    if (!userId) return undefined;
    const retry = () => setAttempt((n) => n + 1);
    const onStorage = (e) => e.key === LEGAL_ACCEPTED_KEY && retry();
    window.addEventListener('online', retry);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('online', retry);
      window.removeEventListener('storage', onStorage);
    };
  }, [userId]);

  const accept = useCallback(async () => {
    try {
      await acceptCurrentTerms();
    } catch (error) {
      return { ok: false, error };
    }
    if (currentUserId.current !== userId) {
      return { ok: false, error: new Error('The signed-in account changed.') };
    }
    clearIntent();
    writeAcceptedHint(userId);
    setState({ userId, status: 'accepted', hasPrior: true });
    return { ok: true };
  }, [userId]);

  const view = state.userId === userId ? state : { userId, ...initial(userId) };
  return { status: view.status, hasPrior: view.hasPrior, accept };
}
