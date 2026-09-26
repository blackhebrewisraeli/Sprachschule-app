import { useEffect, useState } from 'react';
import { Coins, Flame, Sparkles, GraduationCap, UserRound } from 'lucide-react';
import {
  BORDER,
  COLORS,
  FONTS,
  FONT_SIZE,
  FONT_WEIGHT,
  LETTER_SPACING,
  RADIUS,
  SPACE,
} from '../../lib/theme';
import { LEAGUES_ENABLED, fetchProfile } from '../../lib/leagues.js';
import { profileName } from '../../lib/profile.js';
import { useWindowWidth, bp } from '../../lib/useWindowWidth';
import Avatar from '../ui/Avatar';
import Surface from '../ui/Surface';
import Heading from '../ui/Heading';
import Button from '../ui/Button';
import StatusNote from '../ui/StatusNote';
import LeagueBadge from '../league/LeagueBadge';
import LeaderboardSection from '../stats/LeaderboardSection';

// The Profile tab — ONE page.
//
// It replaced a segmented control (STATS / LEAGUES / SETTINGS) that split one
// identity across three destinations, so that the page a learner thinks of as
// "me" never showed who they were, what league they were in, and how they were
// doing at the same time. Nothing here may reintroduce a sub-tab; the guard is
// in UserProfile.test.jsx.
//
// Settings did NOT move into this page. It is a route (`#/settings`) reached
// from the account sheet, which #314 made the one door to it. StatsTab still
// renders the settings panel for that route; this component is what the tab
// shows otherwise.
//
// READING ORDER, top to bottom: who you are → the numbers → your league →
// the standings → the detailed charts, which StatsTab closes with the badges
// and then the 12-month activity heatmap as the page's last element. The charts
// used to open the tab, which is why it read as an analytics dashboard rather
// than a profile.
//
// The identity block is a CARD, not a bare column. Five metric tiles used to be
// the first thing with a border on the page, so the avatar and name floated
// above the design rather than leading it — the portrait read as a bullet in a
// list of facts instead of as the subject of the page. It now sits on its own
// surface with the follower counts it belongs with, at a size that makes it the
// focal point; XP / Level / Streak are a separate, quieter band below.

// The ring is drawn OUTSIDE the image (an outline, not a border) so the avatar
// keeps every pixel of its size instead of losing 8 to its own frame — the
// identicon is generated to fill its box. The matching margin reserves the room
// the outline paints into, which no layout box accounts for.
const RING_GAP = 6;

const labelStyle = {
  fontFamily: FONTS.mono,
  fontSize: FONT_SIZE.tag,
  letterSpacing: LETTER_SPACING.caps,
  color: COLORS.mute,
  textTransform: 'uppercase',
};

/**
 * One social count, Instagram-style: the number first, its noun underneath.
 *
 * Deliberately NOT a Surface. These are two facts about the same person as the
 * name above them and belong inside the identity card; giving each one a
 * bordered tile of its own is what made "Follower" look like a peer of "XP"
 * rather than part of who this is.
 *
 * A plain `<button>`, not a styled one: the numbers and the border-free layout
 * ARE the affordance already, so a visible button chrome here would fight the
 * "part of who this is, not a peer of XP" reasoning above it. `onClick` is
 * optional because this shell is reused by the non-clickable metrics tiles
 * nowhere else — but keeping the prop optional means a caller with no list to
 * open (there is none today) still gets a `<div>`, not a dead button.
 */
function SocialCount({ label, value, onClick }) {
  const content = (
    <>
      <span
        style={{
          fontFamily: FONTS.display,
          fontSize: FONT_SIZE.xl,
          fontWeight: FONT_WEIGHT.bold,
          lineHeight: 1.1,
          color: COLORS.ink,
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </span>
      <span style={{ ...labelStyle, textAlign: 'center', overflowWrap: 'anywhere' }}>{label}</span>
    </>
  );

  const shared = {
    display: 'flex',
    flexDirection: 'column',
    // Centred within its own half of the pair in BOTH layouts: the two
    // counts are a unit, and left-aligning them inside a 320px cap under a
    // much wider name leaves them floating rather than reading as a row.
    alignItems: 'center',
    gap: 2,
    minWidth: 0,
  };

  if (!onClick) return <div style={shared}>{content}</div>;

  return (
    <button
      type="button"
      onClick={onClick}
      data-ui="button"
      data-focus-inset=""
      aria-label={`${value} ${label}`}
      style={{
        ...shared,
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        color: 'inherit',
        font: 'inherit',
      }}
    >
      {content}
    </button>
  );
}

/**
 * One progress metric. Deliberately flat and quiet: three of these sit in a row
 * and any per-card decoration multiplies by three.
 */
function Metric({ icon: Icon, label, value }) {
  return (
    <Surface
      elevation={1}
      padding={3}
      radius="lg"
      // minWidth:0 is what lets the track actually shrink. Without it a long
      // value (a five-digit XP total) holds the column open and pushes the
      // grid past a 320px viewport.
      style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: SPACE[1] }}
    >
      <div style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: SPACE[1] }}>
        <Icon size={12} aria-hidden="true" />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      </div>
      <div
        style={{
          fontFamily: FONTS.mono,
          fontSize: FONT_SIZE.lg,
          fontWeight: FONT_WEIGHT.bold,
          color: COLORS.ink,
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </div>
    </Surface>
  );
}

