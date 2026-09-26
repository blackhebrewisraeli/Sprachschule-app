import { Mic, MicOff, LayoutGrid } from 'lucide-react';
import { COLORS, FONT_BODY, RADIUS, SHADOW } from '../../lib/theme';
import SendButton from './SendButton';

// Bottom input bar: mic toggle, text field, send button.
// All behavior (speech recognition, sending) lives in the parent and is passed
// in as callbacks — this component is presentational.
export default function ChatInput({
  input,
  setInput,
  listening,
  thinking,
  onSend,
  onStartListening,
  onStopListening,
  onSwitchToWordBank,
}) {
  const canSend = Boolean(input.trim()) && !thinking;
  return (
    <div
      style={{
        borderTop: `1px solid ${COLORS.border}`,
        padding: 12,
        display: 'flex',
        gap: 8,
        background: COLORS.paperDeep,
        alignItems: 'center',
      }}
    >
      <button
        type="button"
        data-ui="button"
        data-focus-on-dark=""
        onClick={listening ? onStopListening : onStartListening}
        aria-label={listening ? 'Stop voice input' : 'Start voice input'}
        style={{
          width: 40,
          height: 40,
          background: listening ? COLORS.red : COLORS.ink,
          color: COLORS.paper,
          border: 'none',
          borderRadius: RADIUS.md,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: listening ? 'pulse-red 1.2s infinite' : 'none',
          flexShrink: 0,
        }}
      >
        {listening ? <MicOff size={18} /> : <Mic size={18} />}
      </button>
      {onSwitchToWordBank && (
        <button
          type="button"
          data-ui="button"
          onClick={onSwitchToWordBank}
          aria-label="Use word bank"
          style={{
            width: 40,
            height: 40,
            flexShrink: 0,
            background: 'none',
            color: COLORS.inkSoft,
            border: `1px solid ${COLORS.border}`,
            borderRadius: RADIUS.md,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <LayoutGrid size={18} aria-hidden="true" />
        </button>
      )}
      <input
        aria-label="Chat message in German"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSend()}
        placeholder={listening ? 'Sprich auf Deutsch...' : 'Schreib auf Deutsch...'}
        style={{
          flex: 1,
          minWidth: 0,
          height: 40,
          background: COLORS.surface,
          border: `1px solid ${COLORS.border}`,
          borderRadius: RADIUS.md,
          boxShadow: SHADOW.inset,
          padding: '0 14px',
          fontFamily: FONT_BODY,
          fontSize: 16,
          color: COLORS.ink,
        }}
      />
      <SendButton canSend={canSend} onClick={() => onSend()} />
    </div>
  );
}
