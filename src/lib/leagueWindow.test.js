import { describe, it, expect } from 'vitest';
import { HOME_WINDOW_SIZE, leagueWindow, windowStart } from './leagueWindow.js';

// A cohort ordered by weekly_xp desc, with the caller at `meAt` (1-based).
const cohort = (size, meAt) =>
  Array.from({ length: size }, (_, i) => ({
    user_id: i + 1 === meAt ? 'me' : `u${i + 1}`,
    weekly_xp: (size - i) * 10,
  }));

const ranksShown = (size, meAt) => leagueWindow(cohort(size, meAt), 'me').slots.map((s) => s.rank);

describe('windowStart', () => {
  it.each([
    // [rank, cohortSize, first place shown]
    [1, 25, 1],
    [2, 25, 1],
    [3, 3, 1], // third AND last → 1, 2, 3
    [3, 25, 2], // third, not last → 2, 3, 4
    [25, 25, 23], // last → two above, then you
    [4, 4, 2],
    [10, 25, 9], // mid-table → one above, you, one below
    [4, 5, 3],
    [1, 1, 1],
    [2, 2, 1],
  ])('rank %i of %i starts at place %i', (rank, size, start) => {
    expect(windowStart(rank, size)).toBe(start);
  });
});

describe('leagueWindow', () => {
  it('always returns exactly three slots', () => {
    for (const [size, meAt] of [
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 3],
      [25, 1],
      [25, 13],
      [25, 25],
    ]) {
      expect(leagueWindow(cohort(size, meAt), 'me').slots).toHaveLength(HOME_WINDOW_SIZE);
    }
  });

  it('shows the podium to first and second place', () => {
    expect(ranksShown(25, 1)).toEqual([1, 2, 3]);
    expect(ranksShown(25, 2)).toEqual([1, 2, 3]);
  });

  it('shows the podium to third place when third is also last', () => {
    expect(ranksShown(3, 3)).toEqual([1, 2, 3]);
  });

  it('shows 2, 3, 4 to third place when someone is below them', () => {
    expect(ranksShown(4, 3)).toEqual([2, 3, 4]);
    expect(ranksShown(25, 3)).toEqual([2, 3, 4]);
  });

  it('shows the two places above a last-place learner', () => {
    expect(ranksShown(4, 4)).toEqual([2, 3, 4]);
    expect(ranksShown(25, 25)).toEqual([23, 24, 25]);
  });

  it('gives a mid-table learner one neighbour on each side', () => {
    expect(ranksShown(25, 4)).toEqual([3, 4, 5]);
    expect(ranksShown(25, 12)).toEqual([11, 12, 13]);
    expect(ranksShown(25, 24)).toEqual([23, 24, 25]);
  });

  it('keeps the caller in the window at every rank', () => {
    for (let size = 1; size <= 25; size += 1) {
      for (let meAt = 1; meAt <= size; meAt += 1) {
        const { rank, slots } = leagueWindow(cohort(size, meAt), 'me');
        expect(rank).toBe(meAt);
        expect(slots.find((s) => s.member?.user_id === 'me')?.rank).toBe(meAt);
      }
    }
  });

  it('pads a cohort smaller than three with open slots', () => {
    const one = leagueWindow(cohort(1, 1), 'me');
    expect(one.slots.map((s) => [s.rank, s.member?.user_id ?? null])).toEqual([
      [1, 'me'],
      [2, null],
      [3, null],
    ]);

    const two = leagueWindow(cohort(2, 2), 'me');
    expect(two.slots.map((s) => [s.rank, s.member?.user_id ?? null])).toEqual([
      [1, 'u1'],
      [2, 'me'],
      [3, null],
    ]);
  });

  it('returns null when the caller is not in the cohort', () => {
    expect(leagueWindow(cohort(5, 0), 'me')).toBeNull();
    expect(leagueWindow([], 'me')).toBeNull();
    expect(leagueWindow(null, 'me')).toBeNull();
  });
});
