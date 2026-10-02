import { serviceClient } from './supabase.js';

// Opt-in tutor conversation history, write side (spec 2026-10-02 §7).
//
// The chat handler calls persist() once, after a SUCCESSFUL upstream reply. It
// stores the last user message of the request and the reply it just received,
// as one atomic pair, through the append_ai_turn RPC (service role only). It
// never stores earlier history from the request, so a client cannot smuggle a
// forged assistant turn into storage.
//
// Best-effort by design: a failure to save never fails the learner's reply and
// never refunds quota. Consent is checked again inside the RPC (the learner's
// settings.ai_history_enabled), so "off on either side" means not saved.
//
// off (default): nothing is written. on: signed-in, opted-in learners only.
const SAVE_TIMEOUT_MS = 2000;
export const MAX_USER_CHARS = 2000;
export const MAX_ASSISTANT_CHARS = 6000;
const LEVELS = ['a1', 'a2', 'b1'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function historyMode(env = process.env) {
  return String(env.AI_HISTORY_MODE ?? '').toLowerCase() === 'on' ? 'on' : 'off';
}

// Reasons only. Never content, user id, conversation id, token or address.
const log = (reason) => console.warn(JSON.stringify({ event: 'ai_history_write_failed', reason }));

const asObject = (body) => {
  let raw = body;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : null;
};

/**
 * The request's optional `conversation` block.
 * @returns {undefined | null | { id: string, scenario: string, kickoff: boolean, level: string }}
 *   undefined = the request carries no block (not a saving request);
 *   null = a block that is present but invalid (ignored, reported as not saved).
 */
export function parseConversation(rawBody) {
  const raw = asObject(rawBody);
  if (!raw || raw.conversation === undefined) return undefined;
  const c = raw.conversation;
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  if (typeof c.id !== 'string' || !UUID.test(c.id)) return null;
  const scenario = typeof c.scenario === 'string' ? c.scenario.trim() : '';
  if (scenario.length < 1 || scenario.length > 40) return null;
  const level = typeof raw.level === 'string' ? raw.level.toLowerCase() : '';
  return {
    id: c.id.toLowerCase(),
    scenario,
    kickoff: c.kickoff === true,
    level: LEVELS.includes(level) ? level : 'a1',
  };
}

// The model's text blocks joined, exactly as the client does (callClaude);
// thinking and other block types are never stored.
const replyText = (data) =>
  Array.isArray(data?.content)
    ? data.content
        .filter((b) => b?.type === 'text' && typeof b.text === 'string')
        .map((b) => b.text)
        .join('\n')
    : '';

export function createHistory({ getClient = serviceClient, env = process.env } = {}) {
  /**
   * @returns {Promise<undefined | boolean>} undefined when the request asked for
   *   nothing; otherwise whether the turn was saved (drives X-Conversation-Saved).
   */
  async function persist({ caller, rawBody, safeBody, data }) {
    const conversation = parseConversation(rawBody);
    if (conversation === undefined) return undefined;
    if (conversation === null) return false;
    if (historyMode(env) !== 'on') return false;
    if (caller.kind !== 'user' || caller.degraded) return false;

    const last = safeBody.messages[safeBody.messages.length - 1];
    const assistant = replyText(data);
    if (
      last?.role !== 'user' ||
      last.content.length < 1 ||
      last.content.length > MAX_USER_CHARS ||
      assistant.length < 1 ||
      assistant.length > MAX_ASSISTANT_CHARS
    ) {
      return false;
    }

    const client = getClient();
    if (!client) return false;

    let timer;
    const timeout = new Promise((resolve) => {
      timer = setTimeout(resolve, SAVE_TIMEOUT_MS, 'timeout');
    });
    try {
      const result = await Promise.race([
        client.rpc('append_ai_turn', {
          p_user: caller.userId,
          p_conversation: conversation.id,
          p_scenario: conversation.scenario,
          p_level: conversation.level,
          p_user_text: last.content,
          p_hidden: conversation.kickoff,
          p_assistant_text: assistant,
          p_model: safeBody.model,
        }),
        timeout,
      ]);
      if (result === 'timeout') {
        log('timeout');
        return false;
      }
      if (result?.error) {
        log('rpc_error');
        return false;
      }
      // {saved:false, reason:'disabled'} is the learner's own choice, not a fault.
      return result?.data?.saved === true;
    } catch {
      log('rpc_threw');
      return false;
    } finally {
      clearTimeout(timer);
    }
  }

  return { persist };
}
