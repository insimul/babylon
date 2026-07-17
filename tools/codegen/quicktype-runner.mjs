// quicktype-runner.mjs — locate and invoke the pinned local quicktype CLI.
//
// We invoke the version pinned in the root package.json devDependencies (resolved
// through node's module resolution) rather than `npx quicktype`, so codegen is
// deterministic and offline: the same quicktype version always produces the same
// bytes. quicktype prints per-field "cannot infer this type" notices to stderr for
// our permissive (empty `items: {}`) array schemas — those are informational and
// suppressed here; only a non-zero exit is treated as failure.

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

/** Resolve the quicktype CLI entrypoint (dist/index.js) from node_modules. */
function resolveQuicktypeCli() {
  // quicktype's package.json declares `bin.quicktype -> dist/index.js`; resolving
  // the package root's package.json lets us join that path portably regardless of
  // where npm hoisted it (this repo vs a workspace-parent node_modules).
  const pkgJsonPath = require.resolve('quicktype/package.json');
  const pkgRoot = pkgJsonPath.slice(0, -'/package.json'.length);
  const pkg = require('quicktype/package.json');
  const binRel =
    typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.quicktype ?? 'dist/index.js';
  return join(pkgRoot, binRel);
}

/**
 * Run quicktype over a JSON Schema object and return generated source as a string.
 *
 * @param {object} schema  the JSON Schema document (will be written to a temp file)
 * @param {string[]} args  quicktype CLI args (lang/namespace/framework/top-level…)
 * @returns {string} generated source text (stdout)
 */
export function runQuicktypeOnSchema(schema, args) {
  const cli = resolveQuicktypeCli();
  const dir = mkdtempSync(join(tmpdir(), 'insimul-codegen-'));
  const schemaFile = join(dir, 'merged.schema.json');
  try {
    writeFileSync(schemaFile, JSON.stringify(schema));
    return execFileSync(
      process.execPath,
      [cli, '--src-lang', 'schema', ...args, schemaFile],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
