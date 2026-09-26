import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import BadgeIcon from './BadgeIcon';
import { ACHIEVEMENTS } from '../../lib/gamification';
import { COLORS } from '../../lib/theme';

const medal = (id, props) =>
  render(<BadgeIcon id={id} {...props} />).container.querySelector('svg');

// Every paint on a medal is a flag token (same value in every palette, so a
// medal looks like the same object in light and dark) or the theme's strong
// border, which only traces the rim's outer edge.
const ALLOWED_PAINTS = new Set([
  COLORS.flagBlack,
  COLORS.flagRed,
  COLORS.flagGold,
  COLORS.flagOnRed,
  COLORS.borderStrong,
  'none',
]);

describe('BadgeIcon', () => {
  it('has drawn art for every achievement in the catalogue', () => {
    // Derived from the catalogue: a badge added without art fails here instead
    // of quietly shipping the fallback star.
    const missing = ACHIEVEMENTS.filter(
      (a) => medal(a.id).getAttribute('data-badge-art') !== 'drawn'
    ).map((a) => a.id);
    expect(missing).toEqual([]);
  });

  it.each(ACHIEVEMENTS.map((a) => [a.id, a]))('draws %s as a decorative svg', (id, a) => {
    const svg = medal(id);
    expect(svg).toHaveAttribute('data-badge-icon', id);
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg).toHaveAttribute('viewBox', '0 0 64 64');
    // The emoji it replaced must not come back as text inside the art.
    expect(svg.textContent).not.toContain(a.icon);
  });

  it('paints only with flag tokens, set as CSS properties', () => {
    for (const a of ACHIEVEMENTS) {
      const svg = medal(a.id);
      for (const node of svg.querySelectorAll('*')) {
        // Presentation attributes cannot be trusted to resolve var(--…).
        expect(node.getAttribute('fill')).toBeNull();
        expect(node.getAttribute('stroke')).toBeNull();
        for (const paint of [node.style.fill, node.style.stroke]) {
          if (paint) expect(ALLOWED_PAINTS.has(paint), `${a.id}: ${paint}`).toBe(true);
        }
      }
    }
  });

  it('prints the count on the ribbon of a numbered badge', () => {
    expect(medal('streak7').textContent).toBe('7');
    expect(medal('vol1000').textContent).toBe('1000');
    expect(medal('words25').textContent).toBe('25');
    expect(medal('deck1').textContent).toBe('');
  });

  it('gives the families distinct silhouettes', () => {
    const shape = (id) => medal(id).firstElementChild.tagName.toLowerCase();
    expect(shape('streak3')).toBe('circle');
    expect(shape('vol100')).toBe('polygon');
    expect(shape('deck1')).toBe('path');
    expect(shape('quests10')).toBe('polygon');
  });

  it('falls back to a plain medal for an id it does not know', () => {
    const svg = medal('badge-from-the-future');
    expect(svg).toHaveAttribute('data-badge-art', 'fallback');
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders at the requested size', () => {
    const svg = medal('streak3', { size: 56 });
    expect(svg).toHaveAttribute('width', '56');
    expect(svg).toHaveAttribute('height', '56');
  });
});
