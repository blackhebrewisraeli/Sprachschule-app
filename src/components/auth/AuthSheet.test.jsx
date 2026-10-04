import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { COLORS, SPACE } from '../../lib/theme';

const {
  isAuthConfigured,
  isGoogleAuthConfigured,
  isGitHubAuthConfigured,
  isAppleAuthConfigured,
  signInWithGoogle,
  recordIntent,
  clearIntent,
  formProps,
  formMode,
} = vi.hoisted(() => ({
  isAuthConfigured: vi.fn(() => true),
  isGoogleAuthConfigured: vi.fn(() => false),
  isGitHubAuthConfigured: vi.fn(() => false),
  isAppleAuthConfigured: vi.fn(() => false),
  signInWithGoogle: vi.fn(() => Promise.resolve({ error: null })),
  recordIntent: vi.fn(),
  clearIntent: vi.fn(),
  // Every prop the (mocked) MagicLinkForm was rendered with, and a switch that
  // swaps the mock for the real form in the one test that types into it.
  formProps: vi.fn(),
  formMode: { real: false },
}));

vi.mock('../../lib/auth.js', () => ({
  isAuthConfigured,
  isGoogleAuthConfigured,
  isGitHubAuthConfigured,
  isAppleAuthConfigured,
  signInWithGoogle,
  signInWithMagicLink: vi.fn(() => Promise.resolve({ error: null })),
  verifyCode: vi.fn(() => Promise.resolve({ error: null })),
}));

vi.mock('../../lib/legalAcceptance.js', () => ({ recordIntent, clearIntent }));

vi.mock('./MagicLinkForm', async () => {
  const { default: RealForm } = await vi.importActual('./MagicLinkForm');
  return {
    default: function MockForm(props) {
      formProps(props);
      if (formMode.real) return <RealForm {...props} />;
      return (
        <button type="button" data-testid="magic-link-form" onClick={() => props.beforeStart?.()}>
          {props.heading}
        </button>
      );
    },
  };
});

import AuthSheet from './AuthSheet';

