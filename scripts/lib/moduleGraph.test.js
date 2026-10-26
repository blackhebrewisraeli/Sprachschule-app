import { describe, it, expect } from 'vitest';
import {
  parseImports,
  extractPurpose,
  extractExports,
  resolveImport,
  buildGraph,
  analyze,
  findOrphans,
} from './moduleGraph.js';

describe('parseImports', () => {
  it('captures default, named, namespace, side-effect, and export-from specifiers in source order', () => {
    const src = [
      "import Foo from './Foo';",
      "import { a, b } from '../lib/x';",
      "import * as ns from 'pkg';",
      "import './side-effect.css';",
      "export { y } from './y';",
    ].join('\n');
    expect(parseImports(src)).toEqual(['./Foo', '../lib/x', 'pkg', './side-effect.css', './y']);
  });

  it('captures dynamic import() specifiers, e.g. React.lazy routes', () => {
    const src = [
      "import { lazy } from 'react';",
      "const ChatTab = lazy(() => import('./components/ChatTab'));",
      "void import( './VitalsOverlay.jsx' ).then(() => {});",
    ].join('\n');
    expect(parseImports(src)).toEqual(['react', './components/ChatTab', './VitalsOverlay.jsx']);
  });

  it('handles multi-line named imports', () => {
    const src = "import {\n  one,\n  two,\n} from './multi';\n";
    expect(parseImports(src)).toEqual(['./multi']);
  });

  it('does not treat a non-from export as an import', () => {
    expect(parseImports('export const X = 1;\nexport default function App() {}\n')).toEqual([]);
  });

  it('returns [] when there are no imports', () => {
    expect(parseImports('const x = 1;\n')).toEqual([]);
  });
});

describe('extractPurpose', () => {
  it('returns the first meaningful top comment line', () => {
    expect(extractPurpose('// Does the thing — purely\nconst x = 1;')).toBe('Does the thing — purely');
  });

  it('skips decorative separator lines', () => {
    const src = '// ═══════════════\n// Design system\nexport const X = 1;';
    expect(extractPurpose(src)).toBe('Design system');
  });

  it('skips leading blank lines', () => {
    expect(extractPurpose('\n\n// Purpose here\n')).toBe('Purpose here');
  });

  it('returns empty string when there is no leading comment', () => {
    expect(extractPurpose('export const X = 1;')).toBe('');
  });
});

describe('extractExports', () => {
  it('captures named function/const exports, default, and export lists (with aliases)', () => {
    const src = [
      'export function foo() {}',
      'export const BAR = 2;',
      'export default function App() {}',
      'export { a, b as c };',
    ].join('\n');
    expect(extractExports(src).sort()).toEqual(['BAR', 'a', 'c', 'default', 'foo']);
  });
});

describe('resolveImport', () => {
  const files = new Set(['src/components/UI.jsx', 'src/lib/theme.js', 'src/packs/index.js']);

  it('resolves a relative spec by trying extensions', () => {
    expect(resolveImport('src/App.jsx', './components/UI', files)).toBe('src/components/UI.jsx');
  });

  it('resolves a directory import to its index file', () => {
    expect(resolveImport('src/App.jsx', './packs', files)).toBe('src/packs/index.js');
  });

  it('resolves parent-relative specs', () => {
    expect(resolveImport('src/components/UI.jsx', '../lib/theme', files)).toBe('src/lib/theme.js');
  });

  it('returns null for bare/external specifiers', () => {
    expect(resolveImport('src/App.jsx', 'react', files)).toBeNull();
  });
});

describe('buildGraph', () => {
  it('records resolved imports and reverse dependents', () => {
    const files = {
      'src/a.js': "import { t } from './b';\n",
      'src/b.js': 'export const t = 1;\n',
    };
    const g = buildGraph(files);
    expect(g['src/a.js'].imports).toEqual(['src/b.js']);
    expect(g['src/b.js'].dependents).toEqual(['src/a.js']);
    expect(g['src/a.js'].dependents).toEqual([]);
  });
});

describe('analyze', () => {
  it('finds a module by basename and reports purpose, exports, and dependents', () => {
    const files = {
      'src/lib/theme.js': '// Design tokens\nexport const COLORS = {};\n',
      'src/components/UI.jsx':
        "// UI bits\nimport { COLORS } from '../lib/theme';\nexport function Hero() {}\n",
    };
    const g = buildGraph(files);
    const res = analyze('theme', files, g);
    expect(res).toHaveLength(1);
    expect(res[0]).toMatchObject({
      path: 'src/lib/theme.js',
      purpose: 'Design tokens',
      exports: ['COLORS'],
      dependents: ['src/components/UI.jsx'],
    });
  });

  it('matches case-insensitively and by substring', () => {
    const files = { 'src/components/VocabTab.jsx': '// vocab\n' };
    const g = buildGraph(files);
    expect(analyze('vocab', files, g)).toHaveLength(1);
  });
});

describe('findOrphans', () => {
  it('flags modules nothing imports, excluding entrypoints and tests', () => {
    const files = {
      'src/main.jsx': "import './App';\n",
      'src/App.jsx': "import './used';\n",
      'src/used.js': 'export const x = 1;\n',
      'src/orphan.js': 'export const y = 2;\n',
      'src/orphan.test.js': '// test\n',
    };
    const g = buildGraph(files);
    expect(findOrphans(files, g)).toEqual(['src/orphan.js']);
  });

  it('counts a lazy import() as a dependent', () => {
    const files = {
      'src/main.jsx': "const Tab = lazy(() => import('./Tab'));\n",
      'src/Tab.jsx': 'export default function Tab() {}\n',
    };
    expect(findOrphans(files, buildGraph(files))).toEqual([]);
  });

  it('counts importers outside src/, resolved through ../', () => {
    const files = {
      'api/_lib/handler.js': "import { clamp } from '../../src/lib/policy.js';\n",
      'src/lib/policy.js': 'export const clamp = 1;\n',
    };
    const g = buildGraph(files);
    expect(g['src/lib/policy.js'].dependents).toEqual(['api/_lib/handler.js']);
  });

  it('with ignoreDependents, flags modules only those importers keep alive', () => {
    const files = {
      'src/main.jsx': "import './used';\n",
      'src/used.js': 'export const x = 1;\n',
      'src/kit.js': 'export const y = 2;\n',
      'src/a.test.js': "import './kit';\nimport './used';\n",
    };
    const g = buildGraph(files);
    expect(findOrphans(files, g)).toEqual([]);
    expect(findOrphans(files, g, { ignoreDependents: /\.test\.js$/ })).toEqual(['src/kit.js']);
  });
});
