import { describe, it, expect } from 'vitest';
import { screenshotSeed, pasteSnippet, SEED_GOAL, SEED_STREAK_DAYS } from './screenshot-seed.js';
import { STATE_KEY } from './learning-path-seed.js';
import { currentStreak, bestStreakFromHistory } from '../../src/lib/streak.js';
import { xpForDay } from '../../src/lib/xpCore.js';
import { trialStatus } from '../../src/lib/trial.js';
import { TRIAL_ROUND_CAP } from '../../src/lib/gameConfig.js';

const NOW = new Date(2026, 9, 5, 14, 0, 0); // local noon-ish, any day works
const TODAY = '2026-10-05';
const blobOf = (seed) => JSON.parse(seed.localStorage[STATE_KEY]);

describe('screenshotSeed', () => {
  it('gives a live seven-day streak by the app’s own derivation', () => {
    const { daily } = blobOf(screenshotSeed({ now: NOW }));
    expect(currentStreak(daily, SEED_GOAL, TODAY)).toBe(SEED_STREAK_DAYS);
    expect(bestStreakFromHistory(daily, SEED_GOAL)).toBe(SEED_STREAK_DAYS);
  });

  it('leaves today’s goal in progress, and every earlier day above it by a modest margin', () => {
    const { daily } = blobOf(screenshotSeed({ now: NOW }));
    const xp = (key) => xpForDay(daily[key]);
    expect(xp(TODAY)).toBeGreaterThan(0);
    expect(xp(TODAY)).toBeLessThan(SEED_GOAL);
    const past = Object.keys(daily).filter((k) => k !== TODAY);
    expect(past).toHaveLength(SEED_STREAK_DAYS);
    for (const key of past) {
      expect(xp(key)).toBeGreaterThanOrEqual(SEED_GOAL);
      expect(xp(key)).toBeLessThan(SEED_GOAL * 2);
    }
  });

  it('is a modest history in the real shapes, with A2 chosen', () => {
    const seed = screenshotSeed({ now: NOW });
    const blob = blobOf(seed);
    expect(seed.localStorage['deutsch-level']).toBe('a2');
    expect(Object.keys(blob.learnedWords).length).toBeGreaterThan(10);
    expect(Object.keys(blob.learnedByDeck).length).toBeGreaterThan(3);
    expect(blob.gamification.goal).toBe(SEED_GOAL);
    // Every learned card is scheduled, none overdue: no review-due banner.
    for (const row of Object.values(blob.srs)) expect(row.nextDue).toBeGreaterThan(NOW.getTime());
  });

  // Over the cap, a guest sees the blocking "Save your progress" sheet on every
  // practice tab, so no practice scene could be captured. Leave room for the
  // rounds a capture answers on the day.
  it('keeps a guest inside the trial, with room for a capture session', () => {
    const blob = blobOf(screenshotSeed({ now: NOW }));
    const trial = trialStatus(blob.daily, blob.gamification);
    expect(trial.exhausted).toBe(false);
    expect(TRIAL_ROUND_CAP - trial.roundsUsed).toBeGreaterThanOrEqual(10);
  });

  it('holds no personal data', () => {
    const text = JSON.stringify(screenshotSeed({ now: NOW }).localStorage);
    expect(text).not.toMatch(/@|sb-|access_token|avatar/i);
  });

  it('prints a self-contained snippet that writes every key and reloads', () => {
    const seed = screenshotSeed({ now: NOW });
    const snippet = pasteSnippet(seed);
    expect(snippet).toContain('localStorage.setItem');
    expect(snippet).toContain('location.reload()');
    for (const key of Object.keys(seed.localStorage)) expect(snippet).toContain(`"${key}"`);
  });
});
