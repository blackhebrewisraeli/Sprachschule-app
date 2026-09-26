import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SendButton from './SendButton';
import { COLORS } from '../../lib/theme';

describe('SendButton', () => {
  it('is a 40px green button named for sending a chat message by default', () => {
    render(<SendButton canSend onClick={() => {}} />);
    const send = screen.getByRole('button', { name: 'Send chat message' });
    expect(send).toBeEnabled();
    expect(send).toHaveStyle({ width: '40px', height: '40px' });
    expect(send.style.background).toBe(COLORS.green);
  });

  it('takes the caller’s label, so Translate can say what it does', () => {
    render(<SendButton canSend onClick={() => {}} label="Check answer" />);
    expect(screen.getByRole('button', { name: 'Check answer' })).toBeInTheDocument();
  });

  it('is disabled and muted while there is nothing to send', async () => {
    const onClick = vi.fn();
    render(<SendButton canSend={false} onClick={onClick} />);
    const send = screen.getByRole('button', { name: 'Send chat message' });
    expect(send).toBeDisabled();
    expect(send.style.background).toBe(COLORS.mute);
    await userEvent.click(send);
    expect(onClick).not.toHaveBeenCalled();
  });
});
