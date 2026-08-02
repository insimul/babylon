/**
 * Drift guard for `docs/editor-plugin-core-analysis.md` (US-1 of
 * 101-editor-plugin-core).
 *
 * The analysis measures three engine repositories that are NOT in this worktree,
 * so most of its numbers cannot be guarded from here — they are dated in the
 * document's header instead. What CAN be guarded is every claim the analysis
 * makes about core's own surface, and those are the claims US-2 acts on:
 *
 *  1. Every module under `src/editor/` and `src/archetypes/` is named in the
 *     document. A module cannot join the editor surface without appearing in the
 *     analysis of that surface.
 *  2. The five taxonomy roots the document quotes in §5.3 are the real
 *     `ARCHETYPE_ROOTS`. §5.3's finding — that Godot emits `road` and `interior`
 *     keys, which are not roots — is only meaningful if that list is current.
 *  3. Every `./editor/*` module re-exported from the flat runtime barrel
 *     (`src/index.ts`) is named in §3's entanglement finding. This one is
 *     expected to go quiet: US-2 removes those re-exports, at which point there
 *     is nothing left to name and the assertion passes on an empty set.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ARCHETYPE_ROOTS } from '../../archetypes/taxonomy';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(HERE, '..', '..');
const PACKAGE_ROOT = join(SRC_DIR, '..');

const DOC_PATH = join(PACKAGE_ROOT, 'docs', 'editor-plugin-core-analysis.md');
const INDEX_PATH = join(SRC_DIR, 'index.ts');

/** Module ids relative to `src/`, as the document spells them (`editor/operations`). */
function listModules(area: string): string[] {
  return readdirSync(join(SRC_DIR, area), { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.test.ts'))
    .map((e) => `${area}/${e.name.replace(/\.ts$/, '')}`)
    .sort();
}

describe('editor-plugin-core analysis document', () => {
  const doc = readFileSync(DOC_PATH, 'utf8');

  it('names every module on core’s editor surface', () => {
    const modules = [...listModules('editor'), ...listModules('archetypes')];
    // Guards the guard: an empty walk would make the assertion below vacuous.
    expect(modules.length).toBeGreaterThan(6);

    const undocumented = modules.filter((m) => !doc.includes(m));
    expect(
      undocumented,
      `these modules are on core's editor surface but are not named in ` +
        `docs/editor-plugin-core-analysis.md — add each to the §1.2 capability table ` +
        `and to §3 if it overlaps the runtime core:\n  ${undocumented.join('\n  ')}`,
    ).toEqual([]);
  });

  it('quotes the real taxonomy roots in §5.3', () => {
    expect(ARCHETYPE_ROOTS.length).toBeGreaterThan(0);
    const quoted = `\`${ARCHETYPE_ROOTS.join(' | ')}\``;
    expect(
      doc.includes(quoted),
      `docs/editor-plugin-core-analysis.md §5.3 must quote ARCHETYPE_ROOTS verbatim ` +
        `as ${quoted}; §5.3's finding (Godot emits keys under non-roots) is only ` +
        `meaningful against the current root list.`,
    ).toBe(true);
  });

  it('lists exactly the editor modules the runtime barrel still re-exports', () => {
    const index = readFileSync(INDEX_PATH, 'utf8');
    const barrelled = Array.from(index.matchAll(/^export \* from '\.\/(editor\/[\w-]+)';/gm))
      .map((m) => m[1])
      .sort();

    // The document carries the list in a marked fenced block so the finding can be
    // compared as a SET — a barrel that gains a module and one that loses a module
    // are both drift, and US-2 empties this list on purpose.
    const block = /<!-- barrelled-editor-modules -->\s*```\n([\s\S]*?)```/.exec(doc);
    expect(
      block,
      'docs/editor-plugin-core-analysis.md §3 lost its <!-- barrelled-editor-modules --> ' +
        'fenced block; the entanglement finding is no longer machine-checkable.',
    ).not.toBeNull();

    const claimed = block![1]
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .sort();

    expect(
      claimed,
      `docs/editor-plugin-core-analysis.md §3 claims the runtime barrel re-exports\n  ` +
        `${claimed.join('\n  ') || '(nothing)'}\nbut src/index.ts actually re-exports\n  ` +
        `${barrelled.join('\n  ') || '(nothing)'}\nUpdate the fenced block, or stop ` +
        `re-exporting the editor surface (which is what US-2 is for).`,
    ).toEqual(barrelled);
  });
});
