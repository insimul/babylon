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
import { join, resolve, relative } from 'node:path';

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
