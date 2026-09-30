import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { COLORS, FONTS, FONT_SIZE, LETTER_SPACING, RADIUS, SHADOW, SPACE } from '../../lib/theme';
import {
  isAuthConfigured,
  isGitHubAuthConfigured,
  isGoogleAuthConfigured,
} from '../../lib/auth.js';
import MagicLinkForm from './MagicLinkForm';
import GoogleButton from './GoogleButton';
import GitHubButton from './GitHubButton';
import useFocusTrap from '../../lib/useFocusTrap.js';
import { recordIntent, clearIntent } from '../../lib/legalAcceptance.js';
import LegalConsent from './LegalConsent';

/**
 * In-app auth modal used by WelcomeGate, the trial wall, AccountChip,
 * AccountSection, and App.requestSignIn. Renders nothing when auth is
 * unconfigured (PR #79 class of bug) or when `open` is false.
 *
 * Does not touch Supabase directly — MagicLinkForm awaits the code-split
 * client via signInWithMagicLink / verifyCode, and Google and GitHub go
 * through the single handlers App passes as onGoogle / onGitHub.
 *
 * Terms consent: on the create sheet nothing that starts an account (Google,
 * GitHub, or the email code flow) runs until the box is ticked; the sign-in
 * sheet never shows or requires it. The email/consent draft is lifted to App
 * (`draft`, `onDraftChange`) so it survives a trip to /terms or /privacy — the
 * email half is forwarded to MagicLinkForm only when the caller supplied both
 * props, otherwise the form keeps its own state.
 *
 * Keyboard loop: because a single instance in App serves five different
 * triggers, the opener is captured from `document.activeElement` rather than
 * held as a ref — no ref can know which of the five opened it.
 */

