/// <reference types="@capacitor/splash-screen" />
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sprachschule.deutsch',
  appName: 'sprachschule-app',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      // Hold the launch screen until the web app lifts it (hideLaunchScreen in
      // src/lib/nativeApp.js, on App's first commit) instead of for a fixed
      // 500ms, so the webview is never uncovered before it has painted. The
      // artwork itself is drawn by `npm run gen:assets`.
      launchAutoHide: false,
      backgroundColor: '#FBF8F1',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
  },
};

export default config;
