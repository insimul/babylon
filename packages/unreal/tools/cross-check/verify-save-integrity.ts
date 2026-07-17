/**
 * US-XC2 — TS cross-check script for a C++-produced save envelope.
 *
 * Reads a save-export Envelope JSON (default: the committed C++-produced
 * envelope) and verifies, using the TypeScript semantics authority:
 *   1. envelope shape + SHA-256 integrity (validateSaveFileEnvelope), and
 *   2. the wrapped SaveFile against save-file.schema (saveFileSchema).
 *
 * This is the human-runnable form of the parity gate that
 * `packages/core/src/conformance/__tests__/save-integrity-crosscheck.test.ts`
 * enforces in CI. A passing run proves the C++ canonical-JSON + SHA-256
 * implementation is byte-identical to the TS one.
 *
 * Run (from the repo root or anywhere) with vite-node:
 *
 *   npx vite-node packages/unreal/tools/cross-check/verify-save-integrity.ts \
 *     [path/to/envelope.json]
 *
 * Exits 0 on success, 1 on any validation failure.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateSaveFileEnvelope } from '../../../core/src/save-envelope';
import { saveFileSchema } from '../../../core/src/schemas';

const here = dirname(fileURLToPath(import.meta.url));
const target = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : join(here, 'cpp-produced.envelope.json');

function fail(message: string): never {
  console.error(`✗ ${message}`);
  process.exit(1);
}

let candidate: unknown;
try {
  candidate = JSON.parse(readFileSync(target, 'utf8'));
} catch (err) {
  fail(`could not read/parse ${target}: ${(err as Error).message}`);
}

const result = validateSaveFileEnvelope(candidate);
if (!result.ok) {
  fail(`envelope invalid (${result.error.code}): ${result.error.message}`);
}
console.log(`✓ envelope integrity + format OK (${result.envelope.format})`);

const parsed = saveFileSchema.safeParse(result.envelope.saveFile);
if (!parsed.success) {
  fail(`saveFile failed save-file.schema: ${parsed.error.message}`);
}
console.log(`✓ saveFile matches save-file.schema (version ${parsed.data.version})`);
console.log(`✓ ${target} verified — C++ save is portable to the TS runtime`);
process.exit(0);
