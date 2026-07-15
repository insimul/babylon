/**
 * Zod schemas for the LinguaScrape bridge seam (US-CE7).
 *
 * These are SCHEMA STUBS reserving the interchange contract — no import/export
 * logic lives here. The two shapes mirror the two bridge legs from
 * `docs/LINGUASCRAPE_SYNC_PLAN.md` §4.2–4.3:
 *
 *  - {@link groundingPackSchema} — Bridge 1, LinguaScrape → Insimul: a
 *    domain-filtered slice of the canonical corpus rendered as grounding
 *    entities + Prolog facts in Insimul's predicate vocabulary.
 *  - {@link canonicalWorldExportSchema} — Bridge 2, Insimul → LinguaScrape: an
 *    envelope carrying a {@link worldIrSchema WorldIR} + the world's Prolog KB
 *    for ingestion as a `synthetic`-tier corpus.
 *
 * Discipline (same as US-CE4): EXACT on the envelope keys, `contractVersion`,
 * `csid`, `provenance`, and `license`; PERMISSIVE (`z.unknown()` / passthrough)
 * on the deep sub-objects (entity `fields`, `licenseManifest`), tightened as the
 * bridge implementation lands (`tasks/ralph/linguascrape-bridge.json`).
 */

import { z } from 'zod';
import { worldIrSchema } from './world-ir.schema';

/**
 * Interchange contract version shared by both bridge legs. Bump when the
 * envelope shape changes in a way that requires coordinated LinguaScrape/Insimul
 * releases. Modelled as a literal so a fixture with a stale/absent
 * `contractVersion` is rejected outright.
 */
export const GROUNDING_CONTRACT_VERSION = 'insimul-grounding-v1';

/** A not-yet-tightened sub-object — permissive placeholder. */
const looseObject = z.object({}).passthrough();

/**
 * Where a grounding record came from. Exact on the identifying fields:
 * `source` and `confidence` are required; `sourceUrl`/`retrievedAt` are
 * optional (not every record has a canonical URL or retrieval timestamp).
 */
export const groundingProvenanceSchema = z
  .object({
    source: z.string().min(1),
    sourceUrl: z.string().optional(),
    retrievedAt: z.string().optional(),
    confidence: z.number(),
  })
  .passthrough();

/**
 * A single grounded entity. Exact on `csid` (the canonical stable id) and the
 * `provenance`/`license` seam that makes packs license-filterable; permissive on
 * `fields`, which vary by `entityType`.
 */
export const groundingEntitySchema = z
  .object({
    csid: z.string().min(1),
    entityType: z.string().min(1),
    fields: z.record(z.unknown()),
    provenance: groundingProvenanceSchema,
    /** SPDX license expression (e.g. `CC-BY-SA-4.0`). */
    license: z.string().min(1),
  })
  .passthrough();

/** Bridge 1 envelope: a grounding pack (LinguaScrape → Insimul). */
export const groundingPackSchema = z
  .object({
    contractVersion: z.literal(GROUNDING_CONTRACT_VERSION),
    packId: z.string().min(1),
    generatedAt: z.string(),
    source: z.literal('linguascrape'),
    domains: z.array(z.string()),
    entities: z.array(groundingEntitySchema),
    prologFacts: z.array(z.string()),
    licenseManifest: looseObject,
  })
  .passthrough();

/** Bridge 2 envelope: a world exported as canonical corpus (Insimul → LinguaScrape). */
export const canonicalWorldExportSchema = z
  .object({
    contractVersion: z.literal(GROUNDING_CONTRACT_VERSION),
    worldId: z.string().min(1),
    seed: z.string(),
    exportedAt: z.string(),
    predicateSchemaHash: z.string().min(1),
    ir: worldIrSchema,
    prologKb: z.string(),
    licenseNote: z.string(),
  })
  .passthrough();

export type GroundingProvenanceSchema = z.infer<typeof groundingProvenanceSchema>;
export type GroundingEntitySchema = z.infer<typeof groundingEntitySchema>;
export type GroundingPackSchema = z.infer<typeof groundingPackSchema>;
export type CanonicalWorldExportSchema = z.infer<typeof canonicalWorldExportSchema>;
