import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { isAuthConfigured, authCallbackKind, authCallbackReason, native } = vi.hoisted(() => ({
  isAuthConfigured: vi.fn(() => true),
  authCallbackKind: vi.fn(() => null),
  authCallbackReason: vi.fn(() => null),
  // The landing's subscription to native deep-link callbacks. `emit` plays the
  // part of the app's URL scheme delivering one.
  native: { listeners: new Set(), emit: null },
}));
native.emit = (event) => native.listeners.forEach((fn) => fn(event));

vi.mock('../../lib/auth.js', () => ({
  isAuthConfigured,
  authCallbackKind,
  authCallbackReason,
  onNativeAuthCallback: (fn) => {
    native.listeners.add(fn);
    return () => native.listeners.delete(fn);
  },
}));

const { clearIntent } = vi.hoisted(() => ({ clearIntent: vi.fn() }));
vi.mock('../../lib/legalAcceptance.js', () => ({ clearIntent }));

import AuthCallbackLanding from './AuthCallbackLanding';

describe('AuthCallbackLanding', () => {
  beforeEach(() => {
    isAuthConfigured.mockReturnValue(true);
    authCallbackKind.mockReturnValue(null);
    authCallbackReason.mockReturnValue(null);
    clearIntent.mockClear();
    window.history.replaceState({}, '', '/');
  });

  // A failed or cancelled callback ends the flow a ticked box was for; the
  // intent must not outlive it and be credited to a later sign-in.
  it('an error callback clears any pending terms intent', () => {
    authCallbackKind.mockReturnValue('error');
    authCallbackReason.mockReturnValue('cancelled');
    render(
      <AuthCallbackLanding status="anonymous" onSignedIn={() => {}} onRequestNew={() => {}} />
    );
    expect(clearIntent).toHaveBeenCalled();
  });

  it('a native error callback clears it too', () => {
    render(
      <AuthCallbackLanding status="anonymous" onSignedIn={() => {}} onRequestNew={() => {}} />
    );
    expect(clearIntent).not.toHaveBeenCalled();
    act(() => native.emit({ kind: 'error', reason: 'cancelled' }));
    expect(clearIntent).toHaveBeenCalled();
  });

  it('a pending callback keeps the intent for the session it is about to deliver', () => {
    authCallbackKind.mockReturnValue('pending');
    render(<AuthCallbackLanding status="loading" onSignedIn={() => {}} onRequestNew={() => {}} />);
    expect(clearIntent).not.toHaveBeenCalled();
  });

  it('renders nothing when the URL is not an auth callback', () => {
    const { container } = render(
      <AuthCallbackLanding status="loading" onSignedIn={() => {}} onRequestNew={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('explains a closed-list reject and stays a guest', async () => {
    const onSignedIn = vi.fn();
    const onRequestNew = vi.fn();
    render(
      <AuthCallbackLanding
        status="anonymous"
        signupRejected
        onSignedIn={onSignedIn}
        onRequestNew={onRequestNew}
      />
    );
    expect(
      await screen.findByRole('heading', { name: /this email isn't invited/i })
    ).toBeInTheDocument();
    expect(screen.getByText(/ask the owner for access/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Continue as guest' }));
    expect(onRequestNew).not.toHaveBeenCalled();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('does not celebrate a pending callback that the allowlist then rejects', async () => {
    authCallbackKind.mockReturnValue('pending');
    const onSignedIn = vi.fn();
    const { rerender } = render(
      <AuthCallbackLanding status="loading" onSignedIn={onSignedIn} onRequestNew={() => {}} />
    );
    rerender(
      <AuthCallbackLanding
        status="anonymous"
        signupRejected
        onSignedIn={onSignedIn}
        onRequestNew={() => {}}
      />
    );
    expect(
      await screen.findByRole('heading', { name: /this email isn't invited/i })
    ).toBeInTheDocument();
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(screen.queryByText('Signed in')).not.toBeInTheDocument();
  });

  it('renders nothing when auth is unconfigured', () => {
    isAuthConfigured.mockReturnValue(false);
    authCallbackKind.mockReturnValue('pending');
    const { container } = render(
      <AuthCallbackLanding status="loading" onSignedIn={() => {}} onRequestNew={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows Signing you in… for a pending callback hash', () => {
    authCallbackKind.mockReturnValue('pending');
    render(<AuthCallbackLanding status="loading" onSignedIn={() => {}} onRequestNew={() => {}} />);
    expect(screen.getByRole('status', { name: /signing you in/i })).toBeInTheDocument();
    expect(screen.getByText(/signing you in/i)).toBeInTheDocument();
  });

  it('shows human expired-link copy for an expired callback', () => {
    authCallbackKind.mockReturnValue('error');
    authCallbackReason.mockReturnValue('expired');
    render(
      <AuthCallbackLanding status="anonymous" onSignedIn={() => {}} onRequestNew={() => {}} />
    );
    expect(screen.getByText(/that link expired — request a new one/i)).toBeInTheDocument();
    // Never dump the raw fragment / Supabase error_description.
    expect(screen.queryByText(/error_code/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/otp_expired/i)).not.toBeInTheDocument();
  });

  it('moves to success when auth status becomes authenticated', async () => {
    authCallbackKind.mockReturnValue('pending');
    const onSignedIn = vi.fn();
    const { rerender } = render(
      <AuthCallbackLanding status="loading" onSignedIn={onSignedIn} onRequestNew={() => {}} />
    );
    expect(screen.getByText(/signing you in/i)).toBeInTheDocument();

    rerender(
      <AuthCallbackLanding status="authenticated" onSignedIn={onSignedIn} onRequestNew={() => {}} />
    );
    expect(await screen.findByText(/signed in/i)).toBeInTheDocument();
    expect(onSignedIn).toHaveBeenCalled();
  });

  // Regression: the success phase used to have no self-clearing mechanism —
  // only the (absent, action: null) button's onClick ever called
  // setPhase(null). On the splash branch, handleAuthDone doesn't change which
  // top-level branch renders, so the overlay never unmounted and permanently
  // blocked the level picker underneath. It must dismiss itself.
  it('auto-dismisses the success overlay after a short delay', () => {
    vi.useFakeTimers();
    try {
      authCallbackKind.mockReturnValue('pending');
      const onSignedIn = vi.fn();
      const { rerender } = render(
        <AuthCallbackLanding status="loading" onSignedIn={onSignedIn} onRequestNew={() => {}} />
      );
      rerender(
        <AuthCallbackLanding
          status="authenticated"
          onSignedIn={onSignedIn}
          onRequestNew={() => {}}
        />
      );
      expect(screen.getByText('Signed in')).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(1199));
      expect(screen.getByText('Signed in')).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(1));
      expect(screen.queryByText('Signed in')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  // Relabelled from "Email me a sign-in code": the sheet it opens now offers
  // Google as well, so naming one method would name the wrong one.
  it('offers a Sign in again CTA that calls onRequestNew', async () => {
    authCallbackKind.mockReturnValue('error');
    authCallbackReason.mockReturnValue('expired');
    const onRequestNew = vi.fn();
    render(
      <AuthCallbackLanding status="anonymous" onSignedIn={() => {}} onRequestNew={onRequestNew} />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(onRequestNew).toHaveBeenCalled();
  });

  // Phase C told every failure the same story: "That link expired". After a
  // user taps Cancel on Google's consent screen nothing expired and no email
  // was involved — the copy was simply false.
  it('tells the truth when the user backs out of consent', () => {
    authCallbackKind.mockReturnValue('error');
    authCallbackReason.mockReturnValue('cancelled');
    render(
      <AuthCallbackLanding status="anonymous" onSignedIn={() => {}} onRequestNew={() => {}} />
    );
    expect(screen.getByText('Sign-in cancelled')).toBeInTheDocument();
    expect(
      screen.getByText('No problem — you can try again whenever you like.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/expired/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/email/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeInTheDocument();
  });

  it('falls back to a plain story for any other failure', () => {
    authCallbackKind.mockReturnValue('error');
    authCallbackReason.mockReturnValue('failed');
    render(
      <AuthCallbackLanding status="anonymous" onSignedIn={() => {}} onRequestNew={() => {}} />
    );
    expect(screen.getByText("That didn't work")).toBeInTheDocument();
    // Never a raw provider message or a URL fragment.
    expect(screen.queryByText(/error_code|access_denied|#/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/expired/i)).not.toBeInTheDocument();
  });

  // A pending callback that never resolves times out into the error phase with
  // no reason at all — the URL carried a credential, not an error.
  it('uses the plain fallback when a pending callback times out', () => {
    vi.useFakeTimers();
    try {
      authCallbackKind.mockReturnValue('pending');
      authCallbackReason.mockReturnValue(null);
      render(
        <AuthCallbackLanding status="anonymous" onSignedIn={() => {}} onRequestNew={() => {}} />
      );
      expect(screen.getByText(/signing you in/i)).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(16000));
      expect(screen.getByText("That didn't work")).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  // ── Focus, on the branch that has something to do ──────────
  // This overlay lays a scrim over the whole app. On the transient phases that
  // is harmless — they carry no controls and clear themselves. The error
  // phases are different: they never self-dismiss, and they carry the only
  // control on screen. Focus was left wherever it happened to be, so reaching
  // that one button meant tabbing through the entire app chrome underneath the
  // scrim, none of which the user can see.
  describe('focus', () => {
    function focusedTrigger() {
      const b = document.createElement('button');
      b.textContent = 'behind the scrim';
      document.body.appendChild(b);
      b.focus();
      return b;
    }

    it('is an alertdialog when it carries an action', () => {
      authCallbackKind.mockReturnValue('error');
      authCallbackReason.mockReturnValue('expired');
      render(
        <AuthCallbackLanding status="anonymous" onSignedIn={() => {}} onRequestNew={() => {}} />
      );
      const panel = screen.getByRole('alertdialog');
      expect(panel.getAttribute('aria-modal')).toBe('true');
      expect(panel).toHaveAccessibleName(/that link expired/i);
    });

    it('moves focus into the panel on an actionable error', () => {
      authCallbackKind.mockReturnValue('error');
      authCallbackReason.mockReturnValue('expired');
      focusedTrigger();
      render(
        <AuthCallbackLanding status="anonymous" onSignedIn={() => {}} onRequestNew={() => {}} />
      );
      const panel = screen.getByRole('alertdialog');
      expect(panel.contains(document.activeElement)).toBe(true);
    });

    it('keeps Tab inside the panel on an actionable error', async () => {
      authCallbackKind.mockReturnValue('error');
      authCallbackReason.mockReturnValue('expired');
      const user = userEvent.setup();
      focusedTrigger();
      render(
        <AuthCallbackLanding status="anonymous" onSignedIn={() => {}} onRequestNew={() => {}} />
      );
      const panel = screen.getByRole('alertdialog');
      expect(panel.contains(document.activeElement)).toBe(true);

      await user.tab();
      expect(panel.contains(document.activeElement)).toBe(true);
      await user.tab();
      expect(panel.contains(document.activeElement)).toBe(true);
    });

    // The other direction, and the reason this is scoped to the error branch:
    // "Signing you in…" is a passing status with nothing to act on. Yanking
    // focus out of whatever the user was doing, for a panel that clears itself,
    // would be worse than leaving it alone.
    it('leaves focus alone while the callback is still pending', () => {
      authCallbackKind.mockReturnValue('pending');
      const trigger = focusedTrigger();
      render(
        <AuthCallbackLanding status="loading" onSignedIn={() => {}} onRequestNew={() => {}} />
      );
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(document.activeElement).toBe(trigger);
    });

    it('leaves focus alone on the self-dismissing success panel', async () => {
      authCallbackKind.mockReturnValue('pending');
      const trigger = focusedTrigger();
      render(
        <AuthCallbackLanding status="authenticated" onSignedIn={() => {}} onRequestNew={() => {}} />
      );
      expect(await screen.findByText('Signed in')).toBeInTheDocument();
      expect(document.activeElement).toBe(trigger);
    });
  });

  // In the native app the callback never appears in this page's URL. It
  // arrives through the app's URL scheme, usually while the landing has long
  // been mounted with nothing to show.
  describe('native callbacks', () => {
    it('shows Signing you in… when a callback arrives after mount', () => {
      const { container } = render(
        <AuthCallbackLanding status="anonymous" onSignedIn={() => {}} onRequestNew={() => {}} />
      );
      expect(container).toBeEmptyDOMElement();
      act(() => native.emit({ kind: 'pending', reason: null }));
      expect(screen.getByText('Signing you in…')).toBeInTheDocument();
    });

    it('moves to success and hands off once the session lands', async () => {
      const onSignedIn = vi.fn();
      const { rerender } = render(
        <AuthCallbackLanding status="anonymous" onSignedIn={onSignedIn} onRequestNew={() => {}} />
      );
      act(() => native.emit({ kind: 'pending', reason: null }));
      rerender(
        <AuthCallbackLanding
          status="authenticated"
          onSignedIn={onSignedIn}
          onRequestNew={() => {}}
        />
      );
      expect(await screen.findByText('Signed in')).toBeInTheDocument();
      expect(onSignedIn).toHaveBeenCalledTimes(1);
    });

    it('explains a cancelled consent with the same copy the web gets', async () => {
      const onRequestNew = vi.fn();
      render(
        <AuthCallbackLanding status="anonymous" onSignedIn={() => {}} onRequestNew={onRequestNew} />
      );
      act(() => native.emit({ kind: 'error', reason: 'cancelled' }));
      expect(screen.getByRole('heading', { name: 'Sign-in cancelled' })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Sign in again' }));
      expect(onRequestNew).toHaveBeenCalledTimes(1);
    });

    it('turns a pending callback into an error when the exchange fails', () => {
      render(
        <AuthCallbackLanding status="anonymous" onSignedIn={() => {}} onRequestNew={() => {}} />
      );
      act(() => native.emit({ kind: 'pending', reason: null }));
      act(() => native.emit({ kind: 'error', reason: 'expired' }));
      expect(
        screen.getByRole('heading', { name: 'That link expired — request a new one' })
      ).toBeInTheDocument();
    });

    it('stops listening once unmounted', () => {
      const { unmount } = render(
        <AuthCallbackLanding status="anonymous" onSignedIn={() => {}} onRequestNew={() => {}} />
      );
      expect(native.listeners.size).toBe(1);
      unmount();
      expect(native.listeners.size).toBe(0);
    });

    it('does not subscribe when auth is unconfigured', () => {
      isAuthConfigured.mockReturnValue(false);
      render(
        <AuthCallbackLanding status="anonymous" onSignedIn={() => {}} onRequestNew={() => {}} />
      );
      expect(native.listeners.size).toBe(0);
    });
  });
});
