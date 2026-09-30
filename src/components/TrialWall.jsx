import { useState } from 'react';
import { COLORS, FONTS, FONT_SIZE, LETTER_SPACING, RADIUS, SHADOW, SPACE } from '../lib/theme';
import { isGitHubAuthConfigured, isGoogleAuthConfigured } from '../lib/auth.js';
import { recordIntent } from '../lib/legalAcceptance.js';
import Button from './ui/Button';
import GoogleButton from './auth/GoogleButton';
import GitHubButton from './auth/GitHubButton';
import LegalConsent from './auth/LegalConsent';

// The mono caption treatment used twice below — small uppercase mute label,
// the same voice as WelcomeGate's tagline.
const caption = {
  margin: 0,
  fontFamily: FONTS.mono,
  fontSize: FONT_SIZE.tag,
  letterSpacing: LETTER_SPACING.caps,
  textTransform: 'uppercase',
  color: COLORS.mute,
};

/**
 * The guest-trial wall: a blocking sheet over the practice surface once the
 * trial is exhausted. Presentational only — props in, callbacks out. App.jsx
 * decides when it renders (auth configured, anonymous, exhausted, on a
 * practice tab, no celebration running).
 *
 * Deliberately NOT dismissible: no close button, no backdrop click, and no
 * Escape handler. The escape hatch is the Stats tab, which stays reachable
 * because this scrim covers the practice surface only.
 *
 * No `aria-modal` either — the header and nav stay operable by design, so
 * claiming a modal would lie to assistive tech about what is reachable.
 */
export default function TrialWall({
  roundsUsed = 0,
  mobile = false,
  onCreateAccount,
  onSignIn,
  onGoogle,
  googleBusy = false,
  onGitHub,
  gitHubBusy = false,
  accepted,
  onAcceptedChange,
  onNavigateLegal,
  focusConsent = false,
}) {
  const [consentInvalid, setConsentInvalid] = useState(false);
  // Clearance under App's sticky header + nav, which stack to ~113px on mobile
  // and ~132px on desktop. The masthead now grows by inset-top, so this offset
  // does too — otherwise the card docks under a taller header on a notched
  // phone. A gap, not an alignment: the card must simply never sit under the nav.
  const stickyTop = mobile ? 121 : 140;

  // When a provider is on, every existing action demotes one step: the
  // provider takes primary, "Create a free account" drops to secondary, and "I
  // already have an account" becomes the bare-text tertiary — the same
  // third-action treatment WelcomeGate already uses for its guest link. Both
  // flags off, this is byte-for-byte the wall that shipped in #95.
  //
  // ONE provider slot, never two: at 320px a fourth action turns the wall into
  // a menu. Google keeps it when both are on; GitHub takes it only when Google
  // is off. With both on, GitHub is still one tap away — "Create a free
  // account" opens the sheet, which lists every configured provider.
  const googleOn = isGoogleAuthConfigured();
  const gitHubOn = !googleOn && isGitHubAuthConfigured();
  const providerOn = googleOn || gitHubOn;
  // App adopts these controlled props in the next integration step. Until
  // then, its existing provider buttons keep their original one-tap path.
  const consentControlled = typeof accepted === 'boolean' && typeof onAcceptedChange === 'function';

  const startProvider =
    (fn) =>
    (...args) => {
      if (!consentControlled) return fn?.(...args);
      if (!accepted) {
        setConsentInvalid(true);
        return;
      }
      recordIntent();
      fn?.();
    };

  return (
    <div
      role="dialog"
      aria-label="Save your progress"
      style={{
        position: 'absolute',
        inset: 0,
        // BELOW App's nav (49) and header (50) on purpose. The practice
        // surface is the only thing this may cover; once the page scrolls, a
        // higher z-index paints the scrim straight over the sticky chrome and
        // takes the Stats tab — the wall's own escape hatch — with it.
        zIndex: 40,
        display: 'flex',
        // Top-aligned, not centred: the practice surface runs well past the
        // fold, and a centred card lands below it on a phone.
        alignItems: 'flex-start',
        justifyContent: 'center',
        background: COLORS.scrim,
        paddingTop: SPACE[6],
        paddingLeft: `calc(${SPACE[6]}px + env(safe-area-inset-left, 0px))`,
        paddingRight: `calc(${SPACE[6]}px + env(safe-area-inset-right, 0px))`,
        paddingBottom: `calc(${SPACE[6]}px + env(safe-area-inset-bottom, 0px))`,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          // Sticky so the wall stays with the user down a long practice
          // surface instead of scrolling away from the scrim it belongs to.
          position: 'sticky',
          top: `calc(${stickyTop}px + env(safe-area-inset-top, 0px))`,
          maxHeight: `calc(100vh - ${stickyTop + SPACE[6]}px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))`,
          overflowY: 'auto',
          background: COLORS.paper,
          color: COLORS.ink,
          borderRadius: RADIUS.xl,
          padding: SPACE[6],
          maxWidth: 400,
          width: '100%',
          minWidth: 0,
          boxShadow: SHADOW.bar,
          boxSizing: 'border-box',
          fontFamily: FONTS.body,
          display: 'flex',
          flexDirection: 'column',
          gap: SPACE[3],
        }}
      >
        <p style={caption}>
          {roundsUsed} {roundsUsed === 1 ? 'round' : 'rounds'} practised
        </p>

        <h2 style={{ margin: 0, fontFamily: FONTS.display, fontSize: FONT_SIZE['3xl'] }}>
          Save your progress
        </h2>

        <p style={{ margin: 0, fontSize: FONT_SIZE.md }}>
          Create a free account to keep going — every round you've practised comes with you.
        </p>

        {providerOn && consentControlled && (
          <LegalConsent
            checked={accepted}
            onChange={(next) => {
              setConsentInvalid(false);
              onAcceptedChange(next);
            }}
            invalid={consentInvalid}
            onNavigate={onNavigateLegal}
            focusOnMount={focusConsent}
          />
        )}

        {/* autoFocus rides Button's ...rest through to the <button>: focus has
            to follow the wall, which interrupts the practice flow. It belongs
            on whichever action is currently primary. */}
        {googleOn && <GoogleButton onClick={startProvider(onGoogle)} busy={googleBusy} autoFocus />}
        {gitHubOn && <GitHubButton onClick={startProvider(onGitHub)} busy={gitHubBusy} autoFocus />}
        <Button
          variant={providerOn ? 'secondary' : 'primary'}
          autoFocus={!providerOn}
          onClick={onCreateAccount}
        >
          Create a free account
        </Button>
        {providerOn ? (
          <>
            <button
              // Opts into the app's one focus ring, defined in injectGlobalStyles.
              data-ui="button"
              type="button"
              onClick={onSignIn}
              style={{
                background: 'none',
                border: 'none',
                // The ring follows the element's own radius, so the radius the
                // deleted scoped rule used to set has to live here instead.
                borderRadius: SPACE[1],
                color: COLORS.mute,
                fontFamily: FONTS.mono,
                fontSize: FONT_SIZE.tag,
                letterSpacing: LETTER_SPACING.caps,
                textTransform: 'uppercase',
                textDecoration: 'underline',
                cursor: 'pointer',
                padding: SPACE[2],
              }}
            >
              I already have an account
            </button>
          </>
        ) : (
          <Button variant="secondary" onClick={onSignIn}>
            I already have an account
          </Button>
        )}

        <p style={caption}>Your stats stay open — tap Stats below.</p>
      </div>
    </div>
  );
}
