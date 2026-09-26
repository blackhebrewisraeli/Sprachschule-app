import {
  BORDER,
  COLORS,
  FONTS,
  FONT_SIZE,
  FONT_WEIGHT,
  RADIUS,
  SPACE,
  TRANSITION,
} from '../../lib/theme';
import { TRANSLATE_MODES } from './scaffold';

/**
 * How much help the learner wants for the current sentence — word bank, choose
 * the word, type the word, or free typing — as one segmented track, so every
 * option is visible at once instead of hidden behind a native select.
 *
 * Pressed buttons in a labelled <fieldset> (a native group, which Sonar prefers
 * to role="group"), the same pressed-button contract SegmentedPicker uses;
 * `data-ui` gives each one the app's focus ring. On a phone the track is a 2×2
 * grid rather than four labels squeezed (or wrapped 3+1) into a 320px row.
 *
 * `locked` keeps only free typing available: a row that cannot be scaffolded is
 * always typed, and the other options would change nothing.
 */
export default function ModePicker({ value, onChange, locked = false, mobile = false }) {
  return (
    <fieldset
      aria-label="Input mode"
      style={{
        // A fieldset's default min-inline-size is min-content, which would let
        // four labels push a 320px page wider than the viewport.
        minWidth: 0,
        margin: 0,
        marginBottom: SPACE[4],
        display: 'grid',
        gridTemplateColumns: `repeat(${mobile ? 2 : TRANSLATE_MODES.length}, minmax(0, 1fr))`,
        gap: SPACE[1],
        padding: SPACE[1],
        background: COLORS.paperDeep,
        border: BORDER.panel,
        borderRadius: RADIUS.lg,
      }}
    >
      {TRANSLATE_MODES.map((m) => {
        const active = m.key === value;
        const disabled = locked && !active;
        return (
          <button
            key={m.key}
            type="button"
            data-ui="button"
            aria-pressed={active}
            disabled={disabled}
            onClick={() => !active && onChange(m.key)}
            style={{
              minWidth: 0,
              border: 'none',
              borderRadius: RADIUS.md,
              padding: `${SPACE[2]}px ${SPACE[3]}px`,
              background: active ? COLORS.surface : 'transparent',
              boxShadow: active ? `0 1px 3px ${COLORS.inkA20}` : 'none',
              color: active ? COLORS.ink : COLORS.inkSoft,
              fontFamily: FONTS.body,
              fontSize: FONT_SIZE.base,
              fontWeight: active ? FONT_WEIGHT.bold : FONT_WEIGHT.medium,
              lineHeight: 1.25,
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.45 : 1,
              transition: TRANSITION.fast,
            }}
          >
            {m.label}
          </button>
        );
      })}
    </fieldset>
  );
}
