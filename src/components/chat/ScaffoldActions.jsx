import { Keyboard } from 'lucide-react';
import { COLORS, FONTS, FONT_SIZE, SPACE } from '../../lib/theme';
import SendButton from './SendButton';

/**
 * The action row every scaffolded composer shares: the escape hatch to free
 * typing, and send. One component so WordBank and FillBlank cannot drift.
 */
export default function ScaffoldActions({
  canSend,
  onSend,
  onSwitchToTyping,
  sendLabel = 'Send chat message',
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: SPACE[2] }}>
      <button
        type="button"
        data-ui="button"
        onClick={onSwitchToTyping}
        aria-label="Type instead"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: SPACE[1],
          background: 'none',
          border: 'none',
          color: COLORS.inkSoft,
          fontFamily: FONTS.mono,
          fontSize: FONT_SIZE.sm,
          cursor: 'pointer',
        }}
      >
        <Keyboard size={FONT_SIZE.lg} aria-hidden="true" /> Type instead
      </button>
      <SendButton canSend={canSend} onClick={onSend} label={sendLabel} />
    </div>
  );
}
