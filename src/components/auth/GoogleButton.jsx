import { SPACE } from '../../lib/theme';
import { isGoogleAuthConfigured } from '../../lib/auth.js';
import Button from '../ui/Button';

/**
 * "Continue with Google" — the primary CTA on every auth surface once the
 * flag is on.
 *
 * Renders nothing when Google is not configured. The guard lives HERE, not at
 * the three call sites: AuthSheet already self-guards on isAuthConfigured()
 * for exactly this reason, and a per-call-site check is the one someone
 * forgets at the fourth surface.
 *
 * The mark is a static file rendered with <img>, not an inlined SVG. Google's
 * brand terms require it unmodified and un-themed, and it is multicolour hex
 * by definition — which noHardcodedHex.test.js forbids in any component
 * source. vite.config.js's workbox globPatterns already precache **\/*.svg,
 * so it works offline and inside the installed PWA with no config change.
 *
 * The label is Google's required wording: "Continue with Google", not "Sign in
 * with Google" alongside the mark.
 */
export default function GoogleButton({ onClick, busy = false, autoFocus = false }) {
  if (!isGoogleAuthConfigured()) return null;

  return (
    <Button
      onClick={onClick}
      // A redirect takes a beat; a double-tap must not start two round trips.
      //
      // `busy`, not `disabled`. A disabled element leaves the tab order, so a
      // button that disables itself at the moment it is activated takes the
      // user's focus position with it and drops them at <body> — and this is
      // the button that carries autoFocus on two of its three call sites, so it
      // is exactly the one that must not lose focus mid-action. Button's `busy`
      // guards onClick instead, and adds aria-busy plus a spinner.
      busy={busy}
      autoFocus={autoFocus}
      // Centres Button's one child span, and the busy spinner with it.
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {/* Button wraps children in a single span, so the mark/label row is
          laid out here. A gap on the <button> itself never reached them. */}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: SPACE[3] }}>
        <img src="/google-g.svg" alt="" aria-hidden="true" width={18} height={18} />
        Continue with Google
      </span>
    </Button>
  );
}
