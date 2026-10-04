import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, within, act, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App, { SESSION_SPLASH_MAX_MS } from './App';
import { todayKey } from './lib/stats';
import { isLevelBoostEnabled, setLevelBoostEnabled } from './lib/xpEntitlement';
import { TUTORIAL_KEY } from './lib/tutorialPref';
import { THEME_MODE_KEY } from './lib/themeMode';
import { loadState, saveState, thawPersist } from './lib/storage';
import { activePack } from './packs';
import { MAX_CUSTOM_DECKS } from './lib/customDecks';
import { locationReset } from './lib/clearUserState';

// Counts renders so the web-only gate can be asserted without the real
// script-injecting component.
const analytics = vi.hoisted(() => ({ renders: 0 }));
vi.mock('@vercel/analytics/react', () => ({
  Analytics: () => {
    analytics.renders += 1;
    return null;
  },
}));

// The native-app tests below fake Capacitor's global, so App's mount effect
// lifts a launch screen. The real plugin would load @capacitor/core, which
// rewrites that fake global to report the web platform mid-test.
vi.mock('@capacitor/splash-screen', () => ({ SplashScreen: { hide: async () => {} } }));

// Lets the App-level tests drive a real deck generation without a network call.
const callClaude = vi.hoisted(() => vi.fn());
vi.mock('./lib/claude', async (importActual) => ({ ...(await importActual()), callClaude }));

/**
 * Mark the first-run walkthrough as already seen.
 *
 * Every block in this file except the walkthrough's own renders the app as a
 * RETURNING learner, which is what they always implicitly assumed — before the
 * tour existed there was nothing on top of the shell. Without this the tour's
 * scrim and its "Skip tutorial" button sit over each of them, and its button
 * collides with Translate's own SKIP.
 */
const asReturningLearner = () => {
  localStorage.setItem(TUTORIAL_KEY, 'true');
  // Returning learners already have a CEFR code. Without this, the placement
  // screen sits in front of the shell the way the tutorial used to.
  if (!localStorage.getItem('deutsch-level')) localStorage.setItem('deutsch-level', 'a1');
};

const profileMock = vi.hoisted(() => ({ fetchMyProfile: vi.fn() }));

vi.mock('./lib/profile', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchMyProfile: profileMock.fetchMyProfile,
}));

beforeEach(() => {
  asReturningLearner();
  window.location.hash = '';
  authMock.configured = true;
  authMock.status = 'anonymous';
  authMock.token = null;
  adminSessionMock.status = 'ready';
  adminSessionMock.me = { isAdmin: false, isSystemAccount: false, blocked: false };
  profileMock.fetchMyProfile.mockReset().mockResolvedValue(null);
  legalMock.status = 'accepted';
  legalMock.hasPrior = true;
});

const authMock = vi.hoisted(() => ({
  configured: true,
  status: 'anonymous',
  mayHaveSession: false,
  // Null matches the real module's behaviour with no Supabase configured, so
  // every existing test is unaffected; the account-lane tests set a token.
  token: null,
}));

const adminSessionMock = vi.hoisted(() => ({
  status: 'ready',
  me: { isAdmin: false, isSystemAccount: false, blocked: false },
}));

vi.mock('./lib/useAdminSession.js', () => ({
  useAdminSession: (user) =>
    user
      ? { status: adminSessionMock.status, me: adminSessionMock.me }
      : { status: 'idle', me: null },
}));

// Spread the real module: App imports six names from it and StatsTab,
// WelcomeGate and GoogleButton import more. A bare factory breaks them.
// Mocked rather than inherited because isAuthConfigured() reads
// import.meta.env.VITE_SUPABASE_*, which Vitest loads from .env — true on a
// developer's machine, false in CI. See spec F7.
const authSignOutMock = vi.hoisted(() => vi.fn(() => Promise.resolve({ error: null })));

vi.mock('./lib/auth', async (importOriginal) => ({
  ...(await importOriginal()),
  isAuthConfigured: () => authMock.configured,
  isGoogleAuthConfigured: () => false,
  isGitHubAuthConfigured: () => false,
  isAppleAuthConfigured: () => false,
  mayHaveSession: () => authMock.mayHaveSession,
  // Captured so a test can deliver a sign-in that comes back through the
  // native app's URL scheme.
  onNativeAuthCallback: (fn) => {
    authMock.nativeCallback = fn;
    return () => {
      if (authMock.nativeCallback === fn) authMock.nativeCallback = null;
    };
  },
  signOut: authSignOutMock,
  getAccessToken: () => Promise.resolve(authMock.token),
  useAuth: () => ({
    session: null,
    user: authMock.status === 'authenticated' ? { id: 'u1', email: 'a@b.co' } : null,
    status: authMock.status,
  }),
}));

// Where the signed-in account stands on the current terms. Defaults to
// 'accepted' so every test written before the gate keeps its meaning: a
// signed-in account there is one that has already accepted.
const legalMock = vi.hoisted(() => ({
  status: 'accepted',
  hasPrior: true,
  accept: vi.fn(async () => ({ ok: true })),
}));
vi.mock('./lib/useLegalAcceptance', () => ({
  useLegalAcceptance: (user) =>
    user
      ? { status: legalMock.status, hasPrior: legalMock.hasPrior, accept: legalMock.accept }
      : { status: 'none', hasPrior: false, accept: legalMock.accept },
}));

// The league standing is a network read, so App tests inject it directly. It is
// mutable and hoisted for the same reason syncMock is: the interesting case is
// the one that only happens in production (signed in, leagues on, at risk), and
// a test that cannot reach it cannot fail when the wiring regresses.
const leagueStandingMock = vi.hoisted(() => ({ value: null, calls: [] }));

vi.mock('./lib/useLeagueStanding', () => ({
  useLeagueStanding: (userId) => {
    leagueStandingMock.calls.push(userId);
    return leagueStandingMock.value;
  },
}));

// VITE_SYNC_ENABLED is false on a developer's machine AND false in CI, but
// true in production — so before this mock existed the enabled half of both
// sync effects in App had never run in a test. `SYNC_ENABLED` is a getter, not
// a value: App reads it inside an effect body, which compiles to a property
// access on the module namespace, so a getter lets a single test flip the flag
// that ships without re-importing App.
const syncMock = vi.hoisted(() => ({
  enabled: false,
  start: vi.fn(),
  stop: vi.fn(),
  markDirty: vi.fn(),
  // The reconcile lifecycle, drivable from a test. `settled` is what the
  // placement gate waits on: "has the first reconcile FINISHED?", which is not
  // the same question as "did it succeed?".
  status: { pending: false, lastSyncedAt: null, settled: false },
  listeners: new Set(),
  setStatus(next) {
    syncMock.status = next;
    for (const fn of syncMock.listeners) fn(next);
  },
  reset() {
    syncMock.status = { pending: false, lastSyncedAt: null, settled: false };
    syncMock.listeners.clear();
  },
}));

vi.mock('./lib/sync', async (importOriginal) => ({
  ...(await importOriginal()),
  get SYNC_ENABLED() {
    return syncMock.enabled;
  },
  start: syncMock.start,
  stop: syncMock.stop,
  markDirty: syncMock.markDirty,
  getSyncStatus: () => syncMock.status,
  subscribeSyncStatus: (fn) => {
    syncMock.listeners.add(fn);
    return () => syncMock.listeners.delete(fn);
  },
}));

const progressFlushMock = vi.hoisted(() => ({
  start: vi.fn(),
  stop: vi.fn(),
  scheduleFlush: vi.fn(),
}));

vi.mock('./lib/progressQueue', async (importOriginal) => ({
  ...(await importOriginal()),
  startProgressFlush: (...args) => progressFlushMock.start(...args),
  stopProgressFlush: (...args) => progressFlushMock.stop(...args),
  scheduleFlush: (...args) => progressFlushMock.scheduleFlush(...args),
}));

const TAB_NAMES = ['Home', 'Chat', 'Alphabet', 'Vocab', 'Translate', 'Profile'];

const setViewportWidth = (width) => {
  Object.defineProperty(window, 'innerWidth', {
    writable: true,
    configurable: true,
    value: width,
  });
};

// The entry gate is a function of account session, not a device flag (see
// docs/superpowers/specs/2026-08-17-entry-flow-and-level-xp-design.md). A
// first-time learner then meets the placement test instead of a free picker;
// tests below this point that only care about the app shell seed
// `deutsch-level` (via asReturningLearner) so they skip it. Continuing past
// the gate lands on the shell for anyone who already has a level.
// `fireEvent` (not `userEvent`) for a synchronous click that avoids the
// delay-based interactions `userEvent` schedules internally. A no-op when the
// gate never appeared (e.g. an
// authenticated or auth-unconfigured mock).

/** The one live custom deck in stored state — generated ids are random now. */
const liveCustomDeck = () => Object.values(loadState()?.decks ?? {}).find((d) => d && !d.deletedAt);
/** Every tombstoned deck in stored state. */
const tombstones = () => Object.values(loadState()?.decks ?? {}).filter((d) => d?.deletedAt);

const renderPastEntry = (ui) => {
  const result = render(ui);
  const guestBtn = screen.queryByRole('button', { name: 'Try it first — free →' });
  if (guestBtn) fireEvent.click(guestBtn);
  return result;
};

/** Seed ~14 qualifying days so streak + freeze chip both render. */
function seedPopulatedAccount() {
  const qual = { byLevel: { a1: { correct: 6, almost: 0, wrong: 0 } } };
  const daily = {};
  const today = todayKey();
  const [y, m, d] = today.split('-').map(Number);
  for (let i = 14; i >= 1; i -= 1) {
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() - i);
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(dt.getUTCDate()).padStart(2, '0');
    daily[`${dt.getUTCFullYear()}-${mm}-${dd}`] = qual;
  }
  localStorage.setItem(
    'deutsch-app-state-v1',
    JSON.stringify({ daily, gamification: { goal: 50 }, stats: { streak: 0, learnedCount: 40 } })
  );
}

describe('App navigation a11y', () => {
  beforeEach(() => {
    // jsdom has no scrollIntoView (ChatTab auto-scrolls on mount)
    Element.prototype.scrollIntoView = vi.fn();
    // Skip the onboarding splash so the main shell renders
    localStorage.setItem('deutsch-level', 'a1');
  });

  it('desktop nav exposes an accessible name for every tab', () => {
    setViewportWidth(1280);
    renderPastEntry(<App />);
    const nav = within(screen.getByRole('navigation'));
    for (const name of TAB_NAMES) {
      expect(nav.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('does not expose the Admin destination to a regular signed-in user', () => {
    authMock.status = 'authenticated';
    setViewportWidth(1280);
    renderPastEntry(<App />);
    expect(
      within(screen.getByRole('navigation')).queryByRole('button', { name: 'Admin' })
    ).not.toBeInTheDocument();
  });

  it('lets a server-confirmed admin open the isolated Admin tab', async () => {
    authMock.status = 'authenticated';
    adminSessionMock.me = { isAdmin: true, isSystemAccount: true, blocked: false };
    setViewportWidth(1280);
    renderPastEntry(<App />);

    const admin = within(screen.getByRole('navigation')).getByRole('button', { name: 'Admin' });
    expect(admin).toHaveTextContent('07');
    await userEvent.click(admin);

    expect(admin).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { name: 'Admin' })).toBeInTheDocument();
    // The admin panel's own section switcher is a tablist, not a row of the
    // app's primary-action pills — see AdminRail.
    expect(screen.getByRole('tab', { name: /feedback/i })).toBeInTheDocument();
  });

  it('mobile icon-only nav buttons keep their accessible names', () => {
    setViewportWidth(375);
    renderPastEntry(<App />);
    const nav = within(screen.getByRole('navigation'));
    for (const name of TAB_NAMES) {
      const button = nav.getByRole('button', { name });
      expect(button).toBeInTheDocument();
      // Icon-only on mobile: the name must come from aria-label, not text
      expect(button).toHaveAttribute('aria-label', name);
    }
  });

  it('marks only the active tab with aria-current', () => {
    setViewportWidth(1280);
    renderPastEntry(<App />);
    const nav = within(screen.getByRole('navigation'));
    expect(nav.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(nav.getByRole('button', { name: 'Chat' })).not.toHaveAttribute('aria-current');
    expect(nav.getByRole('button', { name: 'Profile' })).not.toHaveAttribute('aria-current');
  });

  it('renders HomeTab content on the default landing tab', () => {
    setViewportWidth(1280);
    renderPastEntry(<App />);
    expect(screen.getByRole('heading', { name: /guten tag/i })).toBeInTheDocument();
  });

  // First launch. Unseen cards are NEW, not due: a learner who has answered
  // nothing owes nothing. This app used to greet them with "40 cards are due"
  // on Home and a red "9+" on the Profile tab.
  it('opens a brand-new learner to no attention badge and no "cards are due"', () => {
    setViewportWidth(375);
    renderPastEntry(<App />);
    const profileTab = within(screen.getByRole('navigation')).getByRole('button', {
      name: 'Profile',
    });
    // Icon-only nav at 375: the badge would be the button's only text.
    expect(profileTab.textContent).toBe('');
    expect(screen.queryByText(/cards? (?:are|is) due/i)).toBeNull();
  });

  it('raises the badge and the mission once a studied card actually falls due', () => {
    const [first] = activePack.content.decks.greetings;
    const now = Date.now();
    localStorage.setItem(
      'deutsch-app-state-v1',
      JSON.stringify({
        srs: {
          [`greetings:${first.id}`]: {
            box: 1,
            lastReviewed: now - 2 * 86400000,
            nextDue: now - 86400000,
            reps: 1,
          },
        },
      })
    );
    setViewportWidth(375);
    renderPastEntry(<App />);
    const profileTab = within(screen.getByRole('navigation')).getByRole('button', {
      name: 'Profile',
    });
    expect(profileTab.textContent).toBe('1');
    expect(screen.getByText('1 card is due')).toBeInTheDocument();
  });

  it('deep-links #/settings onto the Profile tab Settings view', () => {
    setViewportWidth(1280);
    window.location.hash = '#/settings';
    renderPastEntry(<App />);
    const nav = within(screen.getByRole('navigation'));
    expect(nav.getByRole('button', { name: 'Profile' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('heading', { name: /einstellungen/i })).toBeInTheDocument();
    window.location.hash = '';
  });

  it('clears the settings hash when leaving the Profile tab', async () => {
    setViewportWidth(1280);
    window.location.hash = '#/settings';
    renderPastEntry(<App />);
    expect(window.location.hash).toBe('#/settings');
    await userEvent.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'Home' })
    );
    expect(window.location.hash).toBe('');
    expect(screen.getByRole('heading', { name: /guten tag/i })).toBeInTheDocument();
  });

  // The labelled nav needs 809px (measured: six labels + the 01-06 prefixes +
  // padding + gaps), but labels used to switch on at `mobile` = 640. In that
  // 640-809 band every button is forced to an equal flex share — 105px at
  // 700px — while "Translate" alone wants 149px, so the label overflowed its
  // button and ran into the neighbour's.
  //
  // No overflow assertion catches this: the buttons carry minWidth: 0, so the
  // nav never grows and never scrolls sideways — it just renders text on top
  // of text. (A jsdom scrollWidth check would be worse than useless here;
  // jsdom reports 0 for every element, so it could not fail. The width itself
  // is verified in a real browser.) The honest assertion is what the button
  // renders: an icon-only button has no text of its own.
  it('renders the nav icon-only below the width where labels fit', () => {
    setViewportWidth(700);
    renderPastEntry(<App />);
    const nav = within(screen.getByRole('navigation'));
    for (const name of TAB_NAMES) {
      const button = nav.getByRole('button', { name });
      expect(button).toHaveAttribute('aria-label', name);
      // Icon-only: the accessible name comes from aria-label, never from text
      // the button paints. Asserted as "does not contain the label" rather
      // than "has no text at all" because the Stats button also carries the
      // attention badge, which is legitimately text.
      expect(button.textContent).not.toContain(name);
      expect(button.querySelector('svg')).toBeInTheDocument();
    }
  });

  // Positive control for the test above: without this, simply never rendering
  // labels at any width would pass it.
  it('restores the nav labels once there is room for them', () => {
    setViewportWidth(900);
    renderPastEntry(<App />);
    const nav = within(screen.getByRole('navigation'));
    expect(nav.getByRole('button', { name: 'Translate' })).toHaveTextContent('Translate');
  });
});

describe('profile identity propagation', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    authMock.status = 'authenticated';
    authMock.mayHaveSession = true;
    setViewportWidth(1280);
  });

  afterEach(() => vi.unstubAllEnvs());

  it('shows the same saved avatar in the account sheet and the main Profile page', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://proj.supabase.co');
    profileMock.fetchMyProfile.mockResolvedValue({
      display_name: 'Sam Vimes',
      handle: 'sam',
      avatar_path: 'u1/saved.webp',
      created_at: '2026-01-01T00:00:00.000Z',
    });
    const user = userEvent.setup();
    renderPastEntry(<App />);

    const account = within(screen.getByRole('banner')).getByRole('button', { name: 'Account' });
    await user.click(account);
    const sheet = screen.getByRole('dialog', { name: 'Account' });
    await waitFor(() =>
      expect(sheet.querySelector('img[data-avatar="image"]')).toHaveAttribute(
        'src',
        'https://proj.supabase.co/storage/v1/object/public/avatars/u1/saved.webp'
      )
    );

    await user.click(account);
    await user.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'Profile' })
    );

    expect(await screen.findByRole('heading', { name: 'Sam Vimes' })).toBeInTheDocument();
    expect(document.querySelector('img[data-avatar="image"]')).toHaveAttribute(
      'src',
      'https://proj.supabase.co/storage/v1/object/public/avatars/u1/saved.webp'
    );
  });
});

