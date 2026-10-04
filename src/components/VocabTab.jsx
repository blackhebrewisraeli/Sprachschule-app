import { useState, useEffect, useRef, useMemo } from 'react';
import { COLORS, FONTS, FONT_SIZE, LETTER_SPACING, SPACE, BUTTON } from '../lib/theme';
import { callClaude, QuotaExhaustedError } from '../lib/claude';
import { resetTimeText } from '../lib/quotaReset';
import { loadState } from '../lib/storage';
import { activePack } from '../packs';
import { newDeckId, MAX_CUSTOM_DECKS } from '../lib/customDecks';
import { isLearned, learnedInDeck } from '../lib/learnedWords';
const {
  decks: PRESET_DECKS,
  interestDecks: PACK_INTEREST_DECKS,
  phraseDecks: PHRASE_DECKS,
  interestTopics,
} = activePack.content;
const DEFAULT_DECK_ID = 'greetings';
import { AlertTriangle } from 'lucide-react';
import StatusNote from './ui/StatusNote';
import { Hero } from './UI';
import { shuffle } from '../lib/utils';
import { exactMatch, bestGlossMatch } from '../lib/matching';
import { ANSWER } from '../lib/textRules';
import { deckPrompts } from '../lib/prompts';
import { recordEvent, recordItem } from '../lib/stats';
import { getDueCards, recordVocabAnswer } from '../lib/srs';
import DeckProgress from './ui/DeckProgress';
import FeedbackButton from './FeedbackButton';
import DeckPicker from './vocab/DeckPicker';
import CardFace from './vocab/CardFace';
import ChoiceGrid from './vocab/ChoiceGrid';
import TypedAnswer from './vocab/TypedAnswer';
import VerdictPanel from './vocab/VerdictPanel';
import DeckCompleteBanner from './vocab/DeckCompleteBanner';
import ArticleChoice from './vocab/ArticleChoice';
import VocabModeTabs from './vocab/VocabModeTabs';
import { vocabPanelId, vocabTabId } from './vocab/vocabModes';
import VocabBrowse, { CUSTOM_PICK_COPY } from './vocab/VocabBrowse';
import CustomDeckManager from './vocab/CustomDeckManager';
import { drillFor } from './vocab/drills';
import { speak } from '../lib/speech';
import useAutoDeck from './vocab/useAutoDeck';
import { AUTO_DECKS } from '../packs/de/autoDecks';
import { clampMode, isDeckAllowedForLevel } from '../lib/levelGate';
import { getUserLevel } from '../lib/levelPref';
import { interestPickerDecks, isEnabledInterestDeck } from '../lib/interests';

// The verdict is where the other meanings can be taught — the card face must
// not show them, since that would print the answer above the question.
const glossList = (card) => (card.glosses?.length ? card.glosses.join(' · ') : card.en);

