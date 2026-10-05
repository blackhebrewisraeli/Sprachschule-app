import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WelcomeBackOverlay from './WelcomeBackOverlay';

describe('WelcomeBackOverlay', () => {
  it('greets by name with the pack kicker and today’s standing', () => {
    render(<WelcomeBackOverlay name="Mira" streak={4} goalRemaining={30} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.getByText('Willkommen zurück')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /good to see you, mira/i })).toBeInTheDocument();
    expect(screen.getByText(/4-day streak\. 30 XP to today's goal/i)).toBeInTheDocument();
  });

  it('says the goal is done rather than counting down from zero', () => {
    render(<WelcomeBackOverlay goalMet onClose={() => {}} />);
    expect(screen.getByText(/today's goal is already done/i)).toBeInTheDocument();
    expect(screen.queryByText(/streak/i)).not.toBeInTheDocument();
  });

  it('closes from its one action, Escape, and the close button', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<WelcomeBackOverlay onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: /let's go/i }));
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('carries the placement invite when it is due, with both answers', async () => {
    const user = userEvent.setup();
    const onTakeTest = vi.fn();
    const onNotNow = vi.fn();
    render(
      <WelcomeBackOverlay offer onTakeTest={onTakeTest} onNotNow={onNotNow} onClose={() => {}} />
    );
    expect(screen.getByText(/nine quick questions/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /let's go/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /take the test/i }));
    await user.click(screen.getByRole('button', { name: /not now/i }));
    expect(onTakeTest).toHaveBeenCalledTimes(1);
    expect(onNotNow).toHaveBeenCalledTimes(1);
  });
});
