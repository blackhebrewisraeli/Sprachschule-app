import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

const { app, browser, splash } = vi.hoisted(() => {
  const app = {
    urlListener: null,
    launchUrl: null,
    addListener: null,
    getLaunchUrl: null,
  };
  const browser = {
    finishedListener: null,
    remove: null,
    addListener: null,
    open: null,
    close: null,
  };
  const splash = { hide: null };
  return { app, browser, splash };
});

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: (...args) => app.addListener(...args),
    getLaunchUrl: (...args) => app.getLaunchUrl(...args),
  },
}));
vi.mock('@capacitor/splash-screen', () => ({
  SplashScreen: { hide: (...args) => splash.hide(...args) },
}));
vi.mock('@capacitor/browser', () => ({
  Browser: {
    addListener: (...args) => browser.addListener(...args),
    open: (...args) => browser.open(...args),
    close: (...args) => browser.close(...args),
  },
}));

import {
  NATIVE_APP_SCHEME,
  NATIVE_AUTH_CALLBACK_URL,
  isNativeApp,
  isNativeAuthCallback,
  listenForAppUrls,
  hideLaunchScreen,
  openAuthBrowser,
  closeAuthBrowser,
} from './nativeApp.js';

// What Capacitor's native runtime injects before any page script runs.
function goNative() {
  window.Capacitor = { isNativePlatform: () => true };
}

beforeEach(() => {
  app.urlListener = null;
  app.launchUrl = null;
  app.addListener = vi.fn(async (_event, fn) => {
    app.urlListener = fn;
    return { remove: vi.fn() };
  });
  app.getLaunchUrl = vi.fn(async () => (app.launchUrl ? { url: app.launchUrl } : undefined));

  browser.finishedListener = null;
  browser.remove = vi.fn(async () => {});
  browser.addListener = vi.fn(async (_event, fn) => {
    browser.finishedListener = fn;
    return { remove: browser.remove };
  });
  browser.open = vi.fn(async () => {});
  browser.close = vi.fn(async () => {});

  splash.hide = vi.fn(async () => {});
});

afterEach(() => {
  delete window.Capacitor;
});

describe('isNativeApp', () => {
  it('is false in a browser, where no Capacitor global exists', () => {
    expect(isNativeApp()).toBe(false);
  });

  it('is true when the native runtime has injected its global', () => {
    goNative();
    expect(isNativeApp()).toBe(true);
  });

  // @capacitor/core also defines the global on the web, reporting 'web'. If it
  // ever lands in the bundle, the answer must stay false in a browser.
  it('is false when the global exists but reports the web platform', () => {
    window.Capacitor = { isNativePlatform: () => false };
    expect(isNativeApp()).toBe(false);
  });
});

describe('the callback URL', () => {
  it('is the app scheme plus the login-callback host', () => {
    expect(NATIVE_AUTH_CALLBACK_URL).toBe('com.sprachschule.deutsch://login-callback');
  });

  // The scheme lives in four places. A rename that misses one fails silently on
  // a device: the OS has nothing to hand the link to, and the learner lands on
  // the website again. These pin every copy to the constant.
  it('matches the Capacitor appId', () => {
    const config = readFileSync('capacitor.config.ts', 'utf8');
    expect(config).toMatch(new RegExp(`appId:\\s*'${NATIVE_APP_SCHEME.replace(/\./g, '\\.')}'`));
  });

  it('is registered on Android for the login-callback host', () => {
    const strings = readFileSync('android/app/src/main/res/values/strings.xml', 'utf8');
    expect(strings).toContain(`<string name="custom_url_scheme">${NATIVE_APP_SCHEME}</string>`);
    const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
    expect(manifest).toMatch(
      /<data android:scheme="@string\/custom_url_scheme" android:host="login-callback" \/>/
    );
    expect(manifest).toContain('android.intent.category.BROWSABLE');
  });

  it('is registered on iOS as a URL scheme', () => {
    const plist = readFileSync('ios/App/App/Info.plist', 'utf8');
    const urlTypes = plist.slice(plist.indexOf('<key>CFBundleURLTypes</key>'));
    expect(plist).toContain('<key>CFBundleURLTypes</key>');
    expect(urlTypes).toMatch(
      new RegExp(
        `<key>CFBundleURLSchemes</key>\\s*<array>\\s*<string>${NATIVE_APP_SCHEME}</string>`
      )
    );
  });
});

describe('isNativeAuthCallback', () => {
  it.each([
    'com.sprachschule.deutsch://login-callback',
    'com.sprachschule.deutsch://login-callback?code=abc',
    'com.sprachschule.deutsch://login-callback#error=access_denied',
  ])('accepts %s', (url) => {
    expect(isNativeAuthCallback(url)).toBe(true);
  });

  it.each([
    ['another host on our scheme', 'com.sprachschule.deutsch://settings?code=abc'],
    ['a host that only starts the same', 'com.sprachschule.deutsch://login-callback.example'],
    ['another app’s scheme', 'com.example.other://login-callback?code=abc'],
    ['the website', 'https://www.sprachschule-app.com/?code=abc'],
    ['garbage', 'not a url'],
    ['a non-string', undefined],
  ])('rejects %s', (_label, url) => {
    expect(isNativeAuthCallback(url)).toBe(false);
  });
});

