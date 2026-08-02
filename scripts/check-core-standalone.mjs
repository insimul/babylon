#!/usr/bin/env node
/**
 * US-1 (93-runtime-logic-to-core) — standalone check for @insimul/core.
 *
 * The repo-wide `npm run check` / `npm test` prove nothing about ISOLATION: they run
 * with the root tsconfig/vitest aliases (`@shared/*`, `@insimul/babylon`, …) in scope,
 * so a core file that quietly reached into the Babylon runtime would still be green.
 * This script runs core's OWN `tsc --noEmit` and `vitest run` with cwd = packages/core,
 * i.e. exactly the way a consumer who checked out only that directory would.
 *
 * It also pins the baseline recorded when this guard was written, so that the large
 * runtime move in US-3 cannot silently DROP coverage while adding files. Counts may
 * only grow: a decrease means suites stopped being discovered standalone (the usual
 * cause is a test that only resolves through a root-config alias).
 *
 * Usage:  node scripts/check-core-standalone.mjs          (from the repo root)
 *         npm run check:core-standalone
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CORE = join(ROOT, 'packages', 'core');
const BASELINE = JSON.parse(readFileSync(join(CORE, 'STANDALONE_BASELINE.json'), 'utf8'));

let failed = false;

function fail(msg) {
  failed = true;
  console.error(`✗ ${msg}`);
}

function ok(msg) {
  console.log(`✓ ${msg}`);
}

// ── 1. typecheck ────────────────────────────────────────────────────────────
console.log('→ packages/core: tsc --noEmit (standalone)');
const tsc = spawnSync('npx', ['--no-install', 'tsc', '--noEmit'], {
  cwd: CORE,
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
if (tsc.status !== 0) {
  console.error(tsc.stdout ?? '');
  console.error(tsc.stderr ?? '');
  fail('packages/core does not typecheck standalone.');
} else {
  ok('packages/core typechecks standalone (tsc --noEmit, cwd = packages/core).');
}

// ── 2. tests ────────────────────────────────────────────────────────────────
console.log('→ packages/core: vitest run (standalone)');
const vitest = spawnSync('npx', ['--no-install', 'vitest', 'run', '--reporter=json'], {
  cwd: CORE,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  shell: process.platform === 'win32',
});

let report = null;
// The json reporter writes the report to stdout, but vite/vitest may prefix it with
// its own banner lines — take the text from the first `{` onwards.
const brace = (vitest.stdout ?? '').indexOf('{');
if (brace !== -1) {
  try {
    report = JSON.parse(vitest.stdout.slice(brace));
  } catch {
    /* fall through to the failure below */
  }
}

if (!report) {
  console.error(vitest.stdout ?? '');
  console.error(vitest.stderr ?? '');
  fail('packages/core: could not parse a vitest JSON report (the standalone run did not complete).');
} else {
  const files = Array.isArray(report.testResults) ? report.testResults.length : 0;
  const tests = report.numTotalTests ?? 0;
  const passed = report.numPassedTests ?? 0;

  if (!report.success || passed !== tests) {
    fail(`packages/core tests are not green standalone: ${passed}/${tests} passed.`);
    for (const suite of report.testResults ?? []) {
      if (suite.status !== 'passed') console.error(`    ${suite.status}: ${suite.name}`);
    }
  } else {
    ok(`packages/core tests pass standalone: ${files} files, ${tests} tests.`);
  }

  // Baseline: coverage may grow, never shrink.
  if (files < BASELINE.testFiles || tests < BASELINE.tests) {
    fail(
      `packages/core standalone coverage SHRANK vs the recorded baseline ` +
        `(${BASELINE.testFiles} files / ${BASELINE.tests} tests, ${BASELINE.recordedAt}): ` +
        `now ${files} files / ${tests} tests.\n` +
        `  A drop usually means a suite only resolves through a ROOT vitest alias and is no\n` +
        `  longer discovered from within the package — i.e. core stopped being standalone.\n` +
        `  If suites were deliberately removed, update packages/core/STANDALONE_BASELINE.json\n` +
        `  in the same commit and say why.`,
    );
  } else {
    ok(
      `standalone coverage >= baseline (${BASELINE.testFiles} files / ${BASELINE.tests} tests, ` +
        `recorded ${BASELINE.recordedAt}).`,
    );
  }
}

if (failed) {
  console.error('\ncheck-core-standalone: FAILED');
  process.exit(1);
}
console.log('\ncheck-core-standalone: OK');
