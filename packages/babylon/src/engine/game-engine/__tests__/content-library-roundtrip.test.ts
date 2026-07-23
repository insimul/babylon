/**
 * US-IM2 — Round-trip parity against the shared corpus.
 *
 * The Babylon leg of the author-once/use-anywhere proof. US-IM1 showed the shared
 * conformance content-library fixtures materialise into native Babylon entities;
 * this suite proves those entities carry the **same semantics** as the source
 * library — every portable field the golden pins survives the import unchanged, and
 * the library-scoped cross-references resolve to the same targets.
 *
 * The fixtures under `packages/core/conformance/content-library/` are the SHARED
 * golden — the identical JSON every per-engine importer reads. So asserting the
 * imported IR back against the source fields IS the parity check (the source is the
 * ground truth all engines agree on), not a Babylon-only expectation. Any engine's
 * importer that preserved the same field semantics would pass the equivalent test;
 * this is Babylon's slice of that cross-engine contract.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { contentLibrarySchema } from '@insimul/core';

import { importContentLibrary } from '../content-library-importer';

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(here, '..', '..', '..', '..', '..', 'core', 'conformance', 'content-library');

function loadRaw(name: string): any {
  return JSON.parse(readFileSync(join(corpusDir, `${name}.json`), 'utf8'));
}

const raw = loadRaw('riverside-starter');
// The source parsed through the shared schema — the same lossless (`.passthrough()`)
// projection the core conformance corpus pins as the ground truth.
const source = contentLibrarySchema.parse(raw);
const imported = importContentLibrary(raw);

const byId = <T extends { id: string }>(xs: T[], id: string): T => {
  const found = xs.find((x) => x.id === id);
  if (!found) throw new Error(`no entity with id "${id}"`);
  return found;
};

describe('content-library round-trip parity (US-IM2)', () => {
  it('preserves the library manifest identity in the imported world id', () => {
    // The world the entities were materialised into is the provenance world the
    // golden names — no drift.
    expect(imported.worldId).toBe(source.manifest.provenance.worldId);
  });

  it('imports exactly one native entity per source definition (no drops, no fabrication)', () => {
    expect(imported.items.map((i) => i.id).sort()).toEqual(source.items.map((i) => i.id).sort());
    expect(imported.quests.map((q) => q.id).sort()).toEqual(source.quests.map((q) => q.id).sort());
    expect(imported.characters.map((c) => c.id).sort()).toEqual(
      source.characters.map((c) => c.id).sort(),
    );
    expect(imported.towns.map((t) => t.id).sort()).toEqual(source.towns.map((t) => t.id).sort());
    expect(imported.narratives).toHaveLength(source.narratives.length);
  });

  it('each item preserves every portable field the golden pins', () => {
    for (const def of source.items) {
      const item = byId(imported.items, def.id);
      // Portable fields lift 1:1 — the semantics the source carries survive.
      expect(item.name).toBe(def.name);
      expect(item.itemType).toBe(def.itemType);
      expect(item.description).toBe(def.description ?? null);
      expect(item.value).toBe(def.value ?? 0);
      expect(item.sellValue).toBe(def.sellValue ?? 0);
      expect(item.weight).toBe(def.weight ?? 0);
      expect(item.tradeable).toBe(def.tradeable ?? true);
      expect(item.stackable).toBe(def.stackable ?? false);
      expect(item.maxStack).toBe(def.maxStack ?? 1);
      expect(item.objectRole).toBe(def.objectRole ?? null);
      expect(item.effects).toEqual(def.effects ?? null);
      expect(item.tags).toEqual(def.tags ?? []);
    }
  });

  it('each quest preserves its fields and resolves givers/prereqs to the same targets', () => {
    const charName = (id: string) => byId(source.characters, id).name;
    for (const def of source.quests) {
      const quest = byId(imported.quests, def.id);
      expect(quest.title).toBe(def.title);
      expect(quest.questType).toBe(def.questType);
      expect(quest.description).toBe(def.description ?? '');
      expect(quest.difficulty).toBe(def.difficulty ?? 'normal');
      expect(quest.experienceReward).toBe(def.experienceReward ?? 0);
      expect(quest.rewards).toEqual(def.rewards ?? {});
      expect(quest.objectives).toEqual(def.objectives ?? []);
      expect(quest.completionCriteria).toEqual(def.completionCriteria ?? {});
      expect(quest.questChainId).toBe(def.questChainId ?? null);
      expect(quest.questChainOrder).toBe(def.questChainOrder ?? null);
      expect(quest.worldId).toBe(imported.worldId);

      // Cross-reference parity: the giver id survives on `assignedByCharacterId`
      // and resolves to the SAME character's display name in `assignedBy`.
      if (def.assignedBy != null) {
        expect(quest.assignedByCharacterId).toBe(def.assignedBy);
        expect(quest.assignedBy).toBe(charName(def.assignedBy));
      } else {
        expect(quest.assignedByCharacterId).toBeNull();
      }

      // Prereq chain preserved verbatim (already integrity-checked to resolve).
      expect(quest.prerequisiteQuestIds ?? []).toEqual(def.prerequisiteQuestIds ?? []);

      // Item rewards keep the referenced item + quantity.
      const srcRewards = (def.itemRewards ?? []).map((r: any) => ({
        itemId: r.itemId,
        quantity: r.quantity ?? 1,
      }));
      const gotRewards = (quest.itemRewards ?? []).map((r) => ({
        itemId: r.itemId,
        quantity: r.quantity,
      }));
      expect(gotRewards).toEqual(srcRewards);
      // Every rewarded item is a real item in the same library.
      for (const r of gotRewards) {
        expect(source.items.some((i) => i.id === r.itemId)).toBe(true);
      }
    }
  });

  it('each character preserves identity, traits, and home town', () => {
    for (const def of source.characters) {
      const character = byId(imported.characters, def.id);
      expect(character.gender).toBe(def.gender ?? '');
      expect(character.birthYear).toBe(def.birthYear ?? null);
      expect(character.occupation).toBe(def.occupation ?? null);
      expect(character.status).toBe(def.status ?? null);
      expect(character.worldId).toBe(imported.worldId);

      // Name: the source carries the parts, so they must survive without a re-split.
      if (def.firstName != null) expect(character.firstName).toBe(def.firstName);
      if (def.lastName != null) expect(character.lastName).toBe(def.lastName);
      // The full display name recomposes to the source name.
      expect(`${character.firstName} ${character.lastName}`.trim()).toBe(def.name.trim());

      // Trait bags pass through verbatim.
      expect(character.personality).toEqual(def.personality ?? character.personality);
      expect(character.skills).toEqual(def.skills ?? {});
      expect(character.relationships).toEqual(def.relationships ?? {});

      // "alive"/absent status ⇒ alive; the golden has no deceased character.
      expect(character.isAlive).toBe(true);

      // Home-town cross-reference resolves to the same town id.
      if (def.homeTownId != null) {
        expect(character.homeResidenceId).toBe(def.homeTownId);
        expect(source.towns.some((t) => t.id === def.homeTownId)).toBe(true);
      }
    }
  });

  it('each town preserves its fields and resolves its mayor to the same character', () => {
    for (const def of source.towns) {
      const town = byId(imported.towns, def.id);
      expect(town.name).toBe(def.name);
      expect(town.settlementType).toBe(def.settlementType);
      expect(town.description).toBe(def.description ?? null);
      expect(town.terrain).toBe(def.terrain ?? null);
      expect(town.population).toBe(def.population ?? 0);
      expect(town.foundedYear).toBe(def.foundedYear ?? null);
      expect(town.radius).toBe(def.radius ?? 0);
      expect(town.worldId).toBe(imported.worldId);

      // Mayor cross-reference resolves to a real character in the same library.
      if (def.mayorId != null) {
        expect(town.mayorId).toBe(def.mayorId);
        expect(source.characters.some((c) => c.id === def.mayorId)).toBe(true);
      }

      // Lots keep their id + planar coordinates (y defaulted to ground level).
      const srcLots = (def.lots ?? []).map((l: any) => ({
        id: l.id,
        x: l.position?.x ?? 0,
        z: l.position?.z ?? 0,
        buildingType: l.buildingType ?? null,
      }));
      const gotLots = town.lots.map((l) => ({
        id: l.id,
        x: l.position.x,
        z: l.position.z,
        buildingType: l.buildingType,
      }));
      expect(gotLots).toEqual(srcLots);

      // Businesses reduce to their ids; infrastructure keeps kind + name.
      const srcBizIds = (def.businesses ?? []).map((b: any) => b.businessId);
      expect(town.businessIds).toEqual(srcBizIds);
      const srcInfra = (def.infrastructure ?? []).map((i: any) => ({
        category: i.kind ?? '',
        name: i.name ?? '',
      }));
      const gotInfra = town.infrastructure.map((i) => ({ category: i.category, name: i.name }));
      expect(gotInfra).toEqual(srcInfra);
    }
  });

  it('each narrative preserves protagonist semantics under both the generic and legacy vocab', () => {
    for (const def of source.narratives) {
      // The imported IR has no id field, so pair by array order (one narrative here).
      const narrative = imported.narratives[source.narratives.indexOf(def)];
      expect(narrative.protagonistRole).toBe(def.protagonistRole ?? '');
      expect(narrative.protagonistName).toBe(def.protagonistName ?? '');
      expect(narrative.protagonistBackstory).toBe(def.protagonistBackstory ?? '');
      expect(narrative.incidentReason).toBe(def.incidentReason ?? '');
      expect(narrative.resolution).toBe(def.resolution ?? '');

      // Legacy Missing-Writer aliases mirror the generic protagonist fields — same
      // semantics reachable by an older consumer.
      expect(narrative.writerName).toBe(narrative.protagonistName);
      expect(narrative.writerBackstory).toBe(narrative.protagonistBackstory);
      expect(narrative.disappearanceReason).toBe(narrative.incidentReason);
      expect(narrative.finalRevelation).toBe(narrative.resolution);

      // Chapters keep their title + clue text in order.
      const srcChapters = (def.chapters ?? []).map((c: any) => ({
        chapterId: c.chapterId,
        title: c.title,
        clues: (c.clueDescriptions ?? []).map((cl: any) => cl.text),
      }));
      const gotChapters = narrative.chapters.map((c) => ({
        chapterId: c.chapterId,
        title: c.title,
        clues: c.clueDescriptions.map((cl) => cl.text),
      }));
      expect(gotChapters).toEqual(srcChapters);

      // Red herrings carry their prose across the `text`/`description` rename.
      const srcHerrings = (def.redHerrings ?? []).map((h: any) => h.description ?? h.text ?? '');
      const gotHerrings = narrative.redHerrings.map((h) => h.description);
      expect(gotHerrings).toEqual(srcHerrings);
    }
  });

  it('passes the portable Prolog KB slice through byte-for-byte', () => {
    expect(imported.prologFacts).toEqual(source.prologFacts ?? []);
  });

  it('is deterministic — importing the same golden twice yields identical entities', () => {
    // Author-once/use-anywhere requires a stable materialisation: no clocks, no
    // randomness, no ordering drift between runs.
    expect(importContentLibrary(raw)).toEqual(imported);
  });

  it('the empty golden round-trips to fully empty sections', () => {
    const minimalRaw = loadRaw('minimal');
    const minimal = importContentLibrary(minimalRaw);
    const minimalSource = contentLibrarySchema.parse(minimalRaw);
    expect(minimal.items).toEqual([]);
    expect(minimal.quests).toEqual([]);
    expect(minimal.characters).toEqual([]);
    expect(minimal.towns).toEqual([]);
    expect(minimal.narratives).toEqual([]);
    expect(minimal.prologFacts).toEqual(minimalSource.prologFacts ?? []);
  });
});
