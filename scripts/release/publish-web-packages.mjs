#!/usr/bin/env node
/**
 * Release orchestrator for the four web npm packages — `npm run release:dry-run`.
 *
 * This is the script the tag-triggered CI workflow (.github/workflows/release-web-packages.yml)
 * runs. It is **dry-run by default**: it runs the whole preflight + publish gate and
 * then PRINTS the `npm publish` / `npm deprecate` commands it would run, without
 * touching the registry. Publishing is outward and irreversible, so it takes two
 * deliberate opt-ins that no default path supplies:
 *
 *   node scripts/release/publish-web-packages.mjs --execute --tag web-v2026.07.22
 *   # plus INSIMUL_PUBLISH=1 in the environment
 *
 * Order of operations (same in both modes, so the dry-run is a real rehearsal):
 *
 *   1. preflight  — versions agree with VERSIONS.json `web`, access is `restricted`,
 *                   the tag is a `web-v*` tag on HEAD, the worktree is clean;
 *   2. gate       — scripts/release/npm-publish-dry-run.mjs (tarball contents contract);
 *   3. publish    — per package, skipping versions already on the registry;
 *   4. deprecate  — `npm deprecate` per passthrough (publishing alone does NOT set the
 *                   registry deprecation flag — see docs/PUBLISHING.md).
 *
 * Going PUBLIC is a separate matter and is still blocked: every manifest pins
 * `publishConfig.access: "restricted"` and the gate fails on anything else, pending the
 * git-history audit / third-party purge (docs/PUBLISHING.md).
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGES, RELEASE_TAG_PATTERN, repoRoot, SUCCESSOR } from './packages.mjs';

const argv = process.argv.slice(2);
const execute = argv.includes('--execute');
const allowDirty = argv.includes('--allow-dirty');
const tag = valueOf('--tag') ?? process.env.GITHUB_REF_NAME ?? null;

function valueOf(flag) {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}

/** Reasons the run must not proceed. Collected so one run reports every problem. */
const failures = [];
const fail = (msg) => failures.push(msg);

// --- The second opt-in. A stray `--execute` alone can never publish. -------------
if (execute && process.env.INSIMUL_PUBLISH !== '1') {
  console.error(
    '--execute also requires INSIMUL_PUBLISH=1 in the environment.\n' +
      'Publishing is irreversible; see docs/PUBLISHING.md § "Actually publishing".',
  );
  process.exit(1);
}

const mode = execute ? 'EXECUTE (will publish)' : 'DRY RUN (publishes nothing)';
console.log(`Insimul web-package release — ${mode}\n`);

// --- 1. Preflight ---------------------------------------------------------------
const versions = JSON.parse(readFileSync(join(repoRoot, 'VERSIONS.json'), 'utf8'));
const pinned = versions.web ?? {};
const manifests = new Map();

for (const pkg of PACKAGES) {
  const manifest = JSON.parse(readFileSync(join(repoRoot, pkg.dir, 'package.json'), 'utf8'));
  manifests.set(pkg.name, manifest);

  if (!pinned[pkg.name]) {
    fail(`${pkg.name}: no VERSIONS.json "web" entry — every releasable web package must be pinned there`);
  } else if (pinned[pkg.name] !== manifest.version) {
    fail(`${pkg.name}: manifest version ${manifest.version} disagrees with VERSIONS.json ${pinned[pkg.name]}`);
  }
  // Belt-and-braces: the gate checks this too, but a release run must never be the
  // first place a `public` flip is noticed.
  if (manifest.publishConfig?.access !== 'restricted') {
    fail(`${pkg.name}: publishConfig.access is "${manifest.publishConfig?.access}" — must stay "restricted" pending the hygiene work (docs/PUBLISHING.md)`);
  }
}

for (const name of Object.keys(pinned)) {
  if (!PACKAGES.some((p) => p.name === name)) fail(`VERSIONS.json "web" pins ${name}, which is not a released web package`);
}

if (tag && !RELEASE_TAG_PATTERN.test(tag)) {
  fail(`release tag "${tag}" does not match the web-release tag format (web-v<train>, e.g. web-v2026.07.22)`);
}

const dirty = git(['status', '--porcelain']).trim();
if (dirty && !allowDirty) {
  const detail = `working tree is not clean — release from a clean, tagged checkout:\n${dirty}`;
  if (execute) fail(detail);
  else console.warn(`warning: ${detail}\n`);
}

if (execute) {
  if (!tag) fail('--execute needs a release tag (--tag web-v<train>, or GITHUB_REF_NAME in CI)');
  else if (git(['tag', '--points-at', 'HEAD']).split('\n').every((t) => t.trim() !== tag)) {
    fail(`release tag "${tag}" does not point at HEAD — release from the tagged commit`);
  }
}

report();

// --- 2. The tarball-contents gate ------------------------------------------------
console.log('running the publish gate (scripts/release/npm-publish-dry-run.mjs)…\n');
try {
  execFileSync(process.execPath, [join(repoRoot, 'scripts/release/npm-publish-dry-run.mjs')], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
} catch {
  console.error('\npublish gate failed — nothing was published.');
  process.exit(1);
}

// --- 3 + 4. Publish, then flag the passthroughs as deprecated --------------------
console.log('');
for (const pkg of PACKAGES) {
  const manifest = manifests.get(pkg.name);
  const spec = `${pkg.name}@${manifest.version}`;

  if (execute && isPublished(spec)) {
    console.log(`skip     ${spec} — already on the registry`);
    continue;
  }

  run(['publish'], pkg.dir, `publish ${spec}`);

  if (pkg.deprecated) {
    // The registry deprecation flag is NOT a manifest field; it is this call. Reuse
    // the manifest's own message so the artifact and the registry never diverge.
    run(['deprecate', spec, manifest.deprecated], pkg.dir, `deprecate ${spec} -> ${SUCCESSOR}`);
  }
}

console.log(
  execute
    ? '\nrelease complete.'
    : '\nrelease dry-run OK — nothing was published. Re-run with `--execute --tag web-v<train>` and INSIMUL_PUBLISH=1 to release.',
);

// --- helpers ---------------------------------------------------------------------

function git(args) {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  } catch {
    return '';
  }
}

/** Run (or, in dry-run mode, print) one npm command in a package directory. */
function run(args, dir, label) {
  const printable = `npm ${args.map((a) => (/\s/.test(a) ? JSON.stringify(a) : a)).join(' ')}`;
  if (!execute) {
    console.log(`would run  ${printable}\n           (cwd ${dir})  # ${label}`);
    return;
  }
  console.log(`run      ${printable}  (cwd ${dir})`);
  execFileSync('npm', args, { cwd: join(repoRoot, dir), stdio: 'inherit' });
}

/** True when this exact version is already on the registry (makes a re-run idempotent). */
function isPublished(spec) {
  try {
    execFileSync('npm', ['view', spec, 'version'], { cwd: repoRoot, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function report() {
  if (failures.length === 0) return;
  console.error(`preflight FAILED (${failures.length} problem${failures.length === 1 ? '' : 's'}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
