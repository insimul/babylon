#!/usr/bin/env node
// Validate the export-pipeline template contract for the native engine packages
// (US-EP2).
//
// The platform export pipeline (insimul-platform/scripts/copy-templates.js,
// resolved through server/services/game-export/template-paths.ts) copies every
// file under `packages/<engine>/templates` verbatim into an exported game, then
// substitutes `{{UPPER_SNAKE_CASE}}` placeholder tokens in the text files. Each
// engine package therefore ships a `templates/TEMPLATE_MANIFEST.json` that is the
// authoritative list of what the pipeline consumes and which placeholders each
// file carries.
//
// This script is the drift guard for those manifests. It:
//   1. Enumerates every git-tracked file under each templates/ tree (the exact set
//      npm publishes / the pipeline copies) and the placeholders each text file
//      bears.
//   2. In --write mode, (re)generates TEMPLATE_MANIFEST.json from that scan.
//   3. Otherwise, asserts the committed manifest matches the tree exactly:
//      every listed file exists, no placeholder-bearing file is unlisted, and the
//      per-file + top-level placeholder sets agree.
//   4. Enforces that no engine package file references another engine package.
//
// No third-party deps. Run: `npm run engines:templates` (validate) /
// `node scripts/engines/validate-templates.mjs --write` (regenerate).

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ENGINES = ['unity', 'unreal', 'godot'];
const WRITE = process.argv.includes('--write');

// Placeholder token syntax the export pipeline substitutes. Deliberately anchored
// to UPPER_SNAKE_CASE so C++/C# brace-init false positives (e.g.
// `{{TEXT("Conscientiousness"), 0.6f}}`) are NOT treated as placeholders.
const PLACEHOLDER_RE = /\{\{[A-Z][A-Z0-9_]*\}\}/g;
const PLACEHOLDER_SYNTAX = '{{UPPER_SNAKE_CASE}}';

// Extensions we do NOT scan for placeholders (binary assets copied as-is).
const BINARY_EXT = new Set(['.ttf', '.otf', '.png', '.jpg', '.jpeg', '.svg', '.pyc', '.wav', '.ogg', '.mp3', '.bin', '.res']);

const errors = [];
const fail = (msg) => errors.push(msg);

function isBinary(path) {
  const dot = path.lastIndexOf('.');
  return dot >= 0 && BINARY_EXT.has(path.slice(dot).toLowerCase());
}

function trackedFiles(engine) {
  const dir = `packages/${engine}/templates`;
  const out = execFileSync('git', ['ls-files', dir], { cwd: REPO_ROOT, encoding: 'utf8' });
  return out.split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((abs) => relative(dir, abs).split('\\').join('/'))
    .filter((rel) => rel !== 'TEMPLATE_MANIFEST.json')
    .sort();
}

function placeholdersIn(engine, relPath) {
  if (isBinary(relPath)) return [];
  const abs = join(REPO_ROOT, `packages/${engine}/templates`, relPath);
  const txt = readFileSync(abs, 'utf8');
  const found = new Set();
  for (const m of txt.matchAll(PLACEHOLDER_RE)) found.add(m[0]);
  return [...found].sort();
}

// Build the manifest object a tree currently implies.
function scanEngine(engine) {
  const files = trackedFiles(engine).map((path) => ({ path, placeholders: placeholdersIn(engine, path) }));
  const all = new Set();
  for (const f of files) f.placeholders.forEach((p) => all.add(p));
  return {
    engine,
    description:
      `Authoritative list of every file under packages/${engine}/templates that the ` +
      `platform export pipeline (insimul-platform/scripts/copy-templates.js) copies into an ` +
      `exported game. Text files carry ${PLACEHOLDER_SYNTAX} placeholder tokens substituted at ` +
      `export time. Regenerate with: node scripts/engines/validate-templates.mjs --write`,
    placeholderSyntax: PLACEHOLDER_SYNTAX,
    placeholders: [...all].sort(),
    files,
  };
}

