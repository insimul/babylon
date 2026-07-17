#!/usr/bin/env node
// Unreal C++ static syntax gate (US-EP3).
//
// COVERAGE: structural only. The Unreal Build Tool and the engine headers
// (CoreMinimal.h, Engine/*, GameFramework/*, …) are NOT available in this
// harness. clang++ IS present, but `clang++ -fsyntax-only` on a UE translation
// unit is infeasible without the full engine SDK (every #include would be a
// fatal missing-header error, so clean code could never pass). We therefore scan
// every .h/.cpp (Source/InsimulRuntime + templates/) with the structural lexer
// in tools/lib/structural-syntax.mjs: balanced ( [ { }, terminated string / char
// / R"(...)" raw literals and /*...*/ comments — catching gross breakage only.
//
// tools/verify-unreal/ue-stubs.h ships the UCLASS/UPROPERTY/GENERATED_BODY no-op
// macro stubs a REAL `clang++ -fsyntax-only` pass would force-include, so that
// path is one env (real UE headers) away. See tools/README.md for limits.

import { runGate, printGate } from '../lib/run-gate.mjs';

export const GATE = { name: 'unreal/C++', lang: 'cpp', dir: 'packages/unreal', exts: ['.h', '.hpp', '.cpp', '.cc', '.inl'] };

export function run() {
  return runGate(GATE);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const res = run();
  console.log('Unreal C++ structural syntax gate');
  printGate(res);
  process.exit(res.ok ? 0 : 1);
}
