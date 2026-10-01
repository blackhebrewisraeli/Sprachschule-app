// Access policy — the single home of the numbers that bound AI spend.
// Pure and I/O-free, shared by api/ (quota enforcement) and the client (UI
// copy). Spec: docs/superpowers/specs/2026-10-01-monetization-access-design.md §6.
// The italic "starting values" in spec §6.1 are replaced HERE, from the
// shadow-week measurements, and nowhere else.
import { MODELS, TIERS } from './ai-routing/catalog.js';

export const ACCESS_TIERS = Object.freeze(['guest', 'free', 'premium']);
export const METERS = Object.freeze(['chat', 'grade', 'deck']);

export const DAILY_LIMITS = Object.freeze({
  chat: Object.freeze({ guest: 10, free: 20, premium: 150 }),
  grade: Object.freeze({ guest: 40, free: 150, premium: 300 }),
  deck: Object.freeze({ guest: 1, free: 3, premium: 15 }),
});

// Tier-wide daily ceilings. Premium has none: it is paid and identified.
export const DAILY_POOLS = Object.freeze({
  chat: Object.freeze({ guest: 2000, free: 20000 }),
  grade: Object.freeze({ guest: 5000, free: 40000 }),
  deck: Object.freeze({ guest: 200, free: 1000 }),
});

// Chat units per turn by the catalog profile — tracks price ratios (spec §4.9).
export const MODEL_WEIGHT_BY_PROFILE = Object.freeze({ fast: 1, balanced: 2, capable: 4 });
const MAX_WEIGHT = Math.max(...Object.values(MODEL_WEIGHT_BY_PROFILE));

export const REWARDED_AD = Object.freeze({ meter: 'chat', units: 5, dailyCap: 2 });

// The product says Premium; the router's ceiling key stays 'pro' (spec §5).
const ROUTER_TIER = Object.freeze({ guest: 'guest', free: 'free', premium: 'pro' });

export function routerTierFor(accessTier) {
  return Object.hasOwn(ROUTER_TIER, accessTier) ? ROUTER_TIER[accessTier] : 'guest';
}

const byId = (id) => Object.values(MODELS).find((m) => m.id === id) ?? null;

export function unitsFor(meter, modelId) {
  if (meter !== 'chat') return 1;
  const model = byId(modelId);
  return model ? (MODEL_WEIGHT_BY_PROFILE[model.profile] ?? MAX_WEIGHT) : MAX_WEIGHT;
}

// Keeps an in-ceiling pick, otherwise the most capable model under the ceiling.
export function clampModel(modelId, accessTier) {
  const ceiling = TIERS[routerTierFor(accessTier)].maxCost;
  const model = byId(modelId);
  if (model && model.cost <= ceiling) return modelId;
  const eligible = Object.values(MODELS)
    .filter((m) => m.cost <= ceiling)
    .sort((a, b) => b.capability - a.capability);
  return eligible[0].id;
}

export function nextUtcReset(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next;
}
