import { ACHIEVEMENTS } from '../../lib/gamification';
import { Award } from 'lucide-react';
import {
  BORDER,
  COLORS,
  FONTS,
  FONT_SIZE,
  FONT_WEIGHT,
  LINE_HEIGHT,
  RADIUS,
  SPACE,
} from '../../lib/theme';
import StatusNote from '../ui/StatusNote';
import BadgeIcon from './BadgeIcon';
import { activePack } from '../../packs';

/**
 * Tile floor, and the one number here that is a LAYOUT decision rather than a
 * style value — so it is a named constant, not a token.
 *
 * It was measured, not chosen. At 140px the grid could fit only ONE column
 * inside the 288px content box a 320px viewport leaves (140 × 2 + 12 gap = 292
 * > 288), so fifteen badges stacked into a 1758px wall — more than two phone
 * screens for a section meant to be glanceable. 104px fits two columns at
 * 320px and three at 375px, taking those to 751px and 547px.
 */
const MIN_TILE = 104;

/**
 * The drawn medal's size inside a tile. Large enough that a ribbon number
 * reads at a glance, small enough that two tiles still fit at 320px.
 */
const MEDAL = 56;

/**
 * The badges a learner has EARNED, as tiles — each a drawn medal (BadgeIcon)
 * over its name. They were emoji until the medal set replaced them: an emoji
 * is whatever the OS font draws, so the wall never looked like one set.
 *
 * Locked badges are not rendered:
 * a wall of fifteen dashed outlines with one filled tile read as clutter, not
 * as a goal. Nothing earned yet shows an empty state instead of an empty grid.
 *
 * `achievements` is the persisted `{ id: unlockedTs }` map.
 *
 * Every visual value comes from a token (FONT_SIZE, FONT_WEIGHT, LINE_HEIGHT,
 * BORDER, COLORS, SPACE) — no literals. No drop shadow: SHADOW.card on every
 * tile turned the grid into floating slabs; a hairline draws the same boundary.
 */
export default function BadgeGrid({ achievements }) {
  const earned = ACHIEVEMENTS.filter((a) => achievements?.[a.id]);
  if (earned.length === 0) {
    return (
      <StatusNote tone="empty" icon={Award}>
        No badges yet — keep practising to earn your first.
      </StatusNote>
    );
  }
  return (
    // A real list, so a screen reader announces how many badges there are.
    <ul
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${MIN_TILE}px, 1fr))`,
        gap: SPACE[2],
        minWidth: 0,
      }}
    >
      {earned.map((a) => (
        <li
          key={a.id}
          data-badge="earned"
          style={{
            minWidth: 0,
            display: 'grid',
            gap: SPACE[2],
            justifyItems: 'center',
            textAlign: 'center',
            alignContent: 'start',
            padding: `${SPACE[3]}px ${SPACE[2]}px`,
            borderRadius: RADIUS.md,
            background: COLORS.card,
            border: BORDER.panel,
          }}
        >
          <BadgeIcon id={a.id} size={MEDAL} />
          <span
            // Badge names are pack words ("Aufgabenmeister"). Declaring their
            // language lets the browser hyphenate them at a syllable instead of
            // snapping a long compound at whichever letter hits the tile edge.
            lang={activePack.meta?.locale}
            style={{
              minWidth: 0,
              hyphens: 'auto',
              fontFamily: FONTS.display,
              fontSize: FONT_SIZE.base,
              fontWeight: FONT_WEIGHT.semibold,
              lineHeight: LINE_HEIGHT.snug,
              color: COLORS.ink,
              // A two-word badge name wraps inside a 104px tile rather than
              // widening it; `break-word` is the last resort after hyphenation,
              // where `anywhere` let it win over a proper syllable break.
              overflowWrap: 'break-word',
            }}
          >
            {a.name}
          </span>
        </li>
      ))}
    </ul>
  );
}
