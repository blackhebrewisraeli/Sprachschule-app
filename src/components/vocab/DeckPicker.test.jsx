import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import DeckPicker from './DeckPicker';
import { AUTO_DECKS, DECK_GROUPS } from '../../packs/de/autoDecks';

const AUTO_GROUPS = DECK_GROUPS.filter((g) => g !== 'Curated');

const props = {
  deckId: 'greetings',
  onSelect: () => {},
  onStart: () => {},
  customDecks: {},
};

describe('DeckPicker', () => {
  it('renders the curated decks and Travel Basics', () => {
    render(<DeckPicker {...props} />);
    for (const name of ['Greetings', 'Food & Drink', 'Travel 10', 'Numbers', 'Travel Basics 327']) {
      expect(screen.getByRole('button', { name: new RegExp(name) })).toBeInTheDocument();
    }
  });

  it('marks only the selected deck as pressed', () => {
    render(<DeckPicker {...props} deckId="travel" />);
    expect(screen.getByRole('button', { name: /Travel 10/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByRole('button', { name: /Greetings/ })).toHaveAttribute(
      'aria-pressed',
      'false'
    );
  });

  it('hides the custom deck entry until one has been generated', () => {
    const { rerender } = render(<DeckPicker {...props} />);
    expect(screen.queryByRole('button', { name: /Your Deck/ })).not.toBeInTheDocument();

    rerender(
      <DeckPicker
        {...props}
        customDecks={{ custom: { name: 'weather', cards: [{ id: 'a' }, { id: 'b' }] } }}
      />
    );
    const custom = screen.getByRole('button', { name: /Your Deck/ });
    expect(custom).toBeInTheDocument();
    expect(custom).toHaveTextContent('2 cards');
  });

  it('offers the lexicon-derived decks but never the Curated group', () => {
    // Curated is the preset list rendered above; showing it twice would give
    // two controls for the same deck.
    render(<DeckPicker {...props} />);
    const curated = AUTO_DECKS.filter((d) => d.group === 'Curated');
    for (const d of curated) {
      expect(screen.queryByRole('button', { name: new RegExp(d.name) })).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: d.name })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('option', { name: 'Curated' })).not.toBeInTheDocument();
    const other = AUTO_DECKS.find((d) => d.group === AUTO_GROUPS[0]);
    expect(screen.getByRole('option', { name: new RegExp(other.name) })).toBeInTheDocument();
  });

  it('names auto-deck options by the deck only — no emoji in the accessible name', async () => {
    render(<DeckPicker {...props} />);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Group' }), 'Topics');
    const topics = AUTO_DECKS.filter((d) => d.group === 'Topics');
    for (const d of topics) {
      const option = screen.getByRole('option', { name: d.name });
      expect(option).toHaveTextContent(d.name);
      expect(option.textContent).not.toContain(d.icon);
    }
  });

  it('titles groups as clean labels, without a letter box', () => {
    render(<DeckPicker {...props} />);
    expect(screen.getByRole('option', { name: 'Frequency' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Topics' })).toBeInTheDocument();
    // The old SectionLabel painted a standalone letter (F, C, T, …) in a
    // black square. Those letters must not remain as their own nodes.
    for (const letter of ['F', 'C', 'T', 'A', 'P', 'G', 'B']) {
      expect(screen.queryByText(letter, { exact: true })).not.toBeInTheDocument();
    }
  });

  it('constrains the column so chips cannot scatter across a wide viewport', () => {
    const { container } = render(<DeckPicker {...props} />);
    const root = container.firstChild;
    expect(root).toHaveStyle({
      maxWidth: '448px',
      marginLeft: 'auto',
      marginRight: 'auto',
    });
  });

  it('starts the preset the user picked', async () => {
    const onSelect = vi.fn();
    const onStart = vi.fn();
    render(<DeckPicker {...props} onSelect={onSelect} onStart={onStart} />);
    await userEvent.click(screen.getByRole('button', { name: /Numbers/ }));
    expect(onStart).toHaveBeenCalledWith('numbers');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('does not render generate or custom-deck trash — those live on Custom', () => {
    render(
      <DeckPicker {...props} customDecks={{ custom: { name: 'weather', cards: [{ id: 'a' }] } }} />
    );
    expect(screen.queryByRole('button', { name: /GENERATE/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Custom deck topic' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Generate Custom/i)).not.toBeInTheDocument();
  });

  it('carries the source attribution the content licences require', () => {
    render(<DeckPicker {...props} />);
    expect(
      screen.getByText(/Wiktionary \(CC BY-SA\), Tatoeba & Leipzig \(CC BY\)/)
    ).toBeInTheDocument();
  });
});

describe('DeckPicker with a collection', () => {
  const two = {
    'custom-a': { name: 'weather', cards: [{ id: 'a' }, { id: 'b' }] },
    'custom-b': { name: 'food', cards: [{ id: 'c' }] },
  };

  it('renders one row per custom deck, not a single slot', () => {
    render(<DeckPicker {...props} customDecks={two} />);
    expect(screen.getAllByRole('button', { name: /Your Deck/ })).toHaveLength(2);
  });

  it('starts the deck id that was picked, not a literal', () => {
    const onStart = vi.fn();
    render(<DeckPicker {...props} customDecks={two} onStart={onStart} />);
    screen.getAllByRole('button', { name: /Your Deck/ })[1].click();
    expect(onStart).toHaveBeenCalledWith('custom-b');
  });

  it('shows each deck its own card count, singular where it should be', () => {
    render(<DeckPicker {...props} customDecks={two} />);
    expect(screen.getByText('2 cards')).toBeInTheDocument();
    expect(screen.getByText('1 card')).toBeInTheDocument();
    expect(screen.queryByText('1 cards')).toBeNull();
  });

  it('renders exactly what the single-slot version did for ONE deck', () => {
    render(<DeckPicker {...props} customDecks={{ custom: { name: 'x', cards: [{ id: 'a' }] } }} />);
    expect(screen.getAllByRole('button', { name: /Your Deck/ })).toHaveLength(1);
    expect(screen.getByText('1 card')).toBeInTheDocument();
  });
});

describe('DeckPicker names', () => {
  const two = {
    'custom-a': { name: 'weather', cards: [{ id: 'a' }, { id: 'b' }] },
    'custom-b': { name: 'food', cards: [{ id: 'c' }] },
  };

  it('shows each deck by the topic it was made from', () => {
    render(<DeckPicker {...props} customDecks={two} />);
    expect(screen.getByText(/weather/)).toBeInTheDocument();
    expect(screen.getByText(/food/)).toBeInTheDocument();
  });

  it('names the deck for a screen reader, since a sparkle says nothing', () => {
    render(<DeckPicker {...props} customDecks={two} />);
    expect(
      screen.getByRole('button', { name: 'Your Deck: weather — 2 cards' })
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Your Deck: food — 1 card' })).toBeInTheDocument();
  });

  it('falls back to a label when a deck somehow has no name', () => {
    render(<DeckPicker {...props} customDecks={{ x: { name: '', cards: [{ id: 'a' }] } }} />);
    expect(screen.getByText(/unnamed|Your Deck/)).toBeInTheDocument();
  });
});

describe('DeckPicker pluralisation', () => {
  it.each([
    [1, '1 card'],
    [2, '2 cards'],
    [10, '10 cards'],
    [0, '0 cards'],
  ])('renders %i as "%s"', (n, expected) => {
    const cards = Array.from({ length: n }, (_, i) => ({ id: `c${i}` }));
    render(<DeckPicker {...props} customDecks={{ x: { name: 'deck', cards } }} />);
    // getAllBy, not getBy: the four curated rows also read "10 cards", so the
    // n=10 case would collide with them.
    expect(screen.getAllByText(expected).length).toBeGreaterThan(0);
  });

  it('pluralises the preset rows on the same rule', () => {
    render(<DeckPicker {...props} />);
    expect(screen.getAllByText('10 cards').length).toBeGreaterThan(0);
  });
});

describe('DeckPicker auto-deck cascade', () => {
  const groupSelect = () => screen.getByRole('combobox', { name: 'Group' });
  const deckSelect = () => screen.getByRole('combobox', { name: 'Deck' });

  it('exposes labelled group and deck selects for every non-Curated group', () => {
    render(<DeckPicker {...props} />);
    expect(groupSelect()).toBeInTheDocument();
    expect(deckSelect()).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: 'Auto decks' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    for (const group of AUTO_GROUPS) {
      expect(screen.getByRole('option', { name: group })).toBeInTheDocument();
    }
  });

  it('defaults to the first auto group and hides the rest of the decks', () => {
    render(<DeckPicker {...props} />);
    expect(groupSelect()).toHaveValue(AUTO_GROUPS[0]);
    expect(deckSelect()).toHaveValue('');
    for (const d of AUTO_DECKS.filter((deck) => deck.group === AUTO_GROUPS[0])) {
      expect(screen.getByRole('option', { name: new RegExp(d.name) })).toBeInTheDocument();
    }
    const hidden = AUTO_DECKS.find((d) => d.group !== AUTO_GROUPS[0] && d.group !== 'Curated');
    expect(screen.queryByRole('option', { name: hidden.name })).not.toBeInTheDocument();
  });

  it('lists counts on frequency decks when the pack supplies them', () => {
    render(<DeckPicker {...props} />);
    expect(screen.getByRole('option', { name: /Core 100 \(100 cards\)/ })).toHaveValue('core-100');
    expect(screen.getByRole('option', { name: /Top 500 \(500 cards\)/ })).toHaveValue('top-500');
  });

  it('keeps the cascade inside the picker — shrinking tracks, not a chip wall', () => {
    const { container } = render(<DeckPicker {...props} />);
    const cascade = container.querySelector('[data-ui="select"]').parentElement.parentElement;
    expect(cascade).toHaveStyle({
      display: 'grid',
      minWidth: '0',
    });
    expect(cascade.style.gridTemplateColumns).toBe('minmax(0, 1fr) minmax(0, 1fr)');
    expect(groupSelect()).toHaveStyle({ minWidth: '0', maxWidth: '100%' });
    expect(deckSelect()).toHaveStyle({ minWidth: '0', maxWidth: '100%' });
  });

  it('switching groups reveals that group and hides the previous one', async () => {
    const onSelect = vi.fn();
    render(<DeckPicker {...props} onSelect={onSelect} />);
    expect(screen.getByRole('option', { name: /Core 100/ })).toBeInTheDocument();
    await userEvent.selectOptions(groupSelect(), 'Topics');
    expect(groupSelect()).toHaveValue('Topics');
    expect(screen.queryByRole('option', { name: /Core 100/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Lifestyle' })).toBeInTheDocument();
    expect(onSelect).not.toHaveBeenCalled();
  });

  // A closed <select> changes on a single arrow press under Windows or Firefox,
  // so a change only selects. Starting is the explicit button (WCAG 3.2.2).
  it('selects the auto deck the user picked without starting it', async () => {
    const onSelect = vi.fn();
    const onStart = vi.fn();
    render(<DeckPicker {...props} onSelect={onSelect} onStart={onStart} />);
    await userEvent.selectOptions(groupSelect(), 'Topics');
    await userEvent.selectOptions(deckSelect(), 'tag-lifestyle');
    expect(onSelect).toHaveBeenCalledWith('tag-lifestyle');
    expect(onStart).not.toHaveBeenCalled();
  });

  it('starts the selected auto deck from Start practice', async () => {
    const onStart = vi.fn();
    render(<DeckPicker {...props} deckId="tag-lifestyle" onStart={onStart} />);
    await userEvent.click(screen.getByRole('button', { name: 'Start practice' }));
    expect(onStart).toHaveBeenCalledWith('tag-lifestyle');
  });

  it('keeps Start practice disabled until the open group has a deck selected', () => {
    render(<DeckPicker {...props} />);
    expect(deckSelect()).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Start practice' })).toBeDisabled();
  });

  it('opens the group that contains the current auto deck', () => {
    render(<DeckPicker {...props} deckId="tag-lifestyle" />);
    expect(groupSelect()).toHaveValue('Topics');
    expect(deckSelect()).toHaveValue('tag-lifestyle');
    expect(screen.queryByRole('option', { name: /Core 100/ })).not.toBeInTheDocument();
  });

  it('follows deckId onto a new auto group, but not back onto a preset', () => {
    const { rerender } = render(<DeckPicker {...props} />);
    expect(groupSelect()).toHaveValue('Frequency');
    rerender(<DeckPicker {...props} deckId="artikel-a1" />);
    expect(groupSelect()).toHaveValue('Artikel');
    expect(deckSelect()).toHaveValue('artikel-a1');
    expect(screen.getByRole('option', { name: /A1 Nouns/ })).toBeInTheDocument();

    rerender(<DeckPicker {...props} deckId="greetings" />);
    expect(groupSelect()).toHaveValue('Artikel');
    expect(deckSelect()).toHaveValue('');
  });

  it('is two labelled tab stops, not a roving tablist', async () => {
    render(<DeckPicker {...props} />);
    expect(groupSelect()).toHaveAccessibleName('Group');
    expect(deckSelect()).toHaveAccessibleName('Deck');
    groupSelect().focus();
    expect(groupSelect()).toHaveFocus();
    await userEvent.tab();
    expect(deckSelect()).toHaveFocus();
  });
});

describe('DeckPicker — classified CEFR gates auto decks', () => {
  const groupSelect = () => screen.getByRole('combobox', { name: 'Group' });
  const deckSelect = () => screen.getByRole('combobox', { name: 'Deck' });

  it('hides B1 CEFR decks from an A1 learner', async () => {
    render(<DeckPicker {...props} level="a1" />);
    await userEvent.selectOptions(groupSelect(), 'CEFR');
    expect(screen.getByRole('option', { name: 'A1' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'B1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'A2' })).not.toBeInTheDocument();
  });

  it('lets a B1 learner open the B1 CEFR deck', async () => {
    render(<DeckPicker {...props} level="b1" />);
    await userEvent.selectOptions(groupSelect(), 'CEFR');
    expect(screen.getByRole('option', { name: 'B1' })).toHaveValue('cefr-b1');
    await userEvent.selectOptions(deckSelect(), 'cefr-b1');
  });
});

describe('DeckPicker — interest decks', () => {
  const groupSelect = () => screen.getByRole('combobox', { name: 'Group' });
  const deckSelect = () => screen.getByRole('combobox', { name: 'Deck' });
  const sport = [{ id: 'interest-sport', name: 'Sport', count: 10 }];

  it('hides the Interests group until a topic is enabled', () => {
    render(<DeckPicker {...props} />);
    expect(screen.queryByRole('option', { name: 'Interests' })).not.toBeInTheDocument();
  });

  it('lists enabled interest decks under Interests and reports the pick', async () => {
    const onSelect = vi.fn();
    render(<DeckPicker {...props} onSelect={onSelect} interestDecks={sport} />);
    expect(screen.getByRole('option', { name: 'Interests' })).toBeInTheDocument();
    await userEvent.selectOptions(groupSelect(), 'Interests');
    expect(screen.getByRole('option', { name: /Sport \(10 cards\)/ })).toHaveValue(
      'interest-sport'
    );
    await userEvent.selectOptions(deckSelect(), 'interest-sport');
    expect(onSelect).toHaveBeenCalledWith('interest-sport');
  });

  it('opens Interests when the current deck is an enabled topic deck', () => {
    render(<DeckPicker {...props} deckId="interest-sport" interestDecks={sport} />);
    expect(groupSelect()).toHaveValue('Interests');
    expect(deckSelect()).toHaveValue('interest-sport');
  });

  it('still offers unleveled interest decks to an A1 learner', async () => {
    render(<DeckPicker {...props} level="a1" interestDecks={sport} />);
    await userEvent.selectOptions(groupSelect(), 'Interests');
    expect(screen.getByRole('option', { name: /Sport/ })).toHaveValue('interest-sport');
  });
});
