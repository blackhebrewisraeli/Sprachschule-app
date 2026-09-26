import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import LeaderboardWidget from './LeaderboardWidget';
import { LEAGUE_ROW_COLUMNS } from './leagueFormat';
import { leagueWindow } from '../../lib/leagueWindow';

const anna = {
  user_id: 'u1',
  handle: 'anna',
  weekly_xp: 1280,
  profile: {
    display_name: 'Anna Adler',
    handle: 'anna',
    avatar_path: null,
    is_private: false,
  },
};
const paul = {
  user_id: 'u2',
  handle: 'private-paul',
  weekly_xp: 940,
  profile: {
    display_name: 'Paul Privat',
    handle: 'private-paul',
    avatar_path: null,
    is_private: true,
  },
};
const frieda = { user_id: 'u3', handle: 'fallback-frieda', weekly_xp: 710, profile: null };

const podium = [
  { rank: 1, member: anna },
  { rank: 2, member: paul },
  { rank: 3, member: frieda },
];

// A cohort of `size` with the caller at `meAt`, through the same window Home
// uses — so these tests describe what a learner actually sees at each rank.
const cohort = (size, meAt) =>
  Array.from({ length: size }, (_, i) => ({
    user_id: i + 1 === meAt ? 'me' : `u${i + 1}`,
    handle: i + 1 === meAt ? 'me' : `h${i + 1}`,
    weekly_xp: (size - i) * 10,
    profile: null,
  }));
const showAt = (size, meAt) => {
  const { rank, slots } = leagueWindow(cohort(size, meAt), 'me');
  return render(<LeaderboardWidget slots={slots} rank={rank} cohortSize={size} userId="me" />);
};
const ranks = () =>
  within(screen.getByRole('list'))
    .getAllByRole('listitem')
    .map((li) => within(li).getByLabelText(/^Rank \d+$/).textContent);

describe('LeaderboardWidget', () => {
  it('renders the podium with compact identity and XP rows', () => {
    render(<LeaderboardWidget slots={podium} rank={1} cohortSize={25} userId="u1" />);

    expect(screen.getByRole('heading', { name: 'Top 3' })).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Top 3 leaderboard' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByText('Anna Adler')).toBeInTheDocument();
    expect(screen.getByText('1,280 XP')).toBeInTheDocument();
    // Avatars are decorative beside a printed name, so Avatar correctly gives
    // them alt="" and they do not enter the accessibility tree as images.
    expect(list.querySelectorAll('img')).toHaveLength(3);
  });

  it('uses only @handle for a private profile and never prints its full name', () => {
    render(<LeaderboardWidget slots={podium} rank={1} cohortSize={25} userId="u1" />);

    expect(screen.getByText('@private-paul')).toBeInTheDocument();
    expect(screen.queryByText('Paul Privat')).not.toBeInTheDocument();
    expect(screen.getByText('@fallback-frieda')).toBeInTheDocument();
  });

  it('marks the learner’s own row and states their place', () => {
    render(<LeaderboardWidget slots={podium} rank={2} cohortSize={25} userId="u2" />);

    const rows = screen.getAllByRole('listitem');
    expect(rows[1]).toHaveAttribute('data-me');
    expect(within(rows[1]).getByTestId('league-row-you')).toHaveTextContent('Du');
    expect(rows[0]).not.toHaveAttribute('data-me');
    expect(screen.getAllByTestId('league-row-you')).toHaveLength(1);
    expect(screen.getByTestId('league-panel-aside')).toHaveTextContent('#2 / 25');
  });

  it('declares bounded shrink behavior for narrow layouts', () => {
    render(<LeaderboardWidget slots={podium} rank={1} cohortSize={25} userId="u1" />);

    expect(screen.getByTestId('home-leaderboard-widget')).toHaveStyle({
      width: '100%',
      maxWidth: '100%',
      minWidth: '0',
      boxSizing: 'border-box',
      overflow: 'hidden',
    });
    for (const row of screen.getAllByRole('listitem')) {
      expect(row).toHaveStyle({
        gridTemplateColumns: LEAGUE_ROW_COLUMNS,
        maxWidth: '100%',
        minWidth: '0',
        boxSizing: 'border-box',
      });
    }
    expect(screen.getByText('Anna Adler')).toHaveStyle({
      minWidth: '0',
      overflow: 'hidden',
      textOverflow: 'ellipsis',
      whiteSpace: 'nowrap',
    });
  });

  it('renders nothing without an active cohort preview', () => {
    const { container } = render(<LeaderboardWidget slots={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is read-only — Home renders no pressable league rows', () => {
    render(<LeaderboardWidget slots={podium} rank={1} cohortSize={25} userId="u1" />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  // ── Which three places ────────────────────────────────────────────────
  describe('the window around the learner', () => {
    it.each([
      [25, 1, ['1', '2', '3'], 'Top 3'],
      [25, 2, ['1', '2', '3'], 'Top 3'],
      [3, 3, ['1', '2', '3'], 'Top 3'],
      [4, 3, ['2', '3', '4'], 'Deine Liga'],
      [25, 25, ['23', '24', '25'], 'Deine Liga'],
      [25, 12, ['11', '12', '13'], 'Deine Liga'],
    ])('rank %2$i of %1$i shows places %3$j', (size, meAt, expected, title) => {
      showAt(size, meAt);
      expect(ranks()).toEqual(expected);
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
      // The learner is always one of the three.
      expect(screen.getByTestId('league-row-you')).toBeInTheDocument();
    });

    it('titles the list honestly once it is not the podium', () => {
      showAt(25, 12);
      expect(screen.getByRole('list', { name: 'League places around you' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Top 3' })).toBeNull();
    });

    it.each([
      [1, 1, 2],
      [2, 2, 1],
    ])('always draws three rows — a cohort of %i gets open seats', (size, meAt, expectedOpen) => {
      const { container } = showAt(size, meAt);
      expect(screen.getAllByRole('listitem')).toHaveLength(3);
      const open = container.querySelectorAll('[data-league-slot="empty"]');
      expect(open).toHaveLength(expectedOpen);
      for (const slot of open) {
        expect(slot).toHaveTextContent('Freier Platz');
        expect(slot).toHaveStyle({ gridTemplateColumns: LEAGUE_ROW_COLUMNS });
      }
    });
  });
});
