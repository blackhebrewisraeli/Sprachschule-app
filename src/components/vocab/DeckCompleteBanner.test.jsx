import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeckCompleteBanner from './DeckCompleteBanner';

const props = { learnedCount: 7, onPracticeAgain: () => {}, onBack: () => {} };

describe('DeckCompleteBanner', () => {
  it('reports how many words were learned, as the heading of its screen', () => {
    render(<DeckCompleteBanner {...props} />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Deck complete — 7 words learned' })
    ).toBeInTheDocument();
    expect(screen.queryByText(/🎉/)).not.toBeInTheDocument();
  });

  it('centers the completion copy and its actions', () => {
    const { container } = render(<DeckCompleteBanner {...props} />);
    expect(container.firstChild).toHaveStyle({
      justifyContent: 'center',
      textAlign: 'center',
    });
  });

  it('offers exactly two actions: practice again, then back to decks', () => {
    render(<DeckCompleteBanner {...props} />);
    expect(screen.getAllByRole('button').map((b) => b.textContent.trim())).toEqual([
      'Practice again',
      'Back to decks',
    ]);
  });

  it('requests another practice round', async () => {
    const onPracticeAgain = vi.fn();
    render(<DeckCompleteBanner {...props} onPracticeAgain={onPracticeAgain} />);
    await userEvent.click(screen.getByRole('button', { name: 'Practice again' }));
    expect(onPracticeAgain).toHaveBeenCalledTimes(1);
  });

  it('returns to the decks', async () => {
    const onBack = vi.fn();
    render(<DeckCompleteBanner {...props} onBack={onBack} />);
    await userEvent.click(screen.getByRole('button', { name: 'Back to decks' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
