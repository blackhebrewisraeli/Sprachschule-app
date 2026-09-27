/**
 * Native outputs emitted by @capacitor/assets from the canonical PNGs in
 * assets/. Kept as inert data so brandAssets.test.js can verify every injected
 * resolution without importing the renderer or the package CLI.
 */

import { BRAND, SPLASH_GROUND } from './mark.js';

const IOS_ASSETS = 'ios/App/App/Assets.xcassets';
const ANDROID_RES = 'android/app/src/main/res';

const DENSITIES = [
  ['ldpi', 0.75],
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4],
];

export const ADAPTIVE_SOURCE = {
  size: 1024,
  markHeight: 540,
  androidLayerSize: 108,
  generatorInset: 0.167,
};

/** @capacitor/assets creates the legacy and adaptive layers at launcher size. */
export const NATIVE_ICONS = [
  {
    file: `${IOS_ASSETS}/AppIcon.appiconset/AppIcon-512@2x.png`,
    size: 1024,
    colorType: 2,
  },
  ...DENSITIES.flatMap(([bucket, scale]) => {
    const size = 48 * scale;
    return [
      'ic_launcher',
      'ic_launcher_round',
      'ic_launcher_foreground',
      'ic_launcher_background',
    ].map((name) => ({
      file: `${ANDROID_RES}/mipmap-${bucket}/${name}.png`,
      size,
      colorType: name === 'ic_launcher_background' ? 2 : 6,
      adaptive: name === 'ic_launcher_foreground',
    }));
  }),
];

const PORTRAIT = {
  ldpi: [240, 320],
  mdpi: [320, 480],
  hdpi: [480, 800],
  xhdpi: [720, 1280],
  xxhdpi: [960, 1600],
  xxxhdpi: [1280, 1920],
};

const IOS_SPLASH_NAMES = [
  'Default@1x~universal~anyany.png',
  'Default@2x~universal~anyany.png',
  'Default@3x~universal~anyany.png',
  'Default@1x~universal~anyany-dark.png',
  'Default@2x~universal~anyany-dark.png',
  'Default@3x~universal~anyany-dark.png',
];

export const NATIVE_SPLASHES = [
  ...IOS_SPLASH_NAMES.map((name) => ({
    file: `${IOS_ASSETS}/Splash.imageset/${name}`,
    width: 2732,
    height: 2732,
  })),
  androidSplash('drawable', 320, 480),
  androidSplash('drawable-night', 320, 240),
  ...Object.entries(PORTRAIT).flatMap(([bucket, [width, height]]) => [
    androidSplash(`drawable-port-${bucket}`, width, height),
    androidSplash(`drawable-land-${bucket}`, height, width),
    androidSplash(`drawable-port-night-${bucket}`, width, height),
    androidSplash(`drawable-land-night-${bucket}`, height, width),
  ]),
];

export const MOBILE_SOURCES = [
  { file: 'assets/icon-only.png', width: 1024, height: 1024, colorType: 2 },
  { file: 'assets/icon-foreground.png', width: 1024, height: 1024, colorType: 6 },
  { file: 'assets/icon-background.png', width: 1024, height: 1024, colorType: 2 },
  { file: 'assets/splash.png', width: 2732, height: 2732, colorType: 2 },
  { file: 'assets/splash-dark.png', width: 2732, height: 2732, colorType: 2 },
];

/** Stable native colours: warm ivory and charcoal, with no accent hue. */
export const MOBILE_COLORS = {
  light: BRAND.ink,
  dark: BRAND.plane,
  android12Splash: SPLASH_GROUND,
};

function androidSplash(dir, width, height) {
  return {
    file: `${ANDROID_RES}/${dir}/splash.png`,
    width,
    height,
  };
}
