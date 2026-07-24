/**
 * US-CE7 — Pinakes bridge schema stubs (renamed to Pinakes in US-4).
 *
 * Asserts that:
 *  - a minimal hand-written GroundingPack fixture parses
 *  - fixtures missing `contractVersion`, an entity `csid`, or an entity
 *    `license` are rejected (the exact-required seam)
 *  - the pack's `source` is the KINP namespace `pinakes` and the pre-rename
 *    value is rejected outright
 *  - a minimal CanonicalWorldExport fixture parses and one missing
 *    `contractVersion` / `predicateSchemaHash` is rejected
 *
 * The committed JSON Schema counterparts are covered by the shared US-CE4
 * drift guard in `schemas.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import { PINAKES_NAMESPACE } from '../../identity/kinp';
import {
  GROUNDING_CONTRACT_VERSION,
  groundingPackSchema,
  canonicalWorldExportSchema,
} from '../grounding.schema';

/** A minimal, well-formed grounding pack (Bridge 1). */
function makeGroundingPack() {
  return {
    contractVersion: GROUNDING_CONTRACT_VERSION,
    packId: 'pack-latin-cuisine-001',
    generatedAt: '2026-07-15T00:00:00.000Z',
    source: PINAKES_NAMESPACE,
    domains: ['cuisine', 'culture'],
    entities: [
      {
        csid: 'cs:ingredient:garum',
        entityType: 'ingredient',
        fields: { name: 'garum', region: 'Roman' },
        provenance: {
          source: 'wikidata',
          sourceUrl: 'https://www.wikidata.org/wiki/Q1234',
          retrievedAt: '2026-07-01T00:00:00.000Z',
          confidence: 0.92,
        },
        license: 'CC-BY-SA-4.0',
      },
    ],
    prologFacts: ['ingredient(garum, roman).'],
    licenseManifest: { 'CC-BY-SA-4.0': 1 },
  };
}

/** A minimal, well-formed canonical world export (Bridge 2). */
function makeCanonicalWorldExport() {
  return {
    contractVersion: GROUNDING_CONTRACT_VERSION,
    worldId: 'world-abc',
    seed: 'seed-1',
    exportedAt: '2026-07-15T00:00:00.000Z',
    predicateSchemaHash: 'sha256:deadbeef',
    ir: {
      meta: {
        insimulVersion: '1.0.0',
        worldId: 'world-abc',
        worldName: 'Fixture World',
        worldType: 'medieval-fantasy',
        genreConfig: {},
        exportTimestamp: '2026-07-15T00:00:00.000Z',
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
    },
    prologKb: 'quest(q1, "Find the Sword", main, 1, active).',
    licenseNote: 'Proprietary synthetic corpus.',
  };
}

describe('groundingPackSchema', () => {
  it('accepts a minimal well-formed grounding pack', () => {
    const result = groundingPackSchema.safeParse(makeGroundingPack());
    expect(result.success, result.success ? '' : JSON.stringify(result.error.issues)).toBe(true);
  });

  it('rejects a pack missing contractVersion', () => {
    const pack = makeGroundingPack() as Partial<ReturnType<typeof makeGroundingPack>>;
    delete pack.contractVersion;
    expect(groundingPackSchema.safeParse(pack).success).toBe(false);
  });

  it('rejects a pack with the wrong contractVersion', () => {
    const pack = { ...makeGroundingPack(), contractVersion: 'insimul-grounding-v0' };
    expect(pack.contractVersion).not.toBe(GROUNDING_CONTRACT_VERSION);
    expect(groundingPackSchema.safeParse(pack).success).toBe(false);
  });

  it('rejects a pack whose entity is missing csid', () => {
    const pack = makeGroundingPack();
    const entity = pack.entities[0] as Partial<(typeof pack.entities)[0]>;
    delete entity.csid;
    expect(groundingPackSchema.safeParse(pack).success).toBe(false);
  });

  it('rejects a pack whose entity is missing license', () => {
    const pack = makeGroundingPack();
    const entity = pack.entities[0] as Partial<(typeof pack.entities)[0]>;
    delete entity.license;
    expect(groundingPackSchema.safeParse(pack).success).toBe(false);
  });

  it('rejects a pack whose entity has an empty license', () => {
    const pack = makeGroundingPack();
    pack.entities[0].license = '';
    expect(groundingPackSchema.safeParse(pack).success).toBe(false);
  });

  it('rejects a pack whose entity provenance is missing source', () => {
    const pack = makeGroundingPack();
    const prov = pack.entities[0].provenance as Partial<(typeof pack.entities)[0]['provenance']>;
    delete prov.source;
    expect(groundingPackSchema.safeParse(pack).success).toBe(false);
  });

  it("rejects a pack with the wrong 'source'", () => {
    const pack = { ...makeGroundingPack(), source: 'handwritten' };
    expect(groundingPackSchema.safeParse(pack).success).toBe(false);
  });

  it("pins 'source' to the KINP pinakes namespace", () => {
    expect(PINAKES_NAMESPACE).toBe('pinakes');
    const parsed = groundingPackSchema.parse(makeGroundingPack());
    expect(parsed.source).toBe('pinakes');
  });
});

describe('canonicalWorldExportSchema', () => {
  it('accepts a minimal well-formed canonical world export', () => {
    const result = canonicalWorldExportSchema.safeParse(makeCanonicalWorldExport());
    expect(result.success, result.success ? '' : JSON.stringify(result.error.issues)).toBe(true);
  });

  it('rejects an export missing contractVersion', () => {
    const exp = makeCanonicalWorldExport() as Partial<ReturnType<typeof makeCanonicalWorldExport>>;
    delete exp.contractVersion;
    expect(canonicalWorldExportSchema.safeParse(exp).success).toBe(false);
  });

  it('rejects an export missing predicateSchemaHash', () => {
    const exp = makeCanonicalWorldExport() as Partial<ReturnType<typeof makeCanonicalWorldExport>>;
    delete exp.predicateSchemaHash;
    expect(canonicalWorldExportSchema.safeParse(exp).success).toBe(false);
  });

  it('rejects an export whose ir is missing a section header', () => {
    const exp = makeCanonicalWorldExport();
    const { systems, ...irWithoutSystems } = exp.ir;
    void systems;
    expect(
      canonicalWorldExportSchema.safeParse({ ...exp, ir: irWithoutSystems }).success,
    ).toBe(false);
  });
});
