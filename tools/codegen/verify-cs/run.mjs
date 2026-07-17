#!/usr/bin/env node
// run.mjs — compile-verify the generated C# DTOs (`npm run codegen:verify-cs`).
//
// Builds tools/codegen/verify-cs/InsimulCodegenVerify.csproj (net8.0, no Unity dep)
// so we prove the generated System.Text.Json DTOs compile on a stock .NET SDK.
//
// dotnet is NOT installed in every environment (e.g. this codegen harness has no
// .NET SDK). When absent, this prints a loud SKIP and exits 0 — a skip is NOT a
// pass; run it where `dotnet` is on PATH to get the real signal. When present, it
// runs `dotnet run` and exits with the build/run status.

import { execFileSync, spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function hasDotnet() {
  const probe = spawnSync('dotnet', ['--version'], { stdio: 'ignore' });
  return probe.status === 0;
}

if (!hasDotnet()) {
  console.warn(
    '\n[codegen:verify-cs] SKIPPED — `dotnet` not found on PATH.\n' +
      '  This is a SKIP, not a pass. Install the .NET 8 SDK and re-run\n' +
      '  `npm run codegen:verify-cs` to compile-check the generated C# DTOs.\n',
  );
  process.exit(0);
}

try {
  console.log('[codegen:verify-cs] dotnet run (net8.0 pure-DTO compile check)…');
  const out = execFileSync('dotnet', ['run', '--project', HERE, '-c', 'Release'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  process.stdout.write(out);
  console.log('[codegen:verify-cs] OK — generated C# DTOs compile and roundtrip.');
  process.exit(0);
} catch (err) {
  console.error('[codegen:verify-cs] FAILED — generated C# did not compile/run.');
  process.exit(err.status ?? 1);
}
