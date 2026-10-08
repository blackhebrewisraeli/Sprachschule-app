import { describe, it, expect, beforeEach } from 'vitest';
import { injectGlobalStyles } from './injectGlobalStyles';

const sheet = () => document.getElementById('deutsch-global-styles')?.textContent ?? '';

beforeEach(() => {
  document.getElementById('deutsch-global-styles')?.remove();
});

describe('injectGlobalStyles', () => {
  it('injects once and is idempotent', () => {
    injectGlobalStyles();
    injectGlobalStyles();
    expect(document.querySelectorAll('#deutsch-global-styles')).toHaveLength(1);
  });

  // The bug this guards was invisible to every automated check available here:
  // jsdom computes no layout, and Chromium mobile emulation reports the full
  // viewport. On a real iPhone, 100vh excludes the URL bar, so a 100vh entry
  // screen is taller than the visible area and its bottom sits behind Safari's
  // chrome — the splash's gold stripe was cut off. Asserting the declarations
  // is the strongest check this environment supports.
  it('sizes entry screens by the dynamic viewport', () => {
    injectGlobalStyles();
    expect(sheet()).toMatch(/\.entry-screen\s*\{[^}]*min-height:\s*100dvh/);
  });

  it('keeps a 100vh fallback ahead of the dvh declaration', () => {
    injectGlobalStyles();
    // Order is the fallback mechanism: an engine without dvh keeps the first
    // declaration, one with dvh overrides it. Reversing them silently breaks
    // the fallback while still containing both strings.
    const rule = sheet().match(/\.entry-screen\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule.indexOf('100vh')).toBeGreaterThanOrEqual(0);
    expect(rule.indexOf('100vh')).toBeLessThan(rule.indexOf('100dvh'));
  });

  it('pads entry screens by the safe-area insets, composed with the 24px gutter', () => {
    injectGlobalStyles();
    const rules = sheet().replace(/\/\*[\s\S]*?\*\//g, '');
    expect(rules).not.toContain('entry-screen-foot');
    const rule = rules.match(/\.entry-screen\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toContain('safe-area-inset-top');
    expect(rule).toContain('safe-area-inset-bottom');
    expect(rule).toContain('24px');
    expect(rules).toContain('100dvh');
  });

  // Before this rule existed the app had three hand-rolled `:focus-visible`
  // recipes (WelcomeGate, TrialWall, LeaderboardSection) with three different
  // spellings, and the other 78 raw <button> elements had no ring at all.
  // Keying off [data-ui] means a primitive opts in by existing.
  it('gives every [data-ui] element a focus-visible ring', () => {
    injectGlobalStyles();
    expect(sheet()).toMatch(/\[data-ui\]:focus-visible\s*\{[^}]*outline:/);
  });

  it('uses the theme ink for the ring, so it flips with the mode', () => {
    injectGlobalStyles();
    // var(--c-fg), not a literal — the ring must not be a light-mode colour.
    expect(sheet()).toMatch(/\[data-ui\]:focus-visible\s*\{[^}]*var\(--c-fg\)/);
  });

  it('offers an inset offset for full-bleed rows', () => {
    injectGlobalStyles();
    // League rows are flush to their container, so an outset ring is clipped
    // by the parent edge and overlaps the neighbouring row.
    expect(sheet()).toMatch(/\[data-focus-inset\]:focus-visible\s*\{[^}]*outline-offset:\s*-3px/);
  });

  // The default ring is var(--c-fg). Every ink-built plane (toast, CARD.dark,
  // the charcoal masthead) IS that colour, so the ring scores 1:1 against the
  // surface it sits on. data-focus-on-dark is the one opt-in; currentColor is
  // the paired ink the control already carries, not a second hardcoded recipe.
  it('offers a dark-plane ring that is not the page ink', () => {
    injectGlobalStyles();
    const rule = sheet().match(/\[data-focus-on-dark\]:focus-visible\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(rule).toMatch(/outline:\s*2px solid currentColor/);
    expect(rule).not.toContain('var(--c-fg)');
  });

  it('gates button hover behind a fine pointer', () => {
    injectGlobalStyles();
    // Without the gate a touch device latches the hover style on tap and keeps
    // it until the next tap elsewhere. This app is phone-first, so that is the
    // common case, not the edge case.
    expect(sheet()).toMatch(/@media \(hover: hover\) and \(pointer: fine\)/);
  });

  it('keeps the busy spinner visible under reduced motion, just still', () => {
    injectGlobalStyles();
    const reduced =
      sheet().match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? '';
    expect(reduced).toContain('.ui-spinner');
    // display:none would remove the only visible sign that anything is happening.
    expect(reduced).not.toMatch(/\.ui-spinner[^;]*display:\s*none/);
  });

  it('does not apply hover to a disabled or busy button', () => {
    injectGlobalStyles();
    const hoverRule = sheet().match(/\[data-ui="button"\][^{]*:hover/)?.[0] ?? '';
    expect(hoverRule).toContain(':not([disabled])');
    expect(hoverRule).toContain(':not([aria-busy="true"])');
  });
});

// ── Learning Passport polish ───────────────────────────────────────────────
// Three effects that jsdom cannot run and Chromium cannot be asked about in a
// unit test: no layout, no compositor, no clock. Asserting the DECLARATIONS is
// the strongest check available here, so these guard the properties whose loss
// would be silent — the reduced-motion opt-outs above all, since those only
// misbehave for users the developer is not.
describe('injectGlobalStyles — passport motion', () => {
  const reducedBlock = () =>
    sheet().match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? '';

  it('animates the scrim and the card separately', () => {
    injectGlobalStyles();
    // One animation on the wrapper would drag the backdrop up with the card.
    // Two classes is the whole design, so it is what gets asserted.
    expect(sheet()).toMatch(/\.modal-scrim-in\s*\{[^}]*animation:\s*scrim-in/);
    expect(sheet()).toMatch(/\.modal-card-in\s*\{[^}]*animation:\s*rise-in/);
  });

  // Tab and route changes swapped content in one frame. Each view that mounts
  // fresh now fades in, on opacity alone: a transform would shift the
  // tutorial's anchors mid-measure and make the view a containing block for
  // anything fixed inside it.
  it('fades a newly mounted view in on opacity alone', () => {
    injectGlobalStyles();
    expect(sheet()).toMatch(/\.view-in\s*\{[^}]*animation:\s*scrim-in/);
    const frames = sheet().match(/@keyframes scrim-in\s*\{([^\n]*)\}/)?.[1] ?? '';
    expect(frames).toContain('opacity');
    expect(frames).not.toContain('transform');
  });

  it('switches view fades off under reduced motion', () => {
    injectGlobalStyles();
    expect(reducedBlock()).toMatch(/\.view-in[^{]*\{[^}]*animation:\s*none/);
  });

  it('rises the card from below, fading, so the motion points at where it lands', () => {
    injectGlobalStyles();
    const frames = sheet().match(/@keyframes rise-in\s*\{([^@]*?)\n/)?.[1] ?? '';
    expect(frames).toMatch(/from\s*\{[^}]*opacity:\s*0/);
    // Positive Y = starts below its resting place = travels up.
    expect(frames).toMatch(/from\s*\{[^}]*translateY\(16px\)/);
    expect(frames).toMatch(/to\s*\{[^}]*translateY\(0\)/);
  });

  it('gates the badge lift behind a fine pointer, with the rest of the hover styles', () => {
    injectGlobalStyles();
    // A touch device latches :hover on tap and holds it until the next tap
    // elsewhere, which on a phone-first app is the common case. The rule has
    // to live INSIDE the gate, not merely somewhere in the same sheet.
    const gated =
      sheet().match(/@media \(hover: hover\) and \(pointer: fine\)\s*\{([\s\S]*?)\n\s*\}/)?.[1] ??
      '';
    expect(gated).toContain('.badge-chip:hover');
    expect(gated).toMatch(/\.badge-chip:hover\s*\{[^}]*scale\(1\.04\)/);
    expect(gated).toMatch(/\.badge-chip:hover\s*\{[^}]*box-shadow:/);
  });

  // Caught in a real browser, never in jsdom. The lift is only legible if the
  // shadow is: SHADOW.card is a fixed light-mode rgba that vanishes on a dark
  // surface, leaving dark mode with a chip that changes size and nothing else.
  // Deriving the shadow from var(--c-fg) is what makes one rule serve both.
  it('draws the badge shadow from the ink, so it survives dark mode', () => {
    injectGlobalStyles();
    const hover = sheet().match(/\.badge-chip:hover\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(hover).toMatch(/box-shadow:[^;]*var\(--c-fg-a\d+\)/);
    expect(hover).not.toMatch(/box-shadow:[^;]*rgba?\(/);
  });

  // The chip sets `border` as an inline shorthand, which outranks this sheet.
  // A hover declaration for a property the component also sets inline is dead
  // on arrival — it was, for border-color, in both themes and silently.
  it('changes only properties the chip does not set inline', () => {
    injectGlobalStyles();
    const hover = sheet().match(/\.badge-chip:hover\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(hover).not.toContain('border');
    expect(hover).not.toContain('background');
  });

  it('gives badge chips something to transition, or the hover would snap', () => {
    injectGlobalStyles();
    expect(sheet()).toMatch(/\.badge-chip\s*\{[^}]*transition:[^}]*transform/);
  });

  it('glows the self pill from the pack accent, so it follows the theme', () => {
    injectGlobalStyles();
    // Not a literal colour: the pill sits on a surface that inverts, and a
    // glow picked for light mode is a smudge in dark mode.
    expect(sheet()).toMatch(/@keyframes self-glow[\s\S]*?var\(--c-accent\)/);
    expect(sheet()).toMatch(/\.self-glow\s*\{[^}]*animation:\s*self-glow/);
  });

  it('breathes the glow slowly, and never lets it reach zero', () => {
    injectGlobalStyles();
    const rule = sheet().match(/\.self-glow\s*\{([^}]*)\}/)?.[1] ?? '';
    // Anything near 1s next to text you are meant to read is a tic.
    const seconds = Number(rule.match(/self-glow\s+([\d.]+)s/)?.[1]);
    expect(seconds).toBeGreaterThanOrEqual(2.5);
    const frames = sheet().match(/@keyframes self-glow\s*\{([\s\S]*?)\n\s*\}/)?.[1] ?? '';
    // A shadow that vanishes and returns reads as a notification badge
    // demanding action rather than a marker that is simply warm.
    expect(frames).not.toMatch(/0 0 0 0 transparent/);
    expect(frames.match(/box-shadow/g) ?? []).toHaveLength(2);
  });

  it('stops all three under reduced motion', () => {
    injectGlobalStyles();
    const reduced = reducedBlock();
    expect(reduced).toContain('.modal-scrim-in');
    expect(reduced).toContain('.modal-card-in');
    expect(reduced).toContain('.self-glow');
    expect(reduced).toContain('.badge-chip');
  });

  it('still shows the card and the marker when motion is off', () => {
    injectGlobalStyles();
    const reduced = reducedBlock();
    // The entrance keyframes START at opacity 0. Cancelling the animation is
    // what makes the card simply be there; anything that leaves it hidden
    // would render an empty modal for these users only.
    expect(reduced).toMatch(/\.modal-scrim-in,\s*\.modal-card-in\s*\{[^}]*animation:\s*none/);
    expect(reduced).not.toMatch(/\.modal-card-in[^}]*display:\s*none/);
    // The pill keeps a static glow: reduced motion asks for less movement,
    // not for less information.
    expect(reduced).toMatch(/\.self-glow\s*\{[^}]*box-shadow:[^}]*var\(--c-accent\)/);
  });

  it('keeps the badge hover feedback while dropping its travel', () => {
    injectGlobalStyles();
    const reduced = reducedBlock();
    expect(reduced).toMatch(/\.badge-chip:hover\s*\{[^}]*transform:\s*none/);
    // The shadow and border are not motion and must survive, so the chip
    // still responds to the cursor.
    expect(reduced).not.toMatch(/\.badge-chip:hover\s*\{[^}]*box-shadow:\s*none/);
  });

  // The reduced-motion block is read above with a regex that ends at the first
  // indented closing brace, so a multi-line rule inside it silently truncates
  // the block and every assertion after that point stops seeing anything.
  // This is the canary: it fails the moment the block stops being complete.
  it('keeps the reduced-motion block parseable to its real end', () => {
    injectGlobalStyles();
    // .confetti-layer is the last rule in the block. If the regex above stops
    // early, this is what goes missing first.
    expect(reducedBlock()).toContain('.confetti-layer');
  });
});
