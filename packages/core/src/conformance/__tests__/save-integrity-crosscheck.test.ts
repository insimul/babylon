/**
 * US-XC2 — cross-runtime save-integrity parity (TS side).
 *
 * The Unreal runtime ports the save-envelope contract (canonical JSON + SHA-256
 * integrity) into portable C++ (packages/unreal/Source/InsimulRuntime/Portable).
 * This drift guard is the TS half of the cross-check: it recomputes the golden
 * integrity vectors from the TS implementation and validates the C++-produced
 * export envelope, so the two runtimes can never silently disagree on the
 * canonical bytes.
 *
 *   - The vectors file (conformance/saves/integrity-vectors.json) is read by
 *     BOTH this test and the C++ host harness
 *     (packages/unreal/tools/verify-unreal/test_save_system.cpp). If a fixture
 *     changes, run this test to see the new expected hash, update the vectors,
 *     and rebuild the C++ harness.
 *   - The C++-produced envelope (packages/unreal/tools/cross-check/
 *     cpp-produced.envelope.json) is validated here via `validateSaveFileEnvelope`
 *     (integrity + format) and `saveFileSchema` (shape) — THE PORTABILITY TEST.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { SaveFile } from '../../save-file';
import { computeSaveFileIntegrity, validateSaveFileEnvelope } from '../../save-envelope';
import { saveEnvelopeSchema, saveFileSchema } from '../../schemas';

const here = dirname(fileURLToPath(import.meta.url));
const savesDir = join(here, '..', '..', '..', 'conformance', 'saves');
const crossCheckDir = join(here, '..', '..', '..', '..', 'unreal', 'tools', 'cross-check');

interface VectorsFile {
  vectors: Record<string, string>;
}

function loadVectors(): Record<string, string> {
  const raw = JSON.parse(readFileSync(join(savesDir, 'integrity-vectors.json'), 'utf8')) as VectorsFile;
  return raw.vectors;
}

function loadFixture(name: string): SaveFile {
  return JSON.parse(readFileSync(join(savesDir, name), 'utf8')) as SaveFile;
}

const FIXTURES = ['v1-minimal.json', 'v2-typical.json', 'v2-with-extensions.json'] as const;

describe('save-integrity vectors are anchored to the TS implementation', () => {
  const vectors = loadVectors();

  it.each(FIXTURES)('%s integrity matches the committed vector', (name) => {
    const expected = vectors[name];
    // Guard against a typo/missing entry silently passing.
    expect(expected, `missing vector for ${name}`).toMatch(/^[0-9a-f]{64}$/);
    expect(computeSaveFileIntegrity(loadFixture(name))).toBe(expected);
  });

  it('covers exactly the shipped fixtures', () => {
    expect(Object.keys(vectors).sort()).toEqual([...FIXTURES].sort());
  });
});

describe('THE PORTABILITY TEST — C++-produced envelope validates in TS', () => {
  const envelope = JSON.parse(
    readFileSync(join(crossCheckDir, 'cpp-produced.envelope.json'), 'utf8'),
  ) as unknown;

  it('is a well-formed envelope with a verifying integrity hash', () => {
    const result = validateSaveFileEnvelope(envelope);
    // validateSaveFileEnvelope recomputes the integrity over saveFile and fails
    // on any mismatch — so this passing proves the C++ canonical bytes == TS.
    expect(result.ok, result.ok ? '' : result.error.message).toBe(true);
  });

  it('matches the envelope zod schema', () => {
    expect(() => saveEnvelopeSchema.parse(envelope)).not.toThrow();
  });

  it("its saveFile validates against save-file.schema (and is migrated to current)", () => {
    const env = envelope as { saveFile: unknown };
    const parsed = saveFileSchema.parse(env.saveFile);
    // The C++ writer migrates on load, so the exported save is current-version.
    expect(parsed.version).toBe(3);
  });
});
