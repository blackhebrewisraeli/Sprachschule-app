import { SPACE } from '../../lib/theme';
import { isGitHubAuthConfigured } from '../../lib/auth.js';
import Button from '../ui/Button';

// GitHub's mark (the Invertocat), verbatim from @primer/octicons 19.38.0
// `mark-github-16.svg`, MIT-licensed by GitHub Inc. Octicons redrew the mark
// in 19.x — if you refresh this, take the path from the package, not from
// memory or an older copy.
const MARK_PATH =
  'M6.766 11.328c-2.063-.25-3.516-1.734-3.516-3.656 0-.781.281-1.625.75-2.188-.203-.515-.172-1.609.063-2.062.625-.078 1.468.25 1.968.703.594-.187 1.219-.281 1.985-.281.765 0 1.39.094 1.953.265.484-.437 1.344-.765 1.969-.687.218.422.25 1.515.046 2.047.5.593.766 1.39.766 2.203 0 1.922-1.453 3.375-3.547 3.64.531.344.89 1.094.89 1.954v1.625c0 .468.391.734.86.547C13.781 14.359 16 11.53 16 8.03 16 3.61 12.406 0 7.984 0 3.563 0 0 3.61 0 8.031a7.88 7.88 0 0 0 5.172 7.422c.422.156.828-.125.828-.547v-1.25c-.219.094-.5.156-.75.156-1.031 0-1.64-.562-2.078-1.609-.172-.422-.36-.672-.719-.719-.187-.015-.25-.093-.25-.187 0-.188.313-.328.625-.328.453 0 .844.281 1.25.86.313.452.64.655 1.031.655s.641-.14 1-.5c.266-.265.47-.5.657-.656';

/**
 * "Continue with GitHub" — sits directly under GoogleButton wherever both are
 * on, and takes Google's slot on surfaces that have room for only one.
 *
 * Renders nothing when GitHub is not configured; the guard lives here for the
 * same reason GoogleButton's does — a per-call-site check is the one someone
 * forgets.
 *
 * The mark is inline SVG on `currentColor`, where Google's is a static <img>,
 * and the difference is the brands' rules, not a style choice. Google's mark is
 * multicolour and must never be recoloured. GitHub's is a single-colour mark
 * GitHub publishes for use in black or white, so it follows the button's ink —
 * which also keeps it visible across both themes, where a fixed-colour file
 * would vanish on one of them. `currentColor` is a relative colour, so
 * noHardcodedColors.test.js allows it.
 */
export default function GitHubButton({ onClick, busy = false, autoFocus = false }) {
  if (!isGitHubAuthConfigured()) return null;

  return (
    <Button
      onClick={onClick}
      // `busy`, not `disabled` — see GoogleButton: a button that disables
      // itself on activation drops keyboard focus to <body>.
      busy={busy}
      autoFocus={autoFocus}
      // Centres Button's one child span, and the busy spinner with it.
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {/* Same row as GoogleButton's: laid out inside Button's span. */}
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: SPACE[3] }}>
        <svg
          aria-hidden="true"
          focusable="false"
          width={18}
          height={18}
          viewBox="0 0 16 16"
          fill="currentColor"
        >
          <path d={MARK_PATH} />
        </svg>
        Continue with GitHub
      </span>
    </Button>
  );
}
