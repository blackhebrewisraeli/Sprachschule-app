import { describe, it, expect, beforeEach } from 'vitest';
import { applyTheme } from './applyTheme';
import { MODE_COLORS, DEFAULT_ACCENTS, tokenToCssVar, FLAG_STRIPES } from './themeTokens';

describe('applyTheme', () => {
  beforeEach(() => {
    document.documentElement.style.cssText = '';
    delete document.documentElement.dataset.theme;
  });

  it('writes light structural tokens onto :root by default', () => {
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.getPropertyValue(tokenToCssVar('ground'))).toBe(
      MODE_COLORS.light.ground
    );
    expect(document.documentElement.style.getPropertyValue(tokenToCssVar('fg'))).toBe(
      MODE_COLORS.light.fg
    );
    expect(document.documentElement.style.getPropertyValue('--c-accent')).toBe(
      DEFAULT_ACCENTS.light.accent
    );
  });

  it('writes Nocturne dark tokens onto :root', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.getPropertyValue(tokenToCssVar('ground'))).toBe(
      MODE_COLORS.dark.ground
    );
    expect(document.documentElement.style.getPropertyValue(tokenToCssVar('error'))).toBe(
      MODE_COLORS.dark.error
    );
  });

  it('writes both mode palettes', () => {
    for (const mode of ['light', 'dark']) {
      applyTheme(mode);
      expect(document.documentElement.dataset.theme).toBe(mode);
      expect(document.documentElement.style.getPropertyValue(tokenToCssVar('ground'))).toBe(
        MODE_COLORS[mode].ground
      );
    }
  });

  it('overlays pack accents when provided', () => {
    applyTheme('light', {
      accent: { fill: '#FFCE00', onFill: '#0D0D0F', fg: { light: '#8A6A00', dark: '#FFCE00' } },
      accentAlt: {
        fill: { light: '#C92A2A', dark: '#FF6B6B' },
        onFill: { light: '#FFFFFF', dark: '#0D0D0F' },
      },
    });
    expect(document.documentElement.style.getPropertyValue('--c-accent')).toBe('#FFCE00');
    expect(document.documentElement.style.getPropertyValue('--c-accent-fg')).toBe('#8A6A00');
    expect(document.documentElement.style.getPropertyValue('--c-accent-alt')).toBe('#C92A2A');
  });

  it('writes derived elevation and accent ramp steps', () => {
    applyTheme('light');
    const root = document.documentElement.style;
    expect(root.getPropertyValue('--c-surface-1')).toMatch(/^#/);
    expect(root.getPropertyValue('--c-surface-2')).toMatch(/^#/);
    expect(root.getPropertyValue('--c-surface-3')).toMatch(/^#/);
    expect(root.getPropertyValue('--c-accent-soft')).toMatch(/^#/);
    expect(root.getPropertyValue('--c-accent-deep')).toMatch(/^#/);
    expect(root.getPropertyValue('--c-success-soft')).toBe(MODE_COLORS.light['success-fill']);
    expect(root.getPropertyValue('--c-error-soft')).toBe(MODE_COLORS.light['error-fill']);
    // Legacy aliases still resolve
    expect(root.getPropertyValue('--c-surface')).toBe(MODE_COLORS.light.surface);
    expect(root.getPropertyValue('--c-surface-alt')).toBe(MODE_COLORS.light['surface-alt']);
  });

  it('writes the same flag stripe colours in every palette', () => {
    const keys = Object.keys(FLAG_STRIPES);
    applyTheme('light');
    const light = Object.fromEntries(
      keys.map((k) => [k, document.documentElement.style.getPropertyValue(tokenToCssVar(k))])
    );
    expect(light).toEqual(FLAG_STRIPES);

    applyTheme('dark');
    for (const k of keys) {
      expect(document.documentElement.style.getPropertyValue(tokenToCssVar(k)), `dark ${k}`).toBe(
        FLAG_STRIPES[k]
      );
    }
  });

  // TEXT.ipa reads --f-ipa. A pack with its own phonetic face sets it; one
  // without keeps IPA in its mono face rather than dropping to the browser
  // default, which is a proportional serif.
  it('sets the IPA face from the pack, falling back to its mono face', () => {
    const root = document.documentElement.style;
    applyTheme('light', { font: { mono: "'Mono A', monospace", ipa: "'Phon B', 'Mono A'" } });
    expect(root.getPropertyValue('--f-ipa')).toBe("'Phon B', 'Mono A'");
    applyTheme('light', { font: { mono: "'Mono A', monospace" } });
    expect(root.getPropertyValue('--f-ipa')).toBe("'Mono A', monospace");
    applyTheme('light');
    expect(root.getPropertyValue('--f-ipa')).toBe(root.getPropertyValue('--f-mono'));
  });
});
