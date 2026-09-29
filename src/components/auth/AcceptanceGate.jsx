import { useEffect, useId, useRef, useState } from 'react';
import { BORDER, COLORS, FONTS, FONT_SIZE, RADIUS, SHADOW, SPACE, Z } from '../../lib/theme';
import useFocusTrap from '../../lib/useFocusTrap.js';
import Button from '../ui/Button';
import Heading from '../ui/Heading';
import { Body } from '../ui/Text';
import LegalConsent from './LegalConsent';

const DELETE_PHRASE = 'DELETE';

/**
 * Shown while a signed-in account has no acceptance record for the current
 * Terms + Privacy versions (useLegalAcceptance → 'required'). Copy is spec §5.4.
 * Not dismissible: acceptance, sign-out, and account deletion are the exits.
 */
export default function AcceptanceGate({
  hasPrior,
  accepted,
  onAcceptedChange,
  onContinue,
  onSignOut,
  onDelete,
  onNavigateLegal,
  focusConsent = false,
}) {
  const panelRef = useRef(null);
  const deleteInputRef = useRef(null);
  const titleId = useId();
  const [invalid, setInvalid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [typed, setTyped] = useState('');

  useFocusTrap(panelRef, true);
  useEffect(() => {
    if (!panelRef.current?.contains(document.activeElement)) panelRef.current?.focus();
  }, []);
  useEffect(() => {
    if (deleting) deleteInputRef.current?.focus();
  }, [deleting]);

  const title = hasPrior ? "We've updated our terms" : 'One more step';
  const body = hasPrior
    ? 'Please review and accept the updated Terms of Service and Privacy Policy to keep using your account.'
    : 'Before you continue, please review and accept our Terms of Service and Privacy Policy.';

  const handleContinue = async () => {
    if (!accepted) {
      setInvalid(true);
      panelRef.current?.querySelector('input[type="checkbox"]')?.focus();
      return;
    }
    setBusy(true);
    setFailed(false);
    try {
      const { ok } = await onContinue();
      if (!ok) setFailed(true);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: Z.modal,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: SPACE[6],
        boxSizing: 'border-box',
        background: COLORS.scrim,
      }}
    >
      <div
        ref={panelRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={{
          background: COLORS.paper,
          color: COLORS.ink,
          borderRadius: RADIUS.xl,
          padding: SPACE[6],
          maxWidth: 400,
          maxHeight: '100%',
          width: '100%',
          minWidth: 0,
          overflowY: 'auto',
          boxShadow: SHADOW.bar,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: SPACE[4],
        }}
      >
        <Heading level={2} size="lg" id={titleId}>
          {title}
        </Heading>
        <Body>{body}</Body>
        <LegalConsent
          checked={accepted}
          onChange={(next) => {
            setInvalid(false);
            onAcceptedChange(next);
          }}
          invalid={invalid}
          onNavigate={onNavigateLegal}
          focusOnMount={focusConsent}
        />
        {failed && (
          <Body role="alert" size="sm" tone="error">
            Couldn’t save your acceptance. Check your connection and try again.
          </Body>
        )}
        <Button onClick={handleContinue} busy={busy}>
          Continue
        </Button>
        <Button variant="secondary" onClick={onSignOut}>
          Sign out
        </Button>
        {onDelete &&
          (!deleting ? (
            <button
              type="button"
              data-ui="button"
              onClick={() => setDeleting(true)}
              style={{
                background: 'none',
                border: 'none',
                color: COLORS.ink,
                textDecoration: 'underline',
                cursor: 'pointer',
                fontFamily: FONTS.body,
                fontSize: FONT_SIZE.sm,
                minHeight: 44,
              }}
            >
              Delete this account instead
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[2] }}>
              <Body size="sm">
                Type <strong>{DELETE_PHRASE}</strong> to confirm. This permanently deletes the
                account.
              </Body>
              <input
                ref={deleteInputRef}
                aria-label={`Type ${DELETE_PHRASE} to confirm`}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="characters"
                spellCheck="false"
                style={{
                  padding: '12px 14px',
                  border: BORDER.standard,
                  borderRadius: RADIUS.md,
                  background: COLORS.card,
                  color: COLORS.ink,
                  fontFamily: FONTS.mono,
                }}
              />
              <Button
                variant="danger"
                disabled={typed.trim() !== DELETE_PHRASE}
                onClick={() => onDelete(DELETE_PHRASE)}
              >
                Delete account
              </Button>
            </div>
          ))}
      </div>
    </div>
  );
}
