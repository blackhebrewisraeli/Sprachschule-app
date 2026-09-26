import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ModePicker from './ModePicker';
import { TRANSLATE_MODES } from './scaffold';
import { INPUT_MODES } from '../../lib/chatInputModes';
import { FIELD } from '../../lib/theme';

describe('ModePicker', () => {
  it('offers every Translate mode, most support first', () => {
    render(<ModePicker value={INPUT_MODES.WORD_BANK} onChange={() => {}} />);
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(TRANSLATE_MODES.map((m) => m.label));
    expect(screen.getByRole('combobox', { name: 'Input mode' })).toHaveValue(INPUT_MODES.WORD_BANK);
  });

  it('reports the chosen mode key', async () => {
    const onChange = vi.fn();
    render(<ModePicker value={INPUT_MODES.WORD_BANK} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByRole('combobox'), 'Type the word');
    expect(onChange).toHaveBeenCalledWith(INPUT_MODES.TYPED_BLANK);
  });

  it('keeps the caption in its own element, never as bare text beside the select', () => {
    // Bare JSX text followed by <select> on the next line compiles to
    // "Mode<select>" with no space — SonarCloud's "ambiguous spacing" smell.
    render(<ModePicker value={INPUT_MODES.WORD_BANK} onChange={() => {}} />);
    const label = screen.getByText('Mode').closest('label');
    const bareText = [...label.childNodes].filter(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim()
    );
    expect(bareText).toHaveLength(0);
  });

  it('draws the select with the shared field recipe', () => {
    render(<ModePicker value={INPUT_MODES.WORD_BANK} onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toHaveStyle({
      fontSize: `${FIELD.fontSize}px`,
      borderRadius: `${FIELD.borderRadius}px`,
    });
  });
});
