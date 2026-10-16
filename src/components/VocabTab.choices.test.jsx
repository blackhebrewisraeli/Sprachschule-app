import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import VocabTab from './VocabTab';
import { shuffle } from '../lib/utils';

// Count shuffle invocations while keeping a deterministic (identity) order so
// the component still renders its four option tiles.
vi.mock('../lib/claude', () => ({ callClaude: vi.fn() }));
vi.mock('../lib/utils', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, shuffle: vi.fn((arr) => [...arr]) };
});

// A handoff opens the session on first paint, so the options are on screen
// without a click — and a click would itself be a re-render.
const props = {
  level: 'a1',
  learnedWords: {},
  markLearned: () => {},
  mobile: false,
  reviewTarget: { tab: 'vocab', context: 'greetings' },
};

describe('VocabTab multiple-choice options', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  // Regression: getChoices() reshuffles on every call, so computing it inline in
  // render let any unrelated re-render (e.g. a parent sync-status update) reorder
  // the answer buttons under the user's finger → wrong answer registered.
  it('builds the options once per card — a re-render does not reshuffle them', () => {
    const { rerender } = render(<VocabTab {...props} />);
    expect(screen.getByRole('button', { name: 'Back to decks' })).toBeInTheDocument();
    const callsForFirstCard = shuffle.mock.calls.length;
    expect(callsForFirstCard).toBeGreaterThan(0); // options were built for the current card

    // Re-renders that do NOT change the card must not rebuild/reshuffle the options.
    rerender(<VocabTab {...props} />);
    rerender(<VocabTab {...props} />);
    rerender(<VocabTab {...props} />);

    expect(shuffle.mock.calls.length).toBe(callsForFirstCard);
  });
});
