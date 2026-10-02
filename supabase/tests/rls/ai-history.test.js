import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { adminClient, anonClient, createSignedInUser } from './helpers.js';

// AI Tutor conversation history, 20261008120000. Covers the isolation grants,
// the one write RPC (append_ai_turn), the caps it enforces in SQL, and purge.
//
// Requires the local stack: `supabase start` (Docker), then `npm run test:rls`.

const admin = adminClient();

let A;
let B;
let off; // never opted in

const append = (user, conversation, over = {}) =>
  admin.rpc('append_ai_turn', {
    p_user: user.id,
    p_conversation: conversation,
    p_scenario: 'cafe',
    p_level: 'a1',
    p_user_text: 'Hallo',
    p_hidden: false,
    p_assistant_text: '{"de":"Hallo!"}',
    p_model: 'claude-haiku-4-5-20251001',
    ...over,
  });

const optIn = (user) =>
  admin.from('settings').upsert({ user_id: user.id, data: {}, ai_history_enabled: true });

const rowsOf = async (user, conversation) => {
  const { data, error } = await admin
    .from('ai_messages')
    .select('seq, role, hidden')
    .eq('user_id', user.id)
    .eq('conversation_id', conversation)
    .order('seq');
  if (error) throw error;
  return data;
};

beforeAll(async () => {
  A = await createSignedInUser('hist-a');
  B = await createSignedInUser('hist-b');
  off = await createSignedInUser('hist-off');
  await optIn(A);
  await optIn(B);
  await admin.from('settings').upsert({ user_id: off.id, data: {} });
});

afterAll(async () => {
  for (const user of [A, B, off]) {
    if (user?.id) await admin.from('ai_conversations').delete().eq('user_id', user.id);
  }
});

describe('append_ai_turn: privilege', () => {
  it.each([
    ['anon', () => anonClient()],
    ['a signed-in learner', () => A.client],
  ])('%s cannot execute it', async (_label, client) => {
    const { error } = await client().rpc('append_ai_turn', {
      p_user: A.id,
      p_conversation: randomUUID(),
      p_scenario: 'cafe',
      p_level: 'a1',
      p_user_text: 'x',
      p_hidden: false,
      p_assistant_text: 'y',
      p_model: null,
    });
    expect(error).not.toBeNull();
  });

  it('cannot execute purge either', async () => {
    const { error } = await A.client.rpc('purge_ai_conversations');
    expect(error).not.toBeNull();
  });
});

describe('append_ai_turn: consent', () => {
  it('saves nothing for a learner who has not opted in', async () => {
    const id = randomUUID();
    const { data, error } = await append(off, id);
    expect(error).toBeNull();
    expect(data).toEqual({ saved: false, reason: 'disabled' });
    expect(await rowsOf(off, id)).toEqual([]);
  });

  it('saves nothing for a learner with no settings row at all', async () => {
    const ghost = await createSignedInUser('hist-ghost');
    const { data } = await append(ghost, randomUUID());
    expect(data).toEqual({ saved: false, reason: 'disabled' });
  });

  it('stops saving the moment the flag is turned off', async () => {
    const user = await createSignedInUser('hist-toggle');
    await optIn(user);
    const id = randomUUID();
    expect((await append(user, id)).data.saved).toBe(true);
    await admin.from('settings').update({ ai_history_enabled: false }).eq('user_id', user.id);
    expect((await append(user, id)).data).toEqual({ saved: false, reason: 'disabled' });
    expect(await rowsOf(user, id)).toHaveLength(2);
    await admin.from('ai_conversations').delete().eq('user_id', user.id);
  });
});

describe('append_ai_turn: validation', () => {
  it.each([
    ['an unknown level', { p_level: 'c2' }],
    ['an empty scenario', { p_scenario: '' }],
    ['an over-long scenario', { p_scenario: 'x'.repeat(41) }],
    ['an empty user message', { p_user_text: '' }],
    ['a user message over 2,000 characters', { p_user_text: 'x'.repeat(2001) }],
    ['an assistant message over 6,000 characters', { p_assistant_text: 'x'.repeat(6001) }],
  ])('rejects %s', async (_label, over) => {
    const id = randomUUID();
    const { error } = await append(A, id, over);
    expect(error?.code).toBe('22023');
    expect(await rowsOf(A, id)).toEqual([]);
  });
});

