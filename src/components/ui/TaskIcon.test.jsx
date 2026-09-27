import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import TaskIcon from './TaskIcon';
import { activePack } from '../../packs';
import appSource from '../../App.jsx?raw';

const glyph = (name) => render(<TaskIcon name={name} />).container.querySelector('svg');

// Derived from the pack, so a mission, quest or fallback added with an emoji
// or a misspelt key fails here instead of shipping an empty icon slot.
const { missions, quests, homeChrome } = activePack.content;
const PACK_ICONS = [
  ...Object.entries(missions).map(([id, m]) => [`mission ${id}`, m.icon]),
  ...Object.entries(quests).map(([id, q]) => [`quest ${id}`, q.icon]),
  ...homeChrome.recommendedFallbacks.map((f) => [`fallback ${f.id}`, f.icon]),
  ['quest done state', 'done'],
];

// Every toast App.jsx raises names its icon as `icon: '<key>'`. Read from the
// source, so a new toast with an emoji or a misspelt key fails here instead of
// shipping a toast with an empty icon slot.
const TOAST_ICONS = [...appSource.matchAll(/\bicon: '([^']+)'/g)].map((m) => [
  `toast ${m[1]}`,
  m[1],
]);

describe('TaskIcon', () => {
  it('covers a known number of pack icons', () => {
    // Denominator: an empty pack and a fully covered one both pass the loop.
    expect(PACK_ICONS.length).toBeGreaterThan(15);
  });

  it('finds every toast icon App.jsx raises', () => {
    // star, target, snowflake, flame, trophy, zap, rocket, info, done.
    expect(TOAST_ICONS.length).toBeGreaterThanOrEqual(9);
  });

  it.each([...PACK_ICONS, ...TOAST_ICONS])('draws %s (%s) as a decorative svg', (_, name) => {
    const svg = glyph(name);
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute('data-task-icon', name);
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    // Lucide strokes with currentColor, so the row's ink colours the glyph.
    expect(svg).toHaveAttribute('stroke', 'currentColor');
  });

  it('renders nothing for a key it has no glyph for', () => {
    expect(glyph('🎯')).toBeNull();
  });
});
