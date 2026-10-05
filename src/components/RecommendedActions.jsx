import { BORDER, COLORS, FONTS, FONT_SIZE, FONT_WEIGHT, RADIUS, SPACE } from '../lib/theme';
import { Grid, Row, Stack } from './ui/Layout';
import InteractiveCard from './ui/InteractiveCard';
import Heading from './ui/Heading';
import TaskIcon from './ui/TaskIcon';
import { activePack } from '../packs';
import { resolveRecommended } from './resolveRecommended';

// Two next-action cards inside the Home identity card.
//
// They sit in PersonalHub's recommended slot — same Surface as identity and
// today's boards, not an orphan section under it. Elevation, type, and
// contrast are stronger than the mission/quest rows on purpose: these are the
// hop a returning learner should take now. Pack fallbacks keep the layout
// from collapsing on a quiet day.
//
// The icon sits in a medallion BESIDE the copy, centred on it, not on a line
// of its own above it. Stacked, every card opened with a lone glyph pinned to
// its top-left corner — two of them side by side on desktop read as clutter
// along the top edge rather than as part of each card. Beside the copy the
// card is also a line shorter, which buys back an even SPACE[4] inset.
const MEDALLION = 40;

export default function RecommendedActions({ missions = [], classifiedLevel, onGo }) {
  const chrome = activePack.content.homeChrome ?? {};
  const tabNames = activePack.content.missionsChrome?.tabNames ?? {};
  const { cards } = resolveRecommended(missions, 2, { classifiedLevel });
  if (cards.length === 0) return null;

  return (
    <section aria-labelledby="recommended-heading">
      <Heading id="recommended-heading" level={3} style={{ marginBottom: SPACE[3] }}>
        {chrome.recommendedHeading}
      </Heading>
      <Grid columns="auto-fit" min={160} gap={2}>
        {cards.map((card) => {
          const destination = tabNames[card.tab] ?? card.tab;
          return (
            <InteractiveCard
              key={card.id}
              elevation={2}
              onClick={() => onGo?.(card.tab, card.mission)}
              aria-label={card.text}
              style={{ padding: SPACE[4] }}
            >
              <Row gap={3} wrap={false} data-recommended-row="">
                <span
                  aria-hidden="true"
                  style={{
                    flexShrink: 0,
                    width: MEDALLION,
                    height: MEDALLION,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: RADIUS.md,
                    background: COLORS.paper,
                    border: BORDER.panel,
                    color: COLORS.ink,
                  }}
                >
                  <TaskIcon name={card.icon} size={22} />
                </span>
                <Stack gap={1} style={{ flex: 1 }}>
                  <span
                    data-recommended-title=""
                    style={{
                      fontFamily: FONTS.body,
                      fontSize: FONT_SIZE.lg,
                      fontWeight: FONT_WEIGHT.bold,
                      color: COLORS.ink,
                      overflowWrap: 'anywhere',
                      minWidth: 0,
                      lineHeight: 1.3,
                    }}
                  >
                    {card.text}
                  </span>
                  {destination && (
                    <span
                      style={{
                        fontFamily: FONTS.body,
                        fontSize: FONT_SIZE.sm,
                        color: COLORS.inkSoft,
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {destination} →
                    </span>
                  )}
                </Stack>
              </Row>
            </InteractiveCard>
          );
        })}
      </Grid>
    </section>
  );
}
