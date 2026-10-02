import { useState, useEffect, useRef, useMemo } from 'react';
import { COLORS, FONT_BODY, FONT_SIZE, SPACE, RADIUS } from '../lib/theme';
import { callClaude, QuotaExhaustedError } from '../lib/claude';
import { chatSystemPrompt, chatKickoffMessage } from '../lib/prompts';
import { classifiedLevel } from '../lib/levelGate';
import { getUserLevel } from '../lib/levelPref';
import { buildChatAllowlist, scenariosForLevel } from '../lib/chatVocab';
import { interestPromptHints } from '../lib/interests';
import { sanitizePreferredModel, userTierOf } from '../lib/ai-routing/preference.js';
import { routeAiRequest } from '../lib/ai-routing/router.js';
import { advance, parseScaffold, startingStage } from '../lib/chatInputModes';
import ModelPopover from './ModelPopover';
import Button from './ui/Button';
import { activePack } from '../packs';
const {
  scenarios: SCENARIOS,
  chatTasks: CHAT_TASKS,
  decks: PACK_DECKS,
  interestDecks: PACK_INTEREST_DECKS,
  interestTopics: INTEREST_TOPICS,
} = activePack.content;
import { recordEvent } from '../lib/stats';
import { newConversationId, windowHistory } from '../lib/aiHistory';
import { useAiHistoryEnabled } from '../lib/useAiHistoryEnabled';
import WelcomeBanner from './chat/WelcomeBanner';
import ScenarioPicker from './chat/ScenarioPicker';
import TaskPanel from './chat/TaskPanel';
import MessageList from './chat/MessageList';
import QuotaNote from './chat/QuotaNote';
import Composer from './chat/Composer';

const WELCOME_KEY = 'deutsch-welcome-dismissed';

// Pack field `de` is the surface form (recorded AGENTS.md exception). The
// engine never reads it; this callback is how Chat resolves card ids.
const termOf = (card) => card.de;

// The reply as the JSON object the prompt contracts for, fenced or not.
const parseReply = (raw) => JSON.parse(raw.replace(/```json|```/g, '').trim());

const errorReply = (err) => ({
  role: 'assistant',
  de: 'Entschuldigung, ein Fehler.',
  ipa: '[ɛntˈʃʊldɪɡʊŋ aɪ̯n ˈfeːlɐ]',
  en: 'Sorry — ' + err.message,
});

const assistantTurn = (parsed) => ({
  role: 'assistant',
  de: parsed.de,
  ipa: parsed.ipa,
  en: parsed.en,
  next: parsed.next,
});

// What the model sees of a turn. Its own replies go back as the JSON it wrote,
// `next` included, so every example in its context keeps the full contract
// and it does not learn to drop the suggestion.
const toHistory = (m) => ({
  role: m.role,
  content:
    m.role === 'user' ? m.de : JSON.stringify({ de: m.de, ipa: m.ipa, en: m.en, next: m.next }),
});

