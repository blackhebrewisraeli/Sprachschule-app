import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createHistory,
  historyMode,
  parseConversation,
  MAX_USER_CHARS,
  MAX_ASSISTANT_CHARS,
} from './aiHistory.js';

const ID = '11111111-1111-4111-8111-111111111111';
const USER = { kind: 'user', userId: 'u-1', key: 'user:u-1' };
const GUEST = { kind: 'guest', key: 'ip:1.2.3.4' };
const on = { AI_HISTORY_MODE: 'on' };

const rawBody = (over = {}) => ({
  level: 'a2',
  conversation: { id: ID, scenario: 'cafe' },
  ...over,
});
const safeBody = (over = {}) => ({
  model: 'claude-haiku-4-5-20251001',
  messages: [
    { role: 'user', content: 'older turn' },
    { role: 'assistant', content: 'older reply' },
    { role: 'user', content: 'Hallo' },
  ],
  ...over,
});
const reply = (text = '{"de":"Hallo!"}') => ({
  content: [
    { type: 'thinking', thinking: 'secret' },
    { type: 'text', text },
  ],
});

const make = (rpc, env = on) => {
  const client = { rpc };
  return createHistory({ getClient: () => client, env });
};
const run = (history, over = {}) =>
  history.persist({
    caller: USER,
    rawBody: rawBody(),
    safeBody: safeBody(),
    data: reply(),
    ...over,
  });
const ok = () => vi.fn(async () => ({ data: { saved: true }, error: null }));

afterEach(() => vi.restoreAllMocks());

describe('historyMode', () => {
  it.each([
    [undefined, 'off'],
    ['', 'off'],
    ['shadow', 'off'],
    ['ON', 'on'],
    ['on', 'on'],
  ])('%s is %s', (value, expected) => {
    expect(historyMode({ AI_HISTORY_MODE: value })).toBe(expected);
  });
});

describe('parseConversation', () => {
  it('is undefined when there is no block (not a saving request)', () => {
    expect(parseConversation({})).toBeUndefined();
    expect(parseConversation(null)).toBeUndefined();
  });

  it('reads a valid block, the kickoff flag and the level', () => {
    expect(
      parseConversation(rawBody({ conversation: { id: ID, scenario: ' cafe ', kickoff: true } }))
    ).toEqual({ id: ID, scenario: 'cafe', kickoff: true, level: 'a2' });
  });

  it('accepts a JSON string body and defaults an unknown level to a1', () => {
    const body = JSON.stringify(rawBody({ level: 'c2' }));
    expect(parseConversation(body)).toMatchObject({ level: 'a1', kickoff: false });
  });

  it.each([
    ['a non-object block', 'nope'],
    ['an array block', []],
    ['a bad uuid', { id: 'abc', scenario: 'cafe' }],
    ['a missing id', { scenario: 'cafe' }],
    ['an empty scenario', { id: ID, scenario: '  ' }],
    ['an over-long scenario', { id: ID, scenario: 'x'.repeat(41) }],
    ['a non-string scenario', { id: ID, scenario: 7 }],
  ])('is null for %s', (_label, conversation) => {
    expect(parseConversation(rawBody({ conversation }))).toBeNull();
  });
});

describe('persist', () => {
  it('stores only the last user message and the reply TEXT, as the caller', async () => {
    const rpc = ok();
    expect(await run(make(rpc))).toBe(true);
    expect(rpc).toHaveBeenCalledWith('append_ai_turn', {
      p_user: 'u-1',
      p_conversation: ID,
      p_scenario: 'cafe',
      p_level: 'a2',
      p_user_text: 'Hallo',
      p_hidden: false,
      p_assistant_text: '{"de":"Hallo!"}',
      p_model: 'claude-haiku-4-5-20251001',
    });
  });

  it('marks the scene kickoff hidden', async () => {
    const rpc = ok();
    await run(make(rpc), {
      rawBody: rawBody({ conversation: { id: ID, scenario: 'cafe', kickoff: true } }),
    });
    expect(rpc.mock.calls[0][1].p_hidden).toBe(true);
  });

  it('does nothing and reports undefined when the request asked for nothing', async () => {
    const rpc = ok();
    expect(await run(make(rpc), { rawBody: {} })).toBeUndefined();
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['off', { AI_HISTORY_MODE: 'off' }, USER],
    ['unset', {}, USER],
    ['a guest', on, GUEST],
    ['a degraded caller', on, { ...USER, degraded: true }],
  ])('never writes when mode/caller is %s', async (_label, env, caller) => {
    const rpc = ok();
    expect(await run(make(rpc, env), { caller })).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('ignores an invalid block, reporting not saved', async () => {
    const rpc = ok();
    expect(await run(make(rpc), { rawBody: rawBody({ conversation: { id: 'x' } }) })).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    [
      'an over-long user message',
      {
        safeBody: safeBody({
          messages: [{ role: 'user', content: 'x'.repeat(MAX_USER_CHARS + 1) }],
        }),
      },
    ],
    [
      'a last message that is not the user',
      { safeBody: safeBody({ messages: [{ role: 'assistant', content: 'hi' }] }) },
    ],
    ['an empty reply', { data: { content: [{ type: 'thinking', thinking: 'only' }] } }],
    ['an over-long reply', { data: reply('x'.repeat(MAX_ASSISTANT_CHARS + 1)) }],
  ])('does not save %s', async (_label, over) => {
    const rpc = ok();
    expect(await run(make(rpc), over)).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('reports not saved when the learner has not opted in (soft outcome, no log)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rpc = vi.fn(async () => ({ data: { saved: false, reason: 'disabled' }, error: null }));
    expect(await run(make(rpc))).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('survives an RPC error, an exception and a missing client, logging reasons only', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(
      await run(make(vi.fn(async () => ({ data: null, error: { message: 'boom u-1' } }))))
    ).toBe(false);
    expect(
      await run(
        make(
          vi.fn(async () => {
            throw new Error('boom u-1');
          })
        )
      )
    ).toBe(false);
    expect(await run(createHistory({ getClient: () => null, env: on }))).toBe(false);
    const logged = warn.mock.calls.map((c) => c[0]).join('\n');
    expect(logged).toContain('ai_history_write_failed');
    for (const secret of ['u-1', ID, 'Hallo', 'cafe']) expect(logged).not.toContain(secret);
  });

  it('gives up after 2 seconds and reports not saved', async () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const pending = run(make(vi.fn(() => new Promise(() => {}))));
      await vi.advanceTimersByTimeAsync(2000);
      expect(await pending).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
