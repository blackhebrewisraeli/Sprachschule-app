// Module-graph helpers for the dev toolkit. Pure + I/O-free (operate on a
// { path: source } map and plain strings), so they unit-test without touching
// the filesystem. The CLIs (where.js, audit-dead.js) read files and call these.

// ── Static parsing ───────────────────────────────────────────

// Specifiers from `import ... from '…'`, side-effect `import '…'`,
// `export … from '…'`, and string-literal `import('…')` (the lazy tab routes),
// in source order. Heuristic (regex), good enough for the app's tidy imports —
// not a full parser; a template-literal `import()` is not resolved.
export function parseImports(source) {
  const re =
    /(?:import|export)\s+(?:[\w*{},\s]+\s+from\s+)?['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const out = [];
  let m;
  while ((m = re.exec(source))) out.push(m[1] ?? m[2]);
  return out;
}

// First meaningful line of the leading comment block (skips blank lines and
// decorative separators with no letters), i.e. the file's one-line purpose.
export function extractPurpose(source) {
  const comments = [];
  for (const raw of source.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') {
      if (comments.length) break;
      continue;
    }
    if (line.startsWith('//')) {
      comments.push(line.replace(/^\/+\s?/, '').trim());
      continue;
    }
    if (line.startsWith('/*') || line.startsWith('*')) {
      const t = line
        .replace(/^\/\*+/, '')
        .replace(/\*+\/\s*$/, '')
        .replace(/^\*+\s?/, '')
        .trim();
      if (t) comments.push(t);
      continue;
    }
    break;
  }
  for (const c of comments) if (/[A-Za-z]/.test(c)) return c;
  return '';
}

// Exported symbol names: declarations, `default`, and `export { a, b as c }`
// lists (alias wins). Heuristic — re-exports are reported as exports.
export function extractExports(source) {
  const names = new Set();
  if (/export\s+default\b/.test(source)) names.add('default');

  const declRe = /export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([A-Za-z0-9_$]+)/g;
  let m;
  while ((m = declRe.exec(source))) names.add(m[1]);

  const listRe = /export\s*\{([^}]*)\}/g;
  while ((m = listRe.exec(source))) {
    for (const part of m[1].split(',')) {
      const seg = part.trim();
      if (!seg) continue;
      const alias = seg.split(/\s+as\s+/);
      const name = (alias[1] || alias[0]).trim();
      if (name && name !== 'default') names.add(name);
    }
  }
  return [...names];
}

// ── Resolution + graph ───────────────────────────────────────

function normalize(p) {
  const out = [];
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

const EXTS = ['.js', '.jsx', '.mjs', '.ts', '.tsx'];

// Resolve a relative spec against `files` (a Set of paths or a { path: … } map).
// Bare/external specifiers (react, lucide-react, …) resolve to null.
export function resolveImport(fromPath, spec, files) {
  if (!spec.startsWith('.')) return null;
  const has = (p) =>
    files instanceof Set ? files.has(p) : Object.prototype.hasOwnProperty.call(files, p);

  const i = fromPath.lastIndexOf('/');
  const fromDir = i >= 0 ? fromPath.slice(0, i) : '';
  const base = normalize(`${fromDir}/${spec}`);

  if (has(base)) return base;
  for (const ext of EXTS) if (has(base + ext)) return base + ext;
  for (const ext of EXTS) if (has(`${base}/index${ext}`)) return `${base}/index${ext}`;
  return null;
}

// { path: { specifiers, imports (resolved local paths), dependents } }.
export function buildGraph(files) {
  const paths = Object.keys(files);
  const fileSet = new Set(paths);
  const graph = {};
  for (const p of paths) graph[p] = { specifiers: [], imports: [], dependents: [] };

  for (const p of paths) {
    const specs = parseImports(files[p]);
    graph[p].specifiers = specs;
    for (const spec of specs) {
      const resolved = resolveImport(p, spec, fileSet);
      if (resolved && resolved !== p && graph[resolved]) {
        graph[p].imports.push(resolved);
        graph[resolved].dependents.push(p);
      }
    }
  }

  for (const p of paths) {
    graph[p].imports = [...new Set(graph[p].imports)].sort();
    graph[p].dependents = [...new Set(graph[p].dependents)].sort();
  }
  return graph;
}

// ── Queries ──────────────────────────────────────────────────

function baseName(p) {
  return p.slice(p.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
}

// Find modules whose basename matches `query` (case-insensitive substring),
// exact-basename matches first. Returns purpose/exports/imports/dependents.
export function analyze(query, files, graph = {}) {
  const q = String(query).toLowerCase();
  const results = [];
  for (const p of Object.keys(files)) {
    if (!baseName(p).toLowerCase().includes(q)) continue;
    const node = graph[p] ?? { specifiers: [], imports: [], dependents: [] };
    results.push({
      path: p,
      purpose: extractPurpose(files[p]),
      exports: extractExports(files[p]),
      specifiers: node.specifiers,
      imports: node.imports,
      dependents: node.dependents,
    });
  }
  results.sort((a, b) => {
    const ax = baseName(a.path).toLowerCase() === q ? 0 : 1;
    const bx = baseName(b.path).toLowerCase() === q ? 0 : 1;
    return ax - bx || a.path.localeCompare(b.path);
  });
  return results;
}

const DEFAULT_ENTRY = [/(^|\/)main\.jsx?$/, /\.test\.(js|jsx)$/];

// Modules nothing imports (excluding entrypoints + tests) — candidate dead code.
// `ignoreDependents` (RegExp) discounts matching importers, so passing the test
// pattern finds modules that only tests keep alive.
export function findOrphans(files, graph, opts = {}) {
  const entry = opts.entryPatterns ?? DEFAULT_ENTRY;
  const isEntry = (p) => entry.some((re) => re.test(p));
  const counts = (d) => !(opts.ignoreDependents && opts.ignoreDependents.test(d));
  return Object.keys(files)
    .filter((p) => !isEntry(p))
    .filter((p) => ((graph[p] && graph[p].dependents) || []).filter(counts).length === 0)
    .sort();
}
