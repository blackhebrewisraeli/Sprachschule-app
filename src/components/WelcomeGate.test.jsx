import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { isGoogleAuthConfigured, isGitHubAuthConfigured, isAppleAuthConfigured } = vi.hoisted(
  () => ({
    isAppleAuthConfigured: vi.fn(() => false),
    isGoogleAuthConfigured: vi.fn(() => false),
    isGitHubAuthConfigured: vi.fn(() => false),
  })
);
// Auth is configured in this test so the auth buttons render.
vi.mock('../lib/auth.js', () => ({
  isAuthConfigured: () => true,
  isGoogleAuthConfigured,
  isGitHubAuthConfigured,
  isAppleAuthConfigured,
}));
import WelcomeGate from './WelcomeGate';

describe('WelcomeGate', () => {
  beforeEach(() => {
    // Flags off is the merge state and the one CI runs.
    isGoogleAuthConfigured.mockReturnValue(false);
    isGitHubAuthConfigured.mockReturnValue(false);
    isAppleAuthConfigured.mockReturnValue(false);
  });

  // The guest path is now a bounded trial, so the gate says so up front — a
  // wall later is only fair if the door promised a trial, not a free ride.
  it('routes the guest path, offered as a trial', async () => {
    const onGuest = vi.fn();
    render(<WelcomeGate onGuest={onGuest} onAuth={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Try it first — free →' }));
    expect(onGuest).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/continue without an account/i)).not.toBeInTheDocument();
  });

  it('routes create / sign-in to the auth callback with the right intent', async () => {
    const onAuth = vi.fn();
    render(<WelcomeGate onGuest={() => {}} onAuth={onAuth} />);
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(onAuth).toHaveBeenCalledWith('create');
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(onAuth).toHaveBeenCalledWith('signin');
  });

  it('offers no provider button while the flags are off', () => {
    render(<WelcomeGate onGuest={() => {}} onAuth={() => {}} />);
    expect(screen.queryByRole('button', { name: /continue with google/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /continue with github/i })).toBeNull();
    // Today's exact rendering: create, sign in, guest link — nothing else.
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try it first — free →' })).toBeInTheDocument();
  });

  describe('with Google on', () => {
    beforeEach(() => isGoogleAuthConfigured.mockReturnValue(true));

    it('makes Google the top action, above create and sign in', () => {
      render(<WelcomeGate onGuest={() => {}} onAuth={() => {}} />);
      const google = screen.getByRole('button', { name: /continue with google/i });
      const create = screen.getByRole('button', { name: /create account/i });
      expect(google.compareDocumentPosition(create)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    // The guest link is the trial's front door — Google must not displace it.
    it('leaves the guest trial link exactly where it was', () => {
      const onGuest = vi.fn();
      render(<WelcomeGate onGuest={onGuest} onAuth={() => {}} />);
      const guest = screen.getByRole('button', { name: 'Try it first — free →' });
      const google = screen.getByRole('button', { name: /continue with google/i });
      expect(google.compareDocumentPosition(guest)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it('routes to the handler App passes', async () => {
      const onGoogle = vi.fn();
      render(<WelcomeGate onGuest={() => {}} onAuth={() => {}} onGoogle={onGoogle} />);
      await userEvent.click(screen.getByRole('button', { name: /continue with google/i }));
      expect(onGoogle).toHaveBeenCalledTimes(1);
    });

    // This used to assert toBeDisabled(). A disabled element leaves the tab
    // order, so the button took the user's focus with it at the moment they
    // acted. The redirect guard now lives in Button's `busy`, which blocks the
    // click without disabling — see GoogleButton.test.jsx.
    it('marks the button busy during a redirect without dropping it from the tab order', () => {
      render(<WelcomeGate onGuest={() => {}} onAuth={() => {}} googleBusy />);
      const button = screen.getByRole('button', { name: /continue with google/i });
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(button).not.toBeDisabled();
    });
  });

  describe('with Apple on', () => {
    beforeEach(() => {
      isGoogleAuthConfigured.mockReturnValue(true);
      isGitHubAuthConfigured.mockReturnValue(true);
      isAppleAuthConfigured.mockReturnValue(true);
    });

    it('puts Apple under GitHub and above create and sign in', () => {
      render(<WelcomeGate onGuest={() => {}} onAuth={() => {}} />);
      const github = screen.getByRole('button', { name: /continue with github/i });
      const apple = screen.getByRole('button', { name: /continue with apple/i });
      const create = screen.getByRole('button', { name: 'Create account' });
      expect(github.compareDocumentPosition(apple)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(apple.compareDocumentPosition(create)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it('routes to the handler App passes and marks only itself busy', async () => {
      const onApple = vi.fn();
      const { rerender } = render(
        <WelcomeGate onGuest={() => {}} onAuth={() => {}} onApple={onApple} />
      );
      await userEvent.click(screen.getByRole('button', { name: /continue with apple/i }));
      expect(onApple).toHaveBeenCalledTimes(1);
      rerender(<WelcomeGate onGuest={() => {}} onAuth={() => {}} appleBusy />);
      expect(screen.getByRole('button', { name: /continue with apple/i })).toHaveAttribute(
        'aria-busy',
        'true'
      );
      expect(screen.getByRole('button', { name: /continue with github/i })).not.toHaveAttribute(
        'aria-busy'
      );
    });
  });

  describe('with GitHub on', () => {
    beforeEach(() => isGitHubAuthConfigured.mockReturnValue(true));

    // The gate is a full screen with room for both, so it lists both — Google
    // first, GitHub straight under it, both above create / sign in.
    it('puts GitHub under Google and above create and sign in', () => {
      isGoogleAuthConfigured.mockReturnValue(true);
      render(<WelcomeGate onGuest={() => {}} onAuth={() => {}} />);
      const google = screen.getByRole('button', { name: /continue with google/i });
      const github = screen.getByRole('button', { name: /continue with github/i });
      const create = screen.getByRole('button', { name: /create account/i });
      expect(google.compareDocumentPosition(github)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(github.compareDocumentPosition(create)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it('leaves the guest trial link last', () => {
      render(<WelcomeGate onGuest={() => {}} onAuth={() => {}} />);
      const github = screen.getByRole('button', { name: /continue with github/i });
      const guest = screen.getByRole('button', { name: 'Try it first — free →' });
      expect(github.compareDocumentPosition(guest)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    it('routes to the handler App passes', async () => {
      const onGitHub = vi.fn();
      render(<WelcomeGate onGuest={() => {}} onAuth={() => {}} onGitHub={onGitHub} />);
      await userEvent.click(screen.getByRole('button', { name: /continue with github/i }));
      expect(onGitHub).toHaveBeenCalledTimes(1);
    });

    it('marks the button busy during a redirect without dropping it from the tab order', () => {
      render(<WelcomeGate onGuest={() => {}} onAuth={() => {}} gitHubBusy />);
      const button = screen.getByRole('button', { name: /continue with github/i });
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(button).not.toBeDisabled();
    });
  });

  // The bug this guards: background painted with COLORS.ink (var(--c-fg)) makes
  // the gate the exact inverse of the app — a light-mode machine gets a dark
  // gate. Asserted negatively, because "background is some token" passes
  // against the broken version too.
  it('takes its background from the ground token, not the foreground one', () => {
    const { container } = render(<WelcomeGate onGuest={() => {}} onAuth={() => {}} />);
    const screenEl = container.firstChild;
    expect(screenEl.style.background).toBe('var(--c-ground)');
    expect(screenEl.style.background).not.toBe('var(--c-fg)');
    expect(screenEl.style.color).toBe('var(--c-fg)');
  });

  // jsdom computes no layout, so this asserts the declaration rather than the
  // rendered box. It still fails if someone drops the rule — which is the
  // regression that matters: on a phone this link measured 29px tall, under the
  // 44px iOS minimum, while every button beside it cleared 48px.
  it('gives the guest link a thumb-sized hit area', () => {
    render(<WelcomeGate onGuest={() => {}} onAuth={() => {}} />);
    const guest = screen.getByRole('button', { name: 'Try it first — free →' });
    expect(Number.parseInt(guest.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
  });

  // The dvh sizing lives in the global stylesheet, because the 100vh fallback
  // and the 100dvh override are two declarations of one property and an inline
  // style object cannot hold both. This pins the hook that opts in.
  it('opts into dynamic-viewport sizing', () => {
    const { container } = render(<WelcomeGate onGuest={() => {}} onAuth={() => {}} />);
    expect(container.firstChild).toHaveClass('entry-screen');
  });

  // Theme access must exist from the very first frame the app can show — not
  // only after guest/account is chosen. See
  // docs/superpowers/specs/2026-08-24-entry-flow-and-home-dashboard-design.md §5.
  it('offers the theme toggle from the moment the entry screen renders', async () => {
    render(<WelcomeGate onGuest={() => {}} onAuth={() => {}} />);
    const appearance = screen.getByRole('button', { name: /^appearance$/i });
    expect(appearance).toBeInTheDocument();
    await userEvent.click(appearance);
    expect(screen.getByRole('dialog', { name: /appearance/i })).toBeInTheDocument();
  });
});
