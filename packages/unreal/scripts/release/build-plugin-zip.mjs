#!/usr/bin/env node
// Unreal FAB / Marketplace plugin release DRY-RUN (US-EP4).
//
// Stages the plugin into `dist/Insimul/` in the exact layout Epic's FAB /
// Marketplace submission expects (the .uplugin at the plugin-folder root, plus
// Source/), zips it to `dist/Insimul-<version>.zip`, and asserts the file set.
// The game-template tree (templates/) and any build intermediates are excluded —
// those are never part of a distributable plugin.
//
// This DOES NOT publish. Standalone (Node + zip only, no repo-root deps) so it
// moves verbatim into the future insimul-unreal split repo. Run:
//   node scripts/release/build-plugin-zip.mjs

import { readFileSync, rmSync, mkdirSync, cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const PKG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = join(PKG_DIR, 'dist');
const PLUGIN_NAME = 'Insimul';
const STAGE = join(DIST, PLUGIN_NAME);

const version = readFileSync(join(PKG_DIR, 'VERSION'), 'utf8').trim();

// Top-level members copied verbatim into the staged plugin folder.
const INCLUDE = ['Insimul.uplugin', 'Source', 'README.md', 'CHANGELOG.md', 'VERSION'];
// Anything a Marketplace plugin must never carry.
const FORBIDDEN_DIRS = ['templates', 'Binaries', 'Intermediate', 'dist', '.git', 'node_modules'];

function fail(msg) {
  console.error(`  FAIL ${msg}`);
  return 1;
}
function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) out.push(...walk(abs));
    else out.push(abs);
  }
  return out;
}

console.log(`unreal FAB dry-run: staging ${PLUGIN_NAME} plugin v${version}\n`);

rmSync(DIST, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });

for (const member of INCLUDE) {
  const src = join(PKG_DIR, member);
  if (!existsSync(src)) {
    console.error(`\nunreal release:dry-run FAILED: missing source member ${member}`);
    process.exit(1);
  }
  cpSync(src, join(STAGE, member), { recursive: true });
}

const staged = walk(STAGE).map((p) => relative(STAGE, p).split('\\').join('/')).sort();

let problems = 0;
// Required layout.
const required = ['Insimul.uplugin', 'Source/InsimulRuntime/InsimulRuntime.Build.cs'];
for (const req of required) {
  if (!staged.includes(req)) problems += fail(`staged plugin missing required file: ${req}`);
}
// Every committed Source file must be present.
const srcFiles = walk(join(PKG_DIR, 'Source')).map((p) => relative(PKG_DIR, p).split('\\').join('/'));
for (const f of srcFiles) {
  if (!staged.includes(f)) problems += fail(`staged plugin missing Source file: ${f}`);
}
// Nothing forbidden leaked in.
for (const f of staged) {
  const top = f.split('/')[0];
  if (FORBIDDEN_DIRS.includes(top)) problems += fail(`staged plugin contains forbidden entry: ${f}`);
}
// The .uplugin VersionName must match VERSION (the tag we would cut).
const uplugin = JSON.parse(readFileSync(join(STAGE, 'Insimul.uplugin'), 'utf8'));
if (uplugin.VersionName !== version) {
  problems += fail(`Insimul.uplugin VersionName "${uplugin.VersionName}" != VERSION "${version}"`);
}

// Build the zip artifact (zip root = the plugin folder, per Marketplace layout).
const zipName = `${PLUGIN_NAME}-${version}.zip`;
execFileSync('zip', ['-r', '-q', zipName, PLUGIN_NAME], { cwd: DIST, stdio: 'inherit' });

const headers = staged.filter((f) => f.endsWith('.h')).length;
const cpps = staged.filter((f) => f.endsWith('.cpp')).length;
console.log(`  staged: dist/${PLUGIN_NAME}/ (${staged.length} files — ${headers} headers, ${cpps} .cpp)`);
console.log(`  zip:    dist/${zipName}`);

if (problems) {
  console.error(`\nunreal release:dry-run FAILED — ${problems} layout problem(s).`);
  process.exit(1);
}

console.log(`
unreal release:dry-run OK — FAB/Marketplace plugin layout valid.

FAB / Marketplace readiness checklist (manual — this script does NOT publish):
  [ ] version ${version} synced in VERSIONS.json / VERSION / Insimul.uplugin (npm run engines:manifests)
  [ ] IsBetaVersion cleared and EngineVersion set for the target UE version before submission
  [ ] plugin compiles clean in a host project for each supported UE version (editor-only, out of this harness)
  [ ] dist/${zipName} uploaded to the FAB / Marketplace seller portal from a clean, tagged checkout
`);
