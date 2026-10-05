import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import {
  COLORS,
  FONTS,
  FONT_SIZE,
  FONT_WEIGHT,
  LETTER_SPACING,
  SPACE,
  RADIUS,
  SHADOW,
  BORDER,
  CARD,
  Z,
} from '../lib/theme';
import { isTutorialDone, completeTutorial, TUTORIAL_REPLAY_EVENT } from '../lib/tutorialPref';
import useFocusTrap from '../lib/useFocusTrap';
import Button from './ui/Button';
import { GUTTER, bubbleWidth, bubbleBox, scrimRects } from './tutorial/geometry';
import { TUTORIAL_STEPS } from './tutorial/steps';

/**
 * First-run walkthrough: a dimmed scrim with the current target cut out of it,
 * and one bubble anchored to that target.
 *
 * Self-gating — it reads the dismissal flag itself rather than asking the host
 * to, so there is exactly one place that decides whether a learner has seen the
 * tour. The host only supplies anchors and, optionally, hears about the exit.
 *
 * `anchors` is `{ [stepId]: React.RefObject<HTMLElement> }`. A step whose anchor
 * is absent still renders: it falls back to a centred bubble over a plain
 * scrim. Blanking the tour because one target has not mounted would trade a
 * missing pointer for a missing feature.
 */
