/**
 * Zod schema for the {@link WorldIR} transport shape (US-CE4).
 *
 * The World IR is enormous (see `game-engine/ir-types.ts`), so per the PRD the
 * schema is EXACT on the IR section headers — the fourteen top-level `WorldIR`
 * keys and the `meta` block's identifying fields — and PERMISSIVE (passthrough)
 * on every section's contents, to be tightened section-by-section later.
 *
 * The nullable sections (`survival`/`resources`/`assessment`/`languageLearning`)
 * mirror the interface: they are objects when the genre enables the feature and
 * `null` otherwise.
 */

import { z } from 'zod';

const looseObject = z.object({}).passthrough();

/** Export metadata — exact on the identifying headers, permissive on the rest. */
export const metaIrSchema = z
  .object({
    insimulVersion: z.string(),
    worldId: z.string(),
    worldName: z.string(),
    worldType: z.string(),
    genreConfig: looseObject,
    exportTimestamp: z.string(),
    exportVersion: z.number().int(),
    seed: z.string(),
  })
  .passthrough();

export const worldIrSchema = z
  .object({
    meta: metaIrSchema,
    geography: looseObject,
    entities: looseObject,
    systems: looseObject,
    theme: looseObject,
    assets: looseObject,
    player: looseObject,
    ui: looseObject,
    combat: looseObject,
    survival: looseObject.nullable(),
    resources: looseObject.nullable(),
    assessment: looseObject.nullable(),
    languageLearning: looseObject.nullable(),
    aiConfig: looseObject,
  })
  .passthrough();

export type WorldIrSchema = z.infer<typeof worldIrSchema>;
