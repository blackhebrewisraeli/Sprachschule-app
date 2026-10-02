import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { useState } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VocabTab from './VocabTab';
import { upsertDeck, deleteDeck, liveDecks } from '../lib/customDecks.js';
import { markLearnedIn } from '../lib/learnedWords.js';
import { activePack } from '../packs';
import { callClaude, QuotaExhaustedError } from '../lib/claude';
import { speak } from '../lib/speech';
import { srsKey } from '../lib/srs';
import indexJson from '../packs/__fixtures__/lexicon/index.json';
import chunk0 from '../packs/__fixtures__/lexicon/chunk-00.json';
import chunk1 from '../packs/__fixtures__/lexicon/chunk-01.json';
import { __resetCache } from '../packs/lexiconStore';
import { setUserLevel } from '../lib/levelPref';

vi.mock('../lib/claude', async (importActual) => ({
  ...(await importActual()),
  callClaude: vi.fn(),
}));

// jsdom has no speechSynthesis; speak() guards for that and is a no-op there.
// Mocking it makes the listening drill's audio observable instead of silent.
vi.mock('../lib/speech', () => ({ speak: vi.fn() }));

const DECKS = activePack.content.decks;
const STORAGE_KEY = 'deutsch-app-state-v1';

// VocabTab starts on the 'greetings' deck; with empty SRS state the queue is
// all-new cards in deck order, so the first card is deterministic.
const firstCard = (deckId = 'greetings') => DECKS[deckId][0];

// Auto decks are a group → deck cascade of native selects on Practice.
const autoGroupSelect = () => screen.getByRole('combobox', { name: 'Group' });
const autoDeckSelect = () => screen.getByRole('combobox', { name: 'Deck' });

async function pickAutoDeck(user, group, deckName) {
  await user.selectOptions(autoGroupSelect(), group);
  const option = within(autoDeckSelect()).getByRole('option', { name: deckName });
  await user.selectOptions(autoDeckSelect(), option);
}

const readSrs = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').srs ?? {};

// VocabTab no longer owns the generated deck — App does, because this component
// unmounts on every tab switch. This host plays that part using the REAL
// customDecks helpers, so the generation tests exercise the shipping contract
// rather than a stub that happens to agree with it.
function DeckHost({ children: _children, ...props }) {
  const [decks, setDecks] = useState({});
  return (
    <VocabTab
      level="a1"
      learnedWords={{}}
      markLearned={() => {}}
      mobile={false}
      customDecks={liveDecks(decks)}
      // Honours the deckId VocabTab supplies, exactly as App does. Pinning it
      // to a literal here would store the deck under one id while VocabTab
      // selected another — the host disagreeing with production, which is how
      // the markLearned toggle stayed hidden for so long.
      onDeckGenerated={({ deckId, name, cards }) =>
        setDecks((prev) => upsertDeck(prev, { deckId, name, cards }))
      }
      onDeckDeleted={(deckId) => setDecks((prev) => deleteDeck(prev, deckId))}
      {...props}
    />
  );
}

const renderTab = (props = {}) => render(<DeckHost {...props} />);

// Simulates the App parent so the "✓ LEARNED" badge can appear after a correct
// answer. It runs the REAL markLearnedIn and writes BOTH maps exactly as App
// does — scoped record plus the legacy flat mirror.
//
// Deliberately not a simplification. The previous version modelled the intended
// behaviour (`{...prev, [id]: true}`) while App actually toggled, so it agreed
// with production in the safe direction and hid the un-learning bug fixed in
// #203 from every test in this file.
function StatefulHost({ level = 'a1' }) {
  const [byDeck, setByDeck] = useState({});
  const [flat, setFlat] = useState({});
  return (
    <VocabTab
      level={level}
      learnedWords={flat}
      learnedByDeck={byDeck}
      markLearned={(deckId, id) => {
        setByDeck((prev) => markLearnedIn(prev, deckId, id));
        setFlat((prev) => (prev[id] ? prev : { ...prev, [id]: true }));
      }}
      mobile={false}
    />
  );
}

// The 4 multiple-choice tiles are the buttons whose label is an `en` value
// from the active deck (deck-picker buttons show deck names instead).
const choiceButtons = (deckId = 'greetings') => {
  const ens = DECKS[deckId].map((c) => c.en);
  return screen.getAllByRole('button').filter((b) => ens.includes(b.textContent));
};

// Every suite that resolves an auto deck needs the same lexicon served from
// fixtures. Repeating this five times was 13.2% duplication on new code and
// failed the SonarCloud gate on #107 — the finding was correct, so it is
// extracted rather than waved through.
const LEXICON_FIXTURES = {
  '/lexicon/de/index.json': indexJson,
  '/lexicon/de/chunk-00.json': chunk0,
  '/lexicon/de/chunk-01.json': chunk1,
};

const mockLexiconFetch = () => {
  __resetCache();
  globalThis.fetch = vi.fn((url) => {
    const key = Object.keys(LEXICON_FIXTURES).find((k) => String(url).endsWith(k));
    return key
      ? Promise.resolve({ ok: true, json: () => Promise.resolve(LEXICON_FIXTURES[key]) })
      : Promise.resolve({ ok: false, status: 404 });
  });
};

