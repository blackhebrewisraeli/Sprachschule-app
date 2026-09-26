// ═══════════════════════════════════════════════════════════════
//  DESIGN SYSTEM — Deutsch App
//
//  Colour values are CSS custom properties written by applyTheme().
//  The export shape is stable — components keep using COLORS.ink etc.
// ═══════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────
//  1. PRIMITIVES
// ─────────────────────────────────────────────────────────────

// ── Colours (var(--…) — resolved on :root by applyTheme) ─────
export const COLORS = {
  // Backgrounds — elevation ramp: ground → surface1 → surface2 → surface3
  paper: 'var(--c-ground)',
  paperDeep: 'var(--c-surface-alt)', // alias of surface-1 in light, surface-2 in dark
  card: 'var(--c-surface)', // alias of surface-2 in light, surface-1 in dark
  surface: 'var(--c-surface)', // same var as card — the name the token model uses
  surfaceElevated: 'var(--c-surface-3)',
  surface1: 'var(--c-surface-1)',
  surface2: 'var(--c-surface-2)',
  surface3: 'var(--c-surface-3)',
  border: 'var(--c-border)',
  borderStrong: 'var(--c-border-strong)',

  // German-flag accent tiers. FILLS only — each pairs with its own `On` ink,
  // and the ink is invisible anywhere but on its own tier.
  //   accentBlack — identity chrome that must not invert with the theme
  //   accentRed   — "the app is asking you for something", NOT error
  // `COLORS.red` stays `--c-error` and now means only *wrong*.
  // See ACCENT_TIERS_* in themeTokens.js for why there is no gold tier.
  accentBlack: 'var(--c-accent-black)',
  accentBlackOn: 'var(--c-accent-black-on)',
  accentBlackOnMuted: 'var(--c-accent-black-on-muted)',
  accentRed: 'var(--c-accent-red)',
  accentRedOn: 'var(--c-accent-red-on)',

  // The informational plane — explanatory panels that are NOT pressable.
  // A fill and its paired ink, like the accent tiers: `infoOn` is near-white in
  // both modes, so it is legible on `info` and nowhere else in light mode.
  // Reach for this only when a surface explains rather than acts; a second
  // consumer that is actually a button would undo the distinction it exists to
  // draw. See INFO_PLANE_* in themeTokens.js.
  info: 'var(--c-info)',
  infoOn: 'var(--c-info-on)',

  // Mode-independent German-flag stripes (entry splash). Same hex in every
  // palette — see FLAG_STRIPES in themeTokens.js.
  flagBlack: 'var(--c-flag-black)',
  flagRed: 'var(--c-flag-red)',
  flagGold: 'var(--c-flag-gold)',
  flagOnBlack: 'var(--c-flag-on-black)',
  flagOnRed: 'var(--c-flag-on-red)',
  flagOnGold: 'var(--c-flag-on-gold)',

  // Text
  ink: 'var(--c-fg)',
  inkSoft: 'var(--c-fg-subtle)',
  mute: 'var(--c-fg-muted)',

  // Accents (pack seed → soft / fill / deep via applyTheme; structural aliases kept)
  red: 'var(--c-error)',
  redSoft: 'var(--c-error-soft)',
  rust: 'var(--c-error-deep)',
  gold: 'var(--c-accent)',
  goldSoft: 'var(--c-accent-soft)',
  goldDeep: 'var(--c-accent-deep)',
  accentAlt: 'var(--c-accent-alt)',
  accentAltSoft: 'var(--c-accent-alt-soft)',
  accentAltDeep: 'var(--c-accent-alt-deep)',

  // Success / go — soft / base / deep (success-fill kept as soft alias)
  green: 'var(--c-success)',
  greenDeep: 'var(--c-success-deep)',
  greenSoft: 'var(--c-success-soft)',
  lip: 'var(--c-lip)',

  // Alpha / companion tokens (hex-suffix concat is invalid with var(--…))
  inkA10: 'var(--c-fg-a10)',
  inkA12: 'var(--c-fg-a12)',
  inkA20: 'var(--c-fg-a20)',
  inkA30: 'var(--c-fg-a30)',
  inkAa: 'var(--c-fg-aa)',
  inkSoftA08: 'var(--c-fg-subtle-a08)',
  paperA50: 'var(--c-ground-a50)',
  paperA60: 'var(--c-ground-a60)',
  paperA80: 'var(--c-ground-a80)',
  redA80: 'var(--c-error-a80)',
  redA00: 'var(--c-error-a00)',
  heat1: 'var(--c-heat-1)',
  heat2: 'var(--c-heat-2)',
  track: 'var(--c-track)',
  press: 'var(--c-press)',
  scrim: 'var(--c-scrim)',
  muteDeep: 'var(--c-mute-deep)',
  goldLip: 'var(--c-gold-lip)',
  goldLipSoft: 'var(--c-gold-lip-soft)',
  goldBright: 'var(--c-gold-bright)',
  accentFg: 'var(--c-accent-fg)',
  accentOn: 'var(--c-accent-on)',
  accentAltOn: 'var(--c-accent-alt-on)',
};

