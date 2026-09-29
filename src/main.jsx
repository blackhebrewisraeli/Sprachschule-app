import React from 'react';
import ReactDOM from 'react-dom/client';
import { SpeedInsights } from '@vercel/speed-insights/react';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import { initObservability } from './lib/observability.js';
import { bootTheme } from './lib/themeMode.js';

// Resolve CSS custom properties before React mounts — no flash of wrong theme.
bootTheme();

// Start error monitoring before anything renders, so early errors are captured.
// No-op unless VITE_SENTRY_DSN is set.
// Fire-and-forget: the Sentry chunk loads off the critical path, and errors
// raised while it is in flight are queued and replayed once it lands.
void initObservability();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
    <SpeedInsights />
  </React.StrictMode>
);

// Drop the pre-JS shell from index.html once React has actually painted. Two
// frames, not one: the first fires before the commit has been rasterised, and
// removing the shell then reintroduces the blank flash it exists to prevent.
const dropShell = () => document.getElementById('shell')?.remove();
requestAnimationFrame(() => requestAnimationFrame(dropShell));
// rAF does not run in a background tab, and the shell covers the whole
// viewport — without this belt-and-braces timer, opening the app in an
// unfocused tab leaves the wordmark sitting over the mounted app until the tab
// is focused. Timers are throttled there but they do still fire.
setTimeout(dropShell, 1500);

// Debug-only live vitals readout: `?vitals=1`. Dynamically imported into its
// own root so it is a separate chunk — users who never pass the flag never
// download it, and it cannot re-render the app tree while measuring it.
if (new URLSearchParams(window.location.search).has('vitals')) {
  void import('./components/VitalsOverlay.jsx').then(({ default: VitalsOverlay }) => {
    const host = document.createElement('div');
    host.id = 'vitals-overlay';
    document.body.appendChild(host);
    // No StrictMode here: its double-invoked effects would start the observers
    // twice and double-count long tasks.
    ReactDOM.createRoot(host).render(<VitalsOverlay />);
  });
}