export default function ChatTab({
  mobile = false,
  wide = true,
  learnedWords = {},
  learnedByDeck = {},
  enabledInterests = [],
  preferredModel = 'auto',
  onPreferredModelChange,
  user = null,
  onSignIn = null,
}) {
  // Classified CEFR is the source of truth. A `level` prop (still passed by
  // App for tab-API consistency) cannot raise the band.
  const chatLevel = classifiedLevel(getUserLevel());
  const visibleScenarios = useMemo(
    () => scenariosForLevel(SCENARIOS, CHAT_TASKS, chatLevel),
    [chatLevel]
  );
  const { vocab, sparse } = useMemo(
    () =>
      buildChatAllowlist({
        learnedByDeck,
        learnedWords,
        decks: { ...PACK_DECKS, ...PACK_INTEREST_DECKS },
        termOf,
      }),
    [learnedByDeck, learnedWords]
  );
  const interestHints = useMemo(
    () => interestPromptHints(INTEREST_TOPICS, enabledInterests),
    [enabledInterests]
  );

  const [scenario, setScenario] = useState(() => visibleScenarios[0]?.id ?? 'free');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [taskIdx, setTaskIdx] = useState(0);
  const [hintVisible, setHintVisible] = useState(false);
  const [progression, setProgression] = useState(() => ({
    stage: startingStage(chatLevel),
    streak: 0,
    moved: null,
  }));
  const [scaffold, setScaffold] = useState(null);
  const [openerFailed, setOpenerFailed] = useState(false);
  // A spent daily allowance is a state of the thread, not a reply in it.
  const [quotaError, setQuotaError] = useState(null);
  const [tasksCompleted, setTasksCompleted] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(() => {
    try {
      return localStorage.getItem(WELCOME_KEY) !== '1';
    } catch {
      return false;
    }
  });
  const dismissWelcome = () => {
    try {
      localStorage.setItem(WELCOME_KEY, '1');
    } catch {
      /* ignore */
    }
    setWelcomeVisible(false);
  };
  const savedHistory = useAiHistoryEnabled(user?.id);
  // One id per scene, minted when the scene opens and sent only while saving
  // is on. A new scene is a new conversation.
  const conversationIdRef = useRef(null);
  const recognitionRef = useRef(null);
  const messagesEndRef = useRef(null);
  // Bumped whenever a scene (re)opens. A reply that comes back carrying an
  // older value belongs to a scene the learner already left, and is dropped.
  const sceneRef = useRef(0);

  const tasks = CHAT_TASKS[scenario]?.[chatLevel] ?? [];
  const currentTask = tasks[taskIdx % Math.max(tasks.length, 1)] ?? null;
  const stacked = !wide;

  useEffect(() => {
    if (visibleScenarios.some((s) => s.id === scenario)) return;
    setScenario(visibleScenarios[0]?.id ?? 'free');
  }, [visibleScenarios, scenario]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  useEffect(() => {
    setTaskIdx(0);
    setHintVisible(false);
    setTasksCompleted(false);
  }, [scenario, chatLevel]);

  const scene = SCENARIOS.find((s) => s.id === scenario);
  const routingContext = {
    taskType: 'chat',
    userTier: userTierOf(user),
    preferredModel: sanitizePreferredModel(preferredModel),
  };
  // The profile of the model that will actually answer — a saved pick above
  // the plan falls back — so the prompt's improv register matches it.
  const { profile } = routeAiRequest(routingContext);
  const callOptions = { routingContext, level: chatLevel, vocab };
  // Asks the server to keep this turn. Consent is checked again server-side;
  // this only decides whether to ask. Never for a guest or an opted-out learner.
  const conversationFor = (kickoff) =>
    savedHistory.enabled && conversationIdRef.current
      ? { id: conversationIdRef.current, scenario, kickoff }
      : undefined;

  const systemPromptFor = (task) =>
    chatSystemPrompt({
      prompts: activePack.prompts,
      scenarioDesc: scene?.desc || 'open conversation',
      role: scene?.role,
      profile,
      task: task?.task,
      level: chatLevel,
      vocab,
      sparse,
      interestHints,
    });

  // The AI speaks first, in character. The hidden kickoff gives it a user turn
  // to answer and stays in history, so the model always sees its own opener.
  const openScene = async () => {
    const id = ++sceneRef.current;
    conversationIdRef.current = newConversationId();
    const kickoff = { role: 'user', de: chatKickoffMessage(), hidden: true };
    setMessages([kickoff]);
    setScaffold(null);
    setProgression({ stage: startingStage(chatLevel), streak: 0, moved: null });
    setOpenerFailed(false);
    setQuotaError(null);
    setThinking(true);
    try {
      // tasks[0]: a scene opens on its first task. taskIdx can still hold the
      // previous scenario's index until the reset effect's update lands.
      const raw = await callClaude(systemPromptFor(tasks[0]), kickoff.de, [], {
        ...callOptions,
        conversation: conversationFor(true),
      });
      if (id !== sceneRef.current) return;
      const parsed = parseReply(raw);
      setMessages([kickoff, assistantTurn(parsed)]);
      setScaffold(parseScaffold(parsed.next));
    } catch (err) {
      if (id !== sceneRef.current) return;
      if (err instanceof QuotaExhaustedError) {
        setQuotaError(err);
        return;
      }
      setMessages([kickoff, errorReply(err)]);
      setOpenerFailed(true);
    } finally {
      if (id === sceneRef.current) setThinking(false);
    }
  };

  useEffect(() => {
    void openScene();
    // Only a new scene (scenario or level) re-opens. Vocab, model and task
    // changes apply from the next turn; re-opening would wipe the thread.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenario, chatLevel]);

  const startListening = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert('Speech recognition not supported in this browser. Try Chrome.');
      return;
    }
    const rec = new SR();
    rec.lang = 'de-DE';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      setInput(text);
      setListening(false);
      setTimeout(() => sendMessage(text), 100);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
    recognitionRef.current = rec;
    setListening(true);
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const sendMessage = async (overrideText) => {
    const text = overrideText ?? input;
    if (!text.trim() || thinking) return;
    const id = sceneRef.current;
    // Only the recent turns go to the model, however long the thread is.
    const history = windowHistory(messages.map(toHistory));
    setMessages((m) => [...m, { role: 'user', de: text }]);
    setInput('');
    setOpenerFailed(false);
    setQuotaError(null);
    setThinking(true);

    try {
      const raw = await callClaude(systemPromptFor(currentTask), text, history, {
        ...callOptions,
        conversation: conversationFor(false),
      });
      if (id !== sceneRef.current) return;
      const parsed = parseReply(raw);
      setMessages((m) => {
        const thread = [...m];
        for (let i = thread.length - 1; i >= 0; i--) {
          if (thread[i].role === 'user') {
            thread[i] = {
              ...thread[i],
              graded: true,
              correction: parsed.correction || null,
            };
            break;
          }
        }
        thread.push(assistantTurn(parsed));
        return thread;
      });
      setScaffold(parseScaffold(parsed.next));
      setProgression((p) => advance(p, Boolean(parsed.correction)));
      recordEvent('chat', chatLevel, parsed.correction ? 'wrong' : 'correct');
      if (parsed.taskComplete) {
        const nextIdx = (taskIdx + 1) % Math.max(tasks.length, 1);
        if (nextIdx === 0) setTasksCompleted(true);
        setTaskIdx(nextIdx);
        setHintVisible(false);
      }
    } catch (err) {
      if (id !== sceneRef.current) return;
      if (err instanceof QuotaExhaustedError) {
        setQuotaError(err);
        return;
      }
      setMessages((m) => [...m, errorReply(err)]);
    } finally {
      if (id === sceneRef.current) setThinking(false);
    }
  };

  // One compact control, rendered in exactly one of the two slots below. It
  // used to be the full 2×2 grid: labelled in the wide aside, wrapped in a
  // `<details>` when stacked. Chat is the conversation; the model is a setting
  // you glance at, so it collapses to its current value and opens on demand.
  // Settings still renders the grid always-visible.
  const modelControl = (
    <ModelPopover
      value={preferredModel}
      onChange={onPreferredModelChange}
      userTier={userTierOf(user)}
    />
  );

  return (
    <>
      {welcomeVisible && <WelcomeBanner mobile={mobile} onDismiss={dismissWelcome} />}
      <div
        style={{
          display: 'grid',
          // minmax(0, …) rather than a bare 1fr: 1fr keeps min-width auto, so
          // the track refused to shrink below its content and pushed the page
          // 190px past a 375px viewport.
          // Two columns (220 + conversation) wait for `bp.wide` rather than
          // `!mobile`: 640–719 used to paint a three-column chat sideways.
          gridTemplateColumns: wide ? '220px minmax(0, 1fr)' : 'minmax(0, 1fr)',
          gap: mobile ? 16 : 24,
          minHeight: mobile ? 'auto' : 'calc(100vh - 280px)',
        }}
      >
        <aside style={{ minWidth: 0 }}>
          <ScenarioPicker
            scenario={scenario}
            setScenario={setScenario}
            mobile={mobile}
            level={chatLevel}
            scenarios={visibleScenarios}
          />

          {currentTask && (
            <TaskPanel
              currentTask={currentTask}
              taskIdx={taskIdx}
              tasksCompleted={tasksCompleted}
              hintVisible={hintVisible}
              setHintVisible={setHintVisible}
              compact={stacked}
              level={chatLevel}
              onResetTasks={() => {
                setTasksCompleted(false);
                setTaskIdx(0);
              }}
            />
          )}

          {!stacked && <div style={{ marginTop: SPACE[5] }}>{modelControl}</div>}
        </aside>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            borderRadius: RADIUS.lg,
            overflow: 'hidden',
            background: COLORS.surface,
            border: `1px solid ${COLORS.border}`,
            minWidth: 0,
          }}
        >
          <MessageList
            key={scenario}
            messages={messages}
            thinking={thinking}
            endRef={messagesEndRef}
            compact={mobile}
            speaker={scene?.role?.name}
          />

          {quotaError && <QuotaNote error={quotaError} onSignIn={onSignIn} />}
          {openerFailed && !thinking && (
            <div style={{ padding: `0 ${SPACE[4]}px ${SPACE[3]}px`, background: COLORS.surface }}>
              <Button variant="secondary" size="sm" onClick={openScene}>
                Try again
              </Button>
            </div>
          )}
          <Composer
            stage={progression.stage}
            moved={progression.moved}
            scaffold={scaffold}
            turnKey={messages.length}
            thinking={thinking}
            onSend={sendMessage}
            onChooseStage={(stage) => setProgression({ stage, streak: 0, moved: null })}
            freeText={{
              input,
              setInput,
              listening,
              onStartListening: startListening,
              onStopListening: stopListening,
            }}
          />
          <div
            style={{
              padding: `0 ${SPACE[4]}px ${SPACE[3]}px`,
              background: COLORS.paperDeep,
              fontFamily: FONT_BODY,
              fontSize: FONT_SIZE.sm,
              fontStyle: 'italic',
              color: COLORS.mute,
            }}
          >
            {activePack.prompts.persona} corrects as you go.
          </div>
        </div>

        {/* Stacked keeps the control BELOW the thread, where the `<details>`
            used to sit: on a phone the conversation owns the top of the
            screen, and a model chip above it would push the first message
            down for a setting nobody opens mid-sentence. */}
        {stacked && <div style={{ minWidth: 0 }}>{modelControl}</div>}
      </div>
    </>
  );
}
