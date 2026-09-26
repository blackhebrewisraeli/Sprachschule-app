import { COLORS, SPACE } from '../../lib/theme';
import ScaffoldActions from './ScaffoldActions';

/**
 * The frame every scaffolded composer sits in: the recessed strip under the
 * conversation, the composer's own content (a word bank, a sentence with a
 * gap), then the shared action row — Type instead, and send.
 *
 * WordBank and FillBlank each drew this frame and the action row themselves,
 * line for line, which is what SonarCloud's duplication gate counted once
 * Translate began reusing both composers. Owning it here means a spacing or
 * colour change lands on every scaffold stage at once.
 */
export default function ScaffoldComposer({
  canSend,
  onSend,
  onSwitchToTyping,
  sendLabel,
  children,
}) {
  return (
    <div
      style={{
        borderTop: `1px solid ${COLORS.border}`,
        padding: SPACE[3],
        background: COLORS.paperDeep,
        display: 'grid',
        gap: SPACE[3],
        minWidth: 0,
      }}
    >
      {children}
      <ScaffoldActions
        canSend={canSend}
        onSend={onSend}
        onSwitchToTyping={onSwitchToTyping}
        sendLabel={sendLabel}
      />
    </div>
  );
}
