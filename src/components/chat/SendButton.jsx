import { ArrowRight } from 'lucide-react';
import { COLORS, RADIUS } from '../../lib/theme';

/**
 * The square green send button. ChatInput and every scaffolded composer (via
 * ScaffoldActions) send through it, so the free-text and scaffolded paths
 * cannot drift apart in size, colour or disabled state.
 *
 * `label` names the action for a screen reader: Chat sends a message,
 * Translate checks an answer.
 */
export default function SendButton({ canSend, onClick, label = 'Send chat message' }) {
  return (
    <button
      type="button"
      data-ui="button"
      data-focus-on-dark=""
      onClick={onClick}
      disabled={!canSend}
      aria-label={label}
      style={{
        width: 40,
        height: 40,
        flexShrink: 0,
        padding: 0,
        background: canSend ? COLORS.green : COLORS.mute,
        color: COLORS.paper,
        border: 'none',
        borderRadius: RADIUS.md,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <ArrowRight size={18} aria-hidden="true" />
    </button>
  );
}
