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
