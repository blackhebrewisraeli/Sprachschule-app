import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import StatsTab from './StatsTab';

// --- Module mocks ---

vi.mock('../lib/storage', () => ({
  loadState: () => null,
  saveState: () => {},
}));

vi.mock('../lib/stats', () => ({
  todayKey: () => '2026-06-27',
  getTodaySnapshot: () => ({}),
  getHeatmapData: () => [],
  getPerTabBreakdown: () => ({}),
  getAccuracyByLevel: () => ({}),
  getReviewItems: () => [],
}));

vi.mock('../lib/gamification', () => ({
  score: () => ({
    level: 1,
    rankName: 'Anfänger',
    progress: 0,
    xpIntoLevel: 0,
    xpToNext: 50,
    totalXp: 0,
  }),
  DEFAULT_GOAL: 20,
}));

vi.mock('../lib/settingsStamp', () => ({ stampSettings: () => {}, stampLevel: () => {} }));

// Stub out heavy sub-components so tests are fast
vi.mock('./stats/TodaySnapshot.jsx', () => ({ default: () => <div /> }));
vi.mock('./stats/Heatmap.jsx', () => ({ default: () => <div />, HeatmapLegend: () => <div /> }));
vi.mock('./stats/PerTabBars.jsx', () => ({ default: () => <div /> }));
vi.mock('./stats/AccuracyByLevel.jsx', () => ({ default: () => <div /> }));
vi.mock('./stats/ReviewFeed.jsx', () => ({ default: () => <div /> }));
vi.mock('./stats/VocabSrsWidget.jsx', () => ({ default: () => <div /> }));
vi.mock('./stats/AccountSection.jsx', () => ({ default: () => <div /> }));
vi.mock('./gamification/LevelCard.jsx', () => ({ default: () => <div /> }));
vi.mock('./gamification/GoalPicker.jsx', () => ({ default: () => <div /> }));
vi.mock('./gamification/BadgeGrid.jsx', () => ({ default: () => <div /> }));

// --- Leagues-specific stubs ---
vi.mock('./stats/LeaderboardSection.jsx', () => ({
  default: ({ onSelectUser }) => (
    <button onClick={() => onSelectUser('x')}>stub-leaderboard</button>
  ),
}));

vi.mock('./stats/ProfileCard.jsx', () => ({
  default: ({ userId }) => <div>stub-card-{userId}</div>,
}));

vi.mock('./social/FollowListModal.jsx', () => ({
  default: ({ kind }) => <div>stub-follow-list-{kind}</div>,
}));

// Mock leagues flag as ENABLED
vi.mock('../lib/leagues.js', () => ({
  LEAGUES_ENABLED: true,
  TIER_NAMES: ['Bronze'],
  // UserProfile fetches its own social row now, so the leagues mock has to
  // answer it or the tab throws on mount.
  fetchProfile: vi.fn().mockResolvedValue({ handle: 'sam', tier: 0 }),
}));

const setViewportWidth = (width) => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
};

beforeEach(() => setViewportWidth(1280));
afterEach(() => vi.unstubAllEnvs());

