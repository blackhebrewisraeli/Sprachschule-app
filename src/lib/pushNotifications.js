// Push notifications, the device half: ask the OS, get this device's token, and
// hand it to the server under the signed-in account. Sending is the server's
// job and is not built yet; this is the opt-in and the address book.
//
// Every export is inert in a browser. The plugin has no web implementation, so
// it is imported on demand and only behind isPushAvailable(), which a web
// visitor never passes. They never download it, and nothing here can reject
// with "not implemented on web".
//
// The token goes through two SECURITY DEFINER RPCs over the existing Supabase
// client (supabase/migrations/20260927120000_user_devices.sql), the same shape
// as economy.js, so there is no API route. The table itself is server-only.
import { isNativeApp } from './nativeApp.js';
import { getSupabase } from './auth.js';

/**
 * This device's registration: `{ token, userId, platform }`. Device-local and
 * account-specific, so clearUserLocalState() wipes it on sign-out, after
 * forgetPushDevice() has used it.
 */
export const PUSH_DEVICE_KEY = 'deutsch-app-push-device-v1';

// APNs usually answers in well under a second, but a first registration on a
// slow network can take several. Past this, the OS is not going to answer:
// most often an iOS build without the Push Notifications capability, where
// register() neither succeeds nor reports an error.
const REGISTRATION_TIMEOUT_MS = 20000;

// Sign-out waits on this. Long enough for a healthy round trip, short enough
// that a dead network does not hold the learner on a sign-out that looks hung.
const FORGET_TIMEOUT_MS = 3000;

/**
 * The build-time switch. Needs the owner's Firebase (Android) and APNs (iOS)
 * setup, docs/MOBILE_PUSH_SETUP.md, and it is not a formality: on Android,
 * register() without google-services.json crashes the app rather than
 * reporting an error. So absent means OFF, like every other VITE_*_ENABLED.
 *
 * Read per call rather than once at import, so tests can stub it.
 */
export function isPushConfigured() {
  return import.meta.env.VITE_PUSH_ENABLED === 'true';
}

/** True only inside the native app, and only in a build that has push set up. */
export function isPushAvailable() {
  return isNativeApp() && isPushConfigured();
}

function loadPlugin() {
  return import('@capacitor/push-notifications').then((m) => m.PushNotifications);
}

// Read from the global the native runtime injects, like isNativeApp, rather
// than importing @capacitor/core.
function nativePlatform() {
  const platform = typeof window !== 'undefined' ? window.Capacitor?.getPlatform?.() : null;
  return platform === 'ios' || platform === 'android' ? platform : null;
}

/** @returns {{ token: string, userId: string, platform: string } | null} */
export function readPushDevice() {
  try {
    const value = JSON.parse(localStorage.getItem(PUSH_DEVICE_KEY));
    if (typeof value?.token === 'string' && typeof value?.userId === 'string') return value;
  } catch {
    // Unparseable or blocked storage reads as "not registered".
  }
  return null;
}

function writePushDevice(device) {
  try {
    localStorage.setItem(PUSH_DEVICE_KEY, JSON.stringify(device));
  } catch {
    // Blocked storage: the server row still exists, and the next launch simply
    // won't know to refresh it. Not worth failing the opt-in over.
  }
}

function clearPushDevice() {
  try {
    localStorage.removeItem(PUSH_DEVICE_KEY);
  } catch {
    // nothing to clear
  }
}

// Android 12 and below have no runtime permission and always say 'granted'.
// Android 13+ can say 'prompt-with-rationale' after one refusal; for us that
// is still "ask", not "blocked".
function normalisePermission(receive) {
  if (receive === 'granted' || receive === 'denied') return receive;
  return 'prompt';
}

/**
 * The OS permission for this app, without asking for it.
 * @returns {Promise<'granted' | 'denied' | 'prompt' | 'unavailable'>}
 */
export async function pushPermission() {
  if (!isPushAvailable()) return 'unavailable';
  const PushNotifications = await loadPlugin();
  const { receive } = await PushNotifications.checkPermissions();
  return normalisePermission(receive);
}

/**
 * register() resolves as soon as the request is made. The token arrives later,
 * as a 'registration' event, or never. So listen first, then register, and
 * bound the wait.
 */
async function requestToken(PushNotifications) {
  let settle;
  const outcome = new Promise((resolve, reject) => {
    settle = { resolve, reject };
  });
  // An error event can land before the races below are attached (the second
  // addListener is a bridge round trip). Marked handled here so that is not an
  // unhandled rejection; the races still see it.
  outcome.catch(() => {});
  const handles = [];
  let timer;
  try {
    // One at a time, so a second listener that fails to attach still leaves
    // the first one in `handles` for the cleanup below.
    handles.push(
      await PushNotifications.addListener('registration', (token) => {
        if (token?.value) settle.resolve(token.value);
        else settle.reject(new Error('Push registration returned no token.'));
      })
    );
    handles.push(
      await PushNotifications.addListener('registrationError', (error) =>
        settle.reject(new Error(error?.error || 'Push registration failed.'))
      )
    );
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('Push registration timed out.')),
        REGISTRATION_TIMEOUT_MS
      );
    });
    // register() can reject on its own, and the token can arrive before it
    // resolves, so it races the events rather than being awaited first.
    await Promise.race([PushNotifications.register(), outcome, timeout]);
    return await Promise.race([outcome, timeout]);
  } finally {
    clearTimeout(timer);
    await Promise.all(handles.map((handle) => handle.remove()));
  }
}

