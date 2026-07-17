// Unreal conformance gate (US-XP2) — runs the host-side Prolog conformance
// corpus through the C++ InsimulKB wrapper as part of `npm run engines:check`,
// but ONLY when unreal sources changed AND a built libinsimul + cmake are
// available. Otherwise it SKIPs cleanly (green), so engines:check stays runnable
// in environments without the native toolchain (the common case in this harness).
//
// The heavy lifting lives in tools/verify-unreal/run-host-tests.sh (grep-guard +
// the CMake host tests, which include the `insimul_conformance` ctest); this
// module just decides whether to invoke it and reports a one-line gate result.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Source trees whose changes should re-run the conformance corpus.
const WATCHED = ['packages/unreal', 'tools/verify-unreal'];

function git(args) {
  return execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
}

// Resolve a base ref to diff the branch against (main, local or remote).
function resolveBase() {
  for (const ref of ['origin/main', 'main']) {
    try {
      return git(['merge-base', 'HEAD', ref]).trim();
    } catch {
      /* ref absent — try the next */
    }
  }
  return null;
}

// Did any watched source change? Returns { changed, baseKnown } — when the base
// is unknown and the tree is clean we fail OPEN (treat as changed) so a manual
// engines:check on the branch still exercises the corpus.
function unrealSourcesChanged() {
  const set = new Set();
  try {
    const porcelain = git(['status', '--porcelain', '--', ...WATCHED]);
    for (const line of porcelain.split('\n')) {
      const p = line.slice(3).trim();
      if (p) set.add(p);
    }
  } catch {
    /* not a git tree — fall through to fail-open */
  }
  const base = resolveBase();
  if (base) {
    try {
      const diff = git(['diff', '--name-only', `${base}...HEAD`, '--', ...WATCHED]);
      for (const p of diff.split('\n')) if (p.trim()) set.add(p.trim());
    } catch {
      /* diff failed — ignore */
    }
  }
  return { changed: set.size > 0 || base === null, baseKnown: base !== null };
}

// Locate an insimul-native checkout that already has a built static lib. We do
// NOT build it here (a first build fetches Trealla over the network) — that's the
// job of `npm run engines:unreal:host`.
function findBuiltNative() {
  const cands = [
    process.env.INSIMUL_NATIVE_ROOT,
    join(REPO_ROOT, '..', 'insimul-native'),
    join(REPO_ROOT, '..', '..', 'insimul-native'),
    join(homedir(), 'Development', 'workspace', 'insimul-native'),
  ].filter(Boolean);
  for (const c of cands) {
    if (existsSync(join(c, 'include', 'insimul.h'))) {
      const built = existsSync(join(c, 'build', 'libinsimul.a'));
      return { root: c, built };
    }
  }
  return null;
}

function haveCmake() {
  const r = spawnSync('cmake', ['--version'], { encoding: 'utf8' });
  return r.status === 0;
}

/** @returns {{name:string, ok:boolean, scanned:number, skipped?:boolean, reason?:string, output?:string}} */
export function run() {
  const name = 'unreal/conformance';

  const { changed } = unrealSourcesChanged();
  if (!changed) {
    return { name, ok: true, scanned: 0, skipped: true, reason: 'no unreal source changes' };
  }

  if (!haveCmake()) {
    return { name, ok: true, scanned: 0, skipped: true, reason: 'cmake not on PATH' };
  }

  const native = findBuiltNative();
  if (!native) {
    return { name, ok: true, scanned: 0, skipped: true, reason: 'insimul-native checkout not found (set INSIMUL_NATIVE_ROOT)' };
  }
  if (!native.built) {
    return {
      name,
      ok: true,
      scanned: 0,
      skipped: true,
      reason: 'libinsimul.a not built — run `npm run engines:unreal:host` once to build it',
    };
  }

  const res = spawnSync('bash', [join(REPO_ROOT, 'tools', 'verify-unreal', 'run-host-tests.sh')], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: { ...process.env, INSIMUL_NATIVE_ROOT: native.root },
  });
  const output = `${res.stdout || ''}${res.stderr || ''}`;
  return { name, ok: res.status === 0, scanned: 1, output };
}

// Standalone: `node tools/verify-unreal/conformance.mjs`
if (import.meta.url === `file://${process.argv[1]}`) {
  const res = run();
  if (res.skipped) {
    console.log(`  ↷ ${res.name}: SKIP (${res.reason})`);
    process.exit(0);
  }
  if (res.output) console.log(res.output);
  console.log(res.ok ? `  ✓ ${res.name}: host corpus green` : `  ✗ ${res.name}: host corpus FAILED`);
  process.exit(res.ok ? 0 : 1);
}
