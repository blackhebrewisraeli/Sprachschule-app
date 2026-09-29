import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AcceptanceGate from './AcceptanceGate';

const props = (over = {}) => ({
  hasPrior: false,
  accepted: false,
  onAcceptedChange: vi.fn(),
  onContinue: vi.fn(async () => ({ ok: true })),
  onSignOut: vi.fn(),
  onDelete: vi.fn(async () => {}),
  onNavigateLegal: vi.fn(),
  ...over,
});

describe('AcceptanceGate', () => {
  it('asks a new account for "One more step"', () => {
    render(<AcceptanceGate {...props()} />);
    expect(screen.getByRole('alertdialog', { name: 'One more step' })).toBeInTheDocument();
  });

  it('tells an older acceptance the terms were updated', () => {
    render(<AcceptanceGate {...props({ hasPrior: true })} />);
    expect(
      screen.getByRole('alertdialog', { name: "We've updated our terms" })
    ).toBeInTheDocument();
  });

  it('unchecked: Continue refuses with a text error', async () => {
    const p = props();
    render(<AcceptanceGate {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(p.onContinue).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/^Required:/);
  });

  it('checked: Continue records', async () => {
    const p = props({ accepted: true });
    render(<AcceptanceGate {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(p.onContinue).toHaveBeenCalledTimes(1);
  });

  it('a failed save says so and stays', async () => {
    const p = props({ accepted: true, onContinue: vi.fn(async () => ({ ok: false })) });
    render(<AcceptanceGate {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t save/i);
  });

  it('Sign out declines', async () => {
    const p = props();
    render(<AcceptanceGate {...p} />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(p.onSignOut).toHaveBeenCalledTimes(1);
  });

  it('is not dismissible with Escape', async () => {
    const p = props();
    render(<AcceptanceGate {...p} />);
    await userEvent.keyboard('{Escape}');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(p.onSignOut).not.toHaveBeenCalled();
  });

  it('delete needs the typed phrase', async () => {
    const p = props();
    render(<AcceptanceGate {...p} />);
    await userEvent.click(screen.getByRole('button', { name: /delete this account instead/i }));
    const confirm = screen.getByRole('button', { name: /delete account/i });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/type DELETE to confirm/i), 'DELETE');
    await userEvent.click(confirm);
    expect(p.onDelete).toHaveBeenCalledWith('DELETE');
  });

  it('moves focus into the delete confirmation when it opens', async () => {
    render(<AcceptanceGate {...props()} />);
    await userEvent.click(screen.getByRole('button', { name: /delete this account instead/i }));
    expect(screen.getByLabelText(/type DELETE to confirm/i)).toHaveFocus();
  });
});
