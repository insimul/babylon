#!/usr/bin/env node
// openapi-sync.mjs — keep the vendored OpenAPI spec in step with the platform (US-CG4).
//
//   npm run openapi:sync            # diff the vendored copy against the platform spec
//   npm run openapi:sync -- --write # copy the platform spec into the vendored path
//
// The platform repo (insimul-platform/openapi/insimul-v1.yaml) is the SOURCE OF
// TRUTH; packages/core/openapi/insimul-v1.yaml is a vendored mirror so the runtime
// codegen pipeline can run without a platform checkout. This script:
//   - platform present + specs equal   -> reports "in sync", exit 0
//   - platform present + specs differ  -> prints the drift, exit 1 (drift detectable);
//                                         with --write, copies platform -> vendored,
//                                         PRESERVING the vendored provenance header.
//   - platform NOT present             -> reports that the vendored copy is
//                                         authoritative here, exit 0.
//
// Comparison ignores each file's leading comment header (provenance vs none) by
// comparing from the first `openapi:` line onward.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { REPO_ROOT, VENDORED_SPEC_REL } from './openapi-spec.mjs';

const WRITE = process.argv.slice(2).includes('--write');

// Candidate locations for the platform spec: the submodule dir inside the runtime
// repo, or a sibling checkout next to it.
const PLATFORM_CANDIDATES = [
  join(REPO_ROOT, 'insimul-platform', 'openapi', 'insimul-v1.yaml'),
  join(REPO_ROOT, '..', 'insimul-platform', 'openapi', 'insimul-v1.yaml'),
];

const vendoredPath = join(REPO_ROOT, VENDORED_SPEC_REL);

/** Split a spec into { header, body } at the first `openapi:` line. */
function splitAtOpenapi(text) {
  const lines = text.split('\n');
  const i = lines.findIndex((l) => l.startsWith('openapi:'));
  if (i === -1) return { header: '', body: text };
  return { header: lines.slice(0, i).join('\n'), body: lines.slice(i).join('\n') };
}

function firstDiffLine(a, b) {
  const al = a.split('\n');
  const bl = b.split('\n');
  const n = Math.max(al.length, bl.length);
  for (let i = 0; i < n; i++) {
    if (al[i] !== bl[i]) {
      return `  L${i + 1}\n    vendored: ${JSON.stringify(al[i] ?? '<eof>')}\n    platform: ${JSON.stringify(bl[i] ?? '<eof>')}`;
    }
  }
  return '  (files differ only in trailing content)';
}

const platformPath = PLATFORM_CANDIDATES.find((p) => existsSync(p));

if (!platformPath) {
  console.log(
    '[openapi:sync] platform spec not found (insimul-platform not checked out).\n' +
      `  Probed:\n    ${PLATFORM_CANDIDATES.join('\n    ')}\n` +
      `  The vendored copy (${VENDORED_SPEC_REL}) is authoritative here.`,
  );
  process.exit(0);
}

const vendored = readFileSync(vendoredPath, 'utf8');
const platform = readFileSync(platformPath, 'utf8');
const vendoredBody = splitAtOpenapi(vendored).body;
const platformBody = splitAtOpenapi(platform).body;

if (vendoredBody === platformBody) {
  console.log(`[openapi:sync] in sync with ${platformPath}.`);
  process.exit(0);
}

if (WRITE) {
  // Preserve the vendored provenance header; replace only the spec body.
  const header = splitAtOpenapi(vendored).header;
  writeFileSync(vendoredPath, header + (header.endsWith('\n') ? '' : '\n') + platformBody);
  console.log(
    `[openapi:sync] updated ${VENDORED_SPEC_REL} from ${platformPath}.\n` +
      '  Now run `npm run codegen` and commit the regenerated client + operations.json.',
  );
  process.exit(0);
}

console.error(
  `[openapi:sync] DRIFT — vendored spec differs from ${platformPath}.\n` +
    firstDiffLine(vendoredBody, platformBody) +
    '\n  Re-sync with `npm run openapi:sync -- --write`, then `npm run codegen`.',
);
process.exit(1);
