/**
 * US-GE1 — editor v1 operation-table conformance (TS side).
 *
 * Pins the two IN-REPO copies of the v1 operation table so they can never silently
 * drift: (1) the generated spec `packages/core/openapi/operations.json`, and (2) the
 * core const `V1_OPERATIONS` (operations.ts). Plus: every USED operation resolves in
 * the core table.
 *
 * The GDScript mirror (`v1_client.gd`) and the editor-session secret-storage guard
 * moved to the godot repo (insimul/godot) when the engine packages split out — the
 * generated client is now drift-guarded there against a vendored operations.json.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { V1_OPERATIONS, USED_OPERATION_IDS, resolveOperation } from '../operations';

// Resolve from THIS FILE to core's own root, never through a guessed repo root:
// `<root>/packages/core/...` only exists while core is a package inside babylon,
// and core is meant to stand alone (it is its own repo). src/editor/__tests__ ->
// core root is exactly three levels up.
const here = dirname(fileURLToPath(import.meta.url));
const coreRoot = join(here, '..', '..', '..');
const operationsJsonPath = join(coreRoot, 'openapi', 'operations.json');

type OpTuple = { method: string; path: string };

/** The generated spec, reduced to { operationId -> {method, path} }. */
function specTable(): Record<string, OpTuple> {
  const json = JSON.parse(readFileSync(operationsJsonPath, 'utf8')) as {
    operations: Array<{ operationId: string; method: string; path: string }>;
  };
  const table: Record<string, OpTuple> = {};
  for (const op of json.operations) {
    table[op.operationId] = { method: op.method, path: op.path };
  }
  return table;
}

/** The core const, reduced to the same shape. */
function coreTable(): Record<string, OpTuple> {
  const table: Record<string, OpTuple> = {};
  for (const op of Object.values(V1_OPERATIONS)) {
    table[op.operationId] = { method: op.method, path: op.path };
  }
  return table;
}

describe('editor v1 operation-table conformance (US-GE1)', () => {
  it('core V1_OPERATIONS mirrors the generated operations.json exactly', () => {
    expect(coreTable()).toEqual(specTable());
  });

  it('every used operation resolves in the core table', () => {
    for (const id of USED_OPERATION_IDS) {
      expect(resolveOperation(id), `core resolves ${id}`).not.toBeNull();
    }
  });

  it('resolveOperation returns null for an unknown operation', () => {
    expect(resolveOperation('noSuchOperation')).toBeNull();
  });
});
