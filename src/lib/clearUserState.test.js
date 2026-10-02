import { describe, it, expect, vi, beforeEach } from 'vitest';
import { THEME_MODE_KEY } from './themeMode.js';
import { TUTORIAL_KEY } from './tutorialPref.js';
import { LEVEL_KEY } from './levelPref.js';
import { SYNC_META_KEY } from './sync/syncMeta.js';
import { loadState, saveState } from './storage.js';
import {
  PRESERVED_LOCAL_KEYS,
  clearUserLocalState,
  signOutAndReset,
  locationReset,
} from './clearUserState.js';

const STATE_KEY = 'deutsch-app-state-v1';
const ONBOARDED_KEY = 'deutsch-onboarded';
const WELCOME_KEY = 'deutsch-welcome-dismissed';

function seedUserData() {
  saveState({
    stats: { streak: 12, learnedCount: 40, lastVisit: '2026-08-27' },
    learnedWords: { hallo: true },
    gamification: { xp: 420, goal: 50 },
    srs: { 'card-1': { box: 3 } },
  });
  localStorage.setItem(LEVEL_KEY, 'b1');
  localStorage.setItem(TUTORIAL_KEY, 'true');
  localStorage.setItem(ONBOARDED_KEY, '1');
  localStorage.setItem(WELCOME_KEY, '1');
  localStorage.setItem(SYNC_META_KEY, JSON.stringify({ lastSyncedAt: 1 }));
  localStorage.setItem('sb-xcnn-auth-token', JSON.stringify({ access_token: 'x' }));
  localStorage.setItem(THEME_MODE_KEY, 'light');
}

describe('clearUserLocalState', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('names only the theme key as preserved', () => {
    expect(PRESERVED_LOCAL_KEYS).toEqual([THEME_MODE_KEY]);
    expect(THEME_MODE_KEY).toBe('deutsch-theme-mode');
  });

  it('removes user-specific keys and keeps theme', () => {
    seedUserData();
    clearUserLocalState();

    expect(localStorage.getItem(STATE_KEY)).toBeNull();
    expect(localStorage.getItem(LEVEL_KEY)).toBeNull();
    expect(localStorage.getItem(TUTORIAL_KEY)).toBeNull();
    expect(localStorage.getItem(ONBOARDED_KEY)).toBeNull();
    expect(localStorage.getItem(WELCOME_KEY)).toBeNull();
    expect(localStorage.getItem(SYNC_META_KEY)).toBeNull();
    expect(localStorage.getItem('sb-xcnn-auth-token')).toBeNull();
    expect(localStorage.getItem(THEME_MODE_KEY)).toBe('light');
  });

  it('sweeps the cached entitlement tier on sign-out', () => {
    localStorage.setItem(
      'deutsch-app-entitlement-v1',
      JSON.stringify({ userId: 'u1', tier: 'premium', at: Date.now() })
    );
    clearUserLocalState();
    expect(localStorage.getItem('deutsch-app-entitlement-v1')).toBeNull();
  });

  it('leaves theme unset when it was never stored', () => {
    localStorage.setItem(STATE_KEY, '{"stats":{}}');
    clearUserLocalState();
    expect(localStorage.getItem(THEME_MODE_KEY)).toBeNull();
    expect(localStorage.getItem(STATE_KEY)).toBeNull();
  });

  it('does not throw when storage is blocked', () => {
    const spy = vi.spyOn(Storage.prototype, 'clear').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => clearUserLocalState()).not.toThrow();
    spy.mockRestore();
  });

  it('so a later hydrate cannot restore previous XP', () => {
    seedUserData();
    expect(loadState()?.stats?.streak).toBe(12);
    clearUserLocalState();
    expect(loadState()).toBeNull();
  });
});

describe('signOutAndReset', () => {
  beforeEach(() => {
    localStorage.clear();
    seedUserData();
  });

  it('signs out, then wipes user data, then hard-resets — in that order', async () => {
    const order = [];
    const signOut = vi.fn(async () => {
      order.push('signOut');
      // Session must still see the previous account until signOut returns.
      expect(localStorage.getItem(STATE_KEY)).toBeTruthy();
      expect(localStorage.getItem('sb-xcnn-auth-token')).toBeTruthy();
      return { error: null };
    });
    const reload = vi.fn(() => {
      order.push('reload');
      expect(localStorage.getItem(STATE_KEY)).toBeNull();
      expect(localStorage.getItem(THEME_MODE_KEY)).toBe('light');
    });

    const { error } = await signOutAndReset({ signOut, reload });

    expect(error).toBeNull();
    expect(order).toEqual(['signOut', 'reload']);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(STATE_KEY)).toBeNull();
    expect(localStorage.getItem(LEVEL_KEY)).toBeNull();
    expect(localStorage.getItem(THEME_MODE_KEY)).toBe('light');
    expect(loadState()).toBeNull();
  });

  it('still wipes and hard-navigates when signOut reports a server error', async () => {
    const reload = vi.fn();
    const { error } = await signOutAndReset({
      signOut: async () => ({ error: { message: 'network' } }),
      reload,
    });

    expect(error).toEqual({ message: 'network' });
    expect(reload).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(STATE_KEY)).toBeNull();
    expect(loadState()).toBeNull();
    expect(localStorage.getItem(THEME_MODE_KEY)).toBe('light');
  });

  it('hard-reloads the document when no reload override is passed', async () => {
    const go = vi.spyOn(locationReset, 'go').mockImplementation(() => {});
    await signOutAndReset({ signOut: async () => ({ error: null }) });
    expect(go).toHaveBeenCalledTimes(1);
    go.mockRestore();
  });

  it('locationReset.go reloads even when already at /', () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { href: '/', reload },
    });
    try {
      locationReset.go();
      expect(window.location.href).toBe('/');
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: original,
      });
    }
  });

  // The drop-token RPC acts as the signed-in user, so it has to land while
  // there still is one. After signOut the device would keep the old account's
  // pushes.
  it('forgets the push device before the session ends', async () => {
    const order = [];
    const forgetDevice = vi.fn(async () => {
      order.push('forgetDevice');
    });
    const signOut = vi.fn(async () => {
      order.push('signOut');
      return { error: null };
    });
    await signOutAndReset({ forgetDevice, signOut, reload: () => order.push('reload') });
    expect(order).toEqual(['forgetDevice', 'signOut', 'reload']);
  });

  it('still signs out when forgetting the device throws', async () => {
    const signOut = vi.fn(async () => ({ error: null }));
    const reload = vi.fn();
    await signOutAndReset({
      forgetDevice: async () => {
        throw new Error('offline');
      },
      signOut,
      reload,
    });
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(STATE_KEY)).toBeNull();
  });

  it('blocks saveState from rewriting the blob after the wipe', async () => {
    await signOutAndReset({
      signOut: async () => ({ error: null }),
      reload: () => {},
    });
    saveState({ stats: { streak: 12 }, gamification: { xp: 1112 } });
    expect(localStorage.getItem(STATE_KEY)).toBeNull();
    expect(loadState()).toBeNull();
  });
});
