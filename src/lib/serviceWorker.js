// The PWA service worker, registered here rather than by vite-plugin-pwa's
// injected registerSW.js (`injectRegister: false` in vite.config.js), so the
// native app can opt out.
import { isNativeApp } from './nativeApp.js';

/**
 * Browser: register /sw.js once the page has loaded, exactly as the injected
 * script did. Native app: never register, and remove any worker an older build
 * left behind.
 *
 * Inside Capacitor the APK already holds every asset, so the worker adds no
 * offline value, and it costs a whole launch after every store update: its
 * precache answers the first launch with the previous build's index.html and
 * JS. Measured on the emulator 2026-10-18: after updating build 8 in place, the
 * first launch still ran build 8 (still mute); only the second ran the new code.
 *
 * sw.js must keep shipping in the native bundle. An older build's worker checks
 * it for an update, and a 404 there would keep that worker, and its old build,
 * forever.
 *
 * @returns {Promise<void>} settles once a native cleanup has finished
 */
export async function setupServiceWorker() {
  const sw = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
  if (!sw) return;

  if (isNativeApp()) {
    try {
      const registrations = await sw.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    } catch {
      // Best effort: a worker that survives only costs the next launch.
    }
    return;
  }

  window.addEventListener('load', () => sw.register('/sw.js', { scope: '/' }), { once: true });
}
