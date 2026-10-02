import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const backend = vi.hoisted(() => ({ client: null }));
vi.mock('./auth.js', () => ({ getSupabase: async () => backend.client }));

import {
  HISTORY_WINDOW,
  MAX_USER_CHARS,
  isAiHistoryConfigured,
  newConversationId,
  windowHistory,
  fetchHistoryEnabled,
  saveHistoryEnabled,
  listConversations,
  loadConversation,
  deleteConversation,
  deleteAllConversations,
} from './aiHistory.js';

// A recording stand-in for the query builder: every call is appended to
// `calls`, and awaiting the chain yields the configured result.
function fakeClient(result = { data: [], error: null }) {
  const calls = [];
  const chain = (table) => {
    const q = new Proxy(
      {},
      {
        get: (_t, prop) => {
          if (prop === 'then')
            return (resolve, reject) => Promise.resolve(result).then(resolve, reject);
          return (...args) => {
            calls.push([table, prop, ...args]);
            return q;
          };
        },
      }
    );
    return q;
  };
  return { calls, client: { from: (table) => chain(table) } };
}

const turns = (n) =>
  Array.from({ length: n }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `m${i}`,
  }));

beforeEach(() => {
  backend.client = null;
});
afterEach(() => vi.unstubAllEnvs());

describe('constants', () => {
  it('match the server caps and the design', () => {
    expect(HISTORY_WINDOW).toBe(24);
    expect(MAX_USER_CHARS).toBe(2000);
  });
});

describe('isAiHistoryConfigured', () => {
  it('is off unless the flag is exactly "true"', () => {
    expect(isAiHistoryConfigured()).toBe(false);
    vi.stubEnv('VITE_AI_HISTORY_ENABLED', 'yes');
    expect(isAiHistoryConfigured()).toBe(false);
    vi.stubEnv('VITE_AI_HISTORY_ENABLED', 'true');
    expect(isAiHistoryConfigured()).toBe(true);
  });
});

describe('newConversationId', () => {
  it('is a fresh uuid each time', () => {
    const a = newConversationId();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(newConversationId()).not.toBe(a);
  });
});

describe('windowHistory', () => {
  it('leaves a short history alone', () => {
    expect(windowHistory(turns(6))).toEqual(turns(6));
    expect(windowHistory([])).toEqual([]);
  });

  it('keeps the last 24 of a long, alternating history, starting on a user turn', () => {
    const out = windowHistory(turns(60));
    expect(out).toHaveLength(24);
    expect(out[0].role).toBe('user');
    expect(out.at(-1)).toEqual(turns(60).at(-1));
  });

  it('drops a leading assistant turn rather than start the model on one', () => {
    const out = windowHistory(turns(61));
    expect(out[0].role).toBe('user');
    expect(out).toHaveLength(23);
  });

  it('returns nothing when the window holds no user turn at all', () => {
    expect(windowHistory([{ role: 'assistant', content: 'a' }])).toEqual([]);
  });

  it('honours a custom size', () => {
    expect(windowHistory(turns(10), 4)).toEqual(turns(10).slice(-4));
  });
});

describe('server calls', () => {
  it('reads the opt-in flag, treating a missing row as off', async () => {
    let f = fakeClient({ data: [{ ai_history_enabled: true }], error: null });
    backend.client = f.client;
    expect(await fetchHistoryEnabled('u1')).toBe(true);
    expect(f.calls).toContainEqual(['settings', 'select', 'ai_history_enabled']);
    expect(f.calls).toContainEqual(['settings', 'eq', 'user_id', 'u1']);

    f = fakeClient({ data: [], error: null });
    backend.client = f.client;
    expect(await fetchHistoryEnabled('u1')).toBe(false);
  });

  it('writes only user_id and the flag, so synced `data` is untouched', async () => {
    const f = fakeClient();
    backend.client = f.client;
    await saveHistoryEnabled('u1', true);
    expect(f.calls).toEqual([
      [
        'settings',
        'upsert',
        { user_id: 'u1', ai_history_enabled: true },
        { onConflict: 'user_id' },
      ],
    ]);
  });

  it('lists newest first, capped at 20', async () => {
    const f = fakeClient({ data: [{ id: 'c' }], error: null });
    backend.client = f.client;
    expect(await listConversations()).toEqual([{ id: 'c' }]);
    expect(f.calls).toContainEqual([
      'ai_conversations',
      'order',
      'last_message_at',
      { ascending: false },
    ]);
    expect(f.calls).toContainEqual(['ai_conversations', 'limit', 20]);
  });

  it('loads one conversation in seq order', async () => {
    const f = fakeClient({ data: [{ seq: 1 }], error: null });
    backend.client = f.client;
    await loadConversation('c1');
    expect(f.calls).toContainEqual(['ai_messages', 'eq', 'conversation_id', 'c1']);
    expect(f.calls).toContainEqual(['ai_messages', 'order', 'seq', { ascending: true }]);
  });

  it('deletes one conversation, and all of a learner’s', async () => {
    const f = fakeClient();
    backend.client = f.client;
    await deleteConversation('c1');
    await deleteAllConversations('u1');
    expect(f.calls).toContainEqual(['ai_conversations', 'delete']);
    expect(f.calls).toContainEqual(['ai_conversations', 'eq', 'id', 'c1']);
    expect(f.calls).toContainEqual(['ai_conversations', 'eq', 'user_id', 'u1']);
    // Never the messages table: a single message cannot be deleted.
    expect(f.calls.some(([table]) => table === 'ai_messages')).toBe(false);
  });

  it('throws the server error, and when there is no client', async () => {
    backend.client = fakeClient({ data: null, error: new Error('rls') }).client;
    await expect(listConversations()).rejects.toThrow('rls');
    backend.client = null;
    await expect(listConversations()).rejects.toThrow('Not connected');
  });
});
