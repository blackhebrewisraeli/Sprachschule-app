import { describe, it, expect } from 'vitest';
import {
  COLORS,
  FONTS,
  FONT_DISPLAY,
  FONT_MONO,
  FONT_BODY,
  FONT_SIZE,
  SPACE,
  BORDER,
  RADIUS,
  SHADOW,
  BUTTON,
  btnSecondary,
  CARD,
  TEXT,
  FOCUS,
} from './theme';

const HEX = /^#[0-9A-Fa-f]{3,8}$/;
const CSS_VAR = /^var\(--[a-z0-9-]+\)$/;

describe('theme tokens', () => {
  it('exports every colour as a CSS custom-property reference (no raw hex)', () => {
    for (const [key, value] of Object.entries(COLORS)) {
      expect(value, `COLORS.${key}`).toMatch(CSS_VAR);
      expect(value, `COLORS.${key}`).not.toMatch(HEX);
    }
  });

  it('exports fonts as CSS custom-property references', () => {
    expect(FONTS.display).toMatch(CSS_VAR);
    expect(FONTS.mono).toMatch(CSS_VAR);
    expect(FONTS.body).toMatch(CSS_VAR);
  });

  it('keeps backward-compat font aliases in sync with FONTS', () => {
    expect(FONT_DISPLAY).toBe(FONTS.display);
    expect(FONT_MONO).toBe(FONTS.mono);
    expect(FONT_BODY).toBe(FONTS.body);
  });

  it('SPACE scale is 4px multiples', () => {
    expect(SPACE[1]).toBe(4);
    expect(SPACE[4]).toBe(16);
    expect(SPACE[16]).toBe(64);
  });

  it('BORDER.standard references ink colour', () => {
    expect(BORDER.standard).toContain(COLORS.ink);
  });

  it('BORDER.ghost uses an alpha token rather than hex-suffix concat', () => {
    expect(BORDER.ghost).toBe(`1px solid ${COLORS.paperA50}`);
  });

  it('SHADOW.press builds a hard-offset shadow from a lip colour', () => {
    expect(SHADOW.press('#abcdef')).toBe('0 4px 0 #abcdef');
  });

  it('BUTTON variants share base typography and differ by background', () => {
    expect(BUTTON.go.background).toBe(COLORS.green);
    expect(BUTTON.primary.background).toBe(COLORS.ink);
    expect(BUTTON.danger.background).toBe(COLORS.red);
    expect(BUTTON.go.fontFamily).toBe(FONTS.mono);
    expect(BUTTON.primary.boxShadow).toBe(SHADOW.press(COLORS.press));
  });

  it('btnSecondary alias matches BUTTON.secondary', () => {
    expect(btnSecondary).toBe(BUTTON.secondary);
    // No `flex` on the recipe. It was a layout decision hiding inside a colour
    // token: two of the seven consumers render this inside a column, where
    // flex:1 stretched the button vertically. The two that share a row now pass
    // `flex: 1` themselves, where it is visible at the call site.
    expect(btnSecondary.flex).toBeUndefined();
  });

  it('CARD and TEXT presets include expected keys', () => {
    expect(CARD.base).toHaveProperty('background', COLORS.surface);
    expect(CARD.base.background).toBe(COLORS.card);
    expect(CARD.base.border).toBe(BORDER.panel);
    expect(CARD.soft.border).toBe(BORDER.panel);
    expect(CARD.dark.color).toBe(COLORS.paper);
    expect(TEXT.label.textTransform).toBe('uppercase');
    expect(TEXT.kicker.color).toBe(COLORS.red);
  });

  // Not a style preference. Only the pack's `ipa` face can draw IPA: the mono
  // face lacks 26 of the 38 phonetic characters (Android drew them as boxes)
  // and the sans is latin-only. fontCoverage.test.js checks that face's glyphs
  // against every `ipa` string; this guards the one recipe that consumes it.
  it('sets IPA in the phonetic face, not the mono, body or display one', () => {
    expect(TEXT.ipa.fontFamily).toBe(FONTS.ipa);
    for (const other of [FONTS.mono, FONTS.body, FONTS.display]) {
      expect(TEXT.ipa.fontFamily).not.toBe(other);
    }
  });

  // The rendered-DOM contrast audit measures the opacity too, so "softer"
  // here has a floor. Both call sites were below it before they shared this.
  it('keeps IPA legible rather than merely faint', () => {
    expect(TEXT.ipa.opacity).toBeGreaterThanOrEqual(0.75);
    expect(TEXT.ipa.fontSize).toBeGreaterThanOrEqual(FONT_SIZE.ipa);
  });

  it('exposes surface, elevated-surface, and border aliases from the token model', () => {
    expect(COLORS.surface).toBe('var(--c-surface)');
    expect(COLORS.surfaceElevated).toBe('var(--c-surface-3)');
    expect(COLORS.border).toBe('var(--c-border)');
    expect(COLORS.borderStrong).toBe('var(--c-border-strong)');
    expect(BORDER.panel).toBe(`1px solid ${COLORS.border}`);
  });

  it('exposes mode-independent flag-stripe tokens', () => {
    expect(COLORS.flagBlack).toBe('var(--c-flag-black)');
    expect(COLORS.flagRed).toBe('var(--c-flag-red)');
    expect(COLORS.flagGold).toBe('var(--c-flag-gold)');
    expect(COLORS.flagOnBlack).toBe('var(--c-flag-on-black)');
    expect(COLORS.flagOnRed).toBe('var(--c-flag-on-red)');
    expect(COLORS.flagOnGold).toBe('var(--c-flag-on-gold)');
  });

  it('RADIUS pill is fully round', () => {
    expect(RADIUS.pill).toBe(999);
  });

  // The default ring is the page ink, which is also the fill of every dark
  // plane. onDark must not restate that colour — currentColor is the paired
  // ink the control already carries (paper on toast/CARD.dark, accentBlackOn
  // on the masthead).
  it('exposes an on-dark focus ring that is not the page ink', () => {
    expect(FOCUS.ring).toBe(`2px solid ${COLORS.ink}`);
    expect(FOCUS.onDark).toBe('2px solid currentColor');
    expect(FOCUS.onDark).not.toContain(COLORS.ink);
  });

  it('FONT_SIZE includes hero size for alphabet overlay', () => {
    expect(FONT_SIZE.hero).toBe(120);
  });
});
