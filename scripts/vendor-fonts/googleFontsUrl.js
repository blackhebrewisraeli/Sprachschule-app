// Builds the Google Fonts css2 request for a pack's font.families.
//
// This used to live in src/lib/injectFonts.js and run in the browser on every
// boot. It is build-time only now: `npm run vendor:fonts` calls it, downloads
// what it points at, and the runtime never talks to Google again.
//
// familySlug is NOT redefined here. The script writes public/fonts/<slug>/ and
// injectFonts reads it, so the two must agree on every name; re-implementing it
// would be two definitions that a future rename could silently split. It is
// imported from the runtime module instead — see scripts/vendor-fonts/index.js.

/**
 * @param {Array<{ name: string, weights?: number[], axes?: string }>} families
 * @param {{ text?: string }} [opts] `text` asks for a file holding exactly these
 *   characters, which also reaches glyphs no named subset covers (the IPA
 *   combining marks, e.g. U+032F). It applies to every family in the request.
 */
export function buildGoogleFontsUrl(families, { text } = {}) {
  const parts = families.map((f) => {
    const name = encodeURIComponent(f.name).replace(/%20/g, '+');
    if (f.axes) return `family=${name}:${f.axes}`;
    const weights = (f.weights?.length ? f.weights : [400]).join(';');
    return `family=${name}:wght@${weights}`;
  });
  const only = text ? `&text=${encodeURIComponent(text)}` : '';
  return `https://fonts.googleapis.com/css2?${parts.join('&')}${only}&display=swap`;
}
