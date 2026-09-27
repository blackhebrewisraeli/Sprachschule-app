import { COLORS } from '../../lib/theme';
import TaskIcon from '../ui/TaskIcon';

// Daily-goal ring: red ring fills to `pct` (0–1) around a target glyph; turns
// green with a ✓ when met.
export default function GoalRing({ pct, met, size = 48 }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, pct));
  const color = met ? COLORS.green : COLORS.red;
  return (
    <div
      title={met ? 'Daily goal reached!' : `Daily goal · ${Math.round(clamped * 100)}%`}
      style={{
        position: 'relative',
        width: size,
        height: size,
        flexShrink: 0,
        // Its own plane. The ring colours (success, track, error) are audited
        // against `surface`, not against the masthead's charcoal, where the
        // filled arc falls to 2.2:1 in light.night. Sitting the control on its
        // own disc keeps every existing pairing valid instead of needing a
        // mode-independent copy of each ring colour.
        background: COLORS.surface,
        borderRadius: '50%',
      }}
    >
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={COLORS.track}
          strokeWidth="5"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped)}
          style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease' }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: size * 0.34,
          ...(met ? { animation: 'pop 0.4s ease-out' } : {}),
        }}
      >
        {met ? '✓' : <TaskIcon name="target" size={Math.round(size * 0.42)} />}
      </div>
    </div>
  );
}
