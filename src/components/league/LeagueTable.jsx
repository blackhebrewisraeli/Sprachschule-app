import { useId } from 'react';
import { Trophy, UserPlus } from 'lucide-react';
import {
  BORDER,
  COLORS,
  FONTS,
  FONT_SIZE,
  FONT_WEIGHT,
  LETTER_SPACING,
  LINE_HEIGHT,
  OPACITY,
  RADIUS,
  SPACE,
} from '../../lib/theme';
import Avatar from '../ui/Avatar';
import Heading from '../ui/Heading';
import { LEAGUE_ROW_COLUMNS, leagueCopy, leagueDisplayName, leagueXpLabel } from './leagueFormat';

// The ONE league table design, shared by Home's three-row preview and the full
// Profile standings.
//
// The two used to be drawn separately and had drifted apart: Home had rank
// bubbles, avatars and a gold podium row on a recessed panel, while Profile
// printed "1. handle   30 XP" as plain text in a padded div. Same league, same
// learners, two unrelated pictures of it. Both now render these rows, so a
// change to how a place looks lands on both surfaces at once. The non-visual
// half — column grid, copy, what a row may print — is in ./leagueFormat.
const RANK_SIZE = 24;
const AVATAR_SIZE = 28;

const TRUNCATE = {
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const XP_TEXT = {
  flexShrink: 0,
  whiteSpace: 'nowrap',
  fontFamily: FONTS.mono,
  fontSize: FONT_SIZE.ipa,
  fontWeight: FONT_WEIGHT.bold,
  color: COLORS.inkSoft,
};

/**
 * The grid every row shares — filled, empty, static or pressable — so the rank,
 * avatar, name and XP columns line up down the whole table whatever each row
 * is. The 1px border is always present (transparent unless it means something)
 * so highlighting a row never shifts its neighbours by a pixel.
 */
function rowFrame({ rank, isMe = false, empty = false }) {
  let background = 'transparent';
  if (!empty && rank === 1) background = COLORS.goldSoft;
  else if (isMe) background = COLORS.surface;

  let border = '1px solid transparent';
  if (empty) border = BORDER.panelDashed;
  else if (isMe) border = `1px solid ${COLORS.borderStrong}`;

  return {
    display: 'grid',
    gridTemplateColumns: LEAGUE_ROW_COLUMNS,
    alignItems: 'center',
    gap: SPACE[2],
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    boxSizing: 'border-box',
    padding: `${SPACE[1]}px ${SPACE[2]}px`,
    borderRadius: RADIUS.md,
    border,
    background,
  };
}

function RankBubble({ rank, empty = false }) {
  const first = rank === 1 && !empty;
  let background = COLORS.surface;
  if (empty) background = 'transparent';
  else if (first) background = COLORS.gold;

  let color = COLORS.inkSoft;
  if (empty) color = COLORS.mute;
  else if (first) color = COLORS.accentOn;

  return (
    <span
      aria-label={`Rank ${rank}`}
      style={{
        display: 'grid',
        placeItems: 'center',
        width: RANK_SIZE,
        height: RANK_SIZE,
        boxSizing: 'border-box',
        borderRadius: RADIUS.pill,
        border: empty ? BORDER.panelDashed : 'none',
        background,
        color,
        fontFamily: FONTS.mono,
        fontSize: FONT_SIZE.ipa,
        fontWeight: FONT_WEIGHT.bold,
        lineHeight: 1,
      }}
    >
      {rank}
    </span>
  );
}

function YouTag({ copy }) {
  return (
    <span
      data-testid="league-row-you"
      style={{
        flexShrink: 0,
        fontFamily: FONTS.mono,
        fontSize: FONT_SIZE.label,
        fontWeight: FONT_WEIGHT.bold,
        letterSpacing: LETTER_SPACING.wider,
        textTransform: 'uppercase',
        lineHeight: 1,
        padding: `2px ${SPACE[1]}px`,
        borderRadius: RADIUS.pill,
        background: COLORS.ink,
        color: COLORS.paper,
      }}
    >
      {copy.leaderboardYou ?? 'You'}
    </span>
  );
}

function RowCells({ rank, member, isMe, copy }) {
  const name = leagueDisplayName(member, copy);
  return (
    <>
      <RankBubble rank={rank} />
      <Avatar profile={member.profile} userId={member.user_id} size={AVATAR_SIZE} />
      <span style={{ display: 'flex', alignItems: 'center', gap: SPACE[2], minWidth: 0 }}>
        <span
          title={name}
          style={{
            ...TRUNCATE,
            fontFamily: FONTS.body,
            fontSize: FONT_SIZE.base,
            fontWeight: rank === 1 || isMe ? FONT_WEIGHT.bold : FONT_WEIGHT.medium,
            color: COLORS.ink,
          }}
        >
          {name}
        </span>
        {isMe ? <YouTag copy={copy} /> : null}
      </span>
      {/* Full ink on the gold podium row. The subtle ink every other row uses
          measured 2.37:1 on dark mode's goldSoft — the podium fill is a mid
          tone there, not a tint. */}
      <span style={{ ...XP_TEXT, color: rank === 1 ? COLORS.ink : COLORS.inkSoft }}>
        {leagueXpLabel(member.weekly_xp, copy)}
      </span>
    </>
  );
}

/**
 * One filled place in the table.
 *
 * Static by default — Home's hub renders nothing interactive. Pass `onSelect`
 * and the row becomes a real `<button>` filling its list item, which is what
 * puts it in the tab order and gives it Enter AND Space for free; a clickable
 * `<li>` is invisible to the keyboard.
 */
export function LeagueRow({ rank, member, isMe = false, onSelect, copy = leagueCopy() }) {
  const frame = rowFrame({ rank, isMe });
  const cells = <RowCells rank={rank} member={member} isMe={isMe} copy={copy} />;

  if (!onSelect) {
    return (
      <li data-league-slot="member" data-me={isMe ? '' : undefined} style={frame}>
        {cells}
      </li>
    );
  }

  const name = leagueDisplayName(member, copy);
  const you = isMe ? ` (${copy.leaderboardYou ?? 'You'})` : '';
  return (
    <li data-league-slot="member" data-me={isMe ? '' : undefined} style={{ padding: 0 }}>
      <button
        type="button"
        // The app's one focus ring, from injectGlobalStyles. Inset because the
        // rows are full-bleed inside the panel: an outset ring is clipped by
        // the container edge and overlaps the neighbouring row.
        data-ui="button"
        data-focus-inset=""
        aria-label={`Rank ${rank}: ${name}${you}, ${leagueXpLabel(member.weekly_xp, copy)}`}
        onClick={onSelect}
        style={{
          ...frame,
          textAlign: 'left',
          font: 'inherit',
          color: COLORS.ink,
          cursor: 'pointer',
        }}
      >
        {cells}
      </button>
    </li>
  );
}

/**
 * A place nobody holds yet. Drawn in the same grid as a filled row, so an open
 * seat reads as part of the table rather than as a gap in it: a dashed outline
 * where the row's edge would be, a dashed circle where the avatar would be.
 */
export function LeagueEmptyRow({ rank, copy = leagueCopy() }) {
  return (
    <li data-league-slot="empty" style={rowFrame({ rank, empty: true })}>
      <RankBubble rank={rank} empty />
      <span
        aria-hidden="true"
        style={{
          display: 'grid',
          placeItems: 'center',
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          boxSizing: 'border-box',
          borderRadius: RADIUS.pill,
          border: BORDER.panelDashed,
          color: COLORS.mute,
        }}
      >
        <UserPlus size={FONT_SIZE.base} />
      </span>
      <span
        style={{
          ...TRUNCATE,
          fontFamily: FONTS.body,
          fontSize: FONT_SIZE.base,
          fontStyle: 'italic',
          color: COLORS.mute,
        }}
      >
        {copy.leaderboardEmptySlot ?? 'Open spot'}
      </span>
      <span aria-hidden="true" style={{ ...XP_TEXT, color: COLORS.mute }}>
        —
      </span>
    </li>
  );
}

/**
 * A labelled rule between two parts of the table: the promotion and relegation
 * cut-offs, and where the open seats begin. Decorative — the rows carry the
 * information — so it stays out of the list's item count.
 *
 * The zone colour is on the rules and the arrow, NOT on the label. The label
 * sits on the recessed panel (paperDeep), where success green measured 4.32:1
 * in light mode — under the 4.5:1 text floor the rendered-contrast audit holds.
 * It was legible only while the list sat directly on the page ground. The
 * label now uses the subtle ink every panel caption uses, and the green and red
 * go to the non-text marks, which need 3:1.
 */
export function LeagueDivider({ text, color = COLORS.mute, icon: Icon = null }) {
  const rule = { flex: '1 1 0', height: 1, background: color, opacity: OPACITY.dim };
  return (
    <li
      aria-hidden="true"
      data-league-divider=""
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SPACE[2],
        margin: `${SPACE[1]}px 0`,
        padding: `0 ${SPACE[2]}px`,
        fontFamily: FONTS.mono,
        fontSize: FONT_SIZE.tag,
        fontWeight: FONT_WEIGHT.bold,
        letterSpacing: LETTER_SPACING.wide,
        textTransform: 'uppercase',
        color: COLORS.inkSoft,
      }}
    >
      <span style={rule} />
      <span style={{ display: 'flex', alignItems: 'center', gap: SPACE[1], flexShrink: 0 }}>
        {Icon ? <Icon size={FONT_SIZE.sm} color={color} strokeWidth={2.5} /> : null}
        {text}
      </span>
      <span style={rule} />
    </li>
  );
}