describe('append_ai_turn: shape', () => {
  it('writes the pair atomically with increasing seq, user then assistant', async () => {
    const id = randomUUID();
    await append(A, id, { p_hidden: true });
    const { data } = await append(A, id);
    expect(data).toMatchObject({ saved: true, seq: 4, message_count: 4 });
    expect(await rowsOf(A, id)).toEqual([
      { seq: 1, role: 'user', hidden: true },
      { seq: 2, role: 'assistant', hidden: false },
      { seq: 3, role: 'user', hidden: false },
      { seq: 4, role: 'assistant', hidden: false },
    ]);
  });

  it('keeps the scenario and level a conversation was created with', async () => {
    const id = randomUUID();
    await append(A, id, { p_scenario: 'cafe', p_level: 'a1' });
    await append(A, id, { p_scenario: 'other', p_level: 'b1' });
    const { data } = await admin
      .from('ai_conversations')
      .select('scenario_id, level')
      .eq('user_id', A.id)
      .eq('id', id);
    expect(data).toEqual([{ scenario_id: 'cafe', level: 'a1' }]);
  });
});

describe('append_ai_turn: caps', () => {
  it('trims the oldest pair past 50 rows and keeps a user-first thread', async () => {
    const user = await createSignedInUser('hist-trim');
    await optIn(user);
    const id = randomUUID();
    for (let i = 0; i < 26; i += 1) {
      const { data, error } = await append(user, id, { p_user_text: `turn ${i}` });
      expect(error).toBeNull();
      expect(data.saved).toBe(true);
    }
    const rows = await rowsOf(user, id);
    expect(rows).toHaveLength(50);
    expect(rows[0]).toMatchObject({ seq: 3, role: 'user' });
    expect(rows.at(-1)).toMatchObject({ seq: 52, role: 'assistant' });
    rows.forEach((r, i) => expect(r.role).toBe(i % 2 === 0 ? 'user' : 'assistant'));
    const { data } = await admin
      .from('ai_conversations')
      .select('message_count')
      .eq('user_id', user.id)
      .eq('id', id);
    expect(data[0].message_count).toBe(50);
    await admin.from('ai_conversations').delete().eq('user_id', user.id);
  });

  it('evicts the least recently active conversation on the 21st', async () => {
    const user = await createSignedInUser('hist-cap');
    await optIn(user);
    const ids = [];
    for (let i = 0; i < 21; i += 1) {
      const id = randomUUID();
      ids.push(id);
      expect((await append(user, id)).data.saved).toBe(true);
    }
    const { data } = await admin.from('ai_conversations').select('id').eq('user_id', user.id);
    expect(data).toHaveLength(20);
    expect(data.map((r) => r.id)).not.toContain(ids[0]);
    expect(data.map((r) => r.id)).toContain(ids[20]);
    expect(await rowsOf(user, ids[0])).toEqual([]);
    await admin.from('ai_conversations').delete().eq('user_id', user.id);
  });
});

