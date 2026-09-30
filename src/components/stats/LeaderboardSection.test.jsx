import { it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// A raw session is ALWAYS present here. The section is handed the terms-gated
// user by UserProfile (spec §6.4: nothing joins a league before acceptance) and
// must use only that; one that went back to reading useAuth() itself would see
// this account instead and fail the tests below.
vi.mock('../../lib/auth.js', () => ({
  useAuth: vi.fn(() => ({ user: { id: 'raw-session' } })),
  getSupabase: vi.fn(),
}));
vi.mock('../../lib/leagues.js', () => ({
  LEAGUES_ENABLED: true,
  TIER_NAMES: ['Bronze', 'Silver', 'Gold', 'Sapphire', 'Ruby'],
  joinLeague: vi.fn(),
  refreshLeague: vi.fn(),
  fetchStandings: vi.fn(),
  fetchLeagueProfiles: vi.fn(),
}));
// leagueZones + leagueCountdown are pure — left un-mocked so the UI exercises
// the same zone logic the settle job uses.

import LeaderboardSection from './LeaderboardSection.jsx';
import { LEAGUE_ROW_COLUMNS } from '../league/leagueFormat';
import { LEAGUE_SIZE } from '../../lib/leagueZones.js';
import { RADIUS } from '../../lib/theme.js';
import {
  joinLeague,
  refreshLeague,
  fetchStandings,
  fetchLeagueProfiles,
} from '../../lib/leagues.js';

// The gated user the parent hands down; `null` is signed out OR not yet
// accepted — the section cannot tell the two apart, and must not need to.
let authUser = null;
const Section = (props) => <LeaderboardSection user={authUser} {...props} />;

afterEach(() => {
  authUser = null;
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

// The smallest cohort that still draws a table: a learner alone in their
// league gets no section at all.
const pair = [
  { user_id: 'me', handle: 'Me', weekly_xp: 30, rank: null },
  { user_id: 'x', handle: 'Rival', weekly_xp: 10, rank: null },
];

// This week's Monday (UTC), matching the server's currentPeriodStart. Computed
// at run time so the countdown ("Ends in …") is always active — a hardcoded
// period_start rolls into the past and makes weekRemaining report "ended".
const currentMonday = () => {
  const d = new Date();
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = utc.getUTCDay(); // 0=Sun..6=Sat
  utc.setUTCDate(utc.getUTCDate() + (dow === 0 ? -6 : 1 - dow));
  return utc.toISOString().slice(0, 10);
};

const signIn = (rows, tier = 0) => {
  authUser = { id: 'me' };
  joinLeague.mockResolvedValue({
    league_id: 'L1',
    tier,
    period_start: currentMonday(),
    handle: 'Me',
  });
  refreshLeague.mockResolvedValue({ weekly_xp: 0 });
  fetchStandings.mockResolvedValue(rows);
};

it('shows the sign-in teaser when signed out', () => {
  authUser = null;
  render(<Section onSelectUser={() => {}} />);
  expect(screen.getByText(/sign in to join/i)).toBeTruthy();
  expect(document.querySelector('[data-ui="status-note"]')).not.toBeNull();
});

// The raw session in the auth mock is live the whole time. A section handed no
// user (signed out, or signed in but not yet past the terms gate) must never
// write a membership for it.
it('never joins or refreshes for a session it was not handed', async () => {
  authUser = null;
  render(<Section onSelectUser={() => {}} />);
  await act(async () => {});
  expect(joinLeague).not.toHaveBeenCalled();
  expect(refreshLeague).not.toHaveBeenCalled();
});

it('renders standings, a countdown, and the sparse note for a small league', async () => {
  signIn([
    { user_id: 'me', handle: 'Me', weekly_xp: 30, rank: null },
    { user_id: 'x', handle: 'Rival', weekly_xp: 10, rank: null },
  ]);
  render(<Section onSelectUser={() => {}} />);
  await waitFor(() => expect(screen.getByText('@Rival')).toBeTruthy());
  expect(screen.getByRole('heading', { name: 'Rangliste' })).toBeTruthy();
  expect(screen.getByText(/Ends in/)).toBeTruthy();
  expect(screen.getByText(/still filling up/i)).toBeTruthy();
});

it('states no tier of its own — the league card above owns that', async () => {
  // The page had TWO league displays and they disagreed by construction: this
  // section's heading came from the league joinLeague() had just resolved,
  // while the card above it read the profile row's stored tier. Across a
  // settle those are different numbers, printed six pixels apart. This section
  // reports its tier UPWARD now; printing one again would restore the bug.
  signIn(pair, 2);
  const { container } = render(<Section onSelectUser={() => {}} />);
  await waitFor(() => expect(screen.getByText('@Me')).toBeTruthy());
  for (const tier of ['Bronze', 'Silver', 'Gold', 'Sapphire', 'Ruby']) {
    expect(container).not.toHaveTextContent(tier);
  }
});

it('reports the live league upward, with the derived rank and cohort size', async () => {
  // Rank is DERIVED from the ordering, not read: league_members.rank is NULL
  // until the weekly settle cron writes it, so a parent trusting the column
  // would render "Platz 0" all week.
  const onLeague = vi.fn();
  signIn(
    [
      { user_id: 'x', handle: 'Rival', weekly_xp: 90, rank: null },
      { user_id: 'me', handle: 'Me', weekly_xp: 30, rank: null },
    ],
    3
  );
  render(<Section onSelectUser={() => {}} onLeague={onLeague} />);
  await waitFor(() => expect(onLeague).toHaveBeenCalled());
  expect(onLeague).toHaveBeenCalledWith({
    tier: 3,
    leagueId: 'L1',
    rank: 2,
    cohortSize: 2,
  });
});

it('clears the reported league when the load fails', async () => {
  // Otherwise the parent keeps painting a tier beside an error note that says
  // the league could not be loaded.
  const onLeague = vi.fn();
  authUser = { id: 'me' };
  joinLeague.mockRejectedValue(new Error('boom'));
  render(<Section onSelectUser={() => {}} onLeague={onLeague} />);

  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(onLeague).toHaveBeenCalledWith(null);
});

it('does not re-join when the parent passes a fresh callback identity', async () => {
  // joinLeague() is a WRITE. A parent rendering `onLeague={(l) => ...}` inline
  // hands this component a new function every render; if that identity were in
  // the effect's dependency list, every re-render of the profile page would
  // replay join + refresh.
  signIn(pair);
  const { rerender } = render(<Section onSelectUser={() => {}} onLeague={() => {}} />);
  await waitFor(() => expect(screen.getByText('@Me')).toBeTruthy());
  expect(joinLeague).toHaveBeenCalledTimes(1);

  rerender(<Section onSelectUser={() => {}} onLeague={() => {}} />);
  await waitFor(() => expect(screen.getByText('@Me')).toBeTruthy());
  expect(joinLeague).toHaveBeenCalledTimes(1);
});

it('shows promotion and relegation zone labels in a full league (no sparse note)', async () => {
  const rows = Array.from({ length: 14 }, (_, i) => ({
    user_id: `u${i}`,
    handle: `User${i}`,
    weekly_xp: 100 - i,
    rank: null,
  }));
  signIn(rows);
  render(<Section onSelectUser={() => {}} />);
  await waitFor(() => expect(screen.getByText('@User0')).toBeTruthy());
  expect(screen.getByText(/Promotion/)).toBeTruthy();
  expect(screen.getByText(/Relegation/)).toBeTruthy();
  expect(screen.queryByText(/still filling up/i)).toBeNull();
});

// ── Keyboard reachability ────────────────────────────────────────────────
// The rows used to be `<li onClick>`: clickable with a mouse, invisible to the
// keyboard. These assert the row is a real control, and they assert the
// DENOMINATOR (every row, not just the first) so a regression that leaves one
// row behind can't pass.

const threeRows = [
  { user_id: 'me', handle: 'Me', weekly_xp: 30, rank: null },
  { user_id: 'a', handle: 'Rival A', weekly_xp: 20, rank: null },
  { user_id: 'b', handle: 'Rival B', weekly_xp: 10, rank: null },
];

it('puts every league row in the tab order, in standings order', async () => {
  const user = userEvent.setup();
  signIn(threeRows);
  render(<Section onSelectUser={() => {}} />);
  await waitFor(() => expect(screen.getByText('@Rival B')).toBeTruthy());

  const rows = screen.getAllByRole('button');
  expect(rows).toHaveLength(threeRows.length); // the denominator

  for (const row of rows) {
    expect(row).toHaveAttribute('data-ui', 'button');
    expect(row).toHaveAttribute('data-focus-inset');
    await user.tab();
    expect(document.activeElement).toBe(row);
  }
});

it.each([
  ['Enter', '{Enter}'],
  ['Space', ' '],
])('activates the focused row with %s', async (_label, keys) => {
  const user = userEvent.setup();
  const onSelectUser = vi.fn();
  signIn(threeRows);
  render(<Section onSelectUser={onSelectUser} />);
  await waitFor(() => expect(screen.getByText('@Rival A')).toBeTruthy());

  await user.tab();
  await user.tab(); // second row — 'a'
  await user.keyboard(keys);

  expect(onSelectUser).toHaveBeenCalledTimes(1);
  expect(onSelectUser).toHaveBeenCalledWith('a');
});

it('still selects a row on a mouse click', async () => {
  const user = userEvent.setup();
  const onSelectUser = vi.fn();
  signIn(threeRows);
  render(<Section onSelectUser={onSelectUser} />);
  await waitFor(() => expect(screen.getByText('@Rival B')).toBeTruthy());

  await user.click(screen.getByText('@Rival B'));
  expect(onSelectUser).toHaveBeenCalledWith('b');
});

it('names each row for a screen reader from its rank, handle, and XP', async () => {
  signIn(threeRows);
  render(<Section onSelectUser={() => {}} />);
  await waitFor(() => expect(screen.getByText('@Rival A')).toBeTruthy());

  expect(screen.getByRole('button', { name: 'Rank 2: @Rival A, 20 XP' })).toBeTruthy();
  // Your own row says so, in words as well as in the highlight.
  expect(screen.getByRole('button', { name: 'Rank 1: @Me (Du), 30 XP' })).toBeTruthy();
});

// ── Error recovery ───────────────────────────────────────────────────────

it('announces a league load failure and offers a way back', async () => {
  authUser = { id: 'me' };
  joinLeague.mockRejectedValue(new Error('boom'));
  render(<Section onSelectUser={() => {}} />);

  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your league.");
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
});

it('refetches when Retry is pressed', async () => {
  const user = userEvent.setup();
  authUser = { id: 'me' };
  joinLeague.mockRejectedValueOnce(new Error('boom'));
  joinLeague.mockResolvedValue({
    league_id: 'L1',
    tier: 0,
    period_start: currentMonday(),
    handle: 'Me',
  });
  refreshLeague.mockResolvedValue({ weekly_xp: 0 });
  fetchStandings.mockResolvedValue(pair);

  render(<Section onSelectUser={() => {}} />);
  await user.click(await screen.findByRole('button', { name: 'Retry' }));

  // Assert on the recovered UI, not on a call count: the count is an
  // implementation detail and would pass even if the retry re-rendered the
  // same error.
  expect(await screen.findByRole('heading', { name: 'Rangliste' })).toBeInTheDocument();
});

it('shows loading feedback between two consecutive failures, not a frozen error', async () => {
  const user = userEvent.setup();
  authUser = { id: 'me' };

  // The second call's promise is held open deliberately (not
  // mockRejectedValueOnce twice), so we can inspect the DOM at a moment we
  // control: after Retry has fired but before the second failure lands.
  const first = Promise.reject(new Error('boom'));
  first.catch(() => {}); // already handled by the component's own catch below
  let rejectSecond;
  const second = new Promise((_resolve, reject) => {
    rejectSecond = reject;
  });
  joinLeague.mockReturnValueOnce(first).mockReturnValueOnce(second);

  render(<Section onSelectUser={() => {}} />);
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your league.");

  await user.click(screen.getByRole('button', { name: 'Retry' }));

  // The second fetch is still pending — if the stale error state were never
  // cleared, the same alert node would still be here with the same text, and
  // a second failure would change nothing on screen. It must be gone in
  // favour of the loading branch.
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByText(/Loading league/)).toBeTruthy();

  rejectSecond(new Error('boom again'));
  expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't load your league.");
});

// ── Only real members, never placeholder seats ────────────────────────────

it('lists only the members in the league — no open-seat rows for unfilled places', async () => {
  signIn([
    { user_id: 'me', handle: 'Me', weekly_xp: 30, rank: null },
    { user_id: 'x', handle: 'Rival', weekly_xp: 10, rank: null },
  ]);
  const { container } = render(<Section onSelectUser={() => {}} />);
  await waitFor(() => expect(screen.getByText('@Rival')).toBeTruthy());

  // A two-member cohort is two rows, far short of LEAGUE_SIZE.
  expect(LEAGUE_SIZE).toBeGreaterThan(2);
  expect(container.querySelectorAll('[data-league-slot="member"]')).toHaveLength(2);
  expect(container.querySelectorAll('[data-league-slot="empty"]')).toHaveLength(0);
  expect(screen.queryByText(/Freier Platz|freie Pl/)).toBeNull();
});

it('marks the learner’s own row and prints their own name from the page’s profile', async () => {
  // The standings read carries handles only; the page already holds the
  // caller's own profile row, so their row can show who they actually are.
  signIn(threeRows);
  const { container } = render(
    <Section
      onSelectUser={() => {}}
      selfProfile={{ display_name: 'Sam Vimes', handle: 'Me', is_private: false }}
    />
  );
  await waitFor(() => expect(screen.getByText('Sam Vimes')).toBeTruthy());

  const mine = container.querySelectorAll('[data-me]');
  expect(mine).toHaveLength(1);
  expect(mine[0]).toHaveTextContent('Sam Vimes');
  expect(within(mine[0]).getByTestId('league-row-you')).toBeInTheDocument();
  // Nobody else borrows the caller's profile.
  expect(screen.getByText('@Rival A')).toBeInTheDocument();
});

it('shares the Home table design: one panel, the same row grid', async () => {
  signIn(threeRows);
  render(<Section onSelectUser={() => {}} />);
  await waitFor(() => expect(screen.getByText('@Rival A')).toBeTruthy());

  expect(screen.getByTestId('profile-leaderboard')).toHaveStyle({
    borderRadius: `${RADIUS.lg}px`,
    overflow: 'hidden',
  });
  for (const row of screen.getAllByRole('button')) {
    expect(row).toHaveStyle({ gridTemplateColumns: LEAGUE_ROW_COLUMNS });
  }
});

// ── Folded behind a summary row; absent for a league of one ───────────────

it('draws nothing when the learner is the only member, but still reports the league', async () => {
  const onLeague = vi.fn();
  signIn([{ user_id: 'me', handle: 'Me', weekly_xp: 30, rank: null }], 1);
  const { container } = render(<Section onSelectUser={() => {}} onLeague={onLeague} />);
  // The league card above still needs the tier and rank.
  await waitFor(() =>
    expect(onLeague).toHaveBeenCalledWith({ tier: 1, leagueId: 'L1', rank: 1, cohortSize: 1 })
  );
  expect(container).toBeEmptyDOMElement();
  // No faces to fetch for a table nobody sees.
  expect(fetchLeagueProfiles).not.toHaveBeenCalled();
});

it('starts folded behind a participants row that opens and closes the list', async () => {
  const user = userEvent.setup();
  signIn(threeRows);
  render(<Section onSelectUser={() => {}} />);
  const details = await screen.findByTestId('league-panel-disclosure');
  const summary = details.querySelector('summary');

  expect(details.open).toBe(false);
  expect(summary).toHaveTextContent('Teilnehmer anzeigen');
  expect(summary).toHaveTextContent(String(threeRows.length));
  // The rows live INSIDE the fold, so closing it hides every one of them.
  expect(within(details).getAllByRole('listitem').length).toBeGreaterThanOrEqual(threeRows.length);

  await user.click(summary);
  expect(details.open).toBe(true);
  expect(summary).toHaveTextContent('Teilnehmer ausblenden');

  await user.click(summary);
  expect(details.open).toBe(false);
  expect(summary).toHaveTextContent('Teilnehmer anzeigen');
});

// ── Every row shows its member's face, not only the popup ──────────────────

it("draws each member's uploaded avatar and name on their row, from one league read", async () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://db.example');
  signIn(pair);
  fetchLeagueProfiles.mockResolvedValue([
    { user_id: 'x', display_name: 'Anna Rival', handle: 'Rival', avatar_path: 'x/face.webp' },
    { user_id: 'me', display_name: 'Server Me', handle: 'Me', avatar_path: null },
  ]);
  const { container } = render(
    <Section
      onSelectUser={() => {}}
      selfProfile={{ display_name: 'Sam Vimes', handle: 'Me', avatar_path: 'me/new.webp' }}
    />
  );
  await waitFor(() => expect(screen.getByText('Anna Rival')).toBeTruthy());
  expect(fetchLeagueProfiles).toHaveBeenCalledTimes(1);
  expect(fetchLeagueProfiles).toHaveBeenCalledWith('L1');

  const [mine, rival] = [
    container.querySelector('[data-me]'),
    container.querySelector('[data-league-slot="member"]:not([data-me])'),
  ];
  const rivalFace = rival.querySelector('img');
  expect(rivalFace).toHaveAttribute('data-avatar', 'image');
  expect(rivalFace.getAttribute('src')).toContain('x/face.webp');
  // The page's own profile still wins for your row — it can be fresher.
  expect(mine).toHaveTextContent('Sam Vimes');
  expect(mine.querySelector('img').getAttribute('src')).toContain('me/new.webp');
});

it('keeps the table on handles when the league identity read fails', async () => {
  signIn(pair);
  fetchLeagueProfiles.mockRejectedValue(new Error('403'));
  render(<Section onSelectUser={() => {}} />);
  await waitFor(() => expect(screen.getByText('@Rival')).toBeTruthy());
  expect(fetchLeagueProfiles).toHaveBeenCalled();
  expect(screen.queryByRole('alert')).toBeNull();
});
