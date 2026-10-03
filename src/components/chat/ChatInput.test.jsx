import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatInput from './ChatInput';

const baseProps = {
  input: '',
  setInput: () => {},
  listening: false,
  thinking: false,
  onSend: () => {},
  onStartListening: () => {},
  onStopListening: () => {},
};

describe('ChatInput', () => {
  // jsdom has no speech recognition; Chrome and Safari do.
  beforeEach(() => vi.stubGlobal('webkitSpeechRecognition', function SR() {}));
  afterEach(() => vi.unstubAllGlobals());

  it('forwards typing to setInput', async () => {
    const setInput = vi.fn();
    render(<ChatInput {...baseProps} setInput={setInput} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Chat message in German' }), 'Ha');
    expect(setInput).toHaveBeenCalledWith('H');
    expect(setInput).toHaveBeenCalledWith('a');
  });

  it('submits on Enter', async () => {
    const onSend = vi.fn();
    render(<ChatInput {...baseProps} input="Hallo" onSend={onSend} />);
    await userEvent.type(screen.getByRole('textbox'), '{Enter}');
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('submits from the send button', async () => {
    const onSend = vi.fn();
    render(<ChatInput {...baseProps} input="Hallo" onSend={onSend} />);
    await userEvent.click(screen.getByRole('button', { name: 'Send chat message' }));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('disables send while the input is empty', () => {
    render(<ChatInput {...baseProps} input="   " />);
    expect(screen.getByRole('button', { name: 'Send chat message' })).toBeDisabled();
  });

  it('disables send while Anna is thinking', () => {
    render(<ChatInput {...baseProps} input="Hallo" thinking />);
    expect(screen.getByRole('button', { name: 'Send chat message' })).toBeDisabled();
  });

  it('mic button starts listening when idle and stops when listening', async () => {
    const onStartListening = vi.fn();
    const onStopListening = vi.fn();
    const { rerender } = render(
      <ChatInput
        {...baseProps}
        onStartListening={onStartListening}
        onStopListening={onStopListening}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Start voice input' }));
    expect(onStartListening).toHaveBeenCalledTimes(1);

    rerender(
      <ChatInput
        {...baseProps}
        listening
        onStartListening={onStartListening}
        onStopListening={onStopListening}
      />
    );
    await userEvent.click(screen.getByRole('button', { name: 'Stop voice input' }));
    expect(onStopListening).toHaveBeenCalledTimes(1);
  });

  it('switches the placeholder while listening', () => {
    render(<ChatInput {...baseProps} listening />);
    expect(screen.getByPlaceholderText('Sprich auf Deutsch...')).toBeInTheDocument();
  });

  it('sizes mic and send as 40px icon actions without a SEND label', () => {
    render(<ChatInput {...baseProps} input="Hallo" />);
    const send = screen.getByRole('button', { name: 'Send chat message' });
    const mic = screen.getByRole('button', { name: 'Start voice input' });
    expect(send).toHaveStyle({ width: '40px', height: '40px' });
    expect(mic).toHaveStyle({ width: '40px', height: '40px' });
    expect(send).not.toHaveTextContent('SEND');
  });

  it('hides the mic where the browser has no speech recognition', () => {
    vi.stubGlobal('webkitSpeechRecognition', undefined);
    render(<ChatInput {...baseProps} />);
    expect(screen.queryByRole('button', { name: 'Start voice input' })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Chat message in German' })).toBeInTheDocument();
  });

  // Android's WebView has no recognition, and iOS's WKWebView kills an app that
  // reaches the microphone without usage descriptions in Info.plist, which the
  // native build does not ship (the store privacy answers declare no audio).
  it('hides the mic in the native app even when recognition exists', () => {
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
    render(<ChatInput {...baseProps} />);
    expect(screen.queryByRole('button', { name: 'Start voice input' })).not.toBeInTheDocument();
  });
});
