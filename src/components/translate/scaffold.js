import { INPUT_MODES, parseScaffold } from '../../lib/chatInputModes';
import { LEVEL_MODES } from '../../lib/levelPref';

const { WORD_BANK, CHOICE_BLANK, TYPED_BLANK, FREE_TEXT } = INPUT_MODES;

/** Chat's scaffold ladder, most support first, captioned for Translate. */
export const TRANSLATE_MODES = Object.freeze([
  { key: WORD_BANK, label: LEVEL_MODES.a1.label },
  { key: CHOICE_BLANK, label: LEVEL_MODES.a2.label },
  { key: TYPED_BLANK, label: 'Type the word' },
  { key: FREE_TEXT, label: LEVEL_MODES.b1.label },
]);

// Each level opens on the mode it had before the toggle existed, so the level
// switchers' LEVEL_MODES captions still describe what the learner lands on.
const DEFAULT_MODE = Object.freeze({ a1: WORD_BANK, a2: CHOICE_BLANK, b1: FREE_TEXT });

export function defaultMode(level) {
  return DEFAULT_MODE[level] ?? WORD_BANK;
}

/**
 * Any Translate row — a bank row of any level, or a generated one — as the
 * scaffold Chat's WordBank and FillBlank render. A2 rows gap their first
 * blank. Null when the row cannot be scaffolded; the caller falls back to
 * free typing, exactly as Chat does for an unusable suggestion.
 */
export function toScaffold(row) {
  const gap = row?.blanks?.[0];
  return parseScaffold({
    en: row?.en,
    de: row?.de,
    blank: row?.blank ?? gap?.word,
    distractors: row?.distractors ?? gap?.distractors,
  });
}
