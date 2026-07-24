/**
 * Zod schemas for the shareable WORLD ARTIFACT — a **content library** (US-CL1).
 *
 * A content library is the portable, engine-neutral unit of authored content:
 * items, quests, characters, towns and narratives packaged with a manifest
 * (contract version, library revision, provenance) so any editor / engine can
 * import the exact same shape. It is a *slice* of authored definitions, not a
 * generated world — the whole-world transports stay
 * {@link worldIrSchema WorldIR} (`world-ir.schema.ts`) and
 * {@link canonicalWorldExportSchema} (`grounding.schema.ts`).
 *
 * The section shapes deliberately mirror the corresponding `*IR` interfaces in
 * `game-engine/ir-types.ts` (`ItemIR`, `QuestIR`, `CharacterIR`, `SettlementIR`,
 * `NarrativeIR`) field-for-field where a field is portable, so a library entry
 * can be lifted into a WorldIR section (and back) without a translation table.
 * World-scoped identity (`worldId`) and engine-computed geometry (street
 * networks, elevation profiles, lot layouts) are deliberately absent — those
 * are materialised per-import, and carrying them would make a library
 * world-specific.
 *
 * Discipline (same as US-CE4/US-CE7): EXACT on the manifest keys, the library's
 * section headers, and each definition's identity fields (`id` + the name/title
 * and kind that make it addressable); PERMISSIVE (`z.unknown()` /
 * `.passthrough()`) on deep sub-objects (effects, rewards, objectives,
 * relationships) which are tightened as importers land.
 */

import { z } from 'zod';

/**
 * Interchange contract version for the content-library format. Bump when the
 * artifact shape changes in a way that requires coordinated editor/engine
 * releases. Modelled as a literal (like {@link GROUNDING_CONTRACT_VERSION}) so
 * a fixture with a stale or absent `contractVersion` is rejected outright.
 */
export const CONTENT_LIBRARY_CONTRACT_VERSION = 'insimul-content-library-v1';

/** A not-yet-tightened sub-object — permissive placeholder. */
const looseObject = z.object({}).passthrough();

/** Engine-neutral world-space position (Babylon's `Vector3` is assignable). */
const vec3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() });

/** Engine-neutral ground-plane position (settlement centers, lots). */
const vec2Schema = z.object({ x: z.number(), z: z.number() });

/**
 * Where a library came from and under what terms it may be redistributed.
 * Exact on `source` + `license` (the seam that makes libraries
 * license-filterable, mirroring `groundingEntitySchema`); everything else is
 * optional because hand-authored libraries have no URL or upstream tool.
 */
export const contentLibraryProvenanceSchema = z
  .object({
    /** Producing tool or corpus (e.g. `insimul-editor`, `pinakes`). */
    source: z.string().min(1),
    sourceUrl: z.string().optional(),
    /** Human or organisation credited as the author. */
    author: z.string().optional(),
    createdAt: z.string().optional(),
    /** Insimul version that produced the library, when known. */
    insimulVersion: z.string().optional(),
    /** World the content was authored in, when it was extracted from one. */
    worldId: z.string().optional(),
    /** SPDX license expression (e.g. `CC-BY-SA-4.0`). */
    license: z.string().min(1),
  })
  .passthrough();

/**
 * The library header. Exact on the identifying keys; `version` is the library's
 * own monotonic revision (bumped per publish) and is independent of
 * `contractVersion`, which pins the *format*.
 */
export const contentLibraryManifestSchema = z
  .object({
    contractVersion: z.literal(CONTENT_LIBRARY_CONTRACT_VERSION),
    /** Stable id for the library itself, unique to its publisher. */
    libraryId: z.string().min(1),
    name: z.string().min(1),
    description: z.string().optional(),
    /** Monotonic library revision. */
    version: z.number().int().positive(),
    generatedAt: z.string(),
    provenance: contentLibraryProvenanceSchema,
    /** Advisory genre hint (`medieval-fantasy`, …) — does not gate import. */
    genre: z.string().optional(),
    /** BCP-47 locale of the human-readable text. */
    locale: z.string().optional(),
    /** Language the content teaches, for language-learning libraries. */
    targetLanguage: z.string().optional(),
  })
  .passthrough();

/** Free-form categorisation carried by every definition kind. */
const tagsSchema = z.array(z.string()).optional();

/** A portable item definition (mirrors the portable subset of `ItemIR`). */
export const itemDefinitionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    itemType: z.string().min(1),
    description: z.string().nullable().optional(),
    icon: z.string().nullable().optional(),
    value: z.number().optional(),
    sellValue: z.number().optional(),
    weight: z.number().optional(),
    tradeable: z.boolean().optional(),
    stackable: z.boolean().optional(),
    maxStack: z.number().int().optional(),
    objectRole: z.string().nullable().optional(),
    effects: z.record(z.number()).nullable().optional(),
    lootWeight: z.number().optional(),
    tags: tagsSchema,
  })
  .passthrough();

/** A portable quest definition (mirrors the portable subset of `QuestIR`). */
export const questDefinitionSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    questType: z.string().min(1),
    description: z.string().optional(),
    difficulty: z.string().optional(),
    targetLanguage: z.string().optional(),
    /** Objective shape varies per quest type — tightened by the importers. */
    objectives: z.array(z.unknown()).optional(),
    completionCriteria: looseObject.optional(),
    experienceReward: z.number().optional(),
    rewards: looseObject.optional(),
    itemRewards: z.array(looseObject).nullable().optional(),
    /** Library-scoped quest ids, resolved against this library on import. */
    prerequisiteQuestIds: z.array(z.string()).nullable().optional(),
    questChainId: z.string().nullable().optional(),
    questChainOrder: z.number().int().nullable().optional(),
    /** Library-scoped character id of the giver, when the quest names one. */
    assignedBy: z.string().nullable().optional(),
    tags: tagsSchema,
  })
  .passthrough();

