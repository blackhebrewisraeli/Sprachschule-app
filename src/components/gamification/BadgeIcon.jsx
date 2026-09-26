import { COLORS, FONTS, FONT_WEIGHT } from '../../lib/theme';

// Badge artwork: one drawn medal per achievement, replacing the emoji that
// used to stand in for them.
//
// An emoji badge rendered as whatever the OS vendor's font drew — a different
// picture on iOS, Android and Windows, with no shared style between 🔥, 🏛️
// and ✅ — so the badge wall read as clip-art rather than as a set. These are
// enamel pins in the German flag palette: a frame whose SHAPE says the family
// (round for streaks, hexagonal for volume, a shield for mastery, a rosette
// for quests), a rim whose colour says the tier (black → red → gold), a glyph,
// and a ribbon carrying the number where the badge is a count.
//
// Colours come only from the FLAG tokens. They are brand colours with the same
// value in every palette, which is exactly what a physical-looking medal
// wants: a gold rim must not turn into a muted ink rim in dark mode. They are
// applied through `style`, never presentation attributes, because a
// `var(--…)` token is only guaranteed to resolve as a CSS property.
//
// Decorative: every consumer prints the badge name beside the medal, so the
// SVG is aria-hidden and must not be announced a second time.

const K = COLORS.flagBlack;
const R = COLORS.flagRed;
const G = COLORS.flagGold;
const W = COLORS.flagOnRed; // white — the paired ink on the red stripe

const C = 32; // centre of the 64×64 artboard

