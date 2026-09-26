import { describe, it, expect } from 'vitest';
import { activePack } from '../../packs';
import { INPUT_MODES } from '../../lib/chatInputModes';
import { TRANSLATE_MODES, defaultMode, toScaffold } from './scaffold';

const { A1, A2, B1 } = activePack.content.translateSentences;
const rows = [...A1, ...A2, ...B1];

describe('toScaffold', () => {
  // The toggle offers every mode on every row, so a row that cannot be gapped
  // silently drops the learner to free typing. Checking the answer — not just
  // non-null — also catches a gap that lands on an earlier copy of the word
  // ("Die Kinder, die …" gapping the article instead of the pronoun).
  it.each(rows.map((r) => [r.en, r]))('gaps "%s" on its named word', (_en, row) => {
    const scaffold = toScaffold(row);
    expect(scaffold).not.toBeNull();
    expect(scaffold.answer).toBe(row.blank ?? row.blanks[0].word);
    expect(scaffold.tokens.join(' ')).toBe(row.de);
  });

  it('gaps an A2 row on its first blank with that blank’s distractors', () => {
    const row = A2[0];
    expect(toScaffold(row)).toMatchObject({
      answer: row.blanks[0].word,
      distractors: row.blanks[0].distractors,
    });
  });

  it('takes a generated row in Chat’s own `next` shape', () => {
    expect(
      toScaffold({ en: 'I eat.', de: 'Ich esse.', blank: 'esse', distractors: ['isst'] })
    ).toMatchObject({ answer: 'esse', blankIndex: 1 });
  });

  it.each([
    ['no distractors', { en: 'Hi.', de: 'Hallo Welt.', blank: 'Welt' }],
    ['a blank missing from the sentence', { de: 'Hallo.', blank: 'Welt', distractors: ['x'] }],
    ['nothing at all', undefined],
  ])('returns null for %s', (_why, row) => {
    expect(toScaffold(row)).toBeNull();
  });
});

describe('defaultMode', () => {
  it.each([
    ['a1', INPUT_MODES.WORD_BANK],
    ['a2', INPUT_MODES.CHOICE_BLANK],
    ['b1', INPUT_MODES.FREE_TEXT],
    ['zz', INPUT_MODES.WORD_BANK],
  ])('opens %s on %s', (level, mode) => {
    expect(defaultMode(level)).toBe(mode);
  });

  it('opens every level on a mode the toggle offers', () => {
    const keys = TRANSLATE_MODES.map((m) => m.key);
    for (const level of ['a1', 'a2', 'b1']) expect(keys).toContain(defaultMode(level));
  });
});
