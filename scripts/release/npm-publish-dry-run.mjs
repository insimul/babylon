#!/usr/bin/env node
/**
 * Publish gate for the web npm packages — `npm run publish:dry-run`.
 *
 * Runs `npm publish --dry-run --json` in each package and asserts the resulting
 * tarball matches the publish contract: the declared entry + types are present,
 * README/LICENSE ship, and no test / dev / corpus bloat leaks in. Nothing is ever
 * uploaded — `--dry-run` stops before the registry write, so this is safe to run
 * in CI on every push.
 *
 * The real `npm publish` is a deliberate human/CI step; see docs/PUBLISHING.md.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { PACKAGES, repoRoot, SUCCESSOR } from './packages.mjs';

/**
 * Patterns that must NEVER appear in a published tarball. Tests, dev tooling, and
 * the cross-engine conformance corpus are repo-only artifacts.
 */
const FORBIDDEN = [
  { pattern: /(^|\/)__tests__\//, why: 'test directory' },
  { pattern: /\.test\.[cm]?[jt]sx?$/, why: 'test file' },
  { pattern: /^conformance\//, why: 'conformance corpus (test fixtures)' },
  { pattern: /^scripts\//, why: 'dev tooling' },
  { pattern: /^node_modules\//, why: 'vendored dependency' },
  { pattern: /^vitest\.config\./, why: 'test config' },
  { pattern: /(^|\/)OLD_[A-Z_]+\.json$/, why: 'guard snapshot' },
];

const ALWAYS_INCLUDE = ['README.md', 'LICENSE'];

function packDryRun(dir) {
  const stdout = execFileSync('npm', ['publish', '--dry-run', '--json'], {
    cwd: join(repoRoot, dir),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const parsed = JSON.parse(stdout);
  // `npm publish --json` keys the report by package id.
  return Object.values(parsed)[0];
}

const failures = [];
/** Per-package tarball contents, so a passthrough can be checked against its successor. */
const packed = new Map();

for (const pkg of PACKAGES) {
  const manifest = JSON.parse(readFileSync(join(repoRoot, pkg.dir, 'package.json'), 'utf8'));
  const fail = (msg) => failures.push(`${pkg.name}: ${msg}`);

  if (manifest.name !== pkg.name) fail(`manifest name is ${manifest.name}, expected ${pkg.name}`);
  if (!manifest.version) fail('no version');
  if (!manifest.license) fail('no license field');
  if (!manifest.repository) fail('no repository field');
  if (manifest.publishConfig?.access !== 'restricted') {
    fail('publishConfig.access must be "restricted" until the §7 history-audit / third-party-purge hygiene lands (docs/PUBLISHING.md)');
  }
  if (!manifest.publishConfig?.registry) fail('publishConfig.registry is not pinned');

  const report = packDryRun(pkg.dir);
  const files = report.files.map((f) => f.path);
  const shipped = new Set(files);

  for (const required of [...ALWAYS_INCLUDE, ...pkg.mustInclude]) {
    if (!shipped.has(required)) fail(`tarball is missing ${required}`);
  }

  // Everything the exports map advertises must actually be in the tarball.
  const exportTargets = collectExportTargets(manifest.exports);
  for (const target of exportTargets) {
    if (!shipped.has(target)) fail(`exports map points at ${target}, which is not in the tarball`);
  }

  for (const file of files) {
    for (const { pattern, why } of FORBIDDEN) {
      if (pattern.test(file)) fail(`tarball contains ${file} (${why})`);
    }
  }

  packed.set(pkg.name, shipped);
  if (pkg.deprecated) checkDeprecatedPassthrough(pkg, manifest, files, fail);

  console.log(
    `${pkg.name}@${manifest.version} — ${files.length} files, ${(report.unpackedSize / 1024).toFixed(0)} kB unpacked, access=${manifest.publishConfig.access}${pkg.deprecated ? ', DEPRECATED passthrough' : ''}`,
  );
}

/**
 * A deprecated passthrough (US-PB2) has two jobs: tell every consumer it is
 * deprecated, and keep resolving to the successor package. Both are checked against
 * the *published* artifact, not just the repo.
 *
 * Note the registry-side deprecation flag is set by `npm deprecate` at release time
 * (see docs/PUBLISHING.md); the manifest field + README banner are what a consumer
 * reading the tarball or the package page sees.
 */
function checkDeprecatedPassthrough(pkg, manifest, files, fail) {
  if (typeof manifest.deprecated !== 'string' || !manifest.deprecated.includes(SUCCESSOR)) {
    fail(`package.json "deprecated" must be a message referencing ${SUCCESSOR}`);
  }
  if (!/deprecated/i.test(manifest.description ?? '') || !manifest.description?.includes(SUCCESSOR)) {
    fail(`description must say the package is deprecated and point at ${SUCCESSOR}`);
  }
  const readme = readFileSync(join(repoRoot, pkg.dir, 'README.md'), 'utf8');
  if (!/deprecated/i.test(readme) || !readme.includes(SUCCESSOR)) {
    fail(`README.md must carry a deprecation notice referencing ${SUCCESSOR}`);
  }
  // Installing the passthrough must pull in the package it forwards to.
  if (!manifest.dependencies?.[SUCCESSOR]) {
    fail(`must declare ${SUCCESSOR} as a dependency so the re-export targets are installed`);
  }

  // Every shipped shim must still resolve once installed. The shims re-export via
  // relative paths that escape the package (`../../babylon/src/...`); that works
  // because npm installs scoped packages as siblings — `@insimul/<pkg>/src/x.ts`
  // reaching `../babylon/src/...` (relative to the package root) lands inside
  // `@insimul/babylon`, exactly as it lands in `packages/babylon` in the repo.
  const successorFiles = packed.get(SUCCESSOR);
  const shims = files.filter((f) => f.startsWith('src/') && /\.tsx?$/.test(f));
  if (shims.length === 0) fail('tarball ships no shim sources under src/');

  for (const file of shims) {
    const source = readFileSync(join(repoRoot, pkg.dir, file), 'utf8');
    const specifiers = [...source.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    if (specifiers.length === 0) {
      fail(`${file} re-exports nothing — a shim must forward to ${SUCCESSOR}`);
      continue;
    }
    for (const spec of specifiers) {
      if (!spec.startsWith('.')) {
        if (spec !== SUCCESSOR && !spec.startsWith(`${SUCCESSOR}/`)) {
          fail(`${file} re-exports from ${spec}, which is neither relative nor ${SUCCESSOR}`);
        }
        continue;
      }
      const fromPackageRoot = posix.normalize(posix.join(posix.dirname(file), spec));
      if (!fromPackageRoot.startsWith('../babylon/src/')) {
        fail(`${file} re-exports ${spec}, which resolves to ${fromPackageRoot} — outside the installed ${SUCCESSOR} package`);
        continue;
      }
      const inSuccessor = fromPackageRoot.slice('../babylon/'.length);
      const resolved = resolveSource(join(repoRoot, 'packages/babylon'), inSuccessor);
      if (!resolved) {
        fail(`${file} re-exports ${spec}, which resolves to a nonexistent ${SUCCESSOR} module (${inSuccessor})`);
      } else if (!successorFiles?.has(resolved)) {
        fail(`${file} re-exports ${spec} → ${resolved}, which ${SUCCESSOR} does not ship`);
      }
    }
  }
}

/** Extensionless module specifier -> the package-relative file it resolves to, if any. */
function resolveSource(packageRoot, relPath) {
  for (const candidate of [relPath, `${relPath}.ts`, `${relPath}.tsx`, `${relPath}/index.ts`, `${relPath}/index.tsx`]) {
    if (existsSync(join(packageRoot, candidate))) return candidate;
  }
  return null;
}

/** Concrete (non-glob) file targets an exports map advertises. */
function collectExportTargets(exportsField, out = new Set()) {
  if (typeof exportsField === 'string') {
    if (!exportsField.includes('*')) out.add(exportsField.replace(/^\.\//, ''));
    return out;
  }
  if (exportsField && typeof exportsField === 'object') {
    for (const value of Object.values(exportsField)) collectExportTargets(value, out);
  }
  return out;
}

if (failures.length > 0) {
  console.error(`\npublish dry-run FAILED (${failures.length} problem${failures.length === 1 ? '' : 's'}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log('\npublish dry-run OK — no package was published.');
