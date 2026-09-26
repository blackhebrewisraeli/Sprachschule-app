import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TranslateTab from './TranslateTab';
import { setUserLevel } from '../lib/levelPref';
import { INPUT_MODES } from '../lib/chatInputModes';

// Each level renders a different exercise component off a differently shaped
// row (A1 `words`, A2 `template`, B1 free text), so a `level` that has moved
// ahead of `exercises` hands BlankExercise an A1 row and throws on
// `exercise.template.split`.
//
// The fix is a lifecycle contract, not logic inside this component: App.jsx
// renders it as `<TranslateTab key={level} …>`, so a switch remounts. These
// tests model that caller by rerendering with the key changed — a bare
// `level` prop change on a live instance is a call-site bug and is not
// something this component defends against. The end-to-end guarantee (the
// header control actually driving this tab) is asserted in App.test.jsx
// under "level coordination".
//
// Phase 2: the classified CEFR code wins over the prop. Each case writes
// deutsch-level to match the mode under test, then a separate case proves
// a b1 prop on an a1 learner still mounts tiles.
describe('TranslateTab — remounted per level, as the caller keys it', () => {
  beforeEach(() => {
    localStorage.clear();
    setUserLevel('a1');
  });

  it.each([
    ['a1', 'a2'],
    ['a2', 'a1'],
    ['a1', 'b1'],
    ['b1', 'a2'],
    ['a2', 'b1'],
    ['b1', 'a1'],
  ])('survives %s -> %s without a bank/level mismatch', (from, to) => {
    setUserLevel(from);
    const { rerender } = render(<TranslateTab key={from} level={from} />);
    setUserLevel(to);
    expect(() => rerender(<TranslateTab key={to} level={to} />)).not.toThrow();
  });

  it('renders the new level header immediately after the switch', () => {
    setUserLevel('a1');
    const { rerender } = render(<TranslateTab key="a1" level="a1" />);
    expect(screen.getByText(/A1 — WORD TILES/)).toBeInTheDocument();
    setUserLevel('a2');
    rerender(<TranslateTab key="a2" level="a2" />);
    expect(screen.getByText(/A2 — FILL THE BLANKS/)).toBeInTheDocument();
    expect(screen.queryByText(/A1 — WORD TILES/)).toBeNull();
  });

  it('starts every level at exercise 1 of the set', () => {
    setUserLevel('a1');
    const { rerender } = render(<TranslateTab key="a1" level="a1" />);
    expect(screen.getByText(/Exercise 1 \/ 10/)).toBeInTheDocument();
    setUserLevel('b1');
    rerender(<TranslateTab key="b1" level="b1" />);
    expect(screen.getByText(/Exercise 1 \/ 10/)).toBeInTheDocument();
  });

  // Positive control: without it, a green suite above proves nothing if the
  // header stopped rendering entirely.
  it('renders a mode header at all', () => {
    setUserLevel('b1');
    render(<TranslateTab level="b1" />);
    expect(screen.getByText(/B1 — FREE TYPING/)).toBeInTheDocument();
  });

  // Mounting each level standalone is what a keyed remount actually does.
  // Pins that no level is broken on a cold mount, which the rerender cases
  // above would not catch if `render` and `rerender` ever diverged.
  it.each(['a1', 'a2', 'b1'])('mounts %s cleanly from cold', (level) => {
    setUserLevel(level);
    expect(() => render(<TranslateTab level={level} />)).not.toThrow();
  });
});

describe('TranslateTab — classified CEFR gates the mode', () => {
  beforeEach(() => {
    localStorage.clear();
    setUserLevel('a1');
  });

  it('renders A1 tiles when classified A1 even if the prop asks for B1', () => {
    render(<TranslateTab level="b1" />);
    expect(screen.getByText(/A1 — WORD TILES/)).toBeInTheDocument();
    expect(screen.queryByText(/B1 — FREE TYPING/)).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('renders A1 tiles when classified A1 even if the prop asks for A2 blanks', () => {
    render(<TranslateTab level="a2" />);
    expect(screen.getByText(/A1 — WORD TILES/)).toBeInTheDocument();
    expect(screen.queryByText(/A2 — FILL THE BLANKS/)).toBeNull();
  });

  it('lets a classified B1 learner run free typing', () => {
    setUserLevel('b1');
    render(<TranslateTab level="b1" />);
    expect(screen.getByText(/B1 — FREE TYPING/)).toBeInTheDocument();
  });
});

describe('TranslateTab — input mode toggle', () => {
  beforeEach(() => {
    localStorage.clear();
    setUserLevel('a1');
  });

  const modeSelect = () => screen.getByRole('combobox', { name: 'Input mode' });
  const prompt = () => screen.getByText('TRANSLATE TO GERMAN').nextSibling.textContent;

  it('lets an A1 learner move from word tiles to free typing on the same sentence', async () => {
    render(<TranslateTab level="a1" />);
    const before = prompt();
    expect(screen.getByRole('group', { name: 'Word bank' })).toBeInTheDocument();

    await userEvent.selectOptions(modeSelect(), 'Free typing');

    expect(screen.getByText(/A1 — FREE TYPING/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Your German translation' })).toBeInTheDocument();
    expect(prompt()).toBe(before);
  });

  it('offers a B1 learner the gap modes on B1 sentences', async () => {
    setUserLevel('b1');
    render(<TranslateTab level="b1" />);
    await userEvent.selectOptions(modeSelect(), 'Type the word');
    expect(screen.getByText(/B1 — TYPE THE WORD/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Missing word' })).toBeInTheDocument();
  });

  it('switches to free typing from the word bank’s "Type instead"', async () => {
    render(<TranslateTab level="a1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Type instead' }));
    expect(modeSelect()).toHaveValue(INPUT_MODES.FREE_TEXT);
    expect(screen.getByRole('textbox', { name: 'Your German translation' })).toBeInTheDocument();
  });
});
