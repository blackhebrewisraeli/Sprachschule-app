import { useState, useEffect } from 'react';
import { SPACE } from '../lib/theme';
import { bp, useWindowWidth } from '../lib/useWindowWidth';
import { loadState } from '../lib/storage';
import {
  todayKey,
  getTodaySnapshot,
  getHeatmapData,
  getPerTabBreakdown,
  getAccuracyByLevel,
  getReviewItems,
} from '../lib/stats';
import { score } from '../lib/gamification';
import { SectionLabel } from './UI';
import TodaySnapshot from './stats/TodaySnapshot';
import Heatmap, { HeatmapLegend } from './stats/Heatmap';
import PerTabBars from './stats/PerTabBars';
import AccuracyByLevel from './stats/AccuracyByLevel';
import ReviewFeed from './stats/ReviewFeed';
import VocabSrsWidget from './stats/VocabSrsWidget';
import LevelCard from './gamification/LevelCard';
import BadgeGrid from './gamification/BadgeGrid';
import Button from './ui/Button';
import ProfileCard from './stats/ProfileCard';
import { LEAGUES_ENABLED } from '../lib/leagues.js';
import UserProfile from './profile/UserProfile';
import FollowListModal from './social/FollowListModal';
import { readLevel } from '../lib/levelPref.js';
import { isAuthConfigured } from '../lib/auth.js';
import Surface from './ui/Surface';

const VIEWS = {
  stats: 'stats',
  leagues: 'leagues',
  settings: 'settings',
};

const CARD_BOUNDARY = {
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  boxSizing: 'border-box',
  alignSelf: 'stretch',
};

function DashboardCard({ num, title, children, full = false }) {
  return (
    <Surface
      as="section"
      elevation={1}
      padding={3}
      radius="lg"
      aria-label={title}
      style={{
        ...CARD_BOUNDARY,
        gridColumn: full ? '1 / -1' : undefined,
      }}
    >
      <SectionLabel num={num} text={title} />
      {children}
    </Surface>
  );
}

