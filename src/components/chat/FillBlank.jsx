import { useState } from 'react';
import { COLORS, FIELD, FONTS, FONT_SIZE, SPACE } from '../../lib/theme';
import { gapParts } from '../../lib/chatInputModes';
import { shuffle } from '../../lib/utils';
import ScaffoldComposer from './ScaffoldComposer';

// FIELD is 16px, not md: iOS zooms the page when a focused field is under 16px.
const gapStyle = { ...FIELD, margin: `0 ${SPACE[1]}px` };

/**
 * Fill-in-the-blank composer for the two middle scaffold stages: the AI's
 * suggested line with one word missing. `choice` offers the word and its
 * distractors in a native select; `typed` asks for it. Either way the whole
 * sentence goes through the shared onSend and the AI grades it like any turn.
 */
export default function FillBlank({
  mode,
  scaffold,
  thinking,
  onSend,
  onSwitchToTyping,
  sendLabel,
}) {
  const [options] = useState(() => shuffle([scaffold.answer, ...scaffold.distractors]));
  const [word, setWord] = useState('');
  const { before, after } = gapParts(scaffold);
  const canSend = word.trim().length > 0 && !thinking;

  const send = () => {
    if (!canSend) return;
    onSend(`${before}${word.trim()}${after}`);
    setWord('');
  };

  return (
    <ScaffoldComposer
      canSend={canSend}
      onSend={send}
      onSwitchToTyping={onSwitchToTyping}
      sendLabel={sendLabel}
    >
      <div
        role="group"
        aria-label="Your sentence"
        style={{
          fontFamily: FONTS.body,
          fontSize: FONT_SIZE.lg,
          color: COLORS.ink,
          lineHeight: 2.2,
          overflowWrap: 'anywhere',
        }}
      >
        {before}
        {mode === 'choice' ? (
          <select
            aria-label="Missing word"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            style={gapStyle}
          >
            <option value="" disabled>
              …
            </option>
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : (
          <input
            aria-label="Missing word"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            style={{ ...gapStyle, width: '7em' }}
          />
        )}
        {after}
      </div>
    </ScaffoldComposer>
  );
}
