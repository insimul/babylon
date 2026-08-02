/**
 * US-RS5 — Import-hygiene guard.
 *
 * Ensures insimul-runtime stays SELF-CONTAINED: no source file may import a
 * `@shared/...` module that does not resolve to a real file inside this repo,
 * and no source file may import the platform-only `@shared/schema` back-reference
 * (its runtime-owned pieces live in shared/asset-types.ts / shared/world-types.ts).
 *
 * This is a filesystem-level guard: it scans source text and resolves specifiers
 * against ./shared/*, mirroring the `@shared/* -> ./shared/*` path mapping in
 * tsconfig.check.json and vitest.config.ts. It never imports the modules it checks,
 * so it runs even when a would-be import target is missing.
 *
 * If this test fails, DON'T edit the importer to dodge it — create the module at the
 * exact `shared/<path>` (vendor runtime logic from ../insimul-platform, extract-minimal
 * from any corpus/seed data). See scripts/ralph/progress.txt "Codebase Patterns".
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';

// Repo root is two levels up from shared/__tests__.
const ROOT = resolve(__dirname, '..', '..');
const SHARED = join(ROOT, 'shared');
const PACKAGES = join(ROOT, 'packages');

// Directories we never descend into when collecting sources.
const SKIP_DIRS = new Set(['node_modules', 'dist', 'templates', '.git']);

// The platform-only back-reference this whole PRD exists to eliminate.
const FORBIDDEN_SPECIFIER = ['@shared', 'schema'].join('/');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(p, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(p);
    }
  }
  return out;
}

/** All TS sources under shared/ and every packages/<pkg>/src. */
function collectSources(): string[] {
  const files: string[] = [];
  walk(SHARED, files);
  for (const pkg of readdirSync(PACKAGES, { withFileTypes: true })) {
    if (!pkg.isDirectory()) continue;
    const src = join(PACKAGES, pkg.name, 'src');
    if (existsSync(src)) walk(src, files);
  }
  return files;
}

/**
 * Strip `//` and block comments while respecting string / template literals, so a
 * specifier mentioned inside a doc-comment (e.g. the header in asset-types.ts) or a
 * `://` inside a URL string is never mistaken for a real import.
 */