describe('VocabTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows completion after the last card, restarts practice, and clears completion on deck change', async () => {
    const user = userEvent.setup();
    const cards = [{ id: 'sun', de: 'die Sonne', en: 'sun', ipa: '' }];
    renderTab({
      customDecks: { 'custom-finish': { deckId: 'custom-finish', name: 'Finish', cards } },
      learnedByDeck: { 'custom-finish': { sun: true } },
    });
    await user.click(screen.getByRole('button', { name: 'Your Deck: Finish — 1 card' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Type the English meaning' }),
      'sun{Enter}'
    );
    await user.click(screen.getByRole('button', { name: 'GOOD' }));

    expect(screen.getByText('Deck complete — 1 word learned')).toBeInTheDocument();
    expect(screen.queryByText('Select a deck to start.')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Type the English meaning' })
    ).not.toBeInTheDocument();
    const savedSrs = readSrs();
    expect(savedSrs[srsKey('custom-finish', 'sun')].reps).toBe(1);

    await user.click(screen.getByRole('button', { name: 'PRACTICE AGAIN' }));
    expect(screen.queryByText(/Deck complete/)).not.toBeInTheDocument();
    expect(screen.getByText('1 card remaining')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Type the English meaning' })).toHaveValue('');
    expect(readSrs()).toEqual(savedSrs);

    // The previous verdict's double-click guard expires before another answer.
    await new Promise((resolve) => setTimeout(resolve, 210));
    await user.type(
      screen.getByRole('textbox', { name: 'Type the English meaning' }),
      'sun{Enter}'
    );
    await user.click(screen.getByRole('button', { name: 'GOOD' }));
    expect(screen.getByText(/Deck complete/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Greetings/ }));
    expect(screen.queryByText(/Deck complete/)).not.toBeInTheDocument();
    expect(screen.getByText(firstCard().de)).toBeInTheDocument();
  });

  describe('deck picker', () => {
    it('renders the four preset decks and the first greetings card', () => {
      renderTab();
      for (const name of ['Greetings', 'Food & Drink', 'Travel 10', 'Numbers']) {
        expect(screen.getByRole('button', { name: new RegExp(name) })).toBeInTheDocument();
      }
      expect(screen.getByText(firstCard().de)).toBeInTheDocument();
      expect(screen.getByText(`${DECKS.greetings.length} cards remaining`)).toBeInTheDocument();
    });

    it('opens the named deck from a reviewTarget that has a deck and no card', () => {
      const onReviewConsumed = vi.fn();
      renderTab({
        reviewTarget: { tab: 'vocab', context: 'food' },
        onReviewConsumed,
      });
      expect(screen.getByRole('button', { name: /Food & Drink/i })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      expect(screen.getByRole('button', { name: /Greetings/i })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
      expect(screen.getByText(firstCard('food').de)).toBeInTheDocument();
      expect(screen.queryByText(firstCard('greetings').de)).not.toBeInTheDocument();
    });

    it('centers the section title and the remaining-count row', () => {
      renderTab();
      const hero = screen.getByRole('heading', { level: 1, name: 'Wortschatz' }).parentElement;
      expect(hero).toHaveStyle({
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
      });
      const remaining = screen.getByText(`${DECKS.greetings.length} cards remaining`);
      expect(remaining.parentElement.parentElement).toHaveStyle({
        justifyContent: 'center',
        flexWrap: 'wrap',
      });
    });

    it('stretches the card column so a headword cannot collapse to one glyph', () => {
      // alignItems:center on this column shrinks it to min-content. Combined
      // with overflowWrap:anywhere that is a single letter, and Hallo stacks
      // vertically inside a ~116px card. Stretch keeps the track full-width.
      renderTab();
      const remaining = screen.getByText(`${DECKS.greetings.length} cards remaining`);
      let column = remaining.parentElement;
      while (column && column.style.textAlign !== 'center') {
        column = column.parentElement;
      }
      expect(column).toHaveStyle({
        alignItems: 'stretch',
        textAlign: 'center',
      });
    });

    it('switching decks resets the queue to the new deck', async () => {
      renderTab();
      await userEvent.click(screen.getByRole('button', { name: /Travel 10/ }));
      expect(screen.getByText(firstCard('travel').de)).toBeInTheDocument();
      expect(screen.getByText(`${DECKS.travel.length} cards remaining`)).toBeInTheDocument();
    });

    it('marks only the selected deck as pressed', async () => {
      renderTab();
      expect(screen.getByRole('button', { name: /Greetings/ })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      await userEvent.click(screen.getByRole('button', { name: /Travel 10/ }));
      expect(screen.getByRole('button', { name: /Travel 10/ })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      expect(screen.getByRole('button', { name: /Greetings/ })).toHaveAttribute(
        'aria-pressed',
        'false'
      );
    });

    it('does not offer a custom deck button before one is generated', () => {
      renderTab();
      expect(screen.queryByRole('button', { name: /Your Deck/ })).not.toBeInTheDocument();
    });
  });

  describe('mobile hero density', () => {
    const visuallyHiddenStyle = {
      position: 'absolute',
      width: '1px',
      height: '1px',
    };

    const findHeroWrapper = () => {
      const heading = screen.getByRole('heading', { level: 1, name: 'Wortschatz' });
      let node = heading.parentElement;
      while (node && node !== document.body) {
        if (node.style?.position === 'absolute') return node;
        node = node.parentElement;
      }
      return heading.parentElement;
    };

    it('keeps the Wortschatz heading in the accessibility tree on mobile', () => {
      renderTab({ mobile: true });
      expect(screen.getByRole('heading', { level: 1, name: 'Wortschatz' })).toBeInTheDocument();
      expect(screen.getByText('Section 04')).toBeInTheDocument();
      expect(
        screen.getByText('Flip, listen, learn. Pick a preset or generate a deck on any topic.')
      ).toBeInTheDocument();
    });

    it('visually hides the Hero wrapper on mobile without deleting it', () => {
      renderTab({ mobile: true });
      expect(findHeroWrapper()).toHaveStyle(visuallyHiddenStyle);
    });

    it('leaves the centered Hero visible on desktop', () => {
      renderTab({ mobile: false });
      const hero = screen.getByRole('heading', { level: 1, name: 'Wortschatz' }).parentElement;
      expect(hero).toHaveStyle({
        textAlign: 'center',
        display: 'flex',
        alignItems: 'center',
      });
      expect(findHeroWrapper()).not.toHaveStyle(visuallyHiddenStyle);
    });
  });

  describe('multiple-choice flow (a1)', () => {
    it('correct choice shows feedback, marks learned, and surfaces the badge', async () => {
      render(<StatefulHost />);
      const card = firstCard();
      const correct = choiceButtons().find((b) => b.textContent === card.en);
      await userEvent.click(correct);
      expect(screen.getByText('✓ CORRECT')).toBeInTheDocument();
      expect(screen.getByText('✓ LEARNED')).toBeInTheDocument();
    });

    it('wrong choice shows NOT QUITE and no learned badge', async () => {
      render(<StatefulHost />);
      const card = firstCard();
      const wrong = choiceButtons().find((b) => b.textContent !== card.en);
      await userEvent.click(wrong);
      expect(screen.getByText('✗ NOT QUITE')).toBeInTheDocument();
      expect(screen.queryByText('✓ LEARNED')).not.toBeInTheDocument();
      // wrong answers offer only the AGAIN verdict
      expect(screen.getByRole('button', { name: /AGAIN/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'GOOD' })).not.toBeInTheDocument();
    });
  });

  describe('SRS verdict buttons', () => {
    it('GOOD after a correct answer writes box 2 to storage and advances the queue', async () => {
      const markLearned = vi.fn();
      renderTab({ markLearned });
      const card = firstCard();
      await userEvent.click(choiceButtons().find((b) => b.textContent === card.en));
      // The deck is the point of the epic: mastery is recorded WHERE it happened.
      expect(markLearned).toHaveBeenCalledWith('greetings', card.id);

      await userEvent.click(screen.getByRole('button', { name: 'GOOD' }));
      const entry = readSrs()[srsKey('greetings', card.id)];
      expect(entry).toMatchObject({ box: 2, reps: 1 });
      expect(entry.nextDue).toBeGreaterThan(entry.lastReviewed);
      // queue advanced: one fewer remaining, next card on screen
      expect(screen.getByText(`${DECKS.greetings.length - 1} cards remaining`)).toBeInTheDocument();
      expect(screen.getByText(DECKS.greetings[1].de)).toBeInTheDocument();
    });

    it('AGAIN after a wrong answer writes box 1 and re-queues the card', async () => {
      renderTab();
      const card = firstCard();
      await userEvent.click(choiceButtons().find((b) => b.textContent !== card.en));
      await userEvent.click(screen.getByRole('button', { name: /AGAIN/ }));

      expect(readSrs()[srsKey('greetings', card.id)]).toMatchObject({ box: 1, reps: 1 });
      // failed card goes to the back of the queue — count unchanged
      expect(screen.getByText(`${DECKS.greetings.length} cards remaining`)).toBeInTheDocument();
      expect(screen.getByText(DECKS.greetings[1].de)).toBeInTheDocument();
    });

    it('HARD and EASY verdicts map to their Leitner boxes', async () => {
      renderTab();
      const card = firstCard();
      await userEvent.click(choiceButtons().find((b) => b.textContent === card.en));
      await userEvent.click(screen.getByRole('button', { name: 'EASY' }));
      // easy from box 1 advances two boxes
      expect(readSrs()[srsKey('greetings', card.id)]).toMatchObject({ box: 3, reps: 1 });
    });
  });

  describe('typed answer flow (b1)', () => {
    beforeEach(() => setUserLevel('b1'));

    it('disables CHECK while empty and grades a correct typed answer', async () => {
      render(<StatefulHost level="b1" />);
      const card = firstCard();
      const input = screen.getByRole('textbox', { name: 'Type the English meaning' });
      const check = screen.getByRole('button', { name: /CHECK/ });
      expect(check).toBeDisabled();

      await userEvent.type(input, card.en);
      await userEvent.click(check);
      expect(screen.getByText('✓ CORRECT')).toBeInTheDocument();
      expect(screen.getByText('✓ LEARNED')).toBeInTheDocument();
    });

    it('a far-off typed answer is wrong and offers only AGAIN', async () => {
      render(<StatefulHost level="b1" />);
      const input = screen.getByRole('textbox', { name: 'Type the English meaning' });
      await userEvent.type(input, 'zzzzzzzzzz');
      await userEvent.click(screen.getByRole('button', { name: /CHECK/ }));
      expect(screen.getByText('✗ NOT QUITE')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /AGAIN/ })).toBeInTheDocument();
      // Generous timeout: userEvent.type simulates 10 per-keystroke re-renders,
      // which intermittently exceeds the 5000ms default under heavy CI/hook load.
    }, 15000);
  });

  describe('plural and example rendering', () => {
    it('shows plural and example sentence for a noun card', async () => {
      const user = userEvent.setup();
      render(<VocabTab level="a1" learnedWords={{}} markLearned={() => {}} />);
      // Switch to the Food & Drink deck.
      await user.click(screen.getByRole('button', { name: /Food & Drink/i }));
      // The card face shows the plural label and the first example sentence.
      expect(await screen.findByText(/PL: Brote/)).toBeInTheDocument();
      expect(screen.getByText('Ich esse Brot.')).toBeInTheDocument();
    });
  });

  describe('custom deck generation', () => {
    const generated = [
      { de: 'die Sonne', en: 'the sun', ipa: '[ˈzɔnə]' },
      { de: 'der Regen', en: 'the rain', ipa: '[ˈʁeːɡn̩]' },
      { de: 'der Wind', en: 'the wind', ipa: '[vɪnt]' },
      { de: 'die Wolke', en: 'the cloud', ipa: '[ˈvɔlkə]' },
    ];

    const generateOnCustom = async (topic = 'weather') => {
      await userEvent.click(screen.getByRole('tab', { name: 'Custom' }));
      await userEvent.type(screen.getByRole('textbox', { name: 'Custom deck topic' }), topic);
      await userEvent.click(screen.getByRole('button', { name: /GENERATE 10 CARDS/ }));
    };

    it('calls the deck endpoint and renders the generated deck', async () => {
      callClaude.mockResolvedValue(JSON.stringify(generated));
      renderTab();

      await generateOnCustom();

      expect(await screen.findByRole('button', { name: /Your Deck/ })).toBeInTheDocument();
      expect(callClaude).toHaveBeenCalledWith(expect.any(String), expect.any(String), [], {
        endpoint: 'deck',
        routingContext: { taskType: 'deck_generation', userTier: 'guest' },
      });
      expect(callClaude.mock.calls[0][1]).toContain('weather');
      await userEvent.click(screen.getByRole('tab', { name: 'Practice' }));
      // the generated deck becomes active: its first card is on screen
      expect(screen.getByText(generated[0].de)).toBeInTheDocument();
      expect(screen.getByText(`${generated.length} cards remaining`)).toBeInTheDocument();
    });

    it('strips markdown fences from the AI response', async () => {
      callClaude.mockResolvedValue('```json\n' + JSON.stringify(generated) + '\n```');
      renderTab();
      await generateOnCustom();
      expect(await screen.findByRole('button', { name: /Your Deck/ })).toBeInTheDocument();
    });

    it('a malformed (non-JSON) AI response fails gracefully without a crash', async () => {
      const alertSpy = vi.fn();
      vi.stubGlobal('alert', alertSpy);
      callClaude.mockResolvedValue('Sorry, here are some words: Sonne, Regen');
      renderTab();

      await generateOnCustom();

      await waitFor(() => expect(alertSpy).toHaveBeenCalled());
      expect(alertSpy.mock.calls[0][0]).toMatch(/Could not generate deck/);
      // no custom deck appears, the preset deck is still active and usable
      expect(screen.queryByRole('button', { name: /Your Deck/ })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /GENERATE 10 CARDS/ })).toBeEnabled();
      await userEvent.click(screen.getByRole('tab', { name: 'Practice' }));
      expect(screen.getByText(firstCard().de)).toBeInTheDocument();
    });

    it('a quota denial shows an inline limit note and never alerts', async () => {
      const alertSpy = vi.fn();
      vi.stubGlobal('alert', alertSpy);
      callClaude.mockRejectedValue(
        new QuotaExhaustedError({
          meter: 'deck',
          tier: 'free',
          resetsAt: '2026-10-02T00:00:00.000Z',
          message: 'Daily AI limit reached.',
        })
      );
      renderTab();

      await generateOnCustom();

      expect(await screen.findByText(/Daily deck limit reached/)).toBeInTheDocument();
      expect(alertSpy).not.toHaveBeenCalled();
      // The topic is kept so a retry tomorrow does not mean retyping it.
      expect(screen.getByRole('textbox', { name: 'Custom deck topic' })).toHaveValue('weather');
    });

    it('an API failure also surfaces the alert and keeps the tab alive', async () => {
      const alertSpy = vi.fn();
      vi.stubGlobal('alert', alertSpy);
      callClaude.mockRejectedValue(new Error('API call failed (429): slow down'));
      renderTab();

      await generateOnCustom();

      await waitFor(() => expect(alertSpy).toHaveBeenCalled());
      expect(alertSpy.mock.calls[0][0]).toMatch(/429/);
      await userEvent.click(screen.getByRole('tab', { name: 'Practice' }));
      expect(screen.getByText(firstCard().de)).toBeInTheDocument();
    });
  });

  describe('auto deck loading', () => {
    beforeEach(mockLexiconFetch);

    it('loads an auto deck and shows its cards', async () => {
      const user = userEvent.setup();
      render(<VocabTab level="a1" learnedWords={{}} markLearned={() => {}} />);
      await user.selectOptions(autoDeckSelect(), 'core-100');
      // Core 100 uses the 'top' rule (sorted by rank ascending): n:haus (rank 60) → "das Haus"
      expect(await screen.findByText('das Haus')).toBeInTheDocument();
    });

    it('Retry button re-fetches after a failed load and shows deck cards', async () => {
      const user = userEvent.setup();
      let callCount = 0;
      globalThis.fetch = vi.fn((url) => {
        callCount += 1;
        // First call fails with a 500
        if (callCount === 1) {
          return Promise.resolve({ ok: false, status: 500 });
        }
        const key = Object.keys(LEXICON_FIXTURES).find((k) => String(url).endsWith(k));
        return key
          ? Promise.resolve({ ok: true, json: () => Promise.resolve(LEXICON_FIXTURES[key]) })
          : Promise.resolve({ ok: false, status: 404 });
      });

      render(<VocabTab level="a1" learnedWords={{}} markLearned={() => {}} />);
      await user.selectOptions(autoDeckSelect(), 'core-100');

      // Error UI with Retry button appears after the initial failed fetch
      const retryBtn = await screen.findByRole('button', { name: /Retry/i });
      expect(retryBtn).toBeInTheDocument();

      // Click Retry — should trigger a new fetch that succeeds
      await user.click(retryBtn);

      // Core 100 (top rule) cards now render (das Haus is the lowest-rank fixture entry)
      expect(await screen.findByText('das Haus')).toBeInTheDocument();
    });

    // Finding F1: this error replaces loading content asynchronously. Without a
    // live region the swap is silent to a screen reader.
    it('announces a deck-load failure', async () => {
      const user = userEvent.setup();
      globalThis.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 500 }));

      render(<VocabTab level="a1" learnedWords={{}} markLearned={() => {}} />);
      await user.selectOptions(autoDeckSelect(), 'core-100');

      expect(await screen.findByRole('alert')).toHaveTextContent('Could not load this deck.');
      expect(document.querySelector('[data-ui="status-note"]')).not.toBeNull();
    });
  });

  // The per-card dot strip was the only unbounded child of the progress row, so
  // a lexicon-sized deck dragged the page far wider than the viewport. Large
  // decks now get a bounded bar instead. The large-deck case is driven through
  // the custom-deck path because the committed lexicon fixture only holds 6
  // entries — every auto deck resolved from it stays under the dot threshold.
  describe('deck progress', () => {
    it('shows one dot per card on a 10-card curated deck', () => {
      renderTab();
      expect(screen.getByText(firstCard().de)).toBeInTheDocument();
      expect(screen.getAllByTestId('deck-progress-dot')).toHaveLength(10);
      expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('shows a bounded progress bar instead of dots above the threshold', async () => {
      const big = Array.from({ length: 13 }, (_, i) => ({
        de: `Wort ${i}`,
        en: `word ${i}`,
        ipa: '[vɔʁt]',
      }));
      callClaude.mockResolvedValue(JSON.stringify(big));
      renderTab();

      await userEvent.click(screen.getByRole('tab', { name: 'Custom' }));
      await userEvent.type(screen.getByRole('textbox', { name: 'Custom deck topic' }), 'weather');
      await userEvent.click(screen.getByRole('button', { name: /GENERATE 10 CARDS/ }));

      expect(await screen.findByRole('button', { name: /Your Deck/ })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('tab', { name: 'Practice' }));
      const bar = screen.getByRole('progressbar');
      expect(bar).toHaveAttribute('aria-valuenow', '0');
      expect(bar).toHaveAttribute('aria-valuemax', '13');
      expect(screen.queryAllByTestId('deck-progress-dot')).toHaveLength(0);
    });
  });

  // German compounds are long and the display word is the widest thing on the
  // card. At 64px inside 48px padding, "bestimmen" alone measured 408px on a
  // 375px viewport — wider than the screen, and a compound is far worse. The
  // word must be able to break, and the card must not spend 96px of a phone
  // screen on padding.
  describe('card face at mobile width', () => {
    const wordStyle = (mobile) => {
      const { unmount } = render(
        <VocabTab level="a1" learnedWords={{}} markLearned={() => {}} mobile={mobile} />
      );
      const word = screen.getByText(firstCard().de);
      const style = {
        overflowWrap: word.style.overflowWrap,
        fontSize: word.style.fontSize,
        maxWidth: word.style.maxWidth,
        cardPadding: word.parentElement.style.padding,
      };
      unmount();
      return style;
    };

    it('lets a long word break instead of forcing the page wider', () => {
      expect(wordStyle(true).overflowWrap).toBe('anywhere');
      expect(wordStyle(false).overflowWrap).toBe('anywhere');
    });

    it('steps the display word and card padding down on mobile', () => {
      const mobile = wordStyle(true);
      const desktop = wordStyle(false);
      expect(mobile.fontSize).toBe('48px');
      expect(desktop.fontSize).toBe('64px');
      expect(mobile.cardPadding).toBe('20px');
      expect(desktop.cardPadding).toBe('48px');
    });
  });

  describe('Artikel decks drill gender', () => {
    beforeEach(mockLexiconFetch);

    it('shows the bare lemma, never the article that is being asked for', async () => {
      const user = userEvent.setup();
      render(<VocabTab level="a1" learnedWords={{}} markLearned={() => {}} />);
      await pickAutoDeck(user, 'Artikel', /A1 Nouns/i);
      // "das Haus" is the display form everywhere else; here it must be bare.
      expect(await screen.findByText('Haus')).toBeInTheDocument();
      expect(screen.queryByText('das Haus')).not.toBeInTheDocument();
      for (const a of ['der', 'die', 'das']) {
        expect(screen.getByRole('button', { name: a })).toBeInTheDocument();
      }
    });

    it('a wrong guess answers with the full form, not the English gloss', async () => {
      // Regression: the verdict panel was handed card.en, so guessing wrong on
      // "Haus" replied "house" — the meaning, which was never the question.
      const user = userEvent.setup();
      render(<VocabTab level="a1" learnedWords={{}} markLearned={() => {}} />);
      await pickAutoDeck(user, 'Artikel', /A1 Nouns/i);
      await screen.findByText('Haus');
      await user.click(screen.getByRole('button', { name: 'der' })); // Haus is das
      expect(screen.getByText('\u2717 NOT QUITE')).toBeInTheDocument();
      expect(screen.getByText('das Haus')).toBeInTheDocument();
      expect(screen.queryByText('house')).not.toBeInTheDocument();
    });

    it('does not mark the word learned for a correct gender answer', async () => {
      // Knowing a noun's gender is not knowing the word, and learnedWords is
      // keyed by card id with no notion of which skill was shown.
      const markLearned = vi.fn();
      const user = userEvent.setup();
      render(<VocabTab level="a1" learnedWords={{}} markLearned={markLearned} />);
      await pickAutoDeck(user, 'Artikel', /A1 Nouns/i);
      await screen.findByText('Haus');
      await user.click(screen.getByRole('button', { name: 'das' }));
      expect(screen.getByText('\u2713 CORRECT')).toBeInTheDocument();
      expect(markLearned).not.toHaveBeenCalled();
    });
  });

  describe('Plural decks drill plurals', () => {
    beforeEach(mockLexiconFetch);

    // The fixture's A1 nouns are n:haus (das Haus / Häuser), n:wasser and
    // n:brot. The deck is rank-ordered, so n:haus (rank 60) comes first.
    const openDeck = async (user) => {
      render(<VocabTab level="a1" learnedWords={{}} markLearned={() => {}} />);
      await pickAutoDeck(user, 'Plural', /A1 Plurals/i);
      return screen.findByText('das Haus');
    };

    it('shows the articled singular and asks for the plural', async () => {
      const user = userEvent.setup();
      await openDeck(user);
      // The article is shown on purpose: it is not the answer, and for die-nouns
      // it is a real cue (90% take -n/-en).
      expect(screen.getByRole('textbox', { name: 'Type the plural' })).toBeInTheDocument();
    });

    it('never prints the answer on the card', async () => {
      // Regression: CardFace renders a "PL: Häuser" line, which sat directly above
      // the input asking for it. Every unit test passed; the browser caught it.
      const user = userEvent.setup();
      await openDeck(user);
      expect(screen.queryByText(/^PL:/)).not.toBeInTheDocument();
      expect(screen.queryByText('Häuser')).not.toBeInTheDocument();
    });

    it('accepts the plural and does not mark the word learned', async () => {
      const markLearned = vi.fn();
      const user = userEvent.setup();
      render(<VocabTab level="a1" learnedWords={{}} markLearned={markLearned} />);
      await pickAutoDeck(user, 'Plural', /A1 Plurals/i);
      await screen.findByText('das Haus');
      await user.type(screen.getByRole('textbox', { name: 'Type the plural' }), 'Häuser');
      await user.click(screen.getByRole('button', { name: /CHECK/ }));
      expect(screen.getByText('\u2713 CORRECT')).toBeInTheDocument();
      // Knowing a plural is not knowing the word.
      expect(markLearned).not.toHaveBeenCalled();
    });

    it('accepts the keyboard spelling of an umlaut', async () => {
      // validation.target folds ä→ae, the substitution German itself defines
      // for keyboards that cannot type it. This drill is its first consumer.
      const user = userEvent.setup();
      await openDeck(user);
      await user.type(screen.getByRole('textbox', { name: 'Type the plural' }), 'Haeuser');
      await user.click(screen.getByRole('button', { name: /CHECK/ }));
      expect(screen.getByText('\u2713 CORRECT')).toBeInTheDocument();
    });

    it('grades a near-miss plural WRONG, never almost', async () => {
      // "Hauser" is one edit from "Häuser" and fuzzyMatch would call it almost,
      // teaching that a wrong plural is nearly right. The umlaut IS the plural.
      const user = userEvent.setup();
      await openDeck(user);
      await user.type(screen.getByRole('textbox', { name: 'Type the plural' }), 'Hauser');
      await user.click(screen.getByRole('button', { name: /CHECK/ }));
      expect(screen.getByText('\u2717 NOT QUITE')).toBeInTheDocument();
      expect(screen.queryByText(/ALMOST/)).not.toBeInTheDocument();
      // and answers with the plural-articled form
      expect(screen.getByText('die Häuser')).toBeInTheDocument();
    });
  });

  describe('Perfekt decks drill the perfect tense', () => {
    beforeEach(mockLexiconFetch);

    // The fixture's only verb is v:treffen — haben / getroffen / er trifft.
    const openDeck = async (user) => {
      render(<VocabTab level="a1" learnedWords={{}} markLearned={() => {}} />);
      await pickAutoDeck(user, 'Perfekt', /A1 Verbs/i);
      return screen.findByText('treffen');
    };

    it('shows the infinitive and asks for the perfect', async () => {
      const user = userEvent.setup();
      await openDeck(user);
      expect(screen.getByRole('textbox', { name: 'Type the perfect' })).toBeInTheDocument();
    });

    it('never prints either verb line on the card', async () => {
      // The Perfekt: line is the answer verbatim, and the er: line hands over a
      // weak verb's stem. Both are concealed.
      const user = userEvent.setup();
      await openDeck(user);
      expect(screen.queryByText(/trifft/)).not.toBeInTheDocument();
      expect(screen.queryByText(/getroffen/)).not.toBeInTheDocument();
    });

    it('accepts the full perfect and does not mark the word learned', async () => {
      const markLearned = vi.fn();
      const user = userEvent.setup();
      render(<VocabTab level="a1" learnedWords={{}} markLearned={markLearned} />);
      await pickAutoDeck(user, 'Perfekt', /A1 Verbs/i);
      await screen.findByText('treffen');
      await user.type(screen.getByRole('textbox', { name: 'Type the perfect' }), 'hat getroffen');
      await user.click(screen.getByRole('button', { name: /CHECK/ }));
      expect(screen.getByText('\u2713 CORRECT')).toBeInTheDocument();
      expect(markLearned).not.toHaveBeenCalled();
    });

    it('rejects the bare participle — the auxiliary is part of the answer', async () => {
      // Accepting "getroffen" would quietly teach that the auxiliary is
      // optional, which is the error that produces "ich bin getroffen".
      const user = userEvent.setup();
      await openDeck(user);
      await user.type(screen.getByRole('textbox', { name: 'Type the perfect' }), 'getroffen');
      await user.click(screen.getByRole('button', { name: /CHECK/ }));
      expect(screen.getByText('\u2717 NOT QUITE')).toBeInTheDocument();
      expect(screen.getByText('hat getroffen')).toBeInTheDocument();
    });
  });

  describe('Präsens decks drill the du-form', () => {
    beforeEach(mockLexiconFetch);

    // The fixture's only verb is v:treffen — present.du = 'triffst'.
    const openDeck = async (user) => {
      render(<VocabTab level="a1" learnedWords={{}} markLearned={() => {}} />);
      await pickAutoDeck(user, 'Präsens', /A1 du-Form/i);
      return screen.findByText('treffen');
    };

    it('shows the infinitive and asks for the du-form', async () => {
      const user = userEvent.setup();
      await openDeck(user);
      expect(screen.getByRole('textbox', { name: 'Type the du-form' })).toBeInTheDocument();
    });

    it('never prints either verb line on the card', async () => {
      // "er: trifft" shares the stem change with "du triffst", so it would hand
      // over exactly the cards that are not mechanical.
      const user = userEvent.setup();
      await openDeck(user);
      expect(screen.queryByText(/trifft\b/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Perfekt:/)).not.toBeInTheDocument();
    });

    it('accepts the du-form and does not mark the word learned', async () => {
      const markLearned = vi.fn();
      const user = userEvent.setup();
      render(<VocabTab level="a1" learnedWords={{}} markLearned={markLearned} />);
      await pickAutoDeck(user, 'Präsens', /A1 du-Form/i);
      await screen.findByText('treffen');
      await user.type(screen.getByRole('textbox', { name: 'Type the du-form' }), 'triffst');
      await user.click(screen.getByRole('button', { name: /CHECK/ }));
      expect(screen.getByText('\u2713 CORRECT')).toBeInTheDocument();
      expect(markLearned).not.toHaveBeenCalled();
    });

    it('rejects the regular-but-wrong form and answers with the pronoun', async () => {
      // "treffst" is what the -st rule alone produces; the stem change is the
      // whole point of the card.
      const user = userEvent.setup();
      await openDeck(user);
      await user.type(screen.getByRole('textbox', { name: 'Type the du-form' }), 'treffst');
      await user.click(screen.getByRole('button', { name: /CHECK/ }));
      expect(screen.getByText('\u2717 NOT QUITE')).toBeInTheDocument();
      expect(screen.getByText('du triffst')).toBeInTheDocument();
    });
  });

  describe('meaning drill accepts every gloss', () => {
    beforeEach(() => {
      mockLexiconFetch();
      setUserLevel('b1');
    });

    // Core 100 is rank-ordered: n:haus (60) then n:wasser (88). n:wasser ships
    // en: ['water', 'waters, body of water'] — only the first was ever accepted,
    // so "waters", a correct meaning the app itself supplies, graded wrong.
    const openWasser = async (user) => {
      render(<VocabTab level="b1" learnedWords={{}} markLearned={() => {}} />);
      await user.selectOptions(autoDeckSelect(), 'core-100');
      await screen.findByText('das Haus');
      const input = screen.getByRole('textbox', { name: 'Type the English meaning' });
      await user.type(input, 'house');
      await user.click(screen.getByRole('button', { name: /CHECK/ }));
      await user.click(screen.getByRole('button', { name: 'GOOD' }));
      // The SRS buttons hold a 200ms click lock to swallow the phantom click
      // that would otherwise land on whatever mounts at the same coordinates.
      // submitTyped honours that lock, so a test that answers the NEXT card
      // immediately has its submit silently dropped.
      await new Promise((r) => setTimeout(r, 250));
      return screen.findByText('das Wasser');
    };

    it('accepts a meaning taken from a non-primary gloss', async () => {
      const user = userEvent.setup();
      await openWasser(user);
      await user.type(screen.getByRole('textbox', { name: 'Type the English meaning' }), 'waters');
      await user.click(screen.getByRole('button', { name: /CHECK/ }));
      expect(screen.getByText('\u2713 CORRECT')).toBeInTheDocument();
    });

    it('still accepts the primary gloss', async () => {
      const user = userEvent.setup();
      await openWasser(user);
      await user.type(screen.getByRole('textbox', { name: 'Type the English meaning' }), 'water');
      await user.click(screen.getByRole('button', { name: /CHECK/ }));
      expect(screen.getByText('\u2713 CORRECT')).toBeInTheDocument();
    });

    it('teaches the other meanings in the verdict, never on the card face', async () => {
      const user = userEvent.setup();
      await openWasser(user);
      // Before answering, the card must not show the glosses.
      expect(screen.queryByText(/waters, body of water/)).not.toBeInTheDocument();
      await user.type(
        screen.getByRole('textbox', { name: 'Type the English meaning' }),
        'zzzzzzzzzz'
      );
      await user.click(screen.getByRole('button', { name: /CHECK/ }));
      expect(screen.getByText('\u2717 NOT QUITE')).toBeInTheDocument();
      expect(screen.getByText('water · waters, body of water')).toBeInTheDocument();
    });
  });

  describe('Hören decks play the word and hide it', () => {
    beforeEach(mockLexiconFetch);

    // Core-ranked A1 nouns; n:haus (rank 60) is first — "das Haus".
    const openDeck = async (user) => {
      render(<VocabTab level="a1" learnedWords={{}} markLearned={() => {}} />);
      await pickAutoDeck(user, 'Hören', /A1 Hören/i);
      return screen.findByRole('textbox', { name: 'Type what you hear' });
    };

    it('shows nothing that could give the word away', async () => {
      // The answer IS the headword, so this is the one drill where every text
      // the card knows is a leak. The whole checklist, as one assertion each.
      const user = userEvent.setup();
      await openDeck(user);
      expect(screen.queryByText('das Haus')).not.toBeInTheDocument(); // headword
      expect(screen.queryByText(/Haus/)).not.toBeInTheDocument(); // any form of it
      expect(screen.queryByText(/^PL:/)).not.toBeInTheDocument(); // plural
      expect(screen.queryByText(/hau̯s|haʊ/i)).not.toBeInTheDocument(); // IPA
      expect(screen.queryByText(/Ich wohne/)).not.toBeInTheDocument(); // example
    });

    // This drill used to speak the card on arrival, and the inverse of that
    // test is now the assertion. Audio that starts by itself talks over a
    // screen reader announcing the card, and it fires on a shared or public
    // device before the learner can decline — neither is recoverable after the
    // fact, so nothing here plays without a press.
    it('stays silent until the learner presses play', async () => {
      const user = userEvent.setup();
      await openDeck(user);
      expect(speak).not.toHaveBeenCalled();
    });

    it('speaks on demand', async () => {
      const user = userEvent.setup();
      await openDeck(user);
      await user.click(screen.getByRole('button', { name: 'Play the word' }));
      expect(speak).toHaveBeenCalledWith('das Haus');
    });

    it('labels the play control with words, not a decorative speaker icon', async () => {
      const user = userEvent.setup();
      await openDeck(user);
      const play = screen.getByRole('button', { name: 'Play the word' });
      expect(play.textContent.trim()).toBe('PLAY');
      expect(play.querySelector('svg')).toBeNull();
    });

    // The button carried "AGAIN" from the autoplay era, when the card had
    // always spoken once already. Left alone it would ask the learner to
    // repeat something they were never played.
    it('offers a first listen, then a replay', async () => {
      const user = userEvent.setup();
      await openDeck(user);
      expect(screen.queryByRole('button', { name: 'Play the word again' })).not.toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Play the word' }));
      const again = await screen.findByRole('button', { name: 'Play the word again' });
      speak.mockClear();
      await user.click(again);
      expect(speak).toHaveBeenCalledWith('das Haus');
    });

    it('accepts what was heard and does not mark the word learned', async () => {
      const markLearned = vi.fn();
      const user = userEvent.setup();
      render(<VocabTab level="a1" learnedWords={{}} markLearned={markLearned} />);
      await pickAutoDeck(user, 'Hören', /A1 Hören/i);
      const input = await screen.findByRole('textbox', { name: 'Type what you hear' });
      await user.type(input, 'das Haus');
      await user.click(screen.getByRole('button', { name: /CHECK/ }));
      expect(screen.getByText('\u2713 CORRECT')).toBeInTheDocument();
      expect(markLearned).not.toHaveBeenCalled();
    });

    it('accepts a different capitalisation of what was heard', async () => {
      // NOT the umlaut case: no fixture noun carries one (Haus, Wasser, Brot),
      // so that path is covered where a fixture word does have it — the plural
      // suite types "Haeuser" for "Häuser". Naming this for what it checks.
      const user = userEvent.setup();
      render(<VocabTab level="a1" learnedWords={{}} markLearned={() => {}} />);
      await pickAutoDeck(user, 'Hören', /A1 Hören/i);
      const input = await screen.findByRole('textbox', { name: 'Type what you hear' });
      await user.type(input, 'das haus');
      await user.click(screen.getByRole('button', { name: /CHECK/ }));
      expect(screen.getByText('\u2713 CORRECT')).toBeInTheDocument();
    });
  });

  describe('management tabs', () => {
    beforeEach(mockLexiconFetch);

    // Production Core 100 / CEFR B1 can queue an index past Greetings (10).
    // The lexicon fixture is only 6 cards, so a 20-card custom deck stands in.
    const queuePastGreetings = async () => {
      const cards = Array.from({ length: 20 }, (_, i) => ({
        id: `Wort ${i}`,
        de: `Wort ${i}`,
        en: `word ${i}`,
        ipa: '[vɔʁt]',
      }));
      render(
        <VocabTab
          level="a1"
          learnedWords={{}}
          markLearned={() => {}}
          customDecks={{
            'custom-big': { deckId: 'custom-big', name: 'Big Deck', cards },
          }}
        />
      );
      await userEvent.click(screen.getByRole('button', { name: /Your Deck: Big Deck/ }));
      await userEvent.click(screen.getByRole('tab', { name: 'Browse' }));
      await userEvent.click(screen.getByRole('button', { name: 'Practise Wort 15' }));
      expect(screen.getByText('Wort 15')).toBeInTheDocument();
    };

    const expectGreetingsQueueRebuilt = () => {
      expect(
        screen.queryByRole('heading', { name: /something went wrong/i })
      ).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /reload/i })).not.toBeInTheDocument();
      expect(screen.getByRole('tabpanel', { name: 'Practice' })).toBeInTheDocument();
      expect(screen.getByText(firstCard().de)).toBeInTheDocument();
      expect(screen.getByText(`${DECKS.greetings.length} cards remaining`)).toBeInTheDocument();
      expect(screen.queryByText('Wort 15')).not.toBeInTheDocument();
      expect(screen.queryByText(/select a deck to start/i)).not.toBeInTheDocument();
    };

    it('defaults to Practice with a labelled tablist and the greetings drill', () => {
      renderTab();
      expect(screen.getByRole('tablist', { name: 'Vocabulary mode' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Practice' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      expect(screen.getByRole('tabpanel', { name: 'Practice' })).toBeInTheDocument();
      expect(screen.getByText(firstCard().de)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /GENERATE/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: 'Custom deck topic' })).not.toBeInTheDocument();
    });

    it('opens Browse as a view-only table of the selected deck and hides generate', async () => {
      renderTab();
      await userEvent.click(screen.getByRole('tab', { name: 'Browse' }));
      expect(screen.getByRole('tabpanel', { name: 'Browse' })).toBeInTheDocument();
      expect(screen.getByText(/choose a deck/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /GENERATE/ })).not.toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Term' })).toBeInTheDocument();
      expect(screen.getByText(firstCard().de)).toBeInTheDocument();
      expect(screen.getByText(firstCard().en)).toBeInTheDocument();
    });

    it('selecting a deck on Browse updates Browse and Practice', async () => {
      const travel = firstCard('travel');
      renderTab();
      await userEvent.click(screen.getByRole('tab', { name: 'Browse' }));
      await userEvent.selectOptions(
        screen.getByRole('combobox', { name: /choose a deck/i }),
        'travel'
      );
      expect(screen.getByRole('heading', { name: 'Travel' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Practise ${travel.de}` })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /GENERATE/ })).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('tab', { name: 'Practice' }));
      expect(screen.getByRole('button', { name: /Travel 10 cards/ })).toHaveAttribute(
        'aria-pressed',
        'true'
      );
      expect(screen.getByText(travel.de)).toBeInTheDocument();

      await userEvent.click(screen.getByRole('tab', { name: 'Browse' }));
      await userEvent.selectOptions(
        screen.getByRole('combobox', { name: /choose a deck/i }),
        'core-100'
      );
      expect(await screen.findByRole('heading', { name: 'Core 100' })).toBeInTheDocument();
      expect(screen.getByRole('combobox', { name: /choose a deck/i })).toHaveValue('core-100');
    });

    it('Browse names the active custom deck instead of the placeholder', async () => {
      const cards = [{ id: 'die Sonne', de: 'die Sonne', en: 'sun', ipa: '[ˈzɔnə]' }];
      render(
        <VocabTab
          level="a1"
          learnedWords={{}}
          markLearned={() => {}}
          customDecks={{
            'custom-1': { deckId: 'custom-1', name: 'weather', cards },
          }}
        />
      );
      await userEvent.click(screen.getByRole('button', { name: /Your Deck: weather/ }));
      await userEvent.click(screen.getByRole('tab', { name: 'Browse' }));
      const select = screen.getByRole('combobox', { name: /choose a deck/i });
      expect(select).toHaveValue('custom-1');
      expect(select).toHaveDisplayValue('weather');
      expect(screen.getByText('die Sonne')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
    });

    it('Practise on a Browse row returns to Practice on that card', async () => {
      renderTab();
      await userEvent.click(screen.getByRole('tab', { name: 'Browse' }));
      const first = firstCard();
      await userEvent.click(screen.getByRole('button', { name: `Practise ${first.de}` }));
      expect(screen.getByRole('tab', { name: 'Practice' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      expect(screen.queryByRole('button', { name: /GENERATE/ })).not.toBeInTheDocument();
      expect(screen.getByText(first.de)).toBeInTheDocument();
    });

    it('does not crash when switching to Greetings after Practise-from-row on a large deck', async () => {
      await queuePastGreetings();
      await userEvent.click(screen.getByRole('button', { name: /Greetings/ }));
      expectGreetingsQueueRebuilt();
    });

    it('only selectDeck writes deckId — UI surfaces never receive the raw setter', () => {
      // Bounds checks mean a behavioral test can still pass if a surface is
      // wired to the raw setter. This pins the call sites instead. Comments
      // are stripped so a remark cannot inflate a raw occurrence count.
      const src = readFileSync('src/components/VocabTab.jsx', 'utf8');
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      expect(code).toContain('const [deckId, setDeckIdRaw] = useState');
      expect(code).toContain('setDeckIdRaw(nextId)');
      expect(code).not.toMatch(/onSelect(?:Deck)?=\{setDeckId/);
      expect(code).toContain('onSelectDeck={selectDeck}');
      expect(code).toContain('onSelect={selectDeck}');
      expect(code).toContain('selectDeck(reviewTarget.context)');
      expect(code).toContain('selectDeck(generatedId)');
      expect(code).toContain('selectDeck(DEFAULT_DECK_ID)');
      const remainder = code
        .replace('const [deckId, setDeckIdRaw] = useState', '')
        .replace('setDeckIdRaw(nextId)', '');
      expect(remainder).not.toMatch(/setDeckIdRaw/);
    });

    it('rebuilds the Greetings queue after a Browse switch from a high-index deck', async () => {
      await queuePastGreetings();
      await userEvent.click(screen.getByRole('tab', { name: 'Browse' }));
      await userEvent.selectOptions(
        screen.getByRole('combobox', { name: /choose a deck/i }),
        'greetings'
      );
      await userEvent.click(screen.getByRole('tab', { name: 'Practice' }));
      expectGreetingsQueueRebuilt();
    });

    it('shows generate on Custom and no longer calls the tab view-only', async () => {
      renderTab();
      await userEvent.click(screen.getByRole('tab', { name: 'Custom' }));
      expect(screen.getByRole('tabpanel', { name: 'Custom' })).toBeInTheDocument();
      expect(screen.queryByText(/view-only/i)).not.toBeInTheDocument();
      expect(screen.getByText(/no custom decks yet/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /GENERATE/ })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Custom deck topic' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
    });

    it('Practice lists a custom deck without generate or trash', () => {
      const cards = [{ id: 'die Sonne', de: 'die Sonne', en: 'sun', ipa: '[ˈzɔnə]' }];
      render(
        <VocabTab
          level="a1"
          learnedWords={{}}
          markLearned={() => {}}
          customDecks={{
            'custom-1': { deckId: 'custom-1', name: 'weather', cards },
          }}
        />
      );
      expect(screen.getByRole('button', { name: /Your Deck: weather/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /GENERATE/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: 'Custom deck topic' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument();
    });

    it('Custom owns generate, trash, and the two-step delete confirm', async () => {
      const cards = [{ id: 'die Sonne', de: 'die Sonne', en: 'sun', ipa: '[ˈzɔnə]' }];
      const onDeckDeleted = vi.fn();
      render(
        <VocabTab
          level="a1"
          learnedWords={{}}
          markLearned={() => {}}
          onDeckDeleted={onDeckDeleted}
          customDecks={{
            'custom-1': { deckId: 'custom-1', name: 'weather', cards },
          }}
        />
      );
      await userEvent.click(screen.getByRole('tab', { name: 'Custom' }));
      expect(screen.getByRole('button', { name: /GENERATE 10 CARDS/ })).toBeInTheDocument();
      const trash = screen.getByRole('button', { name: 'Remove weather' });
      const select = screen.getByRole('button', { name: /Your Deck: weather/ });
      expect(select.contains(trash)).toBe(false);

      await userEvent.click(trash);
      expect(onDeckDeleted).not.toHaveBeenCalled();
      expect(screen.getByRole('status')).toHaveTextContent(
        "Remove weather? Cards can't be recovered."
      );
      await userEvent.click(screen.getByRole('button', { name: 'Remove weather permanently' }));
      expect(onDeckDeleted).toHaveBeenCalledTimes(1);
      expect(onDeckDeleted).toHaveBeenCalledWith('custom-1');
    });

    it('lists a generated deck on Custom with a remove control', async () => {
      callClaude.mockResolvedValueOnce(
        JSON.stringify([{ de: 'die Sonne', en: 'sun', ipa: '[ˈzɔnə]' }])
      );
      renderTab();
      await userEvent.click(screen.getByRole('tab', { name: 'Custom' }));
      await userEvent.type(screen.getByRole('textbox', { name: 'Custom deck topic' }), 'weather');
      await userEvent.click(screen.getByRole('button', { name: /GENERATE 10 CARDS/ }));
      await screen.findByRole('button', { name: /Your Deck/ });

      expect(
        screen.getByRole('button', { name: 'Your Deck: weather — 1 card' })
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Remove weather' })).toBeInTheDocument();
      expect(screen.getByText('die Sonne')).toBeInTheDocument();
    });

    it('keeps at-cap copy beside the generate form on Custom, not Practice', async () => {
      const decks = Object.fromEntries(
        Array.from({ length: 8 }, (_, i) => [
          `custom-${i}`,
          {
            deckId: `custom-${i}`,
            name: `topic ${i}`,
            cards: [{ id: `w${i}`, de: `Wort${i}`, en: `word${i}` }],
          },
        ])
      );
      render(<VocabTab level="a1" learnedWords={{}} markLearned={() => {}} customDecks={decks} />);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /GENERATE/ })).not.toBeInTheDocument();

      await userEvent.click(screen.getByRole('tab', { name: 'Custom' }));
      expect(screen.getByRole('status')).toHaveTextContent(/8 decks is the limit/i);
      expect(screen.getByRole('button', { name: /GENERATE 10 CARDS/ })).toBeDisabled();
    });

    it('resets to Practice when the tab remounts', async () => {
      const { unmount } = renderTab();
      await userEvent.click(screen.getByRole('tab', { name: 'Browse' }));
      expect(screen.getByRole('tab', { name: 'Browse' })).toHaveAttribute('aria-selected', 'true');
      unmount();
      renderTab();
      expect(screen.getByRole('tab', { name: 'Practice' })).toHaveAttribute(
        'aria-selected',
        'true'
      );
      expect(screen.getByRole('tabpanel', { name: 'Practice' })).toBeInTheDocument();
    });
  });
});

describe('VocabTab — interest decks', () => {
  beforeEach(() => {
    localStorage.clear();
    setUserLevel('a1');
  });

  it('lets an A1 learner practice an enabled Sport deck', async () => {
    const user = userEvent.setup();
    const sport = activePack.content.interestDecks['interest-sport'][0];
    renderTab({ enabledInterests: ['sport'] });
    await pickAutoDeck(user, 'Interests', /Sport \(10 cards\)/);
    expect(screen.getByText(sport.de)).toBeInTheDocument();
    expect(screen.getByText('10 cards remaining')).toBeInTheDocument();
  });

  it('hides Interests until a topic is enabled', () => {
    renderTab();
    expect(screen.queryByRole('option', { name: 'Interests' })).not.toBeInTheDocument();
  });
});
