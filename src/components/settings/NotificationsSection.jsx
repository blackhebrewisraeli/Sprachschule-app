import { useState } from 'react';
import { FONTS, SPACE } from '../../lib/theme';
import Button from '../ui/Button';
import { Body } from '../ui/Text';
import { usePushNotifications } from '../../lib/usePushNotifications';

// Push opt-in for this device. Native-only: in a browser, or in a native build
// without push set up, the hook reports 'unavailable' and this renders nothing.
// SettingsRoute leaves the subsection heading out in that case too.

const OUTCOME = {
  enabled: 'Push notifications are on.',
  disabled: 'Push notifications are off.',
  denied: 'Notifications are blocked for this app. Allow them in your phone’s Settings.',
  enableFailed: 'Could not turn on push notifications. Try again.',
  disableFailed: 'Could not turn off push notifications. Try again.',
};

function outcomeMessage(turningOn, result) {
  if (turningOn) {
    if (result.ok) return OUTCOME.enabled;
    return result.reason === 'denied' ? OUTCOME.denied : OUTCOME.enableFailed;
  }
  return result.ok ? OUTCOME.disabled : OUTCOME.disableFailed;
}

export default function NotificationsSection({ userId, onToast }) {
  const { status, busy, enable, disable } = usePushNotifications(userId);
  const [message, setMessage] = useState(null);

  if (status === 'unavailable') return null;

  const on = status === 'on';
  const signedOut = !userId;

  const handleToggle = async () => {
    setMessage(null);
    const result = on ? await disable() : await enable();
    const text = outcomeMessage(!on, result);
    setMessage(text);
    onToast?.(text);
  };

  return (
    <div style={{ fontFamily: FONTS.body }}>
      <Body size="sm" tone="soft" style={{ marginBottom: SPACE[3], overflowWrap: 'break-word' }}>
        Streak reminders and league updates on this device.
      </Body>
      <Button
        variant="secondary"
        aria-pressed={on}
        onClick={handleToggle}
        busy={busy || status === 'loading'}
        disabled={signedOut}
        style={{ alignSelf: 'flex-start' }}
      >
        {on ? 'Push notifications: on' : 'Push notifications: off'}
      </Button>
      {signedOut && (
        <Body size="sm" tone="soft" style={{ marginTop: SPACE[2], overflowWrap: 'break-word' }}>
          Sign in to turn these on. Reminders follow your account.
        </Body>
      )}
      {/* A standing fact about the OS setting, not the result of a tap, so it
          is not a status region. Hidden while a tap's own outcome is showing,
          which says the same thing. */}
      {status === 'denied' && !message && (
        <Body size="sm" tone="soft" style={{ marginTop: SPACE[2], overflowWrap: 'break-word' }}>
          {OUTCOME.denied}
        </Body>
      )}
      {message && (
        <Body role="status" size="sm" tone="soft" style={{ marginTop: SPACE[2] }}>
          {message}
        </Body>
      )}
    </div>
  );
}
