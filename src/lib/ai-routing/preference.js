// Learner-facing model preference. Pure — no storage, no network, no React.
//
// Ids are catalog profiles (fast / balanced / capable) plus 'auto', not vendor
// pins. Chat and Settings render these; routeAiRequest honours them when the
// tier ceiling allows, otherwise it falls back to the automatic pick.

import { MODELS, TIERS, DEFAULT_TIER } from './catalog.js';
import { getAccessTier } from '../accessTier.js';

export const AUTO_MODEL = 'auto';

export const MODEL_PREFERENCES = Object.freeze([
  Object.freeze({ id: AUTO_MODEL, label: 'Auto', detail: 'Router' }),
  Object.freeze({ id: 'fast', label: 'Fast', detail: 'Haiku' }),
  Object.freeze({ id: 'balanced', label: 'Balanced', detail: 'Sonnet' }),
  Object.freeze({ id: 'capable', label: 'Capable', detail: 'Opus' }),
]);

const ALLOWED = new Set(MODEL_PREFERENCES.map((p) => p.id));

/**
 * Known preference id, or 'auto' when the value is missing / junk.
 *
 * @param {unknown} raw
 * @returns {'auto' | 'fast' | 'balanced' | 'capable'}
 */
export function sanitizePreferredModel(raw) {
  if (typeof raw === 'string' && ALLOWED.has(raw)) return raw;
  return AUTO_MODEL;
}

/**
 * Cost-cap tier for the current session. Signed-in is 'free'; 'pro' only when
 * the server says Premium (a hint — the AI lane re-decides on every call). Unknown / missing user → guest (fail cheap).
 *
 * @param {unknown} user
 * @returns {'guest' | 'free' | 'pro'}
 */
export function userTierOf(user) {
  if (!user || typeof user !== 'object' || Array.isArray(user)) return DEFAULT_TIER;
  if (typeof user.id !== 'string' || !user.id) return DEFAULT_TIER;
  if (getAccessTier() === 'premium') return 'pro';
  return 'free';
}

/**
 * Catalog row whose `profile` matches, or null.
 *
 * @param {string} profile
 * @returns {(typeof MODELS)[keyof typeof MODELS] | null}
 */
export function modelForProfile(profile) {
  if (typeof profile !== 'string' || !profile) return null;
  return Object.values(MODELS).find((m) => m.profile === profile) ?? null;
}

/**
 * Whether the saved pick is within the tier ceiling. 'auto' always fits.
 *
 * @param {unknown} preferredModel
 * @param {unknown} userTier
 * @returns {boolean}
 */
export function preferenceFitsTier(preferredModel, userTier) {
  const pref = sanitizePreferredModel(preferredModel);
  if (pref === AUTO_MODEL) return true;
  const model = modelForProfile(pref);
  if (!model) return false;
  const tier = TIERS[userTier] ?? TIERS[DEFAULT_TIER];
  return model.cost <= tier.maxCost;
}

/**
 * Picker row for a preference id.
 *
 * @param {unknown} id
 * @returns {(typeof MODEL_PREFERENCES)[number]}
 */
export function preferenceOption(id) {
  const pref = sanitizePreferredModel(id);
  return MODEL_PREFERENCES.find((p) => p.id === pref) ?? MODEL_PREFERENCES[0];
}
