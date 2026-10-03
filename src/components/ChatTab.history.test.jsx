import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatTab from './ChatTab';
import { callClaude } from '../lib/claude';
import { activePack } from '../packs';

// Saved tutor conversations from Chat's side: whether it asks the server to
// keep a turn, and with which id. Whether the server does is api/_lib.
const history = vi.hoisted(() => ({ enabled: false, list: [], rowsById: {}, deleted: [] }));

vi.mock('../lib/claude', async (importActual) => ({
  ...(await importActual()),
  callClaude: vi.fn(),
}));
vi.mock('../lib/aiHistory', async (importActual) => ({
  ...(await importActual()),
  isAiHistoryConfigured: () => true,
  listConversations: vi.fn(async () => history.list),
  loadConversation: vi.fn(async (id) => history.rowsById[id] ?? []),
  deleteConversation: vi.fn(async (id) => history.deleted.push(id)),
}));
vi.mock('../lib/speech', () => ({ speak: vi.fn(), isSpeechRecognitionSupported: () => false }));
vi.mock('../lib/useAiHistoryEnabled', () => ({
  useAiHistoryEnabled: () => ({ available: true, enabled: history.enabled, loading: false }),
}));

const OPENER_DE = 'Guten Tag! Was darf es sein?';
const opener = JSON.stringify({ de: OPENER_DE, ipa: '[x]', en: 'Good day!' });
const reply = JSON.stringify({ de: 'Hallo!', ipa: '[haˈloː]', en: 'Hello!' });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function renderChat(props = {}) {
  render(<ChatTab user={{ id: 'u1' }} {...props} />);
  await screen.findByText(OPENER_DE);
}

async function send(text) {
  const toggle = screen.queryByRole('button', { name: 'Type instead' });
  if (toggle) await userEvent.click(toggle);
  await userEvent.type(screen.getByRole('textbox', { name: 'Chat message in German' }), text);
  await userEvent.click(screen.getByRole('button', { name: 'Send chat message' }));
  await waitFor(() => expect(callClaude.mock.calls.at(-1)[1]).toBe(text));
}

const optionsOf = (i) => callClaude.mock.calls[i][3];

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  history.enabled = false;
  history.list = [];
  history.rowsById = {};
  history.deleted = [];
  callClaude.mockResolvedValueOnce(opener).mockResolvedValue(reply);
});

describe('asking the server to keep a turn', () => {
  it('sends nothing while saving is off', async () => {
    await renderChat();
    await send('Hallo');
    expect(optionsOf(0).conversation).toBeUndefined();
    expect(optionsOf(1).conversation).toBeUndefined();
  });

  it('marks the scene opener as the kickoff, then reuses one id for the thread', async () => {
    history.enabled = true;
    await renderChat();
    await send('Hallo');
    await send('Danke');
    const [open, first, second] = [optionsOf(0), optionsOf(1), optionsOf(2)].map(
      (o) => o.conversation
    );
    expect(open).toMatchObject({ kickoff: true });
    expect(open.id).toMatch(UUID);
    expect(first).toEqual({ id: open.id, scenario: open.scenario, kickoff: false });
    expect(second.id).toBe(open.id);
    expect(open.scenario).toEqual(expect.any(String));
  });

  it('starts a new conversation id for a new scene', async () => {
    history.enabled = true;
    await renderChat();
    const firstId = optionsOf(0).conversation.id;
    const other = activePack.content.scenarios.find((s) => s.id === 'coffee');
    await userEvent.click(
      screen.getByRole('radio', { name: `${other.name ?? 'Order Coffee'} scenario` })
    );
    await waitFor(() => expect(callClaude.mock.calls.length).toBeGreaterThan(1));
    const next = callClaude.mock.calls.at(-1)[3].conversation;
    expect(next.kickoff).toBe(true);
    expect(next.id).toMatch(UUID);
    expect(next.id).not.toBe(firstId);
    expect(next.scenario).toBe('coffee');
  });
});

describe('message length', () => {
  it('caps the chat input at the 2,000 characters the server will save', async () => {
    await renderChat();
    const toggle = screen.queryByRole('button', { name: 'Type instead' });
    if (toggle) await userEvent.click(toggle);
    expect(screen.getByRole('textbox', { name: 'Chat message in German' })).toHaveAttribute(
      'maxlength',
      '2000'
    );
  });
});

describe('the context window', () => {
  it('sends only the last 24 messages of a long thread, starting on a user turn', async () => {
    await renderChat();
    for (let i = 0; i < 14; i += 1) await send(`msg${i}`);
    const lastHistory = callClaude.mock.calls.at(-1)[2];
    expect(lastHistory.length).toBeLessThanOrEqual(24);
    expect(lastHistory[0].role).toBe('user');
    expect(lastHistory.at(-1).role).toBe('assistant');
  }, 30000);
});

