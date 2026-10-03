import { SPACE } from '../../lib/theme';
import { isAppleAuthConfigured } from '../../lib/auth.js';
import Button from '../ui/Button';

// The Apple logo glyph (Simple Icons, CC0). Apple's Human Interface Guidelines
// govern the official Sign in with Apple artwork: before this provider is
// switched on, compare this mark with Apple's own and swap it if they differ.
const MARK_PATH =
  'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701';

/**
 * "Continue with Apple" — the third provider button, under Google and GitHub
 * wherever they are on. Renders nothing when Apple is not configured; the
 * guard lives here for the same reason GoogleButton's does. The mark follows
 * the button's ink (`currentColor`), like GitHub's, so it holds on both themes.
 */
export default function AppleButton({ onClick, busy = false, autoFocus = false }) {
  if (!isAppleAuthConfigured()) return null;

  return (
    <Button
      onClick={onClick}
      // `busy`, not `disabled` — see GoogleButton.
      busy={busy}
      autoFocus={autoFocus}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: SPACE[3] }}>
        <svg
          aria-hidden="true"
          focusable="false"
          width={18}
          height={18}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d={MARK_PATH} />
        </svg>
        Continue with Apple
      </span>
    </Button>
  );
}