// Home owns its daily-goal ring; all other tabs use GoalStrip at every width.
// Keep the populated header within the viewport while preserving its controls.
describe('header and daily-goal surfaces', () => {
  const goalStrip = () =>
    // GoalStrip renders "{current} / {target} XP" across several text nodes
    screen.queryByText((_, el) => /^\d+ \/ \d+ XP$/.test((el?.textContent ?? '').trim()), {
      selector: 'span',
    });

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    localStorage.setItem('deutsch-level', 'a1');
  });

  // The masthead is the flag's black stripe carried into the app frame, so it
  // must NOT follow the page ground. This is the PR #116 bug class: pairing a
  // brand surface with a theme token made the splash's black stripe invert to
  // parchment in light mode. Nothing else catches it — the header still looks
  // like a header either way, and the contrast audit passes on both.
  it('paints the masthead from the flag black tier, not the page ground', () => {
    setViewportWidth(1280);
    const { container } = renderPastEntry(<App />);
    const style = container.querySelector('header').getAttribute('style') ?? '';
    expect(style).toMatch(/background:\s*var\(--c-accent-black\)/);
    expect(style, 'masthead must not follow the page ground').not.toMatch(
      /background:\s*var\(--c-ground\)/
    );
  });

  it.each([1280, 375, 320])('keeps Home’s single daily-goal ring at %ipx', (width) => {
    setViewportWidth(width);
    seedPopulatedAccount();
    renderPastEntry(<App />);
    expect(within(screen.getByRole('banner')).queryByTitle(/Daily goal/)).not.toBeInTheDocument();
    expect(screen.getAllByTitle(/Daily goal/)).toHaveLength(1);
    expect(goalStrip()).not.toBeInTheDocument();
  });

  // After #261 the identity panel owns the streak glance on Home.
  it('hides the header streak on the Home tab, where PersonalHub already shows one', () => {
    setViewportWidth(1280);
    renderPastEntry(<App />);
    const header = screen.getByRole('banner');
    expect(within(header).queryByText('STREAK')).not.toBeInTheDocument();
    expect(header.querySelector('.lucide-flame')).toBeNull();
    expect(screen.getByLabelText(/^Streak /)).toBeInTheDocument();
  });

  it('counts freeze-rescued days in stats.streak on first load, before any progress event', async () => {
    const today = todayKey();
    const shift = (offset) => {
      const [y, m, d] = today.split('-').map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() + offset);
      const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(dt.getUTCDate()).padStart(2, '0');
      return `${dt.getUTCFullYear()}-${mm}-${dd}`;
    };
    const qual = { byLevel: { a1: { correct: 6, almost: 0, wrong: 0 } } };
    const miss = { byLevel: { a1: { correct: 0, almost: 0, wrong: 0 } } };
    const yesterday = shift(-1);
    localStorage.setItem(
      'deutsch-app-state-v1',
      JSON.stringify({
        daily: { [shift(-3)]: qual, [shift(-2)]: qual, [yesterday]: miss },
        gamification: {
          goal: 50,
          frozenDays: { [yesterday]: true },
          lastReconcileDay: today,
        },
        stats: { streak: 0, learnedCount: 0 },
      })
    );

    renderPastEntry(<App />);
    // deriveGame already passed frozenDays, so Home's glance is freeze-aware
    // even without the hydrate fix. This is the control: the two surfaces must
    // agree on 3, not 0.
    expect(screen.getByLabelText('Streak 3')).toBeInTheDocument();

    await userEvent.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'Vocab' })
    );
    expect(goalStrip()).toBeInTheDocument();
    expect(goalStrip().parentElement).toHaveTextContent(/^3\b/);

    // Mount persist runs after deriveGame AND after applyProgress (which also
    // passes frozenDays). Flush so this cannot pass on that brief write — the
    // hydrate effect previously overwrote it with frozenDays defaulted to {}.
    await act(async () => {
      await Promise.resolve();
    });
    expect(loadState().stats.streak).toBe(3);

    await userEvent.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'Profile' })
    );
    expect(screen.getByText(/STREAK 3/)).toBeInTheDocument();
  });

  describe.each([1280, 375, 320])('daily-goal surfaces at %ipx', (width) => {
    it.each(['Chat', 'Alphabet', 'Vocab', 'Translate', 'Profile'])(
      'shows only GoalStrip on %s and restores Home’s ring on return',
      async (tabName) => {
        setViewportWidth(width);
        seedPopulatedAccount();
        const user = userEvent.setup();
        renderPastEntry(<App />);
        const nav = within(screen.getByRole('navigation'));
        await user.click(nav.getByRole('button', { name: tabName }));
        expect(goalStrip()).toBeInTheDocument();
        expect(screen.queryByTitle(/Daily goal/)).not.toBeInTheDocument();
        const header = screen.getByRole('banner');
        expect(within(header).queryByText('STREAK')).not.toBeInTheDocument();
        expect(header.querySelector('.lucide-flame')).toBeNull();
        await user.click(nav.getByRole('button', { name: 'Home' }));
        expect(goalStrip()).not.toBeInTheDocument();
        expect(screen.getAllByTitle(/Daily goal/)).toHaveLength(1);
        expect(
          within(screen.getByRole('banner')).queryByTitle(/Daily goal/)
        ).not.toBeInTheDocument();
        expect(screen.getByLabelText(/^Streak /)).toBeInTheDocument();
      }
    );
  });

  // At 320px (original iPhone SE) the cluster still overflowed by 25px after the
  // ring came out, so the decorative wordmark scales with the viewport and the
  // chrome tightens, leaving every functional widget in place.
  it('scales the wordmark with the viewport on mobile and tightens the chrome', () => {
    // 480 is inside mobile (< bp.mobile) but past bp.tiny, so the wordmark
    // is present and still viewport-scaled.
    setViewportWidth(480);
    renderPastEntry(<App />);
    const header = screen.getByRole('banner');
    expect(header.style.paddingTop).toContain('8px');
    expect(header.style.paddingTop).toContain('safe-area-inset-top');
    expect(header.style.paddingLeft).toContain('10px');
    const wordmark = within(header)
      .getByText(/Deutsch/)
      .closest('div');
    expect(wordmark.style.fontSize).toBe('min(26px, 6.5vw)');
  });

  // Below 360px even the scaled wordmark cannot coexist with the widgets: a
  // real year-long streak renders level 30 + "365" + a freeze chip + SIGN IN,
  // which measured 34px past a 320px viewport. Every one of those is the only
  // surface for its signal — the freeze count appears nowhere else in the app —
  // so the wordmark, the one decorative item, is dropped instead.
  it('drops the wordmark below 360px', () => {
    setViewportWidth(320);
    renderPastEntry(<App />);
    expect(within(screen.getByRole('banner')).queryByText(/Deutsch/)).not.toBeInTheDocument();
  });

  // The wordmark is decoration and yields to the functional cluster, which grew
  // a ThemeChip. It is hidden across the common phone range and returns at
  // bp.tiny (414), where the header measurably fits again.
  it('hides the wordmark across the phone range and restores it at bp.tiny', () => {
    setViewportWidth(390);
    const { unmount } = renderPastEntry(<App />);
    expect(within(screen.getByRole('banner')).queryByText(/Deutsch/)).toBeNull();
    unmount();

    setViewportWidth(414);
    renderPastEntry(<App />);
    expect(within(screen.getByRole('banner')).getByText(/Deutsch/)).toBeInTheDocument();
  });

  // Contrast audit: signed-in Account sheet at 390 hung off the left after the
  // Home streak hide, because the wordmark-less cluster start-aligned and
  // AccountChip's `right: 0` sheet assumed a trailing-edge chip.
  it('right-aligns the chip cluster so the Account sheet stays on-screen at 390', () => {
    setViewportWidth(390);
    renderPastEntry(<App />);
    const cluster = screen
      .getByRole('banner')
      .querySelector('[data-tutorial-anchor="status"]')?.parentElement;
    expect(cluster?.style.marginLeft).toBe('auto');
  });

  it('keeps the full-size wordmark and chrome on desktop', () => {
    setViewportWidth(1280);
    renderPastEntry(<App />);
    const header = screen.getByRole('banner');
    expect(header.style.paddingTop).toContain('20px');
    expect(header.style.paddingTop).toContain('safe-area-inset-top');
    expect(header.style.paddingLeft).toContain('32px');
    const wordmark = within(header)
      .getByText(/Deutsch/)
      .closest('div');
    expect(wordmark.style.fontSize).toBe('36px');
  });

  it('exposes Appearance from the header ThemeChip on every viewport', () => {
    setViewportWidth(390);
    renderPastEntry(<App />);
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: /^appearance$/i })
    ).toBeInTheDocument();
  });

  it.each([320, 375, 390, 1280])(
    'keeps the populated Chat header within %ipx without a streak StatBlock or overflow',
    async (width) => {
      setViewportWidth(width);
      seedPopulatedAccount();
      const user = userEvent.setup();
      renderPastEntry(<App />);
      await user.click(
        within(screen.getByRole('navigation')).getByRole('button', { name: 'Chat' })
      );
      const header = screen.getByRole('banner');
      expect(within(header).queryByText('STREAK')).not.toBeInTheDocument();
      expect(header.querySelector('.lucide-flame')).toBeNull();
      expect(goalStrip()).toBeInTheDocument();
      expect(within(header).getByTitle(/streak freeze/i)).toBeInTheDocument();
      expect(within(header).getByRole('button', { name: /^appearance$/i })).toBeInTheDocument();
      // jsdom layout is approximate; still catch a cluster that refuses to shrink.
      expect(header.scrollWidth).toBeLessThanOrEqual(width + 1);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
    }
  );

  it.each([320, 375, 390, 1280])(
    'keeps the populated Home header within %ipx without a streak StatBlock or overflow',
    (width) => {
      setViewportWidth(width);
      seedPopulatedAccount();
      renderPastEntry(<App />);
      const header = screen.getByRole('banner');
      expect(within(header).queryByText('STREAK')).not.toBeInTheDocument();
      expect(header.querySelector('.lucide-flame')).toBeNull();
      expect(within(header).getByTitle(/streak freeze/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/^Streak /)).toBeInTheDocument();
      expect(header.scrollWidth).toBeLessThanOrEqual(width + 1);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
    }
  );

  it('mounts Vercel Analytics on the web', () => {
    analytics.renders = 0;
    renderPastEntry(<App />);
    expect(analytics.renders).toBeGreaterThan(0);
  });

  it('leaves Vercel Analytics out of the native app, where its script 404s', () => {
    // The script is page-relative (/_vercel/insights/script.js) and the
    // native shell serves the bundle from a local origin with no such path.
    analytics.renders = 0;
    window.Capacitor = { isNativePlatform: () => true };
    try {
      renderPastEntry(<App />);
      expect(analytics.renders).toBe(0);
    } finally {
      delete window.Capacitor;
    }
  });

  it('draws the freeze count as a named SVG icon, not an emoji', () => {
    setViewportWidth(375);
    seedPopulatedAccount();
    renderPastEntry(<App />);
    const header = screen.getByRole('banner');
    // role="img" + aria-label: `title` alone is hover-only, so touch and
    // screen-reader users never heard what the number meant.
    const chip = within(header).getByRole('img', { name: /streak freezes? held/i });
    expect(chip.querySelector('.lucide-snowflake')).not.toBeNull();
    expect(header.textContent).not.toContain('❄');
  });

  it('no longer offers Appearance inside Stats (header is the single control)', async () => {
    setViewportWidth(1280);
    const user = userEvent.setup();
    renderPastEntry(<App />);
    await user.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'Profile' })
    );
    expect(screen.queryByText(/^Appearance$/i)).not.toBeInTheDocument();
  });

  // The header cluster's width was measured tight enough that BUTTON.icon's
  // own comment records "the spare width at 320px is ~10px" for three chips —
  // this is the fourth. Signed-out omits it (both social endpoints require
  // auth), so the widest real case is signed in + populated + the freeze chip
  // + this button, all four at once.
  it.each([320, 375, 390, 1280])(
    'adds the header search icon for a signed-in learner without overflowing at %ipx',
    (width) => {
      setViewportWidth(width);
      seedPopulatedAccount();
      authMock.status = 'authenticated';
      authMock.mayHaveSession = true;
      renderPastEntry(<App />);
      const header = screen.getByRole('banner');
      expect(within(header).getByRole('button', { name: 'Search people' })).toBeInTheDocument();
      expect(header.scrollWidth).toBeLessThanOrEqual(width + 1);
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth + 1);
    }
  );

  it('hides the header search icon when signed out — both social endpoints require auth', () => {
    setViewportWidth(1280);
    renderPastEntry(<App />);
    expect(
      within(screen.getByRole('banner')).queryByRole('button', { name: 'Search people' })
    ).toBeNull();
  });

  it('opens the search modal from the header icon', async () => {
    setViewportWidth(1280);
    authMock.status = 'authenticated';
    authMock.mayHaveSession = true;
    const user = userEvent.setup();
    renderPastEntry(<App />);

    await user.click(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Search people' })
    );
    expect(screen.getByRole('dialog', { name: 'Search people' })).toBeInTheDocument();
  });
});

// Mid-app sign-in used to re-open WelcomeGate (the gate was the only auth-modal
// host). AuthSheet is now shared — signing in from Stats must not flash the gate.
describe('in-app AuthSheet', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    localStorage.setItem('deutsch-level', 'a1');
    vi.resetModules();
  });

  it('opens from Stats without resurfacing the WelcomeGate', async () => {
    vi.doMock('./lib/auth.js', () => ({
      isAuthConfigured: () => true,
      isGoogleAuthConfigured: () => false,
      isGitHubAuthConfigured: () => false,
      isAppleAuthConfigured: () => false,
      signInWithGoogle: vi.fn(() => Promise.resolve({ error: null })),
      signInWithGitHub: vi.fn(() => Promise.resolve({ error: null })),
      humanAuthError: () => 'Something went wrong — try again.',
      useAuth: () => ({ user: null, session: null, status: 'anonymous' }),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
      getAccessToken: vi.fn(() => Promise.resolve(null)),
      signInWithMagicLink: vi.fn(() => Promise.resolve({ error: null })),
      verifyCode: vi.fn(() => Promise.resolve({ error: null })),
      mayHaveSession: () => false,
      authCallbackKind: () => null,
      authCallbackReason: () => null,
      onNativeAuthCallback: () => () => {},
      getSupabase: () => Promise.resolve(null),
    }));

    const { default: AppWithAuth } = await import('./App.jsx');
    setViewportWidth(1280);
    const user = userEvent.setup();
    renderPastEntry(<AppWithAuth />);

    await user.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'Profile' })
    );
    // The Profile page's own sign-in — scoped to <main>, because the header's
    // account chip carries a "Sign in" of its own.
    const main = screen.getByRole('main');
    expect(within(main).getAllByRole('button', { name: /sign in/i })).toHaveLength(1);
    await user.click(within(main).getByRole('button', { name: /^sign in$/i }));

    expect(screen.getByRole('dialog', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /email me a sign-in code/i })).toBeInTheDocument();
    // Gate brand lives on the dark full-screen WelcomeGate — must stay gone.
    expect(screen.queryByText(/Learn German with an AI tutor/i)).not.toBeInTheDocument();
  });
});

