// The native (Capacitor) shell as the web app sees it. Every export is inert in
// a browser: detection reads a global that only the native runtime injects, and
// the plugins are imported on demand, so a web visitor never downloads them.

/**
 * The app's private URL scheme: the Capacitor appId (capacitor.config.ts), in
 * reverse-DNS form as RFC 8252 §7.1 asks of a native app's redirect scheme.
 * Registered natively in ios/App/App/Info.plist (CFBundleURLTypes) and in
 * AndroidManifest.xml via @string/custom_url_scheme. nativeApp.test.js pins
 * all of them to this value, so a rename cannot leave one behind.
 */
export const NATIVE_APP_SCHEME = 'com.sprachschule.deutsch';

const CALLBACK_HOST = 'login-callback';

/**
 * Where Supabase sends a sign-in started inside the native app. It must be on
 * the project's Redirect URLs allow-list or Supabase silently falls back to the
 * Site URL (the website), which is exactly the bug this exists to fix. The
 * owner adds it by hand: docs/MOBILE_AUTH_SETUP.md.
 */
export const NATIVE_AUTH_CALLBACK_URL = `${NATIVE_APP_SCHEME}://${CALLBACK_HOST}`;

/**
 * True inside the iOS / Android app, false in every browser.
 *
 * Reads the `Capacitor` global instead of importing @capacitor/core. The
 * native runtime injects that global, isNativePlatform included, before any
 * page script runs, so the answer is exact there. On the web it costs nothing:
 * @capacitor/core never enters the main bundle.
 */
export function isNativeApp() {
  return typeof window !== 'undefined' && window.Capacitor?.isNativePlatform?.() === true;
}

/**
 * Is `url` this app's sign-in callback? Matches the scheme and the host
 * exactly, never as a string prefix, which would also accept
 * `…://login-callback.example`.
 */
export function isNativeAuthCallback(url) {
  if (typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return u.protocol === `${NATIVE_APP_SCHEME}:` && u.host === CALLBACK_HOST;
  } catch {
    return false;
  }
}

/**
 * Call `onUrl` with every URL the OS opens the app with: the one it launched
 * with, and each one after. A no-op on the web.
 *
 * Two sources, because neither one covers the other. A link that cold-starts
 * the app on Android is only reported by getLaunchUrl(), since the launch
 * intent is never re-sent as appUrlOpen. A link that arrives while the app is
 * running is only reported as appUrlOpen. iOS can report a cold-start link
 * through both, so each URL is delivered once however many times it arrives.
 * A sign-in code cannot be exchanged twice, and a second exchange would put a
 * false "That didn't work" on screen.
 */
export async function listenForAppUrls(onUrl) {
  if (!isNativeApp()) return;
  const { App } = await import('@capacitor/app');
  const seen = new Set();
  const deliver = (url) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    onUrl(url);
  };
  await App.addListener('appUrlOpen', (event) => deliver(event?.url));
  const launch = await App.getLaunchUrl();
  deliver(launch?.url);
}

/**
 * Lift the native launch screen. A no-op on the web.
 *
 * capacitor.config.ts sets `launchAutoHide: false`, so the launch screen stays
 * up until this runs instead of a fixed 500ms later. A timer can only guess
 * how long a cold start takes: guess short and the user sees the webview
 * before it has painted, which is a white flash; guess long and every launch
 * waits for nothing.
 *
 * The flip side of `launchAutoHide: false` is that nothing else will ever hide
 * it, so every screen React can mount first has to reach this: App on its
 * first commit, and ErrorBoundary when App throws before that commit happens.
 * Safe to call more than once; later calls resolve without doing anything.
 */
export async function hideLaunchScreen() {
  if (!isNativeApp()) return;
  const { SplashScreen } = await import('@capacitor/splash-screen');
  await SplashScreen.hide();
}

let finishBrowserSession = null;

/**
 * Open `url` in the system's in-app browser (SFSafariViewController on iOS,
 * Custom Tabs on Android). Resolves once that browser is gone, whether the
 * user closed it or closeAuthBrowser() did when the sign-in came back.
 *
 * Not the app's own webview. Google refuses sign-in from an embedded webview
 * (403 disallowed_useragent), and a password belongs on a page whose address
 * the user can check.
 */
export async function openAuthBrowser(url) {
  const { Browser } = await import('@capacitor/browser');
  // A second open settles the first, so no caller is left waiting on a browser
  // that has already been replaced.
  finishBrowserSession?.();
  let finish;
  const finished = new Promise((resolve) => {
    finish = resolve;
  });
  finishBrowserSession = finish;
  const handle = await Browser.addListener('browserFinished', finish);
  try {
    await Browser.open({ url });
    await finished;
  } finally {
    if (finishBrowserSession === finish) finishBrowserSession = null;
    await handle.remove();
  }
}

/**
 * Dismiss the browser openAuthBrowser() opened, if one is still open.
 *
 * Needed on iOS. When the provider redirects to our scheme the app receives
 * the URL, but SFSafariViewController stays on top of it until something
 * closes it, and it reports browserFinished only when the user taps Done.
 * Android's Custom Tab is already gone by then (MainActivity is singleTask),
 * so there the close is a no-op.
 */
export async function closeAuthBrowser() {
  const finish = finishBrowserSession;
  if (!finish) return;
  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.close();
  } catch {
    // iOS rejects when nothing is open, e.g. the user tapped Done first.
  } finally {
    finish();
  }
}