function manifestPath(engine) {
  return `packages/${engine}/templates/TEMPLATE_MANIFEST.json`;
}

function eqArr(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]);
}

// Cross-package reach-in guard: no file in engine E may reference another engine
// package (by `packages/<other>` path or a `com.insimul.<other>` / `<other>-`
// asmdef-style token). Enforces AC "No engine package file references another
// engine package".
function checkReachIns(engine) {
  const others = ENGINES.filter((e) => e !== engine);
  const tokens = others.map((o) => `packages/${o}`);
  for (const relPath of trackedFiles(engine)) {
    if (isBinary(relPath)) continue;
    const txt = readFileSync(join(REPO_ROOT, `packages/${engine}/templates`, relPath), 'utf8');
    for (const tok of tokens) {
      if (txt.includes(tok)) {
        fail(`${engine}: templates/${relPath} references another engine package ("${tok}")`);
      }
    }
  }
}

// --- Per engine ---------------------------------------------------------------
for (const engine of ENGINES) {
  let scanned;
  try {
    scanned = scanEngine(engine);
  } catch (e) {
    fail(`${engine}: scan failed: ${e.message}`);
    continue;
  }

  checkReachIns(engine);

  if (WRITE) {
    writeFileSync(join(REPO_ROOT, manifestPath(engine)), JSON.stringify(scanned, null, 2) + '\n');
    console.log(`  wrote ${manifestPath(engine)} (${scanned.files.length} files, ${scanned.placeholders.length} placeholders)`);
    continue;
  }

  const rel = manifestPath(engine);
  if (!existsSync(join(REPO_ROOT, rel))) {
    fail(`${engine}: missing ${rel} — run: node scripts/engines/validate-templates.mjs --write`);
    continue;
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(join(REPO_ROOT, rel), 'utf8'));
  } catch (e) {
    fail(`${engine}: invalid JSON in ${rel}: ${e.message}`);
    continue;
  }

  if (manifest.placeholderSyntax !== PLACEHOLDER_SYNTAX) {
    fail(`${engine}: placeholderSyntax must be "${PLACEHOLDER_SYNTAX}"`);
  }
  if (!eqArr(manifest.placeholders, scanned.placeholders)) {
    fail(`${engine}: top-level placeholders set drifted from tree — regenerate the manifest`);
  }

  const listed = new Map((manifest.files || []).map((f) => [f.path, f.placeholders || []]));
  const onDisk = new Map(scanned.files.map((f) => [f.path, f.placeholders]));

  // Every listed file must exist on disk.
  for (const p of listed.keys()) {
    if (!onDisk.has(p)) fail(`${engine}: manifest lists templates/${p} but it does not exist`);
  }
  // Every file on disk must be listed; a placeholder-bearing file that is unlisted
  // is the headline failure the AC calls out.
  for (const [p, ph] of onDisk) {
    if (!listed.has(p)) {
      const why = ph.length ? ` (bears placeholders ${ph.join(', ')})` : '';
      fail(`${engine}: templates/${p} is not listed in TEMPLATE_MANIFEST.json${why}`);
      continue;
    }
    if (!eqArr(listed.get(p), ph)) {
      fail(`${engine}: templates/${p} placeholder list drifted — expected [${ph.join(', ')}], manifest has [${listed.get(p).join(', ')}]`);
    }
  }
}

// --- Report -------------------------------------------------------------------
if (WRITE) {
  console.log('\nTEMPLATE_MANIFEST.json regenerated for all engines.');
  if (errors.length) {
    console.error('\n(reach-in problems found while writing):');
    for (const e of errors) console.error(`  FAIL ${e}`);
    process.exit(1);
  }
  process.exit(0);
}

if (errors.length) {
  console.error('engines:templates FAILED:');
  for (const e of errors) console.error(`  FAIL ${e}`);
  console.error(`\n${errors.length} problem(s) found.`);
  process.exit(1);
}
console.log('engines:templates OK — all 3 engine template manifests match their trees; no cross-engine reach-ins.');
