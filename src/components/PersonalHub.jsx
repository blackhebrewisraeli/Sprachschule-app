import { Flame } from 'lucide-react';
import {
  BORDER,
  COLORS,
  FONTS,
  FONT_SIZE,
  FONT_WEIGHT,
  LETTER_SPACING,
  RADIUS,
  SPACE,
} from '../lib/theme';
import Surface from './ui/Surface';
import { Row, Stack } from './ui/Layout';
import Heading from './ui/Heading';
import { Body, Meta } from './ui/Text';
import { activePack } from '../packs';
import Avatar from './ui/Avatar';
import GoalRing from './gamification/GoalRing';
import LeagueBadge from './league/LeagueBadge';
import LeaderboardWidget from './league/LeaderboardWidget';
import { LEAGUES_ENABLED } from '../lib/leagues.js';
import { useWindowWidth, bp } from '../lib/useWindowWidth';

const EMPTY_SCORE = {
  level: 1,
  rankName: '',
  xpIntoLevel: 0,
  xpToNext: 50,
  progress: 0,
  totalXp: 0,
};

// SPACE[16] is the original hub chip (64). #268 doubled it to 128, which still
// reads as ~10–15% of the card. Desktop grows to 4× the chip so the mark is a
// column, not a header button. Narrow layouts give it an equal track so it
// remains a natural identity anchor instead of collapsing to a thumbnail. A
// long greeting gives way through a two-line clamp below bp.tiny; avatar size
// does not. Never a bare `1fr` — minmax(0, 1fr) is what lets both columns shrink
// below their content instead of pushing the page wide.
const AVATAR_DESKTOP = SPACE[16] * 4;
const IDENTITY_COLUMNS_WIDE = `${AVATAR_DESKTOP}px minmax(0, 1fr)`;
const IDENTITY_COLUMNS_NARROW = 'minmax(0, 1fr) minmax(0, 1fr)';

// Every below-bp.tiny adjustment, looked up once per render rather than
// branched on at each use. Stat tiles take the full row; the level chip stacks
// under the greeting; the greeting clamps to two lines.
const FIT_TINY = {
  tileSpan: '1 / -1',
  headingRowGap: 1,
  headingRowDirection: 'column',
  greetingClamp: {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
    overflow: 'hidden',
  },
  identityGap: SPACE[3],
};
const FIT_REGULAR = {
  tileSpan: undefined,
  headingRowGap: 2,
  headingRowDirection: 'row',
  greetingClamp: {},
  identityGap: SPACE[4],
};

const TRUNCATE = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

// Every layer in the right-hand grid track declares the same boundary. This is
// intentionally stronger than minWidth: 0 alone: width/maxWidth plus border-box
// keep full-width task controls (including their padding and border) inside the
// track. The object is also the append point for a future leaderboard below the
// task stack — it will be another sibling in the same bounded column.
const BOUNDED_COLUMN = {
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
};

const IDENTITY_HEADING_ID = 'home-identity-heading';

// Standing as a grid of equal tiles, not one wrapping flex row. The row put
// ring, XP, level, streak and league into the text column's leftover width,
// and at a narrow viewport — where that column is half the band — the five
// items wrapped at different points and collided. Tiles have fixed tracks, so
// each fact gets its own cell whatever the width. It lives under the avatar
// on wide (that column is otherwise empty below the circle) and full-width
// under the identity band on narrow.
const TILE = {
  display: 'flex',
  alignItems: 'center',
  gap: SPACE[2],
  minWidth: 0,
  padding: SPACE[2],
  border: BORDER.panel,
  borderRadius: RADIUS.md,
  boxSizing: 'border-box',
};
const STAT_VALUE = {
  fontFamily: FONTS.display,
  fontWeight: FONT_WEIGHT.bold,
  fontSize: FONT_SIZE['3xl'],
  lineHeight: 1,
  color: COLORS.ink,
  minWidth: 0,
  maxWidth: '100%',
  overflowWrap: 'anywhere',
};

// A chosen display name is how the app addresses the learner. The handle is
// the unique social identifier and stays visible on its own line; it is only
// a greeting fallback when no display name has been chosen yet.
function greetingName(user, profile) {
  if (!user) return null;
  const displayName = typeof profile?.display_name === 'string' ? profile.display_name.trim() : '';
  return displayName || profile?.handle || user.email?.split('@')[0] || null;
}

