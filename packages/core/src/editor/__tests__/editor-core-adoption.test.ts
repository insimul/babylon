/**
 * Drift guard for `docs/editor-core-adoption.md` (US-3 of
 * 101-editor-plugin-core).
 *
 * That document is a specification handed to four adoption tasklists that will
 * run in other repositories, weeks apart, against whatever core looks like then.
 * A specification with no guard rots into a lie, so this test pins the parts of
 * it that live in this repo:
 *
 *  1. **Every adoptable module on the editor surface has an adoption line.** A
 *     module that appears in `src/editor/` or `src/archetypes/` but nowhere in
 *     the document is a capability an engine tasklist would not know to adopt.
 *     Barrels (`index.ts`) are exempt: they are import paths, not capabilities,
 *     and `editor-plugin-core-analysis.md` already inventories them.
 *  2. **Every host interface is named.** `editor/host-contracts.ts` is what the
 *     plugins implement; §1.3 and §5 turn on the list being complete, since an
 *     unnamed interface is one no adoption note tells anyone to write.
 *  3. **All four engines are covered**, including Babylon, whose note is the
 *     inverse of the others (nothing to delete) and is therefore the easiest to
 *     drop.
 *  4. **The inherited boundary decision is still the one named.** Roadmap
 *     decision 1 says 98/99/101 must not invent a second mechanism; the document
 *     exists partly to record that, so it must keep naming `libinsimulcore` and
 *     the bridge that implements it.
 *
 * What is deliberately NOT guarded: every line count in §2 and §3. Those measure
 * three repositories that are not in this worktree, so they are dated in the
 * header and reproducible from Appendix A instead. See the same call in
 * `editor-plugin-core-analysis.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC_DIR = join(HERE, '..', '..');
const PACKAGE_ROOT = join(SRC_DIR, '..');

const DOC_PATH = join(PACKAGE_ROOT, 'docs', 'editor-core-adoption.md');
const HOST_CONTRACTS_PATH = join(SRC_DIR, 'editor', 'host-contracts.ts');

/**
 * Module ids relative to `src/`, as the document spells them
 * (`editor/scene/placement`). Recursive, and barrels excluded — see (1) above.
 */
function listAdoptableModules(area: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(SRC_DIR, area), { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      out.push(...listAdoptableModules(`${area}/${entry.name}`));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) continue;
    if (entry.name === 'index.ts') continue;
    out.push(`${area}/${entry.name.replace(/\.ts$/, '')}`);
  }
  return out.sort();
}

describe('editor-core adoption specification', () => {
  const doc = readFileSync(DOC_PATH, 'utf8');

  it('gives every adoptable editor module an adoption line', () => {
    const modules = [...listAdoptableModules('editor'), ...listAdoptableModules('archetypes')];
    // Guards the guard: an empty walk would make the assertion below vacuous.
    expect(modules.length).toBeGreaterThan(8);

    const unspecified = modules.filter((m) => !doc.includes(m));
    expect(
      unspecified,
      `these modules are on core's editor surface but no engine adoption note ` +
        `mentions them, so an adoption tasklist would not know to adopt them. Add ` +
        `each to docs/editor-core-adoption.md — to §1.3 (does it cross the ABI?) and ` +
        `to the per-engine tables in §2:\n  ${unspecified.join('\n  ')}`,
    ).toEqual([]);
  });

  it('names every host interface the plugins must implement', () => {
    const source = readFileSync(HOST_CONTRACTS_PATH, 'utf8');
    const interfaces = [...source.matchAll(/^export interface (\w+)/gm)].map((m) => m[1]).sort();
    // Guards the guard: host-contracts.ts declares four interfaces today.
    expect(interfaces.length).toBeGreaterThan(3);

    const unnamed = interfaces.filter((name) => !doc.includes(name));
    expect(
      unnamed,
      `these interfaces are declared in src/editor/host-contracts.ts but are not ` +
        `named in docs/editor-core-adoption.md, so no engine is told to implement ` +
        `them:\n  ${unnamed.join('\n  ')}`,
    ).toEqual([]);
  });

  it('gives each of the four engines its own §2 adoption note', () => {
    const headings = [...doc.matchAll(/^### 2\.\d+ (\S+)/gm)].map((m) => m[1]);
    const missing = ['Unity', 'Unreal', 'Godot', 'Babylon'].filter((e) => !headings.includes(e));
    expect(
      missing,
      `docs/editor-core-adoption.md must carry one §2.x adoption note per engine; ` +
        `found [${headings.join(', ')}] and is missing:\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
  });

  it('still inherits the one language-boundary decision rather than a second one', () => {
    // Roadmap decision 1: "98, 99 and 101 must not invent a second mechanism."
    expect(doc).toContain('libinsimulcore');
    expect(doc).toContain('native/corebridge');
    expect(doc).toContain('UNIFICATION_ROADMAP.md');
  });
});