// The guest trial is bounded: once it is spent, earning new progress is walled
// but everything else stays reachable. Five conditions gate the wall and each
// one has a failure mode worth pinning — a dead affordance with no auth
// behind it (PR #79), a wall over a signed-in user, a wall over the Stats tab
// the user is being told to go to, or a wall stamped over a live celebration.
describe('guest trial wall', () => {
  // Four tabs sampled and 60 XP on a 50 XP goal — both halves of the designed
  // peak, so trialStatus reports exhausted.
  const EXHAUSTED = {
    daily: {
      [todayKey()]: {
        total: 8,
        byTab: { chat: 2, alphabet: 2, vocab: 2, translate: 2 },
        byLevel: { a1: { correct: 6, almost: 0, wrong: 0 } },
      },
    },
    gamification: { goal: 50 },
  };
  // One tab, well under the cap, goal not met — trial still running.
  const FRESH = {
    daily: {
      [todayKey()]: {
        total: 2,
        byTab: { chat: 2 },
        byLevel: { a1: { correct: 1, almost: 0, wrong: 0 } },
      },
    },
    gamification: { goal: 50 },
  };

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    // The storage shim is one module-level instance shared by every test in
    // the file — clear it so a seeded account from an earlier block cannot
    // decide whether the trial is exhausted here.
    localStorage.clear();
    asReturningLearner();
    localStorage.setItem('deutsch-level', 'a1');
    vi.resetModules();
  });

  let signInWithGoogle;
  let signInWithGitHub;

  async function renderApp({
    configured = true,
    status = 'anonymous',
    state = EXHAUSTED,
    googleOn = false,
    gitHubOn = false,
  } = {}) {
    localStorage.setItem('deutsch-app-state-v1', JSON.stringify(state));
    signInWithGoogle = vi.fn(() => Promise.resolve({ error: null }));
    signInWithGitHub = vi.fn(() => Promise.resolve({ error: null }));
    vi.doMock('./lib/auth.js', () => ({
      isAuthConfigured: () => configured,
      isGoogleAuthConfigured: () => googleOn,
      isGitHubAuthConfigured: () => gitHubOn,
      isAppleAuthConfigured: () => false,
      signInWithGoogle,
      signInWithGitHub,
      humanAuthError: () => 'Something went wrong — try again.',
      useAuth: () => ({
        user: status === 'authenticated' ? { id: 'u1', email: 'a@b.co' } : null,
        session: null,
        status,
      }),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
      getAccessToken: vi.fn(() => Promise.resolve(null)),
      signInWithMagicLink: vi.fn(() => Promise.resolve({ error: null })),
      verifyCode: vi.fn(() => Promise.resolve({ error: null })),
      mayHaveSession: () => false,
      authCallbackKind: () => null,
      authCallbackReason: () => null,
      onNativeAuthCallback: () => () => {},
      getSupabase: () => Promise.resolve(null),
    }));
    const { default: AppWithAuth } = await import('./App.jsx');
    setViewportWidth(1280);
    renderPastEntry(<AppWithAuth />);
    // Home is the landing tab now and is never walled — land on a practice
    // tab first, exactly as every test below originally assumed when Chat
    // was the default landing tab.
    await userEvent.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'Chat' })
    );
  }

  const wall = () => screen.queryByRole('dialog', { name: 'Save your progress' });
  const goToTab = (user, name) =>
    user.click(within(screen.getByRole('navigation')).getByRole('button', { name }));

  it('walls the practice surface for an exhausted anonymous guest', async () => {
    await renderApp();
    expect(wall()).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create a free account' })).toBeInTheDocument();
  });

  it('follows the guest across all four practice tabs', async () => {
    const user = userEvent.setup();
    await renderApp();
    for (const name of ['Alphabet', 'Vocab', 'Translate', 'Chat']) {
      await goToTab(user, name);
      expect(wall()).toBeInTheDocument();
    }
  });

  it('never walls the Stats tab — it is the escape hatch', async () => {
    const user = userEvent.setup();
    await renderApp();
    await goToTab(user, 'Profile');
    expect(wall()).not.toBeInTheDocument();
  });

  it('never walls the Home tab — it is the new landing surface', async () => {
    await renderApp();
    // renderApp already navigated to Chat (walled); step back to Home.
    await userEvent.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'Home' })
    );
    expect(wall()).not.toBeInTheDocument();
  });

  it('leaves the nav operable while the wall is up', async () => {
    const user = userEvent.setup();
    await renderApp();
    expect(wall()).toBeInTheDocument();
    // Reaching Stats from behind the wall is the whole point of scrimming the
    // practice surface instead of the viewport.
    await goToTab(user, 'Profile');
    expect(wall()).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: /^appearance$/i })
    ).toBeInTheDocument();
  });

  it('never walls a signed-in user', async () => {
    await renderApp({ status: 'authenticated' });
    expect(wall()).not.toBeInTheDocument();
  });

  it('does not flash the wall while the session is still loading', async () => {
    await renderApp({ status: 'loading' });
    expect(wall()).not.toBeInTheDocument();
  });

  it('stays away when auth is unconfigured — no dead affordance', async () => {
    await renderApp({ configured: false });
    expect(wall()).not.toBeInTheDocument();
  });

  it('stays away while the trial still has room', async () => {
    await renderApp({ state: FRESH });
    expect(wall()).not.toBeInTheDocument();
  });

  it('opens the shared AuthSheet from the primary CTA without resurfacing the gate', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(screen.getByRole('button', { name: 'Create a free account' }));

    expect(screen.getByRole('dialog', { name: /create your account/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /email me a sign-in code/i })).toBeInTheDocument();
    // Gate brand lives on the dark full-screen WelcomeGate — must stay gone.
    expect(screen.queryByText(/Learn German with an AI tutor/i)).not.toBeInTheDocument();
  });

  it('opens the sign-in intent from the secondary CTA', async () => {
    const user = userEvent.setup();
    await renderApp();
    await user.click(screen.getByRole('button', { name: 'I already have an account' }));
    expect(screen.getByRole('dialog', { name: /^sign in$/i })).toBeInTheDocument();
    expect(screen.queryByText(/Learn German with an AI tutor/i)).not.toBeInTheDocument();
  });

  // Clause 5, the subtle one. The designed peak fires on the very round that
  // completes the first daily goal — the same round that pushes the
  // "Tagesziel erreicht!" toast and the confetti burst. The wall must wait for
  // the celebration to finish rather than stamping itself over it.
  it('waits for a running celebration to finish before it appears', async () => {
    // All four tabs sampled but only 40 XP against a 50 XP goal: one half of
    // the peak met, so the trial is still running.
    await renderApp({
      state: {
        daily: {
          [todayKey()]: {
            total: 8,
            byTab: { chat: 2, alphabet: 2, vocab: 2, translate: 2 },
            byLevel: { a1: { correct: 4, almost: 0, wrong: 0 } },
          },
        },
        gamification: { goal: 50 },
      },
    });
    expect(wall()).not.toBeInTheDocument();

    // Fake timers activate only now — renderApp's own Chat-tab click (added
    // for the Home-landing-tab change) needs real timers to resolve; the
    // click's internal delay is a real setTimeout that fake time never
    // advances, so starting fake timers before renderApp() hangs it forever.
    // Only the celebration-timing assertions below need deterministic time.
    vi.useFakeTimers();
    try {
      // The round that tips the day over the goal. Preserve the gamification
      // block App just wrote so this reads as one more round, not a reset.
      const cur = JSON.parse(localStorage.getItem('deutsch-app-state-v1'));
      cur.daily[todayKey()].total = 9;
      cur.daily[todayKey()].byLevel.a1.correct = 6;
      localStorage.setItem('deutsch-app-state-v1', JSON.stringify(cur));

      act(() => {
        window.dispatchEvent(new Event('deutsch:progress'));
      });

      // Trial is now exhausted, but the celebration owns the screen.
      expect(screen.getByText('Tagesziel erreicht!')).toBeInTheDocument();
      expect(wall()).not.toBeInTheDocument();

      // Burst clears at 1600ms, the toast at 3200ms — then the wall lands,
      // before the next round can start.
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(screen.queryByText('Tagesziel erreicht!')).not.toBeInTheDocument();
      expect(wall()).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  // The wall's Google button must reach the real signInWithGoogle through
  // App's single handler — not a second sign-in path bolted onto the wall.
  // The wall is a create surface (spec D3), so every provider test below ticks
  // the terms box first; the unticked case has its own test further down.
  it('starts the Google flow from the wall when the flag is on', async () => {
    const user = userEvent.setup();
    await renderApp({ googleOn: true });
    await user.click(screen.getByRole('checkbox', { name: /i agree/i }));
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  it('shows no Google button on the wall when the flag is off', async () => {
    await renderApp();
    expect(wall()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /continue with google/i })).toBeNull();
    expect(signInWithGoogle).not.toHaveBeenCalled();
  });

  // A redirect takes a beat and the page is on its way out; a second tap must
  // not start a second round trip.
  it('does not start a second flow on a double tap', async () => {
    const user = userEvent.setup();
    await renderApp({ googleOn: true });
    await user.click(screen.getByRole('checkbox', { name: /i agree/i }));
    const button = screen.getByRole('button', { name: 'Continue with Google' });
    await user.click(button);
    await user.click(button);
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
  });

  // The native app never navigates away. Google opens in the system browser,
  // and signInWithGoogle settles only once that browser has closed, so the
  // button must come back for a learner who backed out.
  it('re-enables the Google button in the native app once the flow settles', async () => {
    window.Capacitor = { isNativePlatform: () => true };
    try {
      const user = userEvent.setup();
      await renderApp({ googleOn: true });
      await user.click(screen.getByRole('checkbox', { name: /i agree/i }));
      const button = screen.getByRole('button', { name: 'Continue with Google' });
      await user.click(button);
      await waitFor(() => expect(button).not.toHaveAttribute('aria-busy', 'true'));
      await user.click(button);
      expect(signInWithGoogle).toHaveBeenCalledTimes(2);
    } finally {
      delete window.Capacitor;
    }
  });

  // Google off, GitHub on: GitHub holds the wall's provider slot and reaches the
  // real signInWithGitHub through App's handler.
  it('starts the GitHub flow from the wall when only GitHub is on', async () => {
    const user = userEvent.setup();
    await renderApp({ gitHubOn: true });
    await user.click(screen.getByRole('checkbox', { name: /i agree/i }));
    await user.click(screen.getByRole('button', { name: 'Continue with GitHub' }));
    expect(signInWithGitHub).toHaveBeenCalledTimes(1);
    expect(signInWithGoogle).not.toHaveBeenCalled();
  });

  // App must hand the wall BOTH controlled consent props: with either missing
  // the wall falls back to its pre-consent one-tap path (Task 8 ruling).
  it('does not start a provider from the wall until the terms box is ticked', async () => {
    const user = userEvent.setup();
    await renderApp({ googleOn: true });
    const box = screen.getByRole('checkbox', { name: /i agree/i });
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(signInWithGoogle).not.toHaveBeenCalled();
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(localStorage.getItem('deutsch-app-legal-intent-v1')).toBeNull();

    await user.click(box);
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
    // The session-side check consumes this after the redirect.
    expect(localStorage.getItem('deutsch-app-legal-intent-v1')).not.toBeNull();
  });

  // The create sheet records the intent after the tick; its provider buttons
  // must not then run through the sign-in handler that clears it.
  it('the create sheet opened from the wall keeps the intent it records', async () => {
    const user = userEvent.setup();
    await renderApp({ googleOn: true });
    await user.click(screen.getByRole('button', { name: 'Create a free account' }));
    const sheet = screen.getByRole('dialog', { name: /create your account/i });
    await user.click(within(sheet).getByRole('checkbox', { name: /i agree/i }));
    await user.click(within(sheet).getByRole('button', { name: 'Continue with Google' }));
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('deutsch-app-legal-intent-v1')).not.toBeNull();
  });

  it('keeps the wall tick across a trip to /terms and focuses it on return', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    try {
      const user = userEvent.setup();
      await renderApp({ googleOn: true });
      await user.click(screen.getByRole('checkbox', { name: /i agree/i }));
      await user.click(screen.getByRole('link', { name: 'Terms of Service' }));
      expect(
        screen.getByRole('heading', { level: 1, name: 'Terms of Service' })
      ).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /back to the app/i }));
      expect(wall()).toBeInTheDocument();
      const box = screen.getByRole('checkbox', { name: /i agree/i });
      expect(box).toBeChecked();
      expect(box).toHaveFocus();
    } finally {
      scrollTo.mockRestore();
      window.history.replaceState(null, '', '/');
    }
  });

  // The in-flight guard is shared across providers: once Google is on its way
  // out, a tap on GitHub must not start a second round trip racing it.
  it('does not start GitHub while a Google redirect is already in flight', async () => {
    const user = userEvent.setup();
    await renderApp({ googleOn: true, gitHubOn: true });
    // Both on, the wall shows Google only; the sheet behind "I already have an
    // account" lists both.
    await user.click(screen.getByRole('button', { name: 'I already have an account' }));
    const sheet = screen.getByRole('dialog', { name: 'Sign in' });
    await user.click(within(sheet).getByRole('button', { name: 'Continue with Google' }));
    await user.click(within(sheet).getByRole('button', { name: 'Continue with GitHub' }));
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
    expect(signInWithGitHub).not.toHaveBeenCalled();
    // Only the provider actually in flight shows the spinner.
    expect(within(sheet).getByRole('button', { name: 'Continue with Google' })).toHaveAttribute(
      'aria-busy',
      'true'
    );
    expect(within(sheet).getByRole('button', { name: 'Continue with GitHub' })).not.toHaveAttribute(
      'aria-busy'
    );
  });
});

