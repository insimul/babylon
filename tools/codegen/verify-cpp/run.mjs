#!/usr/bin/env node
// run.mjs — syntax-only compile-verify the generated C++ DTOs (`npm run codegen:verify-cpp`).
//
// Runs `clang++ -std=c++17 -fsyntax-only` over tools/codegen/verify-cpp/main.cpp,
// which includes the generated header and instantiates every top-level DTO. This
// proves the generated C++ is well-formed and its from_json/to_json compile against
// the vendored nlohmann/json single header — without needing a full Unreal build
// (unavailable in this harness).
//
// Include paths:
//   -I <Generated dir>            -> so `#include "InsimulGenerated.h"` resolves
//   -I <Source/ThirdParty dir>    -> so `#include "nlohmann/json.hpp"` resolves
//
// clang++/g++ are present in this environment. If neither is on PATH, this prints a
// loud SKIP and exits 0 (a skip is NOT a pass) — run it where a C++17 compiler exists.

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..');
const SOURCE_DIR = join(REPO_ROOT, 'packages', 'unreal', 'Source');
const GENERATED_DIR = join(SOURCE_DIR, 'InsimulRuntime', 'Generated');
const THIRDPARTY_DIR = join(SOURCE_DIR, 'ThirdParty');
const MAIN = join(HERE, 'main.cpp');

function pickCompiler() {
  for (const cc of ['clang++', 'g++']) {
    if (spawnSync(cc, ['--version'], { stdio: 'ignore' }).status === 0) return cc;
  }
  return null;
}

const cc = pickCompiler();
if (!cc) {
  console.warn(
    '\n[codegen:verify-cpp] SKIPPED — no clang++/g++ found on PATH.\n' +
      '  This is a SKIP, not a pass. Install a C++17 compiler and re-run\n' +
      '  `npm run codegen:verify-cpp` to syntax-check the generated C++ DTOs.\n',
  );
  process.exit(0);
}

console.log(`[codegen:verify-cpp] ${cc} -std=c++17 -fsyntax-only (generated C++ DTO check)…`);
const res = spawnSync(
  cc,
  [
    '-std=c++17',
    '-fsyntax-only',
    '-I',
    GENERATED_DIR,
    '-I',
    THIRDPARTY_DIR,
    MAIN,
  ],
  { stdio: 'inherit' },
);

if (res.status === 0) {
  console.log('[codegen:verify-cpp] OK — generated C++ DTOs are valid C++17 and compile.');
  process.exit(0);
}
console.error('[codegen:verify-cpp] FAILED — generated C++ did not compile.');
process.exit(res.status ?? 1);
