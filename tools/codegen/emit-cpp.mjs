// emit-cpp.mjs — emit C++ DTOs (nlohmann::json) for the core save/world schemas.
//
// Target: packages/unreal/Source/InsimulRuntime/Generated/InsimulGenerated.h
// Namespace: Insimul::Generated
//
// These are PLAIN structs (with from_json/to_json), NOT UE UStructs. The
// hand-written UStruct mapping layer stays in InsimulTypes.h and converts at the
// engine boundary — see the generated folder's README.md.
//
// quicktype flags (chosen so the output compiles under a stock C++17 toolchain
// with ONLY the vendored nlohmann/json single header — no boost, no other deps):
//   --no-boost        -> std::optional instead of boost::optional (needs C++17)
//   --code-format with-struct   -> plain public structs, not getter/setter classes
//   --source-style single-source -> one header with the shared helpers emitted once
//
// The one post-process step rewrites quicktype's local `#include "json.hpp"` to
// `#include "nlohmann/json.hpp"`, which resolves against the vendored single header
// at packages/unreal/Source/ThirdParty/nlohmann/json.hpp (UE ThirdParty convention).
// The rewrite is a fixed string replace, so the output stays a pure function of the
// schemas and the drift guard remains valid.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildMergedSchema, ROOT_TYPE_NAME } from './build-merged-schema.mjs';
import { runQuicktypeOnSchema } from './quicktype-runner.mjs';

const NAMESPACE = 'Insimul::Generated';
const OUT_FILE = 'InsimulGenerated.h';

const BANNER = [
  '// -----------------------------------------------------------------------------',
  '// GENERATED FILE — DO NOT EDIT BY HAND.',
  '//   Regenerate with:  npm run codegen   (from the insimul-runtime root)',
  '//   Source of truth:  packages/core/schemas/{save-file,save-envelope,world-ir}.schema.json',
  '//   Emitter:          tools/codegen/emit-cpp.mjs (quicktype, nlohmann::json, C++17)',
  '//',
  '//   These are PLAIN structs, NOT UE UStructs. The hand-written UStruct mapping',
  '//   layer lives in InsimulTypes.h and converts at the boundary — see README.md.',
  '//   Requires the vendored single header: ../../ThirdParty/nlohmann/json.hpp',
  '// -----------------------------------------------------------------------------',
  '',
].join('\n');

/**
 * Generate the C++ DTO header text (deterministic; no filesystem writes).
 * @returns {string}
 */
export function generateCpp() {
  const schema = buildMergedSchema();
  const body = runQuicktypeOnSchema(schema, [
    '--lang',
    'c++',
    '--no-boost',
    '--code-format',
    'with-struct',
    '--source-style',
    'single-source',
    '--namespace',
    NAMESPACE,
    '--top-level',
    ROOT_TYPE_NAME,
  ]);
  // Point quicktype's local `#include "json.hpp"` at the vendored ThirdParty header.
  const rewired = body.replace('#include "json.hpp"', '#include "nlohmann/json.hpp"');
  // Normalize trailing whitespace to a single newline for stable byte output.
  return BANNER + rewired.replace(/\s*$/, '') + '\n';
}

/**
 * Write the C++ DTOs under `baseDir` (default: repo root) and return written paths.
 * @param {string} baseDir  base directory the package tree hangs off of
 * @returns {string[]} relative paths (from baseDir) written
 */
export function emitCpp(baseDir) {
  const relDir = join('packages', 'unreal', 'Source', 'InsimulRuntime', 'Generated');
  const outDir = join(baseDir, relDir);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, OUT_FILE), generateCpp());
  return [join(relDir, OUT_FILE)];
}
