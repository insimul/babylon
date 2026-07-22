/**
 * US-CL1 — content-library (world artifact) schema.
 *
 * Asserts that:
 *  - a minimal library covering all five entity kinds parses
 *  - the empty library (every section present but empty) parses — sections are
 *    required headers, an empty array is how "no content of this kind" is said
 *  - a fixture missing a section header / the manifest is rejected
 *  - a stale or absent `contractVersion` is rejected (the literal seam)
 *  - each definition kind's identity fields are required
 *
 * The committed `content-library.schema.json` is covered by the shared US-CE4
 * drift guard in `schemas.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import {
  CONTENT_LIBRARY_CONTRACT_VERSION,
  contentLibrarySchema,
  contentLibraryManifestSchema,
} from '../content-library.schema';

/** A minimal, well-formed content library covering every entity kind. */
function makeLibrary() {
  return {
    manifest: {
      contractVersion: CONTENT_LIBRARY_CONTRACT_VERSION,
      libraryId: 'lib-riverside-starter',
      name: 'Riverside Starter Pack',
      description: 'A small medieval-fantasy starter library.',
      version: 1,
      generatedAt: '2026-07-20T00:00:00.000Z',
      provenance: {
        source: 'insimul-editor',
        author: 'Insimul',
        createdAt: '2026-07-19T00:00:00.000Z',
        insimulVersion: '1.0.0',
        license: 'CC-BY-4.0',
      },
      genre: 'medieval-fantasy',
      locale: 'en-US',
    },
    items: [
      {
        id: 'item-iron-sword',
        name: 'Iron Sword',
        itemType: 'weapon',
        description: 'A serviceable blade.',
        value: 45,
        weight: 3.5,
        tradeable: true,
        stackable: false,
        effects: { attack: 6 },
        tags: ['weapon', 'starter'],
      },
    ],
    quests: [
      {
        id: 'quest-lost-ledger',
        title: 'The Lost Ledger',
        questType: 'fetch',
        description: "Recover the miller's ledger.",
        difficulty: 'easy',
        objectives: [{ type: 'collect', target: 'item-iron-sword', required: 1 }],
        experienceReward: 100,
        assignedBy: 'char-mayor-aldric',
        tags: ['starter'],
      },
    ],
    characters: [
      {
        id: 'char-mayor-aldric',
        name: 'Aldric Vane',
        firstName: 'Aldric',
        lastName: 'Vane',
        occupation: 'mayor',
        personality: {
          openness: 0.6,
          conscientiousness: 0.8,
          extroversion: 0.5,
          agreeableness: 0.7,
          neuroticism: 0.2,
        },
        skills: { negotiation: 4 },
        homeTownId: 'town-riverside',
      },
    ],
    towns: [
      {
        id: 'town-riverside',
        name: 'Riverside',
        settlementType: 'village',
        population: 240,
        mayorId: 'char-mayor-aldric',
        position: { x: 0, y: 0, z: 0 },
        radius: 120,
        lots: [{ id: 'lot-1', position: { x: 10, z: -4 } }],
      },
    ],
    narratives: [
      {
        id: 'narrative-missing-miller',
        title: 'The Missing Miller',
        protagonistRole: 'chronicler',
        protagonistName: 'Aldric Vane',
        chapters: [
          {
            chapterId: 'ch-1',
            chapterNumber: 1,
            title: 'An Empty Mill',
            introNarrative: 'The wheel still turns, but no one answers.',
          },
        ],
      },
    ],
    prologFacts: ['settlement(town_riverside, village).'],
  };
}

/** Every section header, present but empty. */
const EMPTY_SECTIONS = {
  items: [],
  quests: [],
  characters: [],
  towns: [],
  narratives: [],
} as const;

const SECTIONS = ['items', 'quests', 'characters', 'towns', 'narratives'] as const;

describe('contentLibrarySchema', () => {
  it('accepts a minimal library covering every entity kind', () => {
    const result = contentLibrarySchema.safeParse(makeLibrary());
    expect(result.success, result.success ? '' : JSON.stringify(result.error.issues)).toBe(true);
  });

  it('accepts a library whose sections are all empty', () => {
    const library = { manifest: makeLibrary().manifest, ...EMPTY_SECTIONS };
    const result = contentLibrarySchema.safeParse(library);
    expect(result.success, result.success ? '' : JSON.stringify(result.error.issues)).toBe(true);
  });

  it.each(SECTIONS)('rejects a library missing the %s section header', (section) => {
    const library: Record<string, unknown> = makeLibrary();
    delete library[section];
    expect(contentLibrarySchema.safeParse(library).success).toBe(false);
  });

  it('rejects a library with no manifest', () => {
    const library: Record<string, unknown> = makeLibrary();
    delete library.manifest;
    expect(contentLibrarySchema.safeParse(library).success).toBe(false);
  });
});

describe('contentLibraryManifestSchema', () => {
  it('rejects a stale contractVersion', () => {
    const manifest = { ...makeLibrary().manifest, contractVersion: 'insimul-content-library-v0' };
    expect(manifest.contractVersion).not.toBe(CONTENT_LIBRARY_CONTRACT_VERSION);
    expect(contentLibraryManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('rejects a manifest with no contractVersion', () => {
    const manifest: Record<string, unknown> = makeLibrary().manifest;
    delete manifest.contractVersion;
    expect(contentLibraryManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it('rejects provenance with no license', () => {
    const { manifest } = makeLibrary();
    const provenance: Record<string, unknown> = { ...manifest.provenance };
    delete provenance.license;
    expect(contentLibraryManifestSchema.safeParse({ ...manifest, provenance }).success).toBe(false);
  });

  it('rejects a non-positive library version', () => {
    const manifest = { ...makeLibrary().manifest, version: 0 };
    expect(contentLibraryManifestSchema.safeParse(manifest).success).toBe(false);
  });
});

describe('portable definitions', () => {
  it.each([
    ['items', 'id'],
    ['items', 'itemType'],
    ['quests', 'title'],
    ['quests', 'questType'],
    ['characters', 'name'],
    ['towns', 'settlementType'],
    ['narratives', 'title'],
  ] as const)('rejects a %s entry missing its %s', (section, field) => {
    const library = makeLibrary() as unknown as Record<string, Record<string, unknown>[]>;
    delete library[section][0][field];
    expect(contentLibrarySchema.safeParse(library).success).toBe(false);
  });

  it('carries unknown definition fields through (passthrough)', () => {
    const library = makeLibrary();
    const parsed = contentLibrarySchema.parse({
      ...library,
      items: [{ ...library.items[0], customData: { rarity: 'uncommon' } }],
    });
    expect(parsed.items[0]).toMatchObject({ customData: { rarity: 'uncommon' } });
  });
});