describe('listenForAppUrls', () => {
  it('does nothing on the web', async () => {
    const onUrl = vi.fn();
    await listenForAppUrls(onUrl);
    expect(app.addListener).not.toHaveBeenCalled();
    expect(onUrl).not.toHaveBeenCalled();
  });

  it('delivers the URL the app was launched with', async () => {
    goNative();
    app.launchUrl = 'com.sprachschule.deutsch://login-callback?code=cold';
    const onUrl = vi.fn();
    await listenForAppUrls(onUrl);
    expect(onUrl).toHaveBeenCalledWith('com.sprachschule.deutsch://login-callback?code=cold');
  });

  it('delivers each URL opened while the app is running', async () => {
    goNative();
    const onUrl = vi.fn();
    await listenForAppUrls(onUrl);
    expect(app.addListener).toHaveBeenCalledWith('appUrlOpen', expect.any(Function));
    app.urlListener({ url: 'com.sprachschule.deutsch://login-callback?code=warm' });
    expect(onUrl).toHaveBeenCalledWith('com.sprachschule.deutsch://login-callback?code=warm');
  });

  // iOS can report a cold-start link both ways; the second exchange of a used
  // code would show a false failure.
  it('delivers a URL once even when both sources report it', async () => {
    goNative();
    const url = 'com.sprachschule.deutsch://login-callback?code=twice';
    app.launchUrl = url;
    const onUrl = vi.fn();
    await listenForAppUrls(onUrl);
    app.urlListener({ url });
    expect(onUrl).toHaveBeenCalledTimes(1);
  });

  it('ignores a launch with no URL', async () => {
    goNative();
    const onUrl = vi.fn();
    await listenForAppUrls(onUrl);
    expect(onUrl).not.toHaveBeenCalled();
  });
});

describe('hideLaunchScreen', () => {
  it('does nothing on the web', async () => {
    await hideLaunchScreen();
    expect(splash.hide).not.toHaveBeenCalled();
  });

  it('lifts the native launch screen', async () => {
    goNative();
    await hideLaunchScreen();
    expect(splash.hide).toHaveBeenCalledTimes(1);
  });
});

// `launchAutoHide: false` hands the launch screen's lifetime to the web app,
// and every failure here looks the same on a device: the app never gets past
// its launch screen, or the setting silently never ships. Nothing in the web
// build would notice either, so these pin each link of the chain.
describe('the launch screen hand-off', () => {
  it('is configured to wait for the web app', () => {
    const config = readFileSync('capacitor.config.ts', 'utf8');
    expect(config).toMatch(/SplashScreen:\s*\{[^}]*launchAutoHide:\s*false/);
    expect(config).toMatch(/backgroundColor:\s*'#FBF8F1'/);
    expect(config).toMatch(/androidScaleType:\s*'CENTER_CROP'/);
    expect(config).toMatch(/showSpinner:\s*false/);
  });

  it('is lifted by App and by the error boundary that replaces it', () => {
    // Just the two: a screen that can mount first and does not lift it would
    // sit hidden behind the launch screen for good.
    for (const file of ['src/App.jsx', 'src/components/ErrorBoundary.jsx']) {
      expect(readFileSync(file, 'utf8'), file).toMatch(/\bhideLaunchScreen\(\)/);
    }
  });

  it('ships the plugin in both native projects', () => {
    // Written by `npx cap sync`. Without it the setting above ships to nobody
    // and hide() rejects with "not implemented".
    expect(readFileSync('android/capacitor.settings.gradle', 'utf8')).toContain(
      "include ':capacitor-splash-screen'"
    );
    expect(readFileSync('android/app/capacitor.build.gradle', 'utf8')).toContain(
      "implementation project(':capacitor-splash-screen')"
    );
    expect(readFileSync('ios/App/CapApp-SPM/Package.swift', 'utf8')).toContain(
      '.product(name: "CapacitorSplashScreen", package: "CapacitorSplashScreen")'
    );
  });
});

describe('openAuthBrowser / closeAuthBrowser', () => {
  it('opens the URL in the system browser and settles when the user closes it', async () => {
    let settled = false;
    const done = openAuthBrowser('https://x.supabase.co/auth/v1/authorize').then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(browser.open).toHaveBeenCalled());
    expect(browser.open).toHaveBeenCalledWith({ url: 'https://x.supabase.co/auth/v1/authorize' });
    await Promise.resolve();
    expect(settled).toBe(false);
    browser.finishedListener();
    await done;
    expect(settled).toBe(true);
    expect(browser.remove).toHaveBeenCalled();
  });

  it('settles when closeAuthBrowser dismisses it, and closes the browser', async () => {
    const done = openAuthBrowser('https://x.supabase.co/auth/v1/authorize');
    await vi.waitFor(() => expect(browser.open).toHaveBeenCalled());
    await closeAuthBrowser();
    await done;
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  // iOS rejects close() when the user already tapped Done.
  it('still settles when the browser refuses to close', async () => {
    browser.close = vi.fn(async () => {
      throw new Error('No active window to close!');
    });
    const done = openAuthBrowser('https://x.supabase.co/auth/v1/authorize');
    await vi.waitFor(() => expect(browser.open).toHaveBeenCalled());
    await closeAuthBrowser();
    await expect(done).resolves.toBeUndefined();
  });

  it('does not touch the browser when none is open', async () => {
    await closeAuthBrowser();
    expect(browser.close).not.toHaveBeenCalled();
  });

  it('rejects, and cleans up, when the browser cannot open', async () => {
    browser.open = vi.fn(async () => {
      throw new Error('Unable to display URL');
    });
    await expect(openAuthBrowser('https://x.supabase.co/auth/v1/authorize')).rejects.toThrow(
      'Unable to display URL'
    );
    expect(browser.remove).toHaveBeenCalled();
    await closeAuthBrowser();
    expect(browser.close).not.toHaveBeenCalled();
  });
});
