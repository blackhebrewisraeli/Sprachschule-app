// Canvas geometry for one store screenshot, per the plan's "Visual direction":
// a headline in the top band (at most 20% of the canvas), the real capture in
// the rest, scaled proportionally (never stretched), and nothing important in
// the outer 5% that Google may crop.

export const HEADLINE_SHARE = 0.17;
export const SAFE_SHARE = 0.05;

/**
 * @param {{ width: number, height: number }} canvas
 * @param {{ width: number, height: number }} capture native pixels of the raw screenshot
 */
export function screenshotLayout(canvas, capture) {
  const safeX = Math.round(canvas.width * SAFE_SHARE);
  const safeY = Math.round(canvas.height * SAFE_SHARE);
  const band = Math.round(canvas.height * HEADLINE_SHARE);
  const headline = { x: safeX, y: safeY, width: canvas.width - 2 * safeX, height: band - safeY };

  const boxW = canvas.width - 2 * safeX;
  const boxH = canvas.height - band - safeY;
  const scale = Math.min(boxW / capture.width, boxH / capture.height);
  const width = Math.floor(capture.width * scale);
  const height = Math.floor(capture.height * scale);
  return {
    headline,
    capture: { x: Math.round((canvas.width - width) / 2), y: band, width, height },
    scale,
  };
}
