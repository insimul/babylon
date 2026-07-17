/**
 * US-GC2 — cross-runtime save-integrity parity (Godot side).
 *
 * The Godot runtime ports the save-envelope contract (canonical JSON + SHA-256
 * integrity) into a dependency-free C++ save core
 * (packages/godot/gdextension/src/{json_value,sha256,canonical_json,save_file}.cpp,
 * host-tested by packages/godot/gdextension/test/test_save_system.cpp). This
 * drift guard is the TS half of the Godot cross-check: it validates the
 * Godot-produced export envelope through the TS semantics authority, so the two
 * runtimes can never silently disagree on the canonical bytes.
 *
 *   - The integrity vectors file (conformance/saves/integrity-vectors.json) is
 *     shared with the Unreal leg and already pinned to the TS implementation by
 *     save-integrity-crosscheck.test.ts.
 *   - The Godot-produced envelope
 *     (packages/godot/tools/cross-check/cpp-produced.envelope.json) is validated
 *     here via `validateSaveFileEnvelope` (integrity + format) and
 *     `saveFileSchema` (shape) — THE PORTABILITY TEST for the Godot runtime.
 *     Regenerate it with `BOOTSTRAP_GOLDEN=1 bash
 *     packages/godot/gdextension/test/run_save_tests.sh` after a fixture change.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { validateSaveFileEnvelope } from '../../save-envelope';
import { saveEnvelopeSchema, saveFileSchema } from '../../schemas';

const here = dirname(fileURLToPath(import.meta.url));
const crossCheckDir = join(here, '..', '..', '..', '..', 'godot', 'tools', 'cross-check');

describe('THE PORTABILITY TEST (Godot) — GDExtension-produced envelope validates in TS', () => {
  const envelope = JSON.parse(
    readFileSync(join(crossCheckDir, 'cpp-produced.envelope.json'), 'utf8'),
  ) as unknown;

  it('is a well-formed envelope with a verifying integrity hash', () => {
    const result = validateSaveFileEnvelope(envelope);
    // validateSaveFileEnvelope recomputes the integrity over saveFile and fails
    // on any mismatch — so this passing proves the Godot canonical bytes == TS.
    expect(result.ok, result.ok ? '' : result.error.message).toBe(true);
  });

  it('matches the envelope zod schema', () => {
    expect(() => saveEnvelopeSchema.parse(envelope)).not.toThrow();
  });

  it("its saveFile validates against save-file.schema (and is migrated to current)", () => {
    const env = envelope as { saveFile: unknown };
    const parsed = saveFileSchema.parse(env.saveFile);
    // The Godot writer migrates on load, so the exported save is current-version.
    expect(parsed.version).toBe(3);
  });
});