// ── Typography ───────────────────────────────────────────────
export const FONTS = {
  display: 'var(--f-display)',
  mono: 'var(--f-mono)',
  body: 'var(--f-body)',
};

// Backward-compat aliases — existing components import these directly
export const FONT_DISPLAY = FONTS.display;
export const FONT_MONO = FONTS.mono;
export const FONT_BODY = FONTS.body;

export const FONT_SIZE = {
  label: 9,
  tag: 10,
  ipa: 11,
  sm: 12,
  base: 13,
  md: 15,
  lg: 16,
  xl: 18,
  '2xl': 20,
  '3xl': 24,
  '4xl': 36,
  '5xl': 48,
  '6xl': 64,
  hero: 120,
};

export const FONT_WEIGHT = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  black: 900,
};

/**
 * Line height, as a ratio.
 *
 * Thirty components set this inline today, across TWELVE distinct values
 * (1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35, 1.4, 1.5, 2, and 0) — which is
 * what an unnamed number does over time. This is the scale they should be
 * reaching for.
 *
 * Deliberately NOT applied to those thirty in this change: that is a
 * codebase-wide refactor with its own blast radius, and a line height is load
 * bearing for vertical rhythm on every screen it touches. Same reasoning, and
 * the same conclusion, as the note on the SectionLabel primitive. Migrate them
 * deliberately, not by grep.
 */
export const LINE_HEIGHT = {
  // Display type, where the line box is meant to hug the glyph.
  flat: 1,
  // Headlines and single-line glyphs.
  tight: 1.1,
  // Multi-line UI text that still needs to read as one block.
  snug: 1.25,
  // Small labels and captions.
  normal: 1.4,
  // Prose, and anything carrying stacked diacritics.
  relaxed: 1.5,
};

/**
 * Deliberate transparency, as opposed to a colour.
 *
 * Reach for a COLOUR token first: `COLORS.mute` is a real foreground with a
 * measured contrast ratio, and this app audits rendered contrast in CI.
 * Opacity is for when the thing being softened is DECORATIVE — an icon whose
 * meaning is already spelled out in text beside it — because fading real text
 * is how a contrast gate starts failing.
 */
export const OPACITY = {
  // Present but receded. Matches the value TEXT.ipa already ships.
  muted: 0.75,
  // Clearly inactive. Only for decoration.
  dim: 0.4,
};

export const LETTER_SPACING = {
  tight: '-0.04em',
  normal: '0em',
  wide: '0.05em',
  wider: '0.1em',
  widest: '0.15em',
  caps: '0.2em',
  ultra: '0.25em',
  hero: '0.3em',
};

// ── Spacing ──────────────────────────────────────────────────
export const SPACE = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  12: 48,
  16: 64,
};

