/**
 * US-GE1 — editor v1 operation-table conformance + secret-storage guard.
 *
 * Runs on a bare box under `npm test` (no Godot toolchain). Pins three copies of
 * the v1 operation table to each other so they can never silently drift:
 *   1. the generated spec  — packages/core/openapi/operations.json;
 *   2. the core const      — V1_OPERATIONS (operations.ts);
 *   3. the GDScript client — addons/insimul/editor/connect/v1_client.gd OPERATIONS.
 * Plus: every USED operation resolves, and the GDScript editor session obeys the
 * secret-storage rule (token in EditorSettings, never ProjectSettings).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { V1_OPERATIONS, USED_OPERATION_IDS, resolveOperation } from '../operations';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..', '..');
const operationsJsonPath = join(repoRoot, 'packages', 'core', 'openapi', 'operations.json');
const gdConnectDir = join(
  repoRoot,
  'packages',
  'godot',
  'addons',
  'insimul',
  'editor',
  'connect',
);
const v1ClientPath = join(gdConnectDir, 'v1_client.gd');
const sessionPath = join(gdConnectDir, 'insimul_editor_session.gd');

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

/**
 * Parse the `const OPERATIONS := { ... }` block out of the GDScript client. Each
 * entry is `"opId": {"method": "M", "path": "P"}`.
 */
function gdscriptTable(): Record<string, OpTuple> {
  const text = readFileSync(v1ClientPath, 'utf8');
  const start = text.indexOf('const OPERATIONS');
  expect(start, 'v1_client.gd must declare const OPERATIONS').toBeGreaterThanOrEqual(0);
  const open = text.indexOf('{', start);
  const close = text.indexOf('\n}', open);
  expect(close, 'OPERATIONS block must be closed').toBeGreaterThan(open);
  const block = text.slice(open, close);
  const entry =
    /"([A-Za-z0-9_]+)"\s*:\s*\{\s*"method"\s*:\s*"([A-Z]+)"\s*,\s*"path"\s*:\s*"([^"]+)"\s*\}/g;
  const table: Record<string, OpTuple> = {};
  let m: RegExpExecArray | null;
  while ((m = entry.exec(block)) !== null) {
    table[m[1]] = { method: m[2], path: m[3] };
  }
  return table;
}

/** Quoted string entries of a `const NAME := [ ... ]` array in a .gd file. */
function gdscriptStringArray(text: string, constName: string): string[] {
  const start = text.indexOf(`const ${constName}`);
  if (start < 0) return [];
  const open = text.indexOf('[', start);
  const close = text.indexOf(']', open);
  const block = text.slice(open, close);
  return Array.from(block.matchAll(/"([^"]+)"/g)).map((mm) => mm[1]);
}

describe('editor v1 operation-table conformance (US-GE1)', () => {
  it('core V1_OPERATIONS mirrors the generated operations.json exactly', () => {
    expect(coreTable()).toEqual(specTable());
  });

  it('GDScript v1_client.gd OPERATIONS mirrors operations.json exactly', () => {
    const gd = gdscriptTable();
    // The regex must actually have found entries (guards against a silent parse).
    expect(Object.keys(gd).length).toBeGreaterThan(0);
    expect(gd).toEqual(specTable());
  });

  it('every used operation resolves in the table (core + GDScript)', () => {
    for (const id of USED_OPERATION_IDS) {
      expect(resolveOperation(id), `core resolves ${id}`).not.toBeNull();
    }
    const clientText = readFileSync(v1ClientPath, 'utf8');
    const used = gdscriptStringArray(clientText, 'USED_OPERATIONS');
    expect(used.length).toBeGreaterThan(0);
    const gd = gdscriptTable();
    for (const id of used) {
      expect(gd[id], `GDScript resolves used op ${id}`).toBeDefined();
    }
    // The two USED lists agree (contract stays in lock step across languages).
    expect([...used].sort()).toEqual([...USED_OPERATION_IDS].sort());
  });

  it('resolveOperation returns null for an unknown operation', () => {
    expect(resolveOperation('noSuchOperation')).toBeNull();
  });
});

describe('editor session secret-storage rule (US-GE1)', () => {
  const text = readFileSync(sessionPath, 'utf8');
  const lines = text.split('\n');

  function constValue(name: string): string {
    const m = text.match(new RegExp(`const ${name}\\s*:=\\s*"([^"]+)"`));
    expect(m, `session must declare const ${name}`).not.toBeNull();
    return (m as RegExpMatchArray)[1];
  }

  const tokenKey = constValue('_TOKEN_SETTING');
  const urlKey = constValue('_URL_SETTING');

  it('the token key is namespaced under insimul/editor and is not the URL key', () => {
    expect(tokenKey).toBe('insimul/editor/api_token');
    expect(urlKey).toBe('insimul/editor/server_url');
    expect(tokenKey).not.toBe(urlKey);
  });

  it('the token key never appears on a ProjectSettings line', () => {
    for (const line of lines) {
      if (line.includes('ProjectSettings')) {
        expect(
          line.includes('_TOKEN_SETTING') || line.includes('api_token'),
          `token must never be written to ProjectSettings — offending line: ${line.trim()}`,
        ).toBe(false);
      }
    }
  });

  it('the token is persisted only through the EditorSettings handle', () => {
    const persistsViaEditorSettings = lines.some(
      (line) =>
        line.includes('_TOKEN_SETTING') &&
        line.includes('editor_settings') &&
        line.includes('set_setting'),
    );
    expect(
      persistsViaEditorSettings,
      'save_settings() must write the token via the editor_settings (EditorSettings) handle',
    ).toBe(true);
    // And the handle itself comes from EditorSettings (EditorInterface).
    expect(text.includes('get_editor_settings')).toBe(true);
  });

  it('the URL is persisted through ProjectSettings (non-secret, shared)', () => {
    const persistsViaProjectSettings = lines.some(
      (line) => line.includes('_URL_SETTING') && line.includes('ProjectSettings'),
    );
    expect(persistsViaProjectSettings).toBe(true);
  });
});