export default function UserProfile({
  user,
  profile: ownProfile = null,
  tokens = null,
  local = {},
  onSignIn,
  onSelectUser,
  onOpenSettings,
  onOpenFollowList,
  mobile = false,
  children = null,
}) {
  const wide = useWindowWidth() >= bp.wide;
  const [socialProfile, setSocialProfile] = useState(null);
  // The league the learner is ACTUALLY in this week, reported upward by the
  // standings section after it joins. See the note on the league card below.
  const [liveLeague, setLiveLeague] = useState(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return undefined;
    let live = true;
    // A failed social fetch must not blank the page: the XP, level and streak
    // below come from localStorage and are still true offline. So the error is
    // swallowed into "no social row" rather than raised into an error state.
    fetchProfile(userId)
      .then((row) => {
        if (live) setSocialProfile(row ?? null);
      })
      .catch(() => {
        if (live) setSocialProfile(null);
      });
    return () => {
      live = false;
    };
  }, [userId]);

  // A switched account must not keep the previous learner's league. The social
  // row is replaced by the fetch above, but this one arrives from a child that
  // is still showing the old league until its own effect re-runs.
  useEffect(() => {
    setLiveLeague(null);
  }, [userId]);

  // Spec §9: a guest gets an explanation and a way in, never a profile full of
  // zeroes that reads as a real account with no progress.
  //
  // But only the SOCIAL half is withheld. A guest's XP, streak and charts come
  // from localStorage and are entirely real — an early return that dropped
  // `children` took the whole practice dashboard away from everyone who had
  // not signed in, which is most of the people who open this tab.
  if (!user) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: SPACE[6] }}>
        <div style={{ display: 'grid', gap: SPACE[4], justifyItems: 'start', minWidth: 0 }}>
          <Heading level={2}>Dein Profil</Heading>
          <StatusNote icon={UserRound}>
            Sign in to keep your progress, earn badges and join a weekly league.
          </StatusNote>
          <div style={{ display: 'flex', gap: SPACE[3], flexWrap: 'wrap' }}>
            <Button onClick={onSignIn}>Sign in</Button>
            {/* A guest still needs Settings — level, daily goal and sound all
                live there, and none of them require an account. The segmented
                control this page replaced was their ONLY way in; the account
                sheet is not, because a signed-out header shows "Sign in" and
                no sheet at all. */}
            {onOpenSettings && (
              <Button variant="secondary" onClick={onOpenSettings}>
                Settings
              </Button>
            )}
          </div>
        </div>
        {children}
      </div>
    );
  }

  // The social endpoint owns public metrics (followers, league, XP), while
  // App owns the caller's current profile row. Profile edits update that App
  // state from the stored PATCH response, so overlay its identity fields here:
  // the Profile page and Account sheet then repaint in the same React update
  // without waiting for this independent social fetch to run again.
  const profile = ownProfile ? { ...socialProfile, ...ownProfile } : socialProfile;

  const name = profileName(profile);
  const handle = profile?.handle ?? null;
  const showHandle = Boolean(handle) && name !== handle;
  // The portrait is the subject of this page, so it is sized against the card
  // rather than against the text beside it. 112/144 read as an oversized list
  // bullet; these read as a portrait rather than a list bullet.
  //
  // Wide gets the LARGER size AND a horizontal layout. Centred, 168px sat in a
  // 1216px card with ~520px of empty gutter on each side — prominent, but the
  // opposite of balanced, and the name and counts were stranded in a narrow
  // ribbon down the middle of a very wide surface. Beside the text it anchors
  // the row instead.
  const avatarSize = wide ? 200 : mobile ? 132 : 160;

  const practiceMetrics = (
    <div
      data-testid="profile-metrics"
      style={{
        minWidth: 0,
        width: '100%',
        display: 'grid',
        // auto-fit drops tracks as the viewport narrows; every remaining track
        // can shrink below its contents without widening the page.
        gridTemplateColumns: 'repeat(auto-fit, minmax(96px, 1fr))',
        gap: SPACE[3],
        // The cap the `1fr` needs. auto-fit collapses the unused tracks to 0
        // and splits the whole row between the three that remain, so on a wide
        // profile these three small stats were measured at 317px EACH inside a
        // 976px column — 424px at 1600px. A streak of "9d" does not need a
        // 424px card, and stretching it there is what made the identity row
        // read as sparse rather than generous.
        //
        // maxWidth rather than a smaller minmax max: the 96px floor and the
        // shrinkable 1fr are what fixed a 222px overflow at 375px, and this
        // cap never engages at those widths — the container is already
        // narrower than it.
        maxWidth: 480,
      }}
    >
      <Metric icon={Sparkles} label="XP" value={local.xp ?? profile?.total_xp ?? 0} />
      <Metric icon={GraduationCap} label="Level" value={(local.level ?? 'a1').toUpperCase()} />
      <Metric icon={Flame} label="Streak" value={`${local.streak ?? 0}d`} />
      {/* Only once the server has answered: null means signed out, no
          backend, or not migrated yet — never render a guessed balance. */}
      {typeof tokens === 'number' && (
        <Metric icon={Coins} label="Tokens" value={tokens.toLocaleString('en-US')} />
      )}
    </div>
  );

  return (
    // A single implicit grid column is sized `auto`, i.e. max-content, so the
    // widest child decides the column — and a grid ITEM defaults to
    // min-width:auto, which refuses to shrink below its own content. Together
    // that made the metrics row lay all five cards out at full width and push
    // the column to 581px inside a 343px container: 222px of horizontal
    // overflow at 375px. The track has to be explicitly shrinkable.
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: SPACE[5] }}>
      {/* ── Identity ─────────────────────────────────────────────
          Portrait, name, and the two social counts, on ONE surface. */}
      <Surface
        elevation={2}
        // 6 (24px), not 5 (20px). This card is 254-351px tall depending on
        // width — the tallest thing on the page and the one the whole tab is
        // named after. A 20px inset is a list-row inset; at this size it read
        // as a portrait pressed against its own frame.
        padding={6}
        radius="xl"
        data-testid="profile-identity"
        style={{
          display: 'grid',
          // Narrow stacks and centres; wide puts the portrait beside the text.
          // Never a bare 1fr — the text column has to be able to shrink below a
          // 30-character display name rather than pushing the card wide.
          gridTemplateColumns: wide ? `${avatarSize}px minmax(0, 1fr)` : 'minmax(0, 1fr)',
          alignItems: 'center',
          justifyItems: wide ? 'start' : 'center',
          textAlign: wide ? 'left' : 'center',
          gap: wide ? SPACE[8] : SPACE[3],
          minWidth: 0,
        }}
      >
        <div
          style={{
            borderRadius: RADIUS.pill,
            // outline + offset, not border: it hugs the circle without eating
            // into the image box or shifting the layout by its own width.
            outline: `2px solid ${COLORS.borderStrong}`,
            outlineOffset: RING_GAP,
            margin: RING_GAP,
            maxWidth: '100%',
            flexShrink: 0,
          }}
        >
          <Avatar profile={profile ?? {}} userId={userId} size={avatarSize} />
        </div>

        <div
          data-testid="profile-identity-details"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: wide ? 'flex-start' : 'center',
            justifyContent: wide ? 'space-between' : 'flex-start',
            gap: SPACE[3],
            minWidth: 0,
            width: '100%',
            alignSelf: 'stretch',
          }}
        >
          {/* Name and the edit action share a row on wide. Stacked, the button
              sat under a 320px-capped counts row and left the right half of a
              1216px card empty; beside the name it closes the header and
              matches where every social profile puts it. */}
          <div
            style={{
              display: 'flex',
              flexDirection: wide ? 'row' : 'column',
              alignItems: wide ? 'flex-start' : 'center',
              justifyContent: 'space-between',
              gap: wide ? SPACE[4] : SPACE[1],
              width: '100%',
              minWidth: 0,
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: SPACE[1],
                minWidth: 0,
                maxWidth: '100%',
              }}
            >
              {/* Handles and display names are user-supplied and can be one
                  long unbroken token, which normal wrapping refuses to break.
                  Heading's named sizes top out at 24px (`xl`), which is a
                  section title — under a 200px portrait that read as a caption.
                  The size is overridden inline against the viewport, exactly as
                  PersonalHub does for the Home greeting, rather than by adding
                  a step to the primitive's global scale. */}
              <Heading
                level={1}
                size="xl"
                style={{
                  margin: 0,
                  overflowWrap: 'anywhere',
                  lineHeight: 1.1,
                  fontSize: mobile && !wide ? FONT_SIZE['2xl'] : FONT_SIZE['4xl'],
                }}
              >
                {name}
              </Heading>
              {showHandle && (
                <div style={{ ...labelStyle, textTransform: 'none', overflowWrap: 'anywhere' }}>
                  @{handle}
                </div>
              )}
              {profile?.join_year && (
                <div style={{ ...labelStyle, textTransform: 'none' }}>
                  Mitglied seit {profile.join_year}
                </div>
              )}
            </div>

            {/* Spec §8: the self profile carries a SECONDARY edit action. It is
                also, since the segmented control went, the signed-in route into
                Settings from this page — the same destination the account sheet
                opens. */}
            {wide && onOpenSettings && (
              <div style={{ flexShrink: 0 }}>
                <Button variant="secondary" onClick={onOpenSettings}>
                  Edit profile
                </Button>
              </div>
            )}
          </div>

          {/* ── Followers / Following ──────────────────────────────
              Two counts under the name, separated by a hairline: the shape
              every social profile uses, and the reason they are here rather
              than in the metrics grid below is that these describe the PERSON,
              while XP and streak describe their practice. */}
          <div
            data-testid="profile-social"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              alignItems: 'start',
              gap: SPACE[4],
              width: '100%',
              // Capped so two numbers do not sprawl across a 1216px card, and
              // so the hairline reads as a rule under the name rather than as
              // a full-width divider splitting the card in two.
              maxWidth: 320,
              paddingTop: SPACE[3],
              borderTop: BORDER.panel,
              minWidth: 0,
            }}
          >
            <SocialCount
              label="Follower"
              value={profile?.followers_count ?? 0}
              onClick={onOpenFollowList ? () => onOpenFollowList('followers') : undefined}
            />
            <SocialCount
              label="Folgt"
              value={profile?.following_count ?? 0}
              onClick={onOpenFollowList ? () => onOpenFollowList('following') : undefined}
            />
          </div>

          {/* On desktop, the portrait creates a 200px-tall column. Keeping the
              practice band here uses the lower half of that same visual row
              instead of leaving an empty shelf under the identity copy. */}
          {wide ? practiceMetrics : null}

          {/* The narrow layout keeps the action last, under the counts: there
              is no room beside a centred name for it. Exactly one of the two
              renders — a second would be a duplicate control with the same
              accessible name. */}
          {!wide && onOpenSettings && (
            <Button variant="secondary" onClick={onOpenSettings}>
              Edit profile
            </Button>
          )}
        </div>
      </Surface>

      {/* On narrow viewports the metrics remain a full-width band below the
          portrait card, where three tiles beside a centred avatar would be too
          compressed to scan. */}
      {!wide ? practiceMetrics : null}

      {LEAGUES_ENABLED && (
        // The league card and its standings are ONE unit — the tier, then who
        // is in it — so they sit on a tighter rhythm than the page's section
        // gap, the same way the identity card groups a name with its counts.
        <div
          data-testid="profile-league-group"
          style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: SPACE[3] }}
        >
          {/* ── League ───────────────────────────────────────────
              ONE league display (spec §8). The leaderboard below used to print
              its own tier heading six pixels further down, sourced from the
              league joinLeague() had just put the learner in — while this card
              read `profile.tier`, which the endpoint derives from their most
              recent membership row. Across a settle those are different
              numbers, so the page could say Silver here and Gold there.
              LeaderboardSection now reports the live league up instead of
              rendering its own tier, and `profile.tier` is the fallback for
              the moment before that fetch lands. tierName() makes both ends
              Bronze when there is nothing at all. */}
          <LeagueBadge tier={liveLeague?.tier ?? profile?.tier} />

          {/* The full standings, in the main column — not behind a sub-tab.
              The caller's own profile rides along so their row shows their
              real name and avatar; the standings read carries handles only. */}
          <LeaderboardSection
            onSelectUser={onSelectUser}
            onLeague={setLiveLeague}
            selfProfile={profile}
          />
        </div>
      )}

      {/* ── Secondary: the detailed charts ───────────────────────
          Last, deliberately. The child now owns one compact dashboard rhythm,
          so the outer profile grid's normal SPACE[5] gap is the complete
          boundary; adding a second margin would recreate the empty shelf this
          redesign removes. */}
      <div data-testid="profile-secondary" style={{ minWidth: 0 }}>
        {children}
      </div>
    </div>
  );
}
