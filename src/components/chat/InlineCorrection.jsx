import { useId, useState } from 'react';
import { Volume2 } from 'lucide-react';
import {
  COLORS,
  FONT_BODY,
  FONT_MONO,
  FONT_SIZE,
  LETTER_SPACING,
  RADIUS,
  SPACE,
} from '../../lib/theme';
import { canSpeak, speak } from '../../lib/speech';

// Cue under the learner turn that was just graded. A real fix is expandable;
// a clean turn is one quiet line. Never an empty "Alles gut!" card.
export default function InlineCorrection({ correction }) {
  const panelId = useId();
  const [open, setOpen] = useState(false);

  if (!correction) {
    return (
      <div
        style={{
          marginTop: SPACE[2],
          fontFamily: FONT_MONO,
          fontSize: FONT_SIZE.tag,
          letterSpacing: LETTER_SPACING.wider,
          textTransform: 'uppercase',
          color: COLORS.mute,
          textAlign: 'right',
        }}
      >
        No fix this time
      </div>
    );
  }

  return (
    <div style={{ marginTop: SPACE[2] }}>
      <button
        type="button"
        data-ui="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          textAlign: 'left',
          background: COLORS.redSoft,
          color: COLORS.red,
          border: 'none',
          borderRadius: RADIUS.md,
          padding: `${SPACE[2] + 2}px ${SPACE[3]}px`,
          fontFamily: FONT_MONO,
          fontSize: FONT_SIZE.tag,
          letterSpacing: LETTER_SPACING.wider,
          textTransform: 'uppercase',
          cursor: 'pointer',
        }}
      >
        Needs a fix
        <span
          style={{
            marginLeft: SPACE[2],
            fontFamily: FONT_BODY,
            fontSize: FONT_SIZE.base,
            fontWeight: 600,
            letterSpacing: 0,
            textTransform: 'none',
          }}
        >
          {correction.fixed}
        </span>
      </button>
      {open && (
        <div
          id={panelId}
          style={{
            background: COLORS.redSoft,
            color: COLORS.red,
            borderRadius: RADIUS.md,
            marginTop: SPACE[1],
            padding: `${SPACE[3]}px ${SPACE[3]}px ${SPACE[4]}px`,
          }}
        >
          <div
            style={{
              fontFamily: FONT_BODY,
              fontSize: FONT_SIZE.base,
              textDecoration: 'line-through',
              opacity: 0.75,
              marginBottom: SPACE[2],
            }}
          >
            You said: {correction.original}
          </div>
          <div
            style={{
              fontFamily: FONT_BODY,
              fontSize: FONT_SIZE.base,
              fontWeight: 600,
              marginBottom: SPACE[2],
            }}
          >
            Correct: {correction.fixed}
          </div>
          {canSpeak() && (
            <button
              type="button"
              data-ui="button"
              onClick={() => speak(correction.fixed)}
              style={{
                background: 'transparent',
                border: `1px solid ${COLORS.red}`,
                color: COLORS.red,
                padding: `${SPACE[1]}px ${SPACE[2]}px`,
                fontFamily: FONT_MONO,
                fontSize: FONT_SIZE.tag,
                letterSpacing: LETTER_SPACING.wider,
                display: 'inline-flex',
                alignItems: 'center',
                gap: SPACE[2],
              }}
            >
              <Volume2 size={12} aria-hidden="true" /> HEAR IT
            </button>
          )}
          {correction.explain && (
            <p
              style={{
                margin: `${SPACE[3]}px 0 0`,
                fontFamily: FONT_BODY,
                fontSize: FONT_SIZE.base,
                lineHeight: 1.5,
                fontStyle: 'italic',
              }}
            >
              {correction.explain}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
