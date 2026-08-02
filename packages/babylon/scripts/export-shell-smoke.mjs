/**
 * export-shell smoke build (US-BC4) — runtime-side proof that the platform export
 * pipeline survives the babylon-consolidation WITHOUT a platform edit being required
 * for RESOLUTION.
 *
 * WHAT IT PROVES
 * --------------
 * An exported Insimul game is a standalone Vite project whose `src/` vendors the
 * runtime source and whose `vite.config.ts` aliases `@shared`, `@insimul/typescript`,
 * `@insimul/babylon-game` (and now `@insimul/babylon`) at those vendored paths. After
 * US-BC1..BC3 the moved code lives ONLY in `packages/babylon/src`, and the old paths
 * (`shared/game-engine/*`, `packages/{typescript,babylon-game}/src/*`) are re-export
 * shims whose relative targets (`../../../packages/babylon/src/...`) ESCAPE the vendored
 * tree — so a game that vendors only the old dirs can no longer resolve them.
 *
 * The fix (PRD US-BC4 option (b)): the export's Vite aliases point the moved roots
 * DIRECTLY at the consolidated package (see `packages/babylon/templates/vite.config.ts`
 * NEW-LAYOUT block). This harness reproduces exactly that resolution against a fixture
 * built from the real templates + the real `packages/babylon/src`, runs a real
 * `vite build`, and asserts a runnable bundle is emitted with the `BabylonGame` entry.
 *
 * WHY THE HEAVY LEAVES ARE EXTERNAL
 * ---------------------------------
 * A full standalone bundle of `BabylonGame` is intentionally NOT achievable in this
 * repo: `@babylonjs/*` are runtime deps of the exported game (not re-bundled by this
 * smoke test). The exported-game ENVIRONMENT provides those. This smoke test therefore
 * externalizes third-party leaves and any first-party specifier that resolves to a
 * `.d.ts`-only / missing module, and bundles the FIRST-PARTY consolidated graph — which
 * is precisely the surface the consolidation moved and the surface at risk.
 *
 * The `.d.ts`-only escape hatch is currently UNUSED and the "externalized" line prints
 * empty: `GameQuestManager.d.ts` was the last type-only surface here, and US-2 of
 * `94-quest-manager-interface` replaced it with real code in `packages/core` (its closed
 * generator dependency inverted behind `IQuestSeedSource`). The hatch stays because the
 * platform may inject another such surface; a NON-empty list is the signal to check that
 * the exported-game environment really does provide what is named.
 */
