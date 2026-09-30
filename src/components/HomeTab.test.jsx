import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import HomeTab from './HomeTab';
import { SPACE } from '../lib/theme';

// See PersonalHub.test.jsx: isAuthConfigured() differs between a dev box and
// CI, and PersonalHub branches on it.
vi.mock('../lib/auth.js', () => ({ isAuthConfigured: () => true }));

const score = {
  level: 3,
  rankName: 'Anfänger',
  progress: 0.4,
  xpIntoLevel: 60,
  xpToNext: 150,
  totalXp: 300,
};

const hubProps = {
  score,
  learnedCount: 12,
  goalPct: 0.5,
  goalMet: false,
  streak: 4,
};

describe('HomeTab', () => {
  it('renders daily goal and streak with the identity facts after the layout change', () => {
    render(<HomeTab {...hubProps} />);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Anfänger')).toBeInTheDocument();
    expect(screen.getByTitle('Daily goal · 50%')).toBeInTheDocument();
    expect(screen.getByLabelText('Streak 4')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    // Dense XP / learned counters stay off Home so the actions can breathe.
    // Arithmetic is unchanged; this is a presentation choice.
    expect(screen.queryByText(/300 XP total/)).not.toBeInTheDocument();
    expect(screen.queryByText(/XP to next/)).not.toBeInTheDocument();
    expect(screen.queryByText('Learned')).not.toBeInTheDocument();
  });

  // App.test.jsx ("renders HomeTab content on the default landing tab") pins
  // this heading as what the default tab mounts. This polish must not move
  // that greeting off Home — and must not edit App.jsx to keep the contract.
  it('still exposes the greeting the default landing tab renders', () => {
    render(<HomeTab {...hubProps} />);
    expect(screen.getByRole('heading', { name: /guten tag/i })).toBeInTheDocument();
  });

  // Home is a quick glance, not a second Stats — the deep-dive widgets
  // (accuracy breakdown, heatmap, leaderboard, account) stay exclusive to
  // Profile. See docs/superpowers/specs/2026-08-24-entry-flow-and-home-dashboard-design.md §7.
  it('shows nothing beyond the progress snapshot', () => {
    render(<HomeTab {...hubProps} />);
    expect(screen.queryByText(/accuracy/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/leaderboard/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/account/i)).not.toBeInTheDocument();
  });

  // E5 is superseded NARROWLY by the personal hub: identity may appear,
  // administration may not. This is the assertion that stops Home drifting
  // into a full account page later — Settings lives in the Profile tab.
  it('carries identity but never account management', () => {
    render(
      <HomeTab
        {...hubProps}
        user={{ id: 'u1', email: 'semion@example.com' }}
        profile={{ display_name: 'Semion', handle: 'semion' }}
        cefrLevel="a2"
      />
    );
    expect(screen.getByRole('heading', { name: /guten tag, semion/i })).toBeInTheDocument();

    expect(screen.queryByText('semion@example.com')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete account/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /export my data/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/danger zone/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /handle/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /change email/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/appearance/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: /level/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/daily goal/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sound: on/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/sound: off/i)).not.toBeInTheDocument();
  });

  // Home offers NO Settings door of its own any more, signed in or not. The one
  // entry is the header account bubble, which lives above HomeTab and is not part
  // of this tree — so the assertion is absence, for both audiences.
  it('offers a signed-in learner no Settings control of its own', () => {
    render(
      <HomeTab
        {...hubProps}
        user={{ id: 'u1', email: 'semion@example.com' }}
        profile={{ handle: 'semion' }}
        cefrLevel="a2"
      />
    );
    expect(screen.queryByRole('button', { name: /settings/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/settings/i)).not.toBeInTheDocument();
  });

  it('hides Settings from a guest, who has no account to manage', () => {
    render(<HomeTab {...hubProps} />);
    expect(screen.queryByRole('button', { name: /settings/i })).not.toBeInTheDocument();
  });

  it('renders the missions it is handed, and routes from one', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const onGoToTab = vi.fn();
    render(
      <HomeTab
        {...hubProps}
        cefrLevel="a1"
        missions={[{ id: 'srs-due', count: 5, tab: 'vocab', priority: 0 }]}
        onGoToTab={onGoToTab}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /5 cards are due/i }));
    expect(onGoToTab).toHaveBeenCalledWith('vocab', expect.objectContaining({ id: 'srs-due' }));
  });

  it('congratulates when no missions are open', () => {
    render(<HomeTab {...hubProps} goalMet cefrLevel="a1" missions={[]} />);
    expect(screen.getByText(/alles erledigt/i)).toBeInTheDocument();
  });

  it('shows the placement suggestion when asked, and hides it otherwise', async () => {
    const { default: userEvent } = await import('@testing-library/user-event');
    const onRetakePlacement = vi.fn();
    const onDismissPlacementOffer = vi.fn();
    const { rerender } = render(<HomeTab {...hubProps} />);
    expect(screen.queryByRole('region', { name: /ready to check your level/i })).toBeNull();

    rerender(
      <HomeTab
        {...hubProps}
        showPlacementOffer
        onRetakePlacement={onRetakePlacement}
        onDismissPlacementOffer={onDismissPlacementOffer}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /take the test/i }));
    expect(onRetakePlacement).toHaveBeenCalledTimes(1);
  });

  it('keeps Missionen, Tagesaufgaben and Recommended as regions inside one hub', () => {
    render(
      <HomeTab
        {...hubProps}
        cefrLevel="a1"
        missions={[
          { id: 'srs-due', count: 5, tab: 'vocab', priority: 0 },
          { id: 'goal-remaining', count: 20, tab: 'chat', priority: 2 },
          { id: 'revisit-wrong', count: 3, tab: 'translate', priority: 3 },
        ]}
        quests={[{ id: 'answer-cards', target: 7, progress: 3, done: false, tab: 'vocab' }]}
      />
    );
    expect(screen.queryByRole('region', { name: /heute/i })).not.toBeInTheDocument();

    const hub = screen.getByRole('region', { name: /guten tag/i });
    expect(hub).toContainElement(screen.getByRole('region', { name: /missionen/i }));
    expect(hub).toContainElement(screen.getByRole('region', { name: /tagesaufgaben/i }));
    expect(hub).toContainElement(screen.getByRole('region', { name: /recommended/i }));
    expect(screen.getByTestId('home-today-stack')).toHaveStyle({ gap: `${SPACE[3]}px` });
  });

  it('does not claim "nothing due" when Recommended took every open mission', () => {
    // Two open missions, both promoted. MissionBoard used to receive the empty
    // remainder and print "Alles erledigt — Nothing due today" directly above
    // the Recommended card saying cards were due.
    render(
      <HomeTab
        {...hubProps}
        cefrLevel="a1"
        missions={[
          { id: 'srs-due', count: 40, tab: 'vocab', priority: 0 },
          { id: 'goal-remaining', count: 20, tab: 'chat', priority: 2 },
        ]}
        quests={[{ id: 'answer-cards', target: 7, progress: 3, done: false, tab: 'vocab' }]}
      />
    );
    expect(screen.queryByText(/alles erledigt/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /missionen/i })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: /recommended/i })).toHaveTextContent(/40/);
    expect(screen.getByRole('region', { name: /tagesaufgaben/i })).toBeInTheDocument();
  });

  it('keeps the all-clear on a day with genuinely nothing open', () => {
    render(<HomeTab {...hubProps} cefrLevel="a1" missions={[]} />);
    expect(screen.getByRole('region', { name: /missionen/i })).toHaveTextContent(/alles erledigt/i);
  });

  it('caps the page at a readable width and centres it, instead of spanning the 1400px frame', () => {
    render(<HomeTab {...hubProps} />);
    const page = screen.getByRole('region', { name: /guten tag/i }).parentElement;
    expect(page).toHaveStyle({ maxWidth: '896px' });
    // jsdom does not expand margin-inline into left/right, so read it raw.
    expect(page.style.marginInline).toBe('auto');
  });
});

// The Settings link Home used to gate on isAuthConfigured() is gone entirely, so
// a dead backend changes nothing about this tab. Kept as the guard that it stays
// that way: a future Settings door added back to Home would fail here first.
describe('HomeTab when auth is not configured', () => {
  it('still greets, and has no Settings link to withdraw', async () => {
    vi.resetModules();
    vi.doMock('../lib/auth.js', () => ({ isAuthConfigured: () => false }));
    const { default: Tab } = await import('./HomeTab');
    render(
      <Tab
        {...hubProps}
        user={{ id: 'u1', email: 'semion@example.com' }}
        profile={{ handle: 'semion' }}
        cefrLevel="a2"
      />
    );
    expect(screen.getByRole('heading', { name: /guten tag, semion/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /settings/i })).not.toBeInTheDocument();
    vi.doUnmock('../lib/auth.js');
  });
});
