// build-merged-schema.mjs — assemble the three @insimul/core JSON Schemas
// (save-file, save-envelope, world-ir) into ONE JSON Schema document with a
// wrapper root, so quicktype can emit a single, de-duplicated output file per
// target language.
//
// Why one merged document (see tools/codegen/README.md for the full rationale):
//   - quicktype emits shared helper types (a `Converter`, `Serialize`, the
//     date/enum JsonConverters) once per output file. Emitting each schema to
//     its own file in the same namespace would DUPLICATE those helpers and fail
//     to compile.
//   - Passing the three schema files as separate sources makes quicktype
//     disambiguate the structurally-identical `SaveFile` tree (once standalone,
//     once inline in the envelope) into parallel `PurpleWorld`/`FluffyWorld`
//     class trees — ugly and drift-prone.
//   - A single document with `$ref`s dedupes: the envelope's `saveFile` property
//     is rewritten to reference the shared `SaveFile` definition, so one
//     `SaveFile` (+ `CurrentState`, `WorldSnapshot`, …) class serves both.
//
// The wrapper root type (`ROOT_TYPE_NAME`) simply references all three top-level
// schemas so every one of them is reachable and therefore emitted; it is an
// inert "bundle" holder, documented in the generated README.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const SCHEMA_DIR = join(REPO_ROOT, 'packages', 'core', 'schemas');

/** The wrapper root type name quicktype uses as the single top-level. */
export const ROOT_TYPE_NAME = 'InsimulSchemas';

/** The three core schemas this pipeline mirrors into native DTOs. */
export const SOURCE_SCHEMAS = [
  { file: 'save-file.schema.json', def: 'SaveFile' },
  { file: 'save-envelope.schema.json', def: 'SaveFileEnvelope' },
  { file: 'world-ir.schema.json', def: 'WorldIR' },
];

function readSchema(file) {
  return JSON.parse(readFileSync(join(SCHEMA_DIR, file), 'utf8'));
}

/**
 * Build the merged JSON Schema document (a plain object, ready to JSON.stringify).
 * Deterministic: pure function of the committed core schemas.
 */
export function buildMergedSchema() {
  const saveFile = readSchema('save-file.schema.json');
  const envelope = readSchema('save-envelope.schema.json');
  const worldIr = readSchema('world-ir.schema.json');

  // Rewrite the envelope's inline saveFile to reference the shared definition so
  // quicktype emits ONE SaveFile class instead of a duplicated parallel tree.
  const envelopeDef = structuredClone(envelope.definitions.SaveFileEnvelope);
  envelopeDef.properties.saveFile = { $ref: '#/definitions/SaveFile' };

  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $ref: `#/definitions/${ROOT_TYPE_NAME}`,
    definitions: {
      [ROOT_TYPE_NAME]: {
        type: 'object',
        properties: {
          saveFile: { $ref: '#/definitions/SaveFile' },
          saveFileEnvelope: { $ref: '#/definitions/SaveFileEnvelope' },
          worldIR: { $ref: '#/definitions/WorldIR' },
        },
        required: ['saveFile', 'saveFileEnvelope', 'worldIR'],
        additionalProperties: false,
      },
      SaveFile: saveFile.definitions.SaveFile,
      SaveFileEnvelope: envelopeDef,
      WorldIR: worldIr.definitions.WorldIR,
    },
  };
}
