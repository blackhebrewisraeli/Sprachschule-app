import {
  COLORS,
  FONTS,
  FONT_SIZE,
  FONT_WEIGHT,
  LETTER_SPACING,
  SPACE,
  BORDER,
  RADIUS,
  TEXT,
} from '../lib/theme';
import Surface from './ui/Surface';
import Heading from './ui/Heading';
import { Body, Meta } from './ui/Text';
import { Row } from './ui/Layout';

// These three are COMPOSITES, not primitives: each is a specific arrangement
// this app uses in several places, built out of the primitives in ui/. They
// keep their existing props exactly — nine consumers import them and none
// needed a change.

// ── StatBlock ─────────────────────────────────────────────────
// Header stat pill: streak counter, learned word count.
export function StatBlock({ label, value, icon, accent, pulsing }) {
  return (
    // Nested rather than <Surface as={Row}>: the pass-through form works, but it
    // routes one style object through three merge layers, and a reader has to
    // trace two components to see where padding lands. One div buys clarity.
    <Surface
      elevation={1}
      radius="lg"
      padding={0}
      style={{ padding: '6px 14px 6px 6px', display: 'inline-block' }}
    >
      {/* wrap={false}: this is a fixed-size pill in the header — wrapping would
          break the pill, and it has no variable-length text to overflow. */}
      <Row wrap={false} style={{ gap: SPACE[2] + 2 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: RADIUS.pill,
            background: accent ? COLORS.gold : COLORS.ink,
            // Gold is a fill — ink flips per mode and fails on gold in dark (1.25:1).
            color: accent ? COLORS.accentOn : COLORS.card,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            animation: pulsing ? 'pulse-gold 2s infinite' : 'none',
          }}
        >
          {icon}
        </div>
        <div style={{ minWidth: 0 }}>
          {/* Callers pass an empty label to drop the caption where width is tight
              (the mobile header): the icon and value still carry the signal. */}
          {label && (
            <Meta as="div" style={{ letterSpacing: LETTER_SPACING.widest }}>
              {label}
            </Meta>
          )}
          <div
            style={{
              fontFamily: FONTS.display,
              fontSize: 22,
              fontWeight: FONT_WEIGHT.bold,
              lineHeight: 1,
              color: COLORS.ink,
            }}
          >
            {value}
          </div>
        </div>
      </Row>
    </Surface>
  );
}

// ── SectionLabel ──────────────────────────────────────────────
// Small labelled section header: [A] SCENARIO, [B] CORRECTION, etc.
export function SectionLabel({ num, text }) {
  return (
    // Row wraps by default, which this used not to do. At 320px a long section
    // label now folds onto a second line instead of pushing the page sideways —
    // the reason wrapping is the primitive's default.
    <Row align="baseline" style={{ gap: SPACE[2] + 2, marginBottom: SPACE[3] }}>
      <span style={{ ...TEXT.tag }}>{num}</span>
      <Meta style={{ letterSpacing: LETTER_SPACING.ultra }}>{text}</Meta>
    </Row>
  );
}

// ── Hero ──────────────────────────────────────────────────────
// Full-width section title block: kicker + big heading + subtitle.
// Clips to 1×1 while staying in the accessibility tree (heading, kicker and
// description are still read out).
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

// `srOnly` is the phone layout of every practice tab: the masthead costs ~200px
// above the first control, so it is clipped there and the task starts on-screen.
export function Hero({ kicker, title, sub, align = 'start', srOnly = false }) {
  const centered = align === 'center';
  return (
    <div
      style={{
        ...(srOnly ? VISUALLY_HIDDEN : null),
        borderBottom: BORDER.standard,
        paddingBottom: SPACE[6],
        textAlign: centered ? 'center' : undefined,
        display: centered ? 'flex' : undefined,
        flexDirection: centered ? 'column' : undefined,
        alignItems: centered ? 'center' : undefined,
      }}
    >
      {/* TEXT.kicker is exactly TEXT.label with a wider tracking and the error
          ink, so it is expressed as a Meta with those two overrides rather than
          as a second near-identical recipe. */}
      <Meta
        as="div"
        style={{
          letterSpacing: LETTER_SPACING.hero,
          color: COLORS.red,
          marginBottom: SPACE[3],
        }}
      >
        {kicker}
      </Meta>
      {/* The 72px / 13vw curve now lives in Heading size="display", computed in
          JS. As `min(72px, 13vw)` it rendered correctly but had no assertable
          computed form — jsdom drops it, so a test could only pin the authored
          string, never the resulting size. */}
      <Heading level={1} size="display" style={{ lineHeight: 0.95 }}>
        {title}
      </Heading>
      {sub && (
        <Body
          tone="soft"
          style={{
            fontSize: FONT_SIZE.md + 2,
            fontStyle: 'italic',
            maxWidth: 600,
            marginTop: SPACE[4],
            ...(centered ? { marginLeft: 'auto', marginRight: 'auto' } : {}),
          }}
        >
          {sub}
        </Body>
      )}
    </div>
  );
}