export default function AuthSheet({
  open,
  intent = 'signin',
  onClose,
  onSuccess,
  onGoogle,
  googleBusy = false,
  onGitHub,
  gitHubBusy = false,
  draft,
  onDraftChange,
  onNavigateLegal,
  focusConsent = false,
  // Stacking level. The default sits under the callback landing (80); App
  // raises it above the acceptance gate when a re-auth has to happen on top
  // of it.
  zIndex = 70,
}) {
  const sheetRef = useRef(null);
  const openerRef = useRef(null);
  const wasOpenRef = useRef(false);
  const [consentInvalid, setConsentInvalid] = useState(false);
  const creating = intent === 'create';
  const accepted = draft?.accepted ?? false;

  // Captured during RENDER, on the pass where `open` first turns true — NOT in
  // the effect below. React applies a child's `autoFocus` during the commit,
  // which runs before effects, so by effect time `document.activeElement` is
  // already the first provider button and the real opener is lost. Reading it
  // here, before the commit, is the only point at which the trigger is still
  // focused.
  //
  // This shipped broken and was caught by driving production: every test in the
  // suite runs with Google OFF, where nothing autofocuses and the effect-time
  // read happened to be correct. Production runs with it ON.
  if (open && !wasOpenRef.current) {
    openerRef.current = document.activeElement;
    // The sheet returns null rather than unmounting, so a previous open's error
    // would otherwise greet the next one.
    if (consentInvalid) setConsentInvalid(false);
  }
  wasOpenRef.current = open;

  // Focus in on open, and back out to the opener on close. The sheet returns
  // null rather than unmounting, so this keys on `open` — the cleanup runs when
  // `open` flips false just as it would on unmount.
  useEffect(() => {
    if (!open || !isAuthConfigured()) return undefined;
    // Only if focus is not already inside: with a provider configured, its
    // button's autoFocus has already landed on the primary action during
    // commit, and stealing it back would bury the main affordance.
    if (!sheetRef.current?.contains(document.activeElement)) sheetRef.current?.focus();
    return () => {
      const opener = openerRef.current;
      openerRef.current = null;
      // The opener can be gone — a trigger inside a surface this sheet's own
      // success unmounts — in which case there is nothing to go back to.
      if (opener instanceof HTMLElement && document.contains(opener)) opener.focus();
    };
  }, [open]);

  // `<dialog open>` is not in the top layer — only showModal() gets native
  // focus containment — so `aria-modal` here is a promise this code has to keep
  // by hand. The sheet renders null rather than unmounting, hence the flag.
  useFocusTrap(sheetRef, open && isAuthConfigured());

  useEffect(() => {
    if (!open || !isAuthConfigured()) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!isAuthConfigured() || !open) return null;

  const heading = intent === 'create' ? 'Create your account' : 'Sign in';
  // Gate the divider on the same facts as the buttons. Each provider button
  // self-guards, but a bare "or" left behind when both flags are off would
  // change this sheet in exactly the state that must stay identical to today.
  const googleOn = isGoogleAuthConfigured();
  const oauthOn = googleOn || isGitHubAuthConfigured();

  // One guard for every way to start an account flow from this sheet. On the
  // create sheet it refuses until the box is ticked and records the intent the
  // session-side hook consumes; on the sign-in sheet it clears any stale intent
  // so an abandoned create can never be credited to a later sign-in.
  const guard = () => {
    if (!creating) {
      clearIntent();
      return true;
    }
    if (!accepted) {
      setConsentInvalid(true);
      sheetRef.current?.querySelector('input[type="checkbox"]')?.focus();
      return false;
    }
    recordIntent();
    return true;
  };
  const guarded =
    (fn) =>
    (...args) =>
      guard() && fn?.(...args);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex,
        padding: SPACE[6],
        boxSizing: 'border-box',
      }}
    >
      {/* Pointer affordance only. It duplicates the labelled "Close sign-in"
          button inside the sheet, so as a tab stop it was a second, redundant
          way to do the same thing — sitting BEFORE the sheet in DOM order, so
          Tab hit it first. Out of the tab order, still clickable. Not
          `aria-hidden`: `aria-modal` already excludes it from assistive tech,
          and hiding it here would only break the backdrop-click test's query
          for no gain. */}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Dismiss sign-in"
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
          border: 'none',
          margin: 0,
          padding: 0,
          background: COLORS.scrim,
          cursor: 'pointer',
        }}
      />
      <dialog
        ref={sheetRef}
        open
        aria-modal="true"
        aria-label={heading}
        tabIndex={-1}
        style={{
          position: 'relative',
          zIndex: 1,
          margin: 0,
          border: 'none',
          // Explicit ink on paper — native <dialog> UA styles + WelcomeGate's
          // dark page otherwise leave headings/labels as dark-on-dark.
          background: COLORS.paper,
          color: COLORS.ink,
          borderRadius: RADIUS.xl,
          padding: SPACE[6],
          maxWidth: 400,
          width: '100%',
          minWidth: 0,
          // Bounded to the padded viewport and scrolling inside, so a tall sheet
          // (create + consent error at 320×568) never pushes the close button
          // and the submit off screen, where nothing could scroll them back.
          maxHeight: '100%',
          overflowY: 'auto',
          boxShadow: SHADOW.bar,
          boxSizing: 'border-box',
        }}
      >
        <button
          type="button"
          aria-label="Close sign-in"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: SPACE[3],
            right: SPACE[3],
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: `1px solid ${COLORS.ink}`,
            background: COLORS.card,
            color: COLORS.ink,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 0,
            fontFamily: FONTS.mono,
          }}
        >
          <X size={16} aria-hidden="true" />
        </button>
        {creating && (
          // The top margin drops the first consent line below the absolute close
          // button; at 320px, with the app font, "Terms of Service" ran into it.
          <div style={{ maxWidth: 360, margin: `${SPACE[3]}px auto ${SPACE[4]}px` }}>
            <LegalConsent
              checked={accepted}
              onChange={(next) => {
                setConsentInvalid(false);
                onDraftChange?.({ accepted: next });
              }}
              invalid={consentInvalid}
              onNavigate={onNavigateLegal}
              focusOnMount={focusConsent}
            />
          </div>
        )}
        {oauthOn && (
          <div style={{ maxWidth: 360, margin: '0 auto' }}>
            {/* Focus lands on whichever provider is first, and only one of
                them: two autoFocus props would leave it on the last. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[3] }}>
              <GoogleButton onClick={guarded(onGoogle)} busy={googleBusy} autoFocus />
              <GitHubButton onClick={guarded(onGitHub)} busy={gitHubBusy} autoFocus={!googleOn} />
            </div>
            <div
              aria-hidden="true"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: SPACE[3],
                margin: `${SPACE[4]}px 0`,
                fontFamily: FONTS.mono,
                fontSize: FONT_SIZE.tag,
                letterSpacing: LETTER_SPACING.caps,
                textTransform: 'uppercase',
                color: COLORS.mute,
              }}
            >
              <span style={{ flex: 1, minWidth: 0, height: 1, background: COLORS.inkA20 }} />
              or
              <span style={{ flex: 1, minWidth: 0, height: 1, background: COLORS.inkA20 }} />
            </div>
          </div>
        )}
        <MagicLinkForm
          heading={heading}
          onSuccess={onSuccess}
          beforeStart={guard}
          {...(draft && onDraftChange
            ? { draft: { email: draft.email, sent: draft.sent }, onDraftChange }
            : {})}
        />
      </dialog>
    </div>
  );
}
