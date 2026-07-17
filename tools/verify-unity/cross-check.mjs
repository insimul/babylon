#!/usr/bin/env vite-node
// cross-check.mjs — THE PORTABILITY TEST, node side (US-UC2).
//
// The Unity runtime ports the save-envelope contract (canonical JSON + SHA-256
// integrity) and the migration chain into C#
// (packages/unity/Runtime/Save/{InsimulSaveSystem,JsonVal}.cs). This script is
// the node half of the cross-check: it recomputes the golden integrity vectors
// from the AUTHORITATIVE TypeScript implementation (canonicalJSONStringify /
// computeSaveFileIntegrity in packages/core/src/save-envelope.ts) so the C#
// side — which asserts the SAME vectors in tools/verify-unity (Program.cs) —
// can never silently disagree on the canonical bytes.
//
//   1. Recompute computeSaveFileIntegrity(fixture) and assert == the committed
//      vector in conformance/saves/integrity-vectors.json.
//   2. Validate each golden fixture against saveFileSchema (zod, shape).
//   3. If a C#-produced envelope exists (default
//      tools/verify-unity/cross-check/csharp-produced.envelope.json, override
//      with INSIMUL_UNITY_ENVELOPE), validate it via validateSaveFileEnvelope
//      (integrity + format) AND the zod schemas — proving a Unity-WRITTEN save
//      round-trips through the TS contract. Absent (no .NET SDK on this box) =>
//      that leg is reported PENDING; tools/verify-unity/run.sh writes it on a
//      .NET machine and re-runs this script (autoMerge is off for this branch).
//
// Must be run with vite-node (it imports .ts): `npx vite-node tools/verify-unity/cross-check.mjs`.
// Exit 0 = all checks that could run passed.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeSaveFileIntegrity, validateSaveFileEnvelope } from '../../packages/core/src/save-envelope.ts';
import { saveEnvelopeSchema, saveFileSchema } from '../../packages/core/src/schemas/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const savesDir = join(here, '..', '..', 'packages', 'core', 'conformance', 'saves');
const FIXTURES = ['v1-minimal.json', 'v2-typical.json', 'v2-with-extensions.json'];

let failed = 0;
let pending = 0;

function ok(name) {
  console.log(`  PASS  ${name}`);
}
function bad(name, detail) {
  failed++;
  console.log(`  FAIL  ${name}\n        ${detail}`);
}
function skip(name, detail) {
  pending++;
  console.log(`  PEND  ${name}\n        ${detail}`);
}

// ── 1 + 2: golden vectors + schema ─────────────────────────────────────────

console.log('\n=== Golden integrity vectors (TS ⇄ C# parity anchor) ===');
const vectors = JSON.parse(readFileSync(join(savesDir, 'integrity-vectors.json'), 'utf8')).vectors;

for (const name of FIXTURES) {
  const fixture = JSON.parse(readFileSync(join(savesDir, name), 'utf8'));
  const expected = vectors[name];
  if (!/^[0-9a-f]{64}$/.test(expected ?? '')) {
    bad(`${name} vector present`, `missing/invalid vector for ${name}`);
    continue;
  }
  const actual = computeSaveFileIntegrity(fixture);
  if (actual === expected) ok(`${name} integrity == committed vector`);
  else bad(`${name} integrity`, `expected ${expected}, got ${actual}`);

  try {
    saveFileSchema.parse(fixture);
    ok(`${name} validates against saveFileSchema`);
  } catch (e) {
    bad(`${name} schema`, String(e?.message ?? e));
  }
}

const vectorKeys = Object.keys(vectors).sort();
if (JSON.stringify(vectorKeys) === JSON.stringify([...FIXTURES].sort()))
  ok('vectors cover exactly the shipped fixtures');
else bad('vector coverage', `vectors=${vectorKeys} fixtures=${FIXTURES}`);

// ── 3: C#-produced envelope (THE PORTABILITY TEST) ──────────────────────────

console.log('\n=== C#-produced envelope round-trips through TS ===');
const envPath =
  process.env.INSIMUL_UNITY_ENVELOPE ||
  join(here, 'cross-check', 'csharp-produced.envelope.json');

if (!existsSync(envPath)) {
  skip(
    'C#-produced envelope validates',
    `no envelope at ${envPath} — run tools/verify-unity/run.sh on a .NET SDK box to write it, then re-run this script.`,
  );
} else {
  const envelope = JSON.parse(readFileSync(envPath, 'utf8'));

  const result = validateSaveFileEnvelope(envelope);
  if (result.ok) ok('envelope integrity + format verify (canonical bytes == TS)');
  else bad('envelope validate', result.error.message);

  try {
    saveEnvelopeSchema.parse(envelope);
    ok('envelope matches saveEnvelopeSchema');
  } catch (e) {
    bad('envelope schema', String(e?.message ?? e));
  }

  try {
    const parsed = saveFileSchema.parse(envelope.saveFile);
    if (parsed.version === 3) ok('envelope.saveFile validates and is migrated to v3');
    else bad('envelope.saveFile version', `expected v3, got v${parsed.version}`);
  } catch (e) {
    bad('envelope.saveFile schema', String(e?.message ?? e));
  }
}

// ── Report ──────────────────────────────────────────────────────────────────

console.log(`\n${failed === 0 ? 'OK' : 'FAILED'} — ${failed} failed, ${pending} pending`);
process.exit(failed === 0 ? 0 : 1);