describe('AuthSheet', () => {
  beforeEach(() => {
    isAuthConfigured.mockReturnValue(true);
    // Flags off is the merge state and the one CI runs.
    isGoogleAuthConfigured.mockReturnValue(false);
    isGitHubAuthConfigured.mockReturnValue(false);
    isAppleAuthConfigured.mockReturnValue(false);
    signInWithGoogle.mockClear();
    recordIntent.mockClear();
    clearIntent.mockClear();
    formProps.mockClear();
    formMode.real = false;
  });

  it('renders nothing when closed', () => {
    const { container } = render(
      <AuthSheet open={false} intent="signin" onClose={() => {}} onSuccess={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when auth is not configured — even if open', () => {
    isAuthConfigured.mockReturnValue(false);
    const { container } = render(
      <AuthSheet open intent="signin" onClose={() => {}} onSuccess={() => {}} />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the sign-in form when open', () => {
    render(<AuthSheet open intent="signin" onClose={() => {}} onSuccess={() => {}} />);
    const dialog = screen.getByRole('dialog', { name: /sign in/i });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveStyle({ color: COLORS.ink, background: COLORS.paper });
    expect(screen.getByTestId('magic-link-form')).toHaveTextContent('Sign in');
  });

  it('shows create-account heading for create intent', () => {
    render(<AuthSheet open intent="create" onClose={() => {}} onSuccess={() => {}} />);
    expect(screen.getByRole('dialog', { name: /create your account/i })).toBeInTheDocument();
    expect(screen.getByTestId('magic-link-form')).toHaveTextContent('Create your account');
  });

  it('dismisses on Escape and via the close button', async () => {
    const onClose = vi.fn();
    render(<AuthSheet open intent="signin" onClose={onClose} onSuccess={() => {}} />);
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: /close sign-in/i }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('dismisses when the backdrop is clicked', async () => {
    const onClose = vi.fn();
    render(<AuthSheet open intent="signin" onClose={onClose} onSuccess={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /dismiss sign-in/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // Flag off is what merges and what CI runs, so it is asserted as hard as the
  // flag-on path: the sheet must be exactly what shipped in #93/#94.
  describe('with Google off', () => {
    it('offers no Google button and no divider', () => {
      render(<AuthSheet open intent="signin" onClose={() => {}} onSuccess={() => {}} />);
      expect(screen.queryByRole('button', { name: /continue with google/i })).toBeNull();
      // A bare "or" left behind would change the sheet in the very state that
      // has to stay identical.
      expect(screen.queryByText(/^or$/i)).toBeNull();
      expect(screen.getByTestId('magic-link-form')).toBeInTheDocument();
    });

    it('never starts a Google flow', async () => {
      render(<AuthSheet open intent="signin" onClose={() => {}} onSuccess={() => {}} />);
      await userEvent.click(screen.getByRole('button', { name: /close sign-in/i }));
      expect(signInWithGoogle).not.toHaveBeenCalled();
    });
  });

  describe('with Google on', () => {
    beforeEach(() => isGoogleAuthConfigured.mockReturnValue(true));

    it('puts Google above the email form, separated by an "or" divider', () => {
      render(<AuthSheet open intent="signin" onClose={() => {}} onSuccess={() => {}} />);
      const google = screen.getByRole('button', { name: /continue with google/i });
      const form = screen.getByTestId('magic-link-form');
      expect(google).toBeInTheDocument();
      expect(screen.getByText(/^or$/i)).toBeInTheDocument();
      // Google is primary, so it comes first in the DOM and in the tab order.
      expect(google.compareDocumentPosition(form)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    });

    // The close button is absolute at the top right (12px down, 32px tall).
    // The sign-in sheet has no consent block above the providers, so without
    // this margin it sat on top of "Continue with Google".
    it('starts the providers below the close button on the sign-in sheet', () => {
      render(<AuthSheet open intent="signin" onClose={() => {}} onSuccess={() => {}} />);
      const providers = screen.getByTestId('auth-providers');
      expect(providers).toHaveStyle({ marginTop: `${SPACE[6]}px` });
    });

    it('routes the button to the handler App passes, not its own call', async () => {
      const onGoogle = vi.fn();
      render(
        <AuthSheet
          open
          intent="signin"
          onClose={() => {}}
          onSuccess={() => {}}
          onGoogle={onGoogle}
        />
      );
      await userEvent.click(screen.getByRole('button', { name: /continue with google/i }));
      expect(onGoogle).toHaveBeenCalledTimes(1);
    });

    // This used to assert toBeDisabled(). A disabled element leaves the tab
    // order, and inside a focus-trapped sheet that is worse than elsewhere: the
    // trap's first stop disappears mid-action. Button's `busy` blocks the click
    // without disabling — see GoogleButton.test.jsx.
    it('marks the button busy while a redirect is already in flight, without disabling it', () => {
      render(<AuthSheet open intent="signin" onClose={() => {}} onSuccess={() => {}} googleBusy />);
      const button = screen.getByRole('button', { name: /continue with google/i });
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(button).not.toBeDisabled();
    });

    it('keeps the email form intact — it gains a sibling, not a rewrite', () => {
      render(<AuthSheet open intent="create" onClose={() => {}} onSuccess={() => {}} />);
      expect(screen.getByTestId('magic-link-form')).toHaveTextContent('Create your account');
    });
  });

  describe('with Apple on', () => {
    beforeEach(() => isAppleAuthConfigured.mockReturnValue(true));

    // Alone, Apple gets the divider and the top slot.
    it('stands alone above the form, with the divider', () => {
      render(<AuthSheet open intent="signin" onClose={() => {}} onSuccess={() => {}} />);
      const apple = screen.getByRole('button', { name: /continue with apple/i });
      expect(screen.getByText(/^or$/i)).toBeInTheDocument();
      expect(apple.compareDocumentPosition(screen.getByTestId('magic-link-form'))).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      );
    });

    it('routes to its own handler and marks only itself busy', async () => {
      const onApple = vi.fn();
      const onGoogle = vi.fn();
      render(
        <AuthSheet
          open
          intent="signin"
          onClose={() => {}}
          onSuccess={() => {}}
          onApple={onApple}
          onGoogle={onGoogle}
          appleBusy
        />
      );
      const apple = screen.getByRole('button', { name: /continue with apple/i });
      expect(apple).toHaveAttribute('aria-busy', 'true');
      expect(apple).not.toBeDisabled();
    });
  });

  describe('with GitHub on', () => {
    beforeEach(() => isGitHubAuthConfigured.mockReturnValue(true));

    // Alone, GitHub gets everything Google would: the divider, the top slot.
    it('stands in for Google when Google is off — above the form, with the divider', () => {
      render(<AuthSheet open intent="signin" onClose={() => {}} onSuccess={() => {}} />);
      const github = screen.getByRole('button', { name: /continue with github/i });
      expect(screen.queryByRole('button', { name: /continue with google/i })).toBeNull();
      expect(screen.getByText(/^or$/i)).toBeInTheDocument();
      expect(github.compareDocumentPosition(screen.getByTestId('magic-link-form'))).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      );
    });

    it('routes the button to the handler App passes', async () => {
      const onGitHub = vi.fn();
      const onGoogle = vi.fn();
      render(
        <AuthSheet
          open
          intent="signin"
          onClose={() => {}}
          onSuccess={() => {}}
          onGoogle={onGoogle}
          onGitHub={onGitHub}
        />
      );
      await userEvent.click(screen.getByRole('button', { name: /continue with github/i }));
      expect(onGitHub).toHaveBeenCalledTimes(1);
      expect(onGoogle).not.toHaveBeenCalled();
    });

    it('marks only its own button busy', () => {
      isGoogleAuthConfigured.mockReturnValue(true);
      render(<AuthSheet open intent="signin" onClose={() => {}} onSuccess={() => {}} gitHubBusy />);
      const github = screen.getByRole('button', { name: /continue with github/i });
      expect(github).toHaveAttribute('aria-busy', 'true');
      expect(github).not.toBeDisabled();
      expect(screen.getByRole('button', { name: /continue with google/i })).not.toHaveAttribute(
        'aria-busy'
      );
    });

    // Both on: Google, then GitHub, then ONE divider, then the form.
    it('sits under Google when both are on, sharing a single divider', () => {
      isGoogleAuthConfigured.mockReturnValue(true);
      render(<AuthSheet open intent="signin" onClose={() => {}} onSuccess={() => {}} />);
      const google = screen.getByRole('button', { name: /continue with google/i });
      const github = screen.getByRole('button', { name: /continue with github/i });
      const form = screen.getByTestId('magic-link-form');
      expect(google.compareDocumentPosition(github)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(github.compareDocumentPosition(form)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
      expect(screen.getAllByText(/^or$/i)).toHaveLength(1);
    });
  });

  // ── Keyboard loop ──────────────────────────────────────────
  // The sheet claims `aria-modal="true"` and lays a scrim over the page, so it
  // asserts to assistive tech that nothing behind it is reachable. It was not
  // keeping that promise: Tab walked straight out into the page under the
  // scrim, and closing dropped focus to <body> rather than returning it to
  // whichever of the five triggers opened the sheet.
  //
  // Run under BOTH Google configurations. The rest of this file runs with the
  // flag off — "the merge state and the one CI runs" — but production runs with
  // it on, and that difference is not cosmetic: GoogleButton's `autoFocus`
  // fires during React's commit, ahead of this component's effects, which is
  // exactly what broke focus-restore in production while every test was green.
  // Testing focus-in under one flag and focus-return under the other left the
  // combination that ships completely uncovered.
  //
  // GitHub adds two more shipping states — alone, and under Google — and each
  // moves the autoFocus target, which is the thing this block exists to cover.
  describe.each([
    ['no providers', false, false],
    ['Google on', true, false],
    ['GitHub on', false, true],
    ['Google and GitHub on', true, true],
  ])('keyboard loop — %s', (_label, googleOn, gitHubOn) => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Sign in trigger
          </button>
          <AuthSheet
            open={open}
            intent="signin"
            onClose={() => setOpen(false)}
            onSuccess={() => {}}
          />
        </>
      );
    }

    beforeEach(() => {
      isGoogleAuthConfigured.mockReturnValue(googleOn);
      isGitHubAuthConfigured.mockReturnValue(gitHubOn);
    });

    const openSheet = async (user) => {
      const trigger = screen.getByRole('button', { name: 'Sign in trigger' });
      await user.click(trigger);
      return { trigger, dialog: await screen.findByRole('dialog') };
    };

    it('moves focus into the sheet when it opens', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      const { dialog } = await openSheet(user);
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    // Starts from the LAST control INSIDE the sheet. Tabbing from the trigger
    // instead passes by DOM-order coincidence — it lands on the close button,
    // which happens to be inside the dialog.
    it('wraps Tab from the last control back into the sheet', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      const { dialog } = await openSheet(user);

      const stops = dialog.querySelectorAll('a[href], button, input, select, textarea');
      expect(stops.length).toBeGreaterThan(0);
      stops[stops.length - 1].focus();
      expect(dialog.contains(document.activeElement)).toBe(true);

      await user.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    it('wraps Shift+Tab from the first control back into the sheet', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      const { dialog } = await openSheet(user);

      dialog.querySelector('button').focus();
      expect(dialog.contains(document.activeElement)).toBe(true);

      await user.tab({ shift: true });
      expect(dialog.contains(document.activeElement)).toBe(true);
    });

    // The one that shipped broken. With Google ON, autoFocus takes focus during
    // the commit, so an effect-time read of document.activeElement captures the
    // Google button rather than the trigger — and on close that node is gone,
    // so the restore silently skipped and focus fell to <body>.
    it('returns focus to the trigger on close', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      const { trigger, dialog } = await openSheet(user);

      dialog.querySelector('button').focus();
      expect(dialog.contains(document.activeElement)).toBe(true);

      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(document.activeElement).toBe(trigger);
    });

    // The scrim is a pointer affordance that duplicates the labelled "Close
    // sign-in" button, and `aria-modal` already hides it from assistive tech.
    // Leaving it in the tab order gave keyboard users a stop that screen
    // readers cannot announce.
    it('does not put the scrim in the tab order', async () => {
      const user = userEvent.setup();
      render(<Harness />);
      await openSheet(user);
      const scrim = screen.queryByRole('button', { name: /dismiss sign-in/i });
      expect(scrim === null || scrim.tabIndex === -1).toBe(true);
    });
  });

  // Guards the OTHER direction, and only makes sense with the flag on: with
  // Google configured, GoogleButton's autoFocus already lands focus on the
  // primary action. Moving focus to the sheet unconditionally would take it
  // away and bury the main affordance.
  describe('autoFocus', () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Sign in trigger
          </button>
          <AuthSheet
            open={open}
            intent="signin"
            onClose={() => setOpen(false)}
            onSuccess={() => {}}
          />
        </>
      );
    }

    it('leaves the primary action focused when Google is configured', async () => {
      isGoogleAuthConfigured.mockReturnValue(true);
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByRole('button', { name: 'Sign in trigger' }));
      expect(screen.getByRole('button', { name: /continue with google/i })).toHaveFocus();
    });

    // Two buttons each carrying autoFocus would leave focus on whichever
    // commits last — GitHub — and bury Google. Exactly one may carry it.
    it('keeps focus on Google, the first provider, when GitHub is on too', async () => {
      isGoogleAuthConfigured.mockReturnValue(true);
      isGitHubAuthConfigured.mockReturnValue(true);
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByRole('button', { name: 'Sign in trigger' }));
      expect(screen.getByRole('button', { name: /continue with google/i })).toHaveFocus();
    });

    it('focuses Apple when it is the only provider', async () => {
      isAppleAuthConfigured.mockReturnValue(true);
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByRole('button', { name: 'Sign in trigger' }));
      expect(screen.getByRole('button', { name: /continue with apple/i })).toHaveFocus();
    });

    it('focuses GitHub when it is the only provider', async () => {
      isGitHubAuthConfigured.mockReturnValue(true);
      const user = userEvent.setup();
      render(<Harness />);
      await user.click(screen.getByRole('button', { name: 'Sign in trigger' }));
      expect(screen.getByRole('button', { name: /continue with github/i })).toHaveFocus();
    });
  });
});