function accountLine(profile, copy) {
  const createdAt = profile?.created_at ? new Date(profile.created_at) : null;
  return [
    profile?.handle ? `@${profile.handle}` : null,
    createdAt ? copy.memberSince?.(createdAt) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function XpTile({ totalXp, goalPct, goalMet, tileSpan }) {
  return (
    <div
      data-testid="home-identity-xp"
      aria-label={`${totalXp} XP`}
      style={{
        ...TILE,
        gridColumn: tileSpan,
        flexWrap: 'wrap',
      }}
    >
      <GoalRing pct={goalPct} met={goalMet} size={SPACE[12]} />
      <span
        style={{
          display: 'flex',
          alignItems: 'baseline',
          flex: '1 1 0',
          flexWrap: 'wrap',
          gap: SPACE[1],
          minWidth: 0,
          overflowWrap: 'anywhere',
        }}
      >
        <span data-testid="home-identity-xp-value" style={STAT_VALUE}>
          {totalXp}
        </span>{' '}
        <Meta tone="soft" style={{ letterSpacing: LETTER_SPACING.wider }}>
          XP
        </Meta>
      </span>
    </div>
  );
}

function LevelTile({ level, rankName, tileSpan }) {
  return (
    <div
      data-testid="home-identity-level-group"
      style={{
        ...TILE,
        alignItems: 'baseline',
        gridColumn: tileSpan,
        flexWrap: 'wrap',
        columnGap: SPACE[1],
      }}
    >
      <Meta>Level</Meta>{' '}
      <span data-testid="home-identity-level" style={STAT_VALUE}>
        {level}
      </span>
      {rankName ? (
        <>
          {' · '}
          <Body size="sm" tone="soft" as="span" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
            {rankName}
          </Body>
        </>
      ) : null}
    </div>
  );
}

function StreakTile({ streak }) {
  if (!(streak > 0)) return null;
  return (
    <div aria-label={`Streak ${streak}`} style={{ ...TILE, color: COLORS.gold }}>
      <Flame size={FONT_SIZE.lg} aria-hidden="true" />
      <span
        data-testid="home-identity-streak"
        style={{
          fontFamily: FONTS.mono,
          fontWeight: FONT_WEIGHT.bold,
          fontSize: FONT_SIZE.sm,
          lineHeight: 1,
          color: COLORS.inkSoft,
        }}
      >
        {streak}
      </span>
    </div>
  );
}

// League at a glance. A READ-ONLY badge: `league` comes from
// useLeagueStanding, which deliberately never joins or refreshes — see that
// hook's header for why Home must not write on open. A signed-in learner with
// no membership yet still sees Bronze, because Bronze is the floor everyone
// starts on rather than an unknown. Rank and cohort numbers stay in the
// Profile leaderboard, where their context lives.
function LeagueTile({ user, league }) {
  if (!LEAGUES_ENABLED || !user) return null;
  return (
    <div style={TILE}>
      <LeagueBadge variant="compact" tier={league?.tier} />
    </div>
  );
}

function StandingTiles({ lvl, streak, goalPct, goalMet, user, league, tileSpan }) {
  return (
    <div
      data-testid="home-identity-standing"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gap: SPACE[2],
        minWidth: 0,
      }}
    >
      <XpTile totalXp={lvl.totalXp ?? 0} goalPct={goalPct} goalMet={goalMet} tileSpan={tileSpan} />
      <LevelTile level={lvl.level} rankName={lvl.rankName} tileSpan={tileSpan} />
      <StreakTile streak={streak} />
      <LeagueTile user={user} league={league} />
    </div>
  );
}