describe('History: continue a saved conversation', () => {
  const saved = (scenarioId) => {
    history.list = [
      {
        id: 'saved-1',
        scenario_id: scenarioId,
        level: 'a1',
        message_count: 4,
        last_message_at: '2026-10-02T10:00:00Z',
      },
    ];
    history.rowsById['saved-1'] = [
      { seq: 1, role: 'user', content: 'KICKOFF', hidden: true },
      {
        seq: 2,
        role: 'assistant',
        content: JSON.stringify({ de: 'Guten Tag, wie geht es?', ipa: '[x]', en: 'Hi' }),
      },
      { seq: 3, role: 'user', content: 'Mir geht es gut', hidden: false },
      {
        seq: 4,
        role: 'assistant',
        content: JSON.stringify({ de: 'Sehr schön!', ipa: '[y]', en: 'Lovely' }),
      },
    ];
  };
  const openHistoryAndContinue = async () => {
    await userEvent.click(screen.getByRole('button', { name: 'History' }));
    await userEvent.click(await screen.findByRole('button', { name: /^continue /i }));
  };

  it('puts the saved thread back, keeps its id, and does not call the AI', async () => {
    history.enabled = true;
    await renderChat();
    const scenarioId = optionsOf(0).conversation.scenario;
    saved(scenarioId);
    const callsBefore = callClaude.mock.calls.length;
    await openHistoryAndContinue();
    expect(await screen.findByText('Sehr schön!')).toBeInTheDocument();
    expect(screen.getByText('Mir geht es gut')).toBeInTheDocument();
    expect(screen.queryByText(/KICKOFF/)).toBeNull();
    expect(callClaude.mock.calls.length).toBe(callsBefore);

    await send('Danke');
    const call = callClaude.mock.calls.at(-1);
    expect(call[3].conversation).toEqual({ id: 'saved-1', scenario: scenarioId, kickoff: false });
    // The model is sent the resumed turns, kickoff included, as it saw them.
    expect(call[2].map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
    expect(call[2][0].content).toBe('KICKOFF');
  });

  it('switches scene for a conversation from another scene, still without an AI call', async () => {
    history.enabled = true;
    await renderChat();
    const current = optionsOf(0).conversation.scenario;
    const other = activePack.content.scenarios.find((s) => s.id !== current);
    saved(other.id);
    const callsBefore = callClaude.mock.calls.length;
    await openHistoryAndContinue();
    expect(await screen.findByText('Sehr schön!')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('radio', { name: `${other.name} scenario` })).toBeChecked()
    );
    expect(callClaude.mock.calls.length).toBe(callsBefore);
    await send('Danke');
    expect(callClaude.mock.calls.at(-1)[3].conversation).toEqual({
      id: 'saved-1',
      scenario: other.id,
      kickoff: false,
    });
  });

  it('says so, and changes nothing, when the saved rows are unreadable', async () => {
    history.enabled = true;
    await renderChat();
    saved(optionsOf(0).conversation.scenario);
    history.rowsById['saved-1'] = [];
    await openHistoryAndContinue();
    expect(await screen.findByText(/could not open that conversation/i)).toBeInTheDocument();
    expect(screen.getByText(OPENER_DE)).toBeInTheDocument();
  });

  it('starts a NEW conversation after the open one is deleted', async () => {
    history.enabled = true;
    await renderChat();
    const scenarioId = optionsOf(0).conversation.scenario;
    saved(scenarioId);
    await openHistoryAndContinue();
    await screen.findByText('Sehr schön!');
    await userEvent.click(screen.getByRole('button', { name: 'History' }));
    await userEvent.click(await screen.findByRole('button', { name: /^delete /i }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(history.deleted).toEqual(['saved-1']));
    await send('Danke');
    const { id } = callClaude.mock.calls.at(-1)[3].conversation;
    expect(id).not.toBe('saved-1');
    expect(id).toMatch(UUID);
  });
});

describe('Saved / Not saved', () => {
  it('shows what the server said about the turn', async () => {
    history.enabled = true;
    callClaude.mockReset();
    callClaude.mockResolvedValueOnce(opener).mockImplementation(async (_s, _t, _h, o) => {
      o.onSaved?.(false);
      return reply;
    });
    await renderChat();
    await send('Hallo');
    expect(
      await screen.findByText(/not saved — this turn is not in your history/i)
    ).toBeInTheDocument();

    callClaude.mockImplementation(async (_s, _t, _h, o) => {
      o.onSaved?.(true);
      return reply;
    });
    await send('Danke');
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('shows nothing when saving is off', async () => {
    await renderChat();
    await send('Hallo');
    expect(screen.queryByText('Saved')).toBeNull();
    expect(screen.queryByText(/not saved/i)).toBeNull();
  });
});
