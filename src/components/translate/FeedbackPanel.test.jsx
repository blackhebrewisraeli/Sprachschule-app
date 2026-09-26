import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FeedbackPanel from './FeedbackPanel';

describe('FeedbackPanel', () => {
  it('renders the correct variant without repeating the answer', () => {
    render(
      <FeedbackPanel verdict="correct" correctText="Ich bin müde" note="Nice." onNext={() => {}} />
    );
    expect(screen.getByText('✓ Correct')).toBeInTheDocument();
    // Fully correct → the canonical answer is not echoed back.
    expect(screen.queryByText('Ich bin müde')).not.toBeInTheDocument();
    expect(screen.getByText('Nice.')).toBeInTheDocument();
  });

  it('renders the almost variant with the canonical answer', () => {
    render(
      <FeedbackPanel verdict="almost" correctText="Ich bin müde" note="Typo." onNext={() => {}} />
    );
    expect(screen.getByText('≈ Almost')).toBeInTheDocument();
    expect(screen.getByText('Ich bin müde')).toBeInTheDocument();
  });

  it('renders the wrong variant with the canonical answer', () => {
    render(<FeedbackPanel verdict="wrong" correctText="Ich bin müde" onNext={() => {}} />);
    expect(screen.getByText('✗ Not quite')).toBeInTheDocument();
    expect(screen.getByText('Ich bin müde')).toBeInTheDocument();
  });

  it('omits the note line when no note is given', () => {
    const { container } = render(
      <FeedbackPanel verdict="wrong" correctText="Ich bin müde" onNext={() => {}} />
    );
    expect(container.querySelector('[style*="italic"]')).not.toBeInTheDocument();
  });

  it('calls onNext from the next button', async () => {
    const onNext = vi.fn();
    render(<FeedbackPanel verdict="correct" onNext={onNext} />);
    await userEvent.click(screen.getByRole('button', { name: 'Next exercise' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  // XP flourish
  it('shows +XP with multiplier on correct when mult > 1', () => {
    render(<FeedbackPanel verdict="correct" xp={15} mult={1.5} onNext={() => {}} />);
    expect(screen.getByText(/\+15 XP/)).toBeInTheDocument();
    expect(screen.getByText(/×1\.5🔥/)).toBeInTheDocument();
  });

  it('shows +XP without multiplier badge when mult === 1', () => {
    render(<FeedbackPanel verdict="correct" xp={10} mult={1} onNext={() => {}} />);
    expect(screen.getByText(/\+10 XP/)).toBeInTheDocument();
    expect(screen.queryByText(/×/)).not.toBeInTheDocument();
  });

  it('shows flourish on almost verdict', () => {
    render(<FeedbackPanel verdict="almost" xp={6} mult={1} onNext={() => {}} />);
    expect(screen.getByText(/\+6 XP/)).toBeInTheDocument();
  });

  it('does not show flourish on wrong verdict', () => {
    render(<FeedbackPanel verdict="wrong" xp={3} mult={1} onNext={() => {}} />);
    expect(screen.queryByText(/\+3 XP/)).not.toBeInTheDocument();
  });

  it('does not show flourish when xp is 0 or omitted', () => {
    render(<FeedbackPanel verdict="correct" xp={0} mult={1} onNext={() => {}} />);
    expect(screen.queryByText(/\+0 XP/)).not.toBeInTheDocument();
  });
});