export default function VocabTab({
  level,
  learnedWords,
  learnedByDeck = null,
  markLearned,
  mobile = false,
  reviewTarget = null,
  onReviewConsumed,
  customDecks = {},
  onDeckGenerated,
  onDeckDeleted,
  enabledInterests = [],
}) {
  // Stats review and Home "continue this deck" both arrive as reviewTarget.
  // Honour the named deck on first paint so the picker matches DeckPicker
  // from the start, rather than flashing the default greetings deck.
  const [deckId, setDeckIdRaw] = useState(
    typeof reviewTarget?.context === 'string' && reviewTarget.context
      ? reviewTarget.context
      : DEFAULT_DECK_ID
  );
  const [mode, setMode] = useState('practice');
  // Snapshot once per mount so Browse/Custom never call Date.now() or loadState
  // in their own render. Refresh when the learner leaves Practice — that is
  // when a new SRS row may have been written.
  const [browseNow] = useState(() => Date.now());
  const [browseSrs, setBrowseSrs] = useState(() => (loadState() ?? {}).srs ?? {});
  // customCards is a PROP, not state: this component unmounts on every tab
  // switch, which is what used to destroy a generated deck. It lives in the
  // state blob now and App hands it down.
  const [customTopic, setCustomTopic] = useState('');
  const [generating, setGenerating] = useState(false);
  const [deckLimit, setDeckLimit] = useState(null);
  const [deckComplete, setDeckComplete] = useState(false);

  const {
    isAuto,
    cards: asyncDeck,
    loading: deckLoading,
    error: deckError,
    retry,
  } = useAutoDeck(deckId);

  useEffect(() => {
    if (mode === 'browse' || mode === 'custom') {
      setBrowseSrs((loadState() ?? {}).srs ?? {});
    }
  }, [mode]);

  const [answered, setAnswered] = useState(false);
  const [result, setResult] = useState(null); // 'correct' | 'almost' | 'wrong'
  // The card whose audio has been played, NOT a boolean. Storing the id means
  // `played` falsifies itself the moment a different card arrives, so there is
  // no reset to forget on any of the several paths that advance the queue —
  // answering, skipping, switching deck, or a review target jumping the line.
  const [playedCardId, setPlayedCardId] = useState(null);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [queue, setQueue] = useState([]);
  // A pending review target — when the deck-reset effect runs, it puts this
  // card first in the queue instead of starting fresh.
  const pendingReviewRef = useRef(null);

  // A membership test, not a literal: any id in the collection is a custom
  // deck. With one deck in the map this is exactly the old behaviour.
  const interestPicker = interestPickerDecks(interestTopics, enabledInterests, PACK_INTEREST_DECKS);
  const customCards = customDecks?.[deckId]?.cards ?? null;
  const interestCards = isEnabledInterestDeck(deckId, interestTopics, enabledInterests)
    ? (PACK_INTEREST_DECKS[deckId] ?? [])
    : null;
  const activeDeck =
    customCards ??
    (isAuto
      ? (asyncDeck ?? [])
      : (PRESET_DECKS[deckId] ?? PHRASE_DECKS[deckId] ?? interestCards ?? []));
  const practiceLevel = clampMode(level, getUserLevel());

  // Deck changes must not keep the previous queue. React applies the id write
  // before the reset effect, so one render can pair a new (smaller) deck with
  // a leftover high index — getChoices then reads deck[cardIdx].en off the end.
  // Every UI path must go through selectDeck; it is the only writer.
  const selectDeck = (nextId) => {
    if (nextId === deckId) return;
    setQueue([]);
    setAnswered(false);
    setResult(null);
    setTypedAnswer('');
    setDeckComplete(false);
    setDeckIdRaw(nextId);
  };

  // The custom deck can disappear while it is the SELECTED one — deleted here,
  // or tombstoned on another device and pulled in by a sync. There is no
  // PRESET_DECKS.custom to fall back on, so without this the learner is left
  // staring at an empty deck.
  useEffect(() => {
    // Covers a deck deleted here AND one tombstoned on another device and
    // pulled in by a sync: either way the selected id stops resolving.
    const isKnown =
      customDecks?.[deckId] ||
      isAuto ||
      Object.hasOwn(PRESET_DECKS, deckId ?? '') ||
      Object.hasOwn(PHRASE_DECKS, deckId ?? '') ||
      isEnabledInterestDeck(deckId, interestTopics, enabledInterests);
    if (!isKnown) selectDeck(DEFAULT_DECK_ID);
  }, [deckId, customDecks, isAuto, enabledInterests]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const def = AUTO_DECKS.find((d) => d.id === deckId);
    if (def && !isDeckAllowedForLevel(def, practiceLevel)) {
      selectDeck(DEFAULT_DECK_ID);
    }
  }, [deckId, practiceLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const target = pendingReviewRef.current;
    const srs = (loadState() ?? {}).srs ?? {};
    // SRS-derived queue: due first, then new, then over-review.
    let q = getDueCards(srs, activeDeck, deckId, Date.now());
    if (target) {
      const idx = activeDeck.findIndex((c) => c.id === target);
      if (idx >= 0) {
        q = [idx, ...q.filter((i) => i !== idx)];
      }
      pendingReviewRef.current = null;
    }
    setQueue(q);
    setAnswered(false);
    setResult(null);
    setTypedAnswer('');
    setDeckComplete(false);
    // activeDeck is derived from deckId+customCards+asyncDeck which are in deps — safe to omit
  }, [deckId, customCards, asyncDeck, level]); // eslint-disable-line react-hooks/exhaustive-deps

  // Brief lock to swallow the trailing click event that would otherwise pass
  // through to whatever button mounts at the SRS button's screen position on
  // the next card (e.g. clicking GOOD also clicking the new card's MC option
  // at the same coordinates).
  const clickLockRef = useRef(false);

  // SRS verdict + queue advance, shared by all four buttons in the verdict panel.
  const handleSrsVerdict = (srsVerdict) => {
    if (!card || clickLockRef.current) return;
    clickLockRef.current = true;
    recordVocabAnswer(deckId, card.id, srsVerdict);
    advanceQueue(srsVerdict !== 'again');
    setTimeout(() => {
      clickLockRef.current = false;
    }, 200);
  };

  // Pick up review targets handed in from the Stats Review feed, and deck-only
  // handoffs from Home recommendations (`context` set, no card `label`).
  useEffect(() => {
    if (!reviewTarget) return;
    if (reviewTarget.label) pendingReviewRef.current = reviewTarget.label;

    if (deckId === reviewTarget.context) {
      // Already on the right deck — the deck-reset effect won't fire, so
      // manually re-run the same queue-with-target build here.
      const idx = activeDeck.findIndex((c) => c.id === reviewTarget.label);
      if (idx >= 0) {
        const rest = activeDeck.map((_, i) => i).filter((i) => i !== idx);
        setQueue([idx, ...rest]);
        setAnswered(false);
        setResult(null);
        setTypedAnswer('');
        pendingReviewRef.current = null;
      }
    } else if (reviewTarget.context) {
      // Deck change — pendingReviewRef will be consumed by the deck-reset effect.
      selectDeck(reviewTarget.context);
    }

    onReviewConsumed?.();
  }, [reviewTarget, onReviewConsumed]); // eslint-disable-line react-hooks/exhaustive-deps

  const queuedIdx = queue[0];
  const currentIdx =
    Number.isInteger(queuedIdx) && queuedIdx >= 0 && queuedIdx < activeDeck.length
      ? queuedIdx
      : null;
  const card = currentIdx !== null ? activeDeck[currentIdx] : null;
  const played = card != null && playedCardId === card.id;

  const getChoices = (deck, cardIdx) => {
    const picked = deck?.[cardIdx];
    if (!picked) return [];
    const correct = picked.en;
    const others = shuffle(deck.filter((_, i) => i !== cardIdx).map((c) => c.en));
    return shuffle([correct, ...others.slice(0, 3)]);
  };

  // Build the four multiple-choice options once per card. getChoices() reshuffles
  // on every call, so calling it inline in render let any unrelated re-render
  // (e.g. a parent sync-status update) reorder the buttons under the user's
  // finger — registering the wrong answer. Memoizing per card keeps the order
  // stable until the displayed card actually changes.
  const choices = useMemo(
    () => (currentIdx !== null && activeDeck.length >= 4 ? getChoices(activeDeck, currentIdx) : []),
    [deckId, currentIdx, card?.id, activeDeck.length] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const advanceQueue = (wasCorrect) => {
    setAnswered(false);
    setResult(null);
    setTypedAnswer('');
    setQueue((prev) => {
      const [, ...rest] = prev;
      const next = wasCorrect ? rest : [...rest, prev[0]];
      if (wasCorrect && rest.length === 0) setDeckComplete(true);
      return next;
    });
  };

  const submitTyped = () => {
    if (!typedAnswer.trim() || !card || clickLockRef.current) return;
    // Every gloss, not just the first. card.en is glosses[0]; a card like
    // "die Uhr" ships "clock, watch" and "meter; gauge" too, and typing "clock"
    // used to be marked wrong.
    const { distance: dist } = bestGlossMatch(card.glosses ?? card.en, typedAnswer, ANSWER);
    const res = dist === 0 ? 'correct' : dist <= 2 ? 'almost' : 'wrong';
    setAnswered(true);
    setResult(res);
    if (res === 'correct' || res === 'almost') markLearned(deckId, card.id);
    recordEvent('vocab', practiceLevel, res);
    recordItem('vocab', deckId, card.id, card.en, res);
  };

  const chooseOption = (choice) => {
    if (clickLockRef.current) return; // swallow phantom clicks during transition
    const correct = choice === card.en;
    const verdict = correct ? 'correct' : 'wrong';
    setAnswered(true);
    setResult(verdict);
    if (correct) markLearned(deckId, card.id);
    recordEvent('vocab', practiceLevel, verdict);
    recordItem('vocab', deckId, card.id, card.en, verdict);
  };

  // Every drill grades the same way: exact match against the pack's target text
  // rules. Deliberately not fuzzyMatch — a gender, plural or participle that
  // differs by one letter is a different word, not a near miss.
  //
  // No markLearned for any drill; see the note in vocab/drills.js.
  const answerDrill = (given) => {
    if (!card || clickLockRef.current) return;
    const expected = drill.expected(card, activePack.grammar) ?? '';
    // A drill may have several right answers — "gut" is the opposite of both
    // "schlecht" and "böse". `accepts` is optional; without it the single
    // expected value is the whole accepted set, which is what the other drills
    // want (a plural or a participle has exactly one form).
    const accepted = drill.accepts ? drill.accepts(card, activePack.grammar) : [expected];
    const verdict = accepted.some((a) => a && exactMatch(a, given, activePack.validation.target))
      ? 'correct'
      : 'wrong';
    setAnswered(true);
    setResult(verdict);
    recordEvent('vocab', practiceLevel, verdict);
    recordItem('vocab', deckId, card.id, expected, verdict);
  };

  const generateDeck = async () => {
    if (!customTopic.trim()) return;
    setGenerating(true);
    setDeckLimit(null);
    try {
      const { system: systemPrompt, user: userMsg } = deckPrompts({
        prompts: activePack.prompts,
        topic: customTopic,
      });
      const raw = await callClaude(systemPrompt, userMsg, [], {
        endpoint: 'deck',
        routingContext: { taskType: 'deck_generation', userTier: 'guest' },
      });
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // A fresh id per generation — this one expression is the whole of
        // "many decks" at the call site. Random, never derived from the topic:
        // mergeDecks settles a shared id by LWW, so a content hash would make
        // two decks on one topic silently discard each other.
        const generatedId = newDeckId();
        onDeckGenerated?.({
          deckId: generatedId,
          name: customTopic.trim(),
          cards: parsed.map((c) => ({ ...c, id: activePack.cardId(c) })),
        });
        selectDeck(generatedId);
        // Cleared on SUCCESS only. Generating repeatedly is the normal case now
        // that decks are a collection, and a stale topic meant the next one was
        // typed onto the end of the last ("weather" + "food" = "weatherfood").
        // A FAILED attempt deliberately keeps the text, so a retry does not make
        // the learner type it again.
        setCustomTopic('');
      }
    } catch (err) {
      // A spent allowance is not a failure to alert about; say when it resets.
      if (err instanceof QuotaExhaustedError) setDeckLimit(err);
      else alert('Could not generate deck — ' + err.message);
    } finally {
      setGenerating(false);
    }
  };

  // Multiple choice needs four distinct options; below that, even A1 types.
  // Spelled out rather than derived as `!showChoices`, which would additionally
  // show the input for any level outside a1/a2/b1 — not reachable through the
  // pack's cefrLevels today, but a behaviour change either way.
  const isBeginner = practiceLevel === 'a1' || practiceLevel === 'a2';
  // Artikel decks drill gender rather than meaning. Keyed off the deck's group
  // so adding a deck to the group is enough — no second list to keep in sync.
  // One table lookup replaces a flag, a conceal branch and an answer branch per
  // drill — see vocab/drills.js. A drill deck replaces the meaning exercises.
  const drill = drillFor(deckId, AUTO_DECKS);
  const isDrill = drill !== null;

  // A listening card USED to speak itself on arrival, on the argument that the
  // audio is the question and a learner pressing play before every card is
  // being taxed rather than tested. That argument lost to a harder rule: sound
  // in this app never starts without a press. Unannounced audio is the failure
  // mode for anyone on a screen reader (it talks over the announcement), on a
  // shared or public device, or simply not expecting it — and none of them get
  // a say before it has already played.
  //
  // What replaces it is not "press play every time" but a play button that is
  // the loudest thing on the card, plus a caption that distinguishes the first
  // listen from a replay. See `played` below.
  const showChoices = !isDrill && isBeginner && activeDeck.length >= 4;
  const showTyped = !isDrill && (practiceLevel === 'b1' || (isBeginner && activeDeck.length < 4));

  const deckTitle =
    customDecks?.[deckId]?.name ||
    AUTO_DECKS.find((d) => d.id === deckId)?.name ||
    activePack.content.deckDefs?.[deckId]?.name ||
    activePack.content.phraseDeckDefs?.[deckId]?.name ||
    activePack.content.interestDeckDefs?.[deckId]?.name ||
    deckId;

  const practiseRow = (row) => {
    const idx = activeDeck.findIndex((c) => c.id === row.id);
    if (idx >= 0) {
      const rest = activeDeck.map((_, i) => i).filter((i) => i !== idx);
      setQueue([idx, ...rest]);
      setAnswered(false);
      setResult(null);
      setTypedAnswer('');
      setDeckComplete(false);
    }
    setMode('practice');
  };

  const browseProps = {
    title: deckTitle,
    deckId,
    mobile,
    srs: browseSrs,
    learnedWords,
    learnedByDeck,
    now: browseNow,
    onPractice: practiseRow,
    selectableCustomDecks: customDecks,
    level: practiceLevel,
    interestDecks: interestPicker,
  };

  return (
    <div>
      <Hero
        align="center"
        kicker="Section 04"
        title="Wortschatz"
        sub="Flip, listen, learn. Pick a preset or generate a deck on any topic."
        srOnly={mobile}
      />

      <VocabModeTabs active={mode} onPick={setMode} />

      {mode === 'browse' && (
        <div role="tabpanel" id={vocabPanelId('browse')} aria-labelledby={vocabTabId('browse')}>
          <VocabBrowse
            {...browseProps}
            cards={activeDeck}
            loading={isAuto && deckLoading}
            error={isAuto && deckError}
            onRetry={retry}
            onSelectDeck={selectDeck}
            emptyMessage="This deck has no words yet."
          />
        </div>
      )}

      {mode === 'custom' && (
        <div role="tabpanel" id={vocabPanelId('custom')} aria-labelledby={vocabTabId('custom')}>
          <CustomDeckManager
            deckId={deckId}
            onSelect={selectDeck}
            customDecks={customDecks}
            onDelete={onDeckDeleted}
            atCap={Object.keys(customDecks ?? {}).length >= MAX_CUSTOM_DECKS}
            maxDecks={MAX_CUSTOM_DECKS}
            customTopic={customTopic}
            onTopicChange={setCustomTopic}
            generating={generating}
            onGenerate={generateDeck}
            mobile={mobile}
          />
          {deckLimit && (
            <p role="note" style={{ color: COLORS.ink, fontFamily: FONTS.body }}>
              Daily deck limit reached
              {resetTimeText(deckLimit.resetsAt)
                ? ` — resets at ${resetTimeText(deckLimit.resetsAt)}`
                : ''}
              .
            </p>
          )}
          {(customCards || Object.keys(customDecks ?? {}).length > 0) && (
            <VocabBrowse
              {...browseProps}
              showSelector={false}
              title={customCards ? deckTitle : ''}
              cards={customCards ?? []}
              emptyMessage={customCards ? '' : CUSTOM_PICK_COPY}
            />
          )}
        </div>
      )}

      {mode === 'practice' && (
        <div
          role="tabpanel"
          id={vocabPanelId('practice')}
          aria-labelledby={vocabTabId('practice')}
          style={{
            display: 'grid',
            // minmax(0, 1fr) rather than 1fr: a bare 1fr track keeps min-width
            // auto, so it refuses to shrink below its content's min-content width
            // and pushes past the viewport instead (377px inside 337px at 375px
            // wide). minmax(0, …) lets the track shrink and the content reflow.
            gridTemplateColumns: mobile ? 'minmax(0, 1fr)' : 'minmax(0, 448px) minmax(0, 1fr)',
            gap: mobile ? SPACE[4] : SPACE[8],
            marginTop: mobile ? SPACE[4] : SPACE[8],
          }}
        >
          <DeckPicker
            collapsible={mobile}
            deckId={deckId}
            onSelect={selectDeck}
            customDecks={customDecks}
            level={practiceLevel}
            interestDecks={interestPicker}
          />

          {/* ── Right column: active recall UI ── */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'stretch',
              textAlign: 'center',
              width: '100%',
              minWidth: 0,
            }}
          >
            {isAuto && deckLoading && (
              <div
                style={{
                  padding: SPACE[8],
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  fontFamily: FONTS.mono,
                  color: COLORS.mute,
                  width: '100%',
                }}
              >
                Loading deck…
              </div>
            )}
            {isAuto && deckError && (
              <StatusNote
                tone="error"
                icon={AlertTriangle}
                action={{ label: 'Retry', onClick: retry }}
              >
                Could not load this deck.
              </StatusNote>
            )}
            {deckComplete && (
              <DeckCompleteBanner
                learnedCount={learnedInDeck({
                  learnedByDeck,
                  learnedWords,
                  deckId,
                  cards: activeDeck,
                })}
                onPracticeAgain={() => {
                  setQueue(
                    getDueCards((loadState() ?? {}).srs ?? {}, activeDeck, deckId, Date.now())
                  );
                  setDeckComplete(false);
                }}
              />
            )}
            {card && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  width: '100%',
                  minWidth: 0,
                }}
              >
                {/* Progress bar */}
                {/* `flexWrap` is load-bearing, and it fixes a bug that predates
                the report button. Measured in Chrome at 320px:

                  before this change, no button ...... 73px sideways scroll
                  report button in the dots cluster .. 125px
                  this layout ........................ 0px

                DeckProgress's dots are `flex: 0 1 26px`, so they can shrink —
                but sharing a line with the "N cards remaining" label left them
                too little room to shrink into, and the strip stood at 305px in
                a 304px row. Giving the row `flexWrap` drops the strip onto its
                own line, where that shrink finally has somewhere to go: 288px
                at both 10 dots and 12, which is DOT_THRESHOLD and therefore the
                widest the strip can ever be. The report button then sits in the
                remaining-count group, where it costs the row nothing.

                So: do not remove flexWrap, and do not move the button back in
                beside the dots. Verified in a browser because jsdom computes no
                layout — the test below pins the property, not the pixels. */}
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                    alignItems: 'center',
                    gap: SPACE[2],
                    marginBottom: SPACE[4],
                    width: '100%',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: SPACE[2],
                    }}
                  >
                    <div
                      style={{
                        fontFamily: FONTS.mono,
                        fontSize: FONT_SIZE.tag,
                        letterSpacing: LETTER_SPACING.caps,
                        color: COLORS.mute,
                      }}
                    >
                      {queue.length} card{queue.length !== 1 ? 's' : ''} remaining
                    </div>
                    {/* itemLabel is card.de — the very thing CardFace conceals on
                    the Hören and Artikel decks. Captured for triage, never
                    rendered; see FeedbackDialog. */}
                    <FeedbackButton
                      context={{
                        surface: 'vocab',
                        level: practiceLevel,
                        deckId,
                        itemId: card.id,
                        itemLabel: card.de ?? null,
                      }}
                    />
                  </div>
                  <DeckProgress
                    cards={activeDeck}
                    learnedWords={learnedWords}
                    learnedByDeck={learnedByDeck}
                    deckId={deckId}
                  />
                </div>

                <CardFace
                  card={card}
                  display={drill?.display?.(card)}
                  conceal={drill?.conceal}
                  learned={isLearned({ learnedByDeck, learnedWords, deckId, cardId: card.id })}
                  mobile={mobile}
                />

                {drill?.kind === 'choice' && !answered && (
                  <ArticleChoice
                    articles={drill.options(activePack.grammar)}
                    onChoose={answerDrill}
                  />
                )}

                {drill?.speak && !answered && (
                  <button
                    type="button"
                    onClick={() => {
                      speak(drill.speak(card));
                      setPlayedCardId(card.id);
                    }}
                    aria-label={played ? 'Play the word again' : 'Play the word'}
                    // BUTTON.go, not BUTTON.tile. On a Hören card the audio IS
                    // the question, and nothing plays it but this — so until it
                    // has been pressed it is the primary action on the card, not
                    // a neutral one sitting quietly above the answer field.
                    style={{
                      ...(played ? BUTTON.tile : BUTTON.go),
                      width: '100%',
                      marginBottom: SPACE[3],
                    }}
                  >
                    {played ? 'PLAY AGAIN' : 'PLAY'}
                  </button>
                )}

                {drill?.kind === 'typed' && !answered && (
                  <TypedAnswer
                    value={typedAnswer}
                    onChange={setTypedAnswer}
                    onSubmit={() => typedAnswer.trim() && answerDrill(typedAnswer)}
                    label={drill.label(activePack.grammar)}
                    placeholder={drill.placeholder(activePack.grammar)}
                  />
                )}

                {showChoices && !answered && (
                  <ChoiceGrid choices={choices} onChoose={chooseOption} />
                )}

                {showTyped && !answered && (
                  <TypedAnswer
                    value={typedAnswer}
                    onChange={setTypedAnswer}
                    onSubmit={submitTyped}
                  />
                )}

                {answered && (
                  <VerdictPanel
                    // The gender drill asked for the article, so the answer it
                    // owes back is the full form "das Jahr" — not the English
                    // gloss, which was never the question.
                    result={result}
                    answer={drill ? drill.answer(card, activePack.grammar) : glossList(card)}
                    onVerdict={handleSrsVerdict}
                  />
                )}
              </div>
            )}
            {!card && !deckComplete && (
              <div
                style={{
                  padding: SPACE[8],
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  fontFamily: FONTS.mono,
                  fontSize: FONT_SIZE.base,
                  color: COLORS.mute,
                  width: '100%',
                }}
              >
                Select a deck to start.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
