import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { lazy } from 'react';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mocked so a failed chunk's report is observable without loading Sentry
// (same seam as ErrorBoundary.test.jsx).
vi.mock('../../lib/observability.js', () => ({ reportError: vi.fn() }));
import { reportError } from '../../lib/observability.js';
import LazyBoundary from './LazyBoundary.jsx';

/** A lazy component whose chunk "arrives" only when the test says so. */
function deferredLazy() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { Lazy: lazy(() => promise), resolve, reject };
}

const loaded = () => ({ default: () => <p>Legal text</p> });

describe('LazyBoundary', () => {
  let originalWidth;
  beforeEach(() => {
    reportError.mockClear();
    originalWidth = window.innerWidth;
  });
  afterEach(() => {
    window.innerWidth = originalWidth;
  });

  it('shows a polite "Loading…" status, at the requested min-height, while the chunk is pending', () => {
    const { Lazy } = deferredLazy();
    render(
      <LazyBoundary minHeight="100vh">
        <Lazy />
      </LazyBoundary>
    );
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Loading…');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status.style.minHeight).toBe('100vh');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('replaces the fallback with the content once the chunk resolves', async () => {
    const { Lazy, resolve } = deferredLazy();
    render(
      <LazyBoundary>
        <Lazy />
      </LazyBoundary>
    );
    await act(async () => resolve(loaded()));
    expect(await screen.findByText('Legal text')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  describe('when the chunk fails to load', () => {
    let consoleSpy;
    beforeEach(() => {
      // React logs caught render errors; silence it for a clean run.
      consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    });
    afterEach(() => consoleSpy.mockRestore());

    async function renderRejected() {
      const { Lazy, reject } = deferredLazy();
      const view = render(
        <LazyBoundary>
          <Lazy />
        </LazyBoundary>
      );
      await act(async () => reject(new Error('Failed to fetch dynamically imported module')));
      await screen.findByRole('alert');
      return view;
    }

    it('renders a recoverable alert with a Reload button, not a blank screen', async () => {
      await renderRejected();
      expect(screen.getByRole('alert')).toHaveTextContent(/could not load/i);
      expect(screen.getByRole('button', { name: 'Reload' })).toBeInTheDocument();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('reports the failed import exactly once', async () => {
      await renderRejected();
      expect(reportError).toHaveBeenCalledTimes(1);
      expect(reportError.mock.calls[0][0]).toBeInstanceOf(Error);
      expect(reportError.mock.calls[0][0].message).toMatch(/dynamically imported module/);
    });

    it('reloads the page from the Reload button', async () => {
      const reload = vi.fn();
      const original = window.location;
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: { ...original, reload },
      });
      try {
        await renderRejected();
        await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
        expect(reload).toHaveBeenCalledTimes(1);
      } finally {
        Object.defineProperty(window, 'location', { configurable: true, value: original });
      }
    });
  });

  it('moves focus neither for the fallback nor for the error UI', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { Lazy, reject } = deferredLazy();
    // Focus lands first and the boundary mounts after, so a fallback that
    // grabbed focus on mount would be caught here. Same tree shape on both
    // renders, so the focused button is never remounted.
    const Host = ({ show }) => (
      <>
        <button type="button">Outside</button>
        {show && (
          <LazyBoundary>
            <Lazy />
          </LazyBoundary>
        )}
      </>
    );
    const { rerender } = render(<Host show={false} />);
    const outside = screen.getByRole('button', { name: 'Outside' });
    outside.focus();
    rerender(<Host show />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(document.activeElement).toBe(outside);

    await act(async () => reject(new Error('chunk 404')));
    await screen.findByRole('alert');
    expect(document.activeElement).toBe(outside);
    spy.mockRestore();
  });

  // jsdom has no layout, so this pins the styles that keep both states inside
  // a 320/375px viewport; scripts/dev/smoke-lazy-chunks.mjs measures the real
  // overflow in Chromium at the same widths.
  it.each([320, 375])('keeps both states inside a %ipx viewport', async (width) => {
    window.innerWidth = width;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const pending = deferredLazy();
    const { unmount } = render(
      <LazyBoundary>
        <pending.Lazy />
      </LazyBoundary>
    );
    const status = screen.getByRole('status');
    expect(status.style.boxSizing).toBe('border-box');
    expect(status.style.maxWidth).toBe('100%');
    unmount();

    const failing = deferredLazy();
    render(
      <LazyBoundary>
        <failing.Lazy />
      </LazyBoundary>
    );
    await act(async () => failing.reject(new Error('chunk 404')));
    const alert = await screen.findByRole('alert');
    expect(alert.style.boxSizing).toBe('border-box');
    expect(alert.style.maxWidth).toBe('100%');
    expect(alert.style.overflowWrap).toBe('anywhere');
    expect(screen.getByRole('button', { name: 'Reload' }).style.width).toBe('100%');
    spy.mockRestore();
  });
});
