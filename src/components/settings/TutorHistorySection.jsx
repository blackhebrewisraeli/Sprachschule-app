import { useState } from 'react';
import { FONTS, SPACE } from '../../lib/theme';
import Button from '../ui/Button';
import { Body } from '../ui/Text';
import { useAiHistoryEnabled } from '../../lib/useAiHistoryEnabled';
import { deleteAllConversations } from '../../lib/aiHistory';

// Opt-in for saving the learner's tutor conversations to their account.
// Signed-in only, and only in a build that has the feature on (the same
// pattern as push): otherwise this renders nothing and SettingsRoute leaves the
// subsection heading out too. Off by default; turning it off stops saving at
// once and offers to delete what is already saved.

const MESSAGE = {
  on: 'Saving is on. New tutor conversations are saved to your account.',
  off: 'Saving is off. Conversations already saved stay until they expire, or until you delete them.',
  failed: 'Could not update this setting. Try again.',
  deleted: 'Saved conversations deleted.',
  deleteFailed: 'Could not delete your saved conversations. Try again.',
};

export default function TutorHistorySection({ userId, onToast }) {
  const { available, enabled, loading, setEnabled } = useAiHistoryEnabled(userId);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState(null);

  if (!available) return null;

  const say = (text) => {
    setMessage(text);
    onToast?.(text);
  };

  const handleToggle = async () => {
    setBusy(true);
    setConfirming(false);
    setMessage(null);
    const turningOn = !enabled;
    const { ok } = await setEnabled(turningOn);
    setBusy(false);
    say(ok ? (turningOn ? MESSAGE.on : MESSAGE.off) : MESSAGE.failed);
  };

  const handleDeleteAll = async () => {
    setBusy(true);
    try {
      await deleteAllConversations(userId);
      say(MESSAGE.deleted);
    } catch {
      say(MESSAGE.deleteFailed);
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <div style={{ fontFamily: FONTS.body }}>
      <Body size="sm" tone="soft" style={{ marginBottom: SPACE[3], overflowWrap: 'break-word' }}>
        Keep your conversations with the tutor so you can read them again and continue them on any
        device. If you turn this on, what you write and what the tutor replies is saved to your
        account. It is off unless you turn it on, and you can turn it off or delete your saved
        conversations here at any time. Saved conversations are deleted automatically after about 90
        days without a new message.
      </Body>
      <Button
        variant="secondary"
        aria-pressed={enabled}
        onClick={handleToggle}
        busy={busy || loading}
        style={{ alignSelf: 'flex-start' }}
      >
        {enabled ? 'Save my tutor conversations: on' : 'Save my tutor conversations: off'}
      </Button>

      <div style={{ marginTop: SPACE[3] }}>
        {confirming ? (
          <div role="group" aria-label="Confirm deleting saved conversations">
            <Body size="sm" style={{ marginBottom: SPACE[2], overflowWrap: 'break-word' }}>
              Delete all your saved tutor conversations? This cannot be undone.
            </Body>
            <div style={{ display: 'flex', gap: SPACE[2], flexWrap: 'wrap' }}>
              <Button variant="danger" onClick={handleDeleteAll} busy={busy}>
                Delete all
              </Button>
              <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
                Keep them
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="secondary" onClick={() => setConfirming(true)} disabled={busy}>
            Delete all saved conversations
          </Button>
        )}
      </div>

      {message && (
        <Body role="status" size="sm" tone="soft" style={{ marginTop: SPACE[2] }}>
          {message}
        </Body>
      )}
    </div>
  );
}
