import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatTab from './ChatTab';
import { callClaude, QuotaExhaustedError } from '../lib/claude';
import { speak } from '../lib/speech';
import { setAccessTier } from '../lib/accessTier';
import { setUserLevel } from '../lib/levelPref';
import { chatKickoffMessage, CHAT_IMPROV } from '../lib/prompts';
import { activePack } from '../packs';

vi.mock('../lib/claude', async (importActual) => ({
  ...(await importActual()),
  callClaude: vi.fn(),
}));

vi.mock('../lib/speech', () => ({ speak: vi.fn(), isSpeechRecognitionSupported: () => false }));

// The scene opener the AI writes. Distinct from `reply` so a test can tell
// "the scene opened" apart from "a turn was answered".
const OPENER_DE = 'Guten Tag! Was darf es sein?';
const OPENER_EN = 'Good day! What can I get you?';
const NEXT = {
  de: 'Ich möchte einen Kaffee, bitte.',
  en: "I'd like a coffee, please.",
  blank: 'Kaffee',
  distractors: ['Tee', 'Wasser'],
};
const FIX = { original: 'x', fixed: 'y', explain: 'z' };

const opener = (next) =>
  JSON.stringify({ de: OPENER_DE, ipa: '[ˈɡuːtn̩ taːk]', en: OPENER_EN, next });
const reply = JSON.stringify({ de: 'Hallo!', ipa: '[haˈloː]', en: 'Hello!' });
const turn = ({ correction = null, next = NEXT } = {}) =>
  JSON.stringify({ de: 'Gern!', ipa: '[ɡɛʁn]', en: 'Sure!', correction, next });

const lastCall = () => callClaude.mock.calls.at(-1);

