#!/usr/bin/env node
// Native-tree static syntax gate orchestrator (US-EP3).
//
// Runs all three per-engine structural gates (Unity C#, Godot GDScript,
// Unreal C++) and aggregates the result so a failure in one still reports the
// others. Wired into `npm run engines:check`.
//
// These are STRUCTURAL gates (no engine editors / SDKs in this harness) —
// see tools/README.md for exactly what each does and does not catch.

import { run as runUnity } from './verify-unity/check.mjs';
import { run as runGodot } from './verify-godot/check.mjs';
import { run as runUnreal } from './verify-unreal/check.mjs';
import { printGate } from './lib/run-gate.mjs';

const results = [runUnity(), runGodot(), runUnreal()];

console.log('Native engine static syntax gates (structural — see tools/README.md)\n');
for (const res of results) printGate(res);

const failed = results.filter((r) => !r.ok);
const total = results.reduce((n, r) => n + r.scanned, 0);
console.log('');
if (failed.length) {
  console.log(`FAIL: ${failed.length}/${results.length} gate(s) reported structural errors (${total} files scanned).`);
  process.exit(1);
}
console.log(`OK: all ${results.length} gates green (${total} files scanned).`);
