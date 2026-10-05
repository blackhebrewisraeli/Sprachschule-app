import { useEffect, useMemo, useState } from 'react';
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
import { shuffle } from '../lib/utils';
import { LEVEL_NAMES, LEVEL_MODES } from '../lib/levelPref';
import {
  buildPlacementItems,
  gradeItem,
  scorePlacement,
  applyPlacement,
  DEFAULT_PLACEMENT_LEVEL,
} from '../lib/placement';
import { activePack } from '../packs';
import Button from './ui/Button';
import Heading from './ui/Heading';
import { Body, Meta } from './ui/Text';
import ThemeChip from './ThemeChip';
import { Stack } from './ui/Layout';

const tileStyle = (active) => ({
  padding: `${SPACE[2]}px ${SPACE[4]}px`,
  fontFamily: FONTS.mono,
  fontSize: FONT_SIZE.md,
  border: 'none',
  borderRadius: RADIUS.sm,
  boxShadow: SHADOW.press(active ? COLORS.press : COLORS.lip),
  background: active ? COLORS.ink : COLORS.card,
  color: active ? COLORS.paper : COLORS.ink,
  cursor: 'pointer',
  minWidth: 0,
  overflowWrap: 'anywhere',
});

function kicker(text) {
  return (
    <div
      style={{
        fontFamily: FONTS.mono,
        fontSize: FONT_SIZE.tag,
        letterSpacing: LETTER_SPACING.caps,
        textTransform: 'uppercase',
        color: COLORS.mute,
        marginBottom: SPACE[2],
      }}
    >
      {text}
    </div>
  );
}

function Prompt({ text }) {
  return (
    <div
      style={{
        borderRadius: RADIUS.lg,
        boxShadow: SHADOW.card,
        background: COLORS.paper,
        padding: `${SPACE[5]}px ${SPACE[6]}px`,
        marginBottom: SPACE[4],
        minWidth: 0,
      }}
    >
      {kicker('Translate')}
      <div
        style={{
          fontFamily: FONTS.display,
          fontSize: FONT_SIZE['2xl'],
          fontWeight: FONT_WEIGHT.semibold,
          lineHeight: 1.3,
          overflowWrap: 'anywhere',
        }}
      >
        {text}
      </div>
    </div>
  );
}

function TilesItem({ bank, placed, onAdd, onRemove }) {
  return (
    <>
      {kicker('Your answer — click tiles in order')}
      <div
        style={{
          minHeight: 52,
          border: `2px dashed ${COLORS.inkA30}`,
          borderRadius: RADIUS.md,
          background: COLORS.card,
          padding: SPACE[3],
          display: 'flex',
          gap: SPACE[2],
          flexWrap: 'wrap',
          marginBottom: SPACE[4],
        }}
      >
        {placed.map((tile) => (
          <button
            key={tile.id}
            type="button"
            onClick={() => onRemove(tile)}
            aria-label={`Remove ${tile.word} from answer`}
            style={tileStyle(true)}
          >
            {tile.word}
          </button>
        ))}
      </div>
      {kicker('Word bank')}
      <div style={{ display: 'flex', gap: SPACE[2], flexWrap: 'wrap', marginBottom: SPACE[5] }}>
        {bank.map((tile) => (
          <button
            key={tile.id}
            type="button"
            onClick={() => onAdd(tile)}
            aria-label={`Add ${tile.word} to answer`}
            style={tileStyle(false)}
          >
            {tile.word}
          </button>
        ))}
      </div>
    </>
  );
}

function BlanksItem({ item, bank, filled, onFill, onClear }) {
  const parts = item.template.split('___');
  return (
    <>
      {kicker('Complete the sentence')}
      <div
        style={{
          fontFamily: FONTS.display,
          fontSize: FONT_SIZE['2xl'],
          lineHeight: 2,
          marginBottom: SPACE[4],
          borderRadius: RADIUS.lg,
          boxShadow: SHADOW.card,
          padding: SPACE[5],
          background: COLORS.card,
          overflowWrap: 'anywhere',
          minWidth: 0,
        }}
      >
        {parts.map((part, i) => (
          <span key={i}>
            {part}
            {i < parts.length - 1 && (
              <button
                type="button"
                onClick={() => onClear(i)}
                aria-label={filled[i] ? `Clear blank ${i + 1}` : `Blank ${i + 1} is empty`}
                disabled={!filled[i]}
                style={{
                  display: 'inline-block',
                  minWidth: 80,
                  borderBottom: `2px solid ${filled[i] ? COLORS.ink : COLORS.red}`,
                  marginInline: SPACE[1],
                  textAlign: 'center',
                  fontFamily: FONTS.mono,
                  fontSize: FONT_SIZE.md,
                  color: filled[i] ? COLORS.ink : COLORS.red,
                  cursor: filled[i] ? 'pointer' : 'default',
                  paddingInline: SPACE[2],
                  background: 'transparent',
                  borderTop: 'none',
                  borderLeft: 'none',
                  borderRight: 'none',
                }}
              >
                {filled[i] ? filled[i].word : '___'}
              </button>
            )}
          </span>
        ))}
      </div>
      {kicker('Choose a word')}
      <div style={{ display: 'flex', gap: SPACE[2], flexWrap: 'wrap', marginBottom: SPACE[5] }}>
        {bank.map((tile) => (
          <button
            key={tile.id}
            type="button"
            onClick={() => onFill(tile)}
            aria-label={`Add ${tile.word}`}
            style={tileStyle(false)}
          >
            {tile.word}
          </button>
        ))}
      </div>
    </>
  );
}