describe('entry gate', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    authMock.configured = true;
    authMock.status = 'anonymous';
    authMock.mayHaveSession = false;
    syncMock.enabled = false;
    setViewportWidth(1280);
    setLevelBoostEnabled(false);
    authSignOutMock.mockClear();
  });

  const gate = () => screen.queryByRole('button', { name: 'Try it first — free →' });

  it('shows the gate to a guest who has already onboarded once', () => {
    // The whole point of the change: a device flag must not hide the gate.
    localStorage.setItem('deutsch-onboarded', '1');
    localStorage.setItem('deutsch-level', 'a1');
    render(<App />);
    expect(gate()).toBeInTheDocument();
  });

  it('lands in the app — no free level picker — after the guest continues', async () => {
    localStorage.setItem('deutsch-level', 'a1');
    render(<App />);
    await userEvent.click(gate());
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('shows placement after a first-time guest continues past the gate', async () => {
    localStorage.removeItem('deutsch-level');
    render(<App />);
    await userEvent.click(gate());
    expect(screen.getByRole('heading', { name: /find your level/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  // Sign out wipes the level, so the gate is up with "no level" decided for a
  // guest. Signing in drops the gate in the same render, before that decision
  // is re-made for an account whose level is still on its way down; the test
  // painted for that one frame, stamped A1, and stayed up (firstRunPlacement)
  // although the account had B1 on the server.
  it.each([
    ['still restoring', 'loading'],
    ['signed in, first sync pending', 'authenticated'],
  ])('never opens placement for an account that is %s', (_label, status) => {
    syncMock.enabled = true;
    localStorage.removeItem('deutsch-level');
    const { rerender } = render(<App />);
    expect(gate()).toBeInTheDocument();

    authMock.status = status;
    authMock.mayHaveSession = true;
    rerender(<App />);

    expect(screen.queryByRole('heading', { name: /find your level/i })).toBeNull();
    expect(localStorage.getItem('deutsch-level')).toBeNull();
  });

  // Native OAuth: the session comes back through the URL scheme while the
  // sheet is open on the gate. Signing in swaps the gate for the app, and the
  // landing that finishes the flow (and closes the sheet) was rendered in a
  // different place in each branch, so it remounted, forgot the sign-in was in
  // flight, and left the "Sign in" sheet over the signed-in app.
  it('closes the sign-in sheet when a native sign-in lands', async () => {
    localStorage.setItem('deutsch-level', 'a1');
    const { rerender } = render(<App />);
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(screen.getByRole('dialog', { name: /^sign in$/i })).toBeInTheDocument();

    act(() => authMock.nativeCallback({ kind: 'pending', reason: null }));
    expect(screen.getByText('Signing you in…')).toBeInTheDocument();

    authMock.status = 'authenticated';
    authMock.mayHaveSession = true;
    rerender(<App />);

    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /^sign in$/i })).toBeNull();
    expect(screen.getByText('Signed in')).toBeInTheDocument();
  });

  it('lets a signed-in user straight through to the app', () => {
    authMock.status = 'authenticated';
    authMock.mayHaveSession = true;
    localStorage.setItem('deutsch-level', 'a1');
    render(<App />);
    expect(gate()).toBeNull();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('does not flash the gate while a session is still resolving', () => {
    // A device holding an auth token is probably signed in. Rendering the gate
    // during 'loading' would blink it in their face on every single load.
    authMock.status = 'loading';
    authMock.mayHaveSession = true;
    localStorage.setItem('deutsch-level', 'a1');
    render(<App />);
    expect(gate()).toBeNull();
  });

  // The token may be stale: it resolves to anonymous and the gate takes over.
  // Rendering the app meanwhile flashed a guest the full Home first.
  it('shows neither the app nor the gate while a stored session resolves', () => {
    authMock.status = 'loading';
    authMock.mayHaveSession = true;
    localStorage.setItem('deutsch-level', 'a1');
    render(<App />);
    expect(screen.getByTestId('session-splash')).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('shows the app if the stored session is still resolving at the cap', () => {
    vi.useFakeTimers();
    try {
      authMock.status = 'loading';
      authMock.mayHaveSession = true;
      localStorage.setItem('deutsch-level', 'a1');
      render(<App />);
      act(() => vi.advanceTimersByTime(SESSION_SPLASH_MAX_MS));
      expect(screen.queryByTestId('session-splash')).toBeNull();
      expect(screen.getByRole('navigation')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the gate during loading when the device holds no token', () => {
    authMock.status = 'loading';
    authMock.mayHaveSession = false;
    localStorage.setItem('deutsch-level', 'a1');
    render(<App />);
    expect(gate()).toBeInTheDocument();
  });

  it('skips the gate entirely when no auth backend is configured', () => {
    // A gate whose only affordance is "continue" is the dead-affordance bug
    // PR #79 already fixed once.
    authMock.configured = false;
    localStorage.setItem('deutsch-level', 'a1');
    render(<App />);
    expect(gate()).toBeNull();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('offers a first-time learner the test, already classified at A1', () => {
    authMock.configured = false;
    localStorage.removeItem('deutsch-level');
    render(<App />);
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.getByRole('heading', { name: /find your level/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^start$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /skip for now — start at a1/i })).toBeInTheDocument();
    // Classified the moment the test painted, so no exit can leave them unplaced.
    expect(localStorage.getItem('deutsch-level')).toBe('a1');
    expect(loadState()?.placement?.source).toBe('default');
  });

  it('skipping lands in the app at A1 and never shows the test again', async () => {
    authMock.configured = false;
    localStorage.removeItem('deutsch-level');
    const first = render(<App />);
    await userEvent.click(screen.getByRole('button', { name: /skip for now — start at a1/i }));
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(localStorage.getItem('deutsch-level')).toBe('a1');

    // THE LOOP: the next load used to put them straight back into the test.
    first.unmount();
    render(<App />);
    expect(screen.queryByRole('heading', { name: /find your level/i })).toBeNull();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('abandoning the test (closed tab / reload) does not force it again', () => {
    authMock.configured = false;
    localStorage.removeItem('deutsch-level');
    const first = render(<App />);
    expect(screen.getByRole('heading', { name: /find your level/i })).toBeInTheDocument();
    // No click at all — the learner just leaves.
    first.unmount();
    render(<App />);
    expect(screen.queryByRole('heading', { name: /find your level/i })).toBeNull();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('does not classify a visitor who is still on the welcome gate', () => {
    // They may pick "Sign in" next, and their account's real level must not be
    // pre-empted by an A1 default written behind the gate.
    authMock.status = 'anonymous';
    authMock.mayHaveSession = false;
    localStorage.removeItem('deutsch-level');
    render(<App />);
    expect(gate()).toBeInTheDocument();
    expect(localStorage.getItem('deutsch-level')).toBeNull();
  });

  it('treats a corrupt stored level as unset and asks them to place', () => {
    authMock.configured = false;
    localStorage.setItem('deutsch-level', 'c2');
    render(<App />);
    expect(screen.getByRole('heading', { name: /find your level/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('shows placement to a signed-in account that has no level yet', () => {
    authMock.status = 'authenticated';
    authMock.mayHaveSession = true;
    localStorage.removeItem('deutsch-level');
    render(<App />);
    expect(gate()).toBeNull();
    expect(screen.getByRole('heading', { name: /find your level/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('enables the level XP boost for a signed-in user', () => {
    authMock.status = 'authenticated';
    authMock.mayHaveSession = true;
    localStorage.setItem('deutsch-level', 'a1');
    render(<App />);
    expect(isLevelBoostEnabled()).toBe(true);
  });

  it('leaves the boost off for a guest', async () => {
    localStorage.setItem('deutsch-level', 'a1');
    render(<App />);
    await userEvent.click(gate());
    expect(isLevelBoostEnabled()).toBe(false);
  });

  // Pins the `gateDismissed` latch reset in App.jsx's onSignOut handlers.
  // The latch is component state set by handleGuest/handleAuthDone — those
  // are the only ways it becomes true — so this test drives the real path:
  // dismiss the gate (as a signed-in user's callback would), then click the
  // actual "Sign out" control AccountSection renders, then flip the mocked
  // auth status the way a real sign-out event would. An earlier version of
  // this test only flipped authMock.status without ever setting the latch
  // or clicking a real control, so it passed identically whether or not the
  // reset existed — it could not fail against the unfixed code.
  //
  // Hard navigation is stubbed: jsdom cannot leave the document. Production
  // sets window.location.href = '/' then window.location.reload() in a
  // finally after signOut, so a server error cannot skip the reset.
  it('re-gates, wipes user storage, and hard-resets on Sign out', async () => {
    localStorage.setItem('deutsch-level', 'b1');
    localStorage.setItem(
      'deutsch-app-state-v1',
      JSON.stringify({ stats: { streak: 9, learnedCount: 20 }, gamification: { xp: 300 } })
    );
    localStorage.setItem(THEME_MODE_KEY, 'light');
    const reload = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '/', reload },
    });
    const user = userEvent.setup();
    const { rerender, unmount } = render(<App />);

    try {
      // Latch gateDismissed the way a real signed-in session does, landing
      // directly on the app shell.
      await user.click(gate());

      authMock.status = 'authenticated';
      authMock.mayHaveSession = true;
      rerender(<App />);
      expect(gate()).toBeNull();
      expect(isLevelBoostEnabled()).toBe(true);

      // Sign out moved off Stats with the account section; the header chip is
      // the shortest real path to it now.
      await user.click(screen.getByRole('button', { name: /account/i }));
      await user.click(screen.getByRole('button', { name: 'Sign out' }));
      await waitFor(() => expect(authSignOutMock).toHaveBeenCalled());
      await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
      expect(window.location.href).toBe('/');

      expect(localStorage.getItem('deutsch-app-state-v1')).toBeNull();
      expect(localStorage.getItem('deutsch-level')).toBeNull();
      expect(localStorage.getItem(THEME_MODE_KEY)).toBe('light');
      expect(loadState()).toBeNull();

      // A real reload starts a new heap. thawPersist + remount stands in for that.
      thawPersist();
      unmount();
      authMock.status = 'anonymous';
      authMock.mayHaveSession = false;
      render(<App />);

      expect(gate()).toBeInTheDocument();
      expect(isLevelBoostEnabled()).toBe(false);
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });

  it('hard-navigates even when signOut returns a server error', async () => {
    localStorage.setItem('deutsch-level', 'b1');
    localStorage.setItem(
      'deutsch-app-state-v1',
      JSON.stringify({ stats: { streak: 9 }, gamification: { xp: 1112 } })
    );
    localStorage.setItem(THEME_MODE_KEY, 'light');
    authSignOutMock.mockResolvedValueOnce({ error: { message: 'network' } });
    const reload = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '/', reload },
    });
    const user = userEvent.setup();
    const { rerender } = render(<App />);

    try {
      await user.click(gate());
      authMock.status = 'authenticated';
      authMock.mayHaveSession = true;
      rerender(<App />);
      // Sign out moved off Stats with the account section; the header chip is
      // the shortest real path to it now.
      await user.click(screen.getByRole('button', { name: /account/i }));
      await user.click(screen.getByRole('button', { name: 'Sign out' }));
      await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
      expect(window.location.href).toBe('/');
      expect(localStorage.getItem('deutsch-app-state-v1')).toBeNull();
      expect(loadState()).toBeNull();
      expect(localStorage.getItem(THEME_MODE_KEY)).toBe('light');
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });

  it('keeps a level picked in settings after leaving and returning to the tab', async () => {
    authMock.status = 'authenticated';
    authMock.mayHaveSession = true;
    localStorage.setItem('deutsch-level', 'b1');
    render(<App />);
    const nav = within(screen.getByRole('navigation'));

    await userEvent.click(nav.getByRole('button', { name: 'Profile' }));
    await userEvent.click(screen.getByRole('button', { name: 'Edit profile' }));
    await userEvent.click(screen.getByRole('button', { name: 'Learning' }));
    await userEvent.click(screen.getByText(/override classification/i));
    await userEvent.click(screen.getByRole('radio', { name: /A1/ }));
    await userEvent.click(nav.getByRole('button', { name: 'Vocab' }));
    await userEvent.click(nav.getByRole('button', { name: 'Profile' }));
    // No second click into Settings: the route persists across a tab
    // round-trip, so returning to Profile lands back inside it. That
    // persistence is what this test is about.
    await userEvent.click(screen.getByRole('button', { name: 'Learning' }));
    await userEvent.click(screen.getByText(/override classification/i));

    // If App had dropped onLevelChange, Settings would re-mount from the stale
    // `level` prop and B1 would be checked again.
    expect(screen.getByRole('radio', { name: /A1/ })).toBeChecked();
  });
});

describe('placement suggestion after 500 XP', () => {
  // XP rides `bonusXp` on a PAST day so the fixture moves lifetime XP without
  // touching today's goal, streak or the guest trial.
  const seedXp = (xp) => {
    const current = loadState() ?? {};
    localStorage.setItem(
      'deutsch-app-state-v1',
      JSON.stringify({ ...current, daily: { '2026-01-01': { byLevel: {}, bonusXp: xp } } })
    );
  };
  const invite = () => screen.queryByRole('region', { name: /ready to check your level/i });

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    localStorage.clear();
    asReturningLearner();
    authMock.configured = true;
    authMock.status = 'anonymous';
    authMock.mayHaveSession = false;
    setViewportWidth(1280);
  });

  it('does not suggest the test below 500 XP', async () => {
    seedXp(499);
    renderPastEntry(<App />);
    await screen.findByRole('heading', { name: /guten tag/i });
    expect(invite()).toBeNull();
  });

  it('suggests the test on Home once the learner reaches 500 XP — without blocking it', async () => {
    seedXp(500);
    renderPastEntry(<App />);
    expect(await screen.findByRole('region', { name: /ready to check your level/i })).toBeVisible();
    // A suggestion, not a wall: the shell is still there and usable.
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /find your level/i })).toBeNull();
    expect(loadState()?.placementOffer?.shownAt).toEqual(expect.any(Number));
  });

  it('does not come back after dismiss, even with more XP', async () => {
    seedXp(500);
    const first = renderPastEntry(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /not now/i }));
    expect(invite()).toBeNull();
    expect(loadState()?.placementOffer?.dismissedAt).toEqual(expect.any(Number));

    first.unmount();
    seedXp(5000);
    renderPastEntry(<App />);
    await screen.findByRole('heading', { name: /guten tag/i });
    expect(invite()).toBeNull();
  });

  it('still opens placement from Settings after the suggestion is dismissed', async () => {
    seedXp(500);
    renderPastEntry(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /not now/i }));

    await userEvent.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'Profile' })
    );
    await userEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await userEvent.click(screen.getByRole('button', { name: 'Learning' }));
    await userEvent.click(screen.getByRole('button', { name: /retake placement/i }));
    expect(screen.getByRole('heading', { name: /find your level/i })).toBeInTheDocument();
  });

  it('opens placement from the suggestion, as a leavable retake', async () => {
    seedXp(500);
    renderPastEntry(<App />);
    await userEvent.click(await screen.findByRole('button', { name: /take the test/i }));
    expect(screen.getByRole('heading', { name: /find your level/i })).toBeInTheDocument();
    expect(loadState()?.placementOffer?.dismissedAt).toEqual(expect.any(Number));
    // Leaving keeps the level they had.
    await userEvent.click(screen.getByRole('button', { name: /keep my current level/i }));
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(localStorage.getItem('deutsch-level')).toBe('a1');
  });
});

// The level lives in App state and is prop-drilled into every practice tab, so
// "the header switched it" and "the tabs re-rendered" are two separate claims.
// The level chip plus the pressed mode button say what Translate is showing —
// the pair the old "A1 — WORD TILES" header printed as one caption.
function expectTranslate(level, mode) {
  expect(screen.getByTestId('translate-level')).toHaveTextContent(level);
  expect(screen.getByRole('button', { name: mode, pressed: true })).toBeInTheDocument();
}

describe('level coordination', () => {
  beforeEach(() => {
    // Shimmed here rather than inherited: this block passed only because an
    // earlier describe in the file had already assigned it to the prototype,
    // so running it alone (`vitest -t "level coordination"`) failed on
    // ChatTab's mount scroll. jsdom has no scrollIntoView.
    Element.prototype.scrollIntoView = vi.fn();
    localStorage.clear();
    asReturningLearner();
    authMock.configured = false;
    authMock.status = 'anonymous';
    authMock.mayHaveSession = false;
    setViewportWidth(1280);
  });

  // One header control now carries both the XP badge and the CEFR code.
  const chip = () =>
    within(screen.getByRole('banner')).getByRole('button', { name: /open status/i });

  it('offers the status control in the header on every viewport', () => {
    setViewportWidth(320);
    renderPastEntry(<App />);
    expect(chip()).toBeInTheDocument();
  });

  // The consolidation only holds if it is genuinely ONE target: a second
  // header button offering the same levels is the clutter it was meant to
  // remove, and the earlier LevelChip + LevelBadge pair is exactly that.
  it('leaves exactly one level affordance in the header', () => {
    renderPastEntry(<App />);
    const header = within(screen.getByRole('banner'));
    expect(header.queryAllByRole('button', { name: /level/i })).toHaveLength(1);
    // Closed by default: the levels live behind the trigger, not beside it.
    // Scoped to the CEFR radios — the Chat tab underneath has a scenario
    // radiogroup of its own, so a bare queryByRole('radio') matches that.
    expect(screen.queryByRole('radiogroup', { name: /learning level/i })).toBeNull();
  });

  it('carries the XP level and the practice level on the same control', async () => {
    const user = userEvent.setup();
    renderPastEntry(<App />);
    expect(chip()).toHaveTextContent('A1');
    await user.click(chip());
    const sheet = within(screen.getByRole('dialog', { name: 'Status' }));
    expect(sheet.getByText('Progress')).toBeInTheDocument();
    expect(sheet.getByText('Practice level')).toBeInTheDocument();
  });

  it('switches the level from Settings and drives the Translate tab with it', async () => {
    const user = userEvent.setup();
    renderPastEntry(<App />);
    await user.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'Translate' })
    );
    expectTranslate('A1', 'Word tiles');

    await user.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'Profile' })
    );
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Learning' }));
    await user.click(screen.getByText(/override classification/i));
    await user.click(screen.getByRole('radio', { name: /B1/ }));
    await user.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'Translate' })
    );

    expectTranslate('B1', 'Free typing');
    expect(screen.queryByTestId('translate-level')).not.toHaveTextContent('A1');
    expect(chip()).toHaveTextContent('B1');
  });

  it('does not put B1 free typing in front of an A1 learner without the override', async () => {
    const user = userEvent.setup();
    renderPastEntry(<App />);
    await user.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'Translate' })
    );
    expectTranslate('A1', 'Word tiles');
    expect(screen.queryByTestId('translate-level')).not.toHaveTextContent('B1');
    expect(screen.queryByRole('textbox')).toBeNull();

    await user.click(chip());
    expect(screen.queryByRole('radiogroup', { name: /level/i })).toBeNull();
    expect(screen.getByRole('button', { name: /retake placement/i })).toBeInTheDocument();

    await user.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'Profile' })
    );
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Learning' }));
    expect(screen.queryByRole('radiogroup', { name: /level/i })).not.toBeInTheDocument();
    expect(screen.getByText(/override classification/i)).toBeInTheDocument();
  });

  // Mid-set, retaking is destructive, so it asks first. Completing placement
  // unmounts the set; declining must leave it alone.
  it('asks before retaking while a set is in progress, then opens placement on confirm', async () => {
    const user = userEvent.setup();
    renderPastEntry(<App />);
    await user.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'Translate' })
    );
    await user.click(screen.getByRole('button', { name: /skip/i }));
    expect(screen.getByText(/Exercise 2 of 10/)).toBeInTheDocument();

    await user.click(chip());
    await user.click(screen.getByRole('button', { name: /retake placement/i }));

    // The confirm names the set at stake; scoped to the sheet, since the
    // Translate header now reads "Exercise 2 of 10" too.
    expect(
      within(screen.getByRole('dialog', { name: 'Status' })).getByText(/exercise 2 of 10/i)
    ).toBeInTheDocument();
    expectTranslate('A1', 'Word tiles');

    await user.click(screen.getByRole('button', { name: /^retake$/i }));
    expect(screen.getByRole('heading', { name: /find your level/i })).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('keeps the set and the level when the retake is declined', async () => {
    const user = userEvent.setup();
    renderPastEntry(<App />);
    await user.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'Translate' })
    );
    await user.click(screen.getByRole('button', { name: /skip/i }));

    await user.click(chip());
    await user.click(screen.getByRole('button', { name: /retake placement/i }));
    await user.click(screen.getByRole('button', { name: /keep going/i }));

    expectTranslate('A1', 'Word tiles');
    expect(screen.getByText(/Exercise 2 of 10/)).toBeInTheDocument();
    expect(localStorage.getItem('deutsch-level')).toBe('a1');
  });

  it('opens placement without asking when no set is in progress', async () => {
    const user = userEvent.setup();
    renderPastEntry(<App />);
    await user.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'Translate' })
    );
    expect(screen.getByText(/Exercise 1 of 10/)).toBeInTheDocument();

    await user.click(chip());
    await user.click(screen.getByRole('button', { name: /retake placement/i }));
    expect(screen.queryByRole('button', { name: /keep going/i })).toBeNull();
    expect(screen.getByRole('heading', { name: /find your level/i })).toBeInTheDocument();
  });

  it('stops asking once the practice tab is left', async () => {
    const user = userEvent.setup();
    renderPastEntry(<App />);
    const nav = () => within(screen.getByRole('navigation'));
    await user.click(nav().getByRole('button', { name: 'Translate' }));
    await user.click(screen.getByRole('button', { name: /skip/i }));
    await user.click(nav().getByRole('button', { name: 'Profile' }));

    await user.click(chip());
    const sheet = within(screen.getByRole('dialog', { name: 'Status' }));
    await user.click(sheet.getByRole('button', { name: /retake placement/i }));
    expect(screen.queryByRole('button', { name: /keep going/i })).toBeNull();
    expect(screen.getByRole('heading', { name: /find your level/i })).toBeInTheDocument();
  });

  it('follows a level written anywhere else, via the change notifier', async () => {
    renderPastEntry(<App />);
    expect(chip()).toHaveTextContent('A1');
    // Stands in for sync pulling a level chosen on another device.
    await act(async () => {
      const { writeLevel } = await import('./lib/levelPref');
      writeLevel('b1');
    });
    expect(chip()).toHaveTextContent('B1');
  });

  it('keeps the Settings switcher and the header control on the same level', async () => {
    const user = userEvent.setup();
    renderPastEntry(<App />);
    await user.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'Profile' })
    );
    await user.click(screen.getByRole('button', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Learning' }));
    await user.click(screen.getByText(/override classification/i));
    await user.click(screen.getByRole('radio', { name: /A2/ }));
    expect(chip()).toHaveTextContent('A2');
    expect(screen.getByRole('radio', { name: /A2/ })).toBeChecked();
  });
});