function deferred() {
  let resolve;
  const promise = new Promise((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

// Every mount opens a scene, so the first call is always the opener. Wait for
// it to land before interacting.
async function renderChat(ui = <ChatTab />) {
  const view = render(ui);
  await screen.findByText(OPENER_DE);
  return view;
}

// The old autoplay used 400ms (greeting) and 200ms (reply). Wait past both
// with a real timer so a setTimeout speak cannot sneak through.
const AUTOPLAY_WINDOW_MS = 500;

async function expectNoAutoSpeech() {
  await new Promise((resolve) => setTimeout(resolve, AUTOPLAY_WINDOW_MS));
  expect(speak).not.toHaveBeenCalled();
}

// These tests cover the free-text composer. An opener without a usable `next`
// already renders it; with one, "Type instead" gets there.
async function typeInstead() {
  const toggle = screen.queryByRole('button', { name: 'Type instead' });
  if (toggle) await userEvent.click(toggle);
}

async function sendHallo() {
  await typeInstead();
  await userEvent.type(screen.getByRole('textbox', { name: 'Chat message in German' }), 'Hallo');
  await userEvent.click(screen.getByRole('button', { name: 'Send chat message' }));
  await waitFor(() => expect(lastCall()[1]).toBe('Hallo'));
}

function chatLayoutGrid(container) {
  const grid = [...container.querySelectorAll('div')].find((el) =>
    (el.getAttribute('style') ?? '').includes('calc(100vh - 280px)')
  );
  expect(grid, 'Chat layout grid').toBeTruthy();
  return grid;
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
  callClaude.mockResolvedValueOnce(opener()).mockResolvedValue(reply);
});

describe('ChatTab routing', () => {
  it('sends chat routingContext, defaulting userTier to guest and Auto', async () => {
    await renderChat();
    await sendHallo();

    expect(callClaude).toHaveBeenLastCalledWith(expect.any(String), 'Hallo', expect.any(Array), {
      routingContext: { taskType: 'chat', userTier: 'guest', preferredModel: 'auto' },
      level: 'a1',
      vocab: expect.any(Array),
    });
  });

  it('passes a signed-in tier and the saved preferredModel', async () => {
    await renderChat(<ChatTab user={{ id: 'u1' }} preferredModel="balanced" />);
    await sendHallo();
    expect(lastCall()[3].routingContext).toEqual({
      taskType: 'chat',
      userTier: 'free',
      preferredModel: 'balanced',
    });
  });

  it('lets the learner change the model from Chat, through the popover', async () => {
    const onPreferredModelChange = vi.fn();
    await renderChat(<ChatTab onPreferredModelChange={onPreferredModelChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Modell: Auto' }));
    const sheet = screen.getByRole('dialog', { name: 'Modell' });
    await userEvent.click(within(sheet).getByRole('button', { name: /balanced/i }));

    expect(onPreferredModelChange).toHaveBeenCalledWith('balanced');
    // Picking dismisses and hands focus back, the way the header sheets do.
    expect(screen.queryByRole('dialog', { name: 'Modell' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Modell: Auto' })).toHaveFocus();
  });

  it('names the saved preference on the closed trigger', async () => {
    await renderChat(<ChatTab preferredModel="capable" />);
    expect(screen.getByRole('button', { name: 'Modell: Capable' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });
});

describe('ChatTab classified CEFR and vocab', () => {
  it('ignores a b1 prop when classification is a1', async () => {
    await renderChat(<ChatTab level="b1" />);
    expect(screen.getByText('Say hello and tell Anna your name.')).toBeInTheDocument();
    expect(screen.queryByText(/interesting place you visited recently/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Scenario · A1/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('radiogroup', { name: 'Select learning level' })
    ).not.toBeInTheDocument();
  });

  it('uses classified B1 pedagogy even if the prop says a1', async () => {
    setUserLevel('b1');
    await renderChat(<ChatTab level="a1" />);
    expect(screen.getByText(/interesting place you visited recently/i)).toBeInTheDocument();
    expect(screen.queryByText('Say hello and tell Anna your name.')).not.toBeInTheDocument();

    await sendHallo();
    const system = lastCall()[0];
    expect(system).toContain(activePack.prompts.levels.b1);
    expect(system).not.toContain(activePack.prompts.levels.a1);
    expect(lastCall()[3].level).toBe('b1');
  });

  it('puts learned terms in the prompt and still works when the set is empty', async () => {
    const greetings = activePack.content.decks.greetings;
    const learnedWords = Object.fromEntries(greetings.slice(0, 9).map((c) => [c.id, true]));
    const first = await renderChat(<ChatTab learnedWords={learnedWords} />);
    await sendHallo();
    const system = lastCall()[0];
    expect(system).toContain("Stay within the learner's known vocabulary.");
    expect(system).toContain(greetings[0].de);
    expect(system).not.toContain('small starter set');

    first.unmount();
    callClaude.mockClear();
    callClaude.mockResolvedValueOnce(opener());
    await renderChat(<ChatTab learnedWords={{}} learnedByDeck={{}} />);
    await sendHallo();
    const sparse = lastCall()[0];
    expect(sparse).toContain('small starter set');
    expect(lastCall()[3].vocab.length).toBeGreaterThan(0);
  });

  it('includes a learned interest term and biases toward enabled topics', async () => {
    const sport = activePack.content.interestDecks['interest-sport'];
    const card = sport[0];
    await renderChat(
      <ChatTab
        learnedByDeck={{ 'interest-sport': { [card.id]: true } }}
        enabledInterests={['sport']}
      />
    );
    await sendHallo();
    const system = lastCall()[0];
    expect(system).toContain(card.de);
    expect(system).toContain('sports and athletic activities');
  });
});

describe('ChatTab scene opener', () => {
  it('opens with a hidden kickoff turn and shows the AI opener', async () => {
    await renderChat();
    expect(callClaude.mock.calls[0][1]).toBe(chatKickoffMessage());
    expect(callClaude.mock.calls[0][2]).toEqual([]);
    expect(screen.queryByText(chatKickoffMessage())).not.toBeInTheDocument();
  });

  it('carries no canned greeting from the pack', async () => {
    await renderChat();
    expect(screen.queryByText('Hallo! Womit möchtest du heute üben?')).not.toBeInTheDocument();
  });

  it('casts the AI as the selected scene role', async () => {
    await renderChat();
    await userEvent.click(screen.getByRole('radio', { name: 'Order Coffee scenario' }));
    await waitFor(() => expect(callClaude).toHaveBeenCalledTimes(2));
    const coffee = activePack.content.scenarios.find((s) => s.id === 'coffee');
    expect(lastCall()[0]).toContain(`You are ${coffee.role.brief}`);
    expect(lastCall()[0]).not.toContain('tutor named');
    expect(lastCall()[1]).toBe(chatKickoffMessage());
  });

  it('names the scene character while it types', async () => {
    const pending = deferred();
    await renderChat();
    callClaude.mockReturnValueOnce(pending.promise);
    await userEvent.click(screen.getByRole('radio', { name: 'Order Coffee scenario' }));
    expect(await screen.findByText('Barista tippt')).toBeInTheDocument();
    pending.resolve(reply);
    await waitFor(() => expect(screen.queryByText('Barista tippt')).not.toBeInTheDocument());
  });

  it('sends the opener back as history on the next turn', async () => {
    await renderChat();
    await sendHallo();
    expect(lastCall()[2]).toEqual([
      { role: 'user', content: chatKickoffMessage() },
      { role: 'assistant', content: expect.stringContaining(OPENER_DE) },
    ]);
  });

  it('offers Try again when the opener fails, and recovers', async () => {
    callClaude.mockReset();
    callClaude.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(opener());
    render(<ChatTab />);
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText(OPENER_DE)).toBeInTheDocument();
    expect(screen.queryByText('Entschuldigung, ein Fehler.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('ignores an opener that lands after the learner switched scenario', async () => {
    const stale = deferred();
    callClaude.mockReset();
    callClaude.mockReturnValueOnce(stale.promise).mockResolvedValueOnce(opener());
    render(<ChatTab />);
    await userEvent.click(screen.getByRole('radio', { name: 'Order Coffee scenario' }));
    await screen.findByText(OPENER_DE);
    stale.resolve(JSON.stringify({ de: 'Veraltet!', en: 'Stale' }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByText('Veraltet!')).not.toBeInTheDocument();
    expect(screen.getByText(OPENER_DE)).toBeInTheDocument();
  });

  it.each([
    ['a guest on Auto', {}, 'fast'],
    ['a guest whose saved pick exceeds the plan', { preferredModel: 'capable' }, 'fast'],
    [
      'a signed-in Free learner whose Balanced pick is Premium-only (D2)',
      { user: { id: 'u1' }, preferredModel: 'balanced' },
      'fast',
    ],
    [
      'a pro learner on Balanced',
      { user: { id: 'u1' }, preferredModel: 'balanced', accessTier: 'premium' },
      'balanced',
    ],
  ])('uses the register of the model that will answer: %s', async (_, props, profile) => {
    // Pro comes from the server's entitlement, never from a flag on `user`.
    const { accessTier = null, ...chatProps } = props;
    setAccessTier(accessTier);
    try {
      await renderChat(<ChatTab {...chatProps} />);
      expect(callClaude.mock.calls[0][0]).toContain(CHAT_IMPROV[profile]);
    } finally {
      setAccessTier(null);
    }
  });
});

describe('ChatTab scaffolded composer', () => {
  const bank = () => screen.getByRole('group', { name: 'Word bank' });

  // The opener suggests NEXT; each later call answers with the given replies.
  function script(...replies) {
    callClaude.mockReset();
    callClaude.mockResolvedValueOnce(opener(NEXT));
    for (const r of replies) callClaude.mockResolvedValueOnce(r);
  }

  async function sendFirstTile(replies) {
    await userEvent.click(within(bank()).getAllByRole('button')[0]);
    await userEvent.click(screen.getByRole('button', { name: 'Send chat message' }));
    await waitFor(() => expect(screen.getAllByText('Gern!')).toHaveLength(replies));
  }

  async function sendChoice(replies) {
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Missing word' }), 'Tee');
    await userEvent.click(screen.getByRole('button', { name: 'Send chat message' }));
    await waitFor(() => expect(screen.getAllByText('Gern!')).toHaveLength(replies));
  }

  it('starts an A1 learner on word blocks built from the AI suggestion', async () => {
    script(turn());
    setUserLevel('a1');
    await renderChat();
    const tiles = within(bank())
      .getAllByRole('button')
      .map((b) => b.textContent)
      .sort();
    expect(tiles).toEqual(['Ich', 'Kaffee,', 'Tee', 'Wasser', 'bitte.', 'einen', 'möchte'].sort());
    expect(screen.getByText("Say: I'd like a coffee, please.")).toBeInTheDocument();
    expect(screen.getByText('Step 1 of 4 · Build the sentence')).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Chat message in German' })
    ).not.toBeInTheDocument();

    await userEvent.click(within(bank()).getByRole('button', { name: 'Ich' }));
    await userEvent.click(within(bank()).getByRole('button', { name: 'möchte' }));
    await userEvent.click(screen.getByRole('button', { name: 'Send chat message' }));
    await waitFor(() => expect(callClaude).toHaveBeenCalledTimes(2));
    expect(lastCall()[1]).toBe('Ich möchte');
  });

  it('moves an A1 learner up to the dropdown after two clean turns', async () => {
    script(turn(), turn());
    setUserLevel('a1');
    await renderChat();
    await sendFirstTile(1);
    expect(screen.getByText('Step 1 of 4 · Build the sentence')).toBeInTheDocument();
    await sendFirstTile(2);
    expect(screen.getByRole('combobox', { name: 'Missing word' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Nice — next step: Choose the word');
  });

  it('steps an A2 learner down to word blocks after two corrected turns', async () => {
    script(turn({ correction: FIX }), turn({ correction: FIX }));
    setUserLevel('a2');
    await renderChat();
    await sendChoice(1);
    expect(lastCall()[1]).toBe('Ich möchte einen Tee, bitte.');
    await sendChoice(2);
    expect(bank()).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent("Let's add some help: Build the sentence");
  });

  it('starts a B1 learner on the typed blank', async () => {
    script(turn());
    setUserLevel('b1');
    await renderChat();
    expect(screen.getByText('Step 3 of 4 · Type the word')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Missing word' }), 'Kaffee{Enter}');
    await waitFor(() => expect(callClaude).toHaveBeenCalledTimes(2));
    expect(lastCall()[1]).toBe('Ich möchte einen Kaffee, bitte.');
  });

  it('falls back to free text when the suggestion is unusable', async () => {
    callClaude.mockReset();
    callClaude.mockResolvedValueOnce(opener({ ...NEXT, blank: 'Milch' }));
    setUserLevel('a1');
    await renderChat();
    expect(screen.getByRole('textbox', { name: 'Chat message in German' })).toBeInTheDocument();
    expect(screen.queryByText(/^Step /)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use word bank' })).not.toBeInTheDocument();
  });

  it('lets the learner leave the scaffold and come back', async () => {
    script();
    setUserLevel('a1');
    await renderChat();
    await userEvent.click(screen.getByRole('button', { name: 'Type instead' }));
    expect(screen.getByRole('textbox', { name: 'Chat message in German' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Use word bank' }));
    expect(bank()).toBeInTheDocument();
  });
});

describe('ChatTab speech', () => {
  it('does not speak when the tab mounts with the opener', async () => {
    await renderChat();
    await expectNoAutoSpeech();
  });

  it('does not speak when Chat remounts (tab switch)', async () => {
    const { unmount } = await renderChat();
    await expectNoAutoSpeech();
    unmount();
    vi.clearAllMocks();
    callClaude.mockResolvedValueOnce(opener());
    await renderChat();
    await expectNoAutoSpeech();
  });

  it('does not speak when the user picks a different scenario', async () => {
    await renderChat();
    await userEvent.click(screen.getByRole('radio', { name: 'Order Coffee scenario' }));
    await screen.findByText('Hallo!');
    await expectNoAutoSpeech();
  });

  it('does not speak when an assistant reply arrives', async () => {
    await renderChat();
    await sendHallo();
    await waitFor(() => {
      expect(screen.getByText('Hallo!')).toBeInTheDocument();
    });
    await expectNoAutoSpeech();
  });

  it('speaks when the user clicks play on the character’s message', async () => {
    await renderChat();
    await userEvent.click(screen.getByRole('button', { name: 'Play Anna response audio' }));
    expect(speak).toHaveBeenCalledTimes(1);
    expect(speak).toHaveBeenCalledWith(OPENER_DE);
  });
});

describe('ChatTab conversation-first layout', () => {
  it('does not claim there are no mistakes before a graded turn', async () => {
    await renderChat();
    expect(screen.queryByText('Alles gut!')).not.toBeInTheDocument();
    expect(screen.queryByText(/no mistakes/i)).not.toBeInTheDocument();
    expect(screen.queryByText('No fix this time')).not.toBeInTheDocument();
  });

  it('does not paint A/B/C section markers or the Tip card', async () => {
    await renderChat();
    expect(screen.queryByText(/^A$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^B$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^C$/)).not.toBeInTheDocument();
    expect(screen.queryByText('Tip')).not.toBeInTheDocument();
  });

  it('attaches a correction cue to the learner turn that was graded', async () => {
    callClaude.mockResolvedValue(
      JSON.stringify({
        de: 'Einen Kaffee, bitte.',
        ipa: '[ˈaɪ̯nən]',
        en: 'A coffee, please.',
        correction: {
          original: 'Hallo',
          fixed: 'Hallo!',
          explain: 'Add the punctuation.',
        },
      })
    );
    await renderChat();
    await sendHallo();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Needs a fix/i })).toBeInTheDocument();
    });
    expect(screen.queryByText('Alles gut!')).not.toBeInTheDocument();
  });

  it('marks a clean turn quietly instead of an empty panel', async () => {
    await renderChat();
    await sendHallo();
    await waitFor(() => {
      expect(screen.getByText('Hallo!')).toBeInTheDocument();
    });
    expect(screen.getByText('No fix this time')).toBeInTheDocument();
    expect(screen.queryByText('Alles gut!')).not.toBeInTheDocument();
  });

  it('keeps EN and IPA of the opener behind disclosure', async () => {
    await renderChat();
    expect(screen.queryByText(OPENER_EN)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'EN' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'IPA' })).toBeInTheDocument();
  });

  it('collapses EN/IPA again when a new scene replaces the opener', async () => {
    await renderChat();
    await userEvent.click(screen.getByRole('button', { name: 'EN' }));
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(screen.getByRole('radio', { name: 'Order Coffee scenario' }));
    await screen.findByText('Hallo!');
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(OPENER_EN)).not.toBeInTheDocument();
  });

  it('keeps the model control below the thread when not wide', async () => {
    const { container } = await renderChat(<ChatTab wide={false} />);
    const trigger = screen.getByRole('button', { name: 'Modell: Auto' });
    expect(trigger.closest('summary')).toBeNull();
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');

    // Ordered after the conversation panel, not stacked above it.
    const grid = chatLayoutGrid(container);
    const slots = [...grid.children];
    // The Send button exists in every input mode, so it locates the thread.
    const composer = screen.getByRole('button', { name: 'Send chat message' });
    const thread = slots.find((el) => el.contains(composer));
    const control = slots.find((el) => el.contains(trigger));
    expect(slots.indexOf(control)).toBeGreaterThan(slots.indexOf(thread));
  });

  // The whole point of the popover: Chat is the conversation, so four
  // preference buttons must not sit permanently in its tab order. They used to
  // — always visible in the wide aside, and one `<summary>` away when stacked.
  it.each([true, false])('mounts no preference buttons until opened (wide=%s)', async (wide) => {
    await renderChat(<ChatTab wide={wide} />);
    for (const band of [/^Auto/i, /^Fast/i, /^Balanced/i, /^Capable/i]) {
      expect(screen.queryByRole('button', { name: band })).not.toBeInTheDocument();
    }
    expect(screen.queryByRole('group', { name: 'Chat model' })).not.toBeInTheDocument();
    // The control itself IS mounted — a zero-button assertion passes just as
    // well when the whole feature is gone.
    expect(screen.getByRole('button', { name: 'Modell: Auto' })).toBeInTheDocument();
  });

  it('uses a 220px rail plus a shrinking conversation track when wide', async () => {
    const { container } = await renderChat(<ChatTab wide />);
    const grid = chatLayoutGrid(container);
    expect(grid.style.gridTemplateColumns).toBe('220px minmax(0, 1fr)');
  });

  it('uses a single shrinking track when not wide', async () => {
    const { container } = await renderChat(<ChatTab wide={false} />);
    const grid = chatLayoutGrid(container);
    expect(grid.style.gridTemplateColumns).toBe('minmax(0, 1fr)');
  });

  describe('quota denial', () => {
    const denial = () =>
      new QuotaExhaustedError({
        message: 'Daily AI limit reached.',
        meter: 'chat',
        tier: 'guest',
        limit: 10,
        used: 10,
        resetsAt: '2026-10-02T00:00:00.000Z',
        rewardedEligible: false,
      });

    it('shows the quota note, not the error bubble, and keeps the input usable', async () => {
      await renderChat();
      callClaude.mockReset();
      callClaude.mockRejectedValueOnce(denial());
      await sendHallo();
      expect(await screen.findByRole('note')).toHaveTextContent('Daily AI limit reached');
      expect(screen.queryByText(/Entschuldigung/)).not.toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: 'Chat message in German' })).toBeEnabled();
    });

    it('offers the guest sign-in through onSignIn', async () => {
      const onSignIn = vi.fn();
      await renderChat(<ChatTab onSignIn={onSignIn} />);
      callClaude.mockReset();
      callClaude.mockRejectedValueOnce(denial());
      await sendHallo();
      await userEvent.click(await screen.findByRole('button', { name: /Create a free account/ }));
      expect(onSignIn).toHaveBeenCalledOnce();
    });

    it('clears the note after the next successful send', async () => {
      await renderChat();
      callClaude.mockReset();
      callClaude.mockRejectedValueOnce(denial()).mockResolvedValue(reply);
      await sendHallo();
      await screen.findByRole('note');
      await userEvent.type(
        screen.getByRole('textbox', { name: 'Chat message in German' }),
        'Nochmal'
      );
      await userEvent.click(screen.getByRole('button', { name: 'Send chat message' }));
      await waitFor(() => expect(screen.queryByRole('note')).not.toBeInTheDocument());
    });
  });
});
