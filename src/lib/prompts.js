// The only place in src/ that holds AI prompt text.
//
// Each builder composes three things: engine framing prose, an engine-owned
// JSON output contract, and pack-supplied language fields. The contract stays
// engine-side deliberately — a pack that reworded it would break the calling
// component's JSON.parse at runtime, inside a catch that reports a connection
// error, so the real cause would never surface.
//
// NOTE: the JSON KEY names ("de", "ipa", "en") are the contract the components
// parse and are NOT substituted with the target language. Only the prose around
// them names the language.

/**
 * @typedef {object} Prompts
 * @property {string} persona
 * @property {string} targetLanguage
 * @property {Record<string, string>} levels     — chat pedagogy, lowercase keys
 * @property {Record<string, string>} exercises  — generation focus, lowercase keys
 * @property {{ cardExample: string, ipaExample: string }} deck
 */

/**
 * Vocabulary constraint block for chat. Language-blind: names no target
 * language and gives no language-specific examples. Empty vocab is a
 * first-session scaffold, not an error.
 *
 * @param {{ vocab?: string[], sparse?: boolean }} [args]
 * @returns {string}
 */
export function chatVocabConstraint({ vocab, sparse } = {}) {
  if (!vocab?.length) {
    return 'The learner is new and has no learned vocabulary yet. Stay with the simplest everyday words. Introduce at most one new word per reply and mark it in the English translation.';
  }
  const list = vocab.join(', ');
  const head = sparse
    ? 'The learner knows only a few words; this list includes a small starter set. Stay very simple.'
    : "Stay within the learner's known vocabulary.";
  return `${head} Prefer these terms: ${list}. Function words (articles, pronouns, auxiliaries) may be used freely. When you must introduce a new word, mark it clearly in the English translation and keep new words rare — at most one per turn.`;
}

/**
 * Short appendix the chat API folds into the system prompt after validating
 * the client-supplied level and vocab. Authoritative over client prose that
 * tries to raise the band.
 *
 * @param {{ level?: string, vocab?: string[] }} [args]
 * @returns {string}
 */
export function chatServerConstraint({ level, vocab } = {}) {
  const parts = ['Server constraint (authoritative):'];
  if (level) {
    parts.push(`Learner CEFR band: ${level}. Do not raise complexity above this band.`);
  }
  if (vocab?.length) {
    parts.push(
      `Prefer these known terms: ${vocab.join(', ')}. New words are rare and must be marked.`
    );
  }
  return parts.join(' ');
}

/**
 * Optional one-line bias toward enabled interest topics. Language-blind:
 * the caller supplies already-authored hints (pack English `promptHint`).
 * Empty hints → no sentence, so a learner with nothing enabled is unchanged.
 *
 * @param {{ hints?: string[] }} [args]
 * @returns {string}
 */
export function chatInterestBias({ hints } = {}) {
  const labels = (hints ?? []).filter((h) => typeof h === 'string' && h.trim());
  if (!labels.length) return '';
  return `The learner has opted into these interest topics: ${labels.join(', ')}. When it fits the current scenario, prefer related vocabulary they already know. Do not force a topic that does not fit.`;
}

/**
 * How freely the scene character improvises, keyed on the routed model
 * profile (src/lib/ai-routing/catalog.js). Engine-owned and language-blind:
 * a cheap model gets a tight brief, a capable one room to let the scene move.
 */
export const CHAT_IMPROV = Object.freeze({
  fast: 'Keep each reply short and focused on the task: one idea per turn.',
  balanced:
    'React to the specific things the learner says, and add small realistic touches to the scene.',
  capable:
    'Let the scene develop the way it would in real life: an item might be sold out, you might ask a follow-up question or add a small complication. Remember details the learner mentioned earlier and bring them back.',
});

/**
 * The hidden first user turn that lets the AI open the scene. The Messages API
 * needs a user message first; this one is stage direction, not learner speech.
 * @returns {string}
 */
export function chatKickoffMessage() {
  return '[The learner has just arrived. Open the scene in character with your first line. This bracketed note is stage direction, not something the learner said — do not correct it.]';
}

/**
 * The scene prompt. The AI plays the scenario's `role` in the reply line and,
 * separately, is the pack persona coaching out of character. `task` is
 * optional — when absent the sentence is omitted rather than left as an empty
 * clause, which a model reads as a task with no content.
 *
 * `level` is the classified CEFR code; unknown keys fall back to a1 pedagogy
 * rather than interpolating "undefined". `profile` is the routed model's
 * profile; unknown values get the balanced register.
 *
 * @param {{ prompts: Prompts, scenarioDesc: string, role?: { name: string, brief: string }, profile?: string, task?: string, level: string, vocab?: string[], sparse?: boolean, interestHints?: string[] }} args
 * @returns {string}
 */
