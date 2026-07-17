#!/usr/bin/env node
// Native engine release DRY-RUN orchestrator (US-EP4).
//
// Runs each engine package's standalone release:dry-run script (unity UPM `npm
// pack`, unreal FAB/Marketplace zip, godot Asset Library zip), aggregating the
// result so one failing gate still reports the others. Nothing is published —
// each script only builds + validates an artifact under packages/<engine>/dist/.
// Wired into `npm run engines:release`.
//
// The per-package scripts are deliberately self-contained (no repo-root deps) so
// they move verbatim into the future split repos; this orchestrator is a
// runtime-repo convenience that just invokes them.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const GATES = [
  { engine: 'unity', script: 'packages/unity/scripts/release/pack-upm.mjs' },
  { engine: 'unreal', script: 'packages/unreal/scripts/release/build-plugin-zip.mjs' },
  { engine: 'godot', script: 'packages/godot/scripts/release/build-assetlib-zip.mjs' },
];

console.log('Native engine release dry-run (builds + validates artifacts; does NOT publish)\n');

const failed = [];
for (const { engine, script } of GATES) {
  console.log(`\n=== ${engine} ===`);
  try {
    execFileSync('node', [join(REPO_ROOT, script)], { cwd: REPO_ROOT, stdio: 'inherit' });
  } catch {
    failed.push(engine);
  }
}

console.log('');
if (failed.length) {
  console.error(`engines:release FAILED — ${failed.length}/${GATES.length} gate(s): ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`engines:release OK — all ${GATES.length} release dry-runs produced valid artifacts.`);