// ── Sync orchestration ───────────────────────────────────────
// App wires the sync engine in two effects, both guarded by SYNC_ENABLED. The
// flag is false on both machines that run this suite and true in production,
// so the guarded side shipped with no test at all — the same flag-split that
// let #148 reach production green. These drive the value that ships.
describe('sync engine wiring', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    localStorage.setItem('deutsch-level', 'a1');
    syncMock.enabled = false;
    syncMock.start.mockClear();
    syncMock.stop.mockClear();
    syncMock.markDirty.mockClear();
    authMock.status = 'anonymous';
  });

  it('starts the engine for a signed-in user when sync is enabled', () => {
    syncMock.enabled = true;
    authMock.status = 'authenticated';
    renderPastEntry(<App />);
    expect(syncMock.start).toHaveBeenCalledWith('u1');
  });

  // A second effect, a second spy: progress anywhere in the app dispatches
  // `deutsch:progress`, and sync's job is to mark the local state dirty so the
  // next push carries it. Guarded by the same flag, so it shipped untested for
  // the same reason.
  it('marks state dirty when progress is recorded', () => {
    syncMock.enabled = true;
    authMock.status = 'authenticated';
    renderPastEntry(<App />);
    expect(syncMock.markDirty).not.toHaveBeenCalled();

    act(() => {
      window.dispatchEvent(new CustomEvent('deutsch:progress'));
    });
    expect(syncMock.markDirty).toHaveBeenCalledTimes(1);
  });

  // The cleanup half. Without it the listener outlives the signed-in session
  // and a guest's practice would keep marking an ex-user's state dirty.
  it('stops listening for progress once the app unmounts', () => {
    syncMock.enabled = true;
    authMock.status = 'authenticated';
    const { unmount } = renderPastEntry(<App />);
    unmount();

    act(() => {
      window.dispatchEvent(new CustomEvent('deutsch:progress'));
    });
    expect(syncMock.markDirty).not.toHaveBeenCalled();
  });

  // A reconcile writes the merged account to storage, and nothing re-read it:
  // a native webview never fires window focus, so after signing in the app
  // kept showing the pre-sign-in numbers (0 XP for an account with thousands
  // of answers on the server), and its next save wrote that stale in-memory
  // copy back over the merged learned words and decks.
  describe('when a reconcile lands', () => {
    const landReconcile = (patch) =>
      act(() => {
        saveState({ ...(loadState() ?? {}), ...patch });
        syncMock.setStatus({ pending: false, lastSyncedAt: Date.now(), settled: true });
      });
    const day = (correct) => ({
      total: correct,
      bonusXp: 0,
      byTab: { chat: 0, alphabet: 0, vocab: correct, translate: 0 },
      byLevel: {
        a1: { correct, almost: 0, wrong: 0 },
        a2: { correct: 0, almost: 0, wrong: 0 },
        b1: { correct: 0, almost: 0, wrong: 0 },
      },
    });

    beforeEach(() => {
      syncMock.enabled = true;
      authMock.status = 'authenticated';
    });

    it("shows the account's level without waiting for a focus or an answer", () => {
      renderPastEntry(<App />);
      const chip = () =>
        within(screen.getByRole('banner')).getByRole('button', { name: /^XP level/ });
      expect(chip()).toHaveAccessibleName(/^XP level 1,/);

      landReconcile({ daily: { '2026-09-01': day(300) } });
      expect(chip()).not.toHaveAccessibleName(/^XP level 1,/);
    });

    it('keeps the learned words it brought down when the app next saves', () => {
      saveState({ learnedWords: { 'guest-word': true } });
      renderPastEntry(<App />);

      landReconcile({ learnedWords: { 'guest-word': true, 'account-word': true } });
      // The next answer re-saves App's in-memory copy through the persist effect.
      act(() => {
        window.dispatchEvent(new CustomEvent('deutsch:progress'));
      });
      expect(loadState().learnedWords).toEqual({ 'guest-word': true, 'account-word': true });
    });

    it('does not celebrate progress that was made on another device', () => {
      renderPastEntry(<App />);
      landReconcile({ daily: { '2026-09-01': day(300) } });
      // The next answer must not toast the jump from 0 to the account's level,
      // or the badges the account already holds.
      act(() => {
        window.dispatchEvent(new CustomEvent('deutsch:progress'));
      });
      expect(screen.queryByText(/^Level \d+$/)).toBeNull();
      expect(screen.queryByText('Achievement freigeschaltet')).toBeNull();
    });
  });

  // The disabled side of the same guard, asserted rather than assumed: with a
  // user present but the flag off, nothing may be wired up at all.
  it('wires nothing when the flag is off, even with a signed-in user', () => {
    syncMock.enabled = false;
    authMock.status = 'authenticated';
    renderPastEntry(<App />);

    act(() => {
      window.dispatchEvent(new CustomEvent('deutsch:progress'));
    });
    expect(syncMock.start).not.toHaveBeenCalled();
    expect(syncMock.markDirty).not.toHaveBeenCalled();
    expect(syncMock.stop).toHaveBeenCalled();
  });
});

// applyProgress is the only writer of the earned-badge ledger, and it wrote it
// straight to storage — no stamp, no push. The seed therefore carried whatever
// settingsUpdatedAt some earlier, unrelated write had left behind, lost the
// settings LWW to the server, and came back empty; the next focus then "earned"
// every badge again, one "Achievement freigeschaltet" toast at a time.
describe('the badge ledger reaches the server', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    localStorage.setItem('deutsch-level', 'a1');
    syncMock.enabled = true;
    syncMock.start.mockClear();
    syncMock.markDirty.mockClear();
    authMock.status = 'authenticated';
  });

  // These tests actually START the engine, and the shared spy outlives the
  // block — the next describe asserts start was never called.
  afterEach(() => {
    syncMock.start.mockClear();
    syncMock.markDirty.mockClear();
  });

  // seedPopulatedAccount earns NOTHING — 84 exercises is under the vol100 cut
  // and it stores stats.streak: 0, which is the streak the badge tests read.
  // A fixture that cannot express the failure proves nothing, so this one
  // clears two badge thresholds outright.
  function seedEarnedBadges() {
    const daily = {};
    const [y, m, d] = todayKey().split('-').map(Number);
    for (let i = 20; i >= 1; i -= 1) {
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() - i);
      const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(dt.getUTCDate()).padStart(2, '0');
      daily[`${dt.getUTCFullYear()}-${mm}-${dd}`] = {
        total: 6,
        byLevel: { a1: { correct: 6, almost: 0, wrong: 0 } },
      };
    }
    localStorage.setItem(
      'deutsch-app-state-v1',
      JSON.stringify({
        daily, // 120 exercises → vol100
        gamification: { goal: 50 },
        // Matches the streak the 20 qualifying days derive to. A stored
        // streak that DISAGREES with the history makes the second run earn a
        // badge for real, which would mask the stamp behaviour under test.
        stats: { streak: 20, learnedCount: 40 }, // → streak3 + streak7 + streak14
      })
    );
  }

  it('stamps and pushes the badges the first run seeds', async () => {
    seedEarnedBadges();
    expect(loadState().settingsUpdatedAt).toBeUndefined();

    renderPastEntry(<App />);

    const stored = loadState();
    expect(Object.keys(stored.gamification.achievements ?? {}).length).toBeGreaterThan(0);
    // A ledger with no clock of its own loses every LWW it meets.
    expect(typeof stored.settingsUpdatedAt).toBe('number');
    await waitFor(() => expect(syncMock.markDirty).toHaveBeenCalled());
  });

  // The other direction, or the stamp would fire on every window focus and this
  // device would win every settings LWW on fields it never touched — which is
  // the 2026-08-24 level regression the merge carve-outs exist for.
  it('does not re-stamp when a focus earns nothing new', () => {
    seedEarnedBadges();
    renderPastEntry(<App />);
    const stamped = loadState().settingsUpdatedAt;
    syncMock.markDirty.mockClear();

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    expect(loadState().settingsUpdatedAt).toBe(stamped);
    expect(syncMock.markDirty).not.toHaveBeenCalled();
  });
});

describe('progress flush wiring', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    localStorage.setItem('deutsch-level', 'a1');
    syncMock.enabled = false;
    progressFlushMock.start.mockClear();
    progressFlushMock.stop.mockClear();
    progressFlushMock.scheduleFlush.mockClear();
    authMock.status = 'anonymous';
  });

  it('starts the flusher for a signed-in user even when sync is off', () => {
    authMock.status = 'authenticated';
    renderPastEntry(<App />);
    expect(progressFlushMock.start).toHaveBeenCalled();
    expect(syncMock.start).not.toHaveBeenCalled();
  });

  it('does not start the flusher while signed out', () => {
    authMock.status = 'anonymous';
    renderPastEntry(<App />);
    expect(progressFlushMock.start).not.toHaveBeenCalled();
    expect(progressFlushMock.stop).toHaveBeenCalled();
  });

  it('schedules a flush when progress is recorded', () => {
    authMock.status = 'authenticated';
    renderPastEntry(<App />);
    act(() => {
      window.dispatchEvent(new CustomEvent('deutsch:progress'));
    });
    expect(progressFlushMock.scheduleFlush).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════
//  First-run walkthrough
// ═══════════════════════════════════════════════════════════════
//
// The overlay's own placement maths is unit-tested against stubbed rects in
// tutorial/geometry.test.js. What can only be checked here is the wiring: that
// each step's ref is attached to the DOM node it claims, and that the tour
// reaches a learner past the entry gate at all. jsdom lays nothing out, so the
// rects are stubbed onto the REAL header and nav nodes and a resize is fired to
// make the overlay re-measure them.
describe('first-run walkthrough', () => {
  const asRect = (left, top, width, height) => () => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
  });

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    localStorage.clear();
    localStorage.setItem('deutsch-level', 'a1');
    authMock.configured = false;
    authMock.status = 'anonymous';
    authMock.mayHaveSession = false;
    setViewportWidth(1280);
  });

  const tour = () => screen.queryByRole('dialog', { name: /tutorial/i });
  const statusChip = () =>
    within(screen.getByRole('banner')).getByRole('button', { name: /open status/i });
  const navButton = (name) => within(screen.getByRole('navigation')).getByRole('button', { name });
  // The status step anchors to the wrapper around StatusChip, not to the chip
  // button inside it — StatusChip owns its own root ref, so the walkthrough
  // gets its handle from outside. In a browser the wrapper is a flex item
  // sized to that chip; jsdom lays nothing out, so it is what must be stubbed.
  const statusAnchor = () => statusChip().closest('[data-tutorial-anchor="status"]');

  it('greets a learner who has never dismissed it', () => {
    renderPastEntry(<App />);
    expect(tour()).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 3')).toBeInTheDocument();
  });

  it('stays away once the learner has dismissed it', () => {
    asReturningLearner();
    renderPastEntry(<App />);
    expect(tour()).not.toBeInTheDocument();
  });

  it('hands the app back and remembers, when Skip tutorial is clicked', async () => {
    const user = userEvent.setup();
    renderPastEntry(<App />);
    await user.click(screen.getByRole('button', { name: /skip tutorial/i }));

    expect(tour()).not.toBeInTheDocument();
    expect(localStorage.getItem(TUTORIAL_KEY)).toBe('true');
    // The app underneath is intact and usable.
    expect(navButton('Chat')).toBeInTheDocument();
  });

  it('anchors each step to the header chip, then Chat, then Stats', async () => {
    const user = userEvent.setup();
    renderPastEntry(<App />);

    // Distinct, non-overlapping rects so a ref pointing at the wrong node
    // cannot coincidentally land in the right place.
    statusAnchor().getBoundingClientRect = asRect(900, 10, 52, 52);
    navButton('Chat').getBoundingClientRect = asRect(200, 90, 120, 48);
    navButton('Profile').getBoundingClientRect = asRect(600, 90, 120, 48);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    const bubbleCentre = () => {
      const b = screen.getByTestId('tutorial-bubble');
      return Number.parseFloat(b.style.left) + Number.parseFloat(b.style.width) / 2;
    };

    expect(bubbleCentre()).toBeCloseTo(926, 0); // status chip centre
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(bubbleCentre()).toBeCloseTo(260, 0); // Chat nav centre
    await user.click(screen.getByRole('button', { name: /next/i }));
    expect(bubbleCentre()).toBeCloseTo(660, 0); // Stats nav centre
  });

  it('keeps the whole tour inside a 320px viewport, over the real chrome', async () => {
    const user = userEvent.setup();
    setViewportWidth(320);
    Object.defineProperty(window, 'innerHeight', {
      writable: true,
      configurable: true,
      value: 568,
    });
    renderPastEntry(<App />);

    // Icon-only nav at bp.tiny: six buttons across 320px, the last flush right.
    statusAnchor().getBoundingClientRect = asRect(262, 8, 42, 42);
    navButton('Chat').getBoundingClientRect = asRect(55, 60, 45, 44);
    navButton('Profile').getBoundingClientRect = asRect(265, 60, 45, 44);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    for (let step = 1; step <= 3; step += 1) {
      const b = screen.getByTestId('tutorial-bubble');
      const left = Number.parseFloat(b.style.left);
      const width = Number.parseFloat(b.style.width);
      expect(left, `step ${step} left edge`).toBeGreaterThanOrEqual(0);
      expect(left + width, `step ${step} right edge`).toBeLessThanOrEqual(320);
      if (step < 3) await user.click(screen.getByRole('button', { name: /next/i }));
    }
  });
});

// The account lane's client wiring: App owns the fetch, the reauth_required
// branch and the post-delete reset, and none of it was covered before. The
// reauth branch matters most — a 401 that does not open the sheet leaves the
// user at a dead end with no way to finish deleting.
describe('account deletion wiring', () => {
  let fetchSpy;

  beforeEach(() => {
    // The Settings route seeds itself from window.location.hash so it can be
    // deep-linked. jsdom keeps that hash across tests in a file, so without
    // this reset a later test opens with Settings already showing.
    window.location.hash = '';
    // `configured` is deliberately reset here, not just status/token: earlier
    // blocks in this file leave it false, and requestSignIn() is a no-op when
    // auth is unconfigured — so without this the reauth assertion passes or
    // fails depending on which tests ran before it.
    authMock.configured = true;
    authMock.status = 'authenticated';
    authMock.token = 'tok';
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    window.location.hash = '';
    authMock.status = 'anonymous';
    authMock.token = null;
  });

  const jsonRes = (status, body) => ({
    ok: status >= 200 && status < 300,
    status,
    clone() {
      return this;
    },
    json: () => Promise.resolve(body),
  });

  async function armDeletion() {
    setViewportWidth(1280);
    renderPastEntry(<App />);
    // The danger zone lives in the Settings route now, opened from the header
    // chip rather than sitting inside the Stats tab.
    await userEvent.click(screen.getByRole('button', { name: /account/i }));
    await userEvent.click(screen.getByRole('button', { name: /open settings/i }));
    await userEvent.click(screen.getByRole('button', { name: /delete account/i }));
    await userEvent.type(
      screen.getByRole('textbox', { name: /type delete to confirm/i }),
      'DELETE'
    );
    await userEvent.click(screen.getByRole('button', { name: /permanently delete/i }));
  }

  it('sends the typed confirmation to the delete endpoint', async () => {
    fetchSpy.mockResolvedValue(jsonRes(204, {}));
    await armDeletion();

    const call = fetchSpy.mock.calls.find(([url]) => String(url).includes('/account/delete'));
    expect(call).toBeDefined();
    const [, init] = call;
    expect(init.method).toBe('DELETE');
    expect(JSON.parse(init.body)).toEqual({ confirm: 'DELETE' });
    expect(init.headers.Authorization).toBe('Bearer tok');
  });

  it('opens the sign-in sheet when the server demands a fresh authentication', async () => {
    fetchSpy.mockResolvedValue(
      jsonRes(401, { error: { code: 'reauth_required', message: 'Please sign in again.' } })
    );
    await armDeletion();

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: /sign in/i })).toBeInTheDocument()
    );
    // The phrase stays typed so retrying after re-auth is one click.
    expect(screen.getByRole('textbox', { name: /type delete to confirm/i })).toHaveValue('DELETE');
  });

  it('does NOT open the sign-in sheet for an ordinary failure', async () => {
    fetchSpy.mockResolvedValue(jsonRes(500, { error: { code: 'server_error', message: 'boom' } }));
    await armDeletion();

    expect(screen.queryByRole('dialog', { name: /sign in/i })).not.toBeInTheDocument();
  });
});

