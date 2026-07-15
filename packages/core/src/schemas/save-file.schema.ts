/**
 * Zod schema for the {@link SaveFile} transport shape (US-CE4).
 *
 * Discipline (see the PRD): this schema is EXACT on the top-level `SaveFile`
 * keys — every key defined in `save-file.ts` is present and required (except
 * the genuinely-optional `previousSnapshots`) — but deliberately PERMISSIVE on
 * the deep sub-objects (`worldSnapshot` collections, `currentState` sections),
 * which stay `z.unknown()` / passthrough until they are tightened incrementally.
 *
 * `version` is a positive integer rather than a literal so the schema validates
 * every migratable save shape (the golden corpus includes v1 and v2 fixtures);
 * migration to the current `SAVE_FILE_VERSION` happens separately.
 *
 * This is a validation surface, not the source of truth: the TypeScript
 * interfaces in `save-file.ts` remain canonical.
 */

import { z } from 'zod';

/** An object of arbitrary shape — a placeholder for a not-yet-tightened section. */
const looseObject = z.object({}).passthrough();

/**
 * The embedded world template. Exact on the required `world` header (id/name);
 * the entity collections are permissive on element shape and optional so that
 * pre-versioning snapshots (which omit the version-metadata fields entirely)
 * still validate.
 */
export const worldSnapshotSchema = z
  .object({
    world: z
      .object({
        id: z.string(),
        name: z.string(),
      })
      .passthrough(),
    countries: z.array(z.unknown()).optional(),
    settlements: z.array(z.unknown()).optional(),
    characters: z.array(z.unknown()).optional(),
    lots: z.array(z.unknown()).optional(),
    quests: z.array(z.unknown()).optional(),
    rules: z.array(z.unknown()).optional(),
    actions: z.array(z.unknown()).optional(),
    grammars: z.array(z.unknown()).optional(),
  })
  .passthrough();

/**
 * The mutable game state. Exact on the section headers that every save carries
 * (player/quests/npcs/languageProgress/prologFacts/extensions); permissive on
 * the section contents.
 */
export const currentGameStateSchema = z
  .object({
    player: looseObject,
    quests: looseObject,
    npcs: looseObject,
    languageProgress: looseObject,
    prologFacts: z.array(z.unknown()),
    extensions: z.record(z.unknown()),
  })
  .passthrough();

/** The v2 save-file document. */
export const saveFileSchema = z
  .object({
    id: z.string(),
    slotIndex: z.number().int(),
    userId: z.string(),
    worldId: z.string(),
    name: z.string(),
    version: z.number().int().positive(),
    status: z.enum(['active', 'completed', 'abandoned']),
    createdAt: z.string(),
    lastSavedAt: z.string(),
    totalPlaytime: z.number(),
    saveCount: z.number().int(),
    worldSnapshot: worldSnapshotSchema,
    currentState: currentGameStateSchema,
    conversations: z.array(z.unknown()),
    previousSnapshots: z.array(z.unknown()).optional(),
  })
  .passthrough();

export type SaveFileSchema = z.infer<typeof saveFileSchema>;
