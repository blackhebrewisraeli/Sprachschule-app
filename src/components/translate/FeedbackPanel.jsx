import { ArrowRight } from 'lucide-react';
import {
  COLORS,
  FONTS,
  FONT_SIZE,
  FONT_WEIGHT,
  SPACE,
  RADIUS,
  SHADOW,
  BUTTON,
} from '../../lib/theme';

// Three-way result panel shown after an answer: correct (gold) / almost
// (paperDeep) / wrong (red). Shows the canonical answer when not fully correct.
// xp + mult: when provided and verdict is correct/almost, shows a +N XP ×M🔥
// flourish (mult badge omitted when mult === 1).
//
// Gold fill needs accentOn; mode-flipping ink fails on gold in dark mode.
// Anything that is not correct/almost reads as wrong.
const VERDICT_LOOK = {
  correct: { bg: COLORS.gold, fg: COLORS.accentOn, label: '✓ Correct' },
  almost: { bg: COLORS.paperDeep, fg: COLORS.ink, label: '≈ Almost' },
  wrong: { bg: COLORS.red, fg: COLORS.paper, label: '✗ Not quite' },
};

export default function FeedbackPanel({ verdict, correctText, note, xp, mult, onNext }) {
  const isCorrect = verdict === 'correct';
  const isAlmost = verdict === 'almost';
  const { bg, fg, label } = VERDICT_LOOK[verdict] ?? VERDICT_LOOK.wrong;
  const showCorrectText = !isCorrect && correctText;
  const showFlourish = (isCorrect || isAlmost) && xp > 0;
  return (
    <div
      className={verdict === 'wrong' ? 'wiggle' : 'pop'}
      style={{
        borderRadius: RADIUS.lg,
        boxShadow: SHADOW.card,
        background: bg,
        color: fg,
        padding: SPACE[6],
        marginTop: SPACE[4],
      }}
    >
      <div
        style={{
          fontFamily: FONTS.body,
          fontSize: FONT_SIZE.lg,
          fontWeight: FONT_WEIGHT.bold,
          marginBottom: SPACE[2],
        }}
      >
        {label}
      </div>
      {showFlourish && (
        <div
          style={{
            fontFamily: FONTS.mono,
            fontSize: FONT_SIZE.sm,
            fontWeight: FONT_WEIGHT.bold,
            opacity: 0.8,
            marginBottom: SPACE[2],
          }}
        >
          +{xp} XP{mult > 1 ? ` ×${mult}🔥` : ''}
        </div>
      )}
      {showCorrectText && (
        <div
          lang="de"
          style={{
            fontFamily: FONTS.display,
            fontSize: FONT_SIZE['3xl'],
            fontWeight: FONT_WEIGHT.medium,
            lineHeight: 1.25,
            overflowWrap: 'anywhere',
            marginBottom: SPACE[3],
          }}
        >
          {correctText}
        </div>
      )}
      {note && (
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: FONT_SIZE.md,
            lineHeight: 1.5,
            opacity: 0.85,
            marginBottom: SPACE[4],
          }}
        >
          {note}
        </div>
      )}
      <button
        type="button"
        onClick={onNext}
        aria-label="Next exercise"
        style={{
          ...BUTTON.primary,
          background: isCorrect ? COLORS.accentOn : COLORS.paper,
          color: isCorrect ? COLORS.gold : COLORS.ink,
        }}
      >
        NEXT EXERCISE <ArrowRight size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
