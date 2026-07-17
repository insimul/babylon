#!/usr/bin/env node
// tools/codegen/index.mjs — cross-language DTO codegen entrypoint (`npm run codegen`).
//
// Reads packages/core/schemas/*.schema.json and emits native DTOs into the engine
// packages. Generated code is COMMITTED (engines can't run npm); a vitest drift
// guard (tools/codegen/__tests__/codegen-drift.test.ts) regenerates into a temp
// dir and diffs against the committed output.
//
// Usage:
//   node tools/codegen/index.mjs              # write into the real package tree
//   node tools/codegen/index.mjs --out <dir>  # write into <dir> (used by the drift guard)
//
// Each generator is `(baseDir) => string[]` returning the relative paths it wrote.
// Add C++ (US-CG2) and GDScript (US-CG3) generators to GENERATORS as they land.

import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { emitCSharp } from './emit-csharp.mjs';
import { emitCpp } from './emit-cpp.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

export const GENERATORS = [
  { name: 'csharp', emit: emitCSharp },
  { name: 'cpp', emit: emitCpp },
];

/** Run every generator, writing under `baseDir`. Returns the flat list of paths. */
export function runCodegen(baseDir) {
  const written = [];
  for (const gen of GENERATORS) {
    written.push(...gen.emit(baseDir));
  }
  return written;
}

function parseOutDir(argv) {
  const i = argv.indexOf('--out');
  if (i !== -1 && argv[i + 1]) return resolve(argv[i + 1]);
  return REPO_ROOT;
}

// Run when invoked directly (not when imported by the drift guard).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const baseDir = parseOutDir(process.argv.slice(2));
  const written = runCodegen(baseDir);
  for (const p of written) console.log(`  generated ${p}`);
  console.log(`codegen: ${written.length} file(s) written under ${baseDir}`);
}
