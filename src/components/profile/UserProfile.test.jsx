import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, within } from '@testing-library/react';

// The standings table fetches on its own and is covered by its own suite; this
// page only has to PLACE it. Stubbing it keeps these assertions about layout
// rather than about Supabase.
const board = vi.hoisted(() => ({ onLeague: null, selfProfile: undefined }));
vi.mock('../stats/LeaderboardSection', () => ({
  // Captures the upward callback so a test can play the role of a resolved
  // join without a Supabase client.
  default: ({ onLeague, selfProfile }) => {
    board.onLeague = onLeague;
    board.selfProfile = selfProfile;
    return <div data-testid="standings">standings</div>;
  },
}));

const leagues = vi.hoisted(() => ({ fetchProfile: vi.fn() }));
vi.mock('../../lib/leagues.js', async (orig) => ({
  ...(await orig()),
  LEAGUES_ENABLED: true,
  fetchProfile: leagues.fetchProfile,
}));

import UserProfile from './UserProfile';
import { ANONYMOUS_NAME } from '../../lib/profile.js';
import { SPACE } from '../../lib/theme';

const USER = { id: 'u1', email: 'sam@example.com' };
const ROW = {
  display_name: 'Sam Vimes',
  handle: 'sam',
  avatar_path: null,
  join_year: 2026,
  tier: 2,
  total_xp: 1240,
  longest_streak: 9,
  league_wins: 1,
  followers_count: 3,
  following_count: 5,
  achievements: [],
};

const local = { level: 'b1', streak: 9, xp: 1240 };

