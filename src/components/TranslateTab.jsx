import { useState, useEffect, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import { COLORS, FONTS, FONT_SIZE, SPACE } from '../lib/theme';
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
import { defaultMode, toScaffold } from './translate/scaffold';
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

// One centred reading column — the same axis as the centred Hero above it —
// so on a wide screen the exercise sits under its title instead of hugging the
// left edge. `mobile` only tightens the prompt card and folds the mode track.
//
// LIFECYCLE CONTRACT: this component does NOT reset itself when `level`
// changes. The caller keys it by level (see App.jsx) so a switch mounts a
// fresh instance — `exercises`, `idx` and `correctAt` all initialise from the new
// bank in one go, with no window where a new `level` is paired with the old
// bank. That window is not cosmetic: the banks are differently shaped per
// level, so a mismatched pair throws inside the exercise components.
// Rendering this component without a `key` and switching `level` on a live
// instance is therefore a bug at the call site, not here.
export default function TranslateTab({
  level = 'a1',
  mobile = false,
  reviewTarget = null,
  onReviewConsumed,
}) {
  // Classified CEFR wins over the prop. App keys this component by `level`,
  // so a real switch remounts; this clamp is the engine gate for a caller
  // that still hands down b1 while deutsch-level is a1.
  const practiceLevel = clampMode(level, getUserLevel());
  const [exercises, setExercises] = useState(() => shuffle(BANK_MAP[practiceLevel] ?? BANK_MAP.a1));
  const [idx, setIdx] = useState(0);
  // Exercise indices answered right (or "almost"), for the progress strip.
  const [correctAt, setCorrectAt] = useState(() => new Set());
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

  const handleCorrect = () => setCorrectAt((prev) => new Set(prev).add(idx));

  const handleNext = useCallback(async () => {
    const next = idx + 1;
    if (next >= exercises.length) {
      setGenerating(true);
      try {
        const more = await generateMoreSentences(practiceLevel);
        setExercises((prev) => [...prev, ...more]);
      } catch {
        setExercises(shuffle(BANK_MAP[practiceLevel] ?? BANK_MAP.a1));
        setIdx(0);
        setCorrectAt(new Set());
        setGenerating(false);
        return;
      }
      setGenerating(false);
    }
    setIdx(next);
  }, [idx, exercises.length, practiceLevel]);

  const SET_SIZE = 10;
  const setIdx_ = idx % SET_SIZE;
  const setStart = idx - setIdx_;
  const correctInSet = new Set(
    [...correctAt].filter((i) => i >= setStart && i < setStart + SET_SIZE).map((i) => i - setStart)
  );

  // Switching level restarts the set, so tell the guard when there is
  // something to restart. Nothing here is persisted — no XP is awarded and
  // no SRS box moves — so the only thing at stake is position in the current
  // set of ten. That is worth one question, not a blocked control.
  useDirtySession(setIdx_ > 0 ? `exercise ${setIdx_ + 1} of ${SET_SIZE}` : null);

  if (generating) {
    return (
      <output
        style={{
          display: 'block',
          padding: `${SPACE[16]}px ${SPACE[4]}px`,
          textAlign: 'center',
          color: COLORS.mute,
        }}
      >
        <Sparkles size={28} aria-hidden="true" style={{ color: COLORS.accentFg }} />
        <p
          style={{
            margin: `${SPACE[4]}px 0 ${SPACE[1]}px`,
            fontFamily: FONTS.display,
            fontSize: FONT_SIZE['2xl'],
            color: COLORS.ink,
          }}
        >
          Writing new sentences…
        </p>
        <p style={{ margin: 0, fontFamily: FONTS.body, fontSize: FONT_SIZE.base }}>
          A fresh set of ten at your level is on its way.
        </p>
      </output>
    );
  }

  return (
    <div>
      <Hero
        align="center"
        kicker="Section 05"
        title="Übersetzen"
        sub="The app gives you a sentence. You translate it — from word tiles up to free typing. Your level picks the start; switch any time."
        srOnly={mobile}
      />
      <div style={{ marginTop: mobile ? 0 : SPACE[8], marginInline: 'auto', maxWidth: 720 }}>
        <ExerciseHeader
          level={practiceLevel}
          idx={setIdx_}
          total={SET_SIZE}
          correctAt={correctInSet}
          // itemId is the English prompt: these rows carry no id of their own
          // (the review feed already keys them by `en`). itemLabel is the
          // expected German, which is what triage needs to judge a "the AI
          // marked me wrong" report — and is never rendered, since at B1 it is
          // exactly what the learner is being asked to type.
          aside={
            <FeedbackButton
              context={{
                surface: 'translate',
                level: practiceLevel,
                itemId: exercise.en,
                itemLabel: exercise.de ?? null,
              }}
            />
          }
        />

        <PromptCard text={exercise.en} mobile={mobile} />

        <ModePicker value={shown} onChange={setMode} locked={!scaffold} mobile={mobile} />

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
