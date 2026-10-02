import { COLORS, RADIUS, SPACE } from '../../lib/theme';
import { Stack, Row } from '../ui/Layout';
import { Body } from '../ui/Text';
import Button from '../ui/Button';
import { resetTimeText } from '../../lib/quotaReset';

// Shown under the conversation when the daily AI allowance is spent: the
// honest reason, the local reset time, and the next step — never an error
// bubble. Each button renders only when its callback is passed AND the error
// allows it, so Track B (onPremium) and Track C (onRewarded) opt in by wiring
// a prop, not by editing this file.
export default function QuotaNote({ error, onSignIn, onPremium, onRewarded }) {
  const time = resetTimeText(error.resetsAt);
  const resetText = time && `Your allowance resets at ${time}.`;

  const showSignIn = error.tier === 'guest' && onSignIn;
  const showPremium = error.tier === 'free' && onPremium;
  const showRewarded = error.rewardedEligible && onRewarded;

  return (
    <Stack
      role="note"
      gap={3}
      style={{
        margin: `0 ${SPACE[4]}px ${SPACE[3]}px`,
        padding: SPACE[4],
        background: COLORS.surface1,
        border: `1px solid ${COLORS.border}`,
        borderRadius: RADIUS.md,
        minWidth: 0,
      }}
    >
      <Body size="sm">{error.message}</Body>
      {resetText && (
        <Body size="sm" tone="muted">
          {resetText}
        </Body>
      )}
      {(showSignIn || showPremium || showRewarded) && (
        <Row gap={2}>
          {showSignIn && (
            <Button variant="primary" onClick={onSignIn}>
              Create a free account
            </Button>
          )}
          {showPremium && (
            <Button variant="primary" onClick={onPremium}>
              Get Premium
            </Button>
          )}
          {showRewarded && (
            <Button variant="secondary" onClick={onRewarded}>
              Watch an ad for more
            </Button>
          )}
        </Row>
      )}
    </Stack>
  );
}
