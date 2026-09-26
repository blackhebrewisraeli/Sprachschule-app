import { useState } from 'react';
import { BORDER, COLORS, FONTS, FONT_SIZE, RADIUS, SHADOW, SPACE } from '../../lib/theme';
import ScaffoldComposer from './ScaffoldComposer';

// Fisher–Yates. Tiles carry their ORIGINAL index as identity, so a sentence
// with a repeated word ("die … die") still has two distinct tiles.
//
// crypto.getRandomValues rather than Math.random: nothing here is
// security-sensitive, but it costs nothing and keeps the pseudorandom-generator
// rule (Sonar S2245) from gating the PR. Modulo bias over a handful of tiles is
// irrelevant to a shuffle.
function jumble(words) {
  const tiles = words.map((word, id) => ({ id, word }));
  const rand = new Uint32Array(tiles.length);
  crypto.getRandomValues(rand);
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = rand[i] % (i + 1);
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  return tiles;
}

const tileStyle = {
  padding: `${SPACE[2]}px ${SPACE[3]}px`,
  background: COLORS.card,
  color: COLORS.ink,
  border: BORDER.panel,
  borderRadius: RADIUS.md,
  boxShadow: SHADOW.press(COLORS.lip),
  fontFamily: FONTS.body,
  fontSize: FONT_SIZE.md,
  cursor: 'pointer',
};

/**
 * Word-bank input mode: tap jumbled words to build the sentence, tap a placed
 * word to put it back, then send. Presentational — the words come from the
 * parent (mocked today, AI-generated later) and sending goes through the same
 * onSend the free-text input uses.
 */
export default function WordBank({ words, thinking, onSend, onSwitchToTyping, sendLabel }) {
  const [bank] = useState(() => jumble(words));
  const [placed, setPlaced] = useState([]);
  const placedIds = new Set(placed.map((t) => t.id));
  const sentence = placed.map((t) => t.word).join(' ');
  const canSend = placed.length > 0 && !thinking;

  const send = () => {
    if (!canSend) return;
    onSend(sentence);
    setPlaced([]);
  };

  return (
    <ScaffoldComposer
      canSend={canSend}
      onSend={send}
      onSwitchToTyping={onSwitchToTyping}
      sendLabel={sendLabel}
    >
      {/* The sentence being built. A live region so each placement is heard. */}
      <div
        aria-label="Your sentence"
        aria-live="polite"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: SPACE[2],
          minHeight: SPACE[12],
          padding: SPACE[2],
          borderBottom: BORDER.panel,
          alignItems: 'center',
        }}
      >
        {placed.length === 0 ? (
          <span style={{ fontFamily: FONTS.body, fontSize: FONT_SIZE.sm, color: COLORS.mute }}>
            Tap the words below to build your answer.
          </span>
        ) : (
          placed.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPlaced((p) => p.filter((x) => x.id !== t.id))}
              aria-label={`Remove ${t.word}`}
              style={tileStyle}
            >
              {t.word}
            </button>
          ))
        )}
      </div>

      {/* A native fieldset carries the group role itself; the UA border,
          padding, margin and min-width are reset so it lays out as a plain
          flex row. */}
      <fieldset
        aria-label="Word bank"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: SPACE[2],
          justifyContent: 'center',
          border: 'none',
          margin: 0,
          padding: 0,
          minWidth: 0,
        }}
      >
        {bank.map((t) => {
          const used = placedIds.has(t.id);
          return (
            <button
              key={t.id}
              type="button"
              disabled={used}
              onClick={() => setPlaced((p) => [...p, t])}
              style={{
                ...tileStyle,
                // A used tile keeps its slot so the bank does not reflow under
                // the learner's thumb; it just empties.
                visibility: used ? 'hidden' : 'visible',
              }}
            >
              {t.word}
            </button>
          );
        })}
      </fieldset>
    </ScaffoldComposer>
  );
}
