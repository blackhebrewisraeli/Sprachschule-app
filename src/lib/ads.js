import { isNativeApp } from './nativeApp.js';

// Ad surfaces are laid out but dark (monetization spec §8). Nothing here loads
// an ad network: Track C adds the plugin behind this same switch, after Vercel
// Pro (Hobby forbids ads) and updated privacy and store answers.
export const ADS_ENABLED = import.meta.env.VITE_ADS_ENABLED === 'true';

/**
 * Spec §8.1: the Free tier in the native app only — never a guest, never
 * Premium, never the web. A dev server skips the tier and platform checks so
 * the placements can be reviewed with `VITE_ADS_ENABLED=true npm run dev`.
 */
export function adsAllowed({
  tier,
  enabled = ADS_ENABLED,
  native = isNativeApp(),
  dev = import.meta.env.DEV,
} = {}) {
  if (!enabled) return false;
  if (dev) return true;
  return native && tier === 'free';
}

// ponytail: no ad SDK yet, so there is never an ad to show. Track C replaces
// this with the AdMob rewarded flow (spec §8.5), then refreshes the quota.
export async function showRewardedAd() {
  return { rewarded: false, reason: 'unavailable' };
}
