import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TUTORIAL_KEY } from './lib/tutorialPref';
import { WELCOME_BACK_KEY } from './lib/welcomeBack';

// Settings ships inside the lazy Profile chunk: StatsTab imports SettingsRoute,
// and App only hands it props. Rolldown splits on the static import graph, so
// the first test asserts that graph directly. If App (or anything it imports)
// pulls SettingsRoute in again, ~30 kB returns to the entry chunk and the
// 500 kB budget (scripts/dev/bundle-budget.mjs) fails. Giving SettingsRoute a
// lazy() of its own instead makes Rolldown hoist shared modules into extra
// preloaded chunks: docs/superpowers/specs/2026-10-15-vite-bundle-splitting-design.md §12.
//
// Its own file because the failure case resets the module registry: inside
// App.test.jsx that left later lazy tabs on fresh module instances.
const settings = vi.hoisted(() => ({ loaded: false }));
vi.mock('./components/settings/SettingsRoute', async (importOriginal) => {
  settings.loaded = true;
  return importOriginal();
});
// The real component injects a script tag.
vi.mock('@vercel/analytics/react', () => ({ Analytics: () => null }));

describe('Settings code ships in the Profile chunk', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('is not evaluated by App, only by the lazy StatsTab', async () => {
    await import('./App');
    expect(settings.loaded).toBe(false);

    await import('./components/StatsTab');
    expect(settings.loaded).toBe(true);
  });

  // A stale hash after a deploy, or offline before the worker precached the
  // chunk: the settings route shows the recoverable alert, never a blank tab,
  // and the learner can still leave for an eager tab.
  it('shows a recoverable alert on #/settings when the Profile chunk fails', async () => {
    vi.resetModules();
    vi.doMock('./components/StatsTab', () => {
      throw new Error('Failed to fetch dynamically imported module');
    });
    // React logs the caught chunk error; that is the expected path here.
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { default: App } = await import('./App');
      localStorage.setItem('deutsch-level', 'a1');
      localStorage.setItem(TUTORIAL_KEY, 'true');
      sessionStorage.setItem(WELCOME_BACK_KEY, '1');
      window.location.hash = '#/settings';
      render(<App />);
      const guest = screen.queryByRole('button', { name: 'Try it first — free →' });
      if (guest) fireEvent.click(guest);

      const alert = (await screen.findByText(/this section could not load/i)).closest(
        '[role="alert"]'
      );
      expect(within(alert).getByRole('button', { name: 'Reload' })).toBeInTheDocument();
      await userEvent.click(
        within(screen.getByRole('navigation')).getByRole('button', { name: 'Home' })
      );
      expect(screen.getByRole('heading', { name: /guten tag/i })).toBeInTheDocument();
    } finally {
      consoleSpy.mockRestore();
      vi.doUnmock('./components/StatsTab');
    }
  });
});
