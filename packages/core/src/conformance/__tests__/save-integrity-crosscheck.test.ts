/**
 * US-XC2 — cross-runtime save-integrity parity (TS side, golden anchor).
 *
 * The shared golden integrity vectors (conformance/saves/integrity-vectors.json) are
 * the cross-runtime contract: this test anchors them to the TS implementation, and each
 * native engine (now split into its own repo) validates its C++/C# save core against the
 * SAME vectors (via the vendored conformance corpus). Both sides independently agreeing
 * with the golden is what guarantees they agree with each other — so the old
 * "TS validates the engine-produced envelope" portability block was removed when the
 * engine packages split out (it read a sibling engine fixture that no longer lives here).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { SaveFile } from '../../save-file';
import { computeSaveFileIntegrity } from '../../save-envelope';

const here = dirname(fileURLToPath(import.meta.url));
const savesDir = join(here, '..', '..', '..', 'conformance', 'saves');

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