describe('isolation', () => {
  let idA;

  beforeAll(async () => {
    idA = randomUUID();
    await append(A, idA);
  });

  it('a learner reads their own conversation and messages', async () => {
    const conv = await A.client.from('ai_conversations').select('id').eq('id', idA);
    expect(conv.data).toHaveLength(1);
    const msgs = await A.client.from('ai_messages').select('seq').eq('conversation_id', idA);
    expect(msgs.data).toHaveLength(2);
  });

  it('another learner sees none of it, and cannot delete it', async () => {
    const conv = await B.client.from('ai_conversations').select('id').eq('id', idA);
    expect(conv.data).toEqual([]);
    const msgs = await B.client.from('ai_messages').select('seq').eq('conversation_id', idA);
    expect(msgs.data).toEqual([]);
    await B.client.from('ai_conversations').delete().eq('id', idA);
    expect(await rowsOf(A, idA)).toHaveLength(2);
  });

  it('anon sees nothing', async () => {
    const conv = await anonClient().from('ai_conversations').select('id');
    expect(conv.error || conv.data.length === 0).toBeTruthy();
    const msgs = await anonClient().from('ai_messages').select('seq');
    expect(msgs.error || msgs.data.length === 0).toBeTruthy();
  });

  it('a learner cannot insert or update a conversation or a message', async () => {
    const id = randomUUID();
    const insConv = await A.client
      .from('ai_conversations')
      .insert({ user_id: A.id, id, scenario_id: 'cafe', level: 'a1' });
    expect(insConv.error).not.toBeNull();
    const insMsg = await A.client.from('ai_messages').insert({
      user_id: A.id,
      conversation_id: idA,
      seq: 99,
      role: 'assistant',
      content: 'forged',
    });
    expect(insMsg.error).not.toBeNull();
    const upd = await A.client
      .from('ai_messages')
      .update({ content: 'edited' })
      .eq('conversation_id', idA)
      .select();
    expect(upd.error || upd.data.length === 0).toBeTruthy();
    const updConv = await A.client
      .from('ai_conversations')
      .update({ last_message_at: '2000-01-01' })
      .eq('id', idA)
      .select();
    expect(updConv.error || updConv.data.length === 0).toBeTruthy();
    expect(await rowsOf(A, idA)).toHaveLength(2);
  });

  it('a learner cannot delete a single message, only the whole conversation', async () => {
    const single = await A.client
      .from('ai_messages')
      .delete()
      .eq('conversation_id', idA)
      .eq('seq', 1)
      .select();
    expect(single.error || single.data.length === 0).toBeTruthy();
    expect(await rowsOf(A, idA)).toHaveLength(2);

    const { error } = await A.client.from('ai_conversations').delete().eq('id', idA);
    expect(error).toBeNull();
    expect(await rowsOf(A, idA)).toEqual([]);
  });
});

describe('the consent column', () => {
  it('defaults to false and cannot be set by an upsert that does not name it', async () => {
    const user = await createSignedInUser('hist-col');
    await admin.from('settings').upsert({ user_id: user.id, data: {} });
    let { data } = await admin.from('settings').select('ai_history_enabled').eq('user_id', user.id);
    expect(data[0].ai_history_enabled).toBe(false);
    await admin.from('settings').update({ ai_history_enabled: true }).eq('user_id', user.id);
    // An older client's push names only (user_id, data).
    await user.client.from('settings').upsert({ user_id: user.id, data: { level: 'a2' } });
    ({ data } = await admin.from('settings').select('ai_history_enabled').eq('user_id', user.id));
    expect(data[0].ai_history_enabled).toBe(true);
  });
});

describe('purge_ai_conversations', () => {
  it('deletes only conversations idle for more than 90 days, with their messages', async () => {
    const user = await createSignedInUser('hist-purge');
    await optIn(user);
    const old = randomUUID();
    const edge = randomUUID();
    const fresh = randomUUID();
    for (const id of [old, edge, fresh]) await append(user, id);
    const ago = (days) => new Date(Date.now() - days * 86400_000).toISOString();
    await admin
      .from('ai_conversations')
      .update({ last_message_at: ago(91) })
      .eq('user_id', user.id)
      .eq('id', old);
    await admin
      .from('ai_conversations')
      .update({ last_message_at: ago(89) })
      .eq('user_id', user.id)
      .eq('id', edge);

    const { data, error } = await admin.rpc('purge_ai_conversations');
    expect(error).toBeNull();
    expect(data.conversations).toBeGreaterThanOrEqual(1);
    expect(data.messages).toBeGreaterThanOrEqual(2);

    expect(await rowsOf(user, old)).toEqual([]);
    expect(await rowsOf(user, edge)).toHaveLength(2);
    expect(await rowsOf(user, fresh)).toHaveLength(2);
    const { data: left } = await admin.from('ai_conversations').select('id').eq('user_id', user.id);
    expect(left.map((r) => r.id).sort()).toEqual([edge, fresh].sort());
    await admin.from('ai_conversations').delete().eq('user_id', user.id);
  });
});
