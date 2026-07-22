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
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

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

/**
 * The packages this gate covers, with the files each one must ship beyond
 * README/LICENSE (which are required of every package).
 */
const PACKAGES = [
  { dir: 'packages/core', name: '@insimul/core', mustInclude: ['src/index.ts', 'schemas/save-file.schema.json'] },
  {
    dir: 'packages/babylon',
    name: '@insimul/babylon',
    mustInclude: ['src/index.ts', 'src/conversation/index.ts', 'src/data/index.ts', 'src/engine/index.ts', 'templates/vite.config.ts'],
  },
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

  console.log(
    `${pkg.name}@${manifest.version} — ${files.length} files, ${(report.unpackedSize / 1024).toFixed(0)} kB unpacked, access=${manifest.publishConfig.access}`,
  );
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
