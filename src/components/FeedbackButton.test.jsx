import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FeedbackButton from './FeedbackButton';

const submitFeedback = vi.hoisted(() => vi.fn());
vi.mock('../lib/feedback', async (importOriginal) => ({
  ...(await importOriginal()),
  submitFeedback,
}));

const VOCAB_CONTEXT = {
  surface: 'vocab',
  level: 'a2',
  deckId: 'hoeren-common',
  itemId: 'de-zeit-noun',
  itemLabel: 'die Zeit',
};

const openDialog = async (user, context = VOCAB_CONTEXT) => {
  render(<FeedbackButton context={context} />);
  await user.click(screen.getByRole('button', { name: /report an issue/i }));
  return screen.getByRole('dialog', { name: /report an issue/i });
};

describe('FeedbackButton', () => {
  beforeEach(() => {
    submitFeedback.mockReset();
    submitFeedback.mockResolvedValue({ ok: true, row: {} });
  });

  it('is a reachable, named control even though it shows only an icon', () => {
    render(<FeedbackButton context={VOCAB_CONTEXT} />);
    const trigger = screen.getByRole('button', { name: /report an issue/i });
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveAccessibleName();
  });

  // The panel centres itself with an inline translate(-50%, -50%), and rise-in
  // animates transform, which overrides that centring for as long as it runs:
  // the panel would start off-centre and snap. So it fades with its scrim.
  it('fades the dialog in without the rise that would undo its centring', async () => {
    const dialog = await openDialog(userEvent.setup());
    expect(dialog).toHaveClass('modal-scrim-in');
    expect(dialog).not.toHaveClass('modal-card-in');
    expect(dialog.previousElementSibling).toHaveClass('modal-scrim-in');
  });

  it('keeps the form closed until asked for', () => {
    render(<FeedbackButton context={VOCAB_CONTEXT} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens a form with a textarea and the three report categories', async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);

    expect(within(dialog).getByRole('textbox')).toBeInTheDocument();
    for (const label of [/wrong translation/i, /confusing ui/i, /bad audio/i]) {
      expect(within(dialog).getByRole('button', { name: label })).toBeInTheDocument();
    }
  });

  it('will not send an empty report', async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);

    expect(within(dialog).getByRole('button', { name: /^send/i })).toBeDisabled();
    await user.type(within(dialog).getByRole('textbox'), '   ');
    expect(within(dialog).getByRole('button', { name: /^send/i })).toBeDisabled();
  });

  // ── The point of the whole feature ────────────────────────────
  it('captures the full exercise context alongside the learner text', async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);

    await user.type(within(dialog).getByRole('textbox'), 'the audio cuts off');
    await user.click(within(dialog).getByRole('button', { name: /bad audio/i }));
    await user.click(within(dialog).getByRole('button', { name: /^send/i }));

    expect(submitFeedback).toHaveBeenCalledTimes(1);
    expect(submitFeedback).toHaveBeenCalledWith({
      surface: 'vocab',
      level: 'a2',
      deckId: 'hoeren-common',
      itemId: 'de-zeit-noun',
      itemLabel: 'die Zeit',
      category: 'audio',
      message: 'the audio cuts off',
    });
  });

  it('defaults the category so a report is never uncategorised', async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);

    await user.type(within(dialog).getByRole('textbox'), 'something is off');
    await user.click(within(dialog).getByRole('button', { name: /^send/i }));

    expect(submitFeedback.mock.calls[0][0].category).toBe('translation');
  });

  it('carries a translate exercise context, deckless, just as faithfully', async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user, {
      surface: 'translate',
      level: 'b1',
      itemId: 'tr-the-train-is-late',
      itemLabel: 'The train is late.',
    });

    await user.type(within(dialog).getByRole('textbox'), 'my answer was also correct');
    await user.click(within(dialog).getByRole('button', { name: /^send/i }));

    expect(submitFeedback.mock.calls[0][0]).toMatchObject({
      surface: 'translate',
      level: 'b1',
      itemId: 'tr-the-train-is-late',
    });
  });

  // ── Answer-leak guard ─────────────────────────────────────────
  // CardFace conceals the German word for the Hören and Artikel drills, so the
  // reported item IS the answer the learner is being asked for right now.
  // Printing "Reporting: die Zeit" in this dialog would hand it to them.
  it('never displays the item it is reporting', async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);

    expect(within(dialog).queryByText(/die Zeit/i)).not.toBeInTheDocument();
    expect(dialog.textContent).not.toMatch(/Zeit/i);
    // …while still sending it.
    await user.type(within(dialog).getByRole('textbox'), 'x');
    await user.click(within(dialog).getByRole('button', { name: /^send/i }));
    expect(submitFeedback.mock.calls[0][0].itemLabel).toBe('die Zeit');
  });

  it('does not leak the item id on screen either', async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);
    expect(dialog.textContent).not.toMatch(/de-zeit-noun/);
  });

  // ── Closing ───────────────────────────────────────────────────
  it('closes on Cancel without sending anything', async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByRole('textbox'), 'never mind');
    await user.click(within(dialog).getByRole('button', { name: /cancel/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(submitFeedback).not.toHaveBeenCalled();
  });

  it('closes on Escape without sending anything', async () => {
    const user = userEvent.setup();
    await openDialog(user);
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(submitFeedback).not.toHaveBeenCalled();
  });

  it('confirms once the report is away', async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByRole('textbox'), 'thanks');
    await user.click(within(dialog).getByRole('button', { name: /^send/i }));

    expect(await screen.findByText(/thank/i)).toBeInTheDocument();
  });

  it('keeps the learner text on screen when the send fails', async () => {
    submitFeedback.mockResolvedValue({ ok: false, error: 'offline' });
    const user = userEvent.setup();
    const dialog = await openDialog(user);
    await user.type(within(dialog).getByRole('textbox'), 'worth keeping');
    await user.click(within(dialog).getByRole('button', { name: /^send/i }));

    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(within(dialog).getByRole('textbox')).toHaveValue('worth keeping');
  });

  // jsdom lays nothing out, so this asserts the arithmetic that decides the
  // width. The rendered result is checked in a real browser at 320px too.
  it('clamps its width to a 320px viewport rather than staying 400px wide', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 320,
    });
    const user = userEvent.setup();
    const dialog = await openDialog(user);

    const width = Number.parseFloat(dialog.style.width);
    expect(width).toBe(304); // 320 - 2×8 gutter
    // Centred via left:50% + translate(-50%), so it spans 8 … 312.
    expect((320 - width) / 2).toBeGreaterThanOrEqual(0);
    expect(dialog.style.boxSizing).toBe('border-box');
  });

  it('keeps its full preferred width when the viewport has room', async () => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1280,
    });
    const user = userEvent.setup();
    const dialog = await openDialog(user);
    expect(Number.parseFloat(dialog.style.width)).toBe(400);
  });

  // Closing a dialog must give focus back to what opened it. Without this,
  // Escape drops focus to <body> and a keyboard user restarts from the top of
  // the page — the dialog's own trigger, several tab stops back.
  it('returns focus to the trigger when Escape dismisses the form', async () => {
    const user = userEvent.setup();
    render(<FeedbackButton context={VOCAB_CONTEXT} />);
    const trigger = screen.getByRole('button', { name: /report an issue/i });

    await user.click(trigger);
    // Guard against a false pass: if focus never moved INTO the dialog, the
    // restore assertion below would hold trivially and prove nothing.
    expect(document.activeElement).not.toBe(trigger);
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it('returns focus to the trigger when Cancel dismisses the form', async () => {
    const user = userEvent.setup();
    render(<FeedbackButton context={VOCAB_CONTEXT} />);
    const trigger = screen.getByRole('button', { name: /report an issue/i });

    await user.click(trigger);
    expect(document.activeElement).not.toBe(trigger);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });

  it('traps focus while the form is open', async () => {
    const user = userEvent.setup();
    const dialog = await openDialog(user);
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
