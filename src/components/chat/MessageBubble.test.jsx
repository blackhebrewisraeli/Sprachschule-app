import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MessageBubble from './MessageBubble';
import { canSpeak, speak } from '../../lib/speech';

vi.mock('../../lib/speech', () => ({
  speak: vi.fn(),
  canSpeak: vi.fn(),
}));

const annaMsg = {
  role: 'assistant',
  de: 'Guten Tag!',
  en: 'Good day!',
  ipa: '[ˈɡuːtn̩ taːk]',
};

const userMsg = { role: 'user', de: 'Hallo Anna' };

describe('MessageBubble', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canSpeak).mockReturnValue(true);
  });

  it('drops the audio button where nothing can speak', () => {
    vi.mocked(canSpeak).mockReturnValue(false);
    render(<MessageBubble msg={annaMsg} />);
    expect(screen.getByText('Guten Tag!')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Play Anna response audio' })
    ).not.toBeInTheDocument();
  });

  it('renders an Anna message with name tag and audio button, EN/IPA collapsed', () => {
    render(<MessageBubble msg={annaMsg} />);
    expect(screen.getByText('— ANNA')).toBeInTheDocument();
    expect(screen.getByText('Guten Tag!')).toBeInTheDocument();
    expect(screen.queryByText('Good day!')).not.toBeInTheDocument();
    expect(screen.queryByText('[ˈɡuːtn̩ taːk]')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'IPA' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('button', { name: 'Play Anna response audio' })).toBeInTheDocument();
  });

  it('labels the bubble and its audio with the given speaker', () => {
    render(<MessageBubble msg={annaMsg} speaker="Barista" />);
    expect(screen.getByText('— BARISTA')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Play Barista response audio' })).toBeInTheDocument();
  });

  it('reveals the translation and IPA from their toggles', async () => {
    render(<MessageBubble msg={annaMsg} />);
    await userEvent.click(screen.getByRole('button', { name: 'EN' }));
    expect(screen.getByText('Good day!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'IPA' }));
    expect(screen.getByText('[ˈɡuːtn̩ taːk]')).toBeInTheDocument();
  });

  it('renders a user message with the DU tag and no audio button', () => {
    render(<MessageBubble msg={userMsg} />);
    expect(screen.getByText('DU')).toBeInTheDocument();
    expect(screen.getByText('Hallo Anna')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Play Anna response audio' })
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'EN' })).not.toBeInTheDocument();
  });

  it('omits EN and IPA controls when those fields are missing', () => {
    render(<MessageBubble msg={{ role: 'assistant', de: 'Tschüss!' }} />);
    expect(screen.getByText('Tschüss!')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'EN' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'IPA' })).not.toBeInTheDocument();
  });

  it('speaks the German text from the audio button', async () => {
    render(<MessageBubble msg={annaMsg} />);
    await userEvent.click(screen.getByRole('button', { name: 'Play Anna response audio' }));
    expect(speak).toHaveBeenCalledWith('Guten Tag!');
  });

  it('attaches an inline correction to a graded learner turn', () => {
    render(
      <MessageBubble
        msg={{
          role: 'user',
          de: 'Ich habe hunger',
          graded: true,
          correction: {
            original: 'Ich habe hunger',
            fixed: 'Ich habe Hunger',
            explain: 'Nouns are capitalized.',
          },
        }}
      />
    );
    expect(screen.getByRole('button', { name: /Needs a fix/i })).toBeInTheDocument();
  });

  it('does not invent a correction cue on an ungraded learner turn', () => {
    render(<MessageBubble msg={userMsg} />);
    expect(screen.queryByText('No fix this time')).not.toBeInTheDocument();
    expect(screen.queryByText('Alles gut!')).not.toBeInTheDocument();
  });
});
