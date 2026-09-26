import { useState, useEffect, useRef } from 'react';
import { Volume2 } from 'lucide-react';
import {
  COLORS,
  FONTS,
  FONT_SIZE,
  FONT_WEIGHT,
  LETTER_SPACING,
  SPACE,
  RADIUS,
  SHADOW,
  BUTTON,
} from '../lib/theme';
import { speak } from '../lib/speech';
import { activePack } from '../packs';
const { alphabet: ALPHABET, alphabetQuiz: ALPHABET_QUIZ_GROUPS } = activePack.content;
import { shuffle } from '../lib/utils';
import { recordEvent, recordItem } from '../lib/stats';
import { Hero } from './UI';

export default function AlphabetTab({
  level,
  mobile = false,
  reviewTarget = null,
  onReviewConsumed,
}) {
  // ── Browse mode state ──────────────────────────────────────────
  const [selected, setSelected] = useState(null);

  // ── Quiz mode state ────────────────────────────────────────────
  const [mode, setMode] = useState('quiz');
  const [quizRound, setQuizRound] = useState(0);
  const [quizSeed, setQuizSeed] = useState(0); // bump to force quiz re-setup
  const [quizGroup, setQuizGroup] = useState(null);
  const [quizTarget, setQuizTarget] = useState(null);
  const [quizResult, setQuizResult] = useState(null); // null | 'correct' | 'wrong'
  // Whether the target has been played THIS round. Nothing plays on its own, so
  // the button and its caption have to say "hear it" the first time and "hear
  // it again" afterwards — a round that opens on "TAP TO HEAR AGAIN" is asking
  // the learner to repeat something they were never played.
  const [played, setPlayed] = useState(false);
  const [score, setScore] = useState({ correct: 0, total: 0 });
  const [shuffledLetters, setShuffledLetters] = useState([]);
  // A pending review target letter — consumed by the quiz-setup effect below.
  const forcedTargetRef = useRef(null);

  // Start a quiz round whenever quizRound changes (and mode is quiz).
  // If forcedTargetRef is set (review tap), pick the group containing it
  // instead of the round-based default.
  useEffect(() => {
    if (mode !== 'quiz') return;
    const forced = forcedTargetRef.current;
    let group, target;
    if (forced) {
      const idx = ALPHABET_QUIZ_GROUPS.findIndex((g) => g.letters.includes(forced));
      if (idx >= 0) {
        group = ALPHABET_QUIZ_GROUPS[idx];
        target = forced;
      }
      forcedTargetRef.current = null;
    }
    if (!group) {
      group = ALPHABET_QUIZ_GROUPS[quizRound % ALPHABET_QUIZ_GROUPS.length];
      target = group.letters[Math.floor(Math.random() * group.letters.length)];
    }
    setQuizGroup(group);
    setQuizTarget(target);
    setQuizResult(null);
    setPlayed(false);
    setShuffledLetters(shuffle(group.letters));
  }, [mode, quizRound, quizSeed]);

  // Pick up review targets handed in from the Stats Review feed.
  useEffect(() => {
    if (!reviewTarget) return;
    const present = ALPHABET_QUIZ_GROUPS.some((g) => g.letters.includes(reviewTarget.label));
    if (!present) {
      onReviewConsumed?.();
      return;
    }
    forcedTargetRef.current = reviewTarget.label;
    setMode('quiz');
    setQuizSeed((s) => s + 1);
    onReviewConsumed?.();
  }, [reviewTarget, onReviewConsumed]);

  const handleModeChange = (newMode) => {
    setMode(newMode);
    // Returning to the quiz clears the previous verdict but does NOT speak.
    // Sound in this app only ever follows a press of the play button.
    if (newMode === 'quiz') setQuizResult(null);
  };

  const playTarget = () => {
    speak(quizTarget);
    setPlayed(true);
  };

  const handleLetterGuess = (letter) => {
    if (quizResult) return; // already answered
    const correct = letter === quizTarget;
    const verdict = correct ? 'correct' : 'wrong';
    setQuizResult(verdict);
    setScore((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }));
    recordEvent('alphabet', level, verdict);
    const entry = ALPHABET.find((a) => a.l === quizTarget);
    recordItem('alphabet', '', quizTarget, entry ? `${entry.w} — ${entry.e}` : quizTarget, verdict);
  };

  const handleNextRound = () => {
    setQuizRound((r) => r + 1);
  };

  const handleBrowseTap = (letter) => {
    setSelected(letter);
    speak(letter.l + '. ' + letter.w);
  };

  // ── Shared styles ──────────────────────────────────────────────
  const modeToggleBtn = (m) => ({
    padding: `${SPACE[3]}px ${SPACE[6]}px`,
    background: mode === m ? COLORS.ink : 'transparent',
    color: mode === m ? COLORS.paper : COLORS.ink,
    border: 'none',
    fontFamily: FONTS.mono,
    fontSize: FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.bold,
    letterSpacing: LETTER_SPACING.widest,
    cursor: 'pointer',
    textTransform: 'uppercase',
  });

  return (
    <div>
      {/* Centred like Vocab and Translate: one axis for every practice tab's
          title and its mode switch. The letter grid below is full measure. */}
      <Hero
        align="center"
        kicker="Section 03"
        title="Das Alphabet"
        sub="Browse all letters or test your ear — can you identify what you heard?"
      />

      {/* Mode toggle */}
      <div
        style={{
          display: 'flex',
          borderRadius: RADIUS.md,
          boxShadow: SHADOW.card,
          overflow: 'hidden',
          width: 'fit-content',
          marginLeft: 'auto',
          marginRight: 'auto',
          // The rhythm rule: the gap between a tab's Hero and its first
          // content block is SPACE[8]. Alphabet was the only tab that
          // disagreed (spec §3.5, §4.3).
          marginTop: SPACE[8],
          marginBottom: SPACE[6],
        }}
      >
        <button
          type="button"
          style={modeToggleBtn('quiz')}
          onClick={() => handleModeChange('quiz')}
          aria-pressed={mode === 'quiz'}
        >
          🎧 Quiz
        </button>
        <button
          type="button"
          style={modeToggleBtn('browse')}
          onClick={() => handleModeChange('browse')}
          aria-pressed={mode === 'browse'}
        >
          📋 Browse
        </button>
      </div>

      {/* ── QUIZ MODE ────────────────────────────────────────── */}
      {mode === 'quiz' && quizGroup && quizTarget && (
        <div style={{ maxWidth: 480, margin: '0 auto', textAlign: 'center' }}>
          <div
            style={{
              fontFamily: FONTS.mono,
              fontSize: FONT_SIZE.tag,
              letterSpacing: LETTER_SPACING.caps,
              color: COLORS.mute,
              marginBottom: SPACE[5],
            }}
          >
            ROUND {quizRound + 1} · SCORE {score.correct}/{score.total} · LISTEN, THEN PICK THE
            LETTER
          </div>

          {/* Play button — the only thing in this tab that makes a sound. An
              icon-sized control inline with its instruction, not a 100px disc:
              the four letters below are the task, the speaker is just how you
              start it. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: SPACE[3],
              marginBottom: SPACE[6],
            }}
          >
            <button
              type="button"
              onClick={playTarget}
              aria-label={played ? 'Play the letter again' : 'Play the letter'}
              style={{
                width: SPACE[12],
                height: SPACE[12],
                flexShrink: 0,
                borderRadius: '50%',
                background: COLORS.gold,
                // Gold is the accent FILL; its ink is accentOn, never plain ink.
                color: COLORS.accentOn,
                border: 'none',
                boxShadow: SHADOW.press(COLORS.goldLip),
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'transform .08s ease, box-shadow .08s ease',
              }}
            >
              <Volume2 size={FONT_SIZE.lg} aria-hidden="true" />
            </button>
            <span
              style={{
                fontFamily: FONTS.mono,
                fontSize: FONT_SIZE.sm,
                letterSpacing: LETTER_SPACING.widest,
                color: COLORS.mute,
              }}
            >
              {played ? 'TAP TO HEAR AGAIN' : 'TAP TO HEAR THE LETTER'}
            </span>
          </div>

          {/* Four letter options */}
          {!quizResult && (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                gap: SPACE[3],
              }}
            >
              {shuffledLetters.map((letter) => (
                <button
                  key={letter}
                  type="button"
                  onClick={() => handleLetterGuess(letter)}
                  aria-label={`Select letter ${letter}`}
                  style={{
                    padding: SPACE[5],
                    border: 'none',
                    borderRadius: RADIUS.lg,
                    boxShadow: SHADOW.press(COLORS.lip),
                    background: COLORS.card,
                    color: COLORS.ink,
                    fontFamily: FONTS.display,
                    fontSize: FONT_SIZE['5xl'],
                    fontWeight: FONT_WEIGHT.bold,
                    cursor: 'pointer',
                    transition: 'transform .08s ease, box-shadow .08s ease',
                  }}
                >
                  {letter}
                </button>
              ))}
            </div>
          )}

          {/* Feedback */}
          {quizResult && (
            <div
              className={quizResult === 'wrong' ? 'wiggle' : 'pop'}
              style={{
                borderRadius: RADIUS.lg,
                boxShadow: SHADOW.card,
                background: quizResult === 'correct' ? COLORS.gold : COLORS.red,
                color: quizResult === 'correct' ? COLORS.accentOn : COLORS.paper,
                padding: SPACE[5],
                marginTop: SPACE[4],
              }}
            >
              <div
                style={{
                  fontFamily: FONTS.display,
                  fontSize: FONT_SIZE['3xl'],
                  fontWeight: FONT_WEIGHT.bold,
                  marginBottom: SPACE[2],
                }}
              >
                {quizResult === 'correct' ? `✓ ${quizTarget}` : `✗ It was: ${quizTarget}`}
              </div>
              {quizResult === 'wrong' &&
                (() => {
                  const entry = ALPHABET.find((a) => a.l === quizTarget);
                  return entry ? (
                    <div
                      style={{
                        fontFamily: FONTS.body,
                        fontStyle: 'italic',
                        fontSize: FONT_SIZE.base,
                        opacity: 0.9,
                        marginBottom: SPACE[4],
                      }}
                    >
                      Example word: {entry.w} ({entry.e})
                    </div>
                  ) : null;
                })()}
              <button
                type="button"
                onClick={handleNextRound}
                style={{
                  ...BUTTON.primary,
                  background: quizResult === 'correct' ? COLORS.ink : COLORS.paper,
                  color: quizResult === 'correct' ? COLORS.paper : COLORS.ink,
                }}
              >
                NEXT ROUND →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── BROWSE MODE ──────────────────────────────────────── */}
      {mode === 'browse' && (
        <>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: mobile
                ? 'repeat(4, minmax(0, 1fr))'
                : 'repeat(6, minmax(0, 1fr))',
              gap: 0,
              borderRadius: RADIUS.lg,
              boxShadow: SHADOW.card,
              overflow: 'hidden',
            }}
          >
            {ALPHABET.map((letter, i) => {
              const isActive = selected?.l === letter.l;
              const isSpecial = Boolean(letter.special);
              return (
                <button
                  key={letter.l}
                  type="button"
                  onClick={() => handleBrowseTap(letter)}
                  aria-label={`Select letter ${letter.l} for details`}
                  style={{
                    aspectRatio: '1',
                    background: isActive ? COLORS.red : isSpecial ? COLORS.paperDeep : COLORS.paper,
                    color: isActive ? COLORS.paper : COLORS.ink,
                    border: 'none',
                    borderRight: (i + 1) % 6 === 0 ? 'none' : `1px solid ${COLORS.inkA12}`,
                    borderBottom:
                      i >= ALPHABET.length - (ALPHABET.length % 6 || 6)
                        ? 'none'
                        : `1px solid ${COLORS.inkA12}`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    transition: 'all 0.15s',
                    cursor: 'pointer',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: 8,
                      left: 10,
                      fontFamily: FONTS.mono,
                      fontSize: FONT_SIZE.label,
                      opacity: 0.5,
                    }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span
                    style={{
                      fontFamily: FONTS.display,
                      fontSize: FONT_SIZE['6xl'],
                      fontWeight: FONT_WEIGHT.bold,
                      lineHeight: 1,
                      letterSpacing: LETTER_SPACING.tight,
                    }}
                  >
                    {letter.l}
                  </span>
                  <span
                    style={{
                      fontFamily: FONTS.body,
                      fontSize: FONT_SIZE.sm,
                      fontStyle: 'italic',
                      marginTop: SPACE[1],
                      opacity: 0.8,
                    }}
                  >
                    {letter.w}
                  </span>
                </button>
              );
            })}
          </div>

          {selected && (
            <div
              style={{
                marginTop: SPACE[8],
                padding: SPACE[8],
                background: COLORS.ink,
                color: COLORS.paper,
                borderRadius: RADIUS.lg,
                boxShadow: SHADOW.card,
                display: 'grid',
                // minmax(0, …) so the track can shrink below its content's
                // min-content width instead of widening the page (see ChatTab).
                gridTemplateColumns: mobile ? 'minmax(0, 1fr)' : '200px minmax(0, 1fr) auto',
                gap: SPACE[8],
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  fontFamily: FONTS.display,
                  fontSize: mobile ? 80 : 180,
                  fontWeight: FONT_WEIGHT.black,
                  lineHeight: 0.8,
                  letterSpacing: '-0.06em',
                  color: COLORS.red,
                }}
              >
                {selected.l}
              </div>
              <div>
                <div
                  style={{
                    fontFamily: FONTS.mono,
                    fontSize: FONT_SIZE.tag,
                    letterSpacing: LETTER_SPACING.caps,
                    opacity: 0.6,
                    marginBottom: SPACE[2],
                  }}
                >
                  EXAMPLE WORD
                </div>
                <div
                  style={{
                    fontFamily: FONTS.display,
                    fontSize: FONT_SIZE['5xl'],
                    fontWeight: FONT_WEIGHT.bold,
                    letterSpacing: LETTER_SPACING.tight,
                    marginBottom: SPACE[2],
                  }}
                >
                  {selected.w}
                </div>
                <div
                  style={{
                    fontFamily: FONTS.body,
                    fontStyle: 'italic',
                    fontSize: FONT_SIZE.xl,
                    opacity: 0.7,
                  }}
                >
                  &quot;{selected.e}&quot;
                </div>
              </div>
              <button
                type="button"
                onClick={() => speak(selected.w)}
                aria-label={`Play pronunciation for ${selected.w}`}
                // Sits on the ink detail card. The default ring is the same
                // token as that plane; data-focus-on-dark uses currentColor
                // (paper, set below).
                data-ui="button"
                data-focus-on-dark=""
                style={{
                  width: 80,
                  height: 80,
                  background: COLORS.red,
                  border: 'none',
                  color: COLORS.paper,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                }}
              >
                <Volume2 size={32} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
