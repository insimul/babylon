#!/usr/bin/env node
// verify-gdscript/run.mjs — `npm run codegen:verify-gdscript`.
//
// Validates the COMMITTED generated GDScript. Prefers a real Godot syntax check
// (`godot --headless --check-only <file>`) when a `godot` binary is on PATH;
// otherwise falls back to the structural self-test in ../gdscript-verify.mjs
// (balanced brackets, tab indentation, class_name/from_dict/to_dict, all schema
// field keys present). Exit 0 = pass, non-zero = fail.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildMergedSchema } from '../build-merged-schema.mjs';
import { collectSchemaKeys, structuralCheck } from '../gdscript-verify.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..', '..');
const GEN_DIR = join('packages', 'godot', 'addons', 'insimul', 'generated');

const TARGETS = [
  { def: 'SaveFile', file: 'InsimulSaveFile.gd', className: 'InsimulSaveFile' },
  { def: 'SaveFileEnvelope', file: 'InsimulSaveFileEnvelope.gd', className: 'InsimulSaveFileEnvelope' },
  { def: 'WorldIR', file: 'InsimulWorldIR.gd', className: 'InsimulWorldIR' },
];

function godotOnPath() {
  try {
    execFileSync('godot', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function main() {
  const merged = buildMergedSchema();
  const haveGodot = godotOnPath();
  console.log(
    haveGodot
      ? 'codegen:verify-gdscript — using `godot --headless --check-only`'
      : 'codegen:verify-gdscript — no godot binary; using structural self-test',
  );

  let failed = false;
  for (const t of TARGETS) {
    const path = join(REPO_ROOT, GEN_DIR, t.file);
    if (haveGodot) {
      try {
        execFileSync('godot', ['--headless', '--check-only', path], { stdio: 'pipe' });
        console.log(`  OK (godot)  ${t.file}`);
      } catch (err) {
        failed = true;
        console.error(`  FAIL (godot)  ${t.file}\n${err.stdout ?? ''}${err.stderr ?? ''}`);
      }
      continue;
    }
    const source = readFileSync(path, 'utf8');
    const jsonKeys = [...collectSchemaKeys(merged.definitions[t.def])];
    const { ok, errors } = structuralCheck(source, { className: t.className, jsonKeys });
    if (ok) {
      console.log(`  OK (structural)  ${t.file}  (${jsonKeys.length} schema keys present)`);
    } else {
      failed = true;
      console.error(`  FAIL  ${t.file}:\n    - ${errors.join('\n    - ')}`);
    }
  }

  if (failed) {
    console.error('codegen:verify-gdscript: FAILED');
    process.exit(1);
  }
  console.log('codegen:verify-gdscript: OK');
}

main();