/**
 * The recessed panel both tables sit on: trophy + title on the left, an
 * optional fact on the right (Home: your place; Profile: the countdown), then
 * the ordered list of rows.
 */
export function LeaguePanel({
  title,
  aside = null,
  listLabel,
  testId,
  padding = SPACE[2],
  footer = null,
  children,
}) {
  const headingId = useId();
  return (
    <section
      data-testid={testId}
      aria-labelledby={headingId}
      style={{
        width: '100%',
        maxWidth: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        padding,
        background: COLORS.paperDeep,
        border: BORDER.panel,
        borderRadius: RADIUS.lg,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: SPACE[2],
          minWidth: 0,
          marginBottom: SPACE[2],
          paddingInline: SPACE[1],
        }}
      >
        <Trophy size={FONT_SIZE.md} color={COLORS.goldDeep} aria-hidden="true" />
        <Heading
          id={headingId}
          level={3}
          size="sm"
          style={{ lineHeight: LINE_HEIGHT.tight, flex: '1 1 auto', minWidth: 0 }}
        >
          {title}
        </Heading>
        {aside ? (
          <span
            data-testid="league-panel-aside"
            style={{
              flexShrink: 0,
              whiteSpace: 'nowrap',
              fontFamily: FONTS.mono,
              fontSize: FONT_SIZE.ipa,
              fontWeight: FONT_WEIGHT.bold,
              color: COLORS.mute,
            }}
          >
            {aside}
          </span>
        ) : null}
      </div>

      <ol
        aria-label={listLabel}
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          minWidth: 0,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: SPACE[1],
        }}
      >
        {children}
      </ol>
      {footer}
    </section>
  );
}
