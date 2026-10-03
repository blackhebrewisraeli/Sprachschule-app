// Parsing and rewriting of the CSS that fonts.googleapis.com/css2 returns.
//
// Google emits one @font-face per (family × subset), each preceded by a
// /* subset */ comment — that comment is the only place the subset name
// appears, so it is the parse anchor.

/**
 * @typedef {{ subset: string, family: string, style: string, weight: string,
 *             url: string, unicodeRange: string, block: string }} Face
 */

/**
 * Parse @font-face blocks out of a css2 response.
 *
 * A `text=` request (an exact-characters subset) answers with one face and no
 * subset comment; `subset` names it instead.
 * @param {string} css
 * @param {{ subset?: string }} [opts]
 * @returns {Face[]}
 */
export function parseFaces(css, { subset: fallbackSubset } = {}) {
  const faces = [];
  const re = /(?:\/\*\s*([a-z0-9-]+)\s*\*\/\s*)?@font-face\s*\{([^}]*)\}/gi;
  let m;
  while ((m = re.exec(css)) !== null) {
    const [, commented, block] = m;
    const subset = commented ?? fallbackSubset;
    if (!subset) continue;
    const pick = (prop) => {
      const hit = new RegExp(`${prop}:\\s*([^;]+);`, 'i').exec(block);
      return hit ? hit[1].trim() : '';
    };
    const url = /url\(\s*['"]?([^'")]+)['"]?\s*\)/.exec(block);
    if (!url) continue;
    faces.push({
      subset,
      family: pick('font-family').replace(/^['"]|['"]$/g, ''),
      style: pick('font-style'),
      weight: pick('font-weight'),
      url: url[1],
      unicodeRange: pick('unicode-range'),
      block,
    });
  }
  return faces;
}

/**
 * Emit a stylesheet whose src points at a local file, preserving every other
 * descriptor Google sent — `unicode-range` above all, since that is Google's
 * own subsetting and re-deriving it would mean owning a font toolchain.
 *
 * @param {Array<Face & { localName: string }>} faces
 * @param {string} dirUrl absolute URL path the files are served from
 */
export function renderFaceCss(faces, dirUrl) {
  return (
    faces
      .map((f) => {
        const rewritten = f.block.replace(
          /src:\s*url\([^)]*\)\s*format\(([^)]*)\)/i,
          `src: url(${dirUrl}/${f.localName}) format($1)`
        );
        return `/* ${f.subset} */\n@font-face {${rewritten.replace(/\s*$/, '\n')}}`;
      })
      .join('\n') + '\n'
  );
}

/**
 * Local filename for a face. Google's own filenames are opaque content hashes
 * that change on every font revision, which would churn the diff and the
 * precache manifest for no reason; this is stable and readable.
 * @param {Face} face
 * @param {string} slug
 */
export function localFileName(face, slug) {
  const weight = face.weight.replace(/\s+/g, '-');
  return `${slug}-${face.subset}-${face.style}-${weight}.woff2`;
}
