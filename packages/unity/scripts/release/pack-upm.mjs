#!/usr/bin/env node
// Unity UPM release DRY-RUN (US-EP4).
//
// Produces the UPM package tarball via `npm pack` and asserts its layout matches
// what OpenUPM / the Unity Package Manager expect from `com.insimul.sdk`:
//   - the SDK sources (Runtime/, Editor/, Samples~/) + package.json + docs ship,
//   - the game-template tree (templates/) does NOT ship (that is a separate,
//     export-pipeline artifact published from the root @insimul/runtime package).
//
// This DOES NOT publish. It only builds `dist/<tarball>.tgz` and validates it.
//
// Standalone (no repo-root deps) so it moves verbatim into the future
// insimul-unity split repo. Node + npm + tar only. Run:
//   node scripts/release/pack-upm.mjs   (or: npm run --workspace=com.insimul.sdk release:dry-run)

import { readFileSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PKG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(PKG_DIR, 'dist');

const pkg = JSON.parse(readFileSync(join(PKG_DIR, 'package.json'), 'utf8'));

// Files that MUST appear in the tarball (paths relative to the package root).
const REQUIRED = [
  'package.json',
  'README.md',
  'CHANGELOG.md',
  'Runtime/Insimul.Runtime.asmdef',
  'Editor/Insimul.Editor.asmdef',
  'Samples~/BasicConversation/README.md',
];
// Path prefixes that must NOT appear (game template tree, VCS, build junk).
const FORBIDDEN_PREFIXES = ['templates/', '.git', 'node_modules/', 'dist/'];

function fail(msg) {
  console.error(`  FAIL ${msg}`);
  return 1;
}

console.log(`unity UPM dry-run: packing ${pkg.name}@${pkg.version}\n`);

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// `npm pack` writes the tarball into dist/ and prints its name.
execFileSync('npm', ['pack', '--pack-destination', 'dist'], { cwd: PKG_DIR, stdio: 'inherit' });

const tgz = readdirSync(DIST).find((f) => f.endsWith('.tgz'));
if (!tgz) {
  console.error('\nunity release:dry-run FAILED: npm pack produced no .tgz');
  process.exit(1);
}
const tarball = join(DIST, tgz);

// UPM/npm tarballs prefix every entry with `package/`. Strip it for layout checks.
const entries = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' })
  .split('\n')
  .map((l) => l.trim())
  .filter(Boolean)
  .filter((l) => !l.endsWith('/')) // drop dir entries
  .map((l) => (l.startsWith('package/') ? l.slice('package/'.length) : l));

let problems = 0;
for (const req of REQUIRED) {
  if (!entries.includes(req)) problems += fail(`tarball is missing required file: ${req}`);
}
for (const e of entries) {
  for (const bad of FORBIDDEN_PREFIXES) {
    if (e.startsWith(bad)) problems += fail(`tarball contains forbidden entry: ${e} (prefix "${bad}")`);
  }
}
// The tarball version must match the manifest (the OpenUPM tag it will publish).
if (!tgz.includes(pkg.version)) {
  problems += fail(`tarball name "${tgz}" does not carry version ${pkg.version}`);
}

const runtimeCs = entries.filter((e) => e.startsWith('Runtime/') && e.endsWith('.cs'));
if (runtimeCs.length === 0) problems += fail('tarball ships no Runtime/*.cs sources');

console.log(`\n  tarball: dist/${tgz} (${entries.length} files)`);
console.log(`  Runtime C# sources: ${runtimeCs.length}`);

if (problems) {
  console.error(`\nunity release:dry-run FAILED — ${problems} layout problem(s).`);
  process.exit(1);
}

console.log(`
unity release:dry-run OK — UPM tarball layout valid.

OpenUPM readiness checklist (manual publish steps — this script does NOT publish):
  [ ] version ${pkg.version} bumped in VERSIONS.json + CHANGELOG.md dated (npm run engines:manifests)
  [ ] git tag published for the version OpenUPM watches (e.g. unity-v${pkg.version})
  [ ] OpenUPM package config points at packages/unity with the above tag pattern
  [ ] .meta files for Samples~ regenerated in a real Unity project before tagging
  [ ] 'npm publish dist/${tgz}' (or OpenUPM CI) run from a clean, tagged checkout
`);