export default function TutorialOverlay({ anchors = {}, onDismiss }) {
  // Read once, on mount. Re-reading per render would let a write from another
  // tab yank the tour out from under someone mid-step.
  const [open, setOpen] = useState(() => !isTutorialDone());
  const [stepIndex, setStepIndex] = useState(0);
  const [box, setBox] = useState(null);
  const [scrim, setScrim] = useState([]);
  const panelRef = useRef(null);

  const step = TUTORIAL_STEPS[stepIndex];
  const isLast = stepIndex === TUTORIAL_STEPS.length - 1;

  const dismiss = useCallback(() => {
    completeTutorial();
    setOpen(false);
    onDismiss?.();
  }, [onDismiss]);

  // Measure in a layout effect, not a passive one: React attaches the host's
  // anchor refs earlier in the same commit, so the nodes are already there, and
  // measuring before paint means the bubble never shows up at 0,0 first.
  const anchorNode = anchors[step?.id]?.current ?? null;
  useLayoutEffect(() => {
    if (!open) return undefined;

    const measure = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const node = anchors[TUTORIAL_STEPS[stepIndex].id]?.current ?? null;

      if (!node) {
        const width = bubbleWidth(vw);
        setBox({
          left: (vw - width) / 2,
          top: Math.max(GUTTER, Math.round(vh * 0.25)),
          width,
          placement: 'below',
        });
        setScrim([{ top: 0, left: 0, width: vw, height: vh }]);
        return;
      }

      const rect = node.getBoundingClientRect();
      setBox(bubbleBox(rect, vw, vh));
      setScrim(scrimRects(rect, vw, vh));
    };

    measure();
    // Anything that moves the anchor under a fixed bubble: a rotate, a keyboard
    // opening, or the sticky header scrolling its chip out of reach.
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
    // anchorNode re-runs this when a target mounts late; anchors itself is a
    // fresh object each render and would loop.
  }, [open, stepIndex, anchorNode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Move focus in so the tour is reachable without a mouse. Gated on `ready`,
  // not on `open`: the first render returns null while `box` is still unmeasured,
  // so on `open` alone this fired before the panel existed and focus stayed on
  // whatever was behind the scrim.
  const ready = open && box !== null;

  // Captured during RENDER on the open transition, not in an effect. React runs
  // autoFocus during commit, before effects, so an effect reading
  // document.activeElement records what this overlay just focused rather than
  // what preceded it. Render runs before commit, so this sees the real one.
  //
  // The tour has no opener control — it appears by itself on first run — so on a
  // fresh load there is usually nothing focused and this stays null. It matters
  // when something WAS focused: `ready` waits on measurement, so a keyboard user
  // can be on a control at the moment the tour appears and takes focus away.
  const openerRef = useRef(null);
  const wasReadyRef = useRef(false);
  if (ready && !wasReadyRef.current) {
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }
  wasReadyRef.current = ready;

  useEffect(() => {
    if (ready) panelRef.current?.focus();
  }, [ready]);

  // Seen the moment it is actually on screen, not only when it is dismissed.
  // Keyed on `ready` rather than `open` so a tour that never finished measuring
  // is not counted as offered. See completeTutorial for why this is the honest
  // moment: a reload or a closed tab is not a dismissal, and treating it as
  // "not yet offered" is what brought the tour back on every single app open.
  useEffect(() => {
    if (ready) completeTutorial();
  }, [ready]);

  // Settings → "Show tutorial". This component stays mounted for the whole
  // session and reads its flag once, so clearing storage alone would not
  // reopen it until a reload.
  useEffect(() => {
    const replay = () => {
      setStepIndex(0);
      setOpen(true);
    };
    window.addEventListener(TUTORIAL_REPLAY_EVENT, replay);
    return () => window.removeEventListener(TUTORIAL_REPLAY_EVENT, replay);
  }, []);

  // Give focus back when the tour goes away. This overlay returns null rather
  // than unmounting, so the cleanup keys on `ready` — it runs when `ready` flips
  // false, exactly as it would on unmount.
  useEffect(() => {
    if (!ready) return undefined;
    return () => {
      const opener = openerRef.current;
      openerRef.current = null;
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, [ready]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dismiss();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, dismiss]);

  useFocusTrap(panelRef, open);

  if (!ready || !step) return null;

  return (
    <>
      {scrim.map((r, i) => (
        <div
          key={`${r.top}-${r.left}-${i}`}
          data-testid="tutorial-scrim"
          aria-hidden="true"
          style={{
            position: 'fixed',
            top: r.top,
            left: r.left,
            width: r.width,
            height: r.height,
            background: COLORS.inkA30,
            zIndex: Z.modal,
            pointerEvents: 'auto',
          }}
        />
      ))}

      <div
        ref={panelRef}
        data-testid="tutorial-bubble"
        role="dialog"
        aria-modal="true"
        aria-label={`Tutorial, step ${stepIndex + 1} of ${TUTORIAL_STEPS.length}`}
        tabIndex={-1}
        style={{
          ...CARD.base,
          position: 'fixed',
          left: box.left,
          top: box.top,
          width: box.width,
          // Belt and braces on the clamp in bubbleBox: even if a future caller
          // hands in a stale width, the box cannot paint past the viewport.
          maxWidth: `calc(100vw - ${GUTTER * 2}px)`,
          boxSizing: 'border-box',
          padding: SPACE[5],
          zIndex: Z.modal + 1,
          boxShadow: SHADOW.cardChunk,
          border: BORDER.panel,
        }}
      >
        <div
          style={{
            fontFamily: FONTS.mono,
            fontSize: FONT_SIZE.tag,
            letterSpacing: LETTER_SPACING.caps,
            textTransform: 'uppercase',
            color: COLORS.red,
            marginBottom: SPACE[2],
          }}
        >
          Step {stepIndex + 1} of {TUTORIAL_STEPS.length}
        </div>

        <div
          style={{
            fontFamily: FONTS.display,
            fontSize: FONT_SIZE['2xl'],
            fontWeight: FONT_WEIGHT.bold,
            letterSpacing: LETTER_SPACING.tight,
            marginBottom: SPACE[2],
          }}
        >
          {step.title}
        </div>

        <p
          style={{
            fontFamily: FONTS.body,
            fontSize: FONT_SIZE.base,
            lineHeight: 1.5,
            color: COLORS.inkSoft,
            margin: 0,
            marginBottom: SPACE[4],
          }}
        >
          {step.body}
        </p>

        <div style={{ display: 'flex', gap: SPACE[2], alignItems: 'center' }}>
          <Button
            variant="primary"
            // nowrap: at 320px "GOT IT" broke onto two lines beside the Skip
            // control. Both labels are short enough that this cannot overflow.
            style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap' }}
            onClick={() => (isLast ? dismiss() : setStepIndex((i) => i + 1))}
          >
            {isLast ? 'Got it' : 'Next'}
          </Button>
          {/* Present on every step, including the last. An escape hatch that
              appears only while the tour still has steps left is not an escape
              hatch — see the brief's "highly visible" requirement. */}
          <button
            type="button"
            onClick={dismiss}
            style={{
              flexShrink: 0,
              background: 'transparent',
              border: 'none',
              padding: `${SPACE[2]}px ${SPACE[3]}px`,
              cursor: 'pointer',
              fontFamily: FONTS.mono,
              fontSize: FONT_SIZE.sm,
              fontWeight: FONT_WEIGHT.bold,
              letterSpacing: LETTER_SPACING.wider,
              textTransform: 'uppercase',
              color: COLORS.mute,
              borderRadius: RADIUS.sm,
              textDecoration: 'underline',
            }}
          >
            Skip tutorial
          </button>
        </div>
      </div>
    </>
  );
}
