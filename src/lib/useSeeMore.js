import { useLayoutEffect, useRef, useState } from 'react';

const ONE_LINE = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const linesClamp = (lines) => ({
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: lines,
  overflow: 'hidden',
});

/**
 * Clamp a piece of text whose length the app does not control — a display
 * name, a handle — and offer "See more" only when the clamp actually cut it.
 *
 * A hook plus a separate button rather than a wrapper component, because the
 * clamped element is often a heading: a toggle rendered inside it would become
 * part of the heading's accessible name. The caller spreads `clamp` on its own
 * element, attaches `ref`, and places <SeeMoreToggle> wherever reads right.
 *
 * Measured, not guessed from string length: whether "Guten Tag, Maximiliane"
 * fits depends on the face, the viewport and the column, and a toggle that
 * shows on text that already fits is noise. `content` re-runs the measurement
 * when the text changes at the same clamped height, which a ResizeObserver
 * alone would miss.
 */
export function useSeeMore(lines, content) {
  const ref = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [cropped, setCropped] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    // Expanded text is never cropped; keep the last answer so "See less" stays.
    if (!el || expanded) return undefined;
    const measure = () =>
      setCropped(el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, lines, content]);

  let clamp = {};
  if (!expanded) clamp = lines === 1 ? ONE_LINE : linesClamp(lines);

  return { ref, clamp, expanded, cropped, toggle: () => setExpanded((v) => !v) };
}
