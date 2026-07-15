/**
 * US-CE4 — zod schemas + JSON Schema drift guard.
 *
 * Asserts that:
 *  - every golden save fixture parses with `saveFileSchema`
 *  - a well-formed export envelope parses with `saveEnvelopeSchema`
 *  - deliberately corrupted inputs are rejected (wrong envelope `format`,
 *    missing `worldSnapshot`)
 *  - a minimal WorldIR parses and one missing a section header is rejected
 *  - the committed `packages/core/schemas/*.schema.json` files match what
 *    `npm run schemas` would regenerate (drift guard)
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import type { SaveFile } from '../../save-file';
import { buildSaveFileEnvelope, SAVE_ENVELOPE_FORMAT } from '../../save-envelope';
import { saveEnvelopeSchema } from '../save-envelope.schema';
import { saveFileSchema } from '../save-file.schema';
import { worldIrSchema } from '../world-ir.schema';
import {
  SCHEMA_ENTRIES,
  buildJsonSchemas,
  serializeSchema,
} from '../../../scripts/schema-manifest';

const here = dirname(fileURLToPath(import.meta.url));
const coreRoot = join(here, '..', '..', '..');
const savesDir = join(coreRoot, 'conformance', 'saves');
const schemasDir = join(coreRoot, 'schemas');

const FIXTURES = ['v1-minimal.json', 'v2-typical.json', 'v2-with-extensions.json'] as const;

function loadFixture(name: string): SaveFile {
  return JSON.parse(readFileSync(join(savesDir, name), 'utf8')) as SaveFile;
}

describe('saveFileSchema', () => {
  it.each(FIXTURES)('accepts golden save fixture %s', (name) => {
    const result = saveFileSchema.safeParse(loadFixture(name));
    expect(result.success, result.success ? '' : JSON.stringify(result.error.issues)).toBe(true);
  });

  it('rejects a save with worldSnapshot removed', () => {
    const save = loadFixture('v2-typical.json') as Partial<SaveFile>;
    delete save.worldSnapshot;
    expect(saveFileSchema.safeParse(save).success).toBe(false);
  });

  it('rejects a save missing a required top-level key (userId)', () => {
    const save = loadFixture('v2-typical.json') as Partial<SaveFile>;
    delete save.userId;
    expect(saveFileSchema.safeParse(save).success).toBe(false);
  });
});

describe('saveEnvelopeSchema', () => {
  it('accepts a well-formed export envelope', () => {
    const envelope = buildSaveFileEnvelope(loadFixture('v2-typical.json'), {
      insimulVersion: 'test',
      exportedAt: '2025-10-01T00:00:00.000Z',
    });
    const result = saveEnvelopeSchema.safeParse(envelope);
    expect(result.success, result.success ? '' : JSON.stringify(result.error.issues)).toBe(true);
  });

  it("rejects an envelope with the wrong 'format' string", () => {
    const envelope = buildSaveFileEnvelope(loadFixture('v2-typical.json'), {
      insimulVersion: 'test',
    });
    const corrupted = { ...envelope, format: 'insimul-save-v99' };
    expect(corrupted.format).not.toBe(SAVE_ENVELOPE_FORMAT);
    expect(saveEnvelopeSchema.safeParse(corrupted).success).toBe(false);
  });

  it('rejects an envelope with an empty integrity digest', () => {
    const envelope = buildSaveFileEnvelope(loadFixture('v2-typical.json'), {
      insimulVersion: 'test',
    });
    expect(saveEnvelopeSchema.safeParse({ ...envelope, integrity: '' }).success).toBe(false);
  });
});

describe('worldIrSchema', () => {
  const minimalIr = {
    meta: {
      insimulVersion: '0.1.0',
      worldId: 'fixture-world',
      worldName: 'Fixture World',
      worldType: 'medieval-fantasy',
      genreConfig: {},
      exportTimestamp: '2025-10-01T00:00:00.000Z',
      exportVersion: 1,
      seed: 'seed-1',
    },
    geography: {},
    entities: {},
    systems: {},
    theme: {},
    assets: {},
    player: {},
    ui: {},
    combat: {},
    survival: null,
    resources: null,
    assessment: null,
    languageLearning: null,
    aiConfig: {},
  };

  it('accepts a minimal WorldIR with all section headers present', () => {
    const result = worldIrSchema.safeParse(minimalIr);
    expect(result.success, result.success ? '' : JSON.stringify(result.error.issues)).toBe(true);
  });

  it('rejects a WorldIR missing a section header (systems)', () => {
    const { systems, ...withoutSystems } = minimalIr;
    void systems;
    expect(worldIrSchema.safeParse(withoutSystems).success).toBe(false);
  });
});

describe('JSON Schema drift guard', () => {
  it.each(SCHEMA_ENTRIES.map((e) => e.file))(
    'committed %s matches a fresh emission (run `npm run schemas` to update)',
    (file) => {
      const committed = readFileSync(join(schemasDir, file), 'utf8');
      const fresh = serializeSchema(buildJsonSchemas()[file]);
      expect(committed).toBe(fresh);
    },
  );
});