describe('StatsTab — one consolidated page, no sub-tabs', () => {
  const USER = { id: 'u1', email: 'sam@example.com' };

  it('offers no STATS / LEAGUES / SETTINGS segmented control', () => {
    // The redesign's whole premise: these were three destinations wearing one
    // tab. If any of them comes back as a button, the page has re-split.
    render(<StatsTab user={USER} />);
    for (const label of ['stats', 'leagues', 'settings']) {
      expect(screen.queryByRole('button', { name: new RegExp(`^${label}$`, 'i') })).toBeNull();
    }
  });

  it('renders the standings inline, with no click needed to reach them', () => {
    render(<StatsTab user={USER} />);
    expect(screen.getByText('stub-leaderboard')).toBeTruthy();
  });

  it('passes the saved own avatar through to the consolidated profile surface', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co');
    render(
      <StatsTab
        user={USER}
        profile={{
          display_name: 'Sam Vimes',
          handle: 'sam',
          avatar_path: 'u1/saved.webp',
          created_at: '2026-01-01T00:00:00.000Z',
        }}
      />
    );

    await screen.findByRole('heading', { name: 'Sam Vimes' });
    expect(document.querySelector('img[data-avatar="image"]')).toHaveAttribute(
      'src',
      'https://proj.supabase.co/storage/v1/object/public/avatars/u1/saved.webp'
    );
  });

  it('clicking a leaderboard row still opens ProfileCard', () => {
    render(<StatsTab user={USER} />);
    fireEvent.click(screen.getByText('stub-leaderboard'));
    expect(screen.getByText('stub-card-x')).toBeTruthy();
  });

  it('puts the detailed charts AFTER the standings', () => {
    // They used to open the tab, which is what made it read as an analytics
    // dashboard rather than a profile.
    render(<StatsTab user={USER} />);
    const standings = screen.getByText('stub-leaderboard');
    const charts = screen.getByText(/Last 12 months/i);
    expect(
      standings.compareDocumentPosition(charts) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it.each([720, 1280])('places analytics cards in the desktop hierarchy at %spx', (width) => {
    setViewportWidth(width);
    render(<StatsTab user={USER} />);
    const grid = screen.getByTestId('profile-analytics-grid');
    expect(grid).toHaveStyle({
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
      alignItems: 'stretch',
      gap: '12px',
    });
    expect(
      within(grid)
        .getAllByRole('region')
        .map((card) => card.getAttribute('aria-label'))
    ).toEqual([
      'By section',
      'Accuracy by level',
      'Vocab stats',
      'Review — tap to re-attempt',
      'Badges',
      'Last 12 months',
    ]);
    // The two long views each take the full measure rather than a half cell.
    for (const name of ['Badges', 'Last 12 months']) {
      expect(screen.getByRole('region', { name })).toHaveStyle({ gridColumn: '1 / -1' });
    }
    for (const card of within(grid).getAllByRole('region')) {
      expect(card).toHaveStyle({ alignSelf: 'stretch' });
    }
  });

  it.each([320, 375, 1280])(
    'ends the page on the heatmap, with the badges directly above it, at %spx',
    (width) => {
      setViewportWidth(width);
      render(<StatsTab user={USER} mobile={width < 640} />);
      const regions = screen.getAllByRole('region');
      // The very last section on the whole Profile page is the heatmap…
      expect(regions.at(-1)).toHaveAttribute('aria-label', 'Last 12 months');
      // …and the one immediately before it is Badges.
      expect(regions.at(-2)).toHaveAttribute('aria-label', 'Badges');
      const heatmap = regions.at(-1);
      expect(heatmap.compareDocumentPosition(screen.getByText('stub-leaderboard'))).toBe(
        Node.DOCUMENT_POSITION_PRECEDING
      );
    }
  );

  it.each([320, 375, 719])('stacks analytics cards in one bounded column at %spx', (width) => {
    setViewportWidth(width);
    render(<StatsTab user={USER} mobile={width < 640} />);
    expect(screen.getByTestId('profile-analytics-grid')).toHaveStyle({
      gridTemplateColumns: 'minmax(0, 1fr)',
      gap: '12px',
      minWidth: '0',
    });
  });

  it('still renders the settings panel on the settings route', () => {
    // Settings did not move INTO the page; it is a route reached from the
    // account sheet (#314). Removing the segmented control must not orphan it.
    render(
      <StatsTab
        user={USER}
        view="settings"
        onViewChange={() => {}}
        settingsPanel={<div>stub-settings</div>}
      />
    );
    expect(screen.getByText('stub-settings')).toBeTruthy();
  });

  it('offers a way BACK from the settings route to the profile', () => {
    // The segmented control used to double as the return journey: SETTINGS was
    // still on screen while you were in it, and STATS was next to it. Removing
    // it without a back affordance made Settings a dead end you could only
    // leave by switching tabs — SettingsRoute has no back control of its own.
    const onViewChange = vi.fn();
    render(
      <StatsTab
        user={USER}
        view="settings"
        onViewChange={onViewChange}
        settingsPanel={<div>stub-settings</div>}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /back to profile/i }));
    expect(onViewChange).toHaveBeenCalledWith('stats');
  });

  it('does not show the standings on the settings route', () => {
    render(
      <StatsTab
        user={USER}
        view="settings"
        onViewChange={() => {}}
        settingsPanel={<div>stub-settings</div>}
      />
    );
    expect(screen.queryByText('stub-leaderboard')).toBeNull();
  });

  it('does not keep GoalPicker or LevelSwitcher on the stats view', () => {
    render(<StatsTab />);
    expect(screen.queryByRole('radiogroup', { name: /level/i })).toBeNull();
    expect(screen.queryByText(/daily goal/i)).toBeNull();
    expect(screen.queryByText(/sound: on/i)).toBeNull();
    expect(screen.queryByText(/sound: off/i)).toBeNull();
  });
});

describe('StatsTab — finding people', () => {
  const USER = { id: 'u1', email: 'sam@example.com' };

  // Search moved out of the Profile page into a header-triggered modal
  // (SearchModal, opened from App's global nav) — this guards against it
  // silently coming back as an inline box here, which is what regressed once
  // already when it lived only in this tab.
  it('no longer renders an inline people-search box', () => {
    render(<StatsTab user={USER} />);
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Find people' })).toBeNull();
  });
});

describe('StatsTab — follow lists', () => {
  const USER = { id: 'u1', email: 'sam@example.com' };

  it('opens the followers list from the Follower count', async () => {
    render(<StatsTab user={USER} />);
    expect(screen.queryByText('stub-follow-list-followers')).toBeNull();

    fireEvent.click(await screen.findByRole('button', { name: '0 Follower' }));
    expect(screen.getByText('stub-follow-list-followers')).toBeInTheDocument();
  });

  it('opens the following list from the Folgt count', async () => {
    render(<StatsTab user={USER} />);
    fireEvent.click(await screen.findByRole('button', { name: '0 Folgt' }));
    expect(screen.getByText('stub-follow-list-following')).toBeInTheDocument();
  });
});
