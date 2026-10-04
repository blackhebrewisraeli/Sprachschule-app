import { Flame } from 'lucide-react';
import { COLORS, FONTS, FONT_SIZE, LETTER_SPACING, SPACE, RADIUS, BORDER } from '../../lib/theme';

// Slim in-play strip: current streak + today's XP filling toward the daily goal.
// Shown above the exercise tabs so the goal climb lives where you play.
export default function GoalStrip({ streak, current, target, mult = 1 }) {
  const pct = target > 0 ? Math.min(1, current / target) : 0;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SPACE[3],
        padding: `${SPACE[2]}px ${SPACE[3]}px`,
        marginBottom: SPACE[4],
        background: COLORS.paperDeep,
        border: BORDER.standard,
        borderRadius: RADIUS.lg,
        fontFamily: FONTS.mono,
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          color: COLORS.red,
          fontWeight: 700,
        }}
      >
        <Flame size={14} aria-hidden="true" /> {streak}
        {mult > 1 && <span style={{ marginLeft: 6, color: COLORS.accentFg }}>×{mult}</span>}
      </span>
      <div
        style={{
          flex: 1,
          height: 6,
          background: COLORS.card,
          borderRadius: RADIUS.pill,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct * 100}%`,
            background: pct >= 1 ? COLORS.green : COLORS.gold,
            transition: 'width 0.4s ease',
          }}
        />
      </div>
      <span
        style={{ fontSize: FONT_SIZE.tag, letterSpacing: LETTER_SPACING.wide, color: COLORS.mute }}
      >
        {current} / {target} XP
      </span>
    </div>
  );
}
