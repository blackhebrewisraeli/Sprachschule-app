import { useEffect, useId, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { COLORS, FONTS, FONT_SIZE, SPACE } from '../../lib/theme';
import { Body } from '../ui/Text';

/** Minimum comfortable touch target, px — same constant WelcomeGate uses. */
const TAP_TARGET_MIN = 44;
/** One line of label text. With SPACE[3] above and below it makes exactly TAP_TARGET_MIN. */
const LINE = SPACE[5];

/**
 * The account-terms checkbox. Copy is owner-approved legal copy (spec §5.3) —
 * reproduce, don't edit. A native checkbox + <label for>, so keyboard, screen
 * readers and a tap on the words all work without help. The links sit INSIDE
 * the label: activating a link follows it and does not toggle the box.
 *
 * Links navigate in-app (onNavigate → App.openLegal, pushState) on a plain
 * click, so the reader sees the bundled text — the version being accepted —
 * and the draft in App survives. Modifier clicks keep the browser default.
 */
export default function LegalConsent({
  checked,
  onChange,
  invalid = false,
  onNavigate,
  focusOnMount = false,
}) {
  const id = useId();
  const errorId = `${id}-error`;
  const inputRef = useRef(null);

  // An effect, not autoFocus: provider buttons in the same sheet autoFocus
  // during commit, and effects run after, so this wins when it should.
  useEffect(() => {
    if (focusOnMount) inputRef.current?.focus();
  }, [focusOnMount]);

  const link = (label, to) => (
    <a
      href={to}
      data-ui="link"
      style={{ color: COLORS.ink, textDecoration: 'underline' }}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        onNavigate?.(to);
      }}
    >
      {label}
    </a>
  );

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', minWidth: 0 }}>
        <input
          ref={inputRef}
          id={id}
          type="checkbox"
          data-ui="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={invalid ? 'true' : undefined}
          aria-describedby={invalid ? errorId : undefined}
          style={{
            width: LINE,
            height: LINE,
            margin: `${SPACE[3]}px 0 0`,
            flex: 'none',
            accentColor: COLORS.ink,
          }}
        />
        {/* The label, not the row, is the tap target: a block (never flex, so the
            text and both links keep flowing inline) at least TAP_TARGET_MIN tall.
            The box-to-words gap is the label's left padding, so there is no dead
            strip between them; the box's top margin lines it up with line one. */}
        <label
          htmlFor={id}
          style={{
            display: 'block',
            minHeight: TAP_TARGET_MIN,
            minWidth: 0,
            padding: `${SPACE[3]}px 0 ${SPACE[3]}px ${SPACE[3]}px`,
            boxSizing: 'border-box',
            fontFamily: FONTS.body,
            fontSize: FONT_SIZE.sm,
            lineHeight: `${LINE}px`,
            color: COLORS.ink,
            overflowWrap: 'break-word',
          }}
        >
          I agree to the {link('Terms of Service', '/terms')} and acknowledge the{' '}
          {link('Privacy Policy', '/privacy')}.
        </label>
      </div>
      {invalid && (
        <Body
          id={errorId}
          role="alert"
          size="sm"
          tone="error"
          style={{ display: 'flex', gap: SPACE[2], marginTop: SPACE[2] }}
        >
          <AlertCircle size={16} aria-hidden="true" style={{ flex: 'none' }} />
          Required: tick the box to agree to the Terms of Service and acknowledge the Privacy
          Policy.
        </Body>
      )}
    </div>
  );
}
