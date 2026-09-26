import { useState } from 'react';
import { SkipForward } from 'lucide-react';
import { BUTTON, SPACE } from '../../lib/theme';
import { INPUT_MODES } from '../../lib/chatInputModes';
import { recordEvent, recordItem } from '../../lib/stats';
import { exactMatch } from '../../lib/matching';
import WordBank from '../chat/WordBank';
import FillBlank from '../chat/FillBlank';
import FeedbackPanel from './FeedbackPanel';

/**
 * The three scaffolded Translate modes, on Chat's own composers: build the
 * sentence from a word bank, or complete it by choosing / typing the missing
 * word. Both composers hand back the whole sentence, graded locally against
 * the row's German.
 *
 * ponytail: exact match accepts only the row's word order. German often allows
 * another (Gestern bin ich… / Ich bin gestern…); AI-grade the word bank like
 * free typing if learners report correct answers marked wrong.
 */
export default function ScaffoldExercise({
  exercise,
  scaffold,
  mode,
  level,
  onCorrect,
  onSkip,
  onSwitchToTyping,
}) {
  const [result, setResult] = useState(null);

  const check = (sentence) => {
    const verdict = exactMatch(scaffold.tokens.join(' '), sentence) ? 'correct' : 'wrong';
    const { xp, mult } = recordEvent('translate', level, verdict);
    recordItem('translate', level, exercise.en, exercise.de, verdict);
    setResult({ verdict, xp, mult });
    if (verdict === 'correct') onCorrect();
  };

  if (result) {
    return (
      <FeedbackPanel
        verdict={result.verdict}
        correctText={exercise.de}
        note={exercise.note}
        xp={result.xp}
        mult={result.mult}
        onNext={onSkip}
      />
    );
  }

  const composer = { thinking: false, onSend: check, onSwitchToTyping, sendLabel: 'Check answer' };
  return (
    <div style={{ display: 'grid', gap: SPACE[3], minWidth: 0 }}>
      {mode === INPUT_MODES.WORD_BANK ? (
        <WordBank words={[...scaffold.tokens, ...scaffold.distractors]} {...composer} />
      ) : (
        <FillBlank
          mode={mode === INPUT_MODES.CHOICE_BLANK ? 'choice' : 'typed'}
          scaffold={scaffold}
          {...composer}
        />
      )}
      <button
        type="button"
        onClick={onSkip}
        aria-label="Skip exercise"
        style={{ ...BUTTON.secondary, justifySelf: 'end', padding: `${SPACE[3]}px ${SPACE[4]}px` }}
      >
        <SkipForward size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
