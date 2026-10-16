import { COLORS, FONTS, FONT_SIZE, FONT_WEIGHT, RADIUS, SHADOW, SPACE } from '../../lib/theme';
import Button from '../ui/Button';
import Confetti from '../ui/Confetti';

/**
 * The whole completion screen, never a banner over the library: the result,
 * then exactly two ways on — the same deck again, or back to the decks.
 *
 * @param {{ learnedCount: number, onPracticeAgain: () => void, onBack: () => void,
 *           headingId?: string }} props
 */
export default function DeckCompleteBanner({ learnedCount, onPracticeAgain, onBack, headingId }) {
  return (
    <div
      className="slide-up pop"
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(90deg, ${COLORS.gold} 0%, ${COLORS.goldBright} 50%, ${COLORS.gold} 100%)`,
        backgroundSize: '200% auto',
        animation: 'shimmer 2s linear infinite',
        borderRadius: RADIUS.lg,
        boxShadow: SHADOW.card,
        padding: '16px 20px',
        marginBottom: 16,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: SPACE[4],
        textAlign: 'center',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <Confetti />
      {/* The screen's h1, and where focus lands when the last card is
          answered — the control that was pressed has just unmounted. */}
      <h1
        id={headingId}
        tabIndex={-1}
        style={{
          margin: 0,
          fontFamily: FONTS.display,
          fontSize: FONT_SIZE.xl,
          fontWeight: FONT_WEIGHT.bold,
          // The fill's paired ink. COLORS.ink turns light in dark mode, which
          // left this heading near-invisible on the gold.
          color: COLORS.accentOn,
          textAlign: 'center',
        }}
      >
        Deck complete — {learnedCount} {learnedCount === 1 ? 'word' : 'words'} learned
      </h1>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: SPACE[3] }}>
        <Button variant="primary" onClick={onPracticeAgain}>
          Practice again
        </Button>
        <Button variant="secondary" onClick={onBack}>
          Back to decks
        </Button>
      </div>
    </div>
  );
}
