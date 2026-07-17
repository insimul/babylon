#!/usr/bin/env node
// Unity C# static syntax gate (US-EP3).
//
// COVERAGE: structural only. The .NET SDK / Unity editor are NOT available in
// this harness, so a real `dotnet build` against a UnityEngine-stubbed csproj
// cannot run here. Instead we scan every C# source (Runtime/, Editor/, and the
// templates/ game-template scripts) with the language-aware structural lexer in
// tools/lib/structural-syntax.mjs: balanced ( [ { }, terminated string / char /
// interpolated / verbatim literals and block comments. This catches gross
// syntactic breakage; it does NOT catch type errors or bad API usage. See
// tools/README.md for the full coverage statement and the (future) dotnet path.

import { runGate, printGate } from '../lib/run-gate.mjs';

export const GATE = { name: 'unity/C#', lang: 'cs', dir: 'packages/unity', exts: ['.cs'] };

export function run() {
  return runGate(GATE);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const res = run();
  console.log('Unity C# structural syntax gate');
  printGate(res);
  process.exit(res.ok ? 0 : 1);
}
