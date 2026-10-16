import { describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import EmailSection from './EmailSection';
import { REAUTH_MAX_AGE_SEC } from '../../lib/authClaims.js';

const user = { id: 'u1', email: 'old@example.com' };
const NEW = 'new@example.com';

/**
 * A token whose amr says the person authenticated `ageSec` ago.
 *
 * Built rather than stubbed, so these tests exercise the REAL claim reader —
 * the gate is only worth having if the thing it calls actually parses a token.
 */
const tokenAged = (ageSec) => {
  const claims = { amr: [{ method: 'otp', timestamp: Math.floor(Date.now() / 1000) - ageSec }] };
  const b64 = btoa(JSON.stringify(claims))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `header.${b64}.signature`;
};

const fresh = () => vi.fn().mockResolvedValue(tokenAged(60));
const stale = () => vi.fn().mockResolvedValue(tokenAged(REAUTH_MAX_AGE_SEC + 60));

const setup = (props = {}) => {
  const request = props.request ?? vi.fn().mockResolvedValue({ data: {}, error: null });
  const verify = props.verify ?? vi.fn().mockResolvedValue({ data: { user }, error: null });
  const readToken = props.readToken ?? fresh();
  render(
    <EmailSection user={user} request={request} verify={verify} readToken={readToken} {...props} />
  );
  return { request, verify, readToken };
};

const changeBtn = () => screen.getByRole('button', { name: /change email/i });
const sendBtn = () => screen.getByRole('button', { name: /send codes/i });
const confirmBtns = () => screen.getAllByRole('button', { name: /^confirm$/i });
const codeField = (which) =>
  screen.getByRole('textbox', { name: new RegExp(`code from your ${which} address`, 'i') });

/**
 * A button's React onClick, called directly. React drops clicks on a disabled
 * button, so no user event reaches confirm() once Confirm is disabled; a stale
 * handler or a console call still could. This proves the guard INSIDE confirm()
 * holds on its own, not just the disabled attribute in front of it.
 */
const callOnClick = (button) => {
  const key = Object.keys(button).find((k) => k.startsWith('__reactProps$'));
  return button[key].onClick();
};

/** Walk from idle to the two-code stage. */
const reachConfirming = async (over = {}) => {
  const api = setup(over);
  await userEvent.click(changeBtn());
  await userEvent.type(screen.getByRole('textbox', { name: /new email/i }), NEW);
  await userEvent.click(sendBtn());
  return api;
};

describe('EmailSection', () => {
  it('shows the current address', () => {
    setup();
    expect(screen.getByText('old@example.com')).toBeInTheDocument();
  });

  it('renders nothing for a guest', () => {
    const { container } = render(<EmailSection user={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  // ── the re-auth gate ──────────────────────────────────────────
  //
  // Dual confirmation stops a REMOTE attacker, who cannot read the original
  // mailbox. It does nothing when someone has the device, because the mailbox
  // is usually open in the next tab. This is the control that covers that.

  it('demands a fresh sign-in when the last authentication is too old', async () => {
    const { request } = setup({ readToken: stale() });
    await userEvent.click(changeBtn());

    expect(screen.getByText(/sign in again before changing your email/i)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /new email/i })).not.toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it('routes the stale case back to sign-in', async () => {
    const onReauth = vi.fn();
    setup({ readToken: stale(), onReauth });
    await userEvent.click(changeBtn());
    await userEvent.click(screen.getByRole('button', { name: /sign in again/i }));
    expect(onReauth).toHaveBeenCalled();
  });

  it('fails CLOSED on a token with no amr timestamps', async () => {
    // The RFC-8176 string form: we know WHICH method was used, not WHEN.
    const b64 = btoa(JSON.stringify({ amr: ['otp'] })).replace(/=+$/, '');
    const { request } = setup({ readToken: vi.fn().mockResolvedValue(`h.${b64}.s`) });
    await userEvent.click(changeBtn());
    expect(screen.getByText(/sign in again before changing your email/i)).toBeInTheDocument();
    expect(request).not.toHaveBeenCalled();
  });

  it('lets a recently authenticated learner straight through', async () => {
    setup();
    await userEvent.click(changeBtn());
    expect(screen.getByRole('textbox', { name: /new email/i })).toBeInTheDocument();
  });

  // ── requesting the change ─────────────────────────────────────

  it('asks Supabase to move the account, and says BOTH inboxes must confirm', async () => {
    const { request } = await reachConfirming();
    expect(request).toHaveBeenCalledWith(NEW);
    const note = screen.getByText(/we sent a code to/i);
    expect(note).toHaveTextContent('old@example.com');
    expect(note).toHaveTextContent(NEW);
  });

  it('refuses to send the address the account already has', async () => {
    setup();
    await userEvent.click(changeBtn());
    await userEvent.type(screen.getByRole('textbox', { name: /new email/i }), user.email);
    expect(sendBtn()).toBeDisabled();
  });

  it('surfaces the server wording when the request is rejected', async () => {
    const request = vi.fn().mockResolvedValue({ error: { message: 'Email address is invalid' } });
    setup({ request });
    await userEvent.click(changeBtn());
    await userEvent.type(screen.getByRole('textbox', { name: /new email/i }), NEW);
    await userEvent.click(sendBtn());
    expect(screen.getByText(/email address is invalid/i)).toBeInTheDocument();
    expect(screen.queryByText(/we sent a code to/i)).not.toBeInTheDocument();
  });

  // ── confirming ────────────────────────────────────────────────

  it('verifies the CURRENT address against the old email, not the new one', async () => {
    const { verify } = await reachConfirming();
    const codes = screen.getAllByRole('textbox');
    await userEvent.type(codes[0], '111111');
    await userEvent.click(confirmBtns()[0]);
    expect(verify).toHaveBeenCalledWith('old@example.com', '111111');
  });

  it('verifies the NEW address against the new email', async () => {
    const { verify } = await reachConfirming();
    const codes = screen.getAllByRole('textbox');
    await userEvent.type(codes[1], '222222');
    await userEvent.click(confirmBtns()[1]);
    expect(verify).toHaveBeenCalledWith(NEW, '222222');
  });

  // The session still carrying the OLD address is how Supabase reports "one
  // side done, still waiting on the other" — the flow must not claim success.
  it('stays open when one side is confirmed and the other is not', async () => {
    const verify = vi.fn().mockResolvedValue({ data: { user: { email: user.email } } });
    const onToast = vi.fn();
    await reachConfirming({ verify, onToast });
    await userEvent.type(screen.getAllByRole('textbox')[0], '111111');
    await userEvent.click(confirmBtns()[0]);

    expect(screen.getByText(/confirmed/i)).toBeInTheDocument();
    expect(onToast).not.toHaveBeenCalled();
    expect(screen.getByText(/we sent a code to/i)).toBeInTheDocument();
  });

  it('finishes once the session reports the NEW address', async () => {
    const verify = vi.fn().mockResolvedValue({ data: { user: { email: NEW } } });
    const onToast = vi.fn();
    await reachConfirming({ verify, onToast });
    await userEvent.type(screen.getAllByRole('textbox')[0], '111111');
    await userEvent.click(confirmBtns()[0]);

    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/email updated/i));
    expect(screen.queryByText(/we sent a code to/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /change email/i })).toBeInTheDocument();
  });

  // Secure email change OFF is a project setting this component cannot read and
  // an admin can flip without a deploy. Keying on the RESULT rather than on a
  // count of confirmations is what makes one configuration not break the other.
  it('completes on a SINGLE confirmation when only one is required', async () => {
    const verify = vi.fn().mockResolvedValue({ data: { user: { email: NEW } } });
    const onToast = vi.fn();
    await reachConfirming({ verify, onToast });
    await userEvent.type(screen.getAllByRole('textbox')[1], '222222');
    await userEvent.click(confirmBtns()[1]);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(onToast).toHaveBeenCalledWith(expect.stringMatching(/email updated/i));
  });

  it('reports a bad code and keeps the field open for another try', async () => {
    const verify = vi.fn().mockResolvedValue({ error: { message: 'Token has expired' } });
    await reachConfirming({ verify });
    await userEvent.type(screen.getAllByRole('textbox')[0], '000000');
    await userEvent.click(confirmBtns()[0]);
    expect(screen.getByText(/token has expired/i)).toBeInTheDocument();
    expect(screen.getByText(/we sent a code to/i)).toBeInTheDocument();
  });

  it('locks Confirm while a code is being checked', async () => {
    let settle;
    const verify = vi.fn(() => new Promise((resolve) => (settle = resolve)));
    await reachConfirming({ verify });
    await userEvent.type(codeField('current'), '12345678');
    await userEvent.type(codeField('new'), '87654321');
    await userEvent.click(confirmBtns()[0]);

    expect(verify).toHaveBeenCalledTimes(1);
    expect(confirmBtns()[1]).toBeDisabled();
    await act(async () => settle({ data: { user: { email: user.email } } }));
    expect(confirmBtns()).toHaveLength(1);
    expect(confirmBtns()[0]).toBeEnabled();
  });

  // ── code length ───────────────────────────────────────────────
  //
  // Supabase lets a project set its email OTP anywhere from 6 to 10 digits, and
  // this component cannot read which: production mails 8, local config 6. The
  // client accepts the whole range and leaves the real check to verifyOtp.

  it.each([
    ['a 6-digit code (local config)', '123456'],
    ['an 8-digit code (production)', '12345678'],
    ['a 10-digit code (the upper bound)', '1234567890'],
  ])('enables Confirm for %s and submits it', async (_, code) => {
    const { verify } = await reachConfirming();
    await userEvent.type(codeField('current'), code);
    expect(confirmBtns()[0]).toBeEnabled();
    await userEvent.click(confirmBtns()[0]);
    expect(verify).toHaveBeenCalledWith('old@example.com', code);
  });

  // A change event sets the value whole. maxLength only limits typing, so this
  // is what lets the 11-digit case reach the check at all.
  const INVALID = [
    ['a blank code', ''],
    ['a whitespace-only code', '      '],
    ['a 5-digit code', '12345'],
    ['an 11-digit code', '12345678901'],
    ['a letters-only code', 'abcdef'],
    ['digits with a letter', '12345a'],
    ['digits with an inner space', '123 45'],
  ];

  it.each(INVALID)('keeps Confirm disabled for %s', async (_, value) => {
    await reachConfirming();
    fireEvent.change(codeField('current'), { target: { value } });
    expect(confirmBtns()[0]).toBeDisabled();
  });

  it.each(INVALID)('confirm() refuses %s even past the disabled button', async (_, value) => {
    const { verify } = await reachConfirming();
    fireEvent.change(codeField('current'), { target: { value } });
    await act(async () => callOnClick(confirmBtns()[0]));
    expect(verify).not.toHaveBeenCalled();
  });

  it('labels both code fields and marks them numeric, 6–10 digits, with no length in the copy', async () => {
    await reachConfirming();
    for (const field of [codeField('current'), codeField('new')]) {
      expect(field).toHaveAttribute('inputmode', 'numeric');
      expect(field).toHaveAttribute('pattern', '[0-9]{6,10}');
      expect(field).toHaveAttribute('maxlength', '10');
    }
    expect(screen.queryByText(/digit/i)).not.toBeInTheDocument();
  });

  it('abandons the whole flow on Cancel', async () => {
    await reachConfirming();
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText(/we sent a code to/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /change email/i })).toBeInTheDocument();
  });
});