function stripCommentsAndStrings(src: string): string {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c;
      out += c;
      i++;
      while (i < n) {
        const ch = src[i];
        out += ch;
        if (ch === '\\') {
          out += src[i + 1] ?? '';
          i += 2;
          continue;
        }
        i++;
        if (ch === quote) break;
      }
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

// Matches `from '@shared/x'`, `import '@shared/x'`, `import('@shared/x')`,
// `require('@shared/x')`, and `export ... from '@shared/x'`.
const SHARED_IMPORT = /(?:from|import|require)\s*\(?\s*['"](@shared\/[^'"]+)['"]/g;

/** Resolve an `@shared/<rest>` specifier against ./shared, mirroring tsconfig paths. */
function resolvesInRepo(spec: string): boolean {
  const rest = spec.slice('@shared/'.length).replace(/\.(js|jsx)$/, '');
  const base = join(SHARED, rest);
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.d.ts`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
    join(base, 'index.d.ts'),
    base,
  ];
  return candidates.some((c) => existsSync(c) && statSync(c).isFile());
}

interface SharedImport {
  spec: string;
  file: string;
}

function collectSharedImports(): SharedImport[] {
  const imports: SharedImport[] = [];
  for (const file of collectSources()) {
    const text = stripCommentsAndStrings(readFileSync(file, 'utf8'));
    let m: RegExpExecArray | null;
    SHARED_IMPORT.lastIndex = 0;
    while ((m = SHARED_IMPORT.exec(text)) !== null) {
      imports.push({ spec: m[1], file: relative(ROOT, file) });
    }
  }
  return imports;
}

describe('import hygiene: runtime is self-contained', () => {
  const sharedImports = collectSharedImports();

  it('scans a non-trivial number of sources (guard is actually wired up)', () => {
    // Sanity check — if collection silently found nothing the assertions below
    // would vacuously pass. The repo has hundreds of @shared/* imports.
    expect(sharedImports.length).toBeGreaterThan(50);
  });

  it('every @shared/* import resolves to a file in this repo', () => {
    const unresolved = sharedImports
      .filter(({ spec }) => !resolvesInRepo(spec))
      .map(({ spec, file }) => `${spec}  (in ${file})`);
    const unique = [...new Set(unresolved)].sort();
    expect(
      unique,
      `Unresolvable @shared/* imports — create the module at shared/<path> (vendor from ../insimul-platform):\n${unique.join('\n')}`,
    ).toEqual([]);
  });

  it(`no source file imports the platform back-reference '${FORBIDDEN_SPECIFIER}'`, () => {
    const offenders = sharedImports
      .filter(({ spec }) => spec === FORBIDDEN_SPECIFIER || spec.startsWith(`${FORBIDDEN_SPECIFIER}/`))
      .map(({ file }) => file);
    const unique = [...new Set(offenders)].sort();
    expect(
      unique,
      `'${FORBIDDEN_SPECIFIER}' is a platform-only module. Runtime-owned types live in shared/asset-types.ts / shared/world-types.ts — import those instead. Offenders:\n${unique.join('\n')}`,
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// US-CE6 — Dependency-direction guard for @insimul/core.
//
// The whole core-extraction PRD exists to make `packages/core` (@insimul/core)
// the ENGINE-AGNOSTIC contract that native plugins (Unreal/Unity/Godot) consume
// without dragging Babylon.js along. That only holds if the dependency arrows all
// point INTO core: `packages/core/src` must import nothing from `shared/`, the
// sibling engine/impl packages (`@insimul/babylon`, `@insimul/babylon-game`,
// `@insimul/typescript`), or any `@babylonjs/*` / `react` module — whether via a
// bare specifier or a relative path that escapes `packages/core/`.
//
// It also checks the other direction stays clean: every `shared/` re-export shim
// into core must remain a thin re-export (a moved module must live in ONE place —
// core — not be re-implemented back in shared/). Per the PRD, a "shim files are
// one-liners" style check is acceptable, so we assert each shim file contains only
// re-export/import lines pointing at packages/core/src, never a local definition.
// ─────────────────────────────────────────────────────────────────────────────

const CORE_PKG = join(PACKAGES, 'core');
const CORE_SRC = join(CORE_PKG, 'src');

// Matches the specifier in `from 'x'`, `import 'x'`, `import('x')`, `require('x')`,
// and `export ... from 'x'` — for ANY module, not just @shared.
const ANY_IMPORT = /(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g;

interface CoreImport {
  spec: string;
  file: string;
}

function collectCoreImports(): CoreImport[] {
  const imports: CoreImport[] = [];
  const files: string[] = [];
  if (existsSync(CORE_SRC)) walk(CORE_SRC, files);
  for (const file of files) {
    const text = stripCommentsAndStrings(readFileSync(file, 'utf8'));
    let m: RegExpExecArray | null;
    ANY_IMPORT.lastIndex = 0;
    while ((m = ANY_IMPORT.exec(text)) !== null) {
      imports.push({ spec: m[1], file: relative(ROOT, file) });
    }
  }
  return imports;
}

/** Returns a reason string if a bare (non-relative) specifier is forbidden in core. */
function forbiddenBareSpecifier(spec: string): string | null {
  if (spec === '@babylonjs' || spec.startsWith('@babylonjs/')) return '@babylonjs (engine impl)';
  if (spec === 'react' || spec.startsWith('react/') || spec === 'react-dom' || spec.startsWith('react-dom/'))
    return 'react (UI layer)';
  if (spec === '@shared' || spec.startsWith('@shared/')) return '@shared (runtime shared/ — core must be self-contained)';
  // Sibling packages that depend ON core, never the reverse. `@insimul/babylon`
  // also covers `@insimul/babylon-game`; `@insimul/core` (self) is allowed.
  if (spec.startsWith('@insimul/babylon') || spec.startsWith('@insimul/typescript'))
    return 'sibling engine/impl package (must not be a core dependency)';
  return null;
}

/**
 * True if a relative specifier escapes the packages/core PACKAGE (into shared/ or a
 * sibling package). Intra-package relatives — including a test reaching the package's
 * own scripts/ tooling — are allowed; only leaving @insimul/core is a direction break.
 */
function relativeEscapesCore(spec: string, file: string): boolean {
  if (!spec.startsWith('.')) return false;
  const resolved = resolve(dirname(join(ROOT, file)), spec);
  const rel = relative(CORE_PKG, resolved);
  return rel === '..' || rel.startsWith(`..${'/'}`) || rel.startsWith('..\\');
}

describe('dependency direction: @insimul/core is engine-agnostic and self-contained (US-CE6)', () => {
  const coreImports = collectCoreImports();

  it('scans a non-trivial number of packages/core/src sources (guard is wired up)', () => {
    // Sanity check — if collection silently found nothing the assertion below would
    // vacuously pass. Core holds the save-file/prolog/quest/IR contract: many imports.
    expect(coreImports.length).toBeGreaterThan(50);
  });

  it('imports nothing from @babylonjs/*, react, @shared/*, a sibling engine package, or outside packages/core/', () => {
    const offenders = coreImports
      .map(({ spec, file }) => {
        const reason = forbiddenBareSpecifier(spec) ?? (relativeEscapesCore(spec, file) ? 'relative path escapes packages/core/' : null);
        return reason ? `${spec}  [${reason}]  (in ${file})` : null;
      })
      .filter((x): x is string => x !== null);
    const unique = [...new Set(offenders)].sort();
    expect(
      unique,
      `@insimul/core must stay engine-agnostic and self-contained. Forbidden imports in packages/core/src — move the module INTO core (with a shim at its old shared/ path), replace a Babylon type with a structural stand-in, or drop the dependency:\n${unique.join('\n')}`,
    ).toEqual([]);
  });
});

// A `shared/` file is a "shim" once its module was moved into core: it should
// contain only re-export/import lines pointing at packages/core/src. If a moved
// module gets re-implemented back in shared/, the shim grows a real declaration —
// which is exactly what this guard forbids.
function collectSharedShimFiles(): string[] {
  const files: string[] = [];
  walk(SHARED, files);
  return files.filter(
    (f) =>
      !f.includes(`${'/'}__tests__${'/'}`) &&
      !/\.test\.tsx?$/.test(f) &&
      stripCommentsAndStrings(readFileSync(f, 'utf8')).includes('packages/core/src'),
  );
}

// A non-blank stripped line inside a shim must be either (a) a line that references
// packages/core/src (the `from '.../packages/core/src/...'` / bare `import` target),
// or (b) a pure member-list continuation of a multi-line re-export (identifiers,
// commas, braces, `as`, `type`, `*` only — no code). Anything else (a `function`,
// `const`, `class`, `interface`, `=`, `(`…) is a re-implementation.
function isShimShapedLine(line: string): boolean {
  const t = line.trim();
  if (t === '') return true;
  if (t.includes('packages/core/src')) return true;
  return /^[\w$,{}*\s]+$/.test(t.replace(/\bas\b/g, ' '));
}

describe('shim hygiene: moved modules are not re-implemented in shared/ (US-CE6)', () => {
  const shimFiles = collectSharedShimFiles();

  it('finds the re-export shims (guard is wired up)', () => {
    // The core-extraction stories left dozens of shims at old shared/ paths.
    expect(shimFiles.length).toBeGreaterThan(20);
  });

  it('every shared/ shim into @insimul/core is a thin re-export (no local declarations)', () => {
    const fat: string[] = [];
    for (const file of shimFiles) {
      const stripped = stripCommentsAndStrings(readFileSync(file, 'utf8'));
      const badLines = stripped
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l !== '' && !isShimShapedLine(l));
      if (badLines.length > 0) {
        fat.push(`${relative(ROOT, file)}: ${badLines[0]}`);
      }
    }
    const unique = [...new Set(fat)].sort();
    expect(
      unique,
      `A shared/ re-export shim into @insimul/core grew a local declaration — a moved module must live ONLY in core, not be re-implemented in shared/. Offending shim files (first stray line shown):\n${unique.join('\n')}`,
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// US-BC2 — Shim-completeness guard for the @insimul/babylon-game -> @insimul/babylon
// consolidation.
//
// The save/data/loading layer moved from packages/babylon-game/src into
// packages/babylon/src/data. To keep every existing consumer resolving (the platform's
// npm dep + tsconfig/vite aliases, and shared/game-engine/rendering/BabylonGame.ts which
// imports @insimul/babylon-game/{WorldStateManager,DataSource,diagnostics/ResourceProfiler}),
// a one-line re-export shim was left at EVERY old importable path.
//
// packages/babylon-game/OLD_EXPORT_SURFACE.json snapshots that surface (generated at move
// time, records history). This guard asserts every snapshotted path (a) still exists as a
// shim under packages/babylon-game/src, (b) that shim re-exports into
// packages/babylon/src/data (a thin passthrough, not a re-implementation), and (c) the
// moved target actually exists. Deleting a shim requires deleting its snapshot entry — a
// deliberate deprecation, never an accident.
// ─────────────────────────────────────────────────────────────────────────────

interface OldExportSurface {
  root: string;
  movedTo: string;
  paths: string[];
}

const BABYLON_GAME_SURFACE = join(ROOT, 'packages', 'babylon-game', 'OLD_EXPORT_SURFACE.json');

describe('shim completeness: @insimul/babylon-game surface is fully shimmed into @insimul/babylon/data (US-BC2)', () => {
  const snapshot: OldExportSurface = JSON.parse(readFileSync(BABYLON_GAME_SURFACE, 'utf8'));

  it('the snapshot lists the whole moved surface (guard is wired up)', () => {
    // The save/data/loading layer was ~19 importable modules; a truncated snapshot
    // would let a missing shim slip through.
    expect(snapshot.paths.length).toBeGreaterThan(15);
  });

  it('every old importable path still exists as a re-export shim into packages/babylon/src/data', () => {
    const problems: string[] = [];
    for (const rel of snapshot.paths) {
      const shimFile = join(ROOT, snapshot.root, rel);
      if (!existsSync(shimFile)) {
        problems.push(`${snapshot.root}/${rel}  — MISSING shim (consumers of @insimul/babylon-game/${rel.replace(/\.(ts|tsx)$/, '')} would break)`);
        continue;
      }
      const stripped = stripCommentsAndStrings(readFileSync(shimFile, 'utf8'));
      if (!stripped.includes('babylon/src/data')) {
        problems.push(`${snapshot.root}/${rel}  — not a shim into ${snapshot.movedTo} (grew a local declaration?)`);
      }
      // A shim must be a thin re-export (same rule as the core-extraction shims).
      const badLines = stripped
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l !== '' && !(l.includes('babylon/src/data') || /^[\w$,{}*\s]+$/.test(l.replace(/\bas\b/g, ' '))));
      if (badLines.length > 0) {
        problems.push(`${snapshot.root}/${rel}  — non-shim line: ${badLines[0]}`);
      }
    }
    const unique = [...new Set(problems)].sort();
    expect(
      unique,
      `@insimul/babylon-game shim regressions — restore the one-line re-export shim (export * from '<relative>/packages/babylon/src/data/<path>'), or drop the snapshot entry if intentionally deprecating:\n${unique.join('\n')}`,
    ).toEqual([]);
  });

  it('every moved target exists under packages/babylon/src/data', () => {
    const missing = snapshot.paths
      .filter((rel) => !existsSync(join(ROOT, snapshot.movedTo, rel)))
      .map((rel) => `${snapshot.movedTo}/${rel}`);
    expect(
      missing,
      `A snapshotted module is missing from its new home — the shim points at a file that no longer exists:\n${missing.join('\n')}`,
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// US-BC3 — Shim-completeness guard for the shared/game-engine + shared/voice ->
// @insimul/babylon/engine consolidation.
//
// The Babylon engine (rendering/, logic/, systems/, types/interfaces/IR/asset-pipeline/
// world-type-presets) and the voice layer moved out of shared/ into
// packages/babylon/src/engine/{game-engine,voice}. The platform's ~80 @shared/game-engine
// + @shared/voice aliases and the export pipeline's shared/ vendoring depend on every old
// path still resolving, so a one-line re-export shim was left at EACH old importable path.
//
// packages/babylon/OLD_ENGINE_EXPORT_SURFACE.json snapshots that surface (per source root:
// game-engine, voice). This guard asserts every snapshotted path (a) still exists as a shim
// under its old `root`, (b) re-exports into `movedTo` (a thin passthrough, not a
// re-implementation), and (c) the moved target actually exists. Deleting a shim requires
// deleting its snapshot entry — a deliberate deprecation, never an accident.
// ─────────────────────────────────────────────────────────────────────────────

interface EngineSurface {
  root: string;
  movedTo: string;
  paths: string[];
}

const ENGINE_SURFACE_SNAPSHOT = join(ROOT, 'packages', 'babylon', 'OLD_ENGINE_EXPORT_SURFACE.json');

describe('shim completeness: shared/game-engine + shared/voice are fully shimmed into @insimul/babylon/engine (US-BC3)', () => {
  const snapshot: { surfaces: EngineSurface[] } = JSON.parse(readFileSync(ENGINE_SURFACE_SNAPSHOT, 'utf8'));

  it('the snapshot lists both moved source roots (guard is wired up)', () => {
    const roots = snapshot.surfaces.map((s) => s.root).sort();
    expect(roots).toEqual(['shared/game-engine', 'shared/voice']);
  });

  it('the game-engine surface is non-trivial (a truncated snapshot would let a missing shim slip through)', () => {
    const ge = snapshot.surfaces.find((s) => s.root === 'shared/game-engine')!;
    // ~254 importable engine modules moved; guard against an accidentally-empty snapshot.
    expect(ge.paths.length).toBeGreaterThan(200);
  });

  it('every old importable path still exists as a re-export shim into packages/babylon/src/engine', () => {
    const problems: string[] = [];
    for (const surface of snapshot.surfaces) {
      for (const rel of surface.paths) {
        const shimFile = join(ROOT, surface.root, rel);
        if (!existsSync(shimFile)) {
          problems.push(`${surface.root}/${rel}  — MISSING shim (consumers of @shared/${surface.root.split('/').pop()}/${rel.replace(/\.(ts|tsx)$/, '')} would break)`);
          continue;
        }
        const stripped = stripCommentsAndStrings(readFileSync(shimFile, 'utf8'));
        if (!stripped.includes('babylon/src/engine')) {
          problems.push(`${surface.root}/${rel}  — not a shim into ${surface.movedTo} (grew a local declaration?)`);
        }
        // A shim must be a thin re-export (same rule as the core-extraction / US-BC2 shims).
        const badLines = stripped
          .split('\n')
          .map((l) => l.trim())
          .filter((l) => l !== '' && !(l.includes('babylon/src/engine') || /^[\w$,{}*\s]+$/.test(l.replace(/\bas\b/g, ' '))));
        if (badLines.length > 0) {
          problems.push(`${surface.root}/${rel}  — non-shim line: ${badLines[0]}`);
        }
      }
    }
    const unique = [...new Set(problems)].sort();
    expect(
      unique,
      `@shared/game-engine|voice shim regressions — restore the one-line re-export shim (export * from '<relative>/packages/babylon/src/engine/<root>/<path>'), or drop the snapshot entry if intentionally deprecating:\n${unique.join('\n')}`,
    ).toEqual([]);
  });

  it('every moved target exists under packages/babylon/src/engine', () => {
    const missing: string[] = [];
    for (const surface of snapshot.surfaces) {
      for (const rel of surface.paths) {
        if (!existsSync(join(ROOT, surface.movedTo, rel))) missing.push(`${surface.movedTo}/${rel}`);
      }
    }
    expect(
      missing,
      `A snapshotted module is missing from its new home — the shim points at a file that no longer exists:\n${missing.join('\n')}`,
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// US-BC5 — Source-location guard for the two-package endgame.
//
// The babylon-consolidation endgame is TWO first-party TS packages that hold real
// source: packages/core (@insimul/core, the engine-agnostic contract) and
// packages/babylon (@insimul/babylon, the web/Babylon runtime). Everything else that
// still lives under shared/ or the deprecated packages/{typescript,babylon-game}/src
// must be a thin re-export SHIM into one of those two homes — so a new module can
// never quietly land back in shared/ (or a deprecated package) and re-fragment the
// runtime.
//
// A file is a "shim" when its (comment/string-stripped) body re-exports into
// packages/{core,babylon}/src (the babylon-game/typescript/game-engine/voice shims all
// point at `.../babylon/src/...`; the core-extraction shims point at
// `.../packages/core/src/...`). Non-shim source outside packages/{core,babylon} is only
// tolerated for the pre-existing GAME/DOMAIN stragglers snapshotted in
// shared/GRANDFATHERED_SOURCE.json (language-learning / assessment / quest / narrative /
// onboarding / procedural / telemetry — future core/domain-package territory). That list
// may only SHRINK: this guard fails on a NEW non-shim file anywhere under the legacy
// roots, and fails if a snapshot entry stops being a non-shim file (moved out or turned
// into a shim) so cleanups force a deliberate snapshot edit.
// ─────────────────────────────────────────────────────────────────────────────

const GRANDFATHERED_SNAPSHOT = join(SHARED, 'GRANDFATHERED_SOURCE.json');

// The legacy roots that must be shim-only save the grandfathered stragglers. The two
// allowed homes for real source — packages/core/src and packages/babylon/src — are NOT
// walked here (they are exactly where non-shim source belongs).
const LEGACY_SOURCE_ROOTS = [
  SHARED,
  join(PACKAGES, 'typescript', 'src'),
  join(PACKAGES, 'babylon-game', 'src'),
];

/** A file is a shim once its stripped body re-exports into packages/{core,babylon}/src. */
function isShimFile(file: string): boolean {
  const s = stripCommentsAndStrings(readFileSync(file, 'utf8'));
  return s.includes('babylon/src/') || s.includes('packages/core/src');
}

/** Non-test, non-shim source files (repo-relative, sorted) under the legacy roots. */
function collectLegacyNonShimSources(): string[] {
  const files: string[] = [];
  for (const root of LEGACY_SOURCE_ROOTS) {
    if (existsSync(root)) walk(root, files);
  }
  return files
    .filter((f) => !/\.test\.tsx?$/.test(f) && !f.includes(`${'/'}__tests__${'/'}`))
    .filter((f) => !isShimFile(f))
    .map((f) => relative(ROOT, f).replace(/\\/g, '/'))
    .sort();
}

describe('source location: only packages/{core,babylon} hold non-shim source (US-BC5)', () => {
  const snapshot: { files: string[] } = JSON.parse(readFileSync(GRANDFATHERED_SNAPSHOT, 'utf8'));
  const allowed = new Set(snapshot.files);
  const currentNonShim = collectLegacyNonShimSources();

  it('the grandfathered snapshot is non-trivial (guard is wired up)', () => {
    // A truncated/empty snapshot would let a new stray source file through the check
    // below by making `allowed` too small to matter. The straggler domain layer is ~79 files.
    expect(snapshot.files.length).toBeGreaterThan(50);
  });

  it('no NEW non-shim source lands under shared/ or a deprecated package (only packages/{core,babylon} may)', () => {
    const strays = currentNonShim.filter((f) => !allowed.has(f));
    expect(
      strays,
      `New non-shim source appeared outside packages/{core,babylon}. Move it INTO packages/core (contract) or packages/babylon (web runtime) and leave a one-line re-export shim at the old path — do NOT add it to shared/GRANDFATHERED_SOURCE.json to dodge this guard:\n${strays.join('\n')}`,
    ).toEqual([]);
  });

  it('every grandfathered entry still exists as a non-shim file (the list may only shrink, deliberately)', () => {
    const present = new Set(currentNonShim);
    const stale = snapshot.files.filter((f) => !present.has(f));
    expect(
      stale,
      `A grandfathered straggler no longer exists as a non-shim file (moved into packages/{core,babylon} or turned into a shim — good). Remove it from shared/GRANDFATHERED_SOURCE.json so the allowlist shrinks:\n${stale.join('\n')}`,
    ).toEqual([]);
  });

  it('the deprecated packages/{typescript,babylon-game}/src are 100% shims (no non-shim source at all)', () => {
    const deprecatedStray = currentNonShim.filter(
      (f) => f.startsWith('packages/typescript/src/') || f.startsWith('packages/babylon-game/src/'),
    );
    expect(
      deprecatedStray,
      `A deprecated passthrough package regained real source — it must stay 100% re-export shims into @insimul/babylon:\n${deprecatedStray.join('\n')}`,
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// US-BC5 — Import-direction guard: @insimul/babylon -> @insimul/core only.
//
// The mirror of the core dependency-direction guard, for the top of the web stack.
// @insimul/babylon is the web/Babylon runtime; the ONLY first-party PACKAGE it may
// depend on is @insimul/core (the contract). It may of course import itself
// (@insimul/babylon/*), the shared/ tree (@shared/* — the runtime's shared modules,
// including its own engine shims and the straggler domain layer, NOT a separate
// package), @babylonjs/*, react, and third-party deps. What it must NOT import:
//   - the deprecated passthrough packages @insimul/typescript / @insimul/babylon-game
//     (they re-export back INTO @insimul/babylon — a package cycle, and they block the
//     deprecation timeline; import @insimul/babylon/conversation | /data instead);
//   - a sibling native-engine package @insimul/{unity,unreal,godot};
//   - a relative path that escapes the packages/babylon package (reach core via the
//     @insimul/core specifier, never `../../core/src`).
// ─────────────────────────────────────────────────────────────────────────────

const BABYLON_PKG = join(PACKAGES, 'babylon');
const BABYLON_SRC = join(BABYLON_PKG, 'src');

interface BabylonImport {
  spec: string;
  file: string;
}

function collectBabylonImports(): BabylonImport[] {
  const imports: BabylonImport[] = [];
  const all: string[] = [];
  if (existsSync(BABYLON_SRC)) walk(BABYLON_SRC, all);
  // Shipped source only — a package's dependency direction is what it SHIPS, not what
  // its tests exercise. exports-map.test.ts deliberately imports the deprecated aliases
  // (@insimul/typescript, @insimul/babylon-game/*) to prove those shims still resolve.
  const files = all.filter((f) => !/\.test\.tsx?$/.test(f) && !f.includes(`${'/'}__tests__${'/'}`));
  for (const file of files) {
    const text = stripCommentsAndStrings(readFileSync(file, 'utf8'));
    let m: RegExpExecArray | null;
    ANY_IMPORT.lastIndex = 0;
    while ((m = ANY_IMPORT.exec(text)) !== null) {
      imports.push({ spec: m[1], file: relative(ROOT, file) });
    }
  }
  return imports;
}

/** Returns a reason string if a first-party @insimul specifier is forbidden in babylon. */
function forbiddenBabylonSpecifier(spec: string): string | null {
  // @insimul/core is the ONLY allowed cross-package first-party dependency.
  if (spec === '@insimul/core' || spec.startsWith('@insimul/core/')) return null;
  // Self-imports (the package's own subpath entry points) are fine.
  if (spec === '@insimul/babylon' || spec.startsWith('@insimul/babylon/')) return null;
  if (spec === '@insimul/typescript' || spec.startsWith('@insimul/typescript/'))
    return 'deprecated passthrough — import @insimul/babylon/conversation instead';
  if (spec === '@insimul/babylon-game' || spec.startsWith('@insimul/babylon-game/'))
    return 'deprecated passthrough — import @insimul/babylon/data instead';
  if (/^@insimul\/(unity|unreal|godot)(\/|$)/.test(spec))
    return 'sibling native-engine package (the web runtime must not depend on it)';
  return null;
}

/** True if a relative specifier escapes the packages/babylon PACKAGE. */
function relativeEscapesBabylon(spec: string, file: string): boolean {
  if (!spec.startsWith('.')) return false;
  const resolved = resolve(dirname(join(ROOT, file)), spec);
  const rel = relative(BABYLON_PKG, resolved);
  return rel === '..' || rel.startsWith(`..${'/'}`) || rel.startsWith('..\\');
}

describe('dependency direction: @insimul/babylon depends on @insimul/core only (US-BC5)', () => {
  const babylonImports = collectBabylonImports();

  it('scans a non-trivial number of packages/babylon/src sources (guard is wired up)', () => {
    // Vacuous-pass sanity check — the consolidated web engine holds hundreds of modules.
    expect(babylonImports.length).toBeGreaterThan(50);
  });

  it('imports no first-party package but @insimul/core (+ itself), and no relative path escaping packages/babylon/', () => {
    const offenders = babylonImports
      .map(({ spec, file }) => {
        const reason =
          forbiddenBabylonSpecifier(spec) ??
          (relativeEscapesBabylon(spec, file) ? 'relative path escapes packages/babylon/' : null);
        return reason ? `${spec}  [${reason}]  (in ${file})` : null;
      })
      .filter((x): x is string => x !== null);
    const unique = [...new Set(offenders)].sort();
    expect(
      unique,
      `@insimul/babylon must depend on @insimul/core only among first-party packages. Forbidden imports in packages/babylon/src:\n${unique.join('\n')}`,
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// US-1 (93-runtime-logic-to-core) — core must not reach the Babylon RUNTIME.
//
// This tasklist moves ~26k LOC of engine-agnostic runtime (game-engine/logic/) INTO
// packages/core. The risk that move introduces is a dependency INVERSION: one moved
// module quietly importing back into the Babylon runtime, which turns the eventual
// repo extraction from a lift into a rewrite. So the property is locked in FIRST.
//
// This is deliberately NARROWER and WIDER than the US-CE6 block above:
//   - WIDER in scope — it scans the WHOLE packages/core directory (scripts/, tooling,
//     `.mjs`, tests), not just `src/`. Everything that ships or runs from the package
//     has to be liftable, not just the compiled surface.
//   - NARROWER in subject — it is only about reaching the Babylon runtime, including
//     the case US-CE6's bare-specifier list cannot see: an `@shared/<x>` import whose
//     shim RESOLVES into packages/babylon/src. `@shared/game-engine/logic/Foo` names
//     no Babylon package at all; it is a four-line re-export into the runtime.
//
// It reports file:line so a violation in a 2k-line moved module is findable.
// ─────────────────────────────────────────────────────────────────────────────

const BABYLON_SRC_SEGMENT = ['packages', 'babylon', 'src'].join('/');
const CORE_SRC_SEGMENT = ['packages', 'core', 'src'].join('/');

/**
 * Comment/string stripper that PRESERVES line numbering: every newline inside a
 * removed block comment or template literal is kept, so the index of a line in the
 * stripped text still matches the source file. (The `stripCommentsAndStrings` above
 * collapses multi-line block comments, which is fine for its callers — none of them
 * report line numbers.)
 */
function stripPreservingLines(src: string): string {
  const stripped = stripCommentsAndStrings(src);
  // Fast path: nothing multi-line was removed.
  if (countNewlines(stripped) === countNewlines(src)) return stripped;
  // Otherwise re-strip line-aware: blank out block-comment bodies in place.
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
      continue;
    }
    if (c === '`') {
      // Keep the template literal's newlines so later lines stay aligned; its
      // CONTENT is dropped so a specifier quoted inside a doc string never matches.
      i++;
      while (i < n && src[i] !== '`') {
        if (src[i] === '\n') out += '\n';
        if (src[i] === '\\') i++;
        i++;
      }
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function countNewlines(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s[i] === '\n') n++;
  return n;
}

/** Every source-ish file under packages/core (NOT just src/) — scripts and tests included. */
function collectCorePackageFiles(): string[] {
  const files: string[] = [];
  const stack = [CORE_PKG];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) stack.push(p);
      } else if (/\.(ts|tsx|mts|cts|js|mjs|cjs)$/.test(entry.name)) {
        files.push(p);
      }
    }
  }
  return files.sort();
}

interface LocatedImport {
  spec: string;
  file: string;
  line: number;
}

function collectLocatedCoreImports(): LocatedImport[] {
  const imports: LocatedImport[] = [];
  for (const file of collectCorePackageFiles()) {
    const lines = stripPreservingLines(readFileSync(file, 'utf8')).split('\n');
    lines.forEach((text, idx) => {
      let m: RegExpExecArray | null;
      ANY_IMPORT.lastIndex = 0;
      while ((m = ANY_IMPORT.exec(text)) !== null) {
        imports.push({ spec: m[1], file: relative(ROOT, file), line: idx + 1 });
      }
    });
  }
  return imports;
}

/**
 * Does `shared/<rest>` re-export into the Babylon runtime? The 259 `shared/` shims that
 * point at packages/babylon/src are the invisible half of this guard: importing one is
 * importing the Babylon runtime under an alias that never says so.
 */
function sharedShimReachesBabylon(spec: string): boolean {
  const rest = spec.slice('@shared/'.length).replace(/\.(js|jsx)$/, '');
  const base = join(SHARED, rest);
  const candidates = [`${base}.ts`, `${base}.tsx`, `${base}.d.ts`, join(base, 'index.ts'), join(base, 'index.tsx')];
  const target = candidates.find((c) => existsSync(c) && statSync(c).isFile());
  if (!target) return false;
  const body = stripCommentsAndStrings(readFileSync(target, 'utf8'));
  let m: RegExpExecArray | null;
  ANY_IMPORT.lastIndex = 0;
  while ((m = ANY_IMPORT.exec(body)) !== null) {
    if (!m[1].startsWith('.')) continue;
    const resolved = relative(ROOT, resolve(dirname(target), m[1])).split('\\').join('/');
    if (resolved.startsWith(`${BABYLON_SRC_SEGMENT}/`)) return true;
  }
  return false;
}

/** Returns why this specifier reaches the Babylon runtime, or null if it doesn't. */
function babylonRuntimeReach(spec: string, file: string): string | null {
  if (spec === '@babylonjs' || spec.startsWith('@babylonjs/')) return 'Babylon.js engine package';
  if (/^@insimul\/babylon(-game)?(\/|$)/.test(spec)) return 'the Babylon runtime package';
  if (spec === '@insimul/typescript' || spec.startsWith('@insimul/typescript/'))
    return 'a deprecated passthrough into the Babylon runtime';
  if (spec.startsWith('.')) {
    const resolved = relative(ROOT, resolve(dirname(join(ROOT, file)), spec)).split('\\').join('/');
    if (resolved.startsWith(`${BABYLON_SRC_SEGMENT}/`)) return 'a relative path into packages/babylon/src';
    return null;
  }
  if (spec === '@shared' || spec.startsWith('@shared/')) {
    if (sharedShimReachesBabylon(spec)) return 'a shared/ shim that re-exports into packages/babylon/src';
  }
  return null;
}

describe('dependency direction: @insimul/core never reaches the Babylon runtime (US-1, 93-runtime-logic-to-core)', () => {
  const located = collectLocatedCoreImports();

  it('scans the whole packages/core directory, not just src/ (guard is wired up)', () => {
    // Vacuous-pass sanity checks. `scripts/` (schema emission, quest goldens) sits
    // OUTSIDE src/, so seeing it proves the wider walk actually happened.
    expect(located.length).toBeGreaterThan(50);
    const scanned = new Set(located.map((i) => i.file));
    expect([...scanned].some((f) => f.startsWith('packages/core/scripts/'))).toBe(true);
    expect([...scanned].some((f) => f.startsWith('packages/core/src/'))).toBe(true);
  });

  it('recognises a shared/ shim that resolves into packages/babylon/src (detector is not vacuous)', () => {
    // The detector's whole value is catching the alias that names no Babylon package.
    // Pin it against a real shim and a real core shim so it can't silently answer
    // "false" for everything — which would make the assertion below meaningless.
    expect(sharedShimReachesBabylon('@shared/game-engine/logic/GamePrologEngine')).toBe(true);
    expect(sharedShimReachesBabylon('@shared/game-genres/types')).toBe(false);
  });

  it('no file under packages/core imports the Babylon runtime, directly or through a shared/ shim', () => {
    const offenders = located
      .map(({ spec, file, line }) => {
        const reason = babylonRuntimeReach(spec, file);
        return reason ? `${file}:${line}  imports '${spec}'  — ${reason}` : null;
      })
      .filter((x): x is string => x !== null);
    const unique = [...new Set(offenders)].sort();
    expect(
      unique,
      `@insimul/core must never depend on a runtime — runtimes depend on core, not the reverse.\n` +
        `An import here inverts the arrow and turns the core repo extraction into a rewrite.\n` +
        `Fix by moving the needed module INTO core (leaving a shim at its old shared/ path), or\n` +
        `by inverting the dependency into an interface core defines and the adapter implements.\n` +
        `NEVER by re-exporting from babylon back into core.\n\nOffenders:\n${unique.join('\n')}`,
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// US-1 — shared/SHIM_INVENTORY.json drift guard.
//
// The inventory records, for every shared/ file, whether it re-exports into
// packages/core/src, packages/babylon/src, both, or is still real source. That is the
// map the core repo extraction uses to decide which `@shared/*` alias follows core and
// which stays with the runtime — so it has to be regenerated whenever shims move
// (which US-3 will do en masse), not left to rot.
// ─────────────────────────────────────────────────────────────────────────────

describe('shim inventory: shared/SHIM_INVENTORY.json is current (US-1, 93-runtime-logic-to-core)', () => {
  it('matches a fresh scan of shared/', async () => {
    const { buildInventory } = (await import('../../scripts/build-shim-inventory.mjs')) as {
      buildInventory: () => { counts: Record<string, number>; shims: Record<string, string[]> };
    };
    const fresh = buildInventory();
    const committed = JSON.parse(readFileSync(join(SHARED, 'SHIM_INVENTORY.json'), 'utf8'));

    expect(fresh.counts.total, 'inventory scanned nothing — the guard would pass vacuously').toBeGreaterThan(100);
    expect(
      { counts: fresh.counts, shims: fresh.shims },
      'shared/SHIM_INVENTORY.json is stale. Run `npm run shims:inventory` and commit the result.',
    ).toEqual({ counts: committed.counts, shims: committed.shims });
  });

  it("every file classified 'core' really re-exports into packages/core/src", () => {
    const committed = JSON.parse(readFileSync(join(SHARED, 'SHIM_INVENTORY.json'), 'utf8'));
    expect(committed.shims.core.length).toBeGreaterThan(20);
    const wrong = committed.shims.core.filter((rel: string) => {
      const body = stripCommentsAndStrings(readFileSync(join(ROOT, rel), 'utf8'));
      return !body.includes(CORE_SRC_SEGMENT);
    });
    expect(wrong, `Misclassified as 'core' in shared/SHIM_INVENTORY.json:\n${wrong.join('\n')}`).toEqual([]);
  });

  it("the 'source' (not-yet-moved) list agrees with shared/GRANDFATHERED_SOURCE.json", () => {
    // Two independent lists of "real source still in shared/". They are built by
    // different rules (this one by shim-target, that one by the US-BC5 source-location
    // guard), so a disagreement means one of them drifted.
    const committed = JSON.parse(readFileSync(join(SHARED, 'SHIM_INVENTORY.json'), 'utf8'));
    const grandfathered: { files: string[] } = JSON.parse(
      readFileSync(join(SHARED, 'GRANDFATHERED_SOURCE.json'), 'utf8'),
    );
    const inShared = new Set(grandfathered.files.filter((f) => f.startsWith('shared/')));
    const onlyInInventory = committed.shims.source.filter((f: string) => !inShared.has(f)).sort();
    expect(
      onlyInInventory,
      `Files the inventory calls un-moved source but GRANDFATHERED_SOURCE.json does not list:\n${onlyInInventory.join('\n')}`,
    ).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// US-2 (93-runtime-logic-to-core) — shared/LOGIC_BOUNDARY.json drift guard.
//
// The classification says, for every module under game-engine/logic/, whether it is
// engine-agnostic and moving (a), engine-agnostic but blocked on a dependency not yet
// in core (b), or genuinely Babylon-coupled despite the @babylonjs import scan (c).
// US-3 plans against it and the engine adapters size their work from it, so it must be
// a live measurement rather than a snapshot of what was true one afternoon.
//
// The guard also enforces AC2 and AC3 of the story:
//   - every class-(c) module carries a recorded disposition (named, not papered over);
//   - every class-(b) blocker carries a prescribed resolution whose target is inside
//     packages/core/src — i.e. the "re-export from babylon back into core" route, which
//     would invert the dependency arrow US-1's guard protects, is unrepresentable.
// ─────────────────────────────────────────────────────────────────────────────

type BoundaryReport = {
  counts: Record<string, number>;
  blockers: {
    file: string;
    zone: string;
    blocks: number;
    resolution: { via: string; moveTo: string; why: string } | null;
    blocked: string[];
  }[];
  files: {
    file: string;
    class: 'a' | 'b' | 'c';
    disposition?: string | null;
    verdict?: string | null;
    valueCoupled?: boolean;
    couplings?: { kind: string; detail: string; typeOnly: boolean; via: string; path: string }[];
    blockers?: { file: string; typeOnly: boolean; path: string }[];
  }[];
};

const LOGIC_DIR_SEGMENT = ['packages', 'babylon', 'src', 'engine', 'game-engine', 'logic'].join('/');
const LOGIC_BOUNDARY_PATH = join(SHARED, 'LOGIC_BOUNDARY.json');
const readBoundary = (): BoundaryReport => JSON.parse(readFileSync(LOGIC_BOUNDARY_PATH, 'utf8'));

describe('logic boundary: shared/LOGIC_BOUNDARY.json is current (US-2, 93-runtime-logic-to-core)', () => {
  it('matches a fresh classification of game-engine/logic/', async () => {
    const { classify } = (await import('../../scripts/classify-logic-boundary.mjs')) as {
      classify: () => BoundaryReport;
    };
    const fresh = classify();
    const committed = readBoundary();

    expect(fresh.counts.total, 'classifier scanned nothing — the guard would pass vacuously').toBeGreaterThan(50);
    expect(
      { counts: fresh.counts, blockers: fresh.blockers, files: fresh.files },
      'shared/LOGIC_BOUNDARY.json is stale. Run `npm run logic:classify` and commit the result.',
    ).toEqual({ counts: committed.counts, blockers: committed.blockers, files: committed.files });
  });

  it('names the specific coupling for every class-(c) module (AC2)', () => {
    const committed = readBoundary();
    const classC = committed.files.filter((f) => f.class === 'c');
    expect(classC.length, 'no class-(c) modules found — the assertions below would be vacuous').toBeGreaterThan(0);

    const unexplained = classC.filter((f) => !f.disposition || !f.verdict || !(f.couplings ?? []).length);
    expect(
      unexplained.map((f) => f.file),
      'Class-(c) modules with no recorded coupling/disposition. Add an entry to COUPLING_VERDICTS in ' +
        'scripts/classify-logic-boundary.mjs — a Babylon-coupled file must be named, not papered over:\n' +
        unexplained.map((f) => `  ${f.file}`).join('\n'),
    ).toEqual([]);

    const badDisposition = classC.filter((f) => !['stays', 'invert', 'platform-surface'].includes(f.disposition ?? ''));
    expect(badDisposition.map((f) => f.file), 'Unknown disposition value').toEqual([]);
  });

  it('prescribes a core-bound resolution for every class-(b) blocker (AC3)', () => {
    const committed = readBoundary();
    expect(committed.blockers.length, 'no blockers found — the assertions below would be vacuous').toBeGreaterThan(0);

    const unresolved = committed.blockers.filter((b) => !b.resolution?.moveTo || !b.resolution?.why);
    expect(
      unresolved.map((b) => b.file),
      'Class-(b) blockers with no prescribed resolution. Add an entry to BLOCKER_RESOLUTIONS in ' +
        'scripts/classify-logic-boundary.mjs before US-3 moves anything that depends on them:\n' +
        unresolved.map((b) => `  ${b.file} (blocks ${b.blocks})`).join('\n'),
    ).toEqual([]);

    // The one resolution route the story forbids: satisfying core by re-exporting out of
    // the Babylon package. Every prescribed target has to land inside core.
    const wrongDirection = committed.blockers.filter((b) => !b.resolution!.moveTo.startsWith(`${CORE_SRC_SEGMENT}/`));
    expect(
      wrongDirection.map((b) => `${b.file} -> ${b.resolution!.moveTo}`),
      'A blocker resolution points outside packages/core/src. Class-(b) dependencies are resolved by ' +
        'moving them into core or inverting them — never by re-exporting from babylon back into core, ' +
        "which would invert the dependency arrow US-1's guard exists to protect:\n" +
        wrongDirection.map((b) => `  ${b.file} -> ${b.resolution!.moveTo}`).join('\n'),
    ).toEqual([]);
  });

  it('classifies every non-test module under game-engine/logic/ exactly once', () => {
    const committed = readBoundary();
    const onDisk = walk(join(ROOT, LOGIC_DIR_SEGMENT))
      .map((f) => relative(ROOT, f).split('\\').join('/'))
      .filter((f) => !/\.test\.tsx?$/.test(f) && !f.includes('/__tests__/'))
      .sort();
    const classified = committed.files.map((f) => f.file).sort();
    expect(classified, 'LOGIC_BOUNDARY.json does not cover the directory exactly').toEqual(onDisk);
    expect(committed.counts.a + committed.counts.b + committed.counts.c).toBe(committed.counts.total);
  });
});