// ── Borders ──────────────────────────────────────────────────
export const BORDER = {
  standard: `2px solid ${COLORS.ink}`,
  subtle: `1px solid ${COLORS.ink}`,
  dashed: `1px dashed ${COLORS.ink}`,
  ghost: `1px solid ${COLORS.paperA50}`,
  // Hairline from the structural border token — visible on dark surfaces
  // where SHADOW.card's light-mode rgba is nearly invisible.
  panel: `1px solid ${COLORS.border}`,
  // `panel`'s dashed sibling, for an outline that means "not filled in yet".
  // BORDER.dashed is a different idea: it is drawn in COLORS.ink, the full
  // strength used for a deliberate cut line, and reads as emphasis rather than
  // as absence.
  panelDashed: `1px dashed ${COLORS.border}`,
};

// ── Radius ───────────────────────────────────────────────────
export const RADIUS = {
  sm: 10,
  md: 14,
  lg: 16,
  xl: 22,
  pill: 999,
};

// ── Elevation ────────────────────────────────────────────────
export const SHADOW = {
  press: (lipColor) => `0 4px 0 ${lipColor}`,
  card: '0 6px 16px rgba(22,17,11,0.08)',
  cardChunk: '0 8px 0 rgba(22,17,11,0.10)',
  bar: '0 6px 18px rgba(22,17,11,0.08)',
  // Recessed wells — text inputs and the deck-picker search field. Four
  // components had this literal inline; it lives here so "inputs look sunken"
  // is one decision rather than four copies drifting apart.
  inset: 'inset 0 2px 5px rgba(22,17,11,0.06)',
};

// ── Motion ───────────────────────────────────────────────────
export const TRANSITION = {
  fast: 'all 0.15s ease',
  default: 'all 0.20s ease',
  slow: 'all 0.30s ease',
};

// ── Focus ────────────────────────────────────────────────────
// One ring for the whole app. `COLORS.ink` is var(--c-fg), the highest-contrast
// ink against every ground in both palettes, so the ring flips with the mode
// with no code. Two offsets, both earned: `offset` for controls with air around
// them, `inset` for elements flush to a container edge where an outset ring is
// clipped by the parent's overflow and overlaps its neighbour. A third offset
// needs a reason.
//
// `onDark` is the second RING, not a third offset. The default ink ring is
// literally the same colour as every ink-built plane (toasts, CARD.dark, the
// accentBlack masthead) — 1:1 in both modes. Controls on those planes opt in
// with `data-focus-on-dark` and paint the ring in the paired ink they already
// carry (`currentColor`: paper on an ink plane, accentBlackOn on the masthead).
// A hardcoded paper token would vanish on the charcoal bar in dark mode, where
// paper and accentBlack are both near-black.
//
// Consumed by injectGlobalStyles(), not by components: :focus-visible cannot be
// expressed inline, so the rule lives in the one global sheet and every element
// carrying a `data-ui` attribute picks it up.
export const FOCUS = {
  ring: `2px solid ${COLORS.ink}`,
  onDark: '2px solid currentColor',
  offset: 2,
  inset: -3,
};

// ── Z-index ──────────────────────────────────────────────────
export const Z = {
  base: 0,
  raised: 10,
  nav: 49,
  header: 50,
  modal: 100,
};

// ─────────────────────────────────────────────────────────────
//  2. COMPONENT TOKENS
// ─────────────────────────────────────────────────────────────

const btnBase = {
  border: 'none',
  borderRadius: RADIUS.md,
  fontFamily: FONTS.mono,
  fontWeight: FONT_WEIGHT.bold,
  fontSize: FONT_SIZE.sm,
  letterSpacing: LETTER_SPACING.widest,
  textTransform: 'uppercase',
  padding: `${SPACE[4]}px ${SPACE[6]}px`,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: SPACE[2],
  transition: 'transform .08s ease, box-shadow .08s ease',
};