function IdentityFacts({ greeting, cefrLevel, copy, fit, wide, user, profile }) {
  const band = String(cefrLevel ?? '').toUpperCase();
  return (
    <Stack gap={1} style={BOUNDED_COLUMN}>
      <Row
        wrap={false}
        align="flex-start"
        gap={fit.headingRowGap}
        style={{
          minWidth: 0,
          // On the narrowest phones the level chip must not take width away
          // from the learner's name. It sits under the greeting instead of
          // turning the heading into a 70px-wide newspaper column.
          flexDirection: fit.headingRowDirection,
        }}
      >
        <Heading
          id={IDENTITY_HEADING_ID}
          level={2}
          title={greeting}
          style={{
            margin: 0,
            overflowWrap: 'anywhere',
            maxWidth: '100%',
            lineHeight: 1.15,
            flex: 1,
            minWidth: 0,
            // Heading level 2 is 24px — same as a section title, smaller
            // than the wordmark. This card's greeting is the identity
            // display line; 4xl matches the masthead without touching
            // Heading's global scale.
            //
            // Narrow steps down to 2xl, and that is not taste. At 320px the
            // half-band avatar plus level chip left the greeting 77px —
            // "Guten Tag" broke as "Gut / en / Tag". Stacking the chip and
            // clamping the smaller display face lets the avatar keep its
            // natural share without letting a long name grow the header.
            fontSize: wide ? FONT_SIZE['4xl'] : FONT_SIZE['2xl'],
            // Two lines preserve the welcome and as much of a long display
            // name as the phone can carry. The full greeting remains the
            // heading's accessible text and is also exposed by `title`.
            ...fit.greetingClamp,
          }}
        >
          {greeting}
        </Heading>
        {/* The band chip beside a 36px greeting. It sat at 10px with the
              widest tracking, which is the recipe for a label you SCAN past —
              this is a fact about the learner and reads as one at 11px. The
              trailing caps tracking is dropped so the glyphs are not pushed
              off-centre inside their own border. */}
        <span
          aria-label={copy.levelLabel?.(band)}
          style={{
            flexShrink: 0,
            fontFamily: FONTS.mono,
            fontSize: FONT_SIZE.ipa,
            fontWeight: FONT_WEIGHT.bold,
            letterSpacing: LETTER_SPACING.wider,
            color: COLORS.ink,
            border: `1px solid ${COLORS.mute}`,
            borderRadius: RADIUS.sm,
            padding: `${SPACE[1]}px ${SPACE[2]}px`,
          }}
        >
          {band}
        </span>
      </Row>
      {/* `soft`, not `muted`. Supporting prose across the app is inkSoft and
            labels are mute; these two lines had it backwards, so the handle
            and the level — the two facts this card exists to state — were set
            in the quietest ink on the page. */}
      {user ? (
        <Body size="sm" tone="soft" as="div" style={TRUNCATE}>
          {accountLine(profile, copy)}
        </Body>
      ) : null}
    </Stack>
  );
}

