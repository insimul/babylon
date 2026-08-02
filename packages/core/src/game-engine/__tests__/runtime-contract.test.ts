/**
 * Drift guard for `docs/runtime-contract.md` (US-4 of 93-runtime-logic-to-core).
 *
 * The contract document is the thing a Unity/Unreal/Godot adapter author reads
 * instead of the Babylon source. A document that silently falls behind the code
 * is worse than no document, so two things are asserted mechanically:
 *
 *  1. Every shared-runtime module under `src/game-engine/logic/` is named in it.
 *     A runtime system cannot join core without appearing in the contract that
 *     describes core.
 *  2. Every host hook (`export interface I…`) in `host-contracts.ts` is named in
 *     it, with its Babylon reference implementation.
 *
 * Both are string searches for the backticked name, which is how the document
 * refers to every module and interface.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME_ENGINE_DIR = join(HERE, '..');
const PACKAGE_ROOT = join(GAME_ENGINE_DIR, '..', '..');

const DOC_PATH = join(PACKAGE_ROOT, 'docs', 'runtime-contract.md');
const LOGIC_DIR = join(GAME_ENGINE_DIR, 'logic');
const HOST_CONTRACTS = join(GAME_ENGINE_DIR, 'host-contracts.ts');

/** Module ids as the document spells them: `Name`, or `actions/Name` in a subdir. */
function listRuntimeModules(): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '__tests__') continue;
      const next = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(next, `${prefix}${entry.name}/`);
      } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        out.push(`${prefix}${entry.name.replace(/\.ts$/, '')}`);
      }
    }
  };
  walk(LOGIC_DIR, '');
  return out.sort();
}

describe('runtime contract document', () => {
  const doc = readFileSync(DOC_PATH, 'utf8');

  it('names every shared-runtime module under game-engine/logic/', () => {
    const modules = listRuntimeModules();
    // Guards the guard: if the walk finds nothing, the assertion below is vacuous.
    expect(modules.length).toBeGreaterThan(50);

    const undocumented = modules.filter((m) => !doc.includes(`\`${m}\``));
    expect(
      undocumented,
      `these modules are in packages/core/src/game-engine/logic/ but not named in ` +
        `docs/runtime-contract.md — add each to the right §1 table:\n  ${undocumented.join('\n  ')}`,
    ).toEqual([]);
  });

  it('names every host hook interface, so an adapter author sees all of them', () => {
    const src = readFileSync(HOST_CONTRACTS, 'utf8');
    const hooks = Array.from(src.matchAll(/^export interface (I[A-Z]\w*)/gm)).map((m) => m[1]);
    expect(hooks.length).toBeGreaterThan(0);

    const undocumented = hooks.filter((name) => !doc.includes(`\`${name}\``));
    expect(
      undocumented,
      `these interfaces are exported from host-contracts.ts but not named in ` +
        `docs/runtime-contract.md §2 — add a row giving what core needs it for, the ` +
        `Babylon reference implementation, and the fallback when it is absent:\n  ${undocumented.join('\n  ')}`,
    ).toEqual([]);
  });
});
