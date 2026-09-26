import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';

// LEAGUES_ENABLED is read from import.meta.env at module load, and a developer
// machine has a populated .env while CI does not — so a test that inherited the
// ambient value would exercise the OPPOSITE branch on the two machines and pass
// on both. The flag is mocked through a getter so each case states which world
// it is in, and both worlds are covered.
const flags = vi.hoisted(() => ({ enabled: true }));
vi.mock('../lib/leagues.js', () => ({
  get LEAGUES_ENABLED() {
    return flags.enabled;
  },
  TIER_NAMES: ['Bronze', 'Silver', 'Gold', 'Sapphire', 'Ruby'],
  tierName: (t) =>
    Number.isInteger(t) && t >= 0 && t < 5
      ? ['Bronze', 'Silver', 'Gold', 'Sapphire', 'Ruby'][t]
      : 'Bronze',
}));
vi.mock('../lib/auth.js', () => ({ isAuthConfigured: () => true }));

import PersonalHub from './PersonalHub';

const USER = { id: 'u1', email: 'sam@example.com' };

beforeEach(() => {
  flags.enabled = true;
});

describe('PersonalHub — league at a glance', () => {
  it('shows the compact league badge for a signed-in learner', () => {
    render(
      <PersonalHub
        user={USER}
        profile={{ handle: 'sam' }}
        cefrLevel="b1"
        league={{ tier: 2, rank: 4, cohortSize: 25, inDemotionZone: false }}
      />
    );
    const badge = screen.getByTestId('league-badge-compact');
    expect(badge).toHaveTextContent('Gold');
    expect(badge).not.toHaveTextContent(/#|4|25/);
  });

  it('defaults to Bronze when the learner has no membership yet', () => {
    // `league` is null for everyone who has not joined a league this week —
    // which includes every brand-new account. Bronze is the floor they will
    // start in, so it is the truthful thing to show, not a blank.
    render(<PersonalHub user={USER} profile={{ handle: 'sam' }} cefrLevel="a1" league={null} />);
    expect(screen.getByTestId('league-badge-compact')).toHaveTextContent('Bronze');
  });

  it('sits inside the identity standing row, beside XP and the streak', () => {
    render(
      <PersonalHub
        user={USER}
        profile={{ handle: 'sam' }}
        cefrLevel="b1"
        streak={4}
        league={{ tier: 0, rank: 1, cohortSize: 3 }}
      />
    );
    expect(screen.getByTestId('home-identity-standing')).toContainElement(
      screen.getByTestId('league-badge-compact')
    );
  });

  it('shows no league to a guest', () => {
    // A signed-out visitor has no standing, and a Bronze badge would imply an
    // account they do not have.
    render(<PersonalHub user={null} profile={null} cefrLevel="a1" league={null} />);
    expect(screen.queryByTestId('league-badge-compact')).toBeNull();
  });

  it('shows no league when the feature is off', () => {
    flags.enabled = false;
    render(<PersonalHub user={USER} profile={{ handle: 'sam' }} cefrLevel="b1" league={null} />);
    expect(screen.queryByTestId('league-badge-compact')).toBeNull();
  });

  it('appends a three-place preview without bringing the full roster to Home', () => {
    render(
      <PersonalHub
        user={USER}
        profile={{ handle: 'sam' }}
        cefrLevel="b1"
        league={{
          tier: 2,
          rank: 4,
          cohortSize: 25,
          slots: [
            {
              rank: 3,
              member: {
                user_id: 'above',
                handle: 'winner',
                weekly_xp: 500,
                profile: { display_name: 'Winner', handle: 'winner', is_private: false },
              },
            },
            { rank: 4, member: { user_id: USER.id, handle: 'sam', weekly_xp: 400, profile: null } },
            {
              rank: 5,
              member: { user_id: 'below', handle: 'next', weekly_xp: 300, profile: null },
            },
          ],
        }}
      />
    );
    expect(screen.getByTestId('home-identity-content')).toContainElement(
      screen.getByTestId('home-leaderboard-widget')
    );
    // Three places around the learner — not the full roster.
    const list = screen.getByRole('list', { name: /league places around you/i });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getByTestId('league-row-you')).toBeInTheDocument();
    expect(screen.queryByText('Rangliste')).not.toBeInTheDocument();
  });
});