function ChoiceItem({ options, onPick }) {
  return (
    <Stack gap={3} style={{ marginBottom: SPACE[5] }}>
      {kicker('Pick the translation')}
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onPick(option)}
          style={{
            ...BUTTON.secondary,
            width: '100%',
            minWidth: 0,
            textTransform: 'none',
            letterSpacing: 0,
            fontFamily: FONTS.body,
            fontWeight: FONT_WEIGHT.medium,
            fontSize: FONT_SIZE.md,
            textAlign: 'left',
            overflowWrap: 'anywhere',
            whiteSpace: 'normal',
          }}
        >
          {option}
        </button>
      ))}
    </Stack>
  );
}

/**
 * Offline CEFR classification. First-time learners meet this instead of a
 * free level picker; returning learners reopen it from Settings / StatusChip.
 *
 * Does not record XP or SRS — it is an assessment, not a practice round.
 *
 * ALWAYS LEAVABLE. There is an exit on the intro and on every question, for
 * everyone. Leaving never writes a level from here — `firstRun` only changes
 * the words, because on a first run the caller has already classified the
 * learner at the default band (applyDefaultPlacement) before this painted.
 * Exiting keeps whatever level is stored; it does not un-classify anyone.
 */
export default function PlacementTest({ onComplete, onCancel, firstRun = false }) {
  const items = useMemo(() => buildPlacementItems(activePack), []);
  const [phase, setPhase] = useState('intro');
  const [index, setIndex] = useState(0);
  const [verdicts, setVerdicts] = useState([]);
  const [score, setScore] = useState(null);

  const [bank, setBank] = useState([]);
  const [placed, setPlaced] = useState([]);
  const [filled, setFilled] = useState([]);
  const [options, setOptions] = useState([]);
  const [lastCorrect, setLastCorrect] = useState(null);

  const item = items[index];

  useEffect(() => {
    if (phase !== 'item' || !item) return undefined;
    setLastCorrect(null);
    if (item.kind === 'tiles') {
      const tiles = [...item.words, ...item.distractors].map((w, i) => ({ id: i, word: w }));
      setBank(shuffle(tiles));
      setPlaced([]);
    } else if (item.kind === 'blanks') {
      const all = item.blanks.flatMap((b) => [b.word, ...b.distractors]);
      setBank(shuffle([...new Set(all)].map((w, i) => ({ id: i, word: w }))));
      setFilled(Array(item.blanks.length).fill(null));
    } else if (item.kind === 'choice') {
      setOptions(shuffle(item.options));
    }
    return undefined;
  }, [phase, index, item]);

  const start = () => {
    setIndex(0);
    setVerdicts([]);
    setScore(null);
    setPhase('item');
  };

  const record = (correct) => {
    const nextVerdicts = [...verdicts, correct];
    setVerdicts(nextVerdicts);
    setLastCorrect(correct);
    setPhase('feedback');
  };

  const checkTiles = () => record(gradeItem(item, placed.map((t) => t.word).join(' ')));
  const checkBlanks = () =>
    record(
      gradeItem(
        item,
        filled.map((t) => t?.word)
      )
    );
  const checkChoice = (option) => record(gradeItem(item, option));

  const advance = () => {
    const nextIndex = index + 1;
    if (nextIndex >= items.length) {
      const nextScore = scorePlacement(items, [...verdicts]);
      setScore(nextScore);
      setPhase('result');
      return;
    }
    setIndex(nextIndex);
    setPhase('item');
  };

  const finish = () => {
    if (!score) return;
    applyPlacement(score);
    onComplete?.(score.level);
  };

  const canCheckTiles = placed.length > 0;
  const canCheckBlanks = filled.length > 0 && filled.every(Boolean);
  const lastItem = index === items.length - 1;

  return (
    <div
      className="entry-screen"
      data-entry="placement"
      style={{
        position: 'relative',
        background: COLORS.paper,
        color: COLORS.ink,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: phase === 'intro' ? 'center' : 'flex-start',
        fontFamily: FONTS.body,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 'calc(16px + env(safe-area-inset-top, 0px))',
          right: 'calc(16px + env(safe-area-inset-right, 0px))',
        }}
      >
        <ThemeChip />
      </div>

      <div
        style={{
          width: '100%',
          maxWidth: 480,
          minWidth: 0,
          paddingTop: phase === 'intro' ? 0 : SPACE[8],
        }}
      >
        {phase === 'intro' && (
          <Stack gap={5} align="stretch">
            {/* First run is the learner's first screen past the gate, so the
                welcome and the test invite are one prompt here rather than a
                greeting overlay stacked on top of the test. */}
            <Stack gap={2} align="center">
              {firstRun && activePack.content.identity?.welcomeKicker ? (
                <Meta as="div" tone="soft">
                  {activePack.content.identity.welcomeKicker}
                </Meta>
              ) : null}
              <Heading level={1} style={{ margin: 0, textAlign: 'center' }}>
                Find your level
              </Heading>
            </Stack>
            <Body style={{ textAlign: 'center' }}>
              Nine short questions from the course itself. No account, no AI. We place you at A1,
              A2, or B1 — that decides how Translate works.
            </Body>
            <Button data-entry="placement-start" onClick={start}>
              Start
            </Button>
            <Button variant="ghost" data-entry="placement-skip" onClick={onCancel}>
              {firstRun
                ? `Skip for now — start at ${DEFAULT_PLACEMENT_LEVEL.toUpperCase()}`
                : 'Keep my current level'}
            </Button>
          </Stack>
        )}

        {phase === 'item' && item && (
          <>
            {kicker(`Question ${index + 1} of ${items.length} · ${item.band.toUpperCase()}`)}
            <Prompt text={item.prompt} />
            {item.kind === 'tiles' && (
              <TilesItem
                bank={bank}
                placed={placed}
                onAdd={(tile) => {
                  setBank((b) => b.filter((t) => t.id !== tile.id));
                  setPlaced((p) => [...p, tile]);
                }}
                onRemove={(tile) => {
                  setPlaced((p) => p.filter((t) => t.id !== tile.id));
                  setBank((b) => [...b, tile]);
                }}
              />
            )}
            {item.kind === 'blanks' && (
              <BlanksItem
                item={item}
                bank={bank}
                filled={filled}
                onFill={(tile) => {
                  const idx = filled.indexOf(null);
                  if (idx === -1) return;
                  const next = [...filled];
                  next[idx] = tile;
                  setFilled(next);
                  setBank((b) => b.filter((t) => t.id !== tile.id));
                }}
                onClear={(idx) => {
                  const tile = filled[idx];
                  if (!tile) return;
                  const next = [...filled];
                  next[idx] = null;
                  setFilled(next);
                  setBank((b) => [...b, tile]);
                }}
              />
            )}
            {item.kind === 'choice' && <ChoiceItem options={options} onPick={checkChoice} />}
            {item.kind !== 'choice' && (
              <Button
                onClick={item.kind === 'tiles' ? checkTiles : checkBlanks}
                disabled={item.kind === 'tiles' ? !canCheckTiles : !canCheckBlanks}
                style={BUTTON.go}
              >
                Check
              </Button>
            )}
            <Button variant="ghost" onClick={onCancel}>
              {firstRun ? 'Skip the test' : 'Stop and keep my level'}
            </Button>
          </>
        )}

        {phase === 'feedback' && item && (
          <Stack gap={5}>
            {kicker(`Question ${index + 1} of ${items.length}`)}
            <div
              role="status"
              style={{
                borderRadius: RADIUS.lg,
                boxShadow: SHADOW.card,
                background: lastCorrect ? COLORS.greenSoft : COLORS.redSoft,
                padding: SPACE[5],
                minWidth: 0,
              }}
            >
              <div
                style={{
                  fontFamily: FONTS.mono,
                  fontSize: FONT_SIZE.tag,
                  letterSpacing: LETTER_SPACING.caps,
                  textTransform: 'uppercase',
                  color: lastCorrect ? COLORS.greenDeep : COLORS.rust,
                  marginBottom: SPACE[2],
                }}
              >
                {lastCorrect ? 'Correct' : 'Not quite'}
              </div>
              <Body>
                {lastCorrect
                  ? 'On to the next one.'
                  : item.kind === 'choice'
                    ? item.answer
                    : item.kind === 'tiles'
                      ? item.words.join(' ')
                      : item.blanks.map((b) => b.word).join(' · ')}
              </Body>
            </div>
            <Button onClick={advance}>{lastItem ? 'See my level' : 'Next'}</Button>
          </Stack>
        )}

        {phase === 'result' && score && (
          <Stack gap={5} align="stretch">
            {kicker('Your level')}
            <Heading level={1} style={{ margin: 0 }}>
              {score.level.toUpperCase()}
            </Heading>
            <Body>
              {LEVEL_NAMES[score.level] ?? ''}
              {LEVEL_MODES[score.level]
                ? ` · ${LEVEL_MODES[score.level].label} — ${LEVEL_MODES[score.level].detail}`
                : ''}
            </Body>
            <Body size="sm" tone="muted">
              {score.correct} of {score.total} correct. You can retake this anytime from Settings.
            </Body>
            <Button data-entry="placement-continue" onClick={finish}>
              Continue
            </Button>
          </Stack>
        )}
      </div>
    </div>
  );
}