describe('Home missions fed from real data', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    localStorage.clear();
    asReturningLearner();
    localStorage.setItem('deutsch-level', 'a1');
    leagueStandingMock.value = null;
    leagueStandingMock.calls = [];
  });
  afterEach(() => {
    leagueStandingMock.value = null;
    leagueStandingMock.calls = [];
    authMock.status = 'anonymous';
  });

  /** One card learned in a curated deck: started, not finished. */
  const seedStartedDeck = (index = 0) => {
    const [deckId, cards] = Object.entries(activePack.content.decks)[index];
    localStorage.setItem(
      'deutsch-app-state-v1',
      JSON.stringify({ learnedWords: { [cards[0].id]: true } })
    );
    return { deckId, remaining: cards.length - 1, firstCard: cards[0] };
  };

  it('opens deck-unfinished with the real remaining-card count', async () => {
    const { remaining } = seedStartedDeck();
    renderPastEntry(<App />);

    expect(await screen.findByText(`${remaining} cards left in your deck`)).toBeInTheDocument();
  });

  it('opens Vocab on the deck a Home recommendation named, not the default', async () => {
    const { deckId, firstCard } = seedStartedDeck(1);
    expect(deckId).toBe('food');
    renderPastEntry(<App />);

    await userEvent.click(await screen.findByRole('button', { name: /left in your deck/i }));

    const nav = within(screen.getByRole('navigation'));
    expect(nav.getByRole('button', { name: 'Vocab' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: /Food & Drink/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: /Greetings/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.getByText(firstCard.de)).toBeInTheDocument();
  });

  it('leaves the default Greetings deck selected when Vocab is opened from the nav', async () => {
    seedStartedDeck(1);
    renderPastEntry(<App />);
    await screen.findByRole('button', { name: /left in your deck/i });

    await userEvent.click(
      within(screen.getByRole('navigation')).getByRole('button', { name: 'Vocab' })
    );

    expect(screen.getByRole('button', { name: /Greetings/i })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: /Food & Drink/i })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('opens no deck mission when nothing has been learned', async () => {
    localStorage.setItem('deutsch-app-state-v1', JSON.stringify({ learnedWords: {} }));
    renderPastEntry(<App />);

    await waitFor(() => expect(screen.queryByText(/left in your deck/)).toBeNull());
  });

  it('opens league-position when the caller is in the demotion zone', async () => {
    // The production-only combination: signed in, a standing, and at risk.
    leagueStandingMock.value = { rank: 23, cohortSize: 25, inDemotionZone: true };
    seedStartedDeck();
    renderPastEntry(<App />);

    expect(await screen.findByText(/drop zone/i)).toBeInTheDocument();
  });

  it('opens no league mission for a mid-table standing', async () => {
    leagueStandingMock.value = { rank: 10, cohortSize: 25, inDemotionZone: false };
    seedStartedDeck();
    renderPastEntry(<App />);

    await screen.findByText(/left in your deck/); // the board has rendered
    expect(screen.queryByText(/drop zone/i)).toBeNull();
  });

  it('opens no league mission when there is no standing at all', async () => {
    leagueStandingMock.value = null;
    seedStartedDeck();
    renderPastEntry(<App />);

    await screen.findByText(/left in your deck/);
    expect(screen.queryByText(/drop zone/i)).toBeNull();
  });

  it("asks for the signed-in caller's own standing", async () => {
    authMock.status = 'authenticated';
    seedStartedDeck();
    renderPastEntry(<App />);

    await screen.findByText(/left in your deck/);
    expect(leagueStandingMock.calls).toContain('u1');
  });

  it('asks for no standing at all while signed out', async () => {
    authMock.status = 'anonymous';
    seedStartedDeck();
    renderPastEntry(<App />);

    await screen.findByText(/left in your deck/);
    expect(leagueStandingMock.calls.every((id) => id === undefined)).toBe(true);
  });
});

describe('custom decks survive the component that made them', () => {
  const generated = [
    { de: 'die Sonne', en: 'the sun' },
    { de: 'der Regen', en: 'the rain' },
    { de: 'der Wind', en: 'the wind' },
    { de: 'die Wolke', en: 'the cloud' },
  ];

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    localStorage.clear();
    asReturningLearner();
    localStorage.setItem('deutsch-level', 'a1');
    callClaude.mockReset();
    callClaude.mockResolvedValue(JSON.stringify(generated));
    // syncMock.start is one shared spy for the whole file and an earlier block
    // asserts it WAS called. Without this clear, the guest test below inherits
    // that call and fails depending on execution order.
    syncMock.enabled = false;
    syncMock.start.mockClear();
    authMock.status = 'anonymous';
  });

  afterEach(() => {
    // Leave the shared mocks as this block found them.
    syncMock.enabled = false;
    syncMock.start.mockClear();
    authMock.status = 'anonymous';
  });

  const goToTab = async (name) => userEvent.click(screen.getByRole('button', { name }));

  const generateADeck = async () => {
    await goToTab('Vocab');
    await userEvent.click(screen.getByRole('tab', { name: 'Custom' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Custom deck topic' }), 'weather');
    await userEvent.click(screen.getByRole('button', { name: /GENERATE 10 CARDS/ }));
    expect(await screen.findByRole('button', { name: /Your Deck/ })).toBeInTheDocument();
  };

  it('writes the generated deck into the state blob', async () => {
    renderPastEntry(<App />);
    await generateADeck();

    await waitFor(() => expect(liveCustomDeck()).toBeTruthy());
    const stored = liveCustomDeck();
    expect(stored.name).toBe('weather');
    expect(stored.cards.map((c) => c.de)).toEqual(generated.map((g) => g.de));
    expect(stored.updatedAt).toEqual(expect.any(Number));
  });

  it('keeps the deck across a tab switch — the bug this phase fixes', async () => {
    renderPastEntry(<App />);
    await generateADeck();

    // VocabTab unmounts here. Before this change that destroyed the deck.
    await goToTab('Chat');
    expect(screen.queryByRole('button', { name: /Your Deck/ })).toBeNull();
    await goToTab('Vocab');

    expect(await screen.findByRole('button', { name: /Your Deck/ })).toBeInTheDocument();
  });

  it('keeps the deck across a full remount — the reload case', async () => {
    const first = renderPastEntry(<App />);
    await generateADeck();
    await waitFor(() => expect(liveCustomDeck()).toBeTruthy());
    first.unmount();

    renderPastEntry(<App />);
    await goToTab('Vocab');
    expect(await screen.findByRole('button', { name: /Your Deck/ })).toBeInTheDocument();
  });

  it('does all of that for a signed-out guest, with sync off and no writes', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const first = renderPastEntry(<App />);
    await generateADeck();
    await waitFor(() => expect(liveCustomDeck()).toBeTruthy());
    first.unmount();

    renderPastEntry(<App />);
    await goToTab('Vocab');
    expect(await screen.findByRole('button', { name: /Your Deck/ })).toBeInTheDocument();
    expect(syncMock.start).not.toHaveBeenCalled();
    // No WRITES, which is the claim. Deliberately not "no fetch at all": a
    // read left in flight by an earlier authenticated test can resolve after
    // this spy is installed, and a stray GET is not what this guards.
    const writes = fetchSpy.mock.calls.filter(([, opts]) => (opts?.method ?? 'GET') !== 'GET');
    expect(writes).toEqual([]);
    fetchSpy.mockRestore();
  });

  it('does not lose learnedWords when it writes the deck', async () => {
    // The persist effect is a MERGE. If decks ever replaced the blob instead of
    // extending it, this is the assertion that would notice.
    localStorage.setItem('deutsch-app-state-v1', JSON.stringify({ learnedWords: { Hallo: true } }));
    renderPastEntry(<App />);
    await generateADeck();

    await waitFor(() => expect(liveCustomDeck()).toBeTruthy());
    expect(loadState().learnedWords).toEqual({ Hallo: true });
  });

  it('ignores a corrupted decks blob instead of failing to start', async () => {
    localStorage.setItem(
      'deutsch-app-state-v1',
      JSON.stringify({ decks: { custom: { cards: 'not-an-array' } }, learnedWords: {} })
    );
    renderPastEntry(<App />);
    await goToTab('Vocab');
    await userEvent.click(screen.getByRole('tab', { name: 'Custom' }));

    expect(screen.queryByRole('button', { name: /Your Deck/ })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Custom deck topic' })).toBeInTheDocument();
  });
});

describe('a generated deck tells the sync engine there is something to push', () => {
  const generated = [
    { de: 'die Sonne', en: 'the sun' },
    { de: 'der Regen', en: 'the rain' },
  ];

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    localStorage.clear();
    asReturningLearner();
    localStorage.setItem('deutsch-level', 'a1');
    callClaude.mockReset();
    callClaude.mockResolvedValue(JSON.stringify(generated));
    syncMock.markDirty.mockClear();
    syncMock.start.mockClear();
  });

  afterEach(() => {
    syncMock.enabled = false;
    syncMock.markDirty.mockClear();
    syncMock.start.mockClear();
    authMock.status = 'anonymous';
  });

  const generateADeck = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Vocab' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Custom' }));
    await userEvent.type(screen.getByRole('textbox', { name: 'Custom deck topic' }), 'weather');
    await userEvent.click(screen.getByRole('button', { name: /GENERATE 10 CARDS/ }));
    expect(await screen.findByRole('button', { name: /Your Deck/ })).toBeInTheDocument();
  };

  it('marks the state dirty for a signed-in user with sync on', async () => {
    // Without this the deck sits locally until some UNRELATED progress event or
    // a tab refocus happens to flush it.
    syncMock.enabled = true;
    authMock.status = 'authenticated';
    renderPastEntry(<App />);
    await generateADeck();

    await waitFor(() => expect(syncMock.markDirty).toHaveBeenCalled());
  });

  it('still marks nothing dirty for a guest — sync stays off', async () => {
    syncMock.enabled = false;
    authMock.status = 'anonymous';
    renderPastEntry(<App />);
    await generateADeck();

    expect(syncMock.markDirty).not.toHaveBeenCalled();
  });
});

describe('deleting a custom deck writes a tombstone', () => {
  const generated = [
    { de: 'die Sonne', en: 'the sun' },
    { de: 'der Regen', en: 'the rain' },
  ];

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    localStorage.clear();
    asReturningLearner();
    localStorage.setItem('deutsch-level', 'a1');
    callClaude.mockReset();
    callClaude.mockResolvedValue(JSON.stringify(generated));
    syncMock.enabled = false;
    syncMock.start.mockClear();
    syncMock.markDirty.mockClear();
    authMock.status = 'anonymous';
  });

  afterEach(() => {
    syncMock.enabled = false;
    syncMock.start.mockClear();
    syncMock.markDirty.mockClear();
    authMock.status = 'anonymous';
  });

  const seedDeck = () =>
    localStorage.setItem(
      'deutsch-app-state-v1',
      JSON.stringify({
        decks: {
          custom: {
            deckId: 'custom',
            name: 'weather',
            cards: [{ id: 'die Sonne', de: 'die Sonne', en: 'the sun' }],
            updatedAt: 1000,
            deletedAt: null,
          },
        },
      })
    );

  const openVocab = async () => userEvent.click(screen.getByRole('button', { name: 'Vocab' }));
  const openCustom = async () => {
    await openVocab();
    await userEvent.click(screen.getByRole('tab', { name: 'Custom' }));
  };
  const removeDeck = async () => {
    await userEvent.click(screen.getByRole('button', { name: /^Remove / }));
    await userEvent.click(screen.getByRole('button', { name: /permanently$/ }));
  };

  it('offers a Remove control beside the deck, not nested inside it', async () => {
    seedDeck();
    renderPastEntry(<App />);
    await openCustom();

    const remove = await screen.findByRole('button', { name: /^Remove / });
    const select = screen.getByRole('button', { name: /Your Deck/ });
    // A <button> inside a <button> is invalid HTML and gets silently un-nested.
    expect(select.contains(remove)).toBe(false);
  });

  it('takes the deck out of the picker', async () => {
    seedDeck();
    renderPastEntry(<App />);
    await openCustom();
    await removeDeck();

    await waitFor(() => expect(screen.queryByRole('button', { name: /Your Deck/ })).toBeNull());
  });

  it('records a TOMBSTONE rather than dropping the entry', async () => {
    // A plain delete is invisible to an upsert-only sync engine: the other
    // device would push its copy straight back on the next pull.
    seedDeck();
    renderPastEntry(<App />);
    await openCustom();
    await removeDeck();

    await waitFor(() => expect(tombstones()).toHaveLength(1));
    const stored = tombstones()[0];
    expect(stored.cards).toEqual([]);
    expect(stored.updatedAt).toBe(stored.deletedAt);
  });

  it('keeps the tombstone across a remount, so the deck stays gone', async () => {
    seedDeck();
    const first = renderPastEntry(<App />);
    await openCustom();
    await removeDeck();
    await waitFor(() => expect(tombstones()).toHaveLength(1));
    first.unmount();

    renderPastEntry(<App />);
    await openVocab();
    expect(screen.queryByRole('button', { name: /Your Deck/ })).toBeNull();
  });

  it('falls back off the custom deck when the selected one is removed', async () => {
    // There is no PRESET_DECKS.custom to land on, so without the fallback the
    // learner is left staring at an empty deck.
    seedDeck();
    renderPastEntry(<App />);
    await openVocab();
    await userEvent.click(screen.getByRole('button', { name: /Your Deck/ }));
    await userEvent.click(screen.getByRole('tab', { name: 'Custom' }));
    await removeDeck();
    await userEvent.click(screen.getByRole('tab', { name: 'Practice' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Greetings/ })).toHaveAttribute(
        'aria-pressed',
        'true'
      )
    );
  });

  it('tells the sync engine, so the tombstone reaches the other device', async () => {
    syncMock.enabled = true;
    authMock.status = 'authenticated';
    seedDeck();
    renderPastEntry(<App />);
    await openCustom();
    await removeDeck();

    await waitFor(() => expect(syncMock.markDirty).toHaveBeenCalled());
  });

  it('lets a regenerated deck clear the tombstone', async () => {
    seedDeck();
    renderPastEntry(<App />);
    await openCustom();
    await removeDeck();
    await waitFor(() => expect(tombstones()).toHaveLength(1));

    await userEvent.type(screen.getByRole('textbox', { name: 'Custom deck topic' }), 'weather');
    await userEvent.click(screen.getByRole('button', { name: /GENERATE 10 CARDS/ }));

    expect(await screen.findByRole('button', { name: /Your Deck/ })).toBeInTheDocument();
    // A regeneration is a DIFFERENT deck now, not a revival of the deleted one.
    // The tombstone must stand, or deleting then generating would resurrect the
    // removed deck's identity on every other device.
    await waitFor(() => expect(liveCustomDeck()).toBeTruthy());
    expect(tombstones()).toHaveLength(1);
    expect(liveCustomDeck().deckId).not.toBe(tombstones()[0].deckId);
  });
});

describe('markLearned sets rather than toggles', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    localStorage.clear();
    asReturningLearner();
    // b1 → typed answer, so a one-card deck works (multiple choice needs four).
    localStorage.setItem('deutsch-level', 'b1');
    localStorage.setItem(
      'deutsch-app-state-v1',
      JSON.stringify({
        decks: {
          custom: {
            deckId: 'custom',
            name: 'sun',
            updatedAt: 1000,
            deletedAt: null,
            cards: [{ id: 'die Sonne', de: 'die Sonne', en: 'the sun', glosses: ['the sun'] }],
          },
        },
      })
    );
  });

  const selectCustom = async () =>
    userEvent.click(await screen.findByRole('button', { name: /Your Deck/ }));

  const answerCorrectly = async () => {
    const input = screen.getByRole('textbox', { name: 'Type the English meaning' });
    await userEvent.type(input, 'the sun');
    await userEvent.click(screen.getByRole('button', { name: /CHECK/ }));
  };

  it('keeps a word learned when the same card comes round again', async () => {
    // A correct answer offers only HARD/GOOD/EASY, so the card leaves the queue.
    // Switching decks and back rebuilds it from SRS, which is how a learner meets
    // the same card twice. With the old `!prev[word]` the second correct answer
    // UN-learned it.
    renderPastEntry(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Vocab' }));
    await selectCustom();

    await answerCorrectly();
    expect(screen.getByText('✓ LEARNED')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'GOOD' }));

    // Rebuild the queue: away to a preset deck and back.
    await userEvent.click(screen.getByRole('button', { name: /Greetings/ }));
    await selectCustom();

    await answerCorrectly();
    expect(screen.getByText('✓ LEARNED')).toBeInTheDocument();
    expect(loadState().learnedWords['die Sonne']).toBe(true);
  });

  it('never writes false into learnedWords', async () => {
    // learnedWords is union-merged across devices, so a stray false is not just
    // wrong locally — the next sync discards it, making the bug device-specific.
    renderPastEntry(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Vocab' }));
    await selectCustom();

    await answerCorrectly();
    await userEvent.click(screen.getByRole('button', { name: 'GOOD' }));
    await userEvent.click(screen.getByRole('button', { name: /Greetings/ }));
    await selectCustom();
    await answerCorrectly();

    await waitFor(() => expect(loadState()?.learnedWords).toBeTruthy());
    expect(Object.values(loadState().learnedWords)).not.toContain(false);
  });
});

