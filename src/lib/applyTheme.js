import { DEFAULT_ACCENTS, tokenToCssVar, resolvePalette } from './themeTokens';
import { deriveThemeRamps } from './ramp';

/**
 * Resolve pack accent fields that may be a plain string or `{ light, dark }`.
 * @param {string | { light: string, dark: string }} value
 * @param {'light' | 'dark'} mode
 */
function resolveModeValue(value, mode) {
  if (value == null) return undefined;
  if (typeof value === 'string') return value;
  return value[mode];
}

/**
 * Write the resolved token set onto `document.documentElement` as CSS
 * custom properties. Safe to call before React mounts (and in tests).
 *
 * @param {'light' | 'dark'} mode
 * @param {object} [packTheme] — `activePack.theme` when available
 */
export function applyTheme(mode = 'light', packTheme) {
  if (typeof document === 'undefined') return;

  const resolved = mode === 'dark' ? 'dark' : 'light';
  const root = document.documentElement;
  root.dataset.theme = resolved;

  const structural = resolvePalette(resolved);
  const defaults = DEFAULT_ACCENTS[resolved];
  const accent = packTheme?.accent;
  const accentAlt = packTheme?.accentAlt;

  const accentFill = resolveModeValue(accent?.fill, resolved) ?? defaults.accent;
  const accentOn = resolveModeValue(accent?.onFill, resolved) ?? defaults.accentOn;
  const accentAltFill = resolveModeValue(accentAlt?.fill, resolved) ?? defaults.accentAlt;
  const accentAltOn = resolveModeValue(accentAlt?.onFill, resolved) ?? defaults.accentAltOn;

  // Derive elevation + accent/semantic ramps from seeds *before* they become
  // var(--…) strings — once CSS variables, JS can no longer compute with them.
  const tokens = deriveThemeRamps(structural, resolved, {
    accent: accentFill,
    accentOn,
    accentAlt: accentAltFill,
    accentAltOn,
  });

  for (const [key, value] of Object.entries(tokens)) {
    root.style.setProperty(tokenToCssVar(key), value);
  }

  root.style.setProperty('--c-accent-on', accentOn);
  root.style.setProperty(
    '--c-accent-fg',
    resolveModeValue(accent?.fg, resolved) ?? defaults.accentFg
  );
  root.style.setProperty('--c-accent-alt-on', accentAltOn);

  // Legacy lip shades used by chat/alphabet gold press shadows
  root.style.setProperty('--c-gold-lip', defaults.goldLip);
  root.style.setProperty('--c-gold-lip-soft', defaults.goldLipSoft);
  root.style.setProperty('--c-gold-bright', defaults.goldBright);

  // Fonts from pack; fall back to current house faces
  const font = packTheme?.font;
  root.style.setProperty(
    '--f-display',
    font?.display ?? "'Fraunces', 'Playfair Display', Georgia, serif"
  );
  root.style.setProperty('--f-body', font?.body ?? "'Fraunces', Georgia, serif");
  root.style.setProperty('--f-mono', font?.mono ?? "'JetBrains Mono', 'Courier New', monospace");
  // A pack without its own phonetic face keeps setting IPA in the mono one.
  root.style.setProperty(
    '--f-ipa',
    font?.ipa ?? font?.mono ?? "'JetBrains Mono', 'Courier New', monospace"
  );
}