/** The five-factor personality block (mirrors `CharacterIR.personality`). */
const personalitySchema = z
  .object({
    openness: z.number(),
    conscientiousness: z.number(),
    extroversion: z.number(),
    agreeableness: z.number(),
    neuroticism: z.number(),
  })
  .passthrough();

/**
 * A portable character definition. `CharacterIR` splits the name into
 * first/middle/last/suffix; a library requires only a display `name` (engines
 * without a name model can render it directly) and carries the split parts as
 * optional fields for round-tripping.
 */
export const characterDefinitionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    firstName: z.string().optional(),
    middleName: z.string().nullable().optional(),
    lastName: z.string().optional(),
    suffix: z.string().nullable().optional(),
    gender: z.string().optional(),
    birthYear: z.number().int().nullable().optional(),
    occupation: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    personality: personalitySchema.optional(),
    physicalTraits: z.record(z.unknown()).optional(),
    mentalTraits: z.record(z.unknown()).optional(),
    skills: z.record(z.number()).optional(),
    socialAttributes: z.record(z.unknown()).optional(),
    /** Library-scoped character ids keyed by relationship kind. */
    relationships: z.record(z.unknown()).optional(),
    /** Library-scoped town id this character is placed in, when fixed. */
    homeTownId: z.string().nullable().optional(),
    tags: tagsSchema,
  })
  .passthrough();

/**
 * A portable town definition (a `SettlementIR` minus world-scoped identity and
 * engine-computed geometry). `position` is optional because a library town may
 * be placed by the importing world rather than pinned to coordinates.
 */
export const townDefinitionSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    settlementType: z.string().min(1),
    description: z.string().nullable().optional(),
    terrain: z.string().nullable().optional(),
    population: z.number().int().optional(),
    foundedYear: z.number().int().nullable().optional(),
    /** Library-scoped character id of the mayor, when the town names one. */
    mayorId: z.string().nullable().optional(),
    position: vec3Schema.optional(),
    radius: z.number().optional(),
    /** Building lots, relative to the town center. */
    lots: z
      .array(
        z
          .object({
            id: z.string().min(1),
            position: vec2Schema.optional(),
          })
          .passthrough(),
      )
      .optional(),
    businesses: z.array(looseObject).optional(),
    infrastructure: z.array(looseObject).optional(),
    tags: tagsSchema,
  })
  .passthrough();

/**
 * A portable narrative definition. `NarrativeIR`'s legacy Missing-Writer field
 * names (`writerName`, `disappearanceReason`, …) are NOT part of the portable
 * contract — a library uses the generic protagonist vocabulary only.
 */
export const narrativeDefinitionSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    protagonistRole: z.string().optional(),
    protagonistName: z.string().optional(),
    protagonistBackstory: z.string().optional(),
    incidentReason: z.string().optional(),
    resolution: z.string().optional(),
    chapters: z
      .array(
        z
          .object({
            chapterId: z.string().min(1),
            chapterNumber: z.number().int().optional(),
            title: z.string().min(1),
            introNarrative: z.string().optional(),
            outroNarrative: z.string().optional(),
            clueDescriptions: z.array(looseObject).optional(),
          })
          .passthrough(),
      )
      .optional(),
    redHerrings: z.array(looseObject).optional(),
    tags: tagsSchema,
  })
  .passthrough();

/**
 * The shareable world artifact. Every section header is REQUIRED (an empty
 * array is how a library says "no content of this kind") so a consumer can
 * iterate the five kinds without presence checks — the same discipline the
 * WorldIR section headers use.
 */
export const contentLibrarySchema = z
  .object({
    manifest: contentLibraryManifestSchema,
    items: z.array(itemDefinitionSchema),
    quests: z.array(questDefinitionSchema),
    characters: z.array(characterDefinitionSchema),
    towns: z.array(townDefinitionSchema),
    narratives: z.array(narrativeDefinitionSchema),
    /**
     * Optional Prolog KB slice the definitions above rely on (same role as
     * `groundingPackSchema.prologFacts`): world-portable facts/rules consulted
     * when the library is imported. Must use predicate-schema-registered
     * predicates so it stays engine- and world-portable.
     */
    prologFacts: z.array(z.string()).optional(),
  })
  .passthrough();

export type ContentLibraryProvenanceSchema = z.infer<typeof contentLibraryProvenanceSchema>;
export type ContentLibraryManifestSchema = z.infer<typeof contentLibraryManifestSchema>;
export type ItemDefinitionSchema = z.infer<typeof itemDefinitionSchema>;
export type QuestDefinitionSchema = z.infer<typeof questDefinitionSchema>;
export type CharacterDefinitionSchema = z.infer<typeof characterDefinitionSchema>;
export type TownDefinitionSchema = z.infer<typeof townDefinitionSchema>;
export type NarrativeDefinitionSchema = z.infer<typeof narrativeDefinitionSchema>;
export type ContentLibrarySchema = z.infer<typeof contentLibrarySchema>;
