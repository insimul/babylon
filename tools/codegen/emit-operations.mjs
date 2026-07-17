// emit-operations.mjs — emit the machine-readable operation table (US-CG4).
//
// Target: packages/core/openapi/operations.json
//
// The C# client (emit-csharp-api.mjs) is generated from the vendored OpenAPI spec,
// but the C++ (Unreal) and GDScript (Godot) HTTP wrappers stay hand-written thin
// per the platform-split plan. This JSON table (operationId / method / path /
// params) is the machine-readable contract those hand-written wrappers consume and
// check themselves against, so all three engines stay pinned to the same operation
// set without each re-parsing the YAML.
//
// Output is a pure function of the vendored spec (deterministic, byte-stable) so
// the codegen drift guard covers it.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadSpec, collectOperations, VENDORED_SPEC_REL } from './openapi-spec.mjs';

const OUT_REL = join('packages', 'core', 'openapi', 'operations.json');

/**
 * Build the operations-table object (deterministic; no filesystem writes).
 * @returns {object}
 */
export function generateOperations() {
  const spec = loadSpec();
  return {
    $generatedBy: 'tools/codegen/emit-operations.mjs (npm run codegen)',
    $doNotEdit: 'Regenerate with `npm run codegen`; source: ' + VENDORED_SPEC_REL,
    specTitle: spec.info?.title ?? '',
    specVersion: spec.info?.version ?? '',
    operations: collectOperations(spec),
  };
}

/**
 * Write operations.json under `baseDir` and return written paths.
 * @param {string} baseDir
 * @returns {string[]}
 */
export function emitOperations(baseDir) {
  const outFile = join(baseDir, OUT_REL);
  mkdirSync(join(baseDir, 'packages', 'core', 'openapi'), { recursive: true });
  // 2-space indent + trailing newline — stable, human-readable, git-diff friendly.
  writeFileSync(outFile, JSON.stringify(generateOperations(), null, 2) + '\n');
  return [OUT_REL];
}
