import { COLORS, FOCUS } from './theme';

/**
 * App-wide base styles + keyframes formerly injected by App.jsx <style>.
 * Uses CSS custom properties so scrollbar / pulse colours follow the theme.
 */
export function injectGlobalStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('deutsch-global-styles')) return;

  const style = document.createElement('style');
  style.id = 'deutsch-global-styles';
  style.textContent = `
    * { box-sizing: border-box; }
    body { margin: 0; }
    button { font-family: inherit; cursor: pointer; }
    /* One focus ring for the whole app. Any element with a [data-ui] attribute
       gets it — that is how a primitive opts in. :focus-visible, not :focus, so
       a mouse click does not ring. This replaced three hand-rolled recipes that
       had drifted to three different spellings, and gave the ~78 raw <button>
       elements a ring they never had. */
    [data-ui]:focus-visible {
      outline: ${FOCUS.ring};
      outline-offset: ${FOCUS.offset}px;
    }
    /* Full-bleed rows and cards: an outset ring is clipped by the container. */
    [data-ui][data-focus-inset]:focus-visible { outline-offset: ${FOCUS.inset}px; }
    /* Ink-built planes (toast, CARD.dark, charcoal masthead): the default ring
       is var(--c-fg), which IS the plane. currentColor is the paired ink the
       control already carries — paper on an inverting ink fill, accentBlackOn
       on the stable charcoal bar. */
    [data-ui][data-focus-on-dark]:focus-visible { outline: ${FOCUS.onDark}; }
    /* Hover is gated on a fine pointer: a touch device latches the hover style
       on tap and keeps it until the next tap elsewhere. brightness() rather than
       a hover token per variant — seven variants x two modes is fourteen palette
       entries to keep in contrast, to express "slightly lighter". A relative
       filter cannot drift out of contrast, because it moves plane and ink
       together. */
    @media (hover: hover) and (pointer: fine) {
      [data-ui="button"]:not([disabled]):not([aria-busy="true"]):hover { filter: brightness(1.04); }
      /* Earned badges lift under the cursor. The chip is not a control — there
         is nothing to click — so this stops short of a button's affordance: no
         cursor change, no colour change, just a hair of elevation, which reads
         as "this object is real" rather than "press me".

         The shadow is mixed from the FOREGROUND ink, not SHADOW.card. Two
         reasons, and the second is why this is not a style preference:
         SHADOW.card is a fixed light-mode rgba that is all but invisible on a
         dark surface (the same fact BORDER.panel exists for), and a lift with
         no visible shadow is just a chip that changed size. Deriving from
         var(--c-fg) inverts with the palette — a shadow under the chip in
         light mode, a soft halo in dark — so one declaration covers both.

         An earlier draft firmed up border-color here instead. It did nothing:
         the chip carries border as an INLINE shorthand, which outranks any
         stylesheet rule, so the declaration was silently dropped in both
         themes — visible only in a browser, since jsdom resolves no cascade.
         Anything this rule wants to change must be a property the component
         does not also set inline.

         (No backticks in this comment: it lives inside a template literal, so
         one would end the string. That mistake is what wrote this paragraph.) */
      .badge-chip:hover { transform: translateY(-1px) scale(1.04); box-shadow: 0 3px 10px ${COLORS.inkA20}; }
    }
    /* Full-height entry screens (welcome gate, level splash). 100vh on iOS
       Safari means the viewport WITHOUT the URL bar, so a 100vh element is
       taller than what you can actually see and its bottom sits behind the
       browser chrome — verified on a real iPhone, where the splash's gold
       stripe was cut off. 100dvh is the visible height and tracks the bar as
       it hides and shows. The 100vh line stays first as the fallback for
       engines without dvh; both declarations are needed, which is why this is
       a class and not an inline style. */
    .entry-screen {
      min-height: 100vh;
      min-height: 100dvh;
      box-sizing: border-box;
      padding-top: calc(24px + env(safe-area-inset-top, 0px));
      padding-right: calc(24px + env(safe-area-inset-right, 0px));
      padding-bottom: calc(24px + env(safe-area-inset-bottom, 0px));
      padding-left: calc(24px + env(safe-area-inset-left, 0px));
    }
    /* Insets are composed with the 24px gutter, not a replacement. The
       viewport opt-in (viewport-fit=cover in index.html) is what makes them
       non-zero on a notched device. Do not reintroduce .entry-screen-foot —
       no element carries it.

       (No backticks anywhere in this comment: it lives inside a template
       literal, so one would end the string.) */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: var(--c-surface-alt); }
    ::-webkit-scrollbar-thumb { background: var(--c-fg); border: 2px solid var(--c-surface-alt); }
    @keyframes blink      { 0%, 60% { opacity: 1; } 61%, 100% { opacity: 0; } }
    @keyframes pulse-red  { 0%, 100% { box-shadow: 0 0 0 0 var(--c-error-a80); } 50% { box-shadow: 0 0 0 12px var(--c-error-a00); } }
    @keyframes slide-up   { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes bounce     { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.18); } }
    @keyframes pulse-gold { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--c-accent) 70%, transparent); } 50% { box-shadow: 0 0 0 10px transparent; } }
    @keyframes shimmer    { 0% { background-position: -200% center; } 100% { background-position: 200% center; } }
    .slide-up { animation: slide-up 0.3s ease-out; }
    @keyframes pop      { 0% { transform: scale(0.9); } 60% { transform: scale(1.06); } 100% { transform: scale(1); } }
    @keyframes wiggle   { 0%, 100% { transform: translateX(0) rotate(0); } 25% { transform: translateX(-4px) rotate(-1.5deg); } 75% { transform: translateX(4px) rotate(1.5deg); } }
    @keyframes confetti { 0% { transform: translate(0,0) rotate(0); opacity: 1; } 100% { transform: translate(var(--dx), 120px) rotate(var(--rot)); opacity: 0; } }
    .pop    { animation: pop 0.28s ease-out; }
    .wiggle { animation: wiggle 0.30s ease-in-out; }
    @keyframes ui-spin { to { transform: rotate(360deg); } }
    .ui-spinner { animation: ui-spin 0.7s linear infinite; }
    /* ── Modal entrance ────────────────────────────────────────────────────
       Scrim and card animate SEPARATELY and at different speeds, which is the
       whole trick: the scrim is the context switch and wants to be immediate,
       while the card is the object being handed to you and wants to travel.
       Animating the pair as one block makes the page look like it stuttered.

       0.5s on the card sounds slow read as a number, and is not, because the
       easing is expo-out: roughly three quarters of the distance is covered in
       the first 120ms and the tail is the settle. A linear or ease-out half
       second genuinely would drag. Do not swap the curve without shortening
       the duration to match.

       16px, matching the SPACE[4] step, so the card rises by a real unit of the
       layout rather than an arbitrary nudge. It travels UP, so the motion
       points at where the card ends rather than away from it. */
    @keyframes scrim-in { from { opacity: 0; } to { opacity: 1; } }
    @keyframes rise-in  { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
    .modal-scrim-in { animation: scrim-in 0.22s ease-out; }
    .modal-card-in  { animation: rise-in 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
    /* ── View entrance ─────────────────────────────────────────────────────
       A tab or route that mounts fresh fades in, so a switch does not swap the
       whole page in one frame. Opacity only, on the scrim ramp: a transform
       would shift the tutorial's anchors while it measures them, and would
       make the view a containing block for anything fixed inside it. Short,
       because tabs switch tens of times a session, and on the card's expo-out
       curve, so most of the change lands in the first frames and the rest is
       settle. Applied to what is NEW on a switch, never to shared chrome: the
       trial wall autofocuses on mount, and remounting it per tab would pull
       focus off the nav. */
    .view-in { animation: scrim-in 0.16s cubic-bezier(0.16, 1, 0.3, 1); }
    /* ── "This is you" ─────────────────────────────────────────────────────
       A glow that breathes rather than a pulse that blinks: the shadow never
       reaches zero, so at every frame the pill is lit and the animation only
       changes HOW MUCH. A ring that leaves and returns reads as a notification
       badge demanding action; this reads as the pill being warm.

       color-mix over var(--c-accent) rather than a literal, so it is the pack
       accent in both palettes — the same construction pulse-gold uses. 3.2s is
       deliberately longer than a heartbeat; anything near 1s becomes a tic you
       cannot stop looking at, next to text you are meant to read. */
    @keyframes self-glow {
      0%, 100% { box-shadow: 0 0 4px 0 color-mix(in srgb, var(--c-accent) 22%, transparent); }
      50%      { box-shadow: 0 0 12px 2px color-mix(in srgb, var(--c-accent) 62%, transparent); }
    }
    .self-glow  { animation: self-glow 3.2s ease-in-out infinite; }
    .badge-chip { transition: transform 0.18s ease, box-shadow 0.18s ease; }
    @media (prefers-reduced-motion: reduce) {
      .pop, .wiggle, .slide-up { animation: none !important; }
      /* The card must still ARRIVE — the keyframes start at opacity 0, so
         cancelling the animation is what makes it simply be there. */
      .modal-scrim-in, .modal-card-in { animation: none !important; }
      .view-in { animation: none !important; }
      /* Frozen at the low end of its own cycle instead of switched off. The
         pill's job is to stand out, and reduced motion is a request for less
         movement, not for less information. One line, like every other rule in
         this sheet: injectGlobalStyles.test.js reads this block with a regex
         that ends at the first indented closing brace, so a multi-line rule
         here truncates the block and blinds the assertions below it. */
      .self-glow { animation: none !important; box-shadow: 0 0 4px 0 color-mix(in srgb, var(--c-accent) 22%, transparent); }
      /* Hover keeps its shadow and loses its travel: the shadow is feedback,
         the 1px rise is the only part that is actually motion. */
      .badge-chip { transition: none !important; }
      .badge-chip:hover { transform: none !important; }
      /* Stops turning, stays visible: aria-busy alone is not a visible
         affordance, so removing the glyph would leave nothing to see. */
      .ui-spinner { animation: none !important; }
      .confetti-layer { display: none !important; }
    }
  `;
  document.head.appendChild(style);
}
