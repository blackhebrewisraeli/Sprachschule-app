import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ReviewFeed from './ReviewFeed';
import { FONT_SIZE, SPACE } from '../../lib/theme';

const item = {
  key: 'vocab:greetings:Hallo',
  tab: 'vocab',
  context: 'greetings',
  label: 'Hallo',
  detail: 'Hello',
  lastVerdict: 'wrong',
  wrongCount: 2,
};

describe('ReviewFeed', () => {
  it('renders a row with badge, label, detail, and wrong count', () => {
    render(<ReviewFeed items={[item]} onReview={() => {}} />);
    expect(screen.getByText('Hallo')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText(/VOCAB · GREETINGS/)).toBeInTheDocument();
    expect(screen.getByText(/✗ 2×/)).toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveStyle({
      gap: `${SPACE[2]}px`,
      padding: `${SPACE[2]}px ${SPACE[3]}px`,
    });
    expect(screen.getByText('Hallo')).toHaveStyle({ fontSize: `${FONT_SIZE.base}px` });
    expect(screen.getByText('Hello')).toHaveStyle({ fontSize: `${FONT_SIZE.sm}px` });
  });

  it('calls onReview with the clicked item', async () => {
    const onReview = vi.fn();
    render(<ReviewFeed items={[item]} onReview={onReview} />);
    await userEvent.click(screen.getByRole('button'));
    expect(onReview).toHaveBeenCalledWith(item);
  });

  it('uses the ≈ glyph for an "almost" item', () => {
    render(<ReviewFeed items={[{ ...item, lastVerdict: 'almost' }]} onReview={() => {}} />);
    expect(screen.getByText(/≈ 2×/)).toBeInTheDocument();
  });

  it('shows the empty state when there are no items', () => {
    render(<ReviewFeed items={[]} onReview={() => {}} />);
    expect(screen.getByText('Nothing to review — keep practising.')).toBeInTheDocument();
    expect(document.querySelector('[data-ui="status-note"]')).not.toBeNull();
  });
});
