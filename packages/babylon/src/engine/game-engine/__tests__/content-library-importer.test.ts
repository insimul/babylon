/**
 * US-IM1 — Babylon content-library importer.
 *
 * Proves the Babylon leg of author-once/use-anywhere: the shared conformance
 * content-library fixtures (`packages/core/conformance/content-library/*.json`,
 * the same golden every per-engine importer reads) materialise into native
 * Babylon entities, and malformed / dangling libraries are rejected with a clear
 * error before any entity is built.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  ContentLibraryImportError,
  importContentLibrary,
} from '../content-library-importer';

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(here, '..', '..', '..', '..', '..', 'core', 'conformance', 'content-library');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(corpusDir, `${name}.json`), 'utf8'));
}

const riverside = loadFixture('riverside-starter');
const minimal = loadFixture('minimal');

describe('importContentLibrary', () => {
  it('materialises the riverside-starter fixture into native Babylon entities', () => {
    const imported = importContentLibrary(riverside);

    // Every populated section produces one entity per definition.
    expect(imported.items).toHaveLength(3);
    expect(imported.quests).toHaveLength(2);
    expect(imported.characters).toHaveLength(3);
    expect(imported.towns).toHaveLength(1);
    expect(imported.narratives).toHaveLength(1);

    // World id defaults to the provenance world.
    expect(imported.worldId).toBe('world-riverside-demo');

    // Portable item fields lift 1:1; omitted fields materialise IR defaults.
    const sword = imported.items.find((i) => i.id === 'item-iron-sword')!;
    expect(sword.value).toBe(45);
    expect(sword.effects).toEqual({ attack: 6 });
    const draught = imported.items.find((i) => i.id === 'item-healing-draught')!;
    expect(draught.stackable).toBe(true);
    expect(draught.maxStack).toBe(10);
    const ledger = imported.items.find((i) => i.id === 'item-millers-ledger')!;
    expect(ledger.maxStack).toBe(1); // default when the library omits it

    // Prolog KB slice passes through verbatim.
    expect(imported.prologFacts).toContain('settlement(town_riverside).');
  });

  it('resolves quest cross-references into the IR back-links', () => {
    const imported = importContentLibrary(riverside);
    const quest = imported.quests.find((q) => q.id === 'quest-missing-ledger')!;

    // `assignedBy` on the IR is the giver's display name; the id lands on
    // `assignedByCharacterId`.
    expect(quest.assignedByCharacterId).toBe('char-mira-thorn');
    expect(quest.assignedBy).toBe('Mira Thorn');
    expect(quest.worldId).toBe('world-riverside-demo');

    const followup = imported.quests.find((q) => q.id === 'quest-wolves-at-the-ford')!;
    expect(followup.prerequisiteQuestIds).toEqual(['quest-missing-ledger']);
    expect(followup.itemRewards).toEqual([{ itemId: 'item-iron-sword', quantity: 1, name: '' }]);
  });

  it('materialises characters with split names, alive-state, and home town', () => {
    const imported = importContentLibrary(riverside);
    const mira = imported.characters.find((c) => c.id === 'char-mira-thorn')!;

    expect(mira.firstName).toBe('Mira');
    expect(mira.lastName).toBe('Thorn');
    expect(mira.isAlive).toBe(true);
    expect(mira.homeResidenceId).toBe('town-riverside');
    expect(mira.personality.conscientiousness).toBeCloseTo(0.81);
  });

  it('materialises the town with mayor, lots, businesses, and infrastructure', () => {
    const imported = importContentLibrary(riverside);
    const town = imported.towns[0];

    expect(town.mayorId).toBe('char-eldra-vance');
    expect(town.population).toBe(240);
    expect(town.lots).toHaveLength(3);
    const mill = town.lots.find((l) => l.id === 'lot-mill')!;
    expect(mill.position).toEqual({ x: -20, y: 0, z: 35 });
    expect(mill.buildingType).toBe('mill');
    expect(town.businessIds).toEqual(['biz-riverside-mill', 'biz-ford-smithy']);
    expect(town.infrastructure[0].category).toBe('bridge');
    expect(town.infrastructure[0].name).toBe('The Ford Crossing');
  });

  it('materialises the narrative with generic + legacy protagonist fields', () => {
    const imported = importContentLibrary(riverside);
    const narrative = imported.narratives[0];

    expect(narrative.protagonistName).toBe('Mira Thorn');
    expect(narrative.writerName).toBe('Mira Thorn'); // legacy alias populated
    expect(narrative.writerFirstName).toBe('Mira');
    expect(narrative.finalRevelation).toBe(narrative.resolution);
    expect(narrative.chapters).toHaveLength(2);
    expect(narrative.chapters[0].clueDescriptions[0].text).toBe(
      'Wet footprints on the mill floor.',
    );
    expect(narrative.redHerrings[0].description).toBe(
      'The smith was seen near the mill at dusk.',
    );
  });

  it('imports the minimal fixture as fully empty sections', () => {
    const imported = importContentLibrary(minimal);
    expect(imported.items).toEqual([]);
    expect(imported.quests).toEqual([]);
    expect(imported.characters).toEqual([]);
    expect(imported.towns).toEqual([]);
    expect(imported.narratives).toEqual([]);
  });

  it('lets an explicit worldId override the provenance default', () => {
    const imported = importContentLibrary(riverside, { worldId: 'my-world' });
    expect(imported.worldId).toBe('my-world');
    expect(imported.characters.every((c) => c.worldId === 'my-world')).toBe(true);
    expect(imported.quests.every((q) => q.worldId === 'my-world')).toBe(true);
    expect(imported.towns.every((t) => t.worldId === 'my-world')).toBe(true);
  });

  describe('rejects invalid libraries with a clear error', () => {
    it('rejects a stale contract version (schema)', () => {
      const bad = { ...(riverside as object), manifest: { ...(riverside as any).manifest, contractVersion: 'insimul-content-library-v0' } };
      expect(() => importContentLibrary(bad)).toThrow(ContentLibraryImportError);
    });

    it('rejects a missing required section header (schema)', () => {
      const { narratives, ...withoutNarratives } = riverside as any;
      try {
        importContentLibrary(withoutNarratives);
        throw new Error('expected import to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ContentLibraryImportError);
        expect((err as ContentLibraryImportError).issues.join('\n')).toContain('narratives');
      }
    });

    it('rejects a dangling cross-reference (referential integrity)', () => {
      const bad = JSON.parse(JSON.stringify(riverside));
      bad.quests[0].assignedBy = 'char-does-not-exist';
      try {
        importContentLibrary(bad);
        throw new Error('expected import to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(ContentLibraryImportError);
        expect((err as ContentLibraryImportError).issues.join('\n')).toContain(
          'char-does-not-exist',
        );
      }
    });
  });
});
