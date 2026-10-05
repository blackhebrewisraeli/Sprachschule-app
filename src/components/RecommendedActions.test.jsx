import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecommendedActions from './RecommendedActions';
import { resolveRecommended } from './resolveRecommended';
import { SPACE } from '../lib/theme';

describe('resolveRecommended', () => {
  it('promotes the first two missions that have pack copy', () => {
    const missions = [
      { id: 'srs-due', count: 5, tab: 'vocab', priority: 0 },
      { id: 'goal-remaining', count: 20, tab: 'chat', priority: 2 },
      { id: 'revisit-wrong', count: 3, tab: 'translate', priority: 3 },
    ];
    const { cards, remaining } = resolveRecommended(missions);
    expect(cards.map((c) => c.id)).toEqual(['srs-due', 'goal-remaining']);
    expect(remaining.map((m) => m.id)).toEqual(['revisit-wrong']);
    expect(cards[0].text).toMatch(/5 cards are due/i);
  });

  it('pads with pack fallbacks when fewer than two missions are open', () => {
    const { cards, remaining } = resolveRecommended([]);
    expect(remaining).toEqual([]);
    expect(cards).toHaveLength(2);
    expect(cards.map((c) => c.id)).toEqual(['continue-quiz', 'review-vocab']);
    expect(cards[0].text).toBe('Continue Quiz');
    expect(cards[1].text).toBe('Review Vocab');
    expect(cards[0].tab).toBe('translate');
    expect(cards[1].tab).toBe('vocab');
  });

  it('counts promoted missions apart from fallbacks', () => {
    // Home tells "nothing open" from "everything open is up here" by this
    // count; both leave `remaining` empty.
    expect(resolveRecommended([]).promotedCount).toBe(0);
    const one = [{ id: 'srs-due', count: 5, tab: 'vocab', priority: 0 }];
    const { cards, remaining, promotedCount } = resolveRecommended(one);
    expect(remaining).toEqual([]);
    expect(cards).toHaveLength(2); // one mission + one fallback
    expect(promotedCount).toBe(1);
  });

  it('skips a mission with no pack copy rather than inventing a label', () => {
    const missions = [{ id: 'not-a-real-mission', count: 1, tab: 'chat' }];
    const { cards, remaining } = resolveRecommended(missions);
    expect(remaining.map((m) => m.id)).toEqual(['not-a-real-mission']);
    expect(cards.map((c) => c.id)).toEqual(['continue-quiz', 'review-vocab']);
  });

  it('drops a CEFR-tagged deck above the classified level', () => {
    const missions = [
      { id: 'deck-unfinished', count: 7, tab: 'vocab', priority: 4, deckId: 'cefr-b1' },
    ];
    const { cards, remaining } = resolveRecommended(missions, 2, { classifiedLevel: 'a1' });
    expect(remaining).toEqual([]);
    expect(cards.map((c) => c.id)).not.toContain('deck-unfinished');
    expect(cards[0].tab).not.toBeUndefined();
  });

  it('drops a mission that names a mode above classified', () => {
    const missions = [
      { id: 'goal-remaining', count: 20, tab: 'translate', priority: 2, mode: 'b1' },
    ];
    const { cards, remaining } = resolveRecommended(missions, 2, { classifiedLevel: 'a1' });
    expect(cards.map((c) => c.id)).not.toContain('goal-remaining');
    expect(remaining.map((m) => m.id)).not.toContain('goal-remaining');
  });

  it('keeps tab-only fallbacks for an A1 learner — they inherit classified mode', () => {
    const { cards } = resolveRecommended([], 2, { classifiedLevel: 'a1' });
    expect(cards.map((c) => c.id)).toEqual(['continue-quiz', 'review-vocab']);
    expect(cards[0].tab).toBe('translate');
  });
});

describe('RecommendedActions', () => {
  it('renders pack copy, never a hardcoded German sentence of its own', async () => {
    const onGo = vi.fn();
    render(
      <RecommendedActions
        missions={[{ id: 'srs-due', count: 5, tab: 'vocab', priority: 0 }]}
        onGo={onGo}
      />
    );
    expect(screen.getByRole('heading', { name: /recommended for you/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /5 cards are due/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue quiz/i })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /5 cards are due/i }));
    expect(onGo).toHaveBeenCalledWith('vocab', expect.objectContaining({ id: 'srs-due' }));
  });

  it('sets card titles in the body face, not a mono or display wall', () => {
    render(<RecommendedActions missions={[]} />);
    const titles = document.querySelectorAll('[data-recommended-title]');
    expect(titles.length).toBeGreaterThan(0);
    for (const title of titles) {
      expect(title).toHaveStyle({ fontFamily: 'var(--f-body)' });
    }
  });

  it('sets the icon beside the copy, centred on it, not stacked above it', () => {
    // Stacked, each card opened with a lone glyph pinned to its top-left corner.
    render(<RecommendedActions missions={[]} />);
    const cards = screen.getAllByRole('button');
    for (const card of cards) {
      const row = card.querySelector('[data-recommended-row]');
      expect(row).toHaveStyle({ flexDirection: 'row', alignItems: 'center', flexWrap: 'nowrap' });
      expect(row.firstElementChild).toHaveAttribute('aria-hidden', 'true');
      expect(row.firstElementChild.querySelector('svg')).not.toBeNull();
      expect(card).toHaveStyle({ padding: `${SPACE[4]}px` });
    }
  });

  it('routes a fallback card to the tab the pack named', async () => {
    const onGo = vi.fn();
    render(<RecommendedActions missions={[]} onGo={onGo} />);
    await userEvent.click(screen.getByRole('button', { name: /review vocab/i }));
    expect(onGo).toHaveBeenCalledWith('vocab', expect.objectContaining({ id: 'review-vocab' }));
  });

  it('forwards the mission deckId so the destination can open that deck', async () => {
    const onGo = vi.fn();
    render(
      <RecommendedActions
        missions={[{ id: 'deck-unfinished', count: 7, tab: 'vocab', priority: 4, deckId: 'food' }]}
        onGo={onGo}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: /7 cards left in your deck/i }));
    expect(onGo).toHaveBeenCalledWith(
      'vocab',
      expect.objectContaining({ id: 'deck-unfinished', deckId: 'food' })
    );
  });

  it('still renders two cards with pack fallbacks on a quiet day', () => {
    render(<RecommendedActions missions={[]} />);
    const cards = screen.getAllByRole('button');
    expect(cards).toHaveLength(2);
    expect(cards[0]).toHaveAccessibleName(/continue quiz/i);
    expect(cards[1]).toHaveAccessibleName(/review vocab/i);
  });
});
