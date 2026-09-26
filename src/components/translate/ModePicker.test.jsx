import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModePicker from './ModePicker';
import { TRANSLATE_MODES } from './scaffold';
import { INPUT_MODES } from '../../lib/chatInputModes';

describe('ModePicker', () => {
  it('shows every Translate mode at once, most support first, with the current one pressed', () => {
    render(<ModePicker value={INPUT_MODES.WORD_BANK} onChange={() => {}} />);
    const group = screen.getByRole('group', { name: 'Input mode' });
    const buttons = within(group).getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual(TRANSLATE_MODES.map((m) => m.label));
    expect(buttons.filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Word tiles', pressed: true })).toBeInTheDocument();
  });

  it('reports the chosen mode key, and nothing for the one already on', async () => {
    const onChange = vi.fn();
    render(<ModePicker value={INPUT_MODES.WORD_BANK} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Word tiles' }));
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Type the word' }));
    expect(onChange).toHaveBeenCalledWith(INPUT_MODES.TYPED_BLANK);
  });

  it('opts every option into the app focus ring', () => {
    render(<ModePicker value={INPUT_MODES.WORD_BANK} onChange={() => {}} />);
    for (const b of screen.getAllByRole('button')) expect(b).toHaveAttribute('data-ui', 'button');
  });

  it('folds into two columns on a phone instead of wrapping four labels', () => {
    const { rerender } = render(
      <ModePicker value={INPUT_MODES.WORD_BANK} onChange={() => {}} mobile />
    );
    const group = () => screen.getByRole('group', { name: 'Input mode' });
    expect(group().style.gridTemplateColumns).toBe('repeat(2, minmax(0, 1fr))');
    rerender(<ModePicker value={INPUT_MODES.WORD_BANK} onChange={() => {}} />);
    expect(group().style.gridTemplateColumns).toBe(
      `repeat(${TRANSLATE_MODES.length}, minmax(0, 1fr))`
    );
  });

  it('leaves only free typing reachable when the sentence cannot be scaffolded', async () => {
    const onChange = vi.fn();
    render(<ModePicker value={INPUT_MODES.FREE_TEXT} onChange={onChange} locked />);
    const enabled = screen.getAllByRole('button').filter((b) => !b.disabled);
    expect(enabled.map((b) => b.textContent)).toEqual(['Free typing']);
    await userEvent.click(screen.getByRole('button', { name: 'Word tiles' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
