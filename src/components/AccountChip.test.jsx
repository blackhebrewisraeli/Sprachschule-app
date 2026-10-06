import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AccountChip from './AccountChip';

// Pin the auth-configured state rather than inheriting it from the ambient env.
// These tests previously passed locally only because a developer .env happened to
// set VITE_SUPABASE_URL; CI has no .env, so isAuthConfigured() was false there and
// the guest cases below broke. The state under test is now explicit either way.
vi.mock('../lib/auth.js', () => ({ isAuthConfigured: () => true }));

describe('AccountChip', () => {
  it('shows a Sign in affordance for guests', async () => {
    const onSignIn = vi.fn();
    render(<AccountChip user={null} onSignIn={onSignIn} onSignOut={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(onSignIn).toHaveBeenCalled();
  });

  // Guest Sign in sits directly on the charcoal masthead. The default ink ring
  // is 1:1 there; data-focus-on-dark is the shared dark-plane opt-in.
  it('opts the guest Sign in control into the dark-plane focus ring', () => {
    render(<AccountChip user={null} onSignIn={() => {}} onSignOut={() => {}} />);
    const btn = screen.getByRole('button', { name: /sign in/i });
    expect(btn).toHaveAttribute('data-ui', 'button');
    expect(btn).toHaveAttribute('data-focus-on-dark');
  });

  it('shows the email initial and opens a sheet with sign out for signed-in users', async () => {
    const onSignOut = vi.fn();
    render(
      <AccountChip user={{ email: 'sam@example.com' }} onSignIn={() => {}} onSignOut={onSignOut} />
    );
    const chip = screen.getByRole('button', { name: /account/i });
    expect(chip).toHaveTextContent('S'); // initial
    await userEvent.click(chip);
    expect(screen.getByText('sam@example.com')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalled();
  });

  // Own surface disc on charcoal: an outset ink ring would paint onto the
  // masthead. Inset keeps it on the disc, same contract InteractiveCard uses.
  it('keeps the signed-in avatar ring on its own surface', () => {
    render(
      <AccountChip user={{ email: 'sam@example.com' }} onSignIn={() => {}} onSignOut={() => {}} />
    );
    const chip = screen.getByRole('button', { name: /account/i });
    expect(chip).toHaveAttribute('data-ui', 'button');
    expect(chip).toHaveAttribute('data-focus-inset');
    expect(chip).not.toHaveAttribute('data-focus-on-dark');
  });

  // The sheet used to advertise `aria-haspopup="true"` (menu) over a panel with
  // no role, so a screen reader was told "menu", opened it, and found an
  // unlabelled div. It is a small panel with mixed content — email text plus
  // one action — which is a dialog, not a menu.
  it('advertises and renders a labelled dialog, not a menu', async () => {
    render(<AccountChip user={{ email: 'a@b.co' }} onSignOut={() => {}} />);
    const trigger = screen.getByRole('button', { name: 'Account' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Account' })).toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // A menu was never actually rendered; assert it is not one now either.
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    render(<AccountChip user={{ email: 'a@b.co' }} onSignOut={() => {}} />);
    const trigger = screen.getByRole('button', { name: 'Account' });
    await userEvent.click(trigger);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('closes on an outside click but not on a click inside', async () => {
    render(
      <div>
        <AccountChip user={{ email: 'a@b.co' }} onSignOut={() => {}} />
        <button type="button">elsewhere</button>
      </div>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Account' }));
    // Inside first — a sheet that closes on its own content is unusable.
    await userEvent.click(screen.getByText('a@b.co'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'elsewhere' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows a pending-sync dot when sync is queued', () => {
    render(
      <AccountChip
        user={{ email: 'sam@example.com' }}
        onSignIn={() => {}}
        onSignOut={() => {}}
        pending
      />
    );
    expect(screen.getByLabelText(/sync pending/i)).toBeInTheDocument();
  });
});

// The account surface must disappear when auth is not configured. Production hit
// this on 2026-08-01: the Supabase project behind the demo stopped resolving, and
// WelcomeGate hid its buttons (it checks isAuthConfigured) while this chip kept
// offering "Sign in" — a dead affordance on the live site.
describe('AccountChip when auth is not configured', () => {
  it('renders nothing for a guest', async () => {
    vi.resetModules();
    vi.doMock('../lib/auth.js', () => ({ isAuthConfigured: () => false }));
    const { default: Chip } = await import('./AccountChip');
    const { container } = render(<Chip user={null} onSignIn={() => {}} onSignOut={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    vi.doUnmock('../lib/auth.js');
  });

  it('still renders for an already signed-in user so they can sign out', async () => {
    vi.resetModules();
    vi.doMock('../lib/auth.js', () => ({ isAuthConfigured: () => false }));
    const { default: Chip } = await import('./AccountChip');
    render(<Chip user={{ email: 'sam@example.com' }} onSignIn={() => {}} onSignOut={() => {}} />);
    expect(screen.getByRole('button', { name: /account/i })).toBeInTheDocument();
    vi.doUnmock('../lib/auth.js');
  });
});

// The chip is the ONLY door to Settings: Home's identity strip no longer
// carries a Settings link of its own. It still defers full management to that
// route rather than growing a second copy of it.
describe('AccountChip → Settings', () => {
  const renderChip = (over = {}) =>
    render(
      <AccountChip
        user={{ email: 'sam@example.com' }}
        onSignIn={() => {}}
        onSignOut={() => {}}
        {...over}
      />
    );

  it('offers a Settings entry that opens the route and closes the sheet', async () => {
    const onOpenSettings = vi.fn();
    renderChip({ onOpenSettings });
    await userEvent.click(screen.getByRole('button', { name: /account/i }));
    await userEvent.click(screen.getByRole('button', { name: /open settings/i }));

    expect(onOpenSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /sign out/i })).not.toBeInTheDocument();
  });

  it('offers an Edit Profile row that opens the editor route and closes the sheet', async () => {
    const onEditProfile = vi.fn();
    renderChip({ onEditProfile });
    await userEvent.click(screen.getByRole('button', { name: /account/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit Profile' }));

    expect(onEditProfile).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: /account/i })).not.toBeInTheDocument();
  });

  // The sheet carried a "Profile →" row beside Settings until the tabbed
  // Settings route made it a second name for the same destination. Asserted as
  // a COUNT as well as an absence: a sheet that regrew the row would still pass
  // a bare `queryByRole('open settings')`, and "no profile row" is only half
  // the claim — the other half is that Settings did not get duplicated in its
  // place. Sign out is excluded because it is not a navigation row.
  // This guard used to read "offers exactly one navigation row, and it is not
  // Profile". #314 removed the Profile row because both rows landed on the
  // SAME tab — Profile on its overview view, Settings on the deeper one — and
  // two names for one place, inches apart, read as two destinations.
  //
  // That premise is gone. The Profile tab is now one consolidated page and
  // Settings is a route off it with its own back link, so these are two
  // genuinely different destinations and the sheet may name both.
  it('offers Profile and Settings as two distinct destinations', async () => {
    const onOpenProfile = vi.fn();
    const onOpenSettings = vi.fn();
    renderChip({ onOpenProfile, onOpenSettings });
    await userEvent.click(screen.getByRole('button', { name: /account/i }));

    await userEvent.click(screen.getByRole('button', { name: /your profile/i }));
    expect(onOpenProfile).toHaveBeenCalled();
    expect(onOpenSettings).not.toHaveBeenCalled();
  });

  it('still offers exactly one Settings entry', async () => {
    renderChip({ onOpenSettings: () => {} });
    await userEvent.click(screen.getByRole('button', { name: /account/i }));
    expect(screen.getAllByRole('button', { name: /open settings/i })).toHaveLength(1);
  });

  // The email line is the sheet's other content and shares its ink; it stayed
  // when the Profile row went.
  it('still shows the account email', async () => {
    renderChip({ onOpenSettings: () => {} });
    await userEvent.click(screen.getByRole('button', { name: /account/i }));

    expect(screen.getByText('sam@example.com')).toBeInTheDocument();
  });
});

// ── The account sheet as an identity surface ────────────────────────
//
// It was a bare popover: an email line and two text links, no avatar, no
// name, no grouping. Everything it needed to identify the person was already
// fetched for the Profile page.
describe('AccountChip — identity header and grouped rows', () => {
  const PROFILE = { display_name: 'Sam Vimes', handle: 'sam', avatar_path: null };
  const open = async (over = {}) => {
    render(
      <AccountChip
        user={{ id: 'u1', email: 'sam@example.com' }}
        profile={PROFILE}
        onSignIn={() => {}}
        onSignOut={() => {}}
        onOpenSettings={() => {}}
        onOpenProfile={() => {}}
        {...over}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /account/i }));
  };

  it('leads with the avatar, the display name and the handle', async () => {
    await open();
    const sheet = screen.getByRole('dialog', { name: /account/i });
    const identity = within(sheet).getByTestId('account-identity');
    expect(within(sheet).getByText('Sam Vimes')).toBeInTheDocument();
    expect(within(sheet).getByText('@sam')).toBeInTheDocument();
    expect(within(identity).getByText('sam@example.com')).toBeInTheDocument();
    expect(identity.querySelector('[data-avatar]')).toHaveAttribute('width', '64');
  });

  it('falls back to the handle, then the anonymous label, never a blank header', async () => {
    await open({ profile: { display_name: null, handle: 'sam' } });
    expect(within(screen.getByRole('dialog')).getByText('sam')).toBeInTheDocument();
  });

  it('keeps the email in the identity block, on a deliberately smaller face', async () => {
    await open();
    const email = screen.getByText('sam@example.com');
    expect(email).toBeInTheDocument();
    expect(email.getAttribute('style')).toMatch(/--f-mono/);
    expect(email).toHaveStyle({ fontSize: '9px' });
    expect(screen.getByTestId('account-identity')).toContainElement(email);
  });

  it('separates the groups with real dividers rather than bare whitespace', async () => {
    await open();
    const sheet = screen.getByRole('dialog');
    const divided = [...sheet.querySelectorAll('[style*="border-top"]')];
    expect(divided.length).toBeGreaterThanOrEqual(2);
    // The token the owner specified for dividers.
    expect(divided.some((el) => /--c-fg-muted/.test(el.getAttribute('style')))).toBe(true);
  });

  it('gives every row an icon, so the list reads as a menu and not as prose', async () => {
    await open();
    const sheet = screen.getByRole('dialog');
    for (const name of [/your profile/i, /edit profile/i, /open settings/i, /sign out/i]) {
      const row = within(sheet).getByRole('button', { name });
      expect(row.querySelector('svg'), `${name} icon`).toBeTruthy();
    }
  });

  it('keeps Sign out visually separated and in the danger colour', async () => {
    await open();
    const out = screen.getByRole('button', { name: /sign out/i });
    expect(out.getAttribute('style')).toMatch(/--c-(red|error)/);
  });
});

// ── Status ──────────────────────────────────────────────────────────
describe('AccountChip — set status', () => {
  // A status SURVIVES a remount — that is the point of storing it — so each
  // case has to start from a known empty store or the previous one's status
  // is still there and the control is labelled "Edit status".
  beforeEach(() => localStorage.clear());

  const open = async (over = {}) => {
    render(
      <AccountChip
        user={{ id: 'u1', email: 'sam@example.com' }}
        profile={{ display_name: 'Sam Vimes', handle: 'sam' }}
        onSignIn={() => {}}
        onSignOut={() => {}}
        onOpenSettings={() => {}}
        onOpenProfile={() => {}}
        {...over}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /account/i }));
  };

  it('offers a Set status control in the header', async () => {
    await open();
    expect(screen.getByRole('button', { name: /set status/i })).toBeInTheDocument();
  });

  it('saves a status and shows it in place of the prompt', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: /set status/i }));
    await userEvent.type(screen.getByRole('textbox', { name: /status/i }), 'Lerne Perfekt');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(screen.getByText('Lerne Perfekt')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^set status$/i })).toBeNull();
  });

  it('strips control characters before storing a status', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: /set status/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /status/i }), {
      target: { value: 'Lerne\n\u0000Perfekt' },
    });
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(localStorage.getItem('deutsch-account-status')).toBe('LernePerfekt');
  });

  it('strips angle brackets so a status can never carry a well-formed tag', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: /set status/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /status/i }), {
      target: { value: '<img src=x onerror=alert(1)>Lerne Perfekt' },
    });
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(localStorage.getItem('deutsch-account-status')).toBe(
      'img src=x onerror=alert(1)Lerne Perfekt'
    );
  });

  it('truncates a status to the hard limit before storing it', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: /set status/i }));
    fireEvent.change(screen.getByRole('textbox', { name: /status/i }), {
      target: { value: 'x'.repeat(81) },
    });
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(localStorage.getItem('deutsch-account-status')).toBe('x'.repeat(80));
  });

  it('rejects non-string status values', async () => {
    const getItem = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockReturnValue({ status: 'Lerne Perfekt' });

    try {
      await open();
      expect(screen.getByRole('button', { name: /set status/i })).toBeInTheDocument();
    } finally {
      getItem.mockRestore();
    }
  });

  it('sanitizes a status written by an older build before displaying it', async () => {
    localStorage.setItem('deutsch-account-status', '  Lerne\n\u0000Perfekt  ');
    await open();

    expect(screen.getByRole('button', { name: /edit status/i }).textContent).toBe('LernePerfekt');
  });

  it('can clear a status it previously set', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: /set status/i }));
    await userEvent.type(screen.getByRole('textbox', { name: /status/i }), 'Lerne Perfekt');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));
    await userEvent.click(screen.getByRole('button', { name: /edit status/i }));
    await userEvent.click(screen.getByRole('button', { name: /clear/i }));

    expect(screen.queryByText('Lerne Perfekt')).toBeNull();
    expect(screen.getByRole('button', { name: /set status/i })).toBeInTheDocument();
  });

  it('remembers the status across a remount', async () => {
    // Local-only persistence, but persistence: the sheet must not forget a
    // status the moment it closes.
    await open();
    await userEvent.click(screen.getByRole('button', { name: /set status/i }));
    await userEvent.type(screen.getByRole('textbox', { name: /status/i }), 'Lerne Perfekt');
    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    cleanup();
    await open();
    expect(screen.getByText('Lerne Perfekt')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit status/i })).toBeInTheDocument();
  });
});
