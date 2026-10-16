import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VocabTab from './VocabTab';
import TranslateTab from './TranslateTab';
import { activePack } from '../packs';
import { setUserLevel } from '../lib/levelPref';

const submitFeedback = vi.hoisted(() => vi.fn());
vi.mock('../lib/feedback', async (importOriginal) => ({
  ...(await importOriginal()),
  submitFeedback,
}));
vi.mock('../lib/claude', () => ({ callClaude: vi.fn() }));
vi.mock('../lib/speech', () => ({ speak: vi.fn() }));

const DECKS = activePack.content.decks;
const BANKS = activePack.content.translateSentences;

// Fills in and sends a report, returning the payload the transport received.
const report = async (user, text = 'this looks wrong') => {
  await user.click(screen.getByRole('button', { name: /report an issue/i }));
  const dialog = screen.getByRole('dialog', { name: /report an issue/i });
  await user.type(within(dialog).getByRole('textbox'), text);
  await user.click(within(dialog).getByRole('button', { name: /^send/i }));
  return submitFeedback.mock.calls[0][0];
};

describe('reporting an issue from inside an exercise', () => {
  beforeEach(() => {
    localStorage.clear();
    submitFeedback.mockReset();
    submitFeedback.mockResolvedValue({ ok: true, row: {} });
  });

  describe('Vocab', () => {
    const renderTab = (props = {}) =>
      render(
        <VocabTab level="a1" learnedWords={{}} markLearned={() => {}} mobile={false} {...props} />
      );
    // Vocab opens on its deck library; the report control lives on the card.
    const renderSession = async (props = {}) => {
      renderTab(props);
      await userEvent.click(screen.getByRole('button', { name: /Greetings/ }));
    };

    // jsdom has no scrolling; each Vocab screen change asks to start at the top.
    beforeEach(() => {
      vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    });
    afterEach(() => {
      window.scrollTo.mockRestore();
    });

    it('offers a report control alongside the card', async () => {
      await renderSession();
      expect(screen.getByRole('button', { name: /report an issue/i })).toBeInTheDocument();
    });

    it('captures the card, the deck and the level the learner was on', async () => {
      const user = userEvent.setup();
      setUserLevel('a2');
      await renderSession({ level: 'a2' });
      // Empty SRS ⇒ the queue is the deck in order, so the first card is fixed.
      const card = DECKS.greetings[0];

      const payload = await report(user, 'the gloss is wrong');
      expect(payload).toMatchObject({
        surface: 'vocab',
        level: 'a2',
        deckId: 'greetings',
        itemId: card.id,
        itemLabel: card.de,
        message: 'the gloss is wrong',
      });
    });

    it('reports the card actually on screen after the deck changes', async () => {
      const user = userEvent.setup();
      renderTab();
      await user.click(screen.getByRole('button', { name: /food/i }));

      const payload = await report(user);
      expect(payload.deckId).toBe('food');
      expect(payload.itemId).toBe(DECKS.food[0].id);
    });

    // Without this, every Vocab assertion above is satisfied by a component
    // that reports `activeDeck[0]` forever: with an empty SRS the queue starts
    // in deck order, so the live card and the deck's first card are the same
    // object on card one. Advancing makes them different.
    it('reports the card on screen after the learner has moved past the first', async () => {
      const user = userEvent.setup();
      await renderSession();
      const first = DECKS.greetings[0];
      const second = DECKS.greetings[1];

      const choices = () =>
        screen
          .getAllByRole('button')
          .filter((b) => DECKS.greetings.some((c) => c.en === b.textContent));
      await user.click(choices().find((b) => b.textContent === first.en));
      await user.click(screen.getByRole('button', { name: 'GOOD' }));
      expect(screen.getByText(second.de)).toBeInTheDocument();

      const payload = await report(user);
      expect(payload.itemId).toBe(second.id);
      expect(payload.itemId).not.toBe(first.id);
      expect(payload.itemLabel).toBe(second.de);
    });

    // jsdom computes no layout, so this pins the structural property that the
    // browser measurement proved, not the pixels: the progress row must be able
    // to wrap, and the report button must not sit in the dot cluster. Removing
    // either put the Vocab tab 125px past a 320px viewport. See the comment
    // above this row in VocabTab.jsx for the measurements.
    it('keeps the report button out of the deck-progress cluster, in a row that can wrap', async () => {
      await renderSession();
      const button = screen.getByRole('button', { name: /report an issue/i });
      const dots = screen.getAllByTestId('deck-progress-dot');
      const strip = dots[0].parentElement;

      expect(button.parentElement).not.toBe(strip);
      expect(strip.contains(button)).toBe(false);

      const row = strip.parentElement;
      expect(row.contains(button)).toBe(true); // same row, different group
      expect(row.style.flexWrap).toBe('wrap');
    });

    it('never puts the German word on screen while reporting it', async () => {
      // The word is concealed by CardFace for the drill decks — the report
      // dialog must not be the back door to it.
      const user = userEvent.setup();
      await renderSession();
      await user.click(screen.getByRole('button', { name: /report an issue/i }));
      const dialog = screen.getByRole('dialog', { name: /report an issue/i });
      expect(dialog.textContent).not.toMatch(new RegExp(DECKS.greetings[0].de, 'i'));
    });
  });

  describe('Translate', () => {
    it('offers a report control alongside the exercise', () => {
      render(<TranslateTab key="a1" level="a1" />);
      expect(screen.getByRole('button', { name: /report an issue/i })).toBeInTheDocument();
    });

    it('captures the sentence and the level the learner was on', async () => {
      const user = userEvent.setup();
      setUserLevel('b1');
      render(<TranslateTab key="b1" level="b1" />);

      const payload = await report(user, 'my translation was also correct');
      expect(payload).toMatchObject({
        surface: 'translate',
        level: 'b1',
        message: 'my translation was also correct',
      });
      // The bank is shuffled, so assert membership rather than a fixed row.
      const prompts = BANKS.B1.map((e) => e.en);
      expect(prompts).toContain(payload.itemId);
    });

    it('sends the expected German answer for triage without showing it', async () => {
      const user = userEvent.setup();
      setUserLevel('b1');
      render(<TranslateTab key="b1" level="b1" />);

      await user.click(screen.getByRole('button', { name: /report an issue/i }));
      const dialog = screen.getByRole('dialog', { name: /report an issue/i });
      await user.type(within(dialog).getByRole('textbox'), 'x');
      await user.click(within(dialog).getByRole('button', { name: /^send/i }));

      const payload = submitFeedback.mock.calls[0][0];
      const row = BANKS.B1.find((e) => e.en === payload.itemId);
      // B1 is free typing: `de` is precisely what the learner is being asked
      // to produce. It travels in the payload and appears nowhere on screen.
      expect(payload.itemLabel).toBe(row.de);
      expect(dialog.textContent).not.toMatch(new RegExp(row.de, 'i'));
    });
  });
});
