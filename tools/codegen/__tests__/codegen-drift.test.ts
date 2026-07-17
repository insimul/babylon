// codegen-drift.test.ts — the drift guard for `npm run codegen`.
//
// Generated native DTOs are COMMITTED (engines can't run npm). This test
// regenerates every target into a throwaway temp dir and asserts the bytes match
// what is committed under packages/*/…/Generated/. If a core schema changes and
// the committed output was not regenerated, the fresh output diverges and this
// fails — the signal to run `npm run codegen` and commit the result.
//
// The test suite is registered in the root vitest.config.ts `include` globs.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
// eslint-disable-next-line import/extensions -- .mjs codegen module imported by the TS guard
import { runCodegen } from '../index.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

let tempDir: string;
let written: string[];

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'insimul-codegen-drift-'));
  written = runCodegen(tempDir);
});

afterAll(() => {
  if (tempDir) rmSync(tempDir, { recursive: true, force: true });
});

describe('codegen drift guard', () => {
  it('emits at least one generated file', () => {
    expect(written.length).toBeGreaterThan(0);
  });

  it('committed C# DTOs cover SaveFile, SaveFileEnvelope, WorldIR', () => {
    const csRel = written.find((p) => p.endsWith('.cs'));
    expect(csRel, 'a C# file should be generated').toBeTruthy();
    const committed = readFileSync(join(REPO_ROOT, csRel!), 'utf8');
    for (const cls of ['class SaveFile', 'class SaveFileEnvelope', 'class WorldIr']) {
      expect(committed, `generated C# should declare ${cls}`).toContain(cls);
    }
  });

  it('committed C++ DTOs cover SaveFile, SaveFileEnvelope, WorldIR', () => {
    const cppRel = written.find((p) => p.endsWith('.h'));
    expect(cppRel, 'a C++ header should be generated').toBeTruthy();
    const committed = readFileSync(join(REPO_ROOT, cppRel!), 'utf8');
    for (const s of ['struct SaveFile', 'struct SaveFileEnvelope', 'struct WorldIr']) {
      expect(committed, `generated C++ should declare ${s}`).toContain(s);
    }
    // Plain structs, not UStructs, and depending only on the vendored single header.
    expect(committed, 'C++ DTOs must not carry UE reflection macros').not.toContain('USTRUCT');
    expect(committed).toContain('#include "nlohmann/json.hpp"');
  });

  it('committed generated output is byte-identical to a fresh regeneration', () => {
    const drifted: string[] = [];
    for (const rel of written) {
      const fresh = readFileSync(join(tempDir, rel), 'utf8');
      const committed = readFileSync(join(REPO_ROOT, rel), 'utf8');
      if (fresh !== committed) drifted.push(rel);
    }
    expect(
      drifted,
      `Generated files are stale — run \`npm run codegen\` and commit:\n  ${drifted.join('\n  ')}`,
    ).toEqual([]);
  });
});
