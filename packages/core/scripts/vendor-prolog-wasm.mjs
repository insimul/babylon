#!/usr/bin/env node
/**
 * vendor-prolog-wasm.mjs — re-stage the committed `@insimul/prolog-wasm`
 * artifact (US-1, 91-babylon-prolog-wasm).
 *
 * The artifact is COMMITTED, not fetched — see
 * `packages/core/docs/prolog-wasm-acquisition.md` for why. This script is how
 * it gets refreshed when libinsimul cuts a new build; it is not part of any
 * install or build step, and this repo builds and tests without ever running it.
 *
 *   # in the libinsimul checkout
 *   scripts/build_wasm.sh && scripts/package.sh --target wasm
 *
 *   # here
 *   npm run wasm:vendor -- --from ../insimul-native/dist/wasm
 *   INSIMUL_NATIVE_DIST=../insimul-native/dist npm run wasm:vendor
 *
 * `--check` verifies the vendored copy against a source without writing, which
 * is what a release rehearsal wants.
 *
 * The hand-written `index.d.mts` (our TypeScript surface for the untyped
 * `insimul-api.mjs`) is NOT part of the upstream package, so it is preserved
 * across a re-stage rather than deleted with the rest of the directory.
 */
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CORE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEST = join(CORE, 'src', 'prolog', 'vendor', 'prolog-wasm');

/** Files the upstream package.json declares. A missing one is a broken stage. */
const REQUIRED = [
  'package.json',
  'index.mjs',
  'insimul-api.mjs',
  'insimul.mjs',
  'insimul.wasm',
  'VERSION',
  'LICENSE',
];

/** Ours, not upstream's — never overwritten, never deleted. */
const LOCAL_ONLY = ['index.d.mts'];

function usage(code) {
  console.log(
    [
      'Usage: node scripts/vendor-prolog-wasm.mjs [--from <dist/wasm dir>] [--check]',
      '',
      '  --from <dir>  the packaged artifact directory (libinsimul dist/wasm/).',
      '                Defaults to $INSIMUL_NATIVE_DIST/wasm, else',
      '                $INSIMUL_NATIVE_ROOT/dist/wasm.',
      '  --check       compare only; exit non-zero on any difference.',
    ].join('\n'),
  );
  process.exit(code);
}

let from = null;
let checkOnly = false;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  switch (argv[i]) {
    case '--from':
      from = argv[++i];
      break;
    case '--check':
      checkOnly = true;
      break;
    case '-h':
    case '--help':
      usage(0);
      break;
    default:
      console.error(`vendor-prolog-wasm: unknown argument: ${argv[i]}`);
      usage(2);
  }
}

if (!from) {
  if (process.env.INSIMUL_NATIVE_DIST) from = join(process.env.INSIMUL_NATIVE_DIST, 'wasm');
  else if (process.env.INSIMUL_NATIVE_ROOT) from = join(process.env.INSIMUL_NATIVE_ROOT, 'dist', 'wasm');
}

if (!from) {
  console.error(
    [
      'vendor-prolog-wasm: no source given.',
      '',
      'Build the artifact in a libinsimul checkout first:',
      '    scripts/build_wasm.sh && scripts/package.sh --target wasm',
      'then point this script at it:',
      '    npm run wasm:vendor -- --from <insimul-native>/dist/wasm',
    ].join('\n'),
  );
  process.exit(1);
}

const src = resolve(from);
if (!existsSync(src) || !statSync(src).isDirectory()) {
  console.error(`vendor-prolog-wasm: not a directory: ${src}`);
  process.exit(1);
}

const missing = REQUIRED.filter((f) => !existsSync(join(src, f)));
if (missing.length > 0) {
  console.error(
    `vendor-prolog-wasm: ${src} is not a packaged @insimul/prolog-wasm dist — missing: ${missing.join(', ')}`,
  );
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8'));
if (manifest.name !== '@insimul/prolog-wasm') {
  console.error(`vendor-prolog-wasm: ${src} is "${manifest.name}", expected @insimul/prolog-wasm`);
  process.exit(1);
}

if (checkOnly) {
  let differed = false;
  for (const f of REQUIRED) {
    const a = join(src, f);
    const b = join(DEST, f);
    if (!existsSync(b)) {
      console.error(`✗ ${f}: not vendored`);
      differed = true;
      continue;
    }
    if (!readFileSync(a).equals(readFileSync(b))) {
      console.error(`✗ ${f}: differs from ${src}`);
      differed = true;
    }
  }
  if (differed) {
    console.error(`vendor-prolog-wasm: the vendored copy is stale — run without --check to re-stage`);
    process.exit(1);
  }
  console.log(`vendor-prolog-wasm: up to date with ${src} (${manifest.name}@${manifest.version})`);
  process.exit(0);
}

// Drop everything upstream owns, keep what we own.
if (existsSync(DEST)) {
  for (const entry of readdirSync(DEST)) {
    if (LOCAL_ONLY.includes(entry)) continue;
    rmSync(join(DEST, entry), { recursive: true, force: true });
  }
}

for (const f of REQUIRED) {
  copyFileSync(join(src, f), join(DEST, f));
}

for (const f of LOCAL_ONLY) {
  if (!existsSync(join(DEST, f))) {
    console.warn(`vendor-prolog-wasm: warning — ${f} is missing; the TypeScript surface will not resolve`);
  }
}

const stamp = readFileSync(join(DEST, 'VERSION'), 'utf8').trim().split('\n').join(' | ');
console.log(`vendor-prolog-wasm: staged ${manifest.name}@${manifest.version} into ${DEST}`);
console.log(`vendor-prolog-wasm: ${stamp}`);
