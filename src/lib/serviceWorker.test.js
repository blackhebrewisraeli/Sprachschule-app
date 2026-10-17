import { describe, it, expect, vi, afterEach } from 'vitest';
import { setupServiceWorker } from './serviceWorker.js';

function stubServiceWorker(registrations = []) {
  const sw = {
    register: vi.fn(() => Promise.resolve()),
    getRegistrations: vi.fn(() => Promise.resolve(registrations)),
  };
  Object.defineProperty(navigator, 'serviceWorker', { value: sw, configurable: true });
  return sw;
}

const registration = () => ({ unregister: vi.fn(() => Promise.resolve(true)) });

afterEach(() => {
  delete navigator.serviceWorker;
  delete window.Capacitor;
});

describe('setupServiceWorker', () => {
  it('registers /sw.js on load in a browser, as the injected script did', async () => {
    const sw = stubServiceWorker();

    await setupServiceWorker();
    expect(sw.register).not.toHaveBeenCalled();

    window.dispatchEvent(new Event('load'));
    expect(sw.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    expect(sw.getRegistrations).not.toHaveBeenCalled();
  });

  it('never registers in the native app, and removes a worker an older build left', async () => {
    window.Capacitor = { isNativePlatform: () => true };
    const old = [registration(), registration()];
    const sw = stubServiceWorker(old);

    await setupServiceWorker();
    window.dispatchEvent(new Event('load'));

    for (const r of old) expect(r.unregister).toHaveBeenCalledTimes(1);
    expect(sw.register).not.toHaveBeenCalled();
  });

  it('swallows a failed cleanup in the native app: the app still runs', async () => {
    window.Capacitor = { isNativePlatform: () => true };
    const sw = stubServiceWorker();
    sw.getRegistrations.mockRejectedValue(new Error('SecurityError'));

    await expect(setupServiceWorker()).resolves.toBeUndefined();
  });

  it('does nothing where service workers do not exist', async () => {
    window.Capacitor = { isNativePlatform: () => true };
    await expect(setupServiceWorker()).resolves.toBeUndefined();
  });
});
