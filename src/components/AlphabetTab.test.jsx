import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AlphabetTab from './AlphabetTab';
import { speak } from '../lib/speech';
import { activePack } from '../packs';

vi.mock('../lib/speech', () => ({ speak: vi.fn() }));

const { alphabet: ALPHABET, alphabetQuiz: QUIZ_GROUPS } = activePack.content;
const firstGroup = QUIZ_GROUPS[0];

describe('AlphabetTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  // Same axis as Vocab and Translate: the title and the mode switch sit on the
  // page's centre line instead of hugging its left edge on a wide screen.
  it('centres the section title and the mode switch, like the other practice tabs', () => {
    render(<AlphabetTab level="a1" />);
    const hero = screen.getByRole('heading', { level: 1, name: 'Das Alphabet' }).parentElement;
    expect(hero).toHaveStyle({ textAlign: 'center', display: 'flex', alignItems: 'center' });
    const toggle = screen.getByRole('button', { name: '🎧 Quiz' }).parentElement;
    expect(toggle).toHaveStyle({ width: 'fit-content', marginLeft: 'auto', marginRight: 'auto' });
  });

  describe('quiz mode (default)', () => {
    it('starts in quiz mode with a replay button and the first group options', () => {
      render(<AlphabetTab level="a1" />);
      expect(screen.getByRole('button', { name: '🎧 Quiz' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      expect(screen.getByRole('button', { name: 'Play the letter' })).toBeInTheDocument();
      for (const letter of firstGroup.letters) {
        expect(screen.getByRole('button', { name: `Select letter ${letter}` })).toBeInTheDocument();
      }
    });

    // The quiz opened by speaking the target 300ms after mount, and switching
    // back from Browse spoke it again. Both are gone: audio that starts by
    // itself talks over a screen reader reading the round, and it fires on a
    // shared or public device before the learner can decline.
    it('stays silent until the learner presses play', () => {
      render(<AlphabetTab level="a1" />);
      expect(speak).not.toHaveBeenCalled();
    });

    it('does not speak when the round advances', async () => {
      render(<AlphabetTab level="a1" />);
      await userEvent.click(
        screen.getByRole('button', { name: `Select letter ${firstGroup.letters[0]}` })
      );
      await userEvent.click(screen.getByRole('button', { name: 'NEXT ROUND →' }));
      expect(speak).not.toHaveBeenCalled();
    });

    it('does not speak when returning from browse mode', async () => {
      render(<AlphabetTab level="a1" />);
      await userEvent.click(screen.getByRole('button', { name: '📋 Browse' }));
      speak.mockClear(); // a browse letter tap is a press, and may legitimately speak
      await userEvent.click(screen.getByRole('button', { name: '🎧 Quiz' }));
      expect(speak).not.toHaveBeenCalled();
    });

    it('plays the target letter on demand', async () => {
      render(<AlphabetTab level="a1" />);
      await userEvent.click(screen.getByRole('button', { name: 'Play the letter' }));
      expect(speak).toHaveBeenCalled();
      const [spoken] = speak.mock.calls.at(-1);
      expect(firstGroup.letters).toContain(spoken);
    });

    // "TAP TO HEAR AGAIN" on a round that has played nothing asks the learner
    // to repeat something they never heard.
    it('asks for a first listen, then offers a replay', async () => {
      render(<AlphabetTab level="a1" />);
      expect(screen.getByText('TAP TO HEAR THE LETTER')).toBeInTheDocument();

      await userEvent.click(screen.getByRole('button', { name: 'Play the letter' }));
      expect(screen.getByText('TAP TO HEAR AGAIN')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Play the letter again' })).toBeInTheDocument();
    });

    // Each round is its own first listen — the replay wording must not leak
    // across a round boundary the way a plain boolean would.
    it('resets to a first listen on the next round', async () => {
      render(<AlphabetTab level="a1" />);
      await userEvent.click(screen.getByRole('button', { name: 'Play the letter' }));
      await userEvent.click(
        screen.getByRole('button', { name: `Select letter ${firstGroup.letters[0]}` })
      );
      await userEvent.click(screen.getByRole('button', { name: 'NEXT ROUND →' }));
      expect(screen.getByText('TAP TO HEAR THE LETTER')).toBeInTheDocument();
    });

    it('grades a guess and offers the next round', async () => {
      render(<AlphabetTab level="a1" />);
      // The target is random within the group; answering with every letter of
      // the group one at a time is blocked after the first answer, so grab the
      // verdict from whichever letter we pick.
      await userEvent.click(
        screen.getByRole('button', { name: `Select letter ${firstGroup.letters[0]}` })
      );
      expect(screen.getByText(/✓|✗/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'NEXT ROUND →' })).toBeInTheDocument();
      // Options are hidden once answered
      expect(
        screen.queryByRole('button', { name: `Select letter ${firstGroup.letters[1]}` })
      ).not.toBeInTheDocument();
    });
  });

  describe('browse mode', () => {
    it('shows the full letter grid when toggled', async () => {
      render(<AlphabetTab level="a1" />);
      await userEvent.click(screen.getByRole('button', { name: '📋 Browse' }));
      expect(screen.getByRole('button', { name: '📋 Browse' })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      for (const letter of ALPHABET.slice(0, 3)) {
        expect(
          screen.getByRole('button', { name: `Select letter ${letter.l} for details` })
        ).toBeInTheDocument();
      }
    });

    it('speaks and shows the detail card when a letter is tapped', async () => {
      render(<AlphabetTab level="a1" />);
      await userEvent.click(screen.getByRole('button', { name: '📋 Browse' }));
      const first = ALPHABET[0];
      await userEvent.click(
        screen.getByRole('button', { name: `Select letter ${first.l} for details` })
      );
      expect(speak).toHaveBeenCalledWith(`${first.l}. ${first.w}`);
      expect(screen.getByText('EXAMPLE WORD')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: `Play pronunciation for ${first.w}` })
      ).toBeInTheDocument();
    });

    it('opts the detail-card play control into the dark-plane focus ring', async () => {
      render(<AlphabetTab level="a1" />);
      await userEvent.click(screen.getByRole('button', { name: '📋 Browse' }));
      const first = ALPHABET[0];
      await userEvent.click(
        screen.getByRole('button', { name: `Select letter ${first.l} for details` })
      );
      const play = screen.getByRole('button', { name: `Play pronunciation for ${first.w}` });
      expect(play).toHaveAttribute('data-ui', 'button');
      expect(play).toHaveAttribute('data-focus-on-dark');
    });
  });
});
