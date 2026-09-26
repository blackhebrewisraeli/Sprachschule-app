import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import BadgeGrid from './BadgeGrid';
import { ACHIEVEMENTS } from '../../lib/gamification';
import { BORDER, FONT_SIZE, LINE_HEIGHT } from '../../lib/theme';
import { activePack } from '../../packs';

const tiles = () => screen.getAllByRole('listitem');

describe('BadgeGrid', () => {
  it('renders only earned badges — locked ones are not in the DOM at all', () => {
    // Derived from the catalogue, not hardcoded: a literal count goes stale
    // every time a badge is added.
    const [first, second, ...locked] = ACHIEVEMENTS;
    expect(locked.length).toBeGreaterThan(0);
    render(<BadgeGrid achievements={{ [first.id]: 1, [second.id]: 2 }} />);

    expect(tiles()).toHaveLength(2);
    expect(screen.getByText(first.name)).toBeInTheDocument();
    expect(screen.getByText(second.name)).toBeInTheDocument();
    for (const a of locked) expect(screen.queryByText(a.name)).not.toBeInTheDocument();
    expect(screen.queryByText('GESPERRT')).not.toBeInTheDocument();
  });

  it.each([{}, undefined, null])('shows an empty state, not an empty list, for %s', (a) => {
    render(<BadgeGrid achievements={a} />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByText(/no badges yet/i)).toBeInTheDocument();
  });

  it('draws tiles flat with a hairline and takes every size from a token', () => {
    render(<BadgeGrid achievements={{ [ACHIEVEMENTS[0].id]: 1 }} />);
    const [tile] = tiles();
    expect(tile.style.boxShadow).toBe('');
    expect(tile.style.border).toBe(BORDER.panel);

    const [, name] = tile.children;
    expect(name.style.fontSize).toBe(`${FONT_SIZE.base}px`);
    expect(name.style.lineHeight).toBe(String(LINE_HEIGHT.snug));
  });

  it('draws each badge as its own medal, never as an emoji', () => {
    render(<BadgeGrid achievements={Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, 1]))} />);
    for (const [i, tile] of tiles().entries()) {
      const a = ACHIEVEMENTS[i];
      const medal = tile.firstElementChild;
      expect(medal.tagName.toLowerCase()).toBe('svg');
      expect(medal).toHaveAttribute('data-badge-icon', a.id);
      // Decorative: the name beside it is the accessible text.
      expect(medal).toHaveAttribute('aria-hidden', 'true');
      expect(tile).not.toHaveTextContent(a.icon);
    }
  });

  it('marks badge names with the pack language so long compounds hyphenate', () => {
    render(<BadgeGrid achievements={{ [ACHIEVEMENTS[0].id]: 1 }} />);
    const [, name] = tiles()[0].children;
    expect(name).toHaveAttribute('lang', activePack.meta.locale);
    expect(name.style.hyphens).toBe('auto');
  });
});
