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

  it('committed GDScript DTOs cover SaveFile, SaveFileEnvelope, WorldIR', () => {
    const gdRels = written.filter((p) => p.endsWith('.gd'));
    expect(gdRels.length, 'three GDScript files should be generated').toBe(3);
    const byName = (needle: string) => gdRels.find((p) => p.includes(needle));
    const expected: Array<[string, string]> = [
      ['InsimulSaveFile.gd', 'class_name InsimulSaveFile'],
      ['InsimulSaveFileEnvelope.gd', 'class_name InsimulSaveFileEnvelope'],
      ['InsimulWorldIR.gd', 'class_name InsimulWorldIR'],
    ];
    for (const [file, decl] of expected) {
      const rel = byName(file);
      expect(rel, `${file} should be generated`).toBeTruthy();
      const committed = readFileSync(join(REPO_ROOT, rel!), 'utf8');
      expect(committed, `${file} should declare ${decl}`).toContain(decl);
      // Godot 4 DTOs, not the hand-written conversation types.
      expect(committed).toContain('static func from_dict(');
      expect(committed).toContain('func to_dict(');
    }
  });

  it('committed operations.json covers every OpenAPI operation', () => {
    const opsRel = written.find((p) => p.endsWith('operations.json'));
    expect(opsRel, 'operations.json should be generated').toBeTruthy();
    const table = JSON.parse(readFileSync(join(REPO_ROOT, opsRel!), 'utf8'));
    const byId = new Map<string, any>(table.operations.map((o: any) => [o.operationId, o]));
    for (const id of ['streamConversation', 'streamConversationAudio', 'endConversation', 'healthCheck']) {
      expect(byId.has(id), `operations.json should list ${id}`).toBe(true);
    }
    // Each op carries the machine-readable contract the hand-written wrappers consume.
    for (const op of table.operations) {
      expect(op.method, `${op.operationId} needs an HTTP method`).toMatch(/^(GET|POST|PUT|DELETE|PATCH)$/);
      expect(op.path, `${op.operationId} needs a path`).toMatch(/^\//);
      expect(Array.isArray(op.parameters)).toBe(true);
    }
    expect(byId.get('healthCheck').method).toBe('GET');
    expect(byId.get('endConversation').responseSchema).toBe('EndSessionResponse');
  });

  it('committed C# REST client covers the operations against System.Net.Http', () => {
    const apiRel = written.find((p) => p.replace(/\\/g, '/').endsWith('Generated/Api/InsimulApiClient.cs'));
    expect(apiRel, 'the C# API client should be generated').toBeTruthy();
    const committed = readFileSync(join(REPO_ROOT, apiRel!), 'utf8');
    expect(committed).toContain('namespace Insimul.Generated.Api');
    expect(committed).toContain('using System.Net.Http;');
    for (const m of [
      'StreamConversationAsync',
      'StreamConversationAudioAsync',
      'EndConversationAsync',
      'HealthCheckAsync',
    ]) {
      expect(committed, `client should expose ${m}`).toContain(m);
    }
    // JSON ops deserialize a model; streaming ops hand back the raw response.
    expect(committed).toContain('Task<EndSessionResponse> EndConversationAsync');
    expect(committed).toContain('Task<HttpResponseMessage> StreamConversationAsync');
    // Transport-agnostic — no Unity engine dependency in the generated client
    // (the doc comment references UnityWebRequest, but nothing uses UnityEngine).
    expect(committed).not.toContain('UnityEngine');
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