import { build } from 'vite';
import { existsSync, mkdirSync, rmSync, writeFileSync, symlinkSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG = resolve(__dirname, '..');                 // packages/babylon
const RUNTIME = resolve(PKG, '..', '..');             // insimul-runtime
const WS = resolve(RUNTIME, '..');                    // workspace parent (hoisted node_modules)
const PKG_SRC = join(PKG, 'src');
const CORE_SRC = join(RUNTIME, 'packages', 'core', 'src');
const SHARED = join(RUNTIME, 'shared');
const FIX = join(PKG, '.export-shell');               // gitignored fixture root

// ── Fixture layout: mirror an exported game, vendoring via symlinks to the REAL tree ──
rmSync(FIX, { recursive: true, force: true });
mkdirSync(join(FIX, 'src'), { recursive: true });
symlinkSync(join(WS, 'node_modules'), join(FIX, 'node_modules'));
symlinkSync(PKG_SRC, join(FIX, 'src', 'insimul-babylon'));   // the consolidated package
symlinkSync(CORE_SRC, join(FIX, 'src', 'insimul-core'));     // @insimul/core (prolog etc.)
symlinkSync(SHARED, join(FIX, 'src', 'shared'));             // straggler domain layer

// The export shell entry (matches templates/game-index.ts + main.ts, re-pathed to the
// NEW consolidated layout: the moved roots come in via bare @-specifiers, not relatives).
writeFileSync(join(FIX, 'src', 'index.ts'),
  `export { BabylonGame } from '@shared/game-engine/rendering/BabylonGame';\n` +
  `export { createDataSource } from '@insimul/babylon-game/DataSource';\n` +
  `export type { DataSource } from '@insimul/babylon-game/DataSource';\n`);
writeFileSync(join(FIX, 'src', 'main.ts'),
  `import { BabylonGame } from './index';\n` +
  `import { createDataSource } from '@insimul/babylon-game/DataSource';\n` +
  `const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;\n` +
  `const dataSource = createDataSource();\n` +
  `const game = new BabylonGame(canvas, { worldId: 'w', worldName: 'W', worldType: 'town', dataSource });\n` +
  `(globalThis as any).__insimulGame = game;\n`);
writeFileSync(join(FIX, 'index.html'),
  `<!doctype html><html><head><meta charset="utf-8"><title>export-shell smoke</title></head>` +
  `<body><canvas id="renderCanvas"></canvas>` +
  `<script type="module" src="/src/main.ts"></script></body></html>\n`);

// SMOKE_BREAK=1 disables the moved-root resolution (the US-BC4 fix) so the negative
// case — a game relying on the now-escaping shims — is demonstrably a build failure.
// ── The exported-game resolution contract (single source of truth) ────────────────────
// Ordered: moved-to-@insimul/babylon roots first, then core, then generic @shared.
const B = '/src/insimul-babylon';
const C = '/src/insimul-core';
const ALIASES = [
  ...(process.env.SMOKE_BREAK ? [] : [['@shared/game-engine', `${B}/engine/game-engine`]]),
  ['@shared/voice',       `${B}/engine/voice`],
  ['@shared/prolog',      `${C}/prolog`],
  ['@insimul/babylon-game', `${B}/data`],
  ['@insimul/typescript',   `${B}/conversation`],
  ['@insimul/babylon',      B],
  ['@insimul/core',         C],
  ['@shared',              '/src/shared'],
  ['@',                    '/src'],
];
// Third-party leaves the exported-game environment provides (never re-bundled here).
const EXTERNAL_BARE = [/^@babylonjs\//, /^react(\/|$|-dom)/, '@mlc-ai/web-llm', '@sentry/react'];

const CANDIDATE_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', ''];
function firstParty(id) {
  // resolve an aliased absolute-from-fixture path ("/src/...") to a real file on disk
  const abs = join(FIX, id.replace(/^\//, ''));
  for (const e of CANDIDATE_EXTS) if (existsSync(abs + e) && !readdirSafe(abs + e)) return abs + e;
  for (const e of ['.ts', '.tsx', '.js', '.jsx', '.mjs']) {
    const idx = join(abs, 'index' + e);
    if (existsSync(idx)) return idx;
  }
  return null;
}
function readdirSafe(p) { try { return readdirSync(p); } catch { return null; } } // dir? -> not a file

function applyAlias(source) {
  for (const [find, repl] of ALIASES) {
    if (source === find) return repl;
    if (source.startsWith(find + '/')) return repl + source.slice(find.length);
  }
  return null;
}

const externalized = new Set();
const extern = (source) => { externalized.add(source); return { id: source, external: true }; };
const resolver = {
  name: 'export-shell-resolver',
  enforce: 'pre',
  resolveId(source) {
    // third-party leaves + platform-injected runtime deps
    if (EXTERNAL_BARE.some((m) => (typeof m === 'string' ? m === source : m.test(source)))) {
      externalized.add(source);
      return { id: source, external: true };
    }
    // Re-export shims escape their vendored dir via `../packages/{core,babylon}/src/...`.
    // In a real export those roots are vendored + aliased; here, normalize any such
    // escape straight onto the corresponding symlinked root (location-independent).
    let m2;
    if ((m2 = source.match(/packages\/core\/src\/(.*)$/)))    return firstParty(`${C}/${m2[1]}`) || extern(source);
    if (!process.env.SMOKE_BREAK && (m2 = source.match(/packages\/babylon\/src\/(.*)$/))) return firstParty(`${B}/${m2[1]}`) || extern(source);
    const aliased = applyAlias(source);
    if (!aliased) return null; // let vite handle relatives / node_modules
    const real = firstParty(aliased);
    if (real) return real;
    // aliased first-party specifier with no loadable source (.d.ts-only / injected) -> external
    externalized.add(source);
    return { id: source, external: true };
  },
};

const argv = process.argv.slice(2);
const KEEP = argv.includes('--keep');

try {
  await build({
    root: FIX,
    logLevel: argv.includes('--verbose') ? 'info' : 'warn',
    plugins: [resolver],
    esbuild: { loader: 'ts', target: 'esnext' },
    build: {
      target: 'esnext',
      outDir: 'dist',
      minify: false,
      rollupOptions: { external: EXTERNAL_BARE },
    },
  });
} catch (err) {
  console.error('\n✗ export-shell smoke build FAILED:\n', err?.message || err);
  process.exit(1);
}

// ── Assertions: a runnable bundle exists and carries the BabylonGame entry ─────────────
const distAssets = join(FIX, 'dist', 'assets');
const jsFiles = existsSync(distAssets) ? readdirSync(distAssets).filter((f) => f.endsWith('.js')) : [];
if (jsFiles.length === 0) {
  console.error('✗ no JS bundle emitted under dist/assets');
  process.exit(1);
}
const { readFileSync } = await import('node:fs');
const bundleText = jsFiles.map((f) => readFileSync(join(distAssets, f), 'utf8')).join('\n');
if (!/BabylonGame/.test(bundleText)) {
  console.error('✗ bundle does not reference the BabylonGame entry');
  process.exit(1);
}

console.log('✓ export-shell smoke build OK');
console.log(`  vite build exit 0; ${jsFiles.length} JS chunk(s); BabylonGame entry present in bundle.`);
console.log(`  externalized (env-provided): ${[...externalized].sort().join(', ')}`);
if (!KEEP) rmSync(FIX, { recursive: true, force: true });
