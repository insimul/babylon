# verify-unity — host-side gate for the Unity native Prolog engine

A dependency-free .NET 8 console harness that compiles the **pure** C# under
`packages/unity/Runtime/Prolog/` (which has zero `UnityEngine` references, by
design) and exercises it against a **real, locally built libinsimul** — no Unity
editor required.

This exists because Unity editor/batchmode is not available in the agent
harness. All engine logic is verified here; the thin Unity glue (asmdef wiring,
`.meta` import settings) is human-verified separately (`autoMerge` is off for
this branch).

## Running

```bash
# Build libinsimul + run the full suite (native + pure):
tools/verify-unity/run.sh

# Pure tests only (no native library, no C toolchain needed):
tools/verify-unity/run.sh --pure
```

`run.sh` locates the native library in this order:

1. `INSIMUL_NATIVE_LIB` — path to a prebuilt `libinsimul.{dylib,so,dll}` (build skipped).
2. `INSIMUL_NATIVE_DIR` — path to the `insimul-native` source tree (built with cmake).
3. `../insimul-native` or `../../insimul-native` relative to the repo root.

It then puts the library on the platform loader path (`DYLD_LIBRARY_PATH` /
`LD_LIBRARY_PATH` / `PATH`) and runs the harness. Exit code `0` = all green.

## What it covers

- **Pure (`ParseBindingSet`)** — binding-set JSON parsing (atoms→string,
  integers→number, empty object, malformed/non-object rejection). Runs with no
  native library.
- **Pure (version handshake, US-UP3)** — `ParseSemver` and `CheckNativeVersion`
  with **mocked** version stamps: exact/patch-drift compatibility and
  major/minor/unparseable mismatch paths, none of which touch the native library.
- **Native** — version handshake (`VerifyNativeVersion` against the real library);
  consult/assert/retract; query with single,
  ground, failing, multiple, and rule-unification solutions; snapshot→restore
  round-trip; **disposal safety** (double-dispose; query iterator after KB
  dispose throws `ObjectDisposedException`; method-after-dispose throws); and
  **thread affinity** (cross-thread use throws `InvalidOperationException`).
- **Conformance corpus (US-UP2)** — every
  `packages/core/conformance/prolog/*.json` case run through the real engine and
  compared to `expected` as an unordered multiset, via the shared runner
  `packages/unity/Tests/Editor/ConformanceCorpus.cs` (also driven in-editor by
  the `Insimul.Tests.Editor` NUnit assembly). Radiant cases are skipped (the ABI
  exposes no radiant tick yet).

## Notes

- The harness references the runtime source in place via `<Compile Include>` —
  it never vendors a copy, so it always tests the shipping code.
- `System.Text.Json` is part of the .NET 8 runtime, so no NuGet restore is
  needed here. In Unity, the same type requires a Plugins DLL (see
  `packages/unity/Runtime/Prolog/CLAUDE.md`).
