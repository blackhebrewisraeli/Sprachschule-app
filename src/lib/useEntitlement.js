import { useCallback, useEffect, useRef, useState } from 'react';
import { getSupabase } from './auth.js';
import { setAccessTier } from './accessTier.js';

export const ENTITLEMENT_CACHE_KEY = 'deutsch-app-entitlement-v1';
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const UNKNOWN = { tier: null, source: null, expiresAt: null };
const GUEST = { tier: 'guest', source: null, expiresAt: null };

const isActive = (row) => row.expires_at == null || Date.parse(row.expires_at) > Date.now();

function readCache(userId) {
  try {
    const c = JSON.parse(localStorage.getItem(ENTITLEMENT_CACHE_KEY));
    if (c?.userId === userId && typeof c.at === 'number' && Date.now() - c.at < CACHE_MAX_AGE_MS) {
      return { tier: c.tier, source: c.source ?? null, expiresAt: c.expiresAt ?? null };
    }
  } catch {
    /* blocked or corrupt storage: treat as no cache */
  }
  return null;
}

function writeCache(userId, value) {
  try {
    localStorage.setItem(
      ENTITLEMENT_CACHE_KEY,
      JSON.stringify({ userId, ...value, at: Date.now() })
    );
  } catch {
    /* ignore */
  }
}

async function load(userId) {
  const supabase = await getSupabase();
  if (!supabase) return readCache(userId) ?? UNKNOWN;
  const { data, error } = await supabase
    .from('entitlements')
    .select('source, expires_at')
    .eq('user_id', userId);
  // A missing table or an outage is "unknown", never "premium" (fetchMyTokens).
  if (error || !Array.isArray(data)) return readCache(userId) ?? UNKNOWN;
  const active = data.filter(isActive);
  if (active.length === 0) return { tier: 'free', source: null, expiresAt: null };
  const row = active[0];
  return { tier: 'premium', source: row.source, expiresAt: row.expires_at ?? null };
}

/**
 * The learner's tier as the server records it (own `entitlements` rows, RLS).
 * Publishes it through accessTier.js so non-React code (the model picker's
 * ceiling) sees it. `tier` is null while unknown.
 */
export function useEntitlement({ userId }) {
  const [value, setValue] = useState(userId ? UNKNOWN : GUEST);
  // Latest-issued-wins, so a slow earlier read cannot overwrite a newer one.
  const issued = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++issued.current;
    if (!userId) {
      setAccessTier('guest');
      setValue(GUEST);
      return;
    }
    const next = await load(userId);
    if (seq !== issued.current) return;
    // Published before setState so a render triggered by it already sees it.
    setAccessTier(next.tier);
    setValue(next);
    if (next.tier) writeCache(userId, next);
  }, [userId]);

  useEffect(() => {
    void refresh();
    return () => {
      issued.current += 1;
    };
  }, [refresh]);

  return { ...value, refresh };
}
