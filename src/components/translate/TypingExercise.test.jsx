import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TypingExercise from './TypingExercise';
import { callClaude, QuotaExhaustedError } from '../../lib/claude';
import { recordEvent } from '../../lib/stats';

vi.mock('../../lib/claude', async (importActual) => ({
  ...(await importActual()),
  callClaude: vi.fn(),
}));

vi.mock('../../lib/stats', async (importActual) => {
  const actual = await importActual();
  return { ...actual, recordEvent: vi.fn(actual.recordEvent) };
});

const exercise = {
  en: 'I am tired',
  de: 'Ich bin müde',
};

const grade = (verdict) =>
  JSON.stringify({ verdict, corrected: 'Ich bin müde', message: 'Feedback line.' });

describe('TypingExercise', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the textarea and disables CHECK while empty', () => {
    render(
      <TypingExercise exercise={exercise} level="b1" onCorrect={() => {}} onSkip={() => {}} />
    );
    expect(screen.getByRole('textbox', { name: 'Your German translation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /CHECK/ })).toBeDisabled();
  });

  it('shows GRADING... and disables the button while the grade is pending', async () => {
    let resolveGrade;
    callClaude.mockReturnValue(new Promise((res) => (resolveGrade = res)));
    render(
      <TypingExercise exercise={exercise} level="b1" onCorrect={() => {}} onSkip={() => {}} />
    );
    await userEvent.type(screen.getByRole('textbox'), 'Ich bin müde');
    await userEvent.click(screen.getByRole('button', { name: /CHECK/ }));
    const grading = screen.getByRole('button', { name: 'GRADING...' });
    expect(grading).toBeDisabled();
    resolveGrade(grade('correct'));
    expect(await screen.findByText('✓ Correct')).toBeInTheDocument();
  });

  it('calls onCorrect on a "correct" verdict', async () => {
    callClaude.mockResolvedValue(grade('correct'));
    const onCorrect = vi.fn();
    render(
      <TypingExercise exercise={exercise} level="b1" onCorrect={onCorrect} onSkip={() => {}} />
    );
    await userEvent.type(screen.getByRole('textbox'), 'Ich bin müde');
    await userEvent.click(screen.getByRole('button', { name: /CHECK/ }));
    expect(await screen.findByText('✓ Correct')).toBeInTheDocument();
    expect(onCorrect).toHaveBeenCalledTimes(1);
    expect(callClaude).toHaveBeenCalledWith(expect.any(String), expect.any(String), [], {
      endpoint: 'grade',
      routingContext: { taskType: 'translation_check', userTier: 'guest' },
    });
  });

  it('"almost" still advances and shows the corrected sentence', async () => {
    callClaude.mockResolvedValue(grade('almost'));
    const onCorrect = vi.fn();
    render(
      <TypingExercise exercise={exercise} level="b1" onCorrect={onCorrect} onSkip={() => {}} />
    );
    await userEvent.type(screen.getByRole('textbox'), 'Ich bin mude');
    await userEvent.click(screen.getByRole('button', { name: /CHECK/ }));
    expect(await screen.findByText('≈ Almost')).toBeInTheDocument();
    expect(screen.getByText('Ich bin müde')).toBeInTheDocument();
    expect(onCorrect).toHaveBeenCalledTimes(1);
  });

  it('"wrong" shows the panel without advancing', async () => {
    callClaude.mockResolvedValue(grade('wrong'));
    const onCorrect = vi.fn();
    render(
      <TypingExercise exercise={exercise} level="b1" onCorrect={onCorrect} onSkip={() => {}} />
    );
    await userEvent.type(screen.getByRole('textbox'), 'Hund');
    await userEvent.click(screen.getByRole('button', { name: /CHECK/ }));
    expect(await screen.findByText('✗ Not quite')).toBeInTheDocument();
    expect(onCorrect).not.toHaveBeenCalled();
  });

  it('falls back to a wrong panel with a connection note when grading fails', async () => {
    callClaude.mockRejectedValue(new Error('network down'));
    const onCorrect = vi.fn();
    render(
      <TypingExercise exercise={exercise} level="b1" onCorrect={onCorrect} onSkip={() => {}} />
    );
    await userEvent.type(screen.getByRole('textbox'), 'Ich bin müde');
    await userEvent.click(screen.getByRole('button', { name: /CHECK/ }));
    expect(await screen.findByText('✗ Not quite')).toBeInTheDocument();
    expect(screen.getByText('Could not grade — check your connection.')).toBeInTheDocument();
    expect(onCorrect).not.toHaveBeenCalled();
  });

  it('calls onSkip from the skip button', async () => {
    const onSkip = vi.fn();
    render(<TypingExercise exercise={exercise} level="b1" onCorrect={() => {}} onSkip={onSkip} />);
    await userEvent.click(screen.getByRole('button', { name: 'Skip exercise' }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('a quota denial is not a wrong answer', async () => {
    callClaude.mockRejectedValue(
      new QuotaExhaustedError({
        meter: 'grade',
        tier: 'free',
        resetsAt: '2026-10-02T00:00:00.000Z',
        message: 'Daily AI limit reached.',
      })
    );
    const onCorrect = vi.fn();
    render(
      <TypingExercise exercise={exercise} level="b1" onCorrect={onCorrect} onSkip={() => {}} />
    );
    await userEvent.type(screen.getByRole('textbox'), 'Ich bin müde');
    await userEvent.click(screen.getByRole('button', { name: /CHECK/ }));
    expect(await screen.findByText(/daily checking limit reached/i)).toBeInTheDocument();
    expect(screen.queryByText(/check your connection/i)).toBeNull();
    expect(screen.queryByText(/Not quite/)).toBeNull();
    expect(recordEvent).not.toHaveBeenCalled();
    expect(onCorrect).not.toHaveBeenCalled();
    // The learner can still skip the exercise.
    expect(screen.getByRole('button', { name: 'Skip exercise' })).toBeEnabled();
  });
});
