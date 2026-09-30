import { useEffect, useRef, useState } from 'react';
import { COLORS, FONTS, FONT_SIZE, RADIUS, SHADOW, SPACE } from '../../lib/theme';
import {
  authCallbackKind,
  authCallbackReason,
  isAuthConfigured,
  onNativeAuthCallback,
} from '../../lib/auth.js';
import { SIGNUP_NOT_ALLOWED_MESSAGE } from '../../lib/signupAllowlist.js';
import { clearIntent } from '../../lib/legalAcceptance.js';
import Button from '../ui/Button';
import useFocusTrap from '../../lib/useFocusTrap.js';

function clearAuthParamsFromUrl() {
  if (typeof window === 'undefined') return;
  const { pathname, search, hash } = window.location;
  // Drop credential / error fragments so a refresh does not re-enter the landing.
  if (!search && !hash) return;
  window.history.replaceState({}, '', pathname || '/');
}

/**
 * Explicit UI for the magic-link / PKCE auth callback.
 * Detection lives in authCallbackKind() — this is the visible half only.
 *
 * Web: the callback is this page's URL, read once at mount. Native: it
 * arrives through the app's URL scheme at any time, so the same state is fed
 * by onNativeAuthCallback as well.
 */
export default function AuthCallbackLanding({
  status,
  signupRejected = false,
  onSignedIn,
  onRequestNew,
}) {
  const [kind, setKind] = useState(() => (isAuthConfigured() ? authCallbackKind() : null));
  // Captured at mount: clearAuthParamsFromUrl() wipes the URL, so reading the
  // reason lazily later would always come back null.
  const [reason, setReason] = useState(() => (isAuthConfigured() ? authCallbackReason() : null));
  const panelRef = useRef(null);
  const [phase, setPhase] = useState(() => {
    if (!kind) return null;
    return kind === 'error' ? 'error' : 'pending';
  });

  // The transient phases are a passing status; the error phases are a message
  // that needs acknowledging and carry the only control on screen. Those are
  // two different things, so they get two different roles rather than one
  // compromise — `alertdialog` is exactly "an alert the user must act on".
  //
  // Every error phase sets copy.action below; pending and success never do.
  // Derived from `phase` rather than from `copy` because the effects below sit
  // before the early return, and hooks cannot be conditional.
  const actionable = phase === 'error' || phase === 'rejected';

  useEffect(() => {
    if (kind !== 'pending' || phase !== 'pending') return undefined;
    if (signupRejected) return undefined;
    if (status === 'authenticated') {
      setPhase('success');
      clearAuthParamsFromUrl();
      onSignedIn?.();
      return undefined;
    }
    // getSession can briefly report anonymous while PKCE/hash exchange is still
    // in flight — do not treat that as failure. Only time out if nothing lands.
    const t = setTimeout(() => {
      setPhase('error');
      clearAuthParamsFromUrl();
    }, 15000);
    return () => clearTimeout(t);
  }, [kind, phase, status, onSignedIn, signupRejected]);

  // A failed or cancelled callback ends the flow a ticked box was for. The
  // intent must not outlive it and be credited to some later sign-in.
  useEffect(() => {
    if (phase === 'error') clearIntent();
  }, [phase]);

  useEffect(() => {
    if (!signupRejected) return;
    setPhase('rejected');
    clearAuthParamsFromUrl();
  }, [signupRejected]);

  // A callback that reached the native app. Setting `kind` as well as `phase`
  // re-arms the pending effect above, so success and the 15s timeout behave
  // exactly as they do for a web callback.
  useEffect(() => {
    if (!isAuthConfigured()) return undefined;
    return onNativeAuthCallback((event) => {
      setKind(event.kind);
      setReason(event.reason);
      setPhase(event.kind === 'error' ? 'error' : 'pending');
    });
  }, []);

  useEffect(() => {
    // The success copy has no button (action: null), so nothing else ever
    // clears this phase. Without a self-dismiss the overlay sits forever
    // over whatever is underneath — on the splash branch that's the level
    // picker, which a brand-new signup could then never reach. This effect
    // is separate from the one above so that the transition INTO 'success'
    // (which changes `phase`, re-running that effect) can't clean up a
    // timer this effect just set.
    if (phase !== 'success') return undefined;
    const dismiss = setTimeout(() => setPhase(null), 1200);
    return () => clearTimeout(dismiss);
  }, [phase]);

  // Focus only on the branch that has something to do. "Signing you in…" and
  // "Signed in" are passing status: no controls, and both clear themselves, so
  // pulling focus out of whatever the user was doing would be a regression, not
  // a fix. An error panel never self-dismisses and holds the only control on
  // screen — leaving focus behind meant tabbing through the whole app chrome,
  // invisible under the scrim, to reach one button.
  //
  // No focus RESTORE on the way out, unlike the other dialogs: this panel is
  // not opened from a trigger. It is the first thing on screen after an
  // external redirect, and its action unmounts the app's whole signed-out
  // surface — there is no element to go back to.
  useEffect(() => {
    if (!actionable) return;
    panelRef.current?.focus();
  }, [actionable]);

  // Tab wraps. `aria-modal` on the error panel says the rest of the page is
  // inert, and the scrim means the user cannot see any of it — so Tab must not
  // wander out into it. No Escape handler: the panel is not dismissible, its
  // one action is the way out, exactly as TrialWall documents for itself.
  useFocusTrap(panelRef, actionable);

  if (!isAuthConfigured() || !phase) return null;

  let copy;
  if (phase === 'pending') {
    copy = { title: 'Signing you in…', body: null, action: null };
  } else if (phase === 'success') {
    copy = { title: 'Signed in', body: 'Welcome back.', action: null };
  } else if (phase === 'rejected') {
    copy = {
      title: "This email isn't invited",
      body: `${SIGNUP_NOT_ALLOWED_MESSAGE} You can keep using the app as a guest.`,
      action: 'Continue as guest',
    };
  } else if (reason === 'cancelled') {
    copy = {
      title: 'Sign-in cancelled',
      body: 'No problem — you can try again whenever you like.',
      action: 'Sign in again',
    };
  } else if (reason === 'expired') {
    copy = {
      title: 'That link expired — request a new one',
      body: 'Sign-in links only work once and time out. Ask for a fresh code.',
      action: 'Sign in again',
    };
  } else {
    // 'failed', or a pending callback that timed out (reason null — the URL
    // carried a credential, not an error). Never surface the provider's raw
    // message or a URL fragment; neither is written for a person to read.
    copy = {
      title: "That didn't work",
      body: 'Something went wrong finishing sign-in. Please try again.',
      action: 'Sign in again',
    };
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: COLORS.scrim,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 80,
        padding: SPACE[6],
        boxSizing: 'border-box',
      }}
    >
      <div
        ref={panelRef}
        role={actionable ? 'alertdialog' : 'status'}
        tabIndex={actionable ? -1 : undefined}
        aria-modal={actionable ? 'true' : undefined}
        aria-live={actionable ? undefined : 'polite'}
        aria-label={copy.title}
        style={{
          background: COLORS.paper,
          color: COLORS.ink,
          borderRadius: RADIUS.xl,
          padding: SPACE[6],
          maxWidth: 400,
          width: '100%',
          minWidth: 0,
          boxShadow: SHADOW.bar,
          boxSizing: 'border-box',
          textAlign: 'center',
          fontFamily: FONTS.body,
        }}
      >
        <h2
          style={{
            fontFamily: FONTS.display,
            margin: `0 0 ${SPACE[3]}px`,
            fontSize: FONT_SIZE['2xl'],
          }}
        >
          {copy.title}
        </h2>
        {copy.body && (
          <p
            style={{
              fontFamily: FONTS.mono,
              fontSize: FONT_SIZE.tag,
              color: COLORS.mute,
              margin: 0,
            }}
          >
            {copy.body}
          </p>
        )}
        {copy.action && (
          <div style={{ marginTop: SPACE[5] }}>
            <Button
              onClick={() => {
                clearAuthParamsFromUrl();
                setPhase(null);
                // Closed-list reject: stay a guest. Opening the sheet again
                // would just bounce the same mailbox.
                if (phase !== 'rejected') onRequestNew?.();
              }}
            >
              {copy.action}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