async function rpc(fn, args) {
  const supabase = await getSupabase();
  if (!supabase) throw new Error('No backend configured.');
  const { error } = await supabase.rpc(fn, args);
  if (error) throw error;
}

function saveToken(token, platform) {
  return rpc('register_push_device', { p_token: token, p_platform: platform });
}

// Both halves of "stop ringing" report success rather than throw, so a caller
// can run them side by side and still act on the one that worked.
async function dropToken(token) {
  try {
    await rpc('unregister_push_device', { p_token: token });
    return true;
  } catch {
    return false;
  }
}

async function osUnregister() {
  try {
    const PushNotifications = await loadPlugin();
    await PushNotifications.unregister();
    return true;
  } catch {
    return false;
  }
}

/**
 * Opt this device in for `userId`: ask the OS (only prompts the first time),
 * register, and save the token under the account. Never throws.
 *
 * @returns {Promise<{ ok: true } | { ok: false, reason: 'unavailable' | 'signed-out' | 'denied' | 'failed', error?: unknown }>}
 */
export async function enablePush(userId) {
  if (!isPushAvailable()) return { ok: false, reason: 'unavailable' };
  // A token saved under nobody is a device the server can never address.
  if (!userId) return { ok: false, reason: 'signed-out' };
  try {
    const PushNotifications = await loadPlugin();
    let { receive } = await PushNotifications.checkPermissions();
    if (normalisePermission(receive) === 'prompt') {
      ({ receive } = await PushNotifications.requestPermissions());
    }
    if (receive !== 'granted') return { ok: false, reason: 'denied' };

    const token = await requestToken(PushNotifications);
    const platform = nativePlatform();
    await saveToken(token, platform);
    writePushDevice({ token, userId, platform });
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: 'failed', error };
  }
}

/**
 * Opt this device out. Deletes the server row, which is what stops the sender,
 * and unregisters with the OS, so a row the delete could not reach (offline)
 * points at a dead token instead of a live one. Either half is enough to stop
 * the device ringing; only when both fail is this a failure, and then the
 * local record stays so a retry still knows which token to drop.
 *
 * @returns {Promise<{ ok: boolean, reason?: 'failed' }>}
 */
export async function disablePush() {
  const device = readPushDevice();
  if (!isPushAvailable()) {
    clearPushDevice();
    return { ok: true };
  }
  const [serverOk, osOk] = await Promise.all([
    device ? dropToken(device.token) : true,
    osUnregister(),
  ]);
  if (!serverOk && !osOk) return { ok: false, reason: 'failed' };
  clearPushDevice();
  return { ok: true };
}

/**
 * Sign-out: stop this device ringing for the account that is leaving, so the
 * next person to sign in here never sees its streak or league pushes.
 *
 * Must run BEFORE the session ends, because the RPC acts as auth.uid().
 * Bounded by a timeout so a dead network cannot hold the sign-out hostage, and
 * never throws. A no-op when this device never opted in.
 */
export async function forgetPushDevice({ timeoutMs = FORGET_TIMEOUT_MS } = {}) {
  const device = readPushDevice();
  if (!device) return;
  clearPushDevice();
  // The OS half needs the plugin, which is only safe to touch in a build that
  // has push set up (see isPushConfigured). The server half needs neither.
  const work = Promise.all([dropToken(device.token), isPushAvailable() ? osUnregister() : null]);
  let timer;
  await Promise.race([
    work,
    new Promise((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    }),
  ]);
  clearTimeout(timer);
}

/**
 * Launch refresh for a device already opted in for `userId`. APNs and FCM can
 * rotate a token at any time and only say so on the next register(), so an
 * opted-in device re-registers on every signed-in launch. That also bumps the
 * row's updated_at, which is how the server tells a live install from an
 * abandoned one.
 *
 * Silent: it only CHECKS the permission, never requests it. If the learner has
 * since blocked notifications in the OS, the row is dropped so the server stops
 * addressing a device that will not show anything. Never throws.
 */
export async function resumePushRegistration(userId) {
  if (!userId || !isPushAvailable()) return;
  const device = readPushDevice();
  if (!device || device.userId !== userId) return;
  try {
    const PushNotifications = await loadPlugin();
    const { receive } = await PushNotifications.checkPermissions();
    if (receive !== 'granted') {
      await dropToken(device.token);
      clearPushDevice();
      return;
    }
    const token = await requestToken(PushNotifications);
    const platform = nativePlatform();
    await saveToken(token, platform);
    writePushDevice({ token, userId, platform });
  } catch {
    // Offline, or the OS did not answer. The existing row stands; next launch
    // tries again.
  }
}
