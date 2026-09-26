import PersonalHub from './PersonalHub';
import RecommendedActions from './RecommendedActions';
import { resolveRecommended } from './resolveRecommended';
import MissionBoard from './MissionBoard';
import QuestBoard from './QuestBoard';
import ErrorBoundary from './ErrorBoundary';
import { Stack } from './ui/Layout';
import PlacementOfferBanner from './PlacementOfferBanner';

// Landing surface for every app open, guest or signed-in — who you are, what
// to do next, and what is still open today.
//
// One identity card owns all three. PersonalHub is the Surface; HomeTab
// composes MissionBoard / QuestBoard into its `today` slot (beside the avatar
// on wide viewports, under identity on small ones) and RecommendedActions into
// the emphasized band under that row. The old page-level stack — Recommended,
// then a separate Heute block under the hub — is gone on purpose so those
// zones stop competing.
//
// Deliberately NOT a second Stats tab and NOT a Settings page: no accuracy
// breakdown, heatmap, full 25-name roster, or account MANAGEMENT here. The
// compact league badge and three-place preview are the narrow league glance; the
// complete standings stay on the Profile tab. See
// docs/superpowers/specs/2026-08-24-entry-flow-and-home-dashboard-design.md §7
// for the original exclusion (E5), and the 2026-08-29 design §4.1 for the
// identity that narrows it — identity, not administration.
//
// Capped and centred, not left to PageFrame's 1400px. At 1440 the card ran
// 1336px wide and every Missionen / Tagesaufgaben row stretched to 1030px for
// one short line of text. 896 (Tailwind's max-w-4xl) keeps the avatar column
// at 256 and gives the task column ~590 — sized to its content. Below 928
// the cap never binds, so phones and tablets are untouched.
const PAGE_MAX_WIDTH = 896;

export default function HomeTab({
  score,
  goalPct,
  goalMet,
  streak,
  user = null,
  profile = null,
  cefrLevel,
  missions = [],
  quests = [],
  league = null,
  onGoToTab,
  showPlacementOffer = false,
  onRetakePlacement,
  onDismissPlacementOffer,
}) {
  const { remaining } = resolveRecommended(missions, 2, { classifiedLevel: cefrLevel });

  return (
    <Stack gap={5} style={{ maxWidth: PAGE_MAX_WIDTH, marginInline: 'auto' }}>
      {showPlacementOffer ? (
        <PlacementOfferBanner onRetake={onRetakePlacement} onDismiss={onDismissPlacementOffer} />
      ) : null}
      <PersonalHub
        user={user}
        profile={profile}
        cefrLevel={cefrLevel}
        score={score}
        streak={streak}
        goalPct={goalPct}
        goalMet={goalMet}
        league={league}
        today={
          <Stack gap={3} data-testid="home-today-stack">
            <ErrorBoundary>
              <MissionBoard missions={remaining} onGo={onGoToTab} />
            </ErrorBoundary>
            <ErrorBoundary>
              <QuestBoard quests={quests} onGo={onGoToTab} />
            </ErrorBoundary>
          </Stack>
        }
        recommended={
          <ErrorBoundary>
            <RecommendedActions missions={missions} classifiedLevel={cefrLevel} onGo={onGoToTab} />
          </ErrorBoundary>
        }
      />
    </Stack>
  );
}
