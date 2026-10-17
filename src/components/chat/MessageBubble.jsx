import { useId, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { COLORS, FONT_MONO, FONT_BODY, FONT_SIZE, RADIUS, TEXT, SPACE } from '../../lib/theme';
import { canSpeak, speak } from '../../lib/speech';
import { activePack } from '../../packs';
import InlineCorrection from './InlineCorrection';

// A single chat message — the scene character's (gold, left, with avatar) or the
// learner's (ink, right). German is the default line; EN and IPA wait behind
// toggles. `speaker` names who is talking: the scene role, defaulting to the
// pack persona.
export default function MessageBubble({ msg, speaker = activePack.prompts.persona }) {
  const isUser = msg.role === 'user';
  const ipaId = useId();
  const enId = useId();
  const [showIpa, setShowIpa] = useState(false);
  const [showEn, setShowEn] = useState(false);
  const hasIpa = Boolean(msg.ipa);
  const hasEn = Boolean(msg.en);

  return (
    <div
      className="slide-up"
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      {!isUser && (
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: RADIUS.pill,
            background: COLORS.gold,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 18,
            flexShrink: 0,
          }}
        >
          🧑‍🏫
        </div>
      )}
      <div style={{ maxWidth: '78%', minWidth: 0, marginLeft: isUser ? 'auto' : 0 }}>
        <div
          style={{
            fontFamily: FONT_MONO,
            fontSize: 9,
            letterSpacing: '0.2em',
            color: COLORS.mute,
            marginBottom: 6,
            textAlign: isUser ? 'right' : 'left',
          }}
        >
          {/* 'DU' stays German — UI-chrome localisation is a separate problem
              from the speaker name, same as MessageList's "tippt". */}
          {isUser ? 'DU' : `— ${speaker.toUpperCase()}`}
        </div>
        <div
          style={{
            padding: '14px 18px',
            background: isUser ? COLORS.ink : COLORS.gold,
            // The tutor's bubble is the accent FILL, which is the same gold in both
            // modes — so its text must be accentOn, not the page fg. Using fg
            // here rendered near-white on gold in dark mode at 1.25:1.
            color: isUser ? COLORS.paper : COLORS.accentOn,
            borderRadius: isUser ? '20px 20px 6px 20px' : '20px 20px 20px 6px',
          }}
        >
          <div
            style={{
              fontFamily: FONT_BODY,
              fontSize: FONT_SIZE.lg,
              fontWeight: 500,
              lineHeight: 1.5,
            }}
          >
            {msg.de}
            {!isUser && canSpeak() && (
              <button
                type="button"
                data-ui="button"
                onClick={() => speak(msg.de)}
                aria-label={`Play ${speaker} response audio`}
                style={{
                  marginLeft: 10,
                  background: 'transparent',
                  border: 'none',
                  color: COLORS.red,
                  cursor: 'pointer',
                  verticalAlign: 'middle',
                }}
              >
                <Volume2 size={16} aria-hidden="true" />
              </button>
            )}
          </div>
          {!isUser && (hasIpa || hasEn) && (
            <div style={{ display: 'flex', gap: SPACE[2], marginTop: SPACE[2] }}>
              {hasEn && (
                <button
                  type="button"
                  data-ui="button"
                  aria-expanded={showEn}
                  aria-controls={enId}
                  onClick={() => setShowEn((v) => !v)}
                  style={disclosureStyle}
                >
                  EN
                </button>
              )}
              {hasIpa && (
                <button
                  type="button"
                  data-ui="button"
                  aria-expanded={showIpa}
                  aria-controls={ipaId}
                  onClick={() => setShowIpa((v) => !v)}
                  style={disclosureStyle}
                >
                  IPA
                </button>
              )}
            </div>
          )}
          {hasIpa && showIpa && (
            <div id={ipaId} style={{ ...TEXT.ipa, marginTop: SPACE[2] }}>
              {msg.ipa}
            </div>
          )}
          {hasEn && showEn && (
            <div
              id={enId}
              style={{
                ...TEXT.translation,
                marginTop: SPACE[2],
                paddingTop: SPACE[2],
                // Derived from the bubble's own text colour rather than a token:
                // the two bubbles have different foregrounds and both flip by
                // mode. Appending '30' to a token stopped working when colours
                // became CSS variables — `var(--c-fg)30` is not a colour.
                borderTop: '1px solid color-mix(in srgb, currentColor 30%, transparent)',
              }}
            >
              {msg.en}
            </div>
          )}
        </div>
        {isUser && msg.graded ? <InlineCorrection correction={msg.correction ?? null} /> : null}
      </div>
    </div>
  );
}

const disclosureStyle = {
  background: 'transparent',
  border: '1px solid color-mix(in srgb, currentColor 35%, transparent)',
  color: 'inherit',
  fontFamily: FONT_MONO,
  fontSize: FONT_SIZE.tag,
  letterSpacing: '0.12em',
  padding: '3px 8px',
  borderRadius: RADIUS.pill,
  cursor: 'pointer',
};
