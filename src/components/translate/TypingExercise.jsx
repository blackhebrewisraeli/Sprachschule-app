import { useState, useEffect, useRef } from 'react';
import { ArrowRight, SkipForward } from 'lucide-react';
import {
  COLORS,
  FONTS,
  FONT_SIZE,
  FONT_WEIGHT,
  BORDER,
  SPACE,
  RADIUS,
  SHADOW,
  BUTTON,
} from '../../lib/theme';
import { callClaude, QuotaExhaustedError } from '../../lib/claude';
import { resetTimeText } from '../../lib/quotaReset';
import { activePack } from '../../packs';
import { graderSystemPrompt } from '../../lib/prompts';
import { recordEvent, recordItem } from '../../lib/stats';
import FeedbackPanel from './FeedbackPanel';

// B1 — free-typed translation graded by Claude with a three-way verdict
// (correct / almost / wrong). "almost" still advances the score.
export default function TypingExercise({ exercise, level, onCorrect, onSkip }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  // A spent daily checking allowance: neither a verdict nor a network failure,
  // so it never reaches FeedbackPanel, XP or stats.
  const [limit, setLimit] = useState(null);
  const [reward, setReward] = useState({ xp: 0, mult: 1 });
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  useEffect(() => {
    setInput('');
    setFeedback(null);
    setLimit(null);
  }, [exercise]);

  const check = async () => {
    if (!input.trim() || loading) return;
    setLoading(true);
    setLimit(null);
    try {
      const system = graderSystemPrompt({ prompts: activePack.prompts });
      const user = `English sentence: "${exercise.en}"\nIdeal German: "${exercise.de}"\nLearner's answer: "${input}"`;
      const raw = await callClaude(system, user, [], {
        endpoint: 'grade',
        routingContext: { taskType: 'translation_check', userTier: 'guest' },
      });
      const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
      if (mounted.current) {
        // Validate verdict; fall back to binary if Claude returns the old shape.
        const verdict =
          parsed.verdict === 'correct' || parsed.verdict === 'almost' || parsed.verdict === 'wrong'
            ? parsed.verdict
            : parsed.correct
              ? 'correct'
              : 'wrong';
        setFeedback({
          verdict,
          corrected: parsed.corrected,
          message: parsed.message,
        });
        const r = recordEvent('translate', level, verdict);
        setReward(r);
        recordItem('translate', level, exercise.en, exercise.de, verdict);
        // "almost" still advances the exercise — typos shouldn't gate progress.
        if (verdict === 'correct' || verdict === 'almost') onCorrect();
      }
    } catch (err) {
      if (mounted.current && err instanceof QuotaExhaustedError) setLimit(err);
      else if (mounted.current)
        setFeedback({
          verdict: 'wrong',
          corrected: exercise.de,
          message: 'Could not grade — check your connection.',
        });
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  return (
    <div>
      {feedback ? (
        <FeedbackPanel
          verdict={feedback.verdict}
          correctText={feedback.corrected}
          note={feedback.message}
          xp={reward.xp}
          mult={reward.mult}
          onNext={onSkip}
        />
      ) : (
        <>
          <div
            style={{
              fontFamily: FONTS.body,
              fontSize: FONT_SIZE.sm,
              fontWeight: FONT_WEIGHT.semibold,
              color: COLORS.mute,
              marginBottom: SPACE[2],
            }}
          >
            Your German
          </div>
          <textarea
            aria-label="Your German translation"
            lang="de"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && check()}
            placeholder="Type your translation here… (Cmd/Ctrl+Enter to submit)"
            style={{
              width: '100%',
              boxSizing: 'border-box',
              minHeight: 120,
              padding: `${SPACE[4]}px ${SPACE[5]}px`,
              border: BORDER.panel,
              borderRadius: RADIUS.lg,
              boxShadow: SHADOW.inset,
              background: COLORS.card,
              fontFamily: FONTS.display,
              fontSize: FONT_SIZE['2xl'],
              resize: 'vertical',
              color: COLORS.ink,
              lineHeight: 1.5,
              marginBottom: SPACE[4],
            }}
          />
          {limit && (
            <p
              role="note"
              style={{
                margin: `0 0 ${SPACE[4]}px`,
                padding: SPACE[4],
                background: COLORS.surface1,
                border: BORDER.panel,
                borderRadius: RADIUS.md,
                fontFamily: FONTS.body,
                fontSize: FONT_SIZE.base,
                color: COLORS.ink,
              }}
            >
              Daily checking limit reached
              {resetTimeText(limit.resetsAt) ? ` — resets at ${resetTimeText(limit.resetsAt)}` : ''}
              .
            </p>
          )}
          <div style={{ display: 'flex', gap: SPACE[3] }}>
            <button
              type="button"
              onClick={check}
              disabled={!input.trim() || loading}
              style={{ ...BUTTON.go, flex: 1, opacity: !input.trim() || loading ? 0.4 : 1 }}
            >
              {loading ? (
                'GRADING...'
              ) : (
                <>
                  CHECK <ArrowRight size={14} aria-hidden="true" />
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onSkip}
              aria-label="Skip exercise"
              style={{ ...BUTTON.secondary, flex: 0, padding: `${SPACE[3]}px ${SPACE[4]}px` }}
            >
              <SkipForward size={16} aria-hidden="true" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
