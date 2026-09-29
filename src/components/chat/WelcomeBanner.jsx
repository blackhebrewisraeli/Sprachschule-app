import {
  COLORS,
  FONT_MONO,
  FONT_BODY,
  FONT_SIZE,
  LETTER_SPACING,
  SPACE,
  RADIUS,
  SHADOW,
} from '../../lib/theme';
import { activePack } from '../../packs';

// One-time first-visit banner explaining the exercise model. Dismissal is
// persisted by the parent (localStorage flag) via onDismiss.
export default function WelcomeBanner({ mobile, onDismiss }) {
  return (
    <div
      style={{
        borderRadius: RADIUS.lg,
        boxShadow: SHADOW.bar,
        // The info plane, not COLORS.ink. Ink-as-fill is what the user's chat
        // bubble, the active nav tab, toasts and every primary button are
        // painted with, so this banner — the one panel here that explains
        // rather than does — was wearing the uniform of the things that act.
        background: COLORS.info,
        color: COLORS.infoOn,
        padding: mobile ? SPACE[4] : SPACE[5],
        marginBottom: mobile ? SPACE[4] : SPACE[6],
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        gap: SPACE[4],
        alignItems: 'center',
      }}
    >
      <div>
        <div
          style={{
            display: 'inline-block',
            fontFamily: FONT_MONO,
            fontSize: FONT_SIZE.tag,
            letterSpacing: LETTER_SPACING.caps,
            // Gold as foreground on the inverted ink chip fails in dark mode
            // (ink flips to light). Keep gold as a fill with accentOn on top.
            background: COLORS.gold,
            color: COLORS.accentOn,
            padding: `2px ${SPACE[2]}px`,
            borderRadius: RADIUS.sm,
            marginBottom: SPACE[2],
          }}
        >
          WILLKOMMEN
        </div>
        <div
          style={{
            fontFamily: FONT_BODY,
            fontSize: mobile ? FONT_SIZE.base : FONT_SIZE.md,
            lineHeight: 1.5,
          }}
        >
          {activePack.prompts.persona} gives you a task each round — order a coffee, introduce
          yourself, ask for directions. Type or tap the mic, and she'll correct you in real time.
          {/* Tabs by NAME, not number. This said "Tabs 02–04 … 05 Stats",
              which went stale twice: Home took 01 and pushed every tab along
              one, and Stats was renamed Profile. Below bp.tablet the nav is
              icon-only, so the numbers were never on screen for most readers
              anyway. */}{' '}
          <strong>Alphabet</strong>, <strong>Vocab</strong> and <strong>Translate</strong> add
          letter drills, vocab cards and translation exercises; <strong>Profile</strong> tracks what
          you&rsquo;ve learned and surfaces what to review.
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        style={{
          background: 'transparent',
          // Both from the plane's own ink: COLORS.paper is the page ground and
          // renders near-black on indigo in dark mode, which is how an outline
          // button disappears into its own container.
          border: `2px solid ${COLORS.infoOn}`,
          borderRadius: RADIUS.md,
          color: COLORS.infoOn,
          fontFamily: FONT_MONO,
          fontWeight: 700,
          fontSize: FONT_SIZE.tag,
          letterSpacing: LETTER_SPACING.widest,
          padding: `${SPACE[2]}px ${SPACE[4]}px`,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          alignSelf: mobile ? 'start' : 'center',
        }}
      >
        GOT IT →
      </button>
    </div>
  );
}