const paint = (fill, extra) => ({ fill, ...extra });
const line = (stroke, width) => ({
  fill: 'none',
  stroke,
  strokeWidth: width,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

// ── Frames ─────────────────────────────────────────────────────────────────
// Each is drawn at full size for the rim, again scaled about the centre for
// the enamel face, and once more as a hairline for the polished inner edge.

function polygon(points, radius, offset = -90) {
  return Array.from({ length: points }, (_, i) => {
    const a = ((offset + (360 / points) * i) * Math.PI) / 180;
    return `${(C + radius * Math.cos(a)).toFixed(2)},${(C + radius * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
}

function rosette() {
  const points = [];
  for (let i = 0; i < 32; i += 1) {
    const r = i % 2 === 0 ? 30 : 26.5;
    const a = ((-90 + (360 / 32) * i) * Math.PI) / 180;
    points.push(`${(C + r * Math.cos(a)).toFixed(2)},${(C + r * Math.sin(a)).toFixed(2)}`);
  }
  return points.join(' ');
}

const FRAMES = {
  circle: (style) => <circle cx={C} cy={C} r={29} style={style} />,
  hexagon: (style) => <polygon points={polygon(6, 30)} style={style} />,
  shield: (style) => (
    <path d="M32 3 L57 11 V30 C57 45 46.5 55 32 61 C17.5 55 7 45 7 30 V11 Z" style={style} />
  ),
  rosette: (style) => <polygon points={rosette()} style={style} />,
};

const scaled = (s) => `translate(${C} ${C}) scale(${s}) translate(${-C} ${-C})`;

function Frame({ shape, rim, face }) {
  const draw = FRAMES[shape] ?? FRAMES.circle;
  return (
    <>
      {/* The rim's outer edge is traced in the theme's strong border so a
          black rim keeps its silhouette on a dark card, where flag-black and
          the surface are a few shades apart. */}
      {draw({ ...paint(rim), stroke: COLORS.borderStrong, strokeWidth: 1.5 })}
      <g transform={scaled(0.82)}>{draw(paint(face))}</g>
      <g transform={scaled(0.74)}>{draw({ ...line(W, 1), strokeOpacity: 0.28 })}</g>
    </>
  );
}

// ── Ribbon ─────────────────────────────────────────────────────────────────
// A notched banner across the lower rim, for badges that are a count.

function Ribbon({ text, fill = K, ink = G }) {
  return (
    <g>
      <polygon points="6,44 14,41 14,53 6,56 9,48.5" style={paint(fill, { fillOpacity: 0.75 })} />
      <polygon
        points="58,44 50,41 50,53 58,56 55,48.5"
        style={paint(fill, { fillOpacity: 0.75 })}
      />
      <rect x={11} y={40} width={42} height={13} rx={2} style={paint(fill)} />
      <text
        x={C}
        y={50}
        textAnchor="middle"
        style={{
          fill: ink,
          fontFamily: FONTS.display,
          fontWeight: FONT_WEIGHT.black,
          fontSize: 10,
          letterSpacing: '0.02em',
        }}
      >
        {text}
      </text>
    </g>
  );
}

// ── Glyphs ─────────────────────────────────────────────────────────────────
// Drawn on a 24×24 grid, then placed: higher and smaller when a ribbon sits
// under them, centred and larger when the badge has no number.

function Glyph({ ribbon, children }) {
  const transform = ribbon ? 'translate(17.6 8) scale(1.2)' : 'translate(15.2 15.2) scale(1.4)';
  return <g transform={transform}>{children}</g>;
}

// The left laurel branch: a stem arcing from the bottom up the left side, with
// leaves set along it, each tilted outward off the tangent. The right branch
// is the same group mirrored.
const LAUREL = (() => {
  const cx = 12;
  const cy = 12.5;
  const r = 9.2;
  const at = (deg) => {
    const a = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const [x0, y0] = at(96);
  const [x1, y1] = at(228);
  return {
    stem: `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`,
    leaves: [104, 134, 164, 194, 222].map((deg) => {
      const [x, y] = at(deg);
      return { x: x.toFixed(2), y: y.toFixed(2), angle: deg + 90 - 32 };
    }),
  };
})();

const GLYPHS = {
  flame: (ink, accent) => (
    <>
      <path
        d="M12 1.5 C12.9 4.6 12.6 7 11.6 9.3 C13.4 8.7 14.6 7.3 15.2 4.8 C17.8 7.6 19.5 10.9 19.5 14.2 A7.5 7.5 0 0 1 4.5 14.2 C4.5 9.6 8.4 5.8 12 1.5 Z"
        style={paint(ink)}
      />
      <path
        d="M12 11 C13.8 13 15.2 14.8 15.2 16.9 A3.2 3.2 0 0 1 8.8 16.9 C8.8 14.8 10.2 13 12 11 Z"
        style={paint(accent)}
      />
    </>
  ),
  crown: (ink, accent) => (
    <>
      <path d="M3 8 L7.6 12.4 L12 4.6 L16.4 12.4 L21 8 L19.2 17.6 H4.8 Z" style={paint(ink)} />
      <rect x={4.8} y={18.8} width={14.4} height={2.6} rx={1} style={paint(ink)} />
      <circle cx={3} cy={8} r={1.6} style={paint(ink)} />
      <circle cx={12} cy={4.4} r={1.6} style={paint(ink)} />
      <circle cx={21} cy={8} r={1.6} style={paint(ink)} />
      <circle cx={12} cy={13.6} r={1.7} style={paint(accent)} />
    </>
  ),
  hundred: (ink) => (
    <>
      <text
        x={12}
        y={16}
        textAnchor="middle"
        style={{
          fill: ink,
          fontFamily: FONTS.display,
          fontWeight: FONT_WEIGHT.black,
          fontSize: 11,
          letterSpacing: '-0.02em',
        }}
      >
        100
      </text>
      <path d="M3.5 18.6 C9 17.4 15 17.4 20.5 18.6" style={line(ink, 1.5)} />
      <path d="M5.5 21.2 C10 20.3 14 20.3 18.5 21.2" style={line(ink, 1.5)} />
    </>
  ),
  temple: (ink) => (
    <>
      <path d="M12 2.5 L21.5 8 H2.5 Z" style={paint(ink)} />
      <rect x={3.5} y={9} width={17} height={2.2} rx={0.6} style={paint(ink)} />
      <rect x={5} y={12.2} width={2.6} height={6.4} style={paint(ink)} />
      <rect x={10.7} y={12.2} width={2.6} height={6.4} style={paint(ink)} />
      <rect x={16.4} y={12.2} width={2.6} height={6.4} style={paint(ink)} />
      <rect x={2.5} y={19.6} width={19} height={2.4} rx={0.6} style={paint(ink)} />
    </>
  ),
  rocket: (ink, accent) => (
    <>
      <path d="M9.4 17.4 H14.6 L12 23 Z" style={paint(accent)} />
      <path d="M7.4 12.6 L3.6 16.4 V19.4 L7.4 17.2 Z" style={paint(ink)} />
      <path d="M16.6 12.6 L20.4 16.4 V19.4 L16.6 17.2 Z" style={paint(ink)} />
      <path
        d="M12 1.5 C15.6 4.2 17 8.4 17 13 V17.6 H7 V13 C7 8.4 8.4 4.2 12 1.5 Z"
        style={paint(ink)}
      />
      <circle cx={12} cy={10} r={2.3} style={paint(accent)} />
    </>
  ),
  book: (ink, accent) => (
    <>
      <path
        d="M1.8 5.6 C5.2 4.6 8.8 4.8 11.4 6.8 V20.4 C8.8 18.6 5.2 18.4 1.8 19.4 Z"
        style={paint(ink)}
      />
      <path
        d="M22.2 5.6 C18.8 4.6 15.2 4.8 12.6 6.8 V20.4 C15.2 18.6 18.8 18.4 22.2 19.4 Z"
        style={paint(ink)}
      />
      <path
        d="M4 9.4 C6 8.9 8 9 9.6 9.9 M4 12.6 C6 12.1 8 12.2 9.6 13.1"
        style={line(accent, 1.1)}
      />
      <path
        d="M20 9.4 C18 8.9 16 9 14.4 9.9 M20 12.6 C18 12.1 16 12.2 14.4 13.1"
        style={line(accent, 1.1)}
      />
    </>
  ),
  books: (ink, accent) => (
    <>
      <rect x={3} y={16.4} width={18} height={5} rx={1} style={paint(ink)} />
      <rect x={5} y={10.8} width={15} height={4.8} rx={1} style={paint(accent)} />
      <rect x={3.8} y={5.2} width={16} height={4.8} rx={1} style={paint(ink)} />
      <path d="M6 18.9 H18 M7.6 13.2 H17.4 M6.6 7.6 H17" style={line(accent, 0.9)} />
    </>
  ),
  cards: (ink, accent) => (
    <>
      <rect
        x={4.2}
        y={3.4}
        width={12}
        height={16}
        rx={2}
        transform="rotate(-12 10.2 11.4)"
        style={{ ...line(ink, 1.4), fill: accent }}
      />
      <rect x={7.6} y={5} width={12} height={16} rx={2} style={paint(ink)} />
      <path d="M10.4 13.2 L12.8 15.6 L17 10.4" style={line(accent, 2.2)} />
    </>
  ),
  trophy: (ink, accent) => (
    <>
      <path d="M7 5 H4.4 V7.2 A3.4 3.4 0 0 0 7.8 10.6" style={line(ink, 1.7)} />
      <path d="M17 5 H19.6 V7.2 A3.4 3.4 0 0 1 16.2 10.6" style={line(ink, 1.7)} />
      <path d="M6.6 2.6 H17.4 V8.6 A5.4 5.4 0 0 1 6.6 8.6 Z" style={paint(ink)} />
      <rect x={10.9} y={13.6} width={2.2} height={3.6} style={paint(ink)} />
      <rect x={7.4} y={17.2} width={9.2} height={3.6} rx={1} style={paint(ink)} />
      <path
        d="M12 4.6 L12.9 6.5 L14.9 6.7 L13.4 8 L13.8 10 L12 9 L10.2 10 L10.6 8 L9.1 6.7 L11.1 6.5 Z"
        style={paint(accent)}
      />
    </>
  ),
  clipboard: (ink, accent) => (
    <>
      <rect x={4.6} y={3.6} width={14.8} height={18.4} rx={2} style={paint(ink)} />
      <rect x={8.6} y={2} width={6.8} height={3.8} rx={1.2} style={paint(accent)} />
      <path
        d="M7.6 10.6 L8.9 11.9 L11 9.6 M7.6 15.6 L8.9 16.9 L11 14.6"
        style={line(accent, 1.4)}
      />
      <path d="M12.8 10.8 H16.6 M12.8 15.8 H16.6" style={line(accent, 1.4)} />
    </>
  ),
  sun: (ink, accent) => (
    <>
      {Array.from({ length: 8 }, (_, i) => {
        const a = ((i * 45 - 90) * Math.PI) / 180;
        const x1 = (12 + 7.2 * Math.cos(a)).toFixed(2);
        const y1 = (12 + 7.2 * Math.sin(a)).toFixed(2);
        const x2 = (12 + 10.6 * Math.cos(a)).toFixed(2);
        const y2 = (12 + 10.6 * Math.sin(a)).toFixed(2);
        return <path key={i} d={`M${x1} ${y1} L${x2} ${y2}`} style={line(ink, 2)} />;
      })}
      <circle cx={12} cy={12} r={5.4} style={paint(ink)} />
      <circle cx={12} cy={12} r={2.4} style={paint(accent)} />
    </>
  ),
  laurel: (ink, accent) => (
    <>
      {[false, true].map((mirrored) => (
        <g key={String(mirrored)} transform={mirrored ? 'translate(24 0) scale(-1 1)' : undefined}>
          <path d={LAUREL.stem} style={line(ink, 1.1)} />
          {LAUREL.leaves.map(({ x, y, angle }) => (
            <path
              key={angle}
              d="M0 0 Q2.4 -1.9 5 0 Q2.4 1.9 0 0 Z"
              transform={`translate(${x} ${y}) rotate(${angle})`}
              style={paint(ink)}
            />
          ))}
        </g>
      ))}
      <text
        x={12}
        y={17}
        textAnchor="middle"
        style={{
          fill: accent,
          fontFamily: FONTS.display,
          fontWeight: FONT_WEIGHT.black,
          fontSize: 12,
        }}
      >
        1
      </text>
    </>
  ),
  // Anything the catalogue grows before this file does: a plain star medal.
  star: (ink) => (
    <path
      d="M12 2.5 L14.8 8.6 L21.4 9.3 L16.4 13.8 L17.8 20.3 L12 17 L6.2 20.3 L7.6 13.8 L2.6 9.3 L9.2 8.6 Z"
      style={paint(ink)}
    />
  ),
};

// ── The catalogue ──────────────────────────────────────────────────────────
// Keyed by achievement id. `glyph` draws in `ink` with `accent` details;
// `ribbon` is the count printed on the banner, if any.

const ART = {
  streak3: { shape: 'circle', rim: K, face: R, glyph: 'flame', ink: G, accent: R, ribbon: '3' },
  streak7: { shape: 'circle', rim: K, face: R, glyph: 'flame', ink: G, accent: R, ribbon: '7' },
  streak14: { shape: 'circle', rim: G, face: R, glyph: 'flame', ink: G, accent: K, ribbon: '14' },
  streak30: {
    shape: 'circle',
    rim: G,
    face: K,
    glyph: 'crown',
    ink: G,
    accent: R,
    ribbon: '30',
    ribbonFill: R,
    ribbonInk: W,
  },
  vol100: { shape: 'hexagon', rim: K, face: G, glyph: 'hundred', ink: K },
  vol500: { shape: 'hexagon', rim: K, face: G, glyph: 'temple', ink: K, ribbon: '500' },
  vol1000: {
    shape: 'hexagon',
    rim: R,
    face: G,
    glyph: 'rocket',
    ink: K,
    accent: R,
    ribbon: '1000',
    ribbonFill: R,
    ribbonInk: W,
  },
  words25: { shape: 'hexagon', rim: K, face: R, glyph: 'book', ink: W, accent: R, ribbon: '25' },
  words50: { shape: 'hexagon', rim: G, face: R, glyph: 'books', ink: W, accent: G, ribbon: '50' },
  deck1: { shape: 'shield', rim: K, face: G, glyph: 'cards', ink: K, accent: G },
  allDecks: { shape: 'shield', rim: G, face: K, glyph: 'trophy', ink: G, accent: R },
  leagueChampion: { shape: 'shield', rim: G, face: R, glyph: 'laurel', ink: G, accent: G },
  quests10: {
    shape: 'rosette',
    rim: K,
    face: R,
    glyph: 'clipboard',
    ink: W,
    accent: K,
    ribbon: '10',
  },
  quests50: {
    shape: 'rosette',
    rim: G,
    face: R,
    glyph: 'clipboard',
    ink: W,
    accent: R,
    ribbon: '50',
  },
  questPerfectDay: { shape: 'rosette', rim: G, face: K, glyph: 'sun', ink: G, accent: R },
};

const FALLBACK = { shape: 'circle', rim: K, face: G, glyph: 'star', ink: K };

/**
 * @param {object} props
 * @param {string} props.id    achievement id from ACHIEVEMENTS
 * @param {number} [props.size] rendered width and height in px
 */
export default function BadgeIcon({ id, size = 48, style }) {
  const art = ART[id] ?? FALLBACK;
  const glyph = GLYPHS[art.glyph] ?? GLYPHS.star;
  const ribbon = art.ribbon ?? null;

  return (
    <svg
      data-badge-icon={id}
      // "fallback" marks an id with no drawn medal of its own yet.
      data-badge-art={Object.hasOwn(ART, id) ? 'drawn' : 'fallback'}
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block', flexShrink: 0, overflow: 'visible', ...style }}
    >
      <Frame shape={art.shape} rim={art.rim} face={art.face} />
      <Glyph ribbon={Boolean(ribbon)}>{glyph(art.ink, art.accent ?? art.face)}</Glyph>
      {ribbon ? <Ribbon text={ribbon} fill={art.ribbonFill} ink={art.ribbonInk} /> : null}
    </svg>
  );
}