export const BUTTON = {
  go: {
    ...btnBase,
    background: COLORS.green,
    color: COLORS.paper,
    boxShadow: SHADOW.press(COLORS.greenDeep),
  },
  primary: {
    ...btnBase,
    background: COLORS.ink,
    color: COLORS.paper,
    boxShadow: SHADOW.press(COLORS.press),
  },
  danger: {
    ...btnBase,
    background: COLORS.red,
    color: COLORS.paper,
    boxShadow: SHADOW.press(COLORS.rust),
  },
  tile: {
    ...btnBase,
    background: COLORS.card,
    color: COLORS.ink,
    boxShadow: SHADOW.press(COLORS.lip),
  },
  // No `flex: 1` here. It was a layout decision hiding inside a colour recipe,
  // and two of the seven consumers render this inside a `flexDirection: column`
  // container, where it stretched the button VERTICALLY. Callers that shared a
  // row now ask for `flex: 1` themselves, where it is visible.
  secondary: {
    ...btnBase,
    background: COLORS.card,
    color: COLORS.ink,
    boxShadow: SHADOW.press(COLORS.lip),
  },
  // Ink, NOT COLORS.paper. `paper` is the page ground: the old recipe painted
  // the label in the ground colour, so ghost text was invisible on any
  // ground-coloured surface and legible only on a dark plane. It had zero
  // consumers, so nothing ever rendered it and no test ever caught it. A caller
  // placing a ghost button on a dark plane (accentBlack, CARD.dark) passes the
  // paired ink via `style` — that is the accent-tier rule, not a variant.
  ghost: {
    ...btnBase,
    background: 'transparent',
    color: COLORS.ink,
    border: BORDER.panel,
    boxShadow: 'none',
    textTransform: 'none',
    fontSize: FONT_SIZE.tag,
    letterSpacing: LETTER_SPACING.wider,
    padding: `${SPACE[1]}px ${SPACE[3]}px`,
  },
  // Square, label-free, header-sized. Button sizes it 32x32 (md) / 28x28 (sm),
  // matching the measured fit of the existing header chips. `aria-label` is
  // mandatory on this variant; Button warns in development without one.
  //
  // 32, not 44: the header's functional cluster is a constant 287px and the
  // spare width at 320px is ~10px, so three 32px chips cannot become three 44px
  // chips. 32 clears WCAG 2.2 SC 2.5.8 (24px minimum) with margin.
  icon: {
    ...btnBase,
    background: COLORS.surface,
    color: COLORS.ink,
    border: BORDER.panel,
    borderRadius: RADIUS.pill,
    boxShadow: 'none',
    padding: 0,
    letterSpacing: LETTER_SPACING.normal,
    flexShrink: 0,
  },
};

export const btnSecondary = BUTTON.secondary;

// A native form field (select or text input) set in body text. 16px — FONT_SIZE
// lg, not md — because iOS zooms the page when a focused field is under 16px.
// Chat's fill-in-the-blank gap and Translate's mode picker each spelled this
// out; one recipe keeps the two fields identical and out of SonarCloud's
// duplication count.
export const FIELD = {
  fontFamily: FONTS.body,
  fontSize: FONT_SIZE.lg,
  color: COLORS.ink,
  background: COLORS.surface,
  border: BORDER.panel,
  borderRadius: RADIUS.md,
  padding: `${SPACE[1]}px ${SPACE[2]}px`,
};

export const CARD = {
  base: {
    background: COLORS.surface,
    border: BORDER.panel,
    borderRadius: RADIUS.xl,
    boxShadow: SHADOW.card,
    color: COLORS.ink,
  },
  dark: { background: COLORS.ink, borderRadius: RADIUS.lg, color: COLORS.paper },
  soft: {
    background: COLORS.paperDeep,
    border: BORDER.panel,
    borderRadius: RADIUS.lg,
    boxShadow: SHADOW.card,
    color: COLORS.ink,
  },
  alert: { background: COLORS.red, borderRadius: RADIUS.lg, color: COLORS.paper },
};

