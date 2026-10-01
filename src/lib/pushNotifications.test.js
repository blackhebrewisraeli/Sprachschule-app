import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

const { push, backend } = vi.hoisted(() => {
  const push = {
    listeners: {},
    removed: [],
    checkPermissions: null,
    requestPermissions: null,
    register: null,
    unregister: null,
    // Deliver a plugin event to whoever is listening, as the native bridge does.
    emit(event, payload) {
      for (const fn of push.listeners[event] ?? []) fn(payload);
    },
  };
  const backend = { client: null, rpc: null };
  return { push, backend };
});

vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    checkPermissions: (...args) => push.checkPermissions(...args),
    requestPermissions: (...args) => push.requestPermissions(...args),
    register: (...args) => push.register(...args),
    unregister: (...args) => push.unregister(...args),
    addListener: async (event, fn) => {
      (push.listeners[event] ??= []).push(fn);
      return {
        remove: async () => {
          push.listeners[event] = push.listeners[event].filter((f) => f !== fn);
          push.removed.push(event);
        },
      };
    },
  },
}));

vi.mock('./auth.js', () => ({ getSupabase: async () => backend.client }));

import {
  PUSH_DEVICE_KEY,
  isPushConfigured,
  isPushAvailable,
  pushPermission,
  readPushDevice,
  enablePush,
  disablePush,
  forgetPushDevice,
  resumePushRegistration,
  deviceTimeZone,
} from './pushNotifications.js';

// What Capacitor's native runtime injects before any page script runs.
function goNative(platform = 'ios') {
  window.Capacitor = { isNativePlatform: () => true, getPlatform: () => platform };
}

function pushOn() {
  vi.stubEnv('VITE_PUSH_ENABLED', 'true');
}

function storeDevice(device) {
  localStorage.setItem(PUSH_DEVICE_KEY, JSON.stringify(device));
}

// A register() that answers the way the OS does: later, as an event.
function registersAs(token) {
  push.register = vi.fn(async () => {
    setTimeout(() => push.emit('registration', { value: token }), 0);
  });
}

beforeEach(() => {
  localStorage.clear();
  push.listeners = {};
  push.removed = [];
  push.checkPermissions = vi.fn(async () => ({ receive: 'prompt' }));
  push.requestPermissions = vi.fn(async () => ({ receive: 'granted' }));
  push.unregister = vi.fn(async () => {});
  registersAs('device-token-1');

  backend.rpc = vi.fn(async () => ({ data: null, error: null }));
  backend.client = { rpc: (...args) => backend.rpc(...args) };

  // A fixed zone, so the RPC arguments are the same on every machine.
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function () {
    return { resolvedOptions: () => ({ timeZone: 'Europe/Berlin' }) };
  });
});