beforeEach(() => {
  leagues.fetchProfile.mockResolvedValue(ROW);
});
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('UserProfile — the consolidated profile page', () => {
  it('has no internal sub-tab navigation', async () => {
    // The whole point of the redesign: STATS / LEAGUES / SETTINGS were three
    // destinations pretending to be one page. Nothing here may reintroduce a
    // segmented control.
    render(<UserProfile user={USER} local={local} />);
    await screen.findByRole('heading', { name: 'Sam Vimes' });
    for (const label of ['STATS', 'LEAGUES', 'SETTINGS']) {
      expect(screen.queryByRole('button', { name: new RegExp(`^${label}$`, 'i') })).toBeNull();
    }
  });

  it('leads with the identity: name, handle and joined year', async () => {
    render(<UserProfile user={USER} local={local} />);
    expect(await screen.findByRole('heading', { name: 'Sam Vimes' })).toBeInTheDocument();
    expect(screen.getByText('@sam')).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it('shows the practice metrics in their own band', async () => {
    render(<UserProfile user={USER} local={local} />);
    await screen.findByRole('heading', { name: 'Sam Vimes' });
    const metrics = screen.getByTestId('profile-metrics');
    expect(metrics).toHaveTextContent('1240');
    expect(metrics).toHaveTextContent('9');
    expect(metrics).toHaveTextContent(/B1/i);
  });

  it('uses the profile grid gap as the complete analytics boundary', async () => {
    render(
      <UserProfile user={USER} local={local}>
        <div data-testid="charts">charts</div>
      </UserProfile>
    );
    await screen.findByRole('heading', { name: 'Sam Vimes' });

    const secondary = screen.getByTestId('profile-secondary');
    expect(secondary).toContainElement(screen.getByTestId('charts'));
    expect(secondary.style.marginTop).toBe('');
  });

  // The tallest thing on the page, and the one the tab is named after.
  it('gives the identity card a hero inset rather than a list-row one', async () => {
    render(<UserProfile user={USER} local={local} />);
    await screen.findByRole('heading', { name: 'Sam Vimes' });
    expect(screen.getByTestId('profile-identity')).toHaveStyle({ padding: `${SPACE[6]}px` });
  });

  // auto-fit collapses the unused tracks to 0 and splits the whole row between
  // the three that remain, so on a wide profile these three small stats were
  // measured at 317px EACH inside a 976px column (424px at 1600px). The cap is
  // what stops a "9d" streak occupying a 424px card.
  it('shows the token balance only once the server has answered', async () => {
    const { rerender } = render(<UserProfile user={USER} local={local} tokens={null} />);
    await screen.findByRole('heading', { name: 'Sam Vimes' });
    expect(within(screen.getByTestId('profile-metrics')).queryByText('Tokens')).toBeNull();

    rerender(<UserProfile user={USER} local={local} tokens={5010} />);
    const metrics = screen.getByTestId('profile-metrics');
    expect(within(metrics).getByText('Tokens')).toBeInTheDocument();
    expect(within(metrics).getByText('5,010')).toBeInTheDocument();
  });

  it('caps the metrics band so three small stats cannot stretch across the card', async () => {
    render(<UserProfile user={USER} local={local} />);
    await screen.findByRole('heading', { name: 'Sam Vimes' });
    const metrics = screen.getByTestId('profile-metrics');
    expect(metrics.style.maxWidth).toBe('480px');
    // The floor and the shrinkable track are what fixed a 222px overflow at
    // 375px — the cap must not have replaced them.
    expect(metrics.style.gridTemplateColumns).toContain('minmax(96px, 1fr)');
  });

  it('uses the portrait height for metrics on wide screens and keeps them below on mobile', async () => {
    window.innerWidth = 1280;
    const { rerender } = render(<UserProfile user={USER} local={local} />);
    await screen.findByRole('heading', { name: 'Sam Vimes' });
    expect(screen.getByTestId('profile-identity-details')).toContainElement(
      screen.getByTestId('profile-metrics')
    );

    act(() => {
      window.innerWidth = 375;
      window.dispatchEvent(new Event('resize'));
    });
    rerender(<UserProfile user={USER} local={local} />);
    expect(screen.getByTestId('profile-identity')).not.toContainElement(
      screen.getByTestId('profile-metrics')
    );
  });

  it('puts the follower counts inside the identity card, not the metrics grid', async () => {
    // Followers and Following describe the PERSON; XP, level and streak
    // describe their practice. Mixing all five into one row of identical
    // tiles is what made "Follower" read as a peer of "XP" — and it is the
    // arrangement every social profile has already taught people to read.
    render(<UserProfile user={USER} local={local} />);
    await screen.findByRole('heading', { name: 'Sam Vimes' });

    const social = screen.getByTestId('profile-social');
    expect(social).toHaveTextContent('Follower');
    expect(social).toHaveTextContent('Folgt');
    expect(social).toHaveTextContent('3');
    expect(social).toHaveTextContent('5');

    // Inside the identity card, beside the portrait — not a separate band.
    expect(screen.getByTestId('profile-identity')).toContainElement(social);
    expect(screen.getByTestId('profile-metrics')).not.toHaveTextContent('Follower');
  });

  it('counts zero followers as zero, never as a blank', async () => {
    leagues.fetchProfile.mockResolvedValue({
      ...ROW,
      followers_count: 0,
      following_count: 0,
    });
    render(<UserProfile user={USER} local={local} />);
    await screen.findByRole('heading', { name: 'Sam Vimes' });
    const social = screen.getByTestId('profile-social');
    expect(social.textContent).toMatch(/0\s*Follower/);
    expect(social.textContent).toMatch(/0\s*Folgt/);
  });

  it('does not make the counts clickable without a handler', async () => {
    render(<UserProfile user={USER} local={local} />);
    await screen.findByRole('heading', { name: 'Sam Vimes' });
    expect(screen.queryByRole('button', { name: /Follower/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Folgt/ })).toBeNull();
  });

  it('opens the followers list when the Follower count is clicked', async () => {
    const onOpenFollowList = vi.fn();
    render(<UserProfile user={USER} local={local} onOpenFollowList={onOpenFollowList} />);
    await screen.findByRole('heading', { name: 'Sam Vimes' });

    screen.getByRole('button', { name: '3 Follower' }).click();
    expect(onOpenFollowList).toHaveBeenCalledWith('followers');
  });

  it('opens the following list when the Folgt count is clicked', async () => {
    const onOpenFollowList = vi.fn();
    render(<UserProfile user={USER} local={local} onOpenFollowList={onOpenFollowList} />);
    await screen.findByRole('heading', { name: 'Sam Vimes' });

    screen.getByRole('button', { name: '5 Folgt' }).click();
    expect(onOpenFollowList).toHaveBeenCalledWith('following');
  });

  it('places the full standings in the main column, under the league card', async () => {
    render(<UserProfile user={USER} local={local} />);
    await screen.findByTestId('standings');
    const league = screen.getByTestId('profile-league');
    const standings = screen.getByTestId('standings');
    // compareDocumentPosition: FOLLOWING means standings comes after the card.
    expect(
      league.compareDocumentPosition(standings) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('keeps the league card and its standings together as one unit', async () => {
    render(<UserProfile user={USER} local={local} />);
    await screen.findByTestId('standings');
    const group = screen.getByTestId('profile-league-group');
    expect(group).toContainElement(screen.getByTestId('profile-league'));
    expect(group).toContainElement(screen.getByTestId('standings'));
    // A tighter rhythm than the page's section gap: tier, then who is in it.
    expect(group).toHaveStyle({ gap: `${SPACE[3]}px` });
  });

  it('hands the caller’s own profile to the standings for their row', async () => {
    // The standings read carries handles only, so without this the learner's
    // own row would show a generated avatar and a bare @handle.
    render(<UserProfile user={USER} local={local} />);
    await screen.findByRole('heading', { name: 'Sam Vimes' });
    expect(board.selfProfile).toMatchObject({ display_name: 'Sam Vimes', handle: 'sam' });
  });

  it('demotes the detailed charts to a secondary section at the bottom', async () => {
    render(
      <UserProfile user={USER} local={local}>
        <div data-testid="detailed">charts</div>
      </UserProfile>
    );
    const standings = await screen.findByTestId('standings');
    const detailed = screen.getByTestId('detailed');
    expect(
      standings.compareDocumentPosition(detailed) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('shows exactly one league display', async () => {
    // The defect this page shipped with: the card below read `profile.tier`
    // (the endpoint's view of the learner's most recent membership) while the
    // standings section printed the tier of the league joinLeague() had just
    // put them in. Across a settle week those differ, so the page said Silver
    // in one place and Gold in the next.
    render(<UserProfile user={USER} local={local} />);
    await screen.findByTestId('profile-league');
    expect(screen.getAllByTestId('profile-league')).toHaveLength(1);
    expect(screen.getAllByTestId('league-badge-tier')).toHaveLength(1);
  });

  it('prefers the live league over the profile row’s stored tier', async () => {
    // ROW.tier is 2 (Gold). The league actually joined this week is tier 1
    // (Silver), and that is the one the learner is competing in right now.
    render(<UserProfile user={USER} local={local} />);
    await screen.findByTestId('profile-league');
    expect(screen.getByTestId('league-badge-tier')).toHaveTextContent('Gold');

    await act(async () => {
      board.onLeague({ tier: 1, leagueId: 'L1', rank: 4, cohortSize: 25 });
    });
    expect(screen.getByTestId('league-badge-tier')).toHaveTextContent('Silver');
    expect(screen.getByTestId('profile-league')).not.toHaveTextContent(/Platz|4|25/);
  });

  it('falls back to Bronze when neither source has a tier', async () => {
    // Bronze is the FLOOR every player starts on, not a placeholder: a blank
    // where the tier goes is what indexing TIER_NAMES raw produces.
    leagues.fetchProfile.mockResolvedValue({ ...ROW, tier: undefined });
    render(<UserProfile user={USER} local={local} />);
    await screen.findByTestId('profile-league');
    expect(screen.getByTestId('league-badge-tier')).toHaveTextContent('Bronze');
  });

  it('drops the live league when the account changes', async () => {
    // The standings section keeps rendering the previous learner's league
    // until its own effect re-runs, so the card must not hold the old tier
    // over the new person's name.
    const { rerender } = render(<UserProfile user={USER} local={local} />);
    await screen.findByTestId('profile-league');
    await act(async () => {
      board.onLeague({ tier: 4, leagueId: 'L1', rank: 1, cohortSize: 25 });
    });
    expect(screen.getByTestId('league-badge-tier')).toHaveTextContent('Ruby');

    leagues.fetchProfile.mockResolvedValue({ ...ROW, tier: 0 });
    rerender(<UserProfile user={{ id: 'u2' }} local={local} />);
    await act(async () => {});
    expect(screen.getByTestId('league-badge-tier')).toHaveTextContent('Bronze');
  });

  it.each([320, 375, 1280])('offers exactly one Edit profile control at %ipx', async (width) => {
    // The wide layout puts the action beside the name and the narrow one puts
    // it under the counts. Rendering both would be two controls with the same
    // accessible name pointing at the same destination — which is what a
    // reader of the JSX would expect, since both branches are written out.
    window.innerWidth = width;
    render(<UserProfile user={USER} local={local} onOpenSettings={vi.fn()} />);
    await screen.findByRole('heading', { name: 'Sam Vimes' });
    expect(screen.getAllByRole('button', { name: /edit profile/i })).toHaveLength(1);
  });

  it('never fabricates profile data for a guest', async () => {
    // Spec §9. A signed-out visitor gets an explanation and a way in, not a
    // profile full of zeroes that looks like a real but empty account.
    render(<UserProfile user={null} local={local} onSignIn={vi.fn()} />);
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByTestId('profile-metrics')).toBeNull();
    expect(leagues.fetchProfile).not.toHaveBeenCalled();
  });

  it('gives the guest note its required icon (no StatusNote console error)', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<UserProfile user={null} local={local} onSignIn={vi.fn()} />);
    expect(error).not.toHaveBeenCalledWith(expect.stringContaining('StatusNote'));
    error.mockRestore();
  });

  it('keeps the page usable when the profile fetch fails', async () => {
    leagues.fetchProfile.mockRejectedValue(new Error('offline'));
    render(<UserProfile user={USER} local={local} />);
    // The local numbers come from localStorage and are still true, so a failed
    // social fetch must not blank the whole page.
    //
    // findBy* rather than waitFor(() => expect(...)): it is the same wait with
    // the assertion built in, and it does not put an assertion inside a
    // callback that may run several times.
    const metrics = await screen.findByTestId('profile-metrics');
    expect(metrics).toHaveTextContent('1240');
  });

  it('renders the anonymous identity when the fetch resolves to no social row', async () => {
    // A signed-in learner who has never been given a social row is a real
    // state, not an error: fetchProfile RESOLVES, with null. Everything the
    // page shows about them then has to come from the fallbacks, and none of
    // it may be fabricated from a row that is not there.
    leagues.fetchProfile.mockResolvedValue(null);
    const { container } = render(<UserProfile user={USER} local={local} />);

    // Flush the resolved fetch so the assertions below see the settled state
    // rather than the identical-looking initial one.
    await act(async () => {});

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(ANONYMOUS_NAME);
    expect(container).not.toHaveTextContent('@sam');
    expect(container).not.toHaveTextContent(/Mitglied seit/);
    // Tier falls back to 0; the badge carries no inferred rank or win count.
    expect(screen.getByTestId('profile-league')).toHaveTextContent('Bronze');
    expect(screen.getByTestId('profile-league')).not.toHaveTextContent(/Platz|Ligasieg|\d/);
    expect(screen.getByTestId('league-badge-tier')).toHaveTextContent('Bronze');
    // The local numbers are from localStorage and are still true.
    const metrics = screen.getByTestId('profile-metrics');
    expect(metrics).toHaveTextContent('1240');
    expect(metrics).toHaveTextContent('B1');
  });

  it('ignores a fetch that resolves after unmount', async () => {
    // A deferred promise is the only way to put the settle AFTER the unmount;
    // with a pre-resolved mock the effect cleanup has already run by then.
    let settle;
    leagues.fetchProfile.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      })
    );
    const { container, unmount } = render(<UserProfile user={USER} local={local} />);

    unmount();
    expect(container).toBeEmptyDOMElement();

    await act(async () => settle(ROW));
    expect(container).toBeEmptyDOMElement();
  });

  it('swallows a fetch that rejects after unmount', async () => {
    // The .catch has to stay attached for the unmounted case too: an effect
    // that drops it on teardown turns every late failure into an unhandled
    // rejection, which fails the suite rather than the page.
    let fail;
    leagues.fetchProfile.mockReturnValue(
      new Promise((_resolve, reject) => {
        fail = reject;
      })
    );
    const { container, unmount } = render(<UserProfile user={USER} local={local} />);

    unmount();
    await act(async () => fail(new Error('offline')));
    expect(container).toBeEmptyDOMElement();
  });

  it('does not let a superseded fetch clobber the profile that replaced it', async () => {
    // The same `live` guard as the two tests above, in the case where it is
    // load-bearing. React 18 no-ops a setState on an unmounted component, so
    // an unmount alone cannot show the guard working; a SWITCHED ACCOUNT can.
    // The first fetch is still in flight when the second lands, and without
    // the guard the stale row overwrites the current user's.
    let settleFirst;
    leagues.fetchProfile.mockReturnValueOnce(
      new Promise((resolve) => {
        settleFirst = resolve;
      })
    );
    const { rerender } = render(<UserProfile user={USER} local={local} />);

    leagues.fetchProfile.mockResolvedValue({ ...ROW, display_name: 'Carrot Ironfoundersson' });
    rerender(<UserProfile user={{ id: 'u2' }} local={local} />);
    await screen.findByRole('heading', { name: 'Carrot Ironfoundersson' });

    await act(async () => settleFirst(ROW));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Carrot Ironfoundersson');
  });

  it('does not let a superseded fetch blank the profile when it rejects late', async () => {
    // Same race on the failure path. Swallowing the error into "no social
    // row" is right for the CURRENT fetch and wrong for a superseded one:
    // unguarded, a stale timeout drops the signed-in learner back to the
    // anonymous identity.
    let failFirst;
    leagues.fetchProfile.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        failFirst = reject;
      })
    );
    const { rerender } = render(<UserProfile user={USER} local={local} />);

    leagues.fetchProfile.mockResolvedValue({ ...ROW, display_name: 'Carrot Ironfoundersson' });
    rerender(<UserProfile user={{ id: 'u2' }} local={local} />);
    await screen.findByRole('heading', { name: 'Carrot Ironfoundersson' });

    await act(async () => failFirst(new Error('offline')));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Carrot Ironfoundersson');
  });

  it('renders the parent’s saved avatar after a profile-state rerender without refetching', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co');
    leagues.fetchProfile.mockResolvedValue({ ...ROW, avatar_path: 'u1/old.webp' });
    const ownProfile = {
      display_name: 'Sam Vimes',
      handle: 'sam',
      avatar_path: 'u1/old.webp',
      created_at: '2026-01-01T00:00:00.000Z',
    };
    const { rerender } = render(<UserProfile user={USER} profile={ownProfile} local={local} />);

    await screen.findByRole('heading', { name: 'Sam Vimes' });
    expect(document.querySelector('img[data-avatar="image"]')).toHaveAttribute(
      'src',
      'https://proj.supabase.co/storage/v1/object/public/avatars/u1/old.webp'
    );

    rerender(
      <UserProfile
        user={USER}
        profile={{ ...ownProfile, avatar_path: 'u1/new.webp' }}
        local={local}
      />
    );

    expect(document.querySelector('img[data-avatar="image"]')).toHaveAttribute(
      'src',
      'https://proj.supabase.co/storage/v1/object/public/avatars/u1/new.webp'
    );
    expect(leagues.fetchProfile).toHaveBeenCalledTimes(1);
  });

  it('no grid relies on the implicit auto column', async () => {
    // The bug the previous guard could not see, because it only inspected
    // elements that HAD a grid-template-columns to inspect. A `display: grid`
    // with no template gets ONE implicit column sized `auto` — max-content —
    // so the widest child decides its width. That is how the metrics row
    // pushed this page to 597px inside a 375px viewport: 222px of horizontal
    // overflow, invisible to jsdom because jsdom does no layout.
    //
    // Declaring a template is the structural property jsdom CAN check.
    const { container } = render(<UserProfile user={USER} local={local} />);
    await screen.findByRole('heading', { name: 'Sam Vimes' });
    const grids = [...container.querySelectorAll('[style*="display: grid"]')];
    expect(grids.length).toBeGreaterThan(0);
    for (const el of grids) {
      const style = el.getAttribute('style');
      const declaresTemplate = /grid-template-columns/.test(style);
      const shrinkable = /min-width:\s*0/.test(style);
      // A grid with an explicit width cannot be sized by its content, so the
      // implicit auto column is harmless there — that is the league shield,
      // a fixed 48px disc holding one icon.
      const fixedWidth = /(^|;)\s*width:\s*\d/.test(style);
      expect(
        declaresTemplate || shrinkable || fixedWidth,
        `content-sized grid — "${(el.textContent || '').slice(0, 40)}" — ${style}`
      ).toBe(true);
    }
  });

  it('every shrinkable grid track is minmax(0, 1fr), never a bare 1fr', async () => {
    // AGENTS.md: a bare `1fr` keeps min-width:auto and refuses to shrink,
    // pushing the page wider than a 320px viewport. This has caused mobile
    // overflow in four separate places already.
    const { container } = render(<UserProfile user={USER} local={local} />);
    await screen.findByRole('heading', { name: 'Sam Vimes' });
    const grids = [...container.querySelectorAll('[style*="grid-template-columns"]')];
    expect(grids.length).toBeGreaterThan(0);
    for (const el of grids) {
      const tracks = /grid-template-columns:([^;]*)/.exec(el.getAttribute('style'))?.[1] ?? '';
      // Every 1fr must be wrapped: minmax(0, 1fr). Counting is the reliable
      // test — a regex for "a bare 1fr" matches INSIDE minmax(0, 1fr) too,
      // which is how the first version of this guard failed a correct grid.
      const total = (tracks.match(/1fr/g) ?? []).length;
      // Any explicit minimum is fine — minmax(0, 1fr) or minmax(96px, 1fr).
      // What must never appear is a 1fr that is not inside a minmax at all,
      // or one whose minimum is `auto`: both keep min-width:auto and refuse
      // to shrink. A fixed px minimum still shrinks the TRACK COUNT, because
      // auto-fit drops to fewer columns rather than overflowing.
      const wrapped = (tracks.match(/minmax\(\s*(?!auto)[^,]+,\s*1fr\s*\)/g) ?? []).length;
      expect(total, `unshrinkable 1fr in "${tracks.trim()}"`).toBe(wrapped);
    }
  });
});
