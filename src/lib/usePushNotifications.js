import { useState, useEffect, useCallback } from 'react';
import {
  isPushAvailable,
  pushPermission,
  readPushDevice,
  enablePush,
  disablePush,
} from './pushNotifications.js';

/**
 * Where this device stands for `userId`, as the Settings switch shows it.
 *
 *   unavailable  web, or a native build without push set up. Render nothing.
 *   loading      asking the OS for the current permission
 *   on           permission granted AND this device is registered for userId
 *   denied       the learner blocked notifications in the OS
 *   off          everything else, including registered for a different account
 */
function statusFor(permission, device, userId) {
  if (permission === 'unavailable') return 'unavailable';
  if (permission === 'denied') return 'denied';
  if (permission === 'granted' && userId && device?.userId === userId) return 'on';
  return 'off';
}

/**
 * The push opt-in for Settings. `enable` / `disable` resolve with the result
 * from pushNotifications.js so the caller can word the outcome; the status
 * here follows it.
 */
export function usePushNotifications(userId) {
  const available = isPushAvailable();
  const [status, setStatus] = useState(available ? 'loading' : 'unavailable');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!available) return undefined;
    let active = true;
    pushPermission()
      .catch(() => 'prompt')
      .then((permission) => {
        if (active) setStatus(statusFor(permission, readPushDevice(), userId));
      });
    return () => {
      active = false;
    };
  }, [available, userId]);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const result = await enablePush(userId);
      if (result.ok) setStatus('on');
      else if (result.reason === 'denied') setStatus('denied');
      return result;
    } finally {
      setBusy(false);
    }
  }, [userId]);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const result = await disablePush();
      if (result.ok) setStatus('off');
      return result;
    } finally {
      setBusy(false);
    }
  }, []);

  return { status, busy, enable, disable };
}
