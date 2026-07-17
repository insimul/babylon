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
import { run as runUnrealConformance } from './verify-unreal/conformance.mjs';
import { printGate } from './lib/run-gate.mjs';

const results = [runUnity(), runGodot(), runUnreal()];

console.log('Native engine static syntax gates (structural — see tools/README.md)\n');
for (const res of results) printGate(res);

// US-XP2: run the Unreal host conformance corpus (C++ InsimulKB vs the golden
// Prolog cases) when unreal sources changed AND a built libinsimul + cmake are
// available. It SKIPs cleanly otherwise so this gate never fails for want of the
// native toolchain (structural gates above are the always-on coverage).
console.log('\nUnreal host conformance (US-XP2 — real Prolog via libinsimul)\n');
const conf = runUnrealConformance();
if (conf.skipped) {
  console.log(`  ↷ ${conf.name}: SKIP (${conf.reason})`);
} else if (conf.ok) {
  console.log(`  ✓ ${conf.name}: host corpus green`);
} else {
  console.log(`  ✗ ${conf.name}: host corpus FAILED`);
  if (conf.output) console.log(conf.output);
}

const gates = [...results, conf];
const failed = gates.filter((r) => !r.ok);
const total = results.reduce((n, r) => n + r.scanned, 0);
console.log('');
if (failed.length) {
  console.log(`FAIL: ${failed.length}/${gates.length} gate(s) reported errors (${total} files scanned).`);
  process.exit(1);
}
console.log(`OK: all ${gates.length} gates green (${total} files scanned).`);