describe('mastery is recorded where it was earned', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    localStorage.clear();
    asReturningLearner();
    localStorage.setItem('deutsch-level', 'b1');
  });

  const seedOneCardDeck = (id, en) =>
    localStorage.setItem(
      'deutsch-app-state-v1',
      JSON.stringify({
        decks: {
          custom: {
            deckId: 'custom',
            name: 'x',
            updatedAt: 1,
            deletedAt: null,
            cards: [{ id, de: id, en, glosses: [en] }],
          },
        },
      })
    );

  const openCustomDeck = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'Vocab' }));
    await userEvent.click(await screen.findByRole('button', { name: /Your Deck/ }));
  };

  const answer = async (text) => {
    await userEvent.type(screen.getByRole('textbox', { name: 'Type the English meaning' }), text);
    await userEvent.click(screen.getByRole('button', { name: /CHECK/ }));
  };

  it('scopes a newly learned word to the deck it was answered in', async () => {
    seedOneCardDeck('die Sonne', 'the sun');
    renderPastEntry(<App />);
    await openCustomDeck();
    await answer('the sun');

    await waitFor(() => expect(loadState()?.learnedByDeck?.custom).toBeTruthy());
    expect(loadState().learnedByDeck).toEqual({ custom: { 'die Sonne': true } });
  });

  it('still MIRRORS into the flat map, so an older client keeps working', async () => {
    // The mirror is the transition's cost: a device on the previous version
    // reads only learnedWords, and must not see the word vanish.
    seedOneCardDeck('die Sonne', 'the sun');
    renderPastEntry(<App />);
    await openCustomDeck();
    await answer('the sun');

    await waitFor(() => expect(loadState()?.learnedWords?.['die Sonne']).toBe(true));
  });

  it('counts a word once even though it lands in both maps', async () => {
    seedOneCardDeck('die Sonne', 'the sun');
    renderPastEntry(<App />);
    await openCustomDeck();
    await answer('the sun');

    await waitFor(() => expect(loadState()?.learnedByDeck?.custom).toBeTruthy());
    expect(loadState().stats.learnedCount).toBe(1);
  });

  it('backfills a legacy flat key onto the deck its SRS names, on load', async () => {
    localStorage.setItem(
      'deutsch-app-state-v1',
      JSON.stringify({
        learnedWords: { Hallo: true },
        srs: { 'greetings:Hallo': { box: 2, lastReviewed: 1, nextDue: 2, reps: 1 } },
      })
    );
    renderPastEntry(<App />);

    await waitFor(() => expect(loadState()?.learnedByDeck?.greetings).toEqual({ Hallo: true }));
    // and the flat map is untouched — it is union-merged, so pruning would not stick
    expect(loadState().learnedWords.Hallo).toBe(true);
  });

  it('leaves a legacy word with no SRS row in the flat map alone', async () => {
    localStorage.setItem(
      'deutsch-app-state-v1',
      JSON.stringify({ learnedWords: { Unbekannt: true }, srs: {} })
    );
    renderPastEntry(<App />);

    await waitFor(() => expect(loadState()?.stats).toBeTruthy());
    expect(loadState().learnedByDeck).toEqual({});
    expect(loadState().learnedWords.Unbekannt).toBe(true);
  });

  it("drops a deleted deck's scoped mastery but keeps the shared flat mirror", async () => {
    seedOneCardDeck('die Sonne', 'the sun');
    renderPastEntry(<App />);
    await openCustomDeck();
    await answer('the sun');
    await waitFor(() => expect(loadState()?.learnedByDeck?.custom).toBeTruthy());

    await userEvent.click(screen.getByRole('tab', { name: 'Custom' }));
    await userEvent.click(screen.getByRole('button', { name: /^Remove / }));
    await userEvent.click(screen.getByRole('button', { name: /permanently$/ }));

    await waitFor(() => expect(loadState().learnedByDeck.custom).toBeUndefined());
    expect(loadState().learnedWords['die Sonne']).toBe(true);
  });
});

describe('daily quests on Home', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    localStorage.clear();
    asReturningLearner();
    localStorage.setItem('deutsch-level', 'a1');
  });

  it('renders a quest board beside the missions board', () => {
    // One review genuinely owed, so three missions are open (srs-due, the goal,
    // the next badge) and one is left on the board after Recommended takes two.
    // This used to hold for an empty history only because unseen cards counted
    // as due — the forty phantom reviews a brand-new learner no longer sees.
    const [first] = activePack.content.decks.greetings;
    const now = Date.now();
    localStorage.setItem(
      'deutsch-app-state-v1',
      JSON.stringify({
        srs: {
          [`greetings:${first.id}`]: {
            box: 1,
            lastReviewed: now - 2 * 86400000,
            nextDue: now - 86400000,
            reps: 1,
          },
        },
      })
    );
    renderPastEntry(<App />);
    const quests = screen.getByRole('region', { name: /Tagesaufgaben/i });
    const missions = screen.getByRole('region', { name: /Missionen/i });
    // Two boards, not one merged list: a quest must never push `srs-due` off
    // the mission board, which shares a cap of five.
    expect(quests).toBeInTheDocument();
    expect(missions).toBeInTheDocument();
    expect(quests).not.toBe(missions);
  });

  it('shows progress that follows the real day counters', () => {
    localStorage.setItem(
      'deutsch-app-state-v1',
      JSON.stringify({
        daily: {
          [todayKey()]: {
            total: 2,
            bonusXp: 0,
            byTab: { chat: 0, alphabet: 0, vocab: 2, translate: 0 },
            byLevel: {
              a1: { correct: 2, almost: 0, wrong: 0 },
              a2: { correct: 0, almost: 0, wrong: 0 },
              b1: { correct: 0, almost: 0, wrong: 0 },
            },
          },
        },
      })
    );
    renderPastEntry(<App />);

    const board = within(screen.getByRole('region', { name: /Tagesaufgaben/i }));
    const bars = board.getAllByTestId('quest-progress');
    expect(bars.length).toBeGreaterThan(0);
    // At least one quest counts the two answers just recorded.
    expect(bars.some((b) => /^[1-9]/.test(b.textContent.trim()))).toBe(true);
  });

  it('writes nothing to storage for quests — they are derived', () => {
    renderPastEntry(<App />);
    const stored = loadState() ?? {};
    expect(stored.quests).toBeUndefined();
    expect(stored.questProgress).toBeUndefined();
  });

  it('gives the same quests on a re-render — the board cannot reshuffle', () => {
    const first = renderPastEntry(<App />);
    const before = within(screen.getByRole('region', { name: /Tagesaufgaben/i }))
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'));
    first.unmount();

    renderPastEntry(<App />);
    const after = within(screen.getByRole('region', { name: /Tagesaufgaben/i }))
      .getAllByRole('button')
      .map((b) => b.getAttribute('aria-label'));
    expect(after).toEqual(before);
  });

  it("routes to the quest's tab when a row is activated", async () => {
    renderPastEntry(<App />);
    const board = within(screen.getByRole('region', { name: /Tagesaufgaben/i }));
    const rows = board.getAllByRole('button');
    await userEvent.click(rows[0]);
    // Landing anywhere is enough: the assertion is that the row is a live
    // control, which `<li onClick>` rows once were not.
    expect(document.querySelector('main')).toBeInTheDocument();
  });
});

describe('a collection of custom decks', () => {
  const generated = [
    { de: 'die Sonne', en: 'the sun' },
    { de: 'der Regen', en: 'the rain' },
  ];

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    localStorage.clear();
    asReturningLearner();
    localStorage.setItem('deutsch-level', 'a1');
    callClaude.mockReset();
    callClaude.mockResolvedValue(JSON.stringify(generated));
  });

  const seedDecks = (n) => {
    const decks = {};
    for (let i = 0; i < n; i += 1) {
      decks[`custom-${i}`] = {
        deckId: `custom-${i}`,
        name: `topic ${i}`,
        updatedAt: i + 1,
        deletedAt: null,
        cards: [{ id: `w${i}`, de: `Wort${i}`, en: `word${i}` }],
      };
    }
    localStorage.setItem('deutsch-app-state-v1', JSON.stringify({ decks }));
  };

  const openVocab = () => userEvent.click(screen.getByRole('button', { name: 'Vocab' }));
  const openCustom = async () => {
    await openVocab();
    await userEvent.click(screen.getByRole('tab', { name: 'Custom' }));
  };

  it('lists every deck by name', async () => {
    seedDecks(3);
    renderPastEntry(<App />);
    await openVocab();

    for (const name of ['topic 0', 'topic 1', 'topic 2']) {
      expect(await screen.findByText(new RegExp(name))).toBeInTheDocument();
    }
  });

  it('generating ADDS a deck rather than replacing the existing one', async () => {
    seedDecks(1);
    renderPastEntry(<App />);
    await openCustom();

    await userEvent.type(screen.getByRole('textbox', { name: 'Custom deck topic' }), 'weather');
    await userEvent.click(screen.getByRole('button', { name: /GENERATE 10 CARDS/ }));

    await waitFor(() => expect(Object.keys(loadState().decks)).toHaveLength(2));
    const names = Object.values(loadState().decks).map((d) => d.name);
    expect(names).toContain('topic 0');
    expect(names).toContain('weather');
  });

  it('gives each generated deck its own id', async () => {
    seedDecks(0);
    renderPastEntry(<App />);
    await openCustom();

    for (const topic of ['one', 'two']) {
      const field = screen.getByRole('textbox', { name: 'Custom deck topic' });
      // No clear() any more: the app empties the field itself on success, which
      // is what this loop used to have to do by hand.
      await userEvent.type(field, topic);
      await userEvent.click(screen.getByRole('button', { name: /GENERATE 10 CARDS/ }));
      await waitFor(() =>
        expect(Object.values(loadState().decks).some((d) => d.name === topic)).toBe(true)
      );
    }
    const ids = Object.keys(loadState().decks);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(2);
  });

  it('stops generation at the cap and says why', async () => {
    seedDecks(MAX_CUSTOM_DECKS);
    renderPastEntry(<App />);
    await openCustom();

    expect(await screen.findByRole('status')).toHaveTextContent(String(MAX_CUSTOM_DECKS));
    expect(screen.getByRole('button', { name: /GENERATE 10 CARDS/ })).toBeDisabled();
  });

  it('lets a learner generate again after removing one', async () => {
    seedDecks(MAX_CUSTOM_DECKS);
    renderPastEntry(<App />);
    await openCustom();
    expect(await screen.findByRole('status')).toBeInTheDocument();

    await userEvent.click(screen.getAllByRole('button', { name: /^Remove / })[0]);
    await userEvent.click(screen.getByRole('button', { name: /permanently$/ }));

    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(screen.getByRole('textbox', { name: 'Custom deck topic' })).toBeEnabled();
  });

  it('removes only the deck whose control was pressed', async () => {
    seedDecks(3);
    renderPastEntry(<App />);
    await openCustom();
    await screen.findByText(/topic 1/);

    await userEvent.click(screen.getByRole('button', { name: 'Remove topic 1' }));
    await userEvent.click(screen.getByRole('button', { name: /permanently$/ }));

    await waitFor(() => expect(screen.queryByText(/topic 1/)).toBeNull());
    expect(screen.getByText(/topic 0/)).toBeInTheDocument();
    expect(screen.getByText(/topic 2/)).toBeInTheDocument();
  });
});

describe('deck papercuts', () => {
  const generated = [
    { de: 'die Sonne', en: 'the sun' },
    { de: 'der Regen', en: 'the rain' },
  ];

  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    localStorage.clear();
    asReturningLearner();
    localStorage.setItem('deutsch-level', 'a1');
    callClaude.mockReset();
    callClaude.mockResolvedValue(JSON.stringify(generated));
  });

  const openVocab = () => userEvent.click(screen.getByRole('button', { name: 'Vocab' }));
  const openCustom = async () => {
    await openVocab();
    await userEvent.click(screen.getByRole('tab', { name: 'Custom' }));
  };
  const field = () => screen.getByRole('textbox', { name: 'Custom deck topic' });
  const generate = () => userEvent.click(screen.getByRole('button', { name: /GENERATE 10 CARDS/ }));

  it('empties the topic field after a successful generation', async () => {
    renderPastEntry(<App />);
    await openCustom();
    await userEvent.type(field(), 'weather');
    await generate();

    await waitFor(() => expect(liveCustomDeck()).toBeTruthy());
    expect(field()).toHaveValue('');
  });

  it('so a second topic is not typed onto the end of the first', async () => {
    // The actual symptom: "weather" then "food" produced a deck named
    // "weatherfood".
    renderPastEntry(<App />);
    await openCustom();
    await userEvent.type(field(), 'weather');
    await generate();
    await waitFor(() => expect(field()).toHaveValue(''));

    await userEvent.type(field(), 'food');
    await generate();

    await waitFor(() => expect(Object.keys(loadState().decks)).toHaveLength(2));
    expect(
      Object.values(loadState().decks)
        .map((d) => d.name)
        .sort()
    ).toEqual(['food', 'weather']);
  });

  it('KEEPS the topic when generation fails, so a retry needs no retyping', async () => {
    const alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
    callClaude.mockRejectedValue(new Error('upstream down'));

    renderPastEntry(<App />);
    await openCustom();
    await userEvent.type(field(), 'weather');
    await generate();

    await waitFor(() => expect(alertSpy).toHaveBeenCalled());
    expect(field()).toHaveValue('weather');
    vi.unstubAllGlobals();
  });

  it('says "1 card" for a one-card deck, not "1 cards"', async () => {
    localStorage.setItem(
      'deutsch-app-state-v1',
      JSON.stringify({
        decks: {
          'custom-a': {
            deckId: 'custom-a',
            name: 'solo',
            updatedAt: 1,
            deletedAt: null,
            cards: [{ id: 'Eins', de: 'Eins', en: 'one' }],
          },
        },
      })
    );
    renderPastEntry(<App />);
    await openVocab();

    expect(await screen.findByText('1 card')).toBeInTheDocument();
    expect(screen.queryByText('1 cards')).toBeNull();
    expect(screen.getByRole('button', { name: 'Your Deck: solo — 1 card' })).toBeInTheDocument();
  });
});

// ── The placement gate vs. a level that lives on the server ────────────
//
// THE ACCEPTANCE BUG. Opening the README "Live demo" link put a returning,
// signed-in learner straight into "Find your level" with no guest/sign-in
// choice. Their CEFR code was never missing — production had `level: "b1"` in
// `settings.data` the whole time — but it arrives on the first sync reconcile,
// which lands after the first paint. The gate read localStorage at mount,
// found nothing, and took the screen.
//
// These drive VITE_SYNC_ENABLED=true, which is false on both machines that run
// this suite and true in production: the shipping combination.
describe('placement gate while a signed-in level is still in flight', () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
    syncMock.reset();
    syncMock.enabled = true;
    authMock.status = 'authenticated';
    authMock.mayHaveSession = true;
    localStorage.removeItem('deutsch-level');
  });

  const placement = () => screen.queryByRole('heading', { name: /find your level/i });

  it('does not classify a signed-in learner before the first reconcile finishes', () => {
    render(<App />);
    expect(placement()).toBeNull();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('stays out of the way once the reconcile delivers the stored level', async () => {
    render(<App />);
    expect(placement()).toBeNull();

    // What sync.js does at the end of pullAndMerge: adopt the server's level,
    // which writes the key AND announces it.
    const { adoptLevel } = await import('./lib/levelPref');
    await act(async () => {
      adoptLevel('b1');
      syncMock.setStatus({ pending: false, lastSyncedAt: Date.now(), settled: true });
    });

    expect(placement()).toBeNull();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(localStorage.getItem('deutsch-level')).toBe('b1');
  });

  it('classifies once the reconcile comes back with no level at all', async () => {
    // The genuinely new account. Waiting is not the same as never asking.
    render(<App />);
    expect(placement()).toBeNull();

    await act(async () => {
      syncMock.setStatus({ pending: false, lastSyncedAt: Date.now(), settled: true });
    });

    expect(placement()).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull();
  });

  it('still classifies when the reconcile FAILED rather than succeeded', async () => {
    // A failed reconcile settles too. Keying on `lastSyncedAt` instead would
    // wait forever and never place a first-time learner who was offline.
    render(<App />);
    await act(async () => {
      syncMock.setStatus({ pending: false, lastSyncedAt: null, settled: true });
    });
    expect(placement()).toBeInTheDocument();
  });

  // The reported loop: an unclassified (e.g. test) account met the test on
  // every login. Now it is offered once, skippable, and the skip sticks.
  it('offers an unclassified account the test once, and a skip sticks across logins', async () => {
    const user = userEvent.setup();
    const first = render(<App />);
    await act(async () => {
      syncMock.setStatus({ pending: false, lastSyncedAt: Date.now(), settled: true });
    });
    expect(placement()).toBeInTheDocument();
    expect(localStorage.getItem('deutsch-level')).toBe('a1');
    await user.click(screen.getByRole('button', { name: /skip for now — start at a1/i }));
    expect(screen.getByRole('navigation')).toBeInTheDocument();

    first.unmount();
    syncMock.setStatus({ pending: true, lastSyncedAt: null, settled: false });
    render(<App />);
    await act(async () => {
      syncMock.setStatus({ pending: false, lastSyncedAt: Date.now(), settled: true });
    });
    expect(placement()).toBeNull();
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });

  it('never opens for a returning learner, reconcile or not', async () => {
    localStorage.setItem('deutsch-level', 'a2');
    render(<App />);
    expect(placement()).toBeNull();

    await act(async () => {
      syncMock.setStatus({ pending: false, lastSyncedAt: Date.now(), settled: true });
    });
    expect(placement()).toBeNull();
  });

  it('still lets a returning learner retake it from Settings', async () => {
    // The gate getting quieter must not take the deliberate path with it.
    const user = userEvent.setup();
    localStorage.setItem('deutsch-level', 'a2');
    render(<App />);
    await act(async () => {
      syncMock.setStatus({ pending: false, lastSyncedAt: Date.now(), settled: true });
    });

    await user.click(screen.getByRole('button', { name: /profile/i }));
    await user.click(screen.getByRole('button', { name: /^edit profile$/i }));
    await user.click(screen.getByRole('button', { name: 'Learning' }));
    await user.click(screen.getByRole('button', { name: /retake placement/i }));

    expect(placement()).toBeInTheDocument();
  });
});

