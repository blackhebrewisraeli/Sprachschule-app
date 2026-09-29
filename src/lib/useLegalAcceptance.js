// src/lib/useLegalAcceptance.js
import { useState, useEffect, useCallback } from 'react';
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
 *             sync, no gate — and it retries on `online`.
 */
function initial(userId) {
  if (!userId) return { status: 'none', hasPrior: false };
  return hintCovers(userId)
    ? { status: 'accepted', hasPrior: true }
    : { status: 'checking', hasPrior: false };
}

export function useLegalAcceptance(user) {
  const userId = user?.id ?? null;
  const [state, setState] = useState(() => initial(userId));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setState(initial(userId));
    if (!userId || hintCovers(userId)) return undefined;
    let active = true;
    const settle = (next) => active && setState(next);
    (async () => {
      try {
        const { current, hasPrior } = await fetchAcceptances(userId);
        if (current) {
          writeAcceptedHint(userId);
          return settle({ status: 'accepted', hasPrior: true });
        }
        if (hasValidIntent()) {
          await acceptCurrentTerms();
          clearIntent();
          writeAcceptedHint(userId);
          return settle({ status: 'accepted', hasPrior: true });
        }
        clearIntent();
        return settle({ status: 'required', hasPrior });
      } catch {
        return settle({ status: 'unknown', hasPrior: false });
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
      clearIntent();
      writeAcceptedHint(userId);
      setState({ status: 'accepted', hasPrior: true });
      return { ok: true };
    } catch (error) {
      return { ok: false, error };
    }
  }, [userId]);

  return { ...state, accept };
}
