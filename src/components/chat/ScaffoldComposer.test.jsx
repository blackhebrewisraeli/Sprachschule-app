import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ScaffoldComposer from './ScaffoldComposer';

describe('ScaffoldComposer', () => {
  it('draws the composer’s content above the shared action row', () => {
    render(
      <ScaffoldComposer canSend onSend={() => {}} onSwitchToTyping={() => {}}>
        <p>composer content</p>
      </ScaffoldComposer>
    );
    const content = screen.getByText('composer content');
    const send = screen.getByRole('button', { name: 'Send chat message' });
    expect(content.compareDocumentPosition(send) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Type instead' })).toBeInTheDocument();
  });

  it('wires send, the escape hatch and the send label through', async () => {
    const onSend = vi.fn();
    const onSwitchToTyping = vi.fn();
    render(
      <ScaffoldComposer
        canSend
        onSend={onSend}
        onSwitchToTyping={onSwitchToTyping}
        sendLabel="Check answer"
      >
        <span />
      </ScaffoldComposer>
    );
    await userEvent.click(screen.getByRole('button', { name: 'Check answer' }));
    await userEvent.click(screen.getByRole('button', { name: 'Type instead' }));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSwitchToTyping).toHaveBeenCalledTimes(1);
  });
});
