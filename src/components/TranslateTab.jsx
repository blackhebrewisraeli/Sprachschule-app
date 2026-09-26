import { useState, useEffect, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import { COLORS, FONTS, FONT_SIZE, LETTER_SPACING, SPACE, BORDER } from '../lib/theme';
import { activePack } from '../packs';
const {
  A1: TRANSLATE_SENTENCES_A1,
  A2: TRANSLATE_SENTENCES_A2,
  B1: TRANSLATE_SENTENCES_B1,
} = activePack.content.translateSentences;
import { shuffle } from '../lib/utils';
import { Hero } from './UI';
import ExerciseHeader from './translate/ExerciseHeader';
import FeedbackButton from './FeedbackButton';
import PromptCard from './translate/PromptCard';
import ScaffoldExercise from './translate/ScaffoldExercise';
import ModePicker from './translate/ModePicker';
import TypingExercise from './translate/TypingExercise';
import { TRANSLATE_MODES, defaultMode, toScaffold } from './translate/scaffold';
import { INPUT_MODES } from '../lib/chatInputModes';
import { generateMoreSentences } from './translate/generateSentences';
import { useDirtySession } from '../lib/sessionGuard';
import { clampMode } from '../lib/levelGate';
import { getUserLevel } from '../lib/levelPref';

// Module-level constant — avoids stale closure in useCallback/useEffect
const BANK_MAP = {
  a1: TRANSLATE_SENTENCES_A1,
  a2: TRANSLATE_SENTENCES_A2,
  b1: TRANSLATE_SENTENCES_B1,
};

// mobile prop accepted for API consistency; TranslateTab layout is already single-column
//
// LIFECYCLE CONTRACT: this component does NOT reset itself when `level`
// changes. The caller keys it by level (see App.jsx) so a switch mounts a
// fresh instance — `exercises`, `idx` and `score` all initialise from the new
// bank in one go, with no window where a new `level` is paired with the old
// bank. That window is not cosmetic: the banks are differently shaped per
// level, so a mismatched pair throws inside the exercise components.
// Rendering this component without a `key` and switching `level` on a live
// instance is therefore a bug at the call site, not here.
export default function TranslateTab({
  level = 'a1',
  mobile: _mobile = false,
  reviewTarget = null,
  onReviewConsumed,
}) {
  // Classified CEFR wins over the prop. App keys this component by `level`,
  // so a real switch remounts; this clamp is the engine gate for a caller
  // that still hands down b1 while deutsch-level is a1.
  const practiceLevel = clampMode(level, getUserLevel());
  const [exercises, setExercises] = useState(() => shuffle(BANK_MAP[practiceLevel] ?? BANK_MAP.a1));
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [generating, setGenerating] = useState(false);
  // How much help the learner wants: seeded by level, then theirs to change.
  // Kept across exercises; a switch mid-exercise re-renders the same sentence.
  const [mode, setMode] = useState(() => defaultMode(practiceLevel));

  // Pick up review targets handed in from the Stats Review feed.
  // App no longer rewrites classification to match the item; a leftover B1
  // review on an A1 learner is ignored here (context !== practiceLevel) and
  // the tab still opens at the classified mode.
  useEffect(() => {
    if (!reviewTarget) return;
    if (reviewTarget.context !== practiceLevel) return;
    const targetIdx = exercises.findIndex((e) => e.en === reviewTarget.label);
    if (targetIdx >= 0) setIdx(targetIdx);
    onReviewConsumed?.();
  }, [reviewTarget, practiceLevel, exercises, onReviewConsumed]);

  const exercise = exercises[idx];
  const scaffold = toScaffold(exercise);
  const shown = scaffold ? mode : INPUT_MODES.FREE_TEXT;
  const modeLabel = TRANSLATE_MODES.find((m) => m.key === shown).label;

  const handleCorrect = () => setScore((s) => s + 1);

  const handleNext = useCallback(async () => {
    const next = idx + 1;
    if (next >= exercises.length) {
      setGenerating(true);
      try {
        const more = await generateMoreSentences(practiceLevel);
        setExercises((prev) => [...prev, ...more]);
        setScore(0);
      } catch {
        setExercises(shuffle(BANK_MAP[practiceLevel] ?? BANK_MAP.a1));
        setIdx(0);
        setScore(0);
        setGenerating(false);
        return;
      }
      setGenerating(false);
    }
    setIdx(next);
  }, [idx, exercises.length, practiceLevel]);

  const SET_SIZE = 10;
  const setIdx_ = idx % SET_SIZE;

  // Switching level restarts the set, so tell the guard when there is
  // something to restart. Nothing here is persisted — no XP is awarded and
  // no SRS box moves — so the only thing at stake is position in the current
  // set of ten. That is worth one question, not a blocked control.
  useDirtySession(setIdx_ > 0 ? `exercise ${setIdx_ + 1} of ${SET_SIZE}` : null);

  if (generating) {
    return (
      <div
        style={{
          padding: SPACE[8],
          textAlign: 'center',
          fontFamily: FONTS.mono,
          fontSize: FONT_SIZE.base,
          letterSpacing: LETTER_SPACING.widest,
          color: COLORS.mute,
        }}
      >
        <Sparkles size={24} style={{ marginBottom: SPACE[4], color: COLORS.accentFg }} />
        <div>GENERATING NEW EXERCISES...</div>
      </div>
    );
  }

  return (
    <div>
      <Hero
        kicker="Section 05"
        title="Übersetzen"
        sub="The app gives you a sentence. You translate it — from word tiles up to free typing. Your level picks the start; switch any time."
      />
      <div style={{ marginTop: SPACE[8], maxWidth: 760 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[2] }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <ExerciseHeader
              level={practiceLevel}
              label={modeLabel}
              idx={setIdx_}
              total={SET_SIZE}
            />
          </div>
          {/* itemId is the English prompt: these rows carry no id of their own
            (the review feed already keys them by `en`). itemLabel is the
            expected German, which is what triage needs to judge a "the AI
            marked me wrong" report — and is never rendered, since at B1 it is
            exactly what the learner is being asked to type. */}
          <FeedbackButton
            context={{
              surface: 'translate',
              level: practiceLevel,
              itemId: exercise.en,
              itemLabel: exercise.de ?? null,
            }}
          />
        </div>

        <div
          style={{
            height: 4,
            background: COLORS.paperDeep,
            border: BORDER.standard,
            marginBottom: SPACE[5],
          }}
        >
          <div
            style={{
              height: '100%',
              background: COLORS.gold,
              width: `${Math.min((score / SET_SIZE) * 100, 100)}%`,
              transition: 'width 0.4s ease',
            }}
          />
        </div>

        <PromptCard text={exercise.en} />

        <ModePicker value={mode} onChange={setMode} />

        {shown === INPUT_MODES.FREE_TEXT ? (
          <TypingExercise
            key={idx}
            exercise={exercise}
            level={practiceLevel}
            onCorrect={handleCorrect}
            onSkip={handleNext}
          />
        ) : (
          <ScaffoldExercise
            key={`${idx}-${shown}`}
            exercise={exercise}
            scaffold={scaffold}
            mode={shown}
            level={practiceLevel}
            onCorrect={handleCorrect}
            onSkip={handleNext}
            onSwitchToTyping={() => setMode(INPUT_MODES.FREE_TEXT)}
          />
        )}
      </div>
    </div>
  );
}
