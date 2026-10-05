import { COLORS, FONTS, FONT_SIZE, FONT_WEIGHT, LETTER_SPACING } from '../lib/theme';
import { Stack } from './ui/Layout';
import Heading from './ui/Heading';
import { Body, Meta } from './ui/Text';
import Button from './ui/Button';

/**
 * A `#/…` route no screen answers to (src/lib/hashRoute.js). Same ground and
 * gutters as the entry gate — `.entry-screen` carries the safe-area padding —
 * and the wordmark's red full stop on the number, so a dead link still lands
 * somewhere that looks like this app rather than a browser error.
 */
export default function NotFoundPage({ onHome }) {
  return (
    <main
      className="entry-screen"
      style={{
        background: COLORS.paper,
        color: COLORS.ink,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Stack gap={5} align="center" style={{ maxWidth: 360, textAlign: 'center' }}>
        <div
          aria-hidden="true"
          style={{
            fontFamily: FONTS.display,
            fontSize: FONT_SIZE['6xl'],
            fontWeight: FONT_WEIGHT.black,
            letterSpacing: LETTER_SPACING.tight,
            lineHeight: 1,
          }}
        >
          404<span style={{ color: COLORS.red }}>.</span>
        </div>
        <Stack gap={2} align="center">
          <Meta>Page not found</Meta>
          <Heading level={1} size="xl">
            This page doesn&apos;t exist
          </Heading>
        </Stack>
        <Body size="sm" tone="soft">
          The link may be old, or the page has moved. Your progress is safe.
        </Body>
        <Button onClick={onHome} style={{ minWidth: 220 }}>
          Back to Home
        </Button>
      </Stack>
    </main>
  );
}
