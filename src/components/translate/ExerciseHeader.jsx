import { COLORS, FONTS, FONT_SIZE, LETTER_SPACING, SPACE } from '../../lib/theme';

// The "A1 — WORD TILES · Exercise 3 / 10" header above each exercise. `label`
// is the input mode on screen (translate/scaffold.js), whose captions reuse
// LEVEL_MODES so a level's default reads the same here as in the switchers.
export default function ExerciseHeader({ level, label, idx, total }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: SPACE[4],
      }}
    >
      <span
        style={{
          fontFamily: FONTS.mono,
          fontSize: FONT_SIZE.tag,
          letterSpacing: LETTER_SPACING.caps,
          color: COLORS.red,
          textTransform: 'uppercase',
        }}
      >
        {label ? `${level.toUpperCase()} — ${label.toUpperCase()}` : ''}
      </span>
      <span
        style={{
          fontFamily: FONTS.mono,
          fontSize: FONT_SIZE.tag,
          letterSpacing: LETTER_SPACING.wider,
          color: COLORS.mute,
        }}
      >
        Exercise {idx + 1} / {total}
      </span>
    </div>
  );
}