describe('AuthSheet — terms consent', () => {
  const draft = { email: '', sent: false, accepted: false };
  const base = { open: true, onClose: () => {}, onSuccess: () => {}, onDraftChange: () => {} };

  beforeEach(() => {
    isAuthConfigured.mockReturnValue(true);
    isGoogleAuthConfigured.mockReturnValue(false);
    isGitHubAuthConfigured.mockReturnValue(false);
    recordIntent.mockClear();
    clearIntent.mockClear();
    formProps.mockClear();
    formMode.real = false;
  });

  it('create sheet shows the unchecked consent; sign-in sheet does not', () => {
    const { rerender } = render(<AuthSheet {...base} intent="create" draft={draft} />);
    expect(screen.getByRole('checkbox', { name: /i agree/i })).not.toBeChecked();
    rerender(<AuthSheet {...base} intent="signin" draft={draft} />);
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('unchecked: Google does not start, error shown, focus on the box', async () => {
    isGoogleAuthConfigured.mockReturnValue(true);
    const onGoogle = vi.fn();
    render(<AuthSheet {...base} intent="create" draft={draft} onGoogle={onGoogle} />);
    await userEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    expect(onGoogle).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/^Required:/);
    expect(screen.getByRole('checkbox')).toHaveFocus();
    expect(recordIntent).not.toHaveBeenCalled();
  });

  it('bounds and scrolls the sheet when the consent error expands it', async () => {
    isGoogleAuthConfigured.mockReturnValue(true);
    render(<AuthSheet {...base} intent="create" draft={draft} onGoogle={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/^Required:/);

    // jsdom cannot measure viewport layout, so guard the CSS contract that keeps
    // the close button and the submit on screen at 320×568 (they were clipped).
    expect(screen.getByRole('dialog', { name: 'Create your account' })).toHaveStyle({
      maxHeight: '100%',
      overflowY: 'auto',
    });
  });

  it('unchecked: GitHub does not start either', async () => {
    isGitHubAuthConfigured.mockReturnValue(true);
    const onGitHub = vi.fn();
    render(<AuthSheet {...base} intent="create" draft={draft} onGitHub={onGitHub} />);
    await userEvent.click(screen.getByRole('button', { name: /continue with github/i }));
    expect(onGitHub).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(recordIntent).not.toHaveBeenCalled();
  });

  it('checked: Google starts and the intent is recorded', async () => {
    isGoogleAuthConfigured.mockReturnValue(true);
    const onGoogle = vi.fn();
    render(
      <AuthSheet
        {...base}
        intent="create"
        draft={{ ...draft, accepted: true }}
        onGoogle={onGoogle}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    expect(recordIntent).toHaveBeenCalledTimes(1);
    expect(onGoogle).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('Apple obeys the same consent guard', async () => {
    isAppleAuthConfigured.mockReturnValue(true);
    const onApple = vi.fn();
    const { rerender } = render(
      <AuthSheet {...base} intent="create" draft={draft} onApple={onApple} />
    );
    await userEvent.click(screen.getByRole('button', { name: /continue with apple/i }));
    expect(onApple).not.toHaveBeenCalled();
    rerender(
      <AuthSheet {...base} intent="create" draft={{ ...draft, accepted: true }} onApple={onApple} />
    );
    await userEvent.click(screen.getByRole('button', { name: /continue with apple/i }));
    expect(onApple).toHaveBeenCalledTimes(1);
    expect(recordIntent).toHaveBeenCalled();
  });

  it('checked: GitHub starts and the intent is recorded', async () => {
    isGitHubAuthConfigured.mockReturnValue(true);
    const onGitHub = vi.fn();
    render(
      <AuthSheet
        {...base}
        intent="create"
        draft={{ ...draft, accepted: true }}
        onGitHub={onGitHub}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /continue with github/i }));
    expect(recordIntent).toHaveBeenCalledTimes(1);
    expect(onGitHub).toHaveBeenCalledTimes(1);
  });

  it('unchecked: the email path is refused too', async () => {
    render(<AuthSheet {...base} intent="create" draft={draft} />);
    await userEvent.click(screen.getByTestId('magic-link-form'));
    expect(recordIntent).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('checkbox')).toHaveFocus();
  });

  it('checked: the email path is allowed and records the intent', async () => {
    render(<AuthSheet {...base} intent="create" draft={{ ...draft, accepted: true }} />);
    await userEvent.click(screen.getByTestId('magic-link-form'));
    expect(recordIntent).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sign-in sheet clears any stale intent and never blocks', async () => {
    isGoogleAuthConfigured.mockReturnValue(true);
    const onGoogle = vi.fn();
    render(<AuthSheet {...base} intent="signin" draft={draft} onGoogle={onGoogle} />);
    await userEvent.click(screen.getByRole('button', { name: /continue with google/i }));
    expect(clearIntent).toHaveBeenCalled();
    expect(recordIntent).not.toHaveBeenCalled();
    expect(onGoogle).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sign-in sheet: the email path clears the intent and is never blocked', async () => {
    render(<AuthSheet {...base} intent="signin" draft={draft} />);
    await userEvent.click(screen.getByTestId('magic-link-form'));
    expect(clearIntent).toHaveBeenCalledTimes(1);
    expect(recordIntent).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('ticking the box reports upward', async () => {
    const onDraftChange = vi.fn();
    render(<AuthSheet {...base} intent="create" draft={draft} onDraftChange={onDraftChange} />);
    await userEvent.click(screen.getByRole('checkbox'));
    expect(onDraftChange).toHaveBeenCalledWith({ accepted: true });
  });

  it('ticking the box clears a shown error', async () => {
    render(<AuthSheet {...base} intent="create" draft={draft} />);
    await userEvent.click(screen.getByTestId('magic-link-form'));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a reopened sheet starts without the previous error', async () => {
    const { rerender } = render(<AuthSheet {...base} intent="create" draft={draft} />);
    await userEvent.click(screen.getByTestId('magic-link-form'));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    rerender(<AuthSheet {...base} open={false} intent="create" draft={draft} />);
    rerender(<AuthSheet {...base} intent="create" draft={draft} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('the terms link navigates in-app through onNavigateLegal', async () => {
    const onNavigateLegal = vi.fn();
    render(<AuthSheet {...base} intent="create" draft={draft} onNavigateLegal={onNavigateLegal} />);
    await userEvent.click(screen.getByRole('link', { name: /terms of service/i }));
    expect(onNavigateLegal).toHaveBeenCalledWith('/terms');
  });

  it('focusConsent puts focus on the box', () => {
    render(<AuthSheet {...base} intent="create" draft={draft} focusConsent />);
    expect(screen.getByRole('checkbox')).toHaveFocus();
  });

  describe('the email draft', () => {
    it('is handed to the form, without the consent flag, when the caller lifts it', () => {
      const onDraftChange = vi.fn();
      render(
        <AuthSheet
          {...base}
          intent="create"
          draft={{ email: 'a@b.de', sent: true, accepted: true }}
          onDraftChange={onDraftChange}
        />
      );
      const props = formProps.mock.lastCall[0];
      expect(props.draft).toEqual({ email: 'a@b.de', sent: true });
      expect(props.onDraftChange).toBe(onDraftChange);
    });

    it('is not forced on the form when the caller omits it — the email field stays typeable', async () => {
      formMode.real = true;
      render(<AuthSheet open intent="create" onClose={() => {}} onSuccess={() => {}} />);
      const props = formProps.mock.lastCall[0];
      expect(props.draft).toBeUndefined();
      expect(props.onDraftChange).toBeUndefined();
      await userEvent.type(screen.getByLabelText('Email'), 'a@b.de');
      expect(screen.getByLabelText('Email')).toHaveValue('a@b.de');
    });

    it('is not forced on the form when only one of the two is given', () => {
      render(
        <AuthSheet open intent="create" draft={draft} onClose={() => {}} onSuccess={() => {}} />
      );
      const props = formProps.mock.lastCall[0];
      expect(props.draft).toBeUndefined();
      expect(props.onDraftChange).toBeUndefined();
    });
  });
});