afterEach(() => {
  delete window.Capacitor;
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('availability', () => {
  it('is off in a browser, even with the flag on', () => {
    pushOn();
    expect(isPushConfigured()).toBe(true);
    expect(isPushAvailable()).toBe(false);
  });

  // The flag is the guard against a native build that has no Firebase config:
  // there, Android's register() crashes the app instead of reporting an error.
  it('is off in the native app when the build did not turn push on', () => {
    goNative();
    expect(isPushAvailable()).toBe(false);
  });

  it('is on in the native app with the flag on', () => {
    goNative();
    pushOn();
    expect(isPushAvailable()).toBe(true);
  });
});

describe('in a browser', () => {
  beforeEach(pushOn);

  it('never touches the plugin or the backend', async () => {
    expect(await pushPermission()).toBe('unavailable');
    expect(await enablePush('u1')).toEqual({ ok: false, reason: 'unavailable' });
    await resumePushRegistration('u1');
    expect(push.checkPermissions).not.toHaveBeenCalled();
    expect(push.requestPermissions).not.toHaveBeenCalled();
    expect(push.register).not.toHaveBeenCalled();
    expect(backend.rpc).not.toHaveBeenCalled();
  });

  it('disablePush still succeeds, and clears any leftover record', async () => {
    storeDevice({ token: 't', userId: 'u1', platform: 'ios' });
    expect(await disablePush()).toEqual({ ok: true });
    expect(readPushDevice()).toBeNull();
    expect(push.unregister).not.toHaveBeenCalled();
  });
});

describe('pushPermission', () => {
  beforeEach(() => {
    goNative();
    pushOn();
  });

  it.each([
    ['granted', 'granted'],
    ['denied', 'denied'],
    ['prompt', 'prompt'],
    // Android 13+ after one refusal: still askable, not blocked.
    ['prompt-with-rationale', 'prompt'],
  ])('reads %s as %s without asking', async (receive, expected) => {
    push.checkPermissions = vi.fn(async () => ({ receive }));
    expect(await pushPermission()).toBe(expected);
    expect(push.requestPermissions).not.toHaveBeenCalled();
  });
});

describe('enablePush', () => {
  beforeEach(() => {
    goNative();
    pushOn();
  });

  it('asks, registers, and saves the token under the account', async () => {
    const result = await enablePush('u1');

    expect(result).toEqual({ ok: true });
    expect(push.requestPermissions).toHaveBeenCalledTimes(1);
    expect(push.register).toHaveBeenCalledTimes(1);
    expect(backend.rpc).toHaveBeenCalledWith('register_push_device', {
      p_token: 'device-token-1',
      p_platform: 'ios',
      p_time_zone: 'Europe/Berlin',
    });
    expect(readPushDevice()).toEqual({
      token: 'device-token-1',
      userId: 'u1',
      platform: 'ios',
    });
  });

  it('reports the platform the token belongs to', async () => {
    goNative('android');
    await enablePush('u1');
    expect(backend.rpc).toHaveBeenCalledWith('register_push_device', {
      p_token: 'device-token-1',
      p_platform: 'android',
      p_time_zone: 'Europe/Berlin',
    });
  });

  it('removes both listeners once the token is in', async () => {
    await enablePush('u1');
    expect(push.removed.sort()).toEqual(['registration', 'registrationError']);
  });

  it('does not ask again when permission is already granted', async () => {
    push.checkPermissions = vi.fn(async () => ({ receive: 'granted' }));
    expect(await enablePush('u1')).toEqual({ ok: true });
    expect(push.requestPermissions).not.toHaveBeenCalled();
  });

  it('asks on prompt-with-rationale', async () => {
    push.checkPermissions = vi.fn(async () => ({ receive: 'prompt-with-rationale' }));
    await enablePush('u1');
    expect(push.requestPermissions).toHaveBeenCalledTimes(1);
  });

  it('stops at a refusal, before registering or saving anything', async () => {
    push.requestPermissions = vi.fn(async () => ({ receive: 'denied' }));
    expect(await enablePush('u1')).toEqual({ ok: false, reason: 'denied' });
    expect(push.register).not.toHaveBeenCalled();
    expect(backend.rpc).not.toHaveBeenCalled();
    expect(readPushDevice()).toBeNull();
  });

  it('does not even ask when there is no account to save the token under', async () => {
    expect(await enablePush(null)).toEqual({ ok: false, reason: 'signed-out' });
    expect(push.requestPermissions).not.toHaveBeenCalled();
    expect(push.register).not.toHaveBeenCalled();
  });

  it('fails, saving nothing, when the OS reports a registration error', async () => {
    push.register = vi.fn(async () => {
      setTimeout(() => push.emit('registrationError', { error: 'no aps-environment' }), 0);
    });
    const result = await enablePush('u1');
    expect(result).toMatchObject({ ok: false, reason: 'failed' });
    expect(result.error.message).toBe('no aps-environment');
    expect(backend.rpc).not.toHaveBeenCalled();
    expect(readPushDevice()).toBeNull();
    expect(push.removed.sort()).toEqual(['registration', 'registrationError']);
  });

  // The error can arrive while register() itself is still in flight.
  it('fails cleanly when the error event beats register() resolving', async () => {
    push.register = vi.fn(async () => {
      push.emit('registrationError', { error: 'early' });
    });
    expect(await enablePush('u1')).toMatchObject({ ok: false, reason: 'failed' });
  });

  it('fails when register() itself rejects', async () => {
    push.register = vi.fn(async () => {
      throw new Error('Firebase not configured');
    });
    expect(await enablePush('u1')).toMatchObject({ ok: false, reason: 'failed' });
    expect(push.removed.sort()).toEqual(['registration', 'registrationError']);
  });

  // An iOS build without the Push capability: register() neither succeeds nor
  // reports an error. The wait has to end somewhere.
  it('gives up when the OS never answers', async () => {
    vi.useFakeTimers();
    push.register = vi.fn(async () => {});
    const pending = enablePush('u1');
    await vi.advanceTimersByTimeAsync(20000);
    const result = await pending;
    expect(result).toMatchObject({ ok: false, reason: 'failed' });
    expect(result.error.message).toMatch(/timed out/i);
    expect(backend.rpc).not.toHaveBeenCalled();
    expect(push.removed.sort()).toEqual(['registration', 'registrationError']);
  });

  it('keeps no local record when the server rejects the token', async () => {
    backend.rpc = vi.fn(async () => ({ data: null, error: { code: '42501' } }));
    expect(await enablePush('u1')).toMatchObject({ ok: false, reason: 'failed' });
    expect(readPushDevice()).toBeNull();
  });

  it('fails when there is no backend to save to', async () => {
    backend.client = null;
    expect(await enablePush('u1')).toMatchObject({ ok: false, reason: 'failed' });
    expect(readPushDevice()).toBeNull();
  });
});

describe('disablePush', () => {
  beforeEach(() => {
    goNative();
    pushOn();
    storeDevice({ token: 'device-token-1', userId: 'u1', platform: 'ios' });
  });

  it('drops the server row and unregisters with the OS', async () => {
    expect(await disablePush()).toEqual({ ok: true });
    expect(backend.rpc).toHaveBeenCalledWith('unregister_push_device', {
      p_token: 'device-token-1',
    });
    expect(push.unregister).toHaveBeenCalledTimes(1);
    expect(readPushDevice()).toBeNull();
  });

  // Offline: the row stays, but it now points at a token the OS killed.
  it('succeeds when only the OS half worked', async () => {
    backend.rpc = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await disablePush()).toEqual({ ok: true });
    expect(readPushDevice()).toBeNull();
  });

  it('succeeds when only the server half worked', async () => {
    push.unregister = vi.fn(async () => {
      throw new Error('nope');
    });
    expect(await disablePush()).toEqual({ ok: true });
  });

  it('fails, keeping the record for a retry, when both halves fail', async () => {
    backend.rpc = vi.fn(async () => ({ error: { message: 'down' } }));
    push.unregister = vi.fn(async () => {
      throw new Error('nope');
    });
    expect(await disablePush()).toEqual({ ok: false, reason: 'failed' });
    expect(readPushDevice()).toEqual({ token: 'device-token-1', userId: 'u1', platform: 'ios' });
  });
});

describe('forgetPushDevice (sign-out)', () => {
  beforeEach(() => {
    goNative();
    pushOn();
  });

  it('does nothing on a device that never opted in', async () => {
    await forgetPushDevice();
    expect(backend.rpc).not.toHaveBeenCalled();
    expect(push.unregister).not.toHaveBeenCalled();
  });

  it('drops the token and unregisters, so the next account is not pushed to', async () => {
    storeDevice({ token: 'device-token-1', userId: 'u1', platform: 'ios' });
    await forgetPushDevice();
    expect(backend.rpc).toHaveBeenCalledWith('unregister_push_device', {
      p_token: 'device-token-1',
    });
    expect(push.unregister).toHaveBeenCalledTimes(1);
    expect(readPushDevice()).toBeNull();
  });

  it('cannot hold the sign-out hostage to a hung network', async () => {
    storeDevice({ token: 'device-token-1', userId: 'u1', platform: 'ios' });
    backend.rpc = vi.fn(() => new Promise(() => {}));
    push.unregister = vi.fn(() => new Promise(() => {}));
    await expect(forgetPushDevice({ timeoutMs: 5 })).resolves.toBeUndefined();
  });

  it('never throws', async () => {
    storeDevice({ token: 'device-token-1', userId: 'u1', platform: 'ios' });
    backend.client = null;
    push.unregister = vi.fn(async () => {
      throw new Error('nope');
    });
    await expect(forgetPushDevice()).resolves.toBeUndefined();
  });

  // A later build with the flag off may lack the Firebase config the plugin
  // needs, so only the server half runs.
  it('leaves the plugin alone when push is no longer switched on', async () => {
    vi.unstubAllEnvs();
    storeDevice({ token: 'device-token-1', userId: 'u1', platform: 'android' });
    await forgetPushDevice();
    expect(backend.rpc).toHaveBeenCalledWith('unregister_push_device', {
      p_token: 'device-token-1',
    });
    expect(push.unregister).not.toHaveBeenCalled();
  });
});

describe('resumePushRegistration (launch)', () => {
  beforeEach(() => {
    goNative();
    pushOn();
    push.checkPermissions = vi.fn(async () => ({ receive: 'granted' }));
  });

  it('re-registers an opted-in device and saves a rotated token', async () => {
    storeDevice({ token: 'old-token', userId: 'u1', platform: 'ios' });
    registersAs('rotated-token');
    await resumePushRegistration('u1');
    expect(backend.rpc).toHaveBeenCalledWith('register_push_device', {
      p_token: 'rotated-token',
      p_platform: 'ios',
      p_time_zone: 'Europe/Berlin',
    });
    expect(readPushDevice().token).toBe('rotated-token');
  });

  it('never prompts', async () => {
    storeDevice({ token: 'old-token', userId: 'u1', platform: 'ios' });
    push.checkPermissions = vi.fn(async () => ({ receive: 'prompt' }));
    await resumePushRegistration('u1');
    expect(push.requestPermissions).not.toHaveBeenCalled();
    expect(push.register).not.toHaveBeenCalled();
  });

  it('does nothing before the learner has opted in', async () => {
    await resumePushRegistration('u1');
    expect(push.checkPermissions).not.toHaveBeenCalled();
    expect(push.register).not.toHaveBeenCalled();
  });

  it('does nothing for a record that belongs to another account', async () => {
    storeDevice({ token: 'old-token', userId: 'someone-else', platform: 'ios' });
    await resumePushRegistration('u1');
    expect(push.register).not.toHaveBeenCalled();
    expect(backend.rpc).not.toHaveBeenCalled();
  });

  it('drops the row when notifications were blocked in the OS since', async () => {
    storeDevice({ token: 'old-token', userId: 'u1', platform: 'ios' });
    push.checkPermissions = vi.fn(async () => ({ receive: 'denied' }));
    await resumePushRegistration('u1');
    expect(backend.rpc).toHaveBeenCalledWith('unregister_push_device', { p_token: 'old-token' });
    expect(push.register).not.toHaveBeenCalled();
    expect(readPushDevice()).toBeNull();
  });

  it('keeps the existing registration when the refresh fails', async () => {
    storeDevice({ token: 'old-token', userId: 'u1', platform: 'ios' });
    backend.rpc = vi.fn(async () => ({ error: { message: 'offline' } }));
    await expect(resumePushRegistration('u1')).resolves.toBeUndefined();
    expect(readPushDevice().token).toBe('old-token');
  });
});

describe('readPushDevice', () => {
  it('reads a corrupt record as not registered', () => {
    localStorage.setItem(PUSH_DEVICE_KEY, '{nope');
    expect(readPushDevice()).toBeNull();
    localStorage.setItem(PUSH_DEVICE_KEY, JSON.stringify({ token: 42 }));
    expect(readPushDevice()).toBeNull();
  });
});

// Nothing in the web build notices when a native link is missing: the app
// installs, the switch shows, and registration silently never completes. These
// pin each link.
describe('native wiring', () => {
  it('ships the plugin in both native projects', () => {
    // Written by `npx cap sync`.
    expect(readFileSync('android/capacitor.settings.gradle', 'utf8')).toContain(
      "include ':capacitor-push-notifications'"
    );
    expect(readFileSync('android/app/capacitor.build.gradle', 'utf8')).toContain(
      "implementation project(':capacitor-push-notifications')"
    );
    expect(readFileSync('ios/App/CapApp-SPM/Package.swift', 'utf8')).toContain(
      '.product(name: "CapacitorPushNotifications", package: "CapacitorPushNotifications")'
    );
  });

  it('forwards the APNs answer from the iOS app delegate to the plugin', () => {
    const delegate = readFileSync('ios/App/App/AppDelegate.swift', 'utf8');
    expect(delegate).toMatch(
      /didRegisterForRemoteNotificationsWithDeviceToken[\s\S]*?\.capacitorDidRegisterForRemoteNotifications/
    );
    expect(delegate).toMatch(
      /didFailToRegisterForRemoteNotificationsWithError[\s\S]*?\.capacitorDidFailToRegisterForRemoteNotifications/
    );
  });

  // The sender speaks FCM only, and FCM cannot address a raw APNs token, so
  // the delegate trades it for an FCM token (register_push_device refuses the
  // raw one). Spec §9.
  it('hands the plugin an FCM token on iOS, never the raw APNs token', () => {
    const delegate = readFileSync('ios/App/App/AppDelegate.swift', 'utf8');
    expect(delegate).toMatch(/Messaging\.messaging\(\)\.apnsToken = deviceToken/);
    expect(delegate).toMatch(
      /Messaging\.messaging\(\)\.token[\s\S]*?\.capacitorDidRegisterForRemoteNotifications,\s*object: token/
    );
    expect(delegate).not.toMatch(
      /capacitorDidRegisterForRemoteNotifications,\s*object: deviceToken/
    );
  });

  // FirebaseApp.configure() without GoogleService-Info.plist is a fatal error
  // at launch, and the SPM package is added by the owner in Xcode. Both guards
  // keep a build without Firebase compiling and launching.
  it('configures Firebase only when the package is linked and the plist is bundled', () => {
    const delegate = readFileSync('ios/App/App/AppDelegate.swift', 'utf8');
    expect(delegate).toMatch(/#if canImport\(FirebaseMessaging\)/);
    expect(delegate).toMatch(
      /Bundle\.main\.path\(forResource: "GoogleService-Info", ofType: "plist"\) != nil[\s\S]*?FirebaseApp\.configure\(\)/
    );
    expect(delegate).toMatch(/PushSetupError\.firebaseNotConfigured/);
  });

  // Android 13+ will not prompt for a permission the manifest does not declare:
  // requestPermissions() just answers 'denied'.
  it('declares the Android 13 notification permission', () => {
    expect(readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8')).toContain(
      '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />'
    );
  });

  it('applies Firebase on Android whenever google-services.json is present', () => {
    const gradle = readFileSync('android/app/build.gradle', 'utf8');
    expect(gradle).toContain("file('google-services.json')");
    expect(gradle).toContain("apply plugin: 'com.google.gms.google-services'");
  });
});

describe('deviceTimeZone', () => {
  // The same clock todayKey() reads. The server needs it to know when the
  // learner's day ends; locale and language are never consulted.
  it('reports the zone of the device clock', () => {
    Intl.DateTimeFormat.mockImplementation(function () {
      return { resolvedOptions: () => ({ timeZone: 'Asia/Kolkata' }) };
    });
    expect(deviceTimeZone()).toBe('Asia/Kolkata');
  });

  it('is null when the platform cannot say, and opting in still works', async () => {
    Intl.DateTimeFormat.mockImplementation(function () {
      throw new RangeError('no ICU data');
    });
    expect(deviceTimeZone()).toBeNull();
    goNative('android');
    pushOn();
    expect(await enablePush('u1')).toEqual({ ok: true });
    expect(backend.rpc).toHaveBeenCalledWith('register_push_device', {
      p_token: 'device-token-1',
      p_platform: 'android',
      p_time_zone: null,
    });
  });
});
