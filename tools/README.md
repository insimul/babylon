# `tools/` — native-tree static syntax gates (US-EP3)

These gates give the Unity / Unreal / Godot packages the best no-editor breakage
detection available in this harness, so future PRDs (and the run-all verify gate)
catch a dropped brace or an unterminated string before it lands. Run them all with:

```sh
npm run engines:check     # -> node tools/engines-check.mjs
```

or individually:

```sh
node tools/verify-unity/check.mjs     # C#     (packages/unity/**/*.cs)
node tools/verify-godot/check.mjs     # GDScript (packages/godot/**/*.gd)
node tools/verify-unreal/check.mjs    # C++    (packages/unreal/**/*.{h,cpp,...})
```

Each exits non-zero on the first structural error; the orchestrator aggregates so
one failing gate does not hide the others.

## What these gates ARE (honest coverage statement)

The Unity/Godot/Unreal editors, the .NET SDK, the Godot headless binary, and the
Unreal Build Tool are **all unavailable in this harness**. A real compile is
therefore impossible. Every gate is instead a **structural** check driven by
`tools/lib/structural-syntax.mjs`, a language-aware lexer that tokenizes each file
(comments, string / char / raw / interpolated / verbatim / triple-quoted literals)
and asserts:

1. every `(` `[` `{` is closed by a matching `)` `]` `}` (no cross-nesting), and
2. every string / char literal and block comment is terminated.

This is exactly the class of breakage a fresh-context codegen or refactor pass is
most likely to introduce, and it is the class a bracket/literal balance check
catches reliably with **zero false positives on the committed corpus** (guarded by
`tools/lib/structural-syntax.test.mjs`, which runs under `npm test`).

## What these gates are NOT (limits per gate)

None of the gates parse a full grammar or resolve any symbol. They do **not** catch:

- type errors, undeclared identifiers, wrong overloads, or any semantic mistake;
- missing `#include` / `using` / `extends`, bad API usage, wrong signatures;
- anything that is syntactically balanced but wrong.

Gate-specific caveats:

| Gate | Extensions | Real tool (unavailable here) | Extra limit |
| --- | --- | --- | --- |
| **unity/C#** | `.cs` | `dotnet build` vs a UnityEngine-stubbed csproj | none beyond the shared limits — braces/strings/interpolation are fully lexed |
| **godot/GDScript** | `.gd` | `godot --headless --check-only` / `gdparse` | GDScript blocks are **indentation-** not brace-delimited, so this gate validates bracket + string structure but **not block nesting / indentation** — it is weaker for `.gd` than for C#/C++ |
| **unreal/C++** | `.h .hpp .cpp .cc .inl` | `clang++ -fsyntax-only` with UE headers + `ue-stubs.h` | `clang++` IS installed, but a UE translation unit cannot compile without the engine SDK (every `#include "CoreMinimal.h"` is a fatal missing header). `tools/verify-unreal/ue-stubs.h` ships the reflection-macro no-op stubs a real `-fsyntax-only` pass would force-include, so that path is one environment (real UE headers) away — see the header's top comment for the exact command. |

When any of these toolchains becomes available in CI, upgrade the corresponding
gate from structural to full-compile; the structural scan stays valuable as a fast
pre-filter.

## run-all verify integration

`npm run engines:check` is meant to be called by the workspace-parent
`scripts/ralph/run-all.sh` whenever `packages/{unity,unreal,godot}/**` files change,
alongside `npm run check` / `npm test`. That file lives in the workspace parent
(outside this repo), so the one-line edit is recorded in
`.chief/state/progress.txt` (US-EP3) for a human to apply — this PRD implements the
script; run-all just needs to call it.

## Unreal host conformance (US-XP2)

Beyond the structural gate, `engines:check` runs a **real** conformance step for
Unreal: `tools/verify-unreal/conformance.mjs` drives the golden Prolog corpus
(`packages/core/conformance/prolog/*.json`) through the C++ `InsimulKB` wrapper and
the actual `libinsimul` engine (the host mirror of the native `tests/conformance.c`
and the Unity `tools/verify-unity` corpus pass). It compares each case's solution
set to `expected` as an unordered multiset, prints a per-case `[PASS]/[FAIL]/[AMEND]`
table, and SKIPs the radiant corpus (libinsimul exposes no radiant tick yet).

Unlike the structural gate it needs the native toolchain, so it runs **only when
unreal sources changed AND `cmake` + a built `libinsimul.a` are present**, and SKIPs
(green) otherwise — `engines:check` therefore stays runnable without the native SDK.
Run it directly (building the lib on first use) with `npm run engines:unreal:host`;
point at a native checkout via `INSIMUL_NATIVE_ROOT`.
