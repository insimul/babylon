/**
 * Zod schemas for the Pinakes bridge seam (US-CE7, renamed in US-4).
 *
 * Pinakes is the canonical-knowledge authority on the far side of this bridge
 * (it carried a different working name when the seam was drafted).
 * US-4 is a RENAME of this already-built seam, not a rebuild — every exported
 * name is unchanged, only the producer's identity moved onto the KINP namespace
 * {@link PINAKES_NAMESPACE} (`koine/specs/identity.md` §3.4, the same atom
 * `identity/kinp.ts` mints `pinakes:ent:<canonical>` under).
 *
 * These are SCHEMA STUBS reserving the interchange contract — no import/export
 * logic lives here. The two shapes mirror the two bridge legs:
 *
 *  - {@link groundingPackSchema} — Bridge 1, Pinakes → Insimul: a
 *    domain-filtered slice of the canonical corpus rendered as grounding
 *    entities + Prolog facts in Insimul's predicate vocabulary.
 *  - {@link canonicalWorldExportSchema} — Bridge 2, Insimul → Pinakes: an
 *    envelope carrying a {@link worldIrSchema WorldIR} + the world's Prolog KB
 *    for ingestion as a `synthetic`-tier corpus.
 *
 * Discipline (same as US-CE4): EXACT on the envelope keys, `contractVersion`,
 * `csid`, `provenance`, and `license`; PERMISSIVE (`z.unknown()` / passthrough)
 * on the deep sub-objects (entity `fields`, `licenseManifest`), tightened as the
 * bridge implementation lands.
 *
 * **These envelopes are NOT yet the ratified KGP pack shape.** The Koine
 * Grounding-Pack Protocol (`koine/specs/grounding-pack.md` §2, spec 0.4.0) names
 * the producer `producer` and carries `kgp_version` / `pack_id` / `worlds` /
 * `kind` / `dialect` / `assertions` / `links` / `manifest`. Reconciling the two
 * is a cross-project decision that core cannot make alone; the open questions are
 * recorded in `packages/core/docs/kgp-alignment-open-questions.md` and belong to
 * the platform-side KGP alignment story, so nothing here is guessed at.
 */

import { z } from 'zod';
import { PINAKES_NAMESPACE } from '../identity/kinp';
import { worldIrSchema } from './world-ir.schema';

/**
 * Interchange contract version shared by both bridge legs. Bump when the
 * envelope shape changes in a way that requires coordinated Pinakes/Insimul
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

/**
 * Bridge 1 envelope: a grounding pack (Pinakes → Insimul).
 *
 * `source` is the producing project's KINP namespace, so it is the shared
 * {@link PINAKES_NAMESPACE} constant rather than a second string literal — a
 * rename of the namespace can never leave the schema behind. (KGP §2 spells the
 * same field `producer`; see the module header for why that is not changed here.)
 */
export const groundingPackSchema = z
  .object({
    contractVersion: z.literal(GROUNDING_CONTRACT_VERSION),
    packId: z.string().min(1),
    generatedAt: z.string(),
    source: z.literal(PINAKES_NAMESPACE),
    domains: z.array(z.string()),
    entities: z.array(groundingEntitySchema),
    prologFacts: z.array(z.string()),
    licenseManifest: looseObject,
  })
  .passthrough();

/** Bridge 2 envelope: a world exported as canonical corpus (Insimul → Pinakes). */
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
