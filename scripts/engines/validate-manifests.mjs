#!/usr/bin/env node
// Validate the native engine packages' release manifests (US-EP1).
//
// Enforces that every per-engine manifest parses, carries its required release
// fields, and agrees with the single version source `VERSIONS.json`. Also checks
// each package ships a seeded CHANGELOG.md. Exits non-zero on any failure so it
// can gate `npm run engines:manifests` (and, later, engines:check / CI).
//
// No third-party deps: plugin.cfg (INI) is parsed by a tiny local parser.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const errors = [];
const oks = [];
const fail = (msg) => errors.push(msg);
const pass = (msg) => oks.push(msg);

function readText(rel) {
  const p = join(REPO_ROOT, rel);
  if (!existsSync(p)) throw new Error(`missing file: ${rel}`);
  return readFileSync(p, 'utf8');
}

function readJson(rel) {
  const txt = readText(rel);
  try {
    return JSON.parse(txt);
  } catch (e) {
    throw new Error(`invalid JSON in ${rel}: ${e.message}`);
  }
}

// Minimal INI parser sufficient for Godot's plugin.cfg (key="value" pairs under
// [section] headers). Strips surrounding double-quotes from values.
function parseIni(txt, rel) {
  const out = {};
  let section = null;
  txt.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) return;
    const sec = line.match(/^\[(.+)\]$/);
    if (sec) {
      section = sec[1];
      out[section] = out[section] || {};
      return;
    }
    const kv = line.match(/^([^=]+)=(.*)$/);
    if (!kv) throw new Error(`unparseable INI line ${i + 1} in ${rel}: "${raw}"`);
    if (section === null) throw new Error(`INI key outside any section in ${rel}: "${raw}"`);
    let val = kv[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    out[section][kv[1].trim()] = val;
  });
  return out;
}

function requireFields(obj, fields, label) {
  for (const f of fields) {
    const v = obj[f];
    const missing = v === undefined || v === null || v === '' ||
      (Array.isArray(v) && v.length === 0);
    if (missing) fail(`${label}: required field "${f}" is missing or empty`);
  }
}

function checkVersionMatch(actual, expected, label) {
  if (actual === expected) pass(`${label}: version ${actual} matches VERSIONS.json`);
  else fail(`${label}: version "${actual}" != VERSIONS.json "${expected}"`);
}

function checkChangelog(pkgDir, label) {
  const rel = `${pkgDir}/CHANGELOG.md`;
  if (existsSync(join(REPO_ROOT, rel)) && readText(rel).trim().length > 0) {
    pass(`${label}: CHANGELOG.md present`);
  } else {
    fail(`${label}: CHANGELOG.md missing or empty (${rel})`);
  }
}

// --- Load the single version source ------------------------------------------
let versions;
try {
  versions = readJson('VERSIONS.json');
} catch (e) {
  console.error(`FATAL: ${e.message}`);
  process.exit(1);
}
for (const eng of ['unity', 'unreal', 'godot']) {
  if (typeof versions[eng] !== 'string' || !versions[eng]) {
    fail(`VERSIONS.json: missing/invalid "${eng}" version`);
  }
}

// --- Unity (UPM package.json) -------------------------------------------------
try {
  const label = 'unity';
  const pkg = readJson('packages/unity/package.json');
  requireFields(pkg, ['name', 'version', 'displayName', 'description', 'unity', 'author', 'license'], label);
  if (pkg.name !== 'com.insimul.sdk') fail(`${label}: name must be "com.insimul.sdk" (got "${pkg.name}")`);
  if (pkg.dependencies === undefined) fail(`${label}: "dependencies" block must be declared (may be empty)`);
  if (!Array.isArray(pkg.samples) || pkg.samples.length === 0) fail(`${label}: at least one sample must be declared`);
  checkVersionMatch(pkg.version, versions.unity, label);
  checkChangelog('packages/unity', label);
} catch (e) {
  fail(`unity: ${e.message}`);
}

// --- Unreal (Insimul.uplugin + VERSION) --------------------------------------
try {
  const label = 'unreal';
  const uplugin = readJson('packages/unreal/Insimul.uplugin');
  requireFields(uplugin, ['FileVersion', 'Version', 'VersionName', 'FriendlyName', 'Description', 'Modules'], label);
  if (!Array.isArray(uplugin.Modules) || uplugin.Modules.length === 0) {
    fail(`${label}: Insimul.uplugin must declare at least one module`);
  } else {
    const runtime = uplugin.Modules.find((m) => m && m.Name === 'InsimulRuntime');
    if (!runtime) fail(`${label}: Modules must include the "InsimulRuntime" runtime module`);
    else if (runtime.Type !== 'Runtime') fail(`${label}: InsimulRuntime module Type must be "Runtime" (got "${runtime.Type}")`);
    // Any declared module must reference existing Source (UBT fails otherwise).
    for (const m of uplugin.Modules) {
      if (m && m.Name && !existsSync(join(REPO_ROOT, 'packages/unreal/Source', m.Name))) {
        fail(`${label}: module "${m.Name}" declared in Insimul.uplugin has no Source/${m.Name} dir (would break UBT packaging)`);
      }
    }
  }
  const versionFile = readText('packages/unreal/VERSION').trim();
  checkVersionMatch(uplugin.VersionName, versions.unreal, `${label} (uplugin VersionName)`);
  checkVersionMatch(versionFile, versions.unreal, `${label} (VERSION file)`);
  if (uplugin.VersionName !== versionFile) {
    fail(`${label}: uplugin VersionName "${uplugin.VersionName}" != VERSION file "${versionFile}"`);
  }
  checkChangelog('packages/unreal', label);
} catch (e) {
  fail(`unreal: ${e.message}`);
}

// --- Godot (plugin.cfg + asset-lib.json) -------------------------------------
try {
  const label = 'godot';
  const ini = parseIni(readText('packages/godot/addons/insimul/plugin.cfg'), 'packages/godot/addons/insimul/plugin.cfg');
  const plugin = ini.plugin || {};
  requireFields(plugin, ['name', 'description', 'author', 'version', 'script'], `${label} (plugin.cfg)`);
  checkVersionMatch(plugin.version, versions.godot, `${label} (plugin.cfg)`);

  const assetLib = readJson('packages/godot/asset-lib.json');
  requireFields(assetLib, ['title', 'description', 'version', 'godot_version', 'cost', 'author'], `${label} (asset-lib.json)`);
  checkVersionMatch(assetLib.version, versions.godot, `${label} (asset-lib.json)`);
  if (plugin.version !== assetLib.version) {
    fail(`${label}: plugin.cfg version "${plugin.version}" != asset-lib.json version "${assetLib.version}"`);
  }
  checkChangelog('packages/godot', label);
} catch (e) {
  fail(`godot: ${e.message}`);
}

// --- Report ------------------------------------------------------------------
for (const o of oks) console.log(`  ok   ${o}`);
if (errors.length) {
  console.error('\nengines:manifests FAILED:');
  for (const e of errors) console.error(`  FAIL ${e}`);
  console.error(`\n${errors.length} problem(s) found.`);
  process.exit(1);
}
console.log(`\nengines:manifests OK — all 3 engine manifests valid and version-locked to VERSIONS.json.`);
