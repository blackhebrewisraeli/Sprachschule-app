import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const { isGoogleAuthConfigured, isGitHubAuthConfigured } = vi.hoisted(() => ({
  isGoogleAuthConfigured: vi.fn(() => false),
  isGitHubAuthConfigured: vi.fn(() => false),
}));
const { recordIntent } = vi.hoisted(() => ({ recordIntent: vi.fn() }));
vi.mock('../lib/auth.js', () => ({ isGoogleAuthConfigured, isGitHubAuthConfigured }));
vi.mock('../lib/legalAcceptance.js', () => ({ recordIntent }));

import TrialWall from './TrialWall';

function setup(props = {}) {
  const onCreateAccount = vi.fn();
  const onSignIn = vi.fn();
  render(
    <TrialWall roundsUsed={12} onCreateAccount={onCreateAccount} onSignIn={onSignIn} {...props} />
  );
  return { onCreateAccount, onSignIn };
}

describe('TrialWall', () => {
  beforeEach(() => {
    // Flags off is the merge state and the one CI runs.
    isGoogleAuthConfigured.mockReturnValue(false);
    isGitHubAuthConfigured.mockReturnValue(false);
    recordIntent.mockClear();
  });

  it('renders the spec copy', () => {
    setup();
    expect(screen.getByRole('heading', { name: 'Save your progress' })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Create a free account to keep going — every round you've practised comes with you."
      )
    ).toBeInTheDocument();
    expect(screen.getByText('Your stats stay open — tap Stats below.')).toBeInTheDocument();
  });

  it('is a labelled dialog that does not claim to be modal', () => {
    setup();
    const wall = screen.getByRole('dialog', { name: 'Save your progress' });
    // The header and nav stay operable, so aria-modal would be a lie.
    expect(wall).not.toHaveAttribute('aria-modal');
  });

  it('reports the rounds practised, pluralised', () => {
    const { unmount } = render(<TrialWall roundsUsed={12} />);
    expect(screen.getByText('12 rounds practised')).toBeInTheDocument();
    unmount();
    render(<TrialWall roundsUsed={1} />);
    expect(screen.getByText('1 round practised')).toBeInTheDocument();
  });

  it('fires onCreateAccount from the primary CTA', async () => {
    const user = userEvent.setup();
    const { onCreateAccount, onSignIn } = setup();
    await user.click(screen.getByRole('button', { name: 'Create a free account' }));
    expect(onCreateAccount).toHaveBeenCalledTimes(1);
    expect(onSignIn).not.toHaveBeenCalled();
  });

  it('fires onSignIn from the secondary CTA', async () => {
    const user = userEvent.setup();
    const { onCreateAccount, onSignIn } = setup();
    await user.click(screen.getByRole('button', { name: 'I already have an account' }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(onCreateAccount).not.toHaveBeenCalled();
  });

  it('moves focus to the primary CTA on mount', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Create a free account' })).toHaveFocus();
  });

  it('has no dismiss affordance', () => {
    setup();
    // Exactly the two CTAs — a close button would be a way out of the wall.
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  // Regression: the scrim first shipped at z-index 60, above App's sticky
  // header (50) and nav (49). It looked right at scroll 0 — the practice
  // surface starts below both — but the moment the page scrolled, the scrim
  // painted straight over the chrome and swallowed the Stats tab, which is
  // the wall's own escape hatch.
  it('sits below the sticky header and nav so the chrome stays clickable', () => {
    setup();
    const scrim = screen.getByRole('dialog', { name: 'Save your progress' });
    expect(Number(scrim.style.zIndex)).toBeLessThan(49);
  });

  // The practice surface runs well past the fold, so a centred card lands
  // below it on a phone. Top-aligned + sticky keeps it on screen.
  it('keeps the card at the top of the surface rather than centring it', () => {
    setup();
    const scrim = screen.getByRole('dialog', { name: 'Save your progress' });
    expect(scrim.style.alignItems).toBe('flex-start');
    expect(scrim.firstElementChild.style.position).toBe('sticky');
  });

  it('ignores Escape — the wall is not dismissible', async () => {
    const user = userEvent.setup();
    const { onCreateAccount, onSignIn } = setup();
    await user.keyboard('{Escape}');
    expect(onCreateAccount).not.toHaveBeenCalled();
    expect(onSignIn).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Save your progress' })).toBeInTheDocument();
  });

  // With the flag off this is byte-for-byte the wall that shipped in #95.
  it('keeps the two-CTA wall unchanged while Google is off', () => {
    setup();
    expect(screen.queryByRole('button', { name: /continue with google/i })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /i agree/i })).toBeNull();
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAccessibleName('Create a free account');
    expect(buttons[1]).toHaveAccessibleName('I already have an account');
    expect(buttons[0]).toHaveFocus();
  });

  describe('with Google on', () => {
    beforeEach(() => isGoogleAuthConfigured.mockReturnValue(true));

    // Every existing action demotes one step rather than a fourth appearing:
    // at 320px a fourth action turns the wall into a menu.
    it('demotes each action one step and stays at three', () => {
      setup();
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(3);
      expect(buttons[0]).toHaveAccessibleName('Continue with Google');
      expect(buttons[1]).toHaveAccessibleName('Create a free account');
      expect(buttons[2]).toHaveAccessibleName('I already have an account');
    });

    it('moves focus to Google, which is now the primary CTA', () => {
      setup();
      expect(screen.getByRole('button', { name: 'Continue with Google' })).toHaveFocus();
    });

    it('still fires the create and sign-in callbacks', async () => {
      const user = userEvent.setup();
      const { onCreateAccount, onSignIn } = setup();
      await user.click(screen.getByRole('button', { name: 'Create a free account' }));
      expect(onCreateAccount).toHaveBeenCalledTimes(1);
      await user.click(screen.getByRole('button', { name: 'I already have an account' }));
      expect(onSignIn).toHaveBeenCalledTimes(1);
    });

    it('routes Google to the handler App passes', async () => {
      const user = userEvent.setup();
      const onGoogle = vi.fn();
      setup({ onGoogle, accepted: true, onAcceptedChange: () => {} });
      await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
      expect(onGoogle).toHaveBeenCalledTimes(1);
    });

    it('preserves the prior provider start when consent-control props are omitted', async () => {
      const onGoogle = vi.fn();
      setup({ onGoogle });
      expect(screen.queryByRole('checkbox', { name: /i agree/i })).toBeNull();
      await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
      expect(onGoogle).toHaveBeenCalledTimes(1);
      expect(recordIntent).not.toHaveBeenCalled();
    });

    it('is still not dismissible', async () => {
      const user = userEvent.setup();
      const { onCreateAccount, onSignIn } = setup();
      await user.keyboard('{Escape}');
      expect(onCreateAccount).not.toHaveBeenCalled();
      expect(onSignIn).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog', { name: 'Save your progress' })).toBeInTheDocument();
    });
  });

  // The wall has ONE provider slot: a fourth action at 320px turns it into a
  // menu. GitHub takes the slot only when Google is off.
  describe('with GitHub on', () => {
    beforeEach(() => isGitHubAuthConfigured.mockReturnValue(true));

    it('takes the provider slot when Google is off, and stays at three', () => {
      setup();
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(3);
      expect(buttons[0]).toHaveAccessibleName('Continue with GitHub');
      expect(buttons[1]).toHaveAccessibleName('Create a free account');
      expect(buttons[2]).toHaveAccessibleName('I already have an account');
      expect(buttons[0]).toHaveFocus();
    });

    it('routes GitHub to the handler App passes', async () => {
      const user = userEvent.setup();
      const onGitHub = vi.fn();
      setup({ onGitHub, accepted: true, onAcceptedChange: () => {} });
      await user.click(screen.getByRole('button', { name: 'Continue with GitHub' }));
      expect(onGitHub).toHaveBeenCalledTimes(1);
      expect(recordIntent).toHaveBeenCalledTimes(1);
    });

    it('blocks GitHub and shows consent error when unchecked', async () => {
      const onGitHub = vi.fn();
      setup({ onGitHub, accepted: false, onAcceptedChange: () => {} });
      await userEvent.click(screen.getByRole('button', { name: 'Continue with GitHub' }));
      expect(onGitHub).not.toHaveBeenCalled();
      expect(recordIntent).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent(/^Required:/);
    });

    // Both on: Google keeps the slot and the wall does NOT grow a fourth
    // action. GitHub is one tap away behind "Create a free account".
    it('yields the slot to Google when both are on, still at three', () => {
      isGoogleAuthConfigured.mockReturnValue(true);
      setup();
      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(3);
      expect(buttons[0]).toHaveAccessibleName('Continue with Google');
      expect(screen.queryByRole('button', { name: /continue with github/i })).toBeNull();
      expect(buttons[0]).toHaveFocus();
    });
  });

  describe('terms consent', () => {
    const base = {
      roundsUsed: 12,
      onCreateAccount: () => {},
      onSignIn: () => {},
      onNavigateLegal: () => {},
    };

    beforeEach(() => isGoogleAuthConfigured.mockReturnValue(true));

    it('shows the unchecked consent above the provider button', () => {
      render(
        <TrialWall {...base} accepted={false} onAcceptedChange={() => {}} onGoogle={() => {}} />
      );
      const checkbox = screen.getByRole('checkbox', { name: /i agree/i });
      expect(checkbox).not.toBeChecked();
      expect(
        checkbox.compareDocumentPosition(screen.getByRole('button', { name: /google/i }))
      ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it('unchecked: Google does not start and the error is shown', async () => {
      const onGoogle = vi.fn();
      render(
        <TrialWall {...base} accepted={false} onAcceptedChange={() => {}} onGoogle={onGoogle} />
      );
      await userEvent.click(screen.getByRole('button', { name: /google/i }));
      expect(onGoogle).not.toHaveBeenCalled();
      expect(recordIntent).not.toHaveBeenCalled();
      expect(screen.getByRole('alert')).toHaveTextContent(/^Required:/);
    });

    it('checked: Google starts and the intent is recorded', async () => {
      const onGoogle = vi.fn();
      render(<TrialWall {...base} accepted onAcceptedChange={() => {}} onGoogle={onGoogle} />);
      await userEvent.click(screen.getByRole('button', { name: /google/i }));
      expect(recordIntent).toHaveBeenCalledTimes(1);
      expect(onGoogle).toHaveBeenCalledTimes(1);
    });

    it('Sign in stays one tap and never needs the box', async () => {
      const onSignIn = vi.fn();
      render(
        <TrialWall
          {...base}
          onSignIn={onSignIn}
          accepted={false}
          onAcceptedChange={() => {}}
          onGoogle={() => {}}
        />
      );
      await userEvent.click(screen.getByRole('button', { name: 'I already have an account' }));
      expect(onSignIn).toHaveBeenCalledTimes(1);
      expect(recordIntent).not.toHaveBeenCalled();
    });

    it('passes checkbox changes and legal navigation to the parent', async () => {
      const onAcceptedChange = vi.fn();
      const onNavigateLegal = vi.fn();
      render(
        <TrialWall
          {...base}
          onNavigateLegal={onNavigateLegal}
          accepted={false}
          onAcceptedChange={onAcceptedChange}
        />
      );
      await userEvent.click(screen.getByRole('checkbox', { name: /i agree/i }));
      expect(onAcceptedChange).toHaveBeenCalledWith(true);
      await userEvent.click(screen.getByRole('link', { name: 'Terms of Service' }));
      expect(onNavigateLegal).toHaveBeenCalledWith('/terms');
    });

    it('focuses consent when requested', () => {
      render(<TrialWall {...base} accepted={false} onAcceptedChange={() => {}} focusConsent />);
      expect(screen.getByRole('checkbox', { name: /i agree/i })).toHaveFocus();
    });
  });
});