export function chatSystemPrompt({
  prompts,
  scenarioDesc,
  role,
  profile,
  task,
  level,
  vocab,
  sparse,
  interestHints,
} = {}) {
  const { persona, targetLanguage, levels } = prompts ?? {};

  // Pack scenarios always carry a role (validate.js); the fallback keeps a
  // caller without one on a sensible partner instead of "You are undefined".
  const character = role?.brief || `${persona}, a friendly conversation partner.`;

  const taskLine = task
    ? `The learner's current task is: "${task}". Stay in this scenario and guide them toward completing this task. When the task is naturally complete, include "taskComplete": true in your JSON response; otherwise omit it or set it to false.`
    : '';

  const pedagogy = levels?.[level] || levels?.a1 || '';
  const improv = CHAT_IMPROV[profile] ?? CHAT_IMPROV.balanced;
  const vocabBlock = chatVocabConstraint({ vocab, sparse });
  const interestBlock = chatInterestBias({ hints: interestHints });

  return `You are ${character} This is a ${targetLanguage} conversation-practice scene: ${scenarioDesc}. Stay in character in the "de" line and carry the scene the way this character really would. Respond to what the learner actually says — never use stock phrases or follow a script.

Separately, you are also ${persona}, the learner's warm and encouraging coach. Coaching goes only in "correction" and "next" — never break character in "de". ${taskLine}

${pedagogy}

${improv}

${vocabBlock}
${interestBlock ? `\n${interestBlock}\n` : ''}
You MUST always respond with strict JSON only (no markdown, no extra text):
{
  "de": "your in-character reply in ${targetLanguage}",
  "ipa": "IPA pronunciation of the ${targetLanguage}",
  "en": "English translation",
  "correction": null OR { "original": "what they said", "fixed": "corrected ${targetLanguage}", "explain": "brief friendly explanation in English" },
  "taskComplete": false,
  "next": {
    "de": "a short, natural line the learner could say next in ${targetLanguage}, at their level, moving toward the task",
    "en": "its English meaning",
    "blank": "exactly one word copied from next.de that is worth practising (not a name)",
    "distractors": ["two plausible wrong alternatives for blank, same word class"]
  }
}

Only provide "correction" if the learner made a real grammar/vocabulary mistake; it is always null for your opening line.`;
}

/**
 * B1 free-typed translation grader.
 * @param {{ prompts: Prompts }} args
 * @returns {string}
 */
export function graderSystemPrompt({ prompts }) {
  const { targetLanguage } = prompts;

  return `You are a ${targetLanguage} language grader. The learner was asked to translate an English sentence into ${targetLanguage}.
Evaluate their answer strictly but fairly. Respond ONLY with valid JSON, no markdown:
{
  "verdict": "correct" | "almost" | "wrong",
  "corrected": "the ideal ${targetLanguage} translation",
  "message": "one sentence of feedback in English explaining the main error or praising them"
}
Use "correct" if the translation is grammatically correct and conveys the full meaning, even if phrasing differs from the ideal.
Use "almost" if there's a minor issue (a typo, a small grammar slip, a slightly off article or case) but the meaning is clearly there.
Use "wrong" if there's a significant grammar mistake, wrong word choice, or the meaning is not conveyed.`;
}

/**
 * Custom vocabulary deck generation.
 * @param {{ prompts: Prompts, topic: string }} args
 * @returns {{ system: string, user: string }}
 */
export function deckPrompts({ prompts, topic }) {
  const { targetLanguage, deck } = prompts;

  return {
    system: `You generate ${targetLanguage} vocabulary flashcards for a beginner. Respond with ONLY a JSON array, no markdown, no extra text.`,
    user: `Generate exactly 10 ${targetLanguage} flashcards on the topic: "${topic}". Return JSON array of objects with keys: de (${targetLanguage} word with article if noun, e.g. "${deck.cardExample}"), en (English translation), ipa (IPA pronunciation in brackets like "${deck.ipaExample}"). No other text.`,
  };
}

/**
 * Scenes a generated translation batch is set in, so a batch reads like a
 * situation rather than five unrelated textbook lines. English and
 * language-blind: they steer the content, the pack supplies the language.
 */
export const SENTENCE_TOPICS = Object.freeze([
  'travel: at the airport, the train station and the hotel',
  'daily life: morning routine, chores and errands',
  'computer science: programming, debugging and computers at work',
  'football: watching a match, the fans and the results',
  'a rock concert: tickets, the band and the crowd',
  'ordering food at a restaurant with strict dietary requests (no vegetables, no onions, no pickles)',
  'shopping for clothes and asking about sizes',
  'at the doctor: symptoms and appointments',
  'weekend plans with friends',
  'the weather and the seasons',
]);

/**
 * Fresh translation exercises when a level's sentence bank runs out. One JSON
 * shape at every level — Chat's `next` suggestion — because every mode
 * renders from it: the word bank from `de`, the gap modes from `blank`.
 *
 * @param {{ prompts: Prompts, level: string, topic: string }} args
 * @returns {{ system: string, user: string }}
 */
export function sentencePrompts({ prompts, level, topic }) {
  const { targetLanguage, exercises } = prompts;

  return {
    system: `You generate ${targetLanguage} translation exercises for ${exercises[level]} learners. Respond ONLY with valid JSON array, no markdown.`,
    user: `Generate 5 English sentences for translation into ${targetLanguage} at ${level.toUpperCase()} level, all set in this scene: ${topic}. Make them varied and specific to the scene, not generic. Return: [{"en":"the English sentence","de":"its ${targetLanguage} translation","blank":"exactly one word copied from de that is worth practising (not a name)","distractors":["two plausible wrong alternatives for blank, same word class"],"note":"the grammar concept"}]`,
  };
}
