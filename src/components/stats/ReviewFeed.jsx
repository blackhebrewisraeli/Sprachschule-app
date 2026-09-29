import { BookOpen } from 'lucide-react';
import {
  COLORS,
  FONTS,
  FONT_SIZE,
  FONT_WEIGHT,
  LETTER_SPACING,
  SPACE,
  RADIUS,
  SHADOW,
} from '../../lib/theme';
import StatusNote from '../ui/StatusNote';

// Short tab badge for each review row.
const REVIEW_BADGE = {
  alphabet: 'ALPHABET',
  vocab: 'VOCAB',
  translate: 'TRANSLATE',
};

// Section E — up to 10 recently-wrong items; tapping a row calls onReview(item)
// (the parent navigates to the right tab + pre-loads the exercise).
export default function ReviewFeed({ items, onReview }) {
  if (items.length === 0) {
    return (
      <StatusNote icon={BookOpen} style={{ padding: SPACE[3], gap: SPACE[2] }}>
        Nothing to review — keep practising.
      </StatusNote>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        borderRadius: RADIUS.lg,
        boxShadow: SHADOW.card,
        overflow: 'hidden',
      }}
    >
      {items.map((item, i) => {
        const verdictColor = item.lastVerdict === 'almost' ? COLORS.mute : COLORS.red;
        const verdictGlyph = item.lastVerdict === 'almost' ? '≈' : '✗';
        const context = item.context ? ` · ${item.context.toUpperCase()}` : '';
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onReview(item)}
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto minmax(0, 1fr) auto',
              gap: SPACE[2],
              alignItems: 'center',
              textAlign: 'left',
              padding: `${SPACE[2]}px ${SPACE[3]}px`,
              background: COLORS.paper,
              border: 'none',
              borderBottom: i < items.length - 1 ? `1px solid ${COLORS.inkA10}` : 'none',
              cursor: 'pointer',
              transition: 'background 0.12s ease',
              color: COLORS.ink,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = COLORS.paperDeep)}
            onMouseLeave={(e) => (e.currentTarget.style.background = COLORS.paper)}
          >
            <span
              style={{
                fontFamily: FONTS.mono,
                fontSize: FONT_SIZE.tag,
                letterSpacing: LETTER_SPACING.caps,
                color: COLORS.mute,
                whiteSpace: 'nowrap',
              }}
            >
              {REVIEW_BADGE[item.tab]}
              {context}
            </span>

            <span style={{ minWidth: 0 }}>
              <span
                style={{
                  fontFamily: FONTS.display,
                  fontSize: FONT_SIZE.base,
                  fontWeight: FONT_WEIGHT.semibold,
                  color: COLORS.ink,
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.label}
              </span>
              <span
                style={{
                  fontFamily: FONTS.body,
                  fontStyle: 'italic',
                  fontSize: FONT_SIZE.sm,
                  color: COLORS.mute,
                  display: 'block',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {item.detail}
              </span>
            </span>

            <span
              style={{
                fontFamily: FONTS.mono,
                fontSize: FONT_SIZE.tag,
                letterSpacing: LETTER_SPACING.caps,
                color: verdictColor,
                whiteSpace: 'nowrap',
              }}
            >
              {verdictGlyph} {item.wrongCount}×
            </span>
          </button>
        );
      })}
    </div>
  );
}
