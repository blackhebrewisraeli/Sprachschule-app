import { useState, useRef, useEffect } from 'react';
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
import { FEEDBACK_CATEGORIES, submitFeedback } from '../lib/feedback';
import { useWindowWidth } from '../lib/useWindowWidth';
import useFocusTrap from '../lib/useFocusTrap';
import Button from './ui/Button';

/**
 * "Something is wrong with this exercise" — one textarea, one category, sent
 * with the exercise context the learner cannot be expected to describe.
 *
 * DELIBERATELY DOES NOT SHOW `context.itemId` OR `context.itemLabel`.
 * The label is the German term for the card being drilled, and CardFace
 * conceals exactly that for the Hören and Artikel decks — the word is the
 * answer being asked for. A helpful-looking "Reporting: die Zeit" line here
 * would hand the learner the answer through the report button. Both fields
 * still travel in the payload; neither is ever rendered. There is a test that
 * asserts their absence from this subtree, and it should stay.
 */
/** Preferred dialog width, px — shrinks on narrow viewports, never grows. */
const PREFERRED_WIDTH = 400;

export default function FeedbackDialog({ context, onClose }) {
  const viewportWidth = useWindowWidth();
  const [category, setCategory] = useState(FEEDBACK_CATEGORIES[0].key);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const panelRef = useRef(null);
  const textareaRef = useRef(null);

  useFocusTrap(panelRef, true);

  // Captured during the FIRST RENDER, not in an effect. React runs autoFocus
  // during commit, before effects, so an effect that reads document.activeElement
  // records whatever this dialog just focused rather than the control that
  // opened it. Render happens before commit, so this always sees the opener.
  const openerRef = useRef(null);
  if (openerRef.current === null && typeof document !== 'undefined') {
    const active = document.activeElement;
    openerRef.current = active instanceof HTMLElement && active !== document.body ? active : null;
  }

  // Restore on unmount. FeedbackButton renders this conditionally, so unmount IS
  // close — covering Escape, Cancel and a successful send alike. Without it,
  // dismissing drops focus to <body> and a keyboard user restarts from the top
  // of the page, several tab stops back from the trigger they were just on.
  useEffect(
    () => () => {
      const opener = openerRef.current;
      openerRef.current = null;
      // The opener can be gone — the surface holding it may have unmounted —
      // in which case there is nothing to go back to.
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    },
    []
  );

  useEffect(() => {
    // The textarea is what the learner came here to use.
    (textareaRef.current ?? panelRef.current)?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canSend = message.trim().length > 0 && !busy;

  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    setError(null);
    const result = await submitFeedback({ ...context, category, message });
    setBusy(false);
    if (result.ok) setSent(true);
    // The draft stays in the textarea on failure — retyping a bug report
    // because the send failed is how a reporter learns not to bother.
    else setError('That did not send. Please try again.');
  };

  const label = (text) => (
    <div
      style={{
        fontFamily: FONTS.mono,
        fontSize: FONT_SIZE.tag,
        letterSpacing: LETTER_SPACING.caps,
        textTransform: 'uppercase',
        color: COLORS.mute,
        marginBottom: SPACE[2],
      }}
    >
      {text}
    </div>
  );

  return (
    <>
      <div
        aria-hidden="true"
        className="modal-scrim-in"
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: COLORS.inkA30,
          zIndex: Z.modal,
        }}
      />
      <div
        ref={panelRef}
        // Fades with its scrim and does NOT rise: the panel centres itself
        // with the inline translate below, and rise-in animates transform,
        // which would override that centring for as long as it ran. The panel
        // would start off-centre and snap.
        className="modal-scrim-in"
        role="dialog"
        aria-modal="true"
        aria-label="Report an issue"
        tabIndex={-1}
        style={{
          ...CARD.base,
          position: 'fixed',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          // Computed rather than `min(400px, calc(100vw - 16px))`. The CSS is
          // equivalent in a browser, but jsdom's parser mangles a calc() nested
          // in a min() into `min(400px * , * calc(…))`, so the clamp could not
          // be asserted at all — and an unassertable 320px guarantee is the one
          // this repo keeps re-breaking. Same 8px gutter as the walkthrough.
          width: Math.min(PREFERRED_WIDTH, viewportWidth - SPACE[2] * 2),
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          boxSizing: 'border-box',
          padding: SPACE[5],
          zIndex: Z.modal + 1,
          boxShadow: SHADOW.cardChunk,
          border: BORDER.panel,
        }}
      >
        <div
          style={{
            fontFamily: FONTS.display,
            fontSize: FONT_SIZE['2xl'],
            fontWeight: FONT_WEIGHT.bold,
            letterSpacing: LETTER_SPACING.tight,
            marginBottom: SPACE[4],
          }}
        >
          Report an issue
        </div>

        {sent ? (
          <>
            <p
              style={{
                fontFamily: FONTS.body,
                fontSize: FONT_SIZE.base,
                lineHeight: 1.5,
                color: COLORS.inkSoft,
                marginTop: 0,
                marginBottom: SPACE[5],
              }}
            >
              Thank you — that is on its way. Reports like this are how the exercises get fixed.
            </p>
            <Button variant="primary" style={{ width: '100%' }} onClick={onClose}>
              Close
            </Button>
          </>
        ) : (
          <>
            {label('What is wrong?')}
            <div
              role="group"
              aria-label="What is wrong?"
              style={{
                display: 'grid',
                // minmax(0, 1fr) per AGENTS.md — a bare 1fr keeps min-width
                // auto and pushes the dialog past a 320px viewport.
                gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                gap: SPACE[2],
                marginBottom: SPACE[4],
              }}
            >
              {FEEDBACK_CATEGORIES.map((c) => {
                const active = c.key === category;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCategory(c.key)}
                    aria-pressed={active}
                    style={{
                      border: 'none',
                      borderRadius: RADIUS.sm,
                      boxShadow: SHADOW.press(active ? COLORS.greenDeep : COLORS.lip),
                      background: active ? COLORS.green : COLORS.card,
                      color: active ? COLORS.paper : COLORS.ink,
                      padding: SPACE[3],
                      cursor: 'pointer',
                      fontFamily: FONTS.mono,
                      fontSize: FONT_SIZE.label,
                      fontWeight: FONT_WEIGHT.bold,
                      letterSpacing: LETTER_SPACING.wide,
                      textTransform: 'uppercase',
                      minWidth: 0,
                    }}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>

            {label('Tell us what happened')}
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              aria-label="Tell us what happened"
              placeholder="The audio cut off halfway through…"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                resize: 'vertical',
                background: COLORS.paperDeep,
                color: COLORS.ink,
                border: BORDER.panel,
                borderRadius: RADIUS.sm,
                boxShadow: SHADOW.inset,
                padding: SPACE[3],
                fontFamily: FONTS.body,
                fontSize: FONT_SIZE.base,
                marginBottom: SPACE[3],
              }}
            />

            {error && (
              <div
                role="alert"
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: FONT_SIZE.sm,
                  color: COLORS.red,
                  marginBottom: SPACE[3],
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: 'flex', gap: SPACE[2] }}>
              <Button
                variant="primary"
                style={{ flex: 1, minWidth: 0 }}
                disabled={!canSend}
                onClick={send}
              >
                {busy ? 'Sending…' : 'Send'}
              </Button>
              {/* `flex: 1` is explicit now that BUTTON.secondary no longer carries
                  it. This row is Send + Cancel as equal halves; without it Cancel
                  collapses to its label and Send takes the rest. */}
              <Button variant="secondary" style={{ flex: 1, flexShrink: 0 }} onClick={onClose}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
