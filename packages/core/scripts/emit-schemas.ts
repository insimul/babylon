/**
 * CLI: regenerate packages/core/schemas/*.schema.json from the zod schemas.
 * Run via `npm run schemas` (vite-node). Idempotent — the drift-guard test
 * fails if the committed files differ from what this produces.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA_ENTRIES, serializeSchema, toJsonSchema } from './schema-manifest';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'schemas');

mkdirSync(outDir, { recursive: true });

for (const entry of SCHEMA_ENTRIES) {
  const path = join(outDir, entry.file);
  writeFileSync(path, serializeSchema(toJsonSchema(entry)), 'utf8');
  // eslint-disable-next-line no-console
  console.log(`emitted ${entry.file}`);
}
