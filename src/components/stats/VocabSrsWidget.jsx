import {
  COLORS,
  FONTS,
  FONT_SIZE,
  FONT_WEIGHT,
  LETTER_SPACING,
  SPACE,
  RADIUS,
  BORDER,
} from '../../lib/theme';
import { getDueCount, getNewCount, getMasteredCount, srsKey, MASTERED_BOX } from '../../lib/srs';
import { activePack } from '../../packs';
const { decks: PRESET_DECKS } = activePack.content;

const DECK_LABELS = {
  greetings: 'Greetings',
  food: 'Food & Drink',
  travel: 'Travel',
  numbers: 'Numbers',
};

// Section F — SRS overview: due-now count, mastered progress, per-deck bars.
//
// DUE and NEW are shown apart, never summed. DUE NOW is reviews actually owed —
// the only figure allowed to turn red. Cards nobody has studied yet are labelled
// "new": a brand-new learner used to open this card to a red DUE NOW 40 and
// "10 due" on every deck before answering anything.
export default function VocabSrsWidget({ srs, now }) {
  const dueTotal = getDueCount(srs, PRESET_DECKS, now);
  const newTotal = getNewCount(srs, PRESET_DECKS);
  const masteredTotal = getMasteredCount(srs);
  const cardTotal = Object.values(PRESET_DECKS).reduce((sum, deck) => sum + deck.length, 0);

  return (
    <div>
      <div
        data-testid="vocab-srs-summary"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(48px, auto) minmax(0, 1fr)',
          gap: SPACE[2],
          alignItems: 'center',
          paddingBottom: SPACE[2],
          marginBottom: SPACE[2],
          borderBottom: BORDER.panel,
          minWidth: 0,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: FONTS.mono,
              fontSize: FONT_SIZE.tag,
              letterSpacing: LETTER_SPACING.caps,
              color: COLORS.mute,
              marginBottom: SPACE[1],
            }}
          >
            DUE NOW
          </div>
          <div
            data-testid="vocab-due-now"
            style={{
              fontFamily: FONTS.display,
              fontSize: FONT_SIZE['3xl'],
              fontWeight: FONT_WEIGHT.black,
              letterSpacing: LETTER_SPACING.tight,
              lineHeight: 1,
              color: dueTotal > 0 ? COLORS.red : COLORS.ink,
            }}
          >
            {dueTotal}
          </div>
          <div
            style={{
              fontFamily: FONTS.body,
              fontStyle: 'italic',
              fontSize: FONT_SIZE.tag,
              color: COLORS.mute,
              marginTop: SPACE[1],
            }}
          >
            card{dueTotal === 1 ? '' : 's'}
          </div>
        </div>

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: FONTS.mono,
              fontSize: FONT_SIZE.tag,
              letterSpacing: LETTER_SPACING.caps,
              color: COLORS.mute,
              marginBottom: SPACE[1],
            }}
          >
            MASTERED · {masteredTotal} OF {cardTotal}
          </div>
          <div
            data-testid="vocab-mastered-track"
            style={{
              height: 6,
              borderRadius: RADIUS.pill,
              background: COLORS.paperDeep,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${cardTotal === 0 ? 0 : (masteredTotal / cardTotal) * 100}%`,
                height: '100%',
                background: COLORS.gold,
                transition: 'width 0.4s ease',
              }}
            />
          </div>
          {newTotal > 0 && (
            <div
              data-testid="vocab-new-total"
              style={{
                fontFamily: FONTS.body,
                fontStyle: 'italic',
                fontSize: FONT_SIZE.tag,
                color: COLORS.mute,
                marginTop: SPACE[1],
              }}
            >
              {newTotal} new card{newTotal === 1 ? '' : 's'} to learn
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[2] }}>
        {Object.keys(PRESET_DECKS).map((deckId) => {
          const deck = PRESET_DECKS[deckId];
          let mastered = 0;
          let due = 0;
          let fresh = 0;
          for (const card of deck) {
            const entry = srs[srsKey(deckId, card.id)];
            if (!entry) {
              fresh += 1;
              continue;
            }
            if (entry.box === MASTERED_BOX) mastered += 1;
            if (entry.nextDue <= now) due += 1;
          }
          const masteredPct = Math.round((mastered / deck.length) * 100);
          return (
            <div key={deckId}>
              <div
                data-testid="vocab-deck-row"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  // A deck partway through reads "3/10 mastered · 2 due · 5 new",
                  // which no longer fits beside the deck name at 320px. Wrap
                  // rather than push the card wider than the viewport.
                  flexWrap: 'wrap',
                  columnGap: SPACE[2],
                  marginBottom: SPACE[1],
                  fontFamily: FONTS.mono,
                  fontSize: FONT_SIZE.tag,
                  color: COLORS.ink,
                }}
              >
                <span style={{ letterSpacing: LETTER_SPACING.caps }}>
                  {DECK_LABELS[deckId]?.toUpperCase() ?? deckId.toUpperCase()}
                </span>
                {/* marginLeft auto keeps the counts flush right when the row
                    wraps; space-between alone drops a wrapped item to the left
                    edge, out of line with every row that did not wrap. */}
                <span
                  data-testid="vocab-deck-counts"
                  style={{ color: COLORS.mute, marginLeft: 'auto', textAlign: 'right' }}
                >
                  {mastered}/{deck.length} mastered{due > 0 ? ` · ${due} due` : ''}
                  {fresh > 0 ? ` · ${fresh} new` : ''}
                </span>
              </div>
              <div
                data-testid="vocab-deck-track"
                style={{
                  height: 5,
                  borderRadius: RADIUS.pill,
                  background: COLORS.paperDeep,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${masteredPct}%`,
                    height: '100%',
                    background: COLORS.gold,
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
