import { callClaude } from '../../lib/claude';
import { activePack } from '../../packs';
import { sentencePrompts, SENTENCE_TOPICS } from '../../lib/prompts';
import { clampMode } from '../../lib/levelGate';
import { getUserLevel } from '../../lib/levelPref';

// crypto rather than Math.random for the same reason as chat/WordBank's
// jumble: nothing here is secret, but it keeps Sonar's S2245 off the PR.
function randomTopic() {
  const [n] = crypto.getRandomValues(new Uint32Array(1));
  return SENTENCE_TOPICS[n % SENTENCE_TOPICS.length];
}

const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0;

// Generates 5 fresh translation exercises, set in one scene, when the built-in
// sentence bank is exhausted. Rows without an English prompt and a German
// answer are dropped — every mode needs both — and an empty batch throws so
// the caller falls back to reshuffling the bank.
export async function generateMoreSentences(level, topic = randomTopic()) {
  const gated = clampMode(level, getUserLevel());
  const { system, user } = sentencePrompts({ prompts: activePack.prompts, level: gated, topic });
  const raw = await callClaude(system, user, [], {
    endpoint: 'grade',
    routingContext: { taskType: 'grammar_generation', userTier: 'guest' },
  });
  const rows = JSON.parse(raw.replace(/```json|```/g, '').trim());
  const usable = Array.isArray(rows) ? rows.filter((r) => nonEmpty(r?.en) && nonEmpty(r?.de)) : [];
  if (usable.length === 0) throw new Error('No usable sentences generated');
  return usable;
}
