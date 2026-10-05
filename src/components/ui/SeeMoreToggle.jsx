import {
  COLORS,
  FONTS,
  FONT_SIZE,
  FONT_WEIGHT,
  LETTER_SPACING,
  RADIUS,
  SPACE,
} from '../../lib/theme';

// The control half of src/lib/useSeeMore.js: renders nothing until the hook has
// measured a real crop. Kept apart from the hook so this file exports only a
// component (react-refresh/only-export-components).
export default function SeeMoreToggle({ state, controls }) {
  if (!state.cropped) return null;
  return (
    <button
      type="button"
      aria-expanded={state.expanded}
      aria-controls={controls}
      onClick={state.toggle}
      style={{
        alignSelf: 'flex-start',
        background: 'transparent',
        border: 'none',
        // Vertical padding takes the 12px label to a 24px target (WCAG 2.5.8);
        // the negative inline margin keeps the glyphs flush with the text above.
        padding: `${SPACE[1]}px ${SPACE[1]}px`,
        marginInline: -SPACE[1],
        cursor: 'pointer',
        fontFamily: FONTS.mono,
        fontSize: FONT_SIZE.sm,
        fontWeight: FONT_WEIGHT.bold,
        letterSpacing: LETTER_SPACING.wider,
        textTransform: 'uppercase',
        textDecoration: 'underline',
        color: COLORS.mute,
        borderRadius: RADIUS.sm,
      }}
    >
      {state.expanded ? 'See less' : 'See more'}
    </button>
  );
}
