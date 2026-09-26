import {
  COLORS,
  FONTS,
  FONT_SIZE,
  FONT_WEIGHT,
  LETTER_SPACING,
  RADIUS,
  SPACE,
  TRANSITION,
} from '../../lib/theme';

const SEGMENT_HEIGHT = 6;

// 'current' | 'correct' | 'missed' | 'ahead' for segment `i` when `idx` is on screen.
function segmentState(i, idx, correctAt) {
  if (i === idx) return 'current';
  if (i > idx) return 'ahead';
  return correctAt.has(i) ? 'correct' : 'missed';
}

const SEGMENT_COLOR = {
  current: COLORS.ink,
  ahead: COLORS.track,
  correct: COLORS.gold,
  missed: COLORS.mute,
};

// Where the learner is in the set of ten, above each exercise: the level, the
// position in words, how many landed, and one segment per sentence — gold for
// a sentence answered right, muted for one missed or skipped, ink for the one
// on screen. The segments are decoration for the sentence beside them, so they
// stay out of the accessibility tree.
//
// `aside` is the report-a-problem flag, kept on the header's baseline.
export default function ExerciseHeader({ level, idx, total, correctAt = new Set(), aside = null }) {
  const right = [...correctAt].filter((i) => i < idx).length;
  return (
    <div style={{ marginBottom: SPACE[5] }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: SPACE[3],
          minWidth: 0,
          marginBottom: SPACE[3],
        }}
      >
        <span
          data-testid="translate-level"
          style={{
            flexShrink: 0,
            fontFamily: FONTS.mono,
            fontSize: FONT_SIZE.ipa,
            fontWeight: FONT_WEIGHT.bold,
            letterSpacing: LETTER_SPACING.wide,
            lineHeight: 1,
            padding: `${SPACE[1]}px ${SPACE[2]}px`,
            borderRadius: RADIUS.pill,
            background: COLORS.ink,
            color: COLORS.paper,
          }}
        >
          {level.toUpperCase()}
        </span>
        <span
          style={{
            flex: '1 1 auto',
            minWidth: 0,
            fontFamily: FONTS.body,
            fontSize: FONT_SIZE.base,
            fontWeight: FONT_WEIGHT.semibold,
            color: COLORS.ink,
          }}
        >
          Exercise {idx + 1} of {total}
        </span>
        {idx > 0 ? (
          <span
            style={{
              flexShrink: 0,
              fontFamily: FONTS.body,
              fontSize: FONT_SIZE.sm,
              color: COLORS.inkSoft,
            }}
          >
            {right} correct
          </span>
        ) : null}
        {aside}
      </div>
      <div
        aria-hidden="true"
        data-testid="translate-progress"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))`,
          gap: SPACE[1],
        }}
      >
        {Array.from({ length: total }, (_, i) => {
          const state = segmentState(i, idx, correctAt);
          return (
            <span
              key={i}
              data-state={state}
              style={{
                height: SEGMENT_HEIGHT,
                borderRadius: RADIUS.pill,
                background: SEGMENT_COLOR[state],
                transition: TRANSITION.slow,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