// ── Terms acceptance (spec §6.4–§6.8) ─────────────────────────────────────
// A signed-in account without a current acceptance record must behave like a
// session that is still restoring: nothing syncs, flushes, joins or registers,
// and the only thing on top is the non-dismissible gate.
describe('terms acceptance gate', () => {
  beforeEach(() => {
    localStorage.clear();
    asReturningLearner();
    authMock.configured = true;
    authMock.status = 'authenticated';
    authMock.mayHaveSession = true;
    syncMock.reset();
    syncMock.enabled = true;
    syncMock.start.mockClear();
    progressFlushMock.start.mockClear();
    leagueStandingMock.calls = [];
    legalMock.accept.mockClear();
    authSignOutMock.mockClear();
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  afterEach(() => {
    syncMock.enabled = false;
    authMock.status = 'anonymous';
    authMock.mayHaveSession = false;
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('holds sync, progress flush, league reads and the level boost while acceptance is required', async () => {
    legalMock.status = 'required';
    legalMock.hasPrior = false;
    setLevelBoostEnabled(true);
    render(<App />);
    expect(await screen.findByRole('alertdialog', { name: 'One more step' })).toBeInTheDocument();
    expect(syncMock.start).not.toHaveBeenCalled();
    expect(progressFlushMock.start).not.toHaveBeenCalled();
    expect(leagueStandingMock.calls.length).toBeGreaterThan(0);
    expect(leagueStandingMock.calls.every((id) => id == null)).toBe(true);
    expect(isLevelBoostEnabled()).toBe(false);
  });

  it('holds everything while the check is unknown, and shows no gate', () => {
    legalMock.status = 'unknown';
    render(<App />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(syncMock.start).not.toHaveBeenCalled();
    expect(progressFlushMock.start).not.toHaveBeenCalled();
  });

  it('starts sync once accepted (returning user: no gate)', async () => {
    legalMock.status = 'accepted';
    render(<App />);
    await waitFor(() => expect(syncMock.start).toHaveBeenCalledWith('u1'));
    expect(progressFlushMock.start).toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('asks an account that accepted an older version to review the update', async () => {
    legalMock.status = 'required';
    legalMock.hasPrior = true;
    render(<App />);
    expect(
      await screen.findByRole('alertdialog', { name: "We've updated our terms" })
    ).toBeInTheDocument();
  });

  it('Continue records the acceptance through the hook', async () => {
    legalMock.status = 'required';
    render(<App />);
    await userEvent.click(await screen.findByRole('checkbox', { name: /i agree/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(legalMock.accept).toHaveBeenCalledTimes(1);
  });

  it('declining on a device that never synced keeps guest progress', async () => {
    legalMock.status = 'required';
    localStorage.setItem('deutsch-app-state-v1', JSON.stringify({ srs: { k: { box: 2 } } }));
    // A leftover ticked-box intent must not survive the decline and be
    // credited to whichever account signs in next.
    localStorage.setItem('deutsch-app-legal-intent-v1', JSON.stringify({ at: Date.now() }));
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    expect(authSignOutMock).toHaveBeenCalled();
    expect(localStorage.getItem('deutsch-app-state-v1')).toContain('"box":2');
    expect(localStorage.getItem('deutsch-app-legal-intent-v1')).toBeNull();
  });

  it('declining on a device that already synced gets the full sign-out reset', async () => {
    legalMock.status = 'required';
    const go = vi.spyOn(locationReset, 'go').mockImplementation(() => {});
    localStorage.setItem('deutsch-app-state-v1', JSON.stringify({ srs: { k: { box: 2 } } }));
    localStorage.setItem(
      'deutsch-app-sync-meta-v1',
      JSON.stringify({ lastSyncedCounters: {}, lastSyncedAt: '2026-09-29T10:00:00Z' })
    );
    render(<App />);
    await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(go).toHaveBeenCalled());
    expect(authSignOutMock).toHaveBeenCalled();
    expect(localStorage.getItem('deutsch-app-state-v1')).toBeNull();
  });

  // D1 accounts meet the gate on an old session, so the delete endpoint's
  // re-auth window has usually lapsed. The sign-in sheet it opens must sit ON
  // TOP of the gate (not hidden behind its scrim with focus trapped inside),
  // and backing out of it must not cost the gate its tick.
  it('a re-auth demanded by delete opens the sign-in sheet above the gate, tick intact', async () => {
    legalMock.status = 'required';
    legalMock.hasPrior = false;
    authMock.token = 'tok';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      clone() {
        return this;
      },
      json: async () => ({ error: { code: 'reauth_required', message: 'Please sign in again.' } }),
    });
    render(<App />);
    const gate = await screen.findByRole('alertdialog', { name: 'One more step' });
    await userEvent.click(within(gate).getByRole('checkbox', { name: /i agree/i }));
    await userEvent.click(
      within(gate).getByRole('button', { name: 'Delete this account instead' })
    );
    await userEvent.type(
      within(gate).getByRole('textbox', { name: /type delete to confirm/i }),
      'DELETE'
    );
    await userEvent.click(within(gate).getByRole('button', { name: 'Delete account' }));

    const sheet = await screen.findByRole('dialog', { name: /^sign in$/i });
    const zOf = (el) => Number(el.parentElement.style.zIndex);
    expect(zOf(sheet)).toBeGreaterThan(zOf(gate));
    expect(sheet.contains(document.activeElement)).toBe(true);

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: /^sign in$/i })).toBeNull();
    expect(within(gate).getByRole('checkbox', { name: /i agree/i })).toBeChecked();
  });

  it('deleting from the gate on a never-synced device keeps guest progress', async () => {
    legalMock.status = 'required';
    authMock.token = 'tok';
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, status: 204, clone: () => ({}), json: async () => ({}) });
    localStorage.setItem('deutsch-app-state-v1', JSON.stringify({ srs: { k: { box: 2 } } }));
    render(<App />);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Delete this account instead' })
    );
    await userEvent.type(
      screen.getByRole('textbox', { name: /type delete to confirm/i }),
      'DELETE'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    await waitFor(() => expect(authSignOutMock).toHaveBeenCalled());
    const call = fetchSpy.mock.calls.find(([url]) => String(url).includes('/account/delete'));
    expect(call?.[1].method).toBe('DELETE');
    expect(localStorage.getItem('deutsch-app-state-v1')).toContain('"box":2');
  });

  it('the gate links reach /terms and come back to a still-ticked, focused box', async () => {
    legalMock.status = 'required';
    render(<App />);
    await userEvent.click(await screen.findByRole('checkbox', { name: /i agree/i }));
    await userEvent.click(screen.getByRole('link', { name: 'Terms of Service' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /back to the app/i }));
    const box = await screen.findByRole('checkbox', { name: /i agree/i });
    expect(box).toBeChecked();
    expect(box).toHaveFocus();
  });
});

describe('create sheet keeps its draft across the legal pages', () => {
  beforeEach(() => {
    localStorage.clear();
    asReturningLearner();
    authMock.configured = true;
    authMock.status = 'anonymous';
    authMock.mayHaveSession = false;
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  });

  afterEach(() => {
    window.history.replaceState(null, '', '/');
    vi.restoreAllMocks();
  });

  it('email, tick and focus survive a trip to /privacy', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await userEvent.type(screen.getByLabelText('Email'), 'kept@b.co');
    await userEvent.click(screen.getByRole('checkbox', { name: /i agree/i }));
    await userEvent.click(screen.getByRole('link', { name: 'Privacy Policy' }));
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /back to the app/i }));
    expect(await screen.findByRole('dialog', { name: /create your account/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('kept@b.co');
    const box = screen.getByRole('checkbox', { name: /i agree/i });
    expect(box).toBeChecked();
    expect(box).toHaveFocus();
  });

  it('dismissing the sheet clears the tick and the intent (no false acceptance)', async () => {
    render(<App />);
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await userEvent.click(screen.getByRole('checkbox', { name: /i agree/i }));
    localStorage.setItem('deutsch-app-legal-intent-v1', JSON.stringify({ at: Date.now() }));
    await userEvent.click(screen.getByRole('button', { name: /close sign-in/i }));
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByRole('checkbox', { name: /i agree/i })).not.toBeChecked();
    expect(localStorage.getItem('deutsch-app-legal-intent-v1')).toBeNull();
  });
});

describe('guest mode is unchanged by the terms work', () => {
  beforeEach(() => {
    localStorage.clear();
    asReturningLearner();
    authMock.configured = true;
    authMock.status = 'anonymous';
    authMock.mayHaveSession = false;
    syncMock.start.mockClear();
  });

  it('"Try it first — free" needs no checkbox and enters the app', async () => {
    render(<App />);
    expect(screen.queryByRole('checkbox')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /try it first/i }));
    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(syncMock.start).not.toHaveBeenCalled();
  });

  it('legal pages render on a cold load while signed out', () => {
    window.history.replaceState(null, '', '/terms');
    render(<App />);
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument();
    window.history.replaceState(null, '', '/#/privacy');
    render(<App />);
    expect(
      screen.getAllByRole('heading', { level: 1, name: 'Privacy Policy' }).length
    ).toBeGreaterThan(0);
    window.history.replaceState(null, '', '/');
  });

  // Store checklist item 6: Google Play's deletion URL must work for someone
  // who is signed out and has no app — so no welcome screen in front of it.
  it('the account-deletion page renders on a cold load while signed out', () => {
    window.history.replaceState(null, '', '/delete-account');
    try {
      render(<App />);
      expect(
        screen.getByRole('heading', { level: 1, name: 'Delete your Deutsch Sprachschule account' })
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /try it first/i })).toBeNull();
    } finally {
      window.history.replaceState(null, '', '/');
    }
  });
});

// Spec D3 / §6.7: the welcome screen's provider buttons are sign-in surfaces.
// A ticked-box intent left behind by an abandoned create must not ride along
// and be credited to whichever account signs in there.
describe('welcome-screen sign-in drops a stale terms intent', () => {
  beforeEach(() => {
    localStorage.clear();
    asReturningLearner();
    vi.resetModules();
  });

  it('clears the intent before starting Google', async () => {
    const signInWithGoogle = vi.fn(() => Promise.resolve({ error: null }));
    vi.doMock('./lib/auth.js', () => ({
      isAuthConfigured: () => true,
      isGoogleAuthConfigured: () => true,
      isGitHubAuthConfigured: () => false,
      isAppleAuthConfigured: () => false,
      signInWithGoogle,
      signInWithGitHub: vi.fn(() => Promise.resolve({ error: null })),
      humanAuthError: () => 'Something went wrong — try again.',
      useAuth: () => ({ user: null, session: null, status: 'anonymous' }),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
      getAccessToken: vi.fn(() => Promise.resolve(null)),
      signInWithMagicLink: vi.fn(() => Promise.resolve({ error: null })),
      verifyCode: vi.fn(() => Promise.resolve({ error: null })),
      mayHaveSession: () => false,
      authCallbackKind: () => null,
      authCallbackReason: () => null,
      onNativeAuthCallback: () => () => {},
      getSupabase: () => Promise.resolve(null),
    }));
    const { default: AppWithAuth } = await import('./App.jsx');
    localStorage.setItem('deutsch-app-legal-intent-v1', JSON.stringify({ at: Date.now() }));
    render(<AppWithAuth />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(signInWithGoogle).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('deutsch-app-legal-intent-v1')).toBeNull();
  });
});

// The standings section is the only surface that WRITES league state from the
// client (joinLeague puts the learner in a cohort where others can see their
// handle). It must follow the gated user like everything else: an account
// that has not accepted the current terms must not be joined.
describe('league join waits for the terms', () => {
  const league = {
    joinLeague: vi.fn(),
    refreshLeague: vi.fn(),
  };
  // Mutable so one test can play a guest who signs in without a reload.
  const session = { user: null };

  beforeEach(() => {
    localStorage.clear();
    asReturningLearner();
    setViewportWidth(1280);
    session.user = { id: 'u1', email: 'a@b.co' };
    league.joinLeague
      .mockReset()
      .mockResolvedValue({ league_id: 'L1', tier: 0, period_start: '2026-09-28', handle: 'Me' });
    league.refreshLeague.mockReset().mockResolvedValue({ weekly_xp: 0 });
    vi.resetModules();
    // Self-contained: earlier blocks leave their own doMock of auth.js behind.
    vi.doMock('./lib/auth.js', async (orig) => ({
      ...(await orig()),
      isAuthConfigured: () => true,
      isGoogleAuthConfigured: () => false,
      isGitHubAuthConfigured: () => false,
      isAppleAuthConfigured: () => false,
      mayHaveSession: () => Boolean(session.user),
      getAccessToken: async () => null,
      useAuth: () => ({
        session: null,
        user: session.user,
        status: session.user ? 'authenticated' : 'anonymous',
      }),
    }));
    vi.doMock('./lib/leagues.js', async (orig) => ({
      ...(await orig()),
      LEAGUES_ENABLED: true,
      joinLeague: league.joinLeague,
      refreshLeague: league.refreshLeague,
      fetchStandings: vi.fn(async () => []),
      fetchLeagueProfiles: vi.fn(async () => []),
      fetchMyResults: vi.fn(async () => []),
      fetchProfile: vi.fn(async () => null),
    }));
  });

  afterEach(() => {
    vi.doUnmock('./lib/leagues.js');
  });

  const profileTab = () =>
    within(screen.getByRole('navigation')).getByRole('button', { name: 'Profile' });
  // Let any join the section would start get as far as calling the client.
  const settle = () => act(async () => {});

  it.each(['required', 'unknown'])('does not join or refresh a league while %s', async (status) => {
    legalMock.status = status;
    const { default: AppWithLeagues } = await import('./App.jsx');
    render(<AppWithLeagues />);
    fireEvent.click(profileTab());
    await settle();
    expect(league.joinLeague).not.toHaveBeenCalled();
    expect(league.refreshLeague).not.toHaveBeenCalled();
  });

  it('does not join a guest who signs in on the Profile tab before accepting', async () => {
    session.user = null;
    const { default: AppWithLeagues } = await import('./App.jsx');
    const { rerender } = render(<AppWithLeagues />);
    fireEvent.click(screen.getByRole('button', { name: /try it first/i }));
    fireEvent.click(profileTab());
    // The code is verified in-app: the session arrives with no reload.
    session.user = { id: 'u1', email: 'a@b.co' };
    legalMock.status = 'required';
    rerender(<AppWithLeagues />);
    await settle();
    expect(
      screen.getByRole('alertdialog', { name: /one more step|updated our terms/i })
    ).toBeInTheDocument();
    expect(league.joinLeague).not.toHaveBeenCalled();
    expect(league.refreshLeague).not.toHaveBeenCalled();
  });

  it('joins once the account has accepted (positive control)', async () => {
    legalMock.status = 'accepted';
    const { default: AppWithLeagues } = await import('./App.jsx');
    render(<AppWithLeagues />);
    fireEvent.click(profileTab());
    await waitFor(() => expect(league.joinLeague).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(league.refreshLeague).toHaveBeenCalledTimes(1));
  });
});
