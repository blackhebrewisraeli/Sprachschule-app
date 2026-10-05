import Modal from './ui/Modal';
import Heading from './ui/Heading';
import { Body, Meta } from './ui/Text';
import Button from './ui/Button';
import { Row, Stack } from './ui/Layout';
import { activePack } from '../packs';
import { PLACEMENT_OFFER_XP } from '../lib/placementOffer';
import { SPACE } from '../lib/theme';

function standingLine({ streak, goalMet, goalRemaining }) {
  const goal = goalMet
    ? "Today's goal is already done."
    : `${goalRemaining} XP to today's goal — a few rounds will do it.`;
  return streak > 0 ? `You're on a ${streak}-day streak. ${goal}` : goal;
}

/**
 * The once-per-session greeting for a signed-in learner coming back. App owns
 * when it opens (src/lib/welcomeBack.js); this only decides what it says.
 *
 * When the one-shot placement invite is due on the same open, the overlay
 * carries it instead of a separate Home banner competing with it: one prompt,
 * two answers. Closing without answering (✕, Escape, the scrim) leaves the
 * invite unanswered, so the Home banner is still there as the fallback.
 */
export default function WelcomeBackOverlay({
  name,
  streak = 0,
  goalMet = false,
  goalRemaining = 0,
  offer = false,
  onTakeTest,
  onNotNow,
  onClose,
}) {
  const copy = activePack.content.identity ?? {};
  return (
    <Modal label="Welcome back" onClose={onClose} maxWidth={420}>
      <Stack gap={4} data-testid="welcome-back">
        <Stack gap={2}>
          <Meta>{copy.welcomeBackKicker}</Meta>
          <Heading level={2} style={{ overflowWrap: 'anywhere' }}>
            {name ? `Good to see you, ${name}` : 'Good to see you again'}
          </Heading>
        </Stack>
        <Body size="sm" tone="soft">
          {offer
            ? `You've earned ${PLACEMENT_OFFER_XP} XP. Nine quick questions can move you to the practice level that fits — or keep going where you are.`
            : standingLine({ streak, goalMet, goalRemaining })}
        </Body>
        {offer ? (
          <Row gap={3} style={{ marginTop: SPACE[1] }}>
            <Button variant="primary" onClick={onTakeTest}>
              Take the test
            </Button>
            <Button variant="secondary" onClick={onNotNow}>
              Not now
            </Button>
          </Row>
        ) : (
          <Button variant="primary" onClick={onClose} style={{ width: '100%' }}>
            Let&apos;s go
          </Button>
        )}
      </Stack>
    </Modal>
  );
}
