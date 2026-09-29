import { activePack } from '../packs';
import { AUTO_DECKS } from '../packs/de/autoDecks';
import { isDeckIdAllowed, isModeAllowed } from '../lib/levelGate';

/**
 * Promote the two most urgent open missions into large quick-action cards,
 * padding with pack-authored fallbacks when fewer than two are open.
 *
 * Copy is resolved here, not in lib/missions.js: the engine returns ids and
 * counts, and a German sentence in src/lib would be exactly the regression
 * the pack extraction was built to prevent.
 *
 * When `classifiedLevel` is passed, missions and fallbacks that name a CEFR
 * mode / level above that code, or a CEFR-tagged deck the learner may not
 * open, are skipped. Tab-only fallbacks (Continue Quiz → Translate) inherit
 * the classified mode at the destination and stay.
 *
 * `promotedCount` is how many cards came from open missions rather than from
 * fallbacks. Home needs it to tell "nothing is open" apart from "everything
 * open is already in Recommended" — both leave `remaining` empty.
 *
 * @param {Array<{id: string, tab: string, count?: number, level?: string, mode?: string, deckId?: string}>} missions
 * @param {number} [cap]
 * @param {{ classifiedLevel?: string }} [opts]
 * @returns {{ cards: Array<{id: string, icon: string, text: string, tab: string, mission: object}>, remaining: object[], promotedCount: number }}
 */
export function resolveRecommended(missions = [], cap = 2, { classifiedLevel } = {}) {
  const copy = activePack.content.missions ?? {};
  const chrome = activePack.content.homeChrome ?? {};
  const fallbacks = Array.isArray(chrome.recommendedFallbacks) ? chrome.recommendedFallbacks : [];

  const allowed = (item) => {
    if (!classifiedLevel) return true;
    const band = item?.level ?? item?.mode;
    if (band && !isModeAllowed(band, classifiedLevel)) return false;
    if (item?.deckId && !isDeckIdAllowed(item.deckId, classifiedLevel, AUTO_DECKS)) return false;
    return true;
  };

  const fromMissions = missions.filter((m) => copy[m?.id] && allowed(m)).slice(0, cap);
  const promoted = new Set(fromMissions.map((m) => m.id));
  const cards = fromMissions.map((m) => ({
    id: m.id,
    icon: copy[m.id].icon,
    text: copy[m.id].text(m),
    tab: m.tab,
    mission: m,
  }));

  for (const fallback of fallbacks) {
    if (cards.length >= cap) break;
    if (!fallback?.id || promoted.has(fallback.id)) continue;
    if (!allowed(fallback)) continue;
    cards.push({
      id: fallback.id,
      icon: fallback.icon,
      text: fallback.text,
      tab: fallback.tab,
      mission: { id: fallback.id, tab: fallback.tab },
    });
  }

  return {
    cards,
    remaining: missions.filter((m) => !promoted.has(m.id) && allowed(m)),
    promotedCount: fromMissions.length,
  };
}
