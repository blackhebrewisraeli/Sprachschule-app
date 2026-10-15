import React, { Suspense } from 'react';
import { reportError } from '../../lib/observability.js';
import { useWindowWidth, isTiny } from '../../lib/useWindowWidth.js';
import { COLORS, FONTS, FONT_SIZE, SPACE } from '../../lib/theme.js';
import Button from './Button.jsx';

// Wraps a React.lazy() surface: a "Loading…" status while its chunk is in
// flight, and a recoverable alert if the chunk never arrives — a stale hash
// after a deploy, or offline before the service worker has precached it.
//
// Recovery is a full reload, not an in-place retry: React.lazy caches a
// rejected import, so re-rendering would only throw the same error again.
// Neither state takes focus; the page around it stays usable.
//
// Spec: docs/superpowers/specs/2026-10-15-vite-bundle-splitting-design.md §6–7.

const frame = (minHeight) => ({
  minHeight,
  width: '100%',
  maxWidth: '100%',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: SPACE[4],
  padding: SPACE[6],
  textAlign: 'center',
});

const message = {
  fontFamily: FONTS.body,
  fontSize: FONT_SIZE.base,
  color: COLORS.inkSoft,
  margin: 0,
};

function LoadingState({ minHeight }) {
  return (
    <div role="status" aria-live="polite" style={frame(minHeight)}>
      <p style={message}>Loading…</p>
    </div>
  );
}

function ErrorState({ minHeight }) {
  const tiny = isTiny(useWindowWidth());
  return (
    <div role="alert" style={{ ...frame(minHeight), overflowWrap: 'anywhere' }}>
      <p style={{ ...message, color: COLORS.ink }}>
        This section could not load. Reloading usually fixes it — your saved progress is safe.
      </p>
      <Button onClick={() => window.location.reload()} style={tiny ? { width: '100%' } : undefined}>
        Reload
      </Button>
    </div>
  );
}

export default class LazyBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    reportError(error, { componentStack: info?.componentStack, boundary: 'lazy' });
  }

  render() {
    const { minHeight = '60vh', children } = this.props;
    if (this.state.hasError) return <ErrorState minHeight={minHeight} />;
    return <Suspense fallback={<LoadingState minHeight={minHeight} />}>{children}</Suspense>;
  }
}
