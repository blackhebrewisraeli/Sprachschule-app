import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import VocabSrsWidget from './VocabSrsWidget';
import { srsKey } from '../../lib/srs';
import { activePack } from '../../packs';
import { COLORS, FONT_SIZE, SPACE } from '../../lib/theme';

const { decks } = activePack.content;
const CARD_TOTAL = Object.values(decks).reduce((sum, d) => sum + d.length, 0); // 40
const DAY = 86400000;

const rowFor = (deckId) =>
  screen
    .getAllByTestId('vocab-deck-row')
    .find((row) => row.textContent.toLowerCase().startsWith(deckId));

describe('VocabSrsWidget', () => {
  // The first-launch rule. It used to read DUE NOW 40, in red, with "10 due" on
  // every deck, for a learner who had not answered a single card.
  it('shows a brand-new learner nothing due, and every card as new', () => {
    render(<VocabSrsWidget srs={{}} now={Date.now()} />);
    const dueNow = screen.getByTestId('vocab-due-now');
    expect(dueNow).toHaveTextContent('0');
    expect(dueNow.style.color).toBe(COLORS.ink);
    expect(screen.getByTestId('vocab-new-total')).toHaveTextContent(
      `${CARD_TOTAL} new cards to learn`
    );
    expect(screen.getByText(new RegExp(`MASTERED · 0 OF ${CARD_TOTAL}`))).toBeInTheDocument();
    for (const row of screen.getAllByTestId('vocab-deck-row')) {
      expect(row).toHaveTextContent(/· \d+ new/);
      expect(row).not.toHaveTextContent(/due/);
    }
  });

  it('counts a Box-5 card as mastered, neither due nor new', () => {
    const now = Date.now();
    const srs = {
      [srsKey('greetings', 'Hallo')]: {
        box: 5,
        lastReviewed: now,
        nextDue: now + 30 * DAY,
        reps: 8,
      },
    };
    render(<VocabSrsWidget srs={srs} now={now} />);
    expect(screen.getByText(new RegExp(`MASTERED · 1 OF ${CARD_TOTAL}`))).toBeInTheDocument();
    expect(screen.getByTestId('vocab-due-now')).toHaveTextContent('0');
    expect(screen.getByTestId('vocab-new-total')).toHaveTextContent(
      `${CARD_TOTAL - 1} new cards to learn`
    );
  });

  it('turns DUE NOW red only for reviews that are actually owed', () => {
    const now = Date.now();
    const srs = {
      [srsKey('greetings', 'Hallo')]: { box: 1, lastReviewed: now - 2 * DAY, nextDue: now - DAY },
    };
    render(<VocabSrsWidget srs={srs} now={now} />);
    const dueNow = screen.getByTestId('vocab-due-now');
    expect(dueNow).toHaveTextContent('1');
    expect(dueNow.style.color).toBe(COLORS.red);
    // The deck names both kinds, separately.
    const greetings = rowFor('greetings');
    expect(greetings).toHaveTextContent(/· 1 due/);
    expect(greetings).toHaveTextContent(new RegExp(`· ${decks.greetings.length - 1} new`));
  });

  it('drops the new-cards line once every card has been studied', () => {
    const now = Date.now();
    const srs = {};
    for (const [deckId, deck] of Object.entries(decks)) {
      for (const card of deck) {
        srs[srsKey(deckId, card.id)] = { box: 2, lastReviewed: now, nextDue: now + DAY };
      }
    }
    render(<VocabSrsWidget srs={srs} now={now} />);
    expect(screen.queryByTestId('vocab-new-total')).toBeNull();
    for (const row of screen.getAllByTestId('vocab-deck-row')) {
      expect(row).not.toHaveTextContent(/new|due/);
    }
  });

  it('lets a deck row wrap instead of widening the card at 320px', () => {
    render(<VocabSrsWidget srs={{}} now={Date.now()} />);
    for (const row of screen.getAllByTestId('vocab-deck-row')) {
      expect(row).toHaveStyle({ flexWrap: 'wrap' });
    }
    // ...and a wrapped count stays flush right, in line with the rows above.
    for (const counts of screen.getAllByTestId('vocab-deck-counts')) {
      expect(counts).toHaveStyle({ marginLeft: 'auto' });
    }
  });

  it('uses one compact scale inside the dashboard card', () => {
    render(<VocabSrsWidget srs={{}} now={Date.now()} />);

    expect(screen.getByTestId('vocab-srs-summary')).toHaveStyle({
      paddingBottom: `${SPACE[2]}px`,
      marginBottom: `${SPACE[2]}px`,
      gap: `${SPACE[2]}px`,
    });
    expect(screen.getByTestId('vocab-due-now')).toHaveStyle({
      fontSize: `${FONT_SIZE['3xl']}px`,
    });
    expect(screen.getByTestId('vocab-mastered-track')).toHaveStyle({ height: '6px' });
    for (const track of screen.getAllByTestId('vocab-deck-track')) {
      expect(track).toHaveStyle({ height: '5px' });
    }
  });
});