function IdentityAvatar({ profile, userId }) {
  return (
    <div
      data-testid="home-identity-avatar"
      style={{
        width: '100%',
        aspectRatio: '1 / 1',
        maxWidth: '100%',
        minWidth: 0,
        borderRadius: '50%',
        background: COLORS.paperDeep,
        border: `1px solid ${COLORS.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
    >
      <Avatar
        profile={profile}
        userId={userId}
        size={AVATAR_DESKTOP}
        style={{ width: '100%', height: '100%' }}
      />
    </div>
  );
}

// A dedicated, bounded right column: identity, today's work, then the league
// preview. Each module is a sibling, so another dashboard widget can be
// appended without changing the outer grid or nesting it inside a task board.
function RightColumn({ identityFacts, today, leaderboard }) {
  return (
    <Stack data-testid="home-identity-content" gap={2} style={BOUNDED_COLUMN}>
      {identityFacts}
      {today ? (
        <div data-testid="home-today-column" style={BOUNDED_COLUMN}>
          {today}
        </div>
      ) : null}
      {leaderboard}
    </Stack>
  );
}

// Below bp.wide the standing tiles, today's boards and the league preview drop
// under the identity band instead of squeezing into the half-width text column.
function NarrowSections({ standing, today, leaderboard }) {
  return (
    <>
      <div style={{ marginTop: SPACE[3], minWidth: 0 }}>{standing}</div>
      {today ? <div style={{ ...BOUNDED_COLUMN, marginTop: SPACE[3] }}>{today}</div> : null}
      {leaderboard ? (
        <div style={{ ...BOUNDED_COLUMN, marginTop: SPACE[3] }}>{leaderboard}</div>
      ) : null}
    </>
  );
}

function RecommendedWell({ recommended }) {
  if (!recommended) return null;
  return (
    <div
      data-testid="home-recommended-well"
      style={{
        marginTop: SPACE[4],
        paddingTop: SPACE[3],
        borderTop: BORDER.panel,
        minWidth: 0,
      }}
    >
      {recommended}
    </div>
  );
}

// Who you are, what is open today, and what to do next — one card at the top
// of Home.
//
// Identity is the visual anchor: a large avatar plus a compact greeting column
// that also holds today's Missionen / Tagesaufgaben (`today`) on wide viewports
// and, below the top row, the emphasized recommended actions (`recommended`).
// On a narrow viewport the avatar column is half the identity band, so `today`
// drops under that band instead of squeezing into the remaining half. HomeTab
// composes those boards into these slots so they are not three competing page
// sections.
//
// Standing is quiet on purpose. The daily-goal ring, total XP, level, and a
// live streak stay visible; dense Learned / XP-to-next counters do not compete
// with the actions. Arithmetic is unchanged; this file only decides what to
// print.
//
// Spacing is denser than the first identity-card pass: #270 grew the avatar
// and type, which left Missionen / Tagesaufgaben / Recommended sitting in
// empty vertical air. Tokens step down one SPACE stop; the avatar column is
// untouched.
//
// Read-only on purpose, and now read-only completely. Decision E5 keeps account
// MANAGEMENT — email, sign out, export, danger zone — exclusive to Settings; the
// hub used to own one control, a "Settings →" link beside the avatar, and that is
// gone. It made the landing screen carry two Settings doors while the header
// account bubble — the affordance a learner actually reaches for — was the less
// obvious of the two. The bubble is now the single door to Profile and Settings,
// so this card renders nothing interactive at all.
export default function PersonalHub({
  user,
  profile,
  cefrLevel,
  score = EMPTY_SCORE,
  streak = 0,
  goalPct = 0,
  goalMet = false,
  league = null,
  today = null,
  recommended = null,
}) {
  const copy = activePack.content.identity ?? {};
  const lvl = score ?? EMPTY_SCORE;
  const viewportWidth = useWindowWidth();
  const wide = viewportWidth >= bp.wide;
  const fit = viewportWidth < bp.tiny ? FIT_TINY : FIT_REGULAR;
  const greeting = copy.greeting?.(greetingName(user, profile));

  const standing = (
    <StandingTiles
      lvl={lvl}
      streak={streak}
      goalPct={goalPct}
      goalMet={goalMet}
      user={user}
      league={league}
      tileSpan={fit.tileSpan}
    />
  );
  const identityFacts = (
    <IdentityFacts
      greeting={greeting}
      cefrLevel={cefrLevel}
      copy={copy}
      fit={fit}
      wide={wide}
      user={user}
      profile={profile}
    />
  );
  // Three places around the learner, not a fixed top three — see
  // leagueWindow for which three and why.
  const leaderboard = league?.slots?.length ? (
    <LeaderboardWidget
      slots={league.slots}
      rank={league.rank}
      cohortSize={league.cohortSize}
      userId={user?.id}
    />
  ) : null;

  return (
    <Surface as="section" elevation={1} padding={4} aria-labelledby={IDENTITY_HEADING_ID}>
      <div
        data-testid="home-identity-row"
        style={{
          display: 'grid',
          gridTemplateColumns: wide ? IDENTITY_COLUMNS_WIDE : IDENTITY_COLUMNS_NARROW,
          gap: fit.identityGap,
          alignItems: 'start',
          width: '100%',
          maxWidth: '100%',
          minWidth: 0,
          boxSizing: 'border-box',
        }}
      >
        <Stack gap={3} style={{ minWidth: 0 }}>
          <IdentityAvatar profile={profile} userId={user?.id} />
          {wide ? standing : null}
        </Stack>

        {/* minmax(0, 1fr) semantics: this column must be allowed to shrink, or
            a long handle pushes the chip off a 320px screen. Wrapping the
            greeting (rather than nowrap) is the overflow behaviour — a handle
            is the name, and ellipsizing it would hide the one fact the hub
            exists to show. */}
        <RightColumn
          identityFacts={identityFacts}
          today={wide ? today : null}
          leaderboard={wide ? leaderboard : null}
        />
      </div>

      {wide ? null : <NarrowSections standing={standing} today={today} leaderboard={leaderboard} />}
      <RecommendedWell recommended={recommended} />
    </Surface>
  );
}