// Section 06 — the Profile tab.
//
// It used to be three views behind a segmented control (STATS / LEAGUES /
// SETTINGS). That split one identity across three destinations: the page a
// learner thinks of as "me" could never show who they were, what league they
// were in, and how they were doing at once, and it opened on a bar chart.
//
// Now it is ONE page. UserProfile owns the identity, the metrics, the league
// card and the standings; the detailed charts below are passed to it as
// children and render last, as the secondary material they always were. The
// page closes on the long view: badges, then the 12-month activity heatmap as
// its very last element.
//
// Settings did NOT fold into the page. It stays a route (`#/settings`) whose
// one door is the account sheet (#314) — this component still renders the
// panel for that route, which is why `view` and `settingsPanel` survive.
// Goal and level editing live only there, so this surface cannot drift into a
// second copy of the same writers.
export default function StatsTab({
  mobile = false,
  onReview,
  user,
  profile,
  tokens = null,
  onSignIn,
  view,
  onViewChange,
  settingsPanel = null,
}) {
  const [state, setState] = useState(() => loadState() ?? {});
  // Uncontrolled default. Nothing sets it: the page has no view switcher any
  // more, so an isolated render simply stays on the profile view.
  const [internalView] = useState(VIEWS.stats);
  const [selectedUser, setSelectedUser] = useState(null);
  // 'followers' | 'following' | null — which of the caller's own lists is
  // open, opened from the Follower/Folgt counts on the identity card.
  const [followListKind, setFollowListKind] = useState(null);
  const dashboardWide = useWindowWidth() >= bp.wide;

  // `view` is owned by App when the settings route is in play, and by this
  // component otherwise. Nothing in here CHANGES it any more — the segmented
  // control that used to is gone, and the only way into the settings view is
  // the account sheet, which drives App's state directly. The setter stayed
  // behind as dead code when the buttons went; `internalView` remains as the
  // uncontrolled default so an isolated render still has a view.
  const controlled = typeof view === 'string' && typeof onViewChange === 'function';
  const activeView = controlled ? view : internalView;
  // The page's own door to the settings route. Not a sub-tab: it navigates to
  // `#/settings`, the same destination the account sheet opens, rather than
  // switching a segment in place.
  const openSettings = controlled ? () => onViewChange(VIEWS.settings) : undefined;

  useEffect(() => {
    const onFocus = () => setState(loadState() ?? {});
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const daily = state.daily ?? {};
  const items = state.items ?? {};
  const srs = state.srs ?? {};
  const stats = state.stats ?? { streak: 0, learnedCount: 0 };
  const sc = score(daily);

  const today = todayKey();
  const nowMs = Date.now();
  const snap = getTodaySnapshot(daily, stats, today);
  const heatmap = getHeatmapData(daily, new Date(), 365);
  const perTab = getPerTabBreakdown(daily);
  const accByLevel = getAccuracyByLevel(daily);
  const review = getReviewItems(items, 10);

  const showingSettings = activeView === VIEWS.settings;

  return (
    <div>
      {LEAGUES_ENABLED && selectedUser && (
        <ProfileCard
          userId={selectedUser}
          selfId={user?.id ?? null}
          onClose={() => setSelectedUser(null)}
        />
      )}

      {followListKind && (
        <FollowListModal kind={followListKind} onClose={() => setFollowListKind(null)} />
      )}

      {showingSettings ? (
        <div style={{ display: 'grid', gap: SPACE[4], justifyItems: 'start' }}>
          {/* The way back. The segmented control used to provide it for free —
              SETTINGS stayed on screen while you were inside it, with STATS
              beside it — so removing the control turned this route into a dead
              end reachable only by leaving the tab. SettingsRoute has no back
              control of its own. */}
          {controlled && (
            <Button variant="secondary" onClick={() => onViewChange(VIEWS.stats)}>
              ← Back to profile
            </Button>
          )}
          {settingsPanel}
        </div>
      ) : (
        <UserProfile
          user={user}
          profile={profile}
          tokens={tokens}
          onSignIn={onSignIn}
          onSelectUser={setSelectedUser}
          onOpenSettings={openSettings}
          onOpenFollowList={setFollowListKind}
          mobile={mobile}
          local={{ xp: sc.totalXp, level: readLevel(), streak: stats.streak ?? 0 }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[5] }}>
            <section>
              <SectionLabel num="0" text="Fortschritt" />
              <LevelCard lvl={sc} totalXp={sc.totalXp} learnedCount={stats.learnedCount ?? 0} />
              {!user && isAuthConfigured() && (
                <div style={{ marginTop: SPACE[5] }}>
                  <SectionLabel num="·" text="Account & sync" />
                  <Button onClick={onSignIn}>Sign in to sync →</Button>
                </div>
              )}
            </section>

            <section>
              <SectionLabel num="A" text="Today" />
              <TodaySnapshot snap={snap} />
            </section>

            {/* One card rhythm for everything below Today: same Surface, same
                12px gutter, and the page ENDS on the long view — badges, then
                the 12-month heatmap as the last element. Both are full-width
                rows so the medals and the year each get the whole measure
                instead of sharing a half-width cell with a chart. */}
            <div
              data-testid="profile-analytics-grid"
              style={{
                display: 'grid',
                gridTemplateColumns: dashboardWide ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)',
                alignItems: 'stretch',
                gap: SPACE[3],
                minWidth: 0,
              }}
            >
              <DashboardCard num="B" title="By section">
                <PerTabBars breakdown={perTab} />
              </DashboardCard>

              <DashboardCard num="C" title="Accuracy by level">
                <AccuracyByLevel byLevel={accByLevel} />
              </DashboardCard>

              <DashboardCard num="D" title="Vocab stats">
                <VocabSrsWidget srs={srs} now={nowMs} />
              </DashboardCard>

              <DashboardCard num="E" title="Review — tap to re-attempt">
                <ReviewFeed items={review} onReview={onReview ?? (() => {})} />
              </DashboardCard>

              <DashboardCard num="F" title="Badges" full>
                <BadgeGrid achievements={state.gamification?.achievements ?? {}} />
              </DashboardCard>

              <DashboardCard num="G" title="Last 12 months" full>
                <Heatmap data={heatmap} mobile={mobile} />
                <HeatmapLegend />
              </DashboardCard>
            </div>
          </div>
        </UserProfile>
      )}
    </div>
  );
}
