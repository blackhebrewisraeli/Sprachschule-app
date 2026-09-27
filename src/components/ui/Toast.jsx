import { useEffect } from 'react';
import { COLORS, FONTS, FONT_SIZE, FONT_WEIGHT, RADIUS, SHADOW, SPACE } from '../../lib/theme';
import BadgeIcon from '../gamification/BadgeIcon';
import TaskIcon from './TaskIcon';

// The icon slot's width. A medal and a line glyph differ in size, so a fixed
// slot keeps every title in a stack starting at the same x.
const ICON_SLOT = 32;

// One auto-dismissing toast. `onDone` is called after the lifetime elapses, or
// immediately when the learner dismisses it.
//
// `icon` is a TaskIcon key ('star', 'flame' …), drawn in the plane's paper ink.
// `badge` is an achievement id: a badge toast wears the same medal the badge
// wall draws, not a stand-in. Both are svg, never emoji — an emoji is whatever
// the OS font draws, so it never matched the type beside it.
export function Toast({ icon, badge, title, sub, onDone, ttl = 3200 }) {
  useEffect(() => {
    const t = setTimeout(onDone, ttl);
    return () => clearTimeout(t);
  }, [onDone, ttl]);

  return (
    <div
      className="slide-up"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SPACE[3],
        background: COLORS.ink,
        color: COLORS.paper,
        borderRadius: RADIUS.lg,
        boxShadow: SHADOW.bar,
        padding: `${SPACE[3]}px ${SPACE[5]}px`,
        minWidth: 240,
        pointerEvents: 'auto',
      }}
    >
      {/* Decoration beside a text title — both icons are aria-hidden, since
          announcing one would read the toast twice over. */}
      <span style={{ width: ICON_SLOT, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
        {badge ? <BadgeIcon id={badge} size={ICON_SLOT} /> : <TaskIcon name={icon} size={24} />}
      </span>
      <div>
        <div
          style={{
            fontFamily: FONTS.display,
            fontWeight: FONT_WEIGHT.bold,
            fontSize: FONT_SIZE.lg,
          }}
        >
          {title}
        </div>
        {sub && (
          <div style={{ fontFamily: FONTS.mono, fontSize: FONT_SIZE.tag, color: COLORS.paper }}>
            {sub}
          </div>
        )}
      </div>
      {/* Named with the toast's own title so stacked toasts do not present a
          row of identical "Dismiss" buttons. */}
      <button
        type="button"
        // The toast plane is COLORS.ink, which is also the default focus ring.
        // data-focus-on-dark paints the ring in currentColor — paper here, the
        // paired ink this plane already uses for its text. Same attribute the
        // masthead Sign-in control carries; the global sheet is the one recipe.
        data-ui="button"
        data-focus-on-dark=""
        aria-label={title ? `Dismiss ${title}` : 'Dismiss notification'}
        onClick={onDone}
        style={{
          marginLeft: 'auto',
          flexShrink: 0,
          width: 32,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'transparent',
          border: 'none',
          borderRadius: RADIUS.pill,
          // Inherits the plane's paired ink, so it can never drift from the
          // title it sits beside — and so the dark-plane ring tracks it.
          color: 'currentColor',
          fontSize: FONT_SIZE.xl,
          lineHeight: 1,
          cursor: 'pointer',
          padding: 0,
        }}
      >
        {/* The button's accessible name comes from aria-label; this glyph is
            purely visual. */}
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}

// Fixed stack of toasts near the top-center. `toasts` = [{id, icon|badge, title, sub}].
export default function ToastStack({ toasts, onDismiss }) {
  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        // Gutters on both sides, toasts centred inside. `left: 50%` plus a
        // translate left each toast only HALF the viewport to lay out in, so on
        // a phone "Tagesziel erreicht!" broke onto two lines.
        left: 16,
        right: 16,
        alignItems: 'center',
        zIndex: 200,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        // None here so the stack never blocks the page beneath it; each toast
        // re-enables them, which is what makes the close button clickable.
        pointerEvents: 'none',
      }}
    >
      {toasts.map((t) => (
        <Toast
          key={t.id}
          icon={t.icon}
          badge={t.badge}
          title={t.title}
          sub={t.sub}
          onDone={() => onDismiss(t.id)}
        />
      ))}
    </div>
  );
}