export const TEXT = {
  label: {
    fontFamily: FONTS.mono,
    fontSize: FONT_SIZE.tag,
    letterSpacing: LETTER_SPACING.caps,
    textTransform: 'uppercase',
    color: COLORS.mute,
  },
  tag: {
    fontFamily: FONTS.mono,
    fontSize: FONT_SIZE.ipa,
    letterSpacing: LETTER_SPACING.wider,
    background: COLORS.ink,
    color: COLORS.paper,
    padding: `2px ${SPACE[2]}px`,
  },
  // BUG: `lineHeight: 1` clips the glyph box of every Heading that uses this
  // recipe. Measured in a real browser on the rendered app: "Dein Profil"
  // (24px/24px) and "Recommended for you" (20px/20px) each report
  // scrollHeight - clientHeight = 2px, because Fraunces' ascent + descent
  // exceeds one em. It is 2px, not a layout break, and every heading in the
  // app shares it — so raising it shifts vertical rhythm on every screen at
  // once and belongs in its own change with its own audit, not smuggled into
  // an achievements PR. Deliberately left alone here; see the note in
  // MissionBoard/QuestBoard, which set their own lineHeight and do NOT clip.
  display: {
    fontFamily: FONTS.display,
    fontWeight: FONT_WEIGHT.black,
    letterSpacing: LETTER_SPACING.tight,
    lineHeight: 1,
  },
  // Phonetic transcriptions. One recipe, shared by the chat bubbles and the
  // vocab card, which drifted to 0.7 and 0.6 opacity at two sizes while this
  // token sat unused.
  //
  // The face stays MONO and is not negotiable: IPA borrows θ and χ from the
  // greek subset, and of the three vendored families only JetBrains Mono
  // carries it — the sans is deliberately latin-only. Setting a sans here
  // renders those glyphs as tofu, and fontCoverage.test.js is the guard.
  //
  // Everything else is tuned for legibility rather than restraint. 12px over
  // 11 because IPA is read glyph by glyph, not scanned; explicit 400 so it
  // cannot inherit the bold of a heading it sits under; `wide` tracking
  // because stacked diacritics (ˈ ̯ ̩ ) collide at default spacing; 1.5 line
  // height because those same marks clip against the line above. Opacity went
  // UP, not down — it is what recedes the line, and the app's rendered-DOM
  // contrast audit measures the result, so softening past this reads as a
  // failure rather than as taste.
  ipa: {
    fontFamily: FONTS.mono,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.normal,
    letterSpacing: LETTER_SPACING.wide,
    lineHeight: 1.5,
    opacity: 0.75,
  },
  // The label ON a form control — Handle, Email, the delete confirm box.
  //
  // Same mono-caps family as TEXT.label, one notch stronger, because it does a
  // different job: a section marker is scanned, a field label is READ to answer
  // "what goes in this box". Two files had each inlined their own version of
  // it at 10px, weight 400, with no tracking and no uppercase — the mono face
  // without any of the things that make mono legible as a label.
  fieldLabel: {
    display: 'block',
    fontFamily: FONTS.mono,
    fontSize: FONT_SIZE.ipa,
    fontWeight: FONT_WEIGHT.semibold,
    letterSpacing: LETTER_SPACING.wider,
    textTransform: 'uppercase',
    color: COLORS.mute,
  },
  // The tier between a section title and its body. Settings had no such tier:
  // a sub-heading inside a panel wore the SAME mono-caps recipe as the panel's
  // own title, so "Interessen" and "KI-Modell" read as siblings of "Lernen"
  // rather than as parts of it, and four of these in a column read as a wall.
  // Body face, one step up from prose, ink rather than mute — the weight and
  // the colour carry the hierarchy so the size does not have to.
  subhead: {
    fontFamily: FONTS.body,
    fontSize: FONT_SIZE.md,
    fontWeight: FONT_WEIGHT.semibold,
    color: COLORS.ink,
    lineHeight: 1.3,
  },
  translation: {
    fontFamily: FONTS.body,
    fontStyle: 'italic',
    fontSize: FONT_SIZE.base,
    opacity: 0.75,
  },
  kicker: {
    fontFamily: FONTS.mono,
    fontSize: FONT_SIZE.tag,
    letterSpacing: LETTER_SPACING.hero,
    color: COLORS.red,
    textTransform: 'uppercase',
  },
};
