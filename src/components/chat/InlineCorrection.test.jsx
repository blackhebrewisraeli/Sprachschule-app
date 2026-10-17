import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InlineCorrection from './InlineCorrection';
import { canSpeak, speak } from '../../lib/speech';

vi.mock('../../lib/speech', () => ({ speak: vi.fn(), canSpeak: vi.fn() }));

const correction = {
  original: 'Ich habe hunger',
  fixed: 'Ich habe Hunger',
  explain: 'Nouns are capitalized in German.',
};

describe('InlineCorrection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canSpeak).mockReturnValue(true);
  });

  it('keeps the fix but drops HEAR IT where nothing can speak', async () => {
    vi.mocked(canSpeak).mockReturnValue(false);
    render(<InlineCorrection correction={correction} />);
    await userEvent.click(screen.getByRole('button', { name: /Needs a fix/i }));
    expect(screen.getByText('Correct: Ich habe Hunger')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'HEAR IT' })).not.toBeInTheDocument();
  });

  it('shows a collapsed cue with the fix, and hides detail until expanded', () => {
    render(<InlineCorrection correction={correction} />);
    expect(screen.getByRole('button', { name: /Needs a fix/i })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.getByText('Ich habe Hunger')).toBeInTheDocument();
    expect(screen.queryByText(/You said/)).not.toBeInTheDocument();
    expect(screen.queryByText('Nouns are capitalized in German.')).not.toBeInTheDocument();
  });

  it('expands original, fix, explanation and HEAR IT', async () => {
    render(<InlineCorrection correction={correction} />);
    await userEvent.click(screen.getByRole('button', { name: /Needs a fix/i }));
    expect(screen.getByRole('button', { name: /Needs a fix/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByText(/You said: Ich habe hunger/)).toBeInTheDocument();
    expect(screen.getByText('Correct: Ich habe Hunger')).toBeInTheDocument();
    expect(screen.getByText('Nouns are capitalized in German.')).toBeInTheDocument();
  });

  it('speaks the corrected sentence from HEAR IT', async () => {
    render(<InlineCorrection correction={correction} />);
    await userEvent.click(screen.getByRole('button', { name: /Needs a fix/i }));
    await userEvent.click(screen.getByRole('button', { name: 'HEAR IT' }));
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith('Ich habe Hunger');
  });

  it('renders a quiet cue when the turn was graded with no fix', () => {
    render(<InlineCorrection correction={null} />);
    expect(screen.getByText('No fix this time')).toBeInTheDocument();
    expect(screen.queryByText('Alles gut!')).not.toBeInTheDocument();
    expect(screen.queryByText(/no mistakes/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'HEAR IT' })).not.toBeInTheDocument();
  });
});
