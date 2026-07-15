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
