import { CARD, COLORS, FONTS, FONT_SIZE, FONT_WEIGHT, SPACE } from '../../lib/theme';

// The English sentence the learner must translate to German — the one large
// thing on the Translate screen. Set in the display serif at reading size so
// the sentence, not the chrome around it, is what the eye lands on. `lang="en"`
// because every other line of German on this screen is the learner's.
export default function PromptCard({ text, mobile = false }) {
  return (
    <div
      style={{
        ...CARD.base,
        padding: mobile ? `${SPACE[5]}px ${SPACE[5]}px` : `${SPACE[6]}px ${SPACE[8]}px`,
        marginBottom: SPACE[5],
      }}
    >
      <p
        style={{
          margin: `0 0 ${SPACE[3]}px`,
          fontFamily: FONTS.body,
          fontSize: FONT_SIZE.sm,
          fontWeight: FONT_WEIGHT.semibold,
          color: COLORS.mute,
        }}
      >
        Translate into German
      </p>
      <p
        lang="en"
        data-testid="translate-prompt"
        style={{
          margin: 0,
          fontFamily: FONTS.display,
          fontSize: mobile ? FONT_SIZE['3xl'] : FONT_SIZE['3xl'] + 8,
          fontWeight: FONT_WEIGHT.medium,
          letterSpacing: '-0.01em',
          lineHeight: 1.2,
          textWrap: 'balance',
          overflowWrap: 'anywhere',
          color: COLORS.ink,
        }}
      >
        {text}
      </p>
    </div>
  );
}
