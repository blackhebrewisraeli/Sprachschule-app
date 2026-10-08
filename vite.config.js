import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveRelease } from './scripts/lib/resolveRelease.js';
import { renderLegalShell, LEGAL_SHELLS } from './scripts/lib/legalShells.js';
import { MODE_COLORS } from './src/lib/themeTokens.js';

const SENTRY_RELEASE = resolveRelease();

/**
 * Source-map upload is on only when a write-scoped token is present, which in
 * practice means Vercel Preview and Production. Local builds, CI and any fork
 * build simply skip it — no failure, no noise.
 *
 * SENTRY_AUTH_TOKEN is deliberately NOT `VITE_`-prefixed: Vite only exposes
 * VITE_* to client code, so the prefix would inline a write-scoped credential
 * into a public bundle. It is a build-time secret and must stay one.
 */
const SENTRY_UPLOAD = Boolean(process.env.SENTRY_AUTH_TOKEN);

/**
 * Writes privacy.html, terms.html and delete-account.html next to index.html,
 * each with its own head metadata and <noscript> facts (scripts/lib/legalShells.js).
 * vercel.json rewrites the three paths to them. Runs after every other plugin
 * has finished index.html, so it copies the final document.
 */
function legalShellsPlugin() {
  let outDir;
  return {
    name: 'legal-shells',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const indexHtml = readFileSync(resolve(outDir, 'index.html'), 'utf8');
      for (const route of Object.keys(LEGAL_SHELLS)) {
        writeFileSync(resolve(outDir, `${route}.html`), renderLegalShell(indexHtml, route));
      }
    },
  };
}

// https://vitejs.dev/config/
// API calls go to /api/v1/ai/* — Vercel functions in production, served
// locally by `npm run dev:full` (vercel dev). No dev proxy, no key in Vite.
export default defineConfig({
  // Replaces the literal expression at build time. Defined here rather than
  // exported through a .env file because the value is derived per build, and a
  // static env var would pin every deploy to whatever commit was current when
  // someone last edited it in the Vercel dashboard.
  define: {
    'import.meta.env.VITE_SENTRY_RELEASE': JSON.stringify(SENTRY_RELEASE),
  },
  build: {
    // Only emit .map files on builds that will upload and then delete them.
    // Emitting them unconditionally would publish readable source next to the
    // bundle on every deploy — the maps are the whole point of the upload, and
    // serving them publicly would give away for free what the upload exists to
    // keep private.
    sourcemap: SENTRY_UPLOAD,
  },
  plugins: [
    legalShellsPlugin(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'favicon-32.png',
        'pwa-192.png',
        'pwa-512.png',
        'pwa-maskable-512.png',
        'apple-touch-icon.png',
        'social-preview.png',
      ],
      // Service worker caches the app shell and static assets for offline use.
      // navigateFallback is the basic offline strategy: unknown navigations
      // (and a cold open with no network) serve the precached index.html.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // vite-plugin-pwa follows build.sourcemap, so enabling maps for the
        // Sentry upload also emitted sw.js.map and workbox-*.js.map — and those
        // are written AFTER the Sentry plugin's cleanup runs, so its delete glob
        // never saw them and they shipped with a live sourceMappingURL. They
        // describe generated workbox output, not app code, and nothing debugs
        // them from a map, so they are simply not produced.
        sourcemap: false,
        // Don't cache API calls — those need to be live
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /\/lexicon\/.*\.json$/,
            // NOT CacheFirst. The lexicon URLs are unhashed (/lexicon/chunk-00.json),
            // so a re-import writes new bytes to the same path and the cache key never
            // changes — and runtimeCaching caches are not part of the precache
            // manifest, so registerType:'autoUpdate' never purges them. Under
            // CacheFirst a returning visitor kept the pre-merge lexicon, duplicate
            // homograph cards included, until the 30-day expiry (verified against
            // production 2026-08-01). StaleWhileRevalidate still answers instantly and
            // still answers with no network at all — offline is unchanged — but every
            // online load refreshes in the background, so the next one is current.
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'lexicon-json',
              // Under SWR this only evicts what nobody has opened in a month.
              expiration: { maxEntries: 64, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      manifest: {
        name: 'Deutsch Sprachschule',
        short_name: 'Deutsch Sprachschule',
        description:
          'Learn German step by step with vocabulary practice, structured lessons, and an AI tutor.',
        // Tokens, not literals: theme_color is the charcoal masthead (light
        // `fg`), background_color is the ivory splash (light `ground`).
        theme_color: MODE_COLORS.light.fg,
        background_color: MODE_COLORS.light.ground,
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/',
        // `maskable` is a DIFFERENT bitmap, not the same one declared twice.
        // Listing pwa-512 under both purposes — which is what shipped until
        // now — promises a safe zone the artwork never kept: Android may crop
        // to the central circle at 80%, and the rounded-plane artwork puts the
        // D's stem and the red dot outside it. scripts/gen-assets renders the
        // maskable from its own geometry and refuses to emit one whose mark
        // does not clear that circle; src/brandAssets.test.js asserts the two
        // purposes never collapse back onto one file.
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
    // Last in the array: it consumes the finished build output.
    ...(SENTRY_UPLOAD
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG || 'blackhebrewisraeli',
            project: process.env.SENTRY_PROJECT || 'javascript-react',
            authToken: process.env.SENTRY_AUTH_TOKEN,
            // This org is in the EU region. The plugin defaults to
            // https://sentry.io, which is a DIFFERENT tenant — uploads would
            // authenticate against the wrong host and the maps would never
            // reach this project.
            url: process.env.SENTRY_URL || 'https://de.sentry.io',
            release: {
              // Must equal the release observability.js reports, or Sentry has
              // maps filed under one version and events under another, and
              // resolves nothing. Same constant, so they cannot drift.
              name: SENTRY_RELEASE,
              // observability.js sets `release` on Sentry.init explicitly, so
              // injecting a second source of truth would only create a way for
              // the two to disagree.
              inject: false,
            },
            sourcemaps: {
              // Delete after upload so the maps are never deployed.
              filesToDeleteAfterUpload: ['./dist/**/*.map'],
            },
            // The app scrubs PII from its own events; sending build telemetry
            // to Sentry by default would sit oddly beside that.
            telemetry: false,
            // A failed upload does NOT fail the build, verified with a bad
            // token: the plugin logs and Vite still reports success. That is
            // the right trade — a Sentry outage should not block a deploy — but
            // it means a revoked token silently costs every later stack trace,
            // and the plugin's own error is easy to miss in a Vercel log. So it
            // gets a banner that is not.
            errorHandler: (err) => {
              console.error(
                '\n' +
                  '='.repeat(72) +
                  '\nSENTRY SOURCE-MAP UPLOAD FAILED — the build continues, but this\n' +
                  'release will have NO readable stack traces in Sentry.\n' +
                  'Usually a revoked or wrong-scoped SENTRY_AUTH_TOKEN, or the wrong\n' +
                  'region (this org is EU: https://de.sentry.io).\n' +
                  `Cause: ${err && err.message ? err.message : err}\n` +
                  '='.repeat(72) +
                  '\n'
              );
            },
          }),
        ]
      : []),
  ],
});
