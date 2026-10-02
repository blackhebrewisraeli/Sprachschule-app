import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatTab from './ChatTab';
import { callClaude } from '../lib/claude';
import { activePack } from '../packs';

// Saved tutor conversations from Chat's side: whether it asks the server to
// keep a turn, and with which id. Whether the server does is api/_lib.
const history = vi.hoisted(() => ({ enabled: false }));

vi.mock('../lib/claude', async (importActual) => ({
  ...(await importActual()),
  callClaude: vi.fn(),
}));
vi.mock('../lib/speech', () => ({ speak: vi.fn() }));
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
