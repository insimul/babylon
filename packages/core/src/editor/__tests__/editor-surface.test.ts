/**
 * The editor/runtime separation guard (US-2 of `101-editor-plugin-core`).
 *
 * US-2's first acceptance criterion is that "an editor core and a runtime core
 * may share types but must not be entangled, since a shipping game embeds one
 * and not the other". That is not a hypothetical: `docs/editor-plugin-core-analysis.md`
 * §3 measured the violation on BOTH sides — Unity compiles ~2,000 lines of
 * edit-time policy into every player build, and core re-exported five editor
 * modules from its flat runtime barrel. This file locks the core half shut.
 *
 * Three assertions, each falsifiable on its own:
 *
 *  1. **The flat barrel names no editor module.** `src/index.ts` is what
 *     `import … from '@insimul/core'` resolves to; an `export * from './editor/…'`
 *     line there puts edit-time view-models in every consumer's graph. The editor
 *     surface is deep-import-only (`@insimul/core/editor`, `@insimul/core/editor/<module>`).
 *  2. **No runtime module imports the editor surface.** The dependency may run
 *     editor → runtime (the editor core consumes `save-export`,
 *     `archetypes/taxonomy`, `save-file`), never the reverse: a runtime module
 *     reaching into `editor/` would drag the whole surface back in through the
 *     side door.
 *  3. **The editor surface does not import the flat barrel.** `import … from
 *     '../index'` inside `editor/` would re-create the entanglement in the other
 *     direction and risk an import cycle.
 *
 * `archetypes/taxonomy` is a deliberate exception to (1): it is 168 lines of
 * pure string grammar shared by both cores — a shared TYPE, which the criterion
 * explicitly allows — and it carries no view-model, transport or session state.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(HERE, '..', '..');
const INDEX_PATH = join(SRC_DIR, 'index.ts');

/** Every shipped `.ts` under `src/`, relative to `src/` with POSIX separators. */
function listSourceFiles(dir: string = SRC_DIR): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'vendor' || entry.name === 'node_modules') {
        continue;
      }
      out.push(...listSourceFiles(full));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
    out.push(relative(SRC_DIR, full).split('\\').join('/'));
  }
  return out.sort();
}

/** Import/export specifiers in a module, with comments and template noise stripped. */
function importSpecifiers(source: string): string[] {
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  return Array.from(stripped.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)).map((m) => m[1]);
}

describe('the editor core is not entangled with the runtime core', () => {
  const files = listSourceFiles();

  it('walked a real source tree', () => {
    // Guards the guard: an empty walk would make everything below vacuous.
    expect(files.length).toBeGreaterThan(100);
    expect(files.filter((f) => f.startsWith('editor/')).length).toBeGreaterThan(6);
  });

  it('the flat runtime barrel re-exports no editor module', () => {
    const index = readFileSync(INDEX_PATH, 'utf8');
    const leaked = importSpecifiers(index).filter((s) => s.startsWith('./editor'));
    expect(
      leaked,
      `src/index.ts is what \`import … from '@insimul/core'\` resolves to, so an editor ` +
        `re-export there pulls edit-time view-models into every shipping game's graph ` +
        `(docs/editor-plugin-core-analysis.md §3). Reach for '@insimul/core/editor' ` +
        `instead. Leaked:\n  ${leaked.join('\n  ')}`,
    ).toEqual([]);
  });

  it('no runtime module imports the editor surface', () => {
    const offenders: string[] = [];
    for (const file of files) {
      if (file.startsWith('editor/')) continue;
      const specifiers = importSpecifiers(readFileSync(join(SRC_DIR, file), 'utf8'));
      for (const specifier of specifiers) {
        // A relative specifier that names the editor surface, from anywhere else
        // in core: `./editor/x`, `../editor/x`, `../../editor/x`.
        if (/(^|\/)editor\//.test(specifier) && specifier.startsWith('.')) {
          offenders.push(`${file} -> ${specifier}`);
        }
      }
    }
    expect(
      offenders,
      `the dependency runs editor → runtime, never the reverse. A runtime module ` +
        `importing editor/ drags the edit-time surface back into a shipping game ` +
        `through the side door:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('the editor surface does not import the flat runtime barrel', () => {
    const offenders: string[] = [];
    for (const file of files.filter((f) => f.startsWith('editor/'))) {
      for (const specifier of importSpecifiers(readFileSync(join(SRC_DIR, file), 'utf8'))) {
        if (/^\.{1,2}(\/\.\.)*\/index$/.test(specifier) || specifier === '@insimul/core') {
          offenders.push(`${file} -> ${specifier}`);
        }
      }
    }
    expect(
      offenders,
      `an editor module must import the specific runtime module it needs ` +
        `('../save-export', '../archetypes/taxonomy'), not the flat barrel — the ` +
        `barrel re-exports the whole runtime and risks an import cycle:\n  ` +
        `${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});
