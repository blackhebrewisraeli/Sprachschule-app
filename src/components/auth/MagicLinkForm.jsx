import { useState, useEffect, useRef } from 'react';
import { COLORS, FONTS, FONT_SIZE, RADIUS, BORDER } from '../../lib/theme';
import { signInWithMagicLink, verifyCode, humanAuthError } from '../../lib/auth.js';
import Button from '../ui/Button';

// Two-state passwordless form: email entry → inbox/code entry. The email
// carries both a 6-digit code (typed here — the installed-PWA path) and a
// magic link (browser convenience). Copy is code-first. onSuccess fires
// after verifyOtp.
//
// `draft` / `onDraftChange` lift { email, sent } to the parent: the create-account
// sheet unmounts this form on a trip to /terms or /privacy and must get the
// draft back. Uncontrolled (local state) when no `draft` is passed. `beforeStart`
// gates send, resend AND verify — `false` aborts with no network call.
export default function MagicLinkForm({
  heading,
  onSuccess,
  draft,
  onDraftChange,
  beforeStart = () => true,
}) {
  const [localDraft, setLocalDraft] = useState({ email: '', sent: false });
  const { email, sent } = draft ?? localDraft;
  const update = onDraftChange ?? ((patch) => setLocalDraft((d) => ({ ...d, ...patch })));
  const setEmail = (value) => update({ email: value });
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const intervalRef = useRef(null);

  // Start a 1-second interval each time the cooldown is set to a positive value
  // via resend(). The functional updater means we never need resendCooldown in
  // the dep array — the interval clears itself when it decrements to 0, and the
  // cleanup fires on unmount.
  const startCooldown = (seconds) => {
    clearInterval(intervalRef.current);
    setResendCooldown(seconds);
    intervalRef.current = setInterval(() => {
      setResendCooldown((s) => {
        if (s <= 1) {
          clearInterval(intervalRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  // Clear interval on unmount.
  useEffect(() => () => clearInterval(intervalRef.current), []);

  // BORDER.standard is a full border shorthand — no .width property exists in theme.
  const input = {
    width: '100%',
    padding: '12px 14px',
    fontFamily: FONTS.mono,
    fontSize: FONT_SIZE.md,
    border: BORDER.standard,
    borderRadius: RADIUS.md,
    marginBottom: 12,
    boxSizing: 'border-box',
    background: COLORS.card,
    color: COLORS.ink,
  };

  const send = async () => {
    if (busy || !beforeStart()) return;
    setBusy(true);
    setError('');
    const { error: e } = await signInWithMagicLink(email.trim());
    setBusy(false);
    if (e) setError(humanAuthError(e));
    else update({ sent: true });
  };

  const resend = async () => {
    if (busy || resendCooldown > 0 || !beforeStart()) return;
    setBusy(true);
    setError('');
    const { error: e } = await signInWithMagicLink(email.trim());
    setBusy(false);
    if (e) setError(humanAuthError(e));
    else startCooldown(30);
  };

  const verify = async () => {
    if (busy || !beforeStart()) return;
    setBusy(true);
    setError('');
    const { error: e } = await verifyCode(email.trim(), code.trim());
    setBusy(false);
    if (e) setError(humanAuthError(e));
    else onSuccess();
  };

  return (
    <div style={{ maxWidth: 360, margin: '0 auto', fontFamily: FONTS.body, color: COLORS.ink }}>
      <h2 style={{ fontFamily: FONTS.display, color: COLORS.ink }}>{heading}</h2>
      {!sent ? (
        <>
          <label
            htmlFor="ml-email"
            style={{ fontFamily: FONTS.mono, fontSize: FONT_SIZE.tag, color: COLORS.mute }}
          >
            Email
          </label>
          <input
            id="ml-email"
            type="email"
            style={input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button onClick={send} disabled={busy || !email.includes('@')}>
            Email me a sign-in code
          </Button>
        </>
      ) : (
        <>
          <p style={{ color: COLORS.ink }}>
            Enter the 6-digit code — or tap the link in the email.
          </p>
          <label
            htmlFor="ml-code"
            style={{ fontFamily: FONTS.mono, fontSize: FONT_SIZE.tag, color: COLORS.mute }}
          >
            Code
          </label>
          <input
            id="ml-code"
            inputMode="numeric"
            style={input}
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <Button onClick={verify} disabled={busy || code.length < 6}>
            Verify code
          </Button>
          <Button onClick={resend} disabled={busy || resendCooldown > 0} style={{ marginTop: 8 }}>
            {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend email'}
          </Button>
        </>
      )}
      {error && (
        <p role="alert" style={{ color: COLORS.red, fontSize: FONT_SIZE.tag }}>
          {error}
        </p>
      )}
    </div>
  );
}
