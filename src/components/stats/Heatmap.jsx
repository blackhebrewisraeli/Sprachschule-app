import { useLayoutEffect, useRef } from 'react';
import { COLORS, FONTS, FONT_SIZE, LETTER_SPACING, SPACE } from '../../lib/theme';

// Heatmap intensity palette (0 = no activity … 4 = 20+ exercises).
const INTENSITY_COLORS = [
  COLORS.paperDeep, // 0 — no activity
  COLORS.heat1, // 1 — 1–3 events  (gold + alpha, per mode)
  COLORS.heat2, // 2 — 4–9 events
  COLORS.gold, // 3 — 10–19 events
  COLORS.red, // 4 — 20+ events
];

// Cell size bounds, in px. A cell GROWS with the card rather than sitting at a
// fixed 8px: at 8px the 53-week grid was 477px wide, so a ~1300px desktop card
// drew the whole year in its left third and left the rest blank.
//
//   min — the floor below which a day is too small to see or hover. When the
//         card cannot fit every week at the floor (phones), the grid scrolls
//         instead of shrinking further, and opens scrolled to this week.
//   max — the ceiling that keeps a very wide card from turning each day into a
//         tile. Past it the grid stops growing and centres, with even margins.
const HEATMAP_CELL = {
  regular: { min: 8, max: 20, gap: 2 },
  mobile: { min: 7, max: 14, gap: 1 },
};

const CELL_BOX = {
  width: '100%',
  aspectRatio: '1 / 1',
  boxSizing: 'border-box',
};

// GitHub-style 12-month activity grid (7 rows, columns = weeks).
export default function Heatmap({ data, mobile }) {
  const { min, max, gap } = mobile ? HEATMAP_CELL.mobile : HEATMAP_CELL.regular;
  // grid-auto-flow: column means each column (week) fills top to bottom.
  const weeks = Math.max(1, Math.ceil(data.length / 7));
  const scrollRef = useRef(null);

  // On a phone the year is wider than the card, and the part a learner cares
  // about — this week — is at the far right. Open there, not in last year.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && el.scrollWidth > el.clientWidth) el.scrollLeft = el.scrollWidth;
  }, [weeks]);

  return (
    // The scroller and the grid are two boxes on purpose. `justify-content:
    // center` on a box that ALSO scrolls pushes overflow off BOTH edges, and
    // the left part becomes unreachable. Here the grid is never narrower than
    // its min-content width, so on a phone it overflows the scroller from the
    // left edge, and on a wide card it fills the width and centres its tracks.
    <div
      ref={scrollRef}
      data-testid="activity-heatmap-scroll"
      style={{ overflowX: 'auto', maxWidth: '100%', paddingBottom: SPACE[1] }}
    >
      <div
        data-testid="activity-heatmap"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${weeks}, minmax(${min}px, ${max}px))`,
          gridTemplateRows: 'repeat(7, auto)',
          gridAutoFlow: 'column',
          justifyContent: 'center',
          gap,
          width: '100%',
          minWidth: 'min-content',
        }}
      >
        {data.map((day) => (
          <div
            key={day.date}
            title={`${day.date} · ${day.total} exercise${day.total === 1 ? '' : 's'}`}
            style={{
              ...CELL_BOX,
              background: INTENSITY_COLORS[day.intensity],
              border: `1px solid ${COLORS.inkA20}`,
            }}
          />
        ))}
        {/* Pad the trailing column so the grid stays rectangular. */}
        {data.length < weeks * 7 &&
          Array.from({ length: weeks * 7 - data.length }).map((_, i) => (
            <div key={`pad-${i}`} style={{ ...CELL_BOX, background: 'transparent' }} />
          ))}
      </div>
    </div>
  );
}

export function HeatmapLegend() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        // Centred under the grid, which is itself centred in the card.
        justifyContent: 'center',
        gap: SPACE[2],
        marginTop: SPACE[2],
        fontFamily: FONTS.mono,
        fontSize: FONT_SIZE.tag,
        letterSpacing: LETTER_SPACING.caps,
        color: COLORS.mute,
      }}
    >
      <span>LESS</span>
      {INTENSITY_COLORS.map((c, i) => (
        <span
          key={i}
          style={{
            width: 7,
            height: 7,
            background: c,
            border: `1px solid ${COLORS.inkA20}`,
          }}
        />
      ))}
      <span>MORE</span>
    </div>
  );
}
