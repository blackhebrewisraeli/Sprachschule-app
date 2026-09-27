import React from 'react';
import { reportError } from '../lib/observability.js';
import { hideLaunchScreen } from '../lib/nativeApp.js';
import { COLORS, CARD, BUTTON, TEXT, FONTS, FONT_SIZE, SPACE } from '../lib/theme.js';

// Top-level React error boundary. Error boundaries must be class components —
// this is the one class component in the app, by React's design. It catches
// render-time errors anywhere below it, reports them through the observability
// seam (a no-op when Sentry is unconfigured), and shows a calm, branded recovery
// screen instead of a blank page.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    reportError(error, { componentStack: info?.componentStack });
    // If App threw before its first commit, its effect that lifts the native
    // launch screen never ran, and nothing else will: the recovery screen
    // below would sit hidden behind it for good.
    void hideLaunchScreen();
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: COLORS.paper,
          padding: SPACE[6],
        }}
      >
        <div
          style={{
            ...CARD.base,
            maxWidth: 420,
            width: '100%',
            padding: SPACE[8],
            textAlign: 'center',
          }}
        >
          <h1
            style={{
              ...TEXT.display,
              fontSize: FONT_SIZE['3xl'],
              color: COLORS.ink,
              margin: `0 0 ${SPACE[3]}px`,
            }}
          >
            Something went wrong
          </h1>
          <p
            style={{
              fontFamily: FONTS.body,
              fontSize: FONT_SIZE.base,
              color: COLORS.inkSoft,
              margin: `0 0 ${SPACE[6]}px`,
            }}
          >
            The app hit an unexpected error. Reloading usually fixes it — your saved progress is
            safe.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ ...BUTTON.primary, width: '100%' }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
