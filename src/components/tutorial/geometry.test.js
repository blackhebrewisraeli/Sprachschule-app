import { describe, it, expect } from 'vitest';
import { GUTTER, NARROW_GUTTER, BUBBLE_MAX_WIDTH, bubbleBox, scrimRects } from './geometry';

// A DOMRect-alike; jsdom gives every element a zero rect, so the real ones are
// stubbed in the component test and constructed literally here.
const rect = ({ left, top, width, height }) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

describe('bubbleBox', () => {
  it('centres the bubble under an anchor that has room on both sides', () => {
    const box = bubbleBox(rect({ left: 500, top: 100, width: 100, height: 40 }), 1280, 800);
    expect(box.left + box.width / 2).toBe(550);
    expect(box.placement).toBe('below');
  });

  it('places the bubble below the anchor when the space below fits it', () => {
    const box = bubbleBox(rect({ left: 100, top: 10, width: 40, height: 40 }), 1280, 800);
    expect(box.placement).toBe('below');
    expect(box.top).toBeGreaterThan(50);
  });

  it('flips above the anchor when there is no room below', () => {
    const box = bubbleBox(rect({ left: 100, top: 740, width: 40, height: 40 }), 1280, 800);
    expect(box.placement).toBe('above');
    expect(box.top).toBeLessThan(740);
  });

  // ── The 320px contract ────────────────────────────────────────
  // Every anchor the tour points at, at the narrowest supported viewport.
  // Asserted on the computed numbers rather than scrollWidth: an overflowing
  // fixed element grows window.innerWidth in jsdom, so a width-based probe
  // reads back its own bug as success.
  describe('at a 320px viewport', () => {
    const VW = 320;

    // Nav is icon-only below bp.tiny: six ~45px buttons across 320px, so the
    // first and last are hard against the edges. Plus the header status chip.
    const anchors = {
      'status chip (right edge of the header)': rect({ left: 262, top: 8, width: 42, height: 42 }),
      'chat nav button (second of six)': rect({ left: 55, top: 60, width: 45, height: 44 }),
      'stats nav button (last, flush right)': rect({ left: 265, top: 60, width: 45, height: 44 }),
      'anchor hard against the left edge': rect({ left: 0, top: 60, width: 45, height: 44 }),
      'anchor wider than the viewport': rect({ left: -20, top: 60, width: 360, height: 44 }),
    };

    for (const [name, anchorRect] of Object.entries(anchors)) {
      it(`keeps the bubble inside the viewport for the ${name}`, () => {
        const box = bubbleBox(anchorRect, VW, 568);
        expect(box.left).toBeGreaterThanOrEqual(0);
        expect(box.left + box.width).toBeLessThanOrEqual(VW);
      });
    }

    for (const [name, anchorRect] of Object.entries(anchors)) {
      it(`centres the bubble on the viewport for the ${name}`, () => {
        // Equal margins both sides, whichever edge the anchor hugs. Clamping
        // alone kept it inside but pinned it 8px from one edge.
        const box = bubbleBox(anchorRect, VW, 568);
        expect(box.left).toBe(VW - box.left - box.width);
      });
    }

    it('spans the page column, so it lines up with the cards beneath it', () => {
      const box = bubbleBox(anchors['chat nav button (second of six)'], VW, 568);
      expect(box.left).toBe(NARROW_GUTTER);
      expect(box.width).toBe(VW - NARROW_GUTTER * 2);
    });
  });

  describe('at a 375px viewport', () => {
    it('centres the bubble even under the right-most header control', () => {
      const box = bubbleBox(rect({ left: 300, top: 8, width: 42, height: 42 }), 375, 812);
      expect(box.left).toBe(NARROW_GUTTER);
      expect(box.left + box.width).toBe(375 - NARROW_GUTTER);
    });
  });

  describe('from bp.tiny up', () => {
    it('goes back to following the anchor at the preferred width', () => {
      const box = bubbleBox(rect({ left: 40, top: 60, width: 45, height: 44 }), 414, 800);
      expect(box.width).toBe(BUBBLE_MAX_WIDTH);
      expect(box.left).toBe(GUTTER);
    });
  });
});

describe('scrimRects', () => {
  it('leaves the anchor uncovered and covers everything else', () => {
    const anchor = rect({ left: 100, top: 100, width: 50, height: 50 });
    const rects = scrimRects(anchor, 1000, 800);

    const covers = (x, y) =>
      rects.some((r) => x >= r.left && x < r.left + r.width && y >= r.top && y < r.top + r.height);

    expect(covers(125, 125)).toBe(false); // centre of the anchor — the spotlight
    expect(covers(10, 10)).toBe(true); // above-left
    expect(covers(500, 400)).toBe(true); // far side
    expect(covers(125, 400)).toBe(true); // directly below the anchor
    expect(covers(125, 10)).toBe(true); // directly above the anchor
  });

  it('never emits a rect with a negative dimension for an off-screen anchor', () => {
    const rects = scrimRects(rect({ left: -50, top: -50, width: 40, height: 40 }), 320, 568);
    // Without this the loop below is vacuously true on an empty array.
    expect(rects).toHaveLength(4);
    for (const r of rects) {
      expect(r.width).toBeGreaterThanOrEqual(0);
      expect(r.height).toBeGreaterThanOrEqual(0);
    }
  });
});
