import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ScaffoldExercise from './ScaffoldExercise';
import { toScaffold } from './scaffold';
import { INPUT_MODES } from '../../lib/chatInputModes';

const exercise = {
  en: 'I am tired.',
  de: 'Ich bin müde.',
  blank: 'bin',
  distractors: ['habe'],
  note: 'sein (to be): ich bin',
};

function renderMode(mode) {
  const handlers = { onCorrect: vi.fn(), onSkip: vi.fn(), onSwitchToTyping: vi.fn() };
  render(
    <ScaffoldExercise
      exercise={exercise}
      scaffold={toScaffold(exercise)}
      mode={mode}
      level="a1"
      {...handlers}
    />
  );
  return handlers;
}

const check = () => userEvent.click(screen.getByRole('button', { name: 'Check answer' }));

describe('ScaffoldExercise — word bank', () => {
  beforeEach(() => localStorage.clear());

  it('offers every token plus the distractor as a tile', () => {
    renderMode(INPUT_MODES.WORD_BANK);
    for (const w of ['Ich', 'bin', 'müde.', 'habe']) {
      expect(screen.getByRole('button', { name: w })).toBeInTheDocument();
    }
  });

  it('grades the sentence in order as correct', async () => {
    const { onCorrect } = renderMode(INPUT_MODES.WORD_BANK);
    for (const w of ['Ich', 'bin', 'müde.']) {
      await userEvent.click(screen.getByRole('button', { name: w }));
    }
    await check();
    expect(onCorrect).toHaveBeenCalledTimes(1);
    expect(screen.getByText('✓ CORRECT')).toBeInTheDocument();
  });

  it('shows the German on a wrong assembly and never calls onCorrect', async () => {
    const { onCorrect } = renderMode(INPUT_MODES.WORD_BANK);
    for (const w of ['Ich', 'habe', 'müde.']) {
      await userEvent.click(screen.getByRole('button', { name: w }));
    }
    await check();
    expect(onCorrect).not.toHaveBeenCalled();
    expect(screen.getByText('✗ NOT QUITE')).toBeInTheDocument();
    expect(screen.getByText('Ich bin müde.')).toBeInTheDocument();
  });

  it('hands "Type instead" to the caller', async () => {
    const { onSwitchToTyping } = renderMode(INPUT_MODES.WORD_BANK);
    await userEvent.click(screen.getByRole('button', { name: 'Type instead' }));
    expect(onSwitchToTyping).toHaveBeenCalledTimes(1);
  });
});

describe('ScaffoldExercise — gap modes', () => {
  beforeEach(() => localStorage.clear());

  it('grades a chosen word', async () => {
    const { onCorrect } = renderMode(INPUT_MODES.CHOICE_BLANK);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Missing word' }), 'bin');
    await check();
    expect(onCorrect).toHaveBeenCalledTimes(1);
  });

  it('marks a wrong choice wrong', async () => {
    const { onCorrect } = renderMode(INPUT_MODES.CHOICE_BLANK);
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Missing word' }), 'habe');
    await check();
    expect(onCorrect).not.toHaveBeenCalled();
    expect(screen.getByText('✗ NOT QUITE')).toBeInTheDocument();
  });

  // Typed words are compared case-folded, as the old A2 blanks were: a
  // capital is not the point of a gap exercise.
  it('grades a typed word case-insensitively', async () => {
    const { onCorrect } = renderMode(INPUT_MODES.TYPED_BLANK);
    await userEvent.type(screen.getByRole('textbox', { name: 'Missing word' }), 'BIN');
    await check();
    expect(onCorrect).toHaveBeenCalledTimes(1);
  });

  it('skips', async () => {
    const { onSkip } = renderMode(INPUT_MODES.TYPED_BLANK);
    await userEvent.click(screen.getByRole('button', { name: 'Skip exercise' }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
