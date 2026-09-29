import { useEffect, useRef, useState } from 'react';
import { TOKEN_REWARDS, awardTokens, fetchMyTokens, questRewardKey } from './economy.js';

/**
 * The signed-in learner's token balance, plus the daily-quest payout.
 *
 * Each quest that is done pays once (server-idempotent on the day+quest key).
 * A quest that FLIPS to done while the app is open shows +10 immediately; the
 * server's returned balance then replaces the optimistic one. A quest that was
 * already done when the balance first loaded is still claimed — it may have
 * been finished offline — but without the optimistic bump, since it has most
 * likely been paid already and a +10 that snaps back would be a lie.
 *
 * `tokens` is null while unknown: signed out, no backend, or the column not
 * yet migrated. No award is attempted while it is null.
 */
export function useTokenBalance({ userId, quests, todayKey }) {
  const [tokens, setTokens] = useState(null);
  const claimed = useRef(new Set());
  const baseline = useRef(null); // quest keys already done when the balance loaded
  // Latest-issued-wins: awards can resolve out of order, and only the newest
  // response reflects every award before it.
  const issued = useRef(0);

  useEffect(() => {
    let live = true;
    setTokens(null);
    claimed.current = new Set();
    baseline.current = null;
    void fetchMyTokens(userId).then((t) => {
      if (live) setTokens(t);
    });
    return () => {
      live = false;
    };
  }, [userId]);

  const doneKeys = (quests ?? []).filter((q) => q?.done).map((q) => questRewardKey(todayKey, q.id));
  const doneSignature = doneKeys.join('|');

  useEffect(() => {
    if (!userId || tokens === null) return;
    if (baseline.current === null) baseline.current = new Set(doneKeys);

    for (const key of doneKeys) {
      if (claimed.current.has(key)) continue;
      claimed.current.add(key);
      const optimistic = !baseline.current.has(key);
      if (optimistic) setTokens((t) => (t ?? 0) + TOKEN_REWARDS.daily_quest);

      const seq = ++issued.current;
      awardTokens('daily_quest', key)
        .then((balance) => {
          if (seq === issued.current && typeof balance === 'number') setTokens(balance);
        })
        .catch(() => {
          // Unknown outcome: re-read the truth rather than guess an undo.
          void fetchMyTokens(userId).then((t) => {
            if (t !== null) setTokens(t);
          });
        });
    }
    // doneSignature stands in for doneKeys: same content, stable identity.
  }, [userId, tokens === null, doneSignature]); // eslint-disable-line react-hooks/exhaustive-deps

  return tokens;
}
