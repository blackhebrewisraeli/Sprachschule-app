import { describe, it, expect, beforeEach } from 'vitest';
import {
  shouldWelcomeBack,
  welcomedThisSession,
  markWelcomed,
  WELCOME_BACK_KEY,
} from './welcomeBack';

const READY = {
  authStatus: 'authenticated',
  syncSettled: true,
  blocked: false,
  hasLevel: true,
  xp: 120,
  tutorialDone: true,
  shown: false,
};

describe('shouldWelcomeBack', () => {
  it('greets a signed-in learner who has practised, once everything has arrived', () => {
    expect(shouldWelcomeBack(READY)).toBe(true);
  });

  it.each([
    ['a guest — the entry gate already greeted them', { authStatus: 'anonymous' }],
    ['auth still resolving', { authStatus: 'loading' }],
    ['before the first reconcile lands', { syncSettled: false }],
    ['while placement, a legal page or the gate is up', { blocked: true }],
    ['a learner with no level yet', { hasLevel: false }],
    ['a brand-new learner with no XP', { xp: 0 }],
    ['while the first-run tutorial is still due', { tutorialDone: false }],
    ['a second time in the same session', { shown: true }],
  ])('stays quiet for %s', (_name, patch) => {
    expect(shouldWelcomeBack({ ...READY, ...patch })).toBe(false);
  });
});

describe('session flag', () => {
  beforeEach(() => sessionStorage.clear());

  it('is unset on a fresh session and set after marking', () => {
    expect(welcomedThisSession()).toBe(false);
    markWelcomed();
    expect(welcomedThisSession()).toBe(true);
    expect(sessionStorage.getItem(WELCOME_BACK_KEY)).toBe('1');
  });
});
