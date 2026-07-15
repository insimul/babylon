/**
 * Single source of truth for JSON Schema emission (US-CE4).
 *
 * Both the CLI emitter (`emit-schemas.ts`, run by `npm run schemas`) and the
 * drift-guard test import `buildJsonSchemas()` so the committed
 * `packages/core/schemas/*.schema.json` files are compared against the SAME
 * conversion the emitter produces — no chance of the guard and the generator
 * disagreeing on options.
 *
 * Lives under `scripts/` (not `src/`) on purpose: `zod-to-json-schema` is a
 * dev-only dependency and must not leak into `@insimul/core`'s public type
 * surface or the root `npm run check` (which only compiles `src/**`).
 */

import type { ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { saveFileSchema } from '../src/schemas/save-file.schema';
import { saveEnvelopeSchema } from '../src/schemas/save-envelope.schema';
import { worldIrSchema } from '../src/schemas/world-ir.schema';
import {
  groundingPackSchema,
  canonicalWorldExportSchema,
} from '../src/schemas/grounding.schema';

export interface SchemaEntry {
  /** Output filename under packages/core/schemas/. */
  file: string;
  /** JSON Schema `$ref`/title name (also used as the definition key). */
  name: string;
  schema: ZodTypeAny;
}

/** Every transport shape emitted to a JSON Schema file, in stable order. */
export const SCHEMA_ENTRIES: SchemaEntry[] = [
  { file: 'save-file.schema.json', name: 'SaveFile', schema: saveFileSchema },
  { file: 'save-envelope.schema.json', name: 'SaveFileEnvelope', schema: saveEnvelopeSchema },
  { file: 'world-ir.schema.json', name: 'WorldIR', schema: worldIrSchema },
  { file: 'grounding-pack.schema.json', name: 'GroundingPack', schema: groundingPackSchema },
  {
    file: 'canonical-world-export.schema.json',
    name: 'CanonicalWorldExport',
    schema: canonicalWorldExportSchema,
  },
];

/** Convert one entry to a JSON Schema object using the canonical options. */
export function toJsonSchema(entry: SchemaEntry): unknown {
  return zodToJsonSchema(entry.schema, {
    name: entry.name,
    $refStrategy: 'none',
    target: 'jsonSchema7',
  });
}

/** Map of output filename -> emitted JSON Schema object for all entries. */
export function buildJsonSchemas(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const entry of SCHEMA_ENTRIES) {
    out[entry.file] = toJsonSchema(entry);
  }
  return out;
}

/** Canonical serialization used for both writing files and drift comparison. */
export function serializeSchema(schema: unknown): string {
  return `${JSON.stringify(schema, null, 2)}\n`;
}
