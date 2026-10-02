import { describe, it, expect } from 'vitest';
import { assistantTurn, parseReply, rowsToThread, toHistory } from './chatThread.js';

const reply = (over = {}) =>
  JSON.stringify({ de: 'Gern!', ipa: '[ɡɛʁn]', en: 'Sure!', next: { de: 'x' }, ...over });
const row = (seq, role, content, hidden = false) => ({ seq, role, content, hidden });

describe('parseReply', () => {
  it('reads plain and fenced JSON', () => {
    expect(parseReply('{"de":"a"}')).toEqual({ de: 'a' });
    expect(parseReply('```json\n{"de":"a"}\n```')).toEqual({ de: 'a' });
  });
});

describe('rowsToThread', () => {
  it('rebuilds a live-shaped thread, hidden kickoff included', () => {
    const thread = rowsToThread([
      row(1, 'user', 'KICKOFF', true),
      row(2, 'assistant', reply({ de: 'Guten Tag' })),
      row(3, 'user', 'Hallo'),
      row(4, 'assistant', reply({ correction: { original: 'a', fixed: 'b', explain: 'c' } })),
    ]);
    expect(thread).toHaveLength(4);
    expect(thread[0]).toEqual({ role: 'user', de: 'KICKOFF', hidden: true });
    expect(thread[1]).toMatchObject({ role: 'assistant', de: 'Guten Tag' });
    // The correction in a reply goes back on the learner turn it answered,
    // exactly as the live path does; an uncorrected turn is graded with null.
    expect(thread[0]).not.toHaveProperty('graded');
    expect(thread[2]).toMatchObject({
      role: 'user',
      de: 'Hallo',
      graded: true,
      correction: { fixed: 'b' },
    });
  });

  it('marks a clean turn graded with no correction', () => {
    const thread = rowsToThread([row(1, 'user', 'Hallo'), row(2, 'assistant', reply())]);
    expect(thread[0]).toMatchObject({ graded: true, correction: null });
  });

  it('drops leading assistant rows so the thread starts on a user turn', () => {
    const thread = rowsToThread([
      row(3, 'assistant', reply({ de: 'orphan' })),
      row(4, 'user', 'Hallo'),
      row(5, 'assistant', reply()),
    ]);
    expect(thread[0].role).toBe('user');
    expect(thread.map((m) => m.de)).not.toContain('orphan');
  });

  it('renders the apology, not a crash, for a reply that cannot be read', () => {
    for (const bad of ['not json', 'null', '"just a string"', '']) {
      const thread = rowsToThread([row(1, 'user', 'Hallo'), row(2, 'assistant', bad || ' ')]);
      expect(thread).toHaveLength(2);
      expect(thread[1].de).toBe('Entschuldigung, ein Fehler.');
      expect(thread[1].en).toMatch(/could not be read/);
    }
  });

  it('is empty for no rows or no user row', () => {
    expect(rowsToThread([])).toEqual([]);
    expect(rowsToThread([row(2, 'assistant', reply())])).toEqual([]);
  });

  it('round-trips into the history the model is sent', () => {
    const thread = rowsToThread([row(1, 'user', 'Hallo'), row(2, 'assistant', reply())]);
    expect(thread.map(toHistory)).toEqual([
      { role: 'user', content: 'Hallo' },
      {
        role: 'assistant',
        content: JSON.stringify({ de: 'Gern!', ipa: '[ɡɛʁn]', en: 'Sure!', next: { de: 'x' } }),
      },
    ]);
    expect(assistantTurn({ de: 'a', ipa: 'b', en: 'c', next: 1 })).toEqual({
      role: 'assistant',
      de: 'a',
      ipa: 'b',
      en: 'c',
      next: 1,
    });
  });
});
