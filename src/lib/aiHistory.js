// Saved tutor conversations, client side (spec 2026-10-02). The server writes
// them (api/_lib/aiHistory.js); the browser only reads and deletes its own
// under RLS, and flips the learner's consent flag. Nothing here is cached in
// localStorage: history is read when asked for and held in memory only, so a
// signed-out learner on a shared device leaves nothing behind.
//
// The consent flag, `settings.ai_history_enabled`, is deliberately NOT part of
// the local-first settings sync. It is account-level consent that the server
// re-checks on every write, so it is read from and written to the server
// directly; a last-write-wins merge has no business deciding it.
import { getSupabase } from './auth.js';

/** The most history messages the model is sent, live or resumed. */
export const HISTORY_WINDOW = 24;
/** A saved user message is capped server-side; the chat input enforces it here. */
export const MAX_USER_CHARS = 2000;
export const MAX_CONVERSATIONS = 20;

/**
 * The feature is dark until the owner switches it on. Read per call so tests
 * can stub it; Vite inlines it at build time, so flipping it needs a redeploy
 * (like VITE_PUSH_ENABLED).
 */
export function isAiHistoryConfigured() {
  return import.meta.env.VITE_AI_HISTORY_ENABLED === 'true';
}

export function newConversationId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : null;
}

/**
 * The last `size` history messages, always starting on a user turn. The model
 * only needs recent context, and a long resumed conversation would otherwise
 * resend ~250 tokens per turn of history on every call (spec §10).
 */
export function windowHistory(history, size = HISTORY_WINDOW) {
  const recent = history.slice(-size);
  const firstUser = recent.findIndex((m) => m.role === 'user');
  return firstUser === -1 ? [] : recent.slice(firstUser);
}

async function client() {
  const supabase = await getSupabase();
  if (!supabase) throw new Error('Not connected.');
  return supabase;
}

const unwrap = ({ data, error }) => {
  if (error) throw error;
  return data;
};

/** Whether this account has opted in. A missing settings row means "no". */
export async function fetchHistoryEnabled(userId) {
  const supabase = await client();
  const rows = unwrap(
    await supabase.from('settings').select('ai_history_enabled').eq('user_id', userId)
  );
  return rows?.[0]?.ai_history_enabled === true;
}

/**
 * Names only (user_id, ai_history_enabled), so the row's synced `data` is left
 * alone, and an older client's settings push never touches this column.
 */
export async function saveHistoryEnabled(userId, enabled) {
  const supabase = await client();
  unwrap(
    await supabase
      .from('settings')
      .upsert({ user_id: userId, ai_history_enabled: enabled === true }, { onConflict: 'user_id' })
  );
}

/** Newest first, at most 20 (the server's cap). */
export async function listConversations() {
  const supabase = await client();
  return unwrap(
    await supabase
      .from('ai_conversations')
      .select('id, scenario_id, level, message_count, last_message_at')
      .order('last_message_at', { ascending: false })
      .limit(MAX_CONVERSATIONS)
  );
}

/** One conversation's rows in order, at most 50. */
export async function loadConversation(id) {
  const supabase = await client();
  return unwrap(
    await supabase
      .from('ai_messages')
      .select('seq, role, content, hidden, model')
      .eq('conversation_id', id)
      .order('seq', { ascending: true })
  );
}

/** Messages go with it (cascade). Deleting a single message is not possible. */
export async function deleteConversation(id) {
  const supabase = await client();
  unwrap(await supabase.from('ai_conversations').delete().eq('id', id));
}

export async function deleteAllConversations(userId) {
  const supabase = await client();
  unwrap(await supabase.from('ai_conversations').delete().eq('user_id', userId));
}
