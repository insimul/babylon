# Generated C++ DTOs (`Insimul::Generated`)

**Do not edit these files by hand.** They are emitted by the runtime codegen
pipeline from the canonical `@insimul/core` JSON Schemas.

- **Regenerate:** `npm run codegen` (from the `insimul-runtime` root)
- **Source of truth:** `packages/core/schemas/{save-file,save-envelope,world-ir}.schema.json`
- **Emitter:** `tools/codegen/emit-cpp.mjs` (quicktype → nlohmann::json, C++17)
- **Drift guard:** `tools/codegen/__tests__/codegen-drift.test.ts` regenerates into
  a temp dir and byte-diffs against these committed files; CI fails on drift.
- **Compile check:** `npm run codegen:verify-cpp` runs
  `clang++ -std=c++17 -fsyntax-only` over `InsimulGenerated.h` (a full UE build
  isn't available in the harness).

## What's here

`InsimulGenerated.h` — plain C++ structs for `SaveFile`, `SaveFileEnvelope`, and
`WorldIr` (plus their nested types), each with generated `from_json` / `to_json`
functions. It depends only on the vendored single header
`../../ThirdParty/nlohmann/json.hpp` (nlohmann/json v3.11.3, MIT) — no boost, no
other third-party deps.

## The UStruct-boundary convention (plan §1.3)

**These are plain `struct`s, NOT Unreal `USTRUCT`s.** They are the wire/DTO layer:
they mirror the schema shapes exactly and (de)serialize JSON via nlohmann::json.
They deliberately carry no `UCLASS`/`USTRUCT`/`UPROPERTY` reflection macros, no
`FString`/`TArray`/`TMap`, and no engine headers — so they compile and drift-check
without the Unreal toolchain, and stay a faithful 1:1 image of the core schemas.

The **hand-written UStruct mapping layer stays in `InsimulTypes.h`** (the
`FInsimul*` reflected types the rest of the plugin, Blueprints, and the editor
use). It **converts at the boundary**: parse incoming JSON into the generated
plain structs, then copy field-by-field into the `FInsimul*` UStructs (and back
out on save). Keeping the two layers separate means:

- The generated DTOs can regenerate freely on any schema change without disturbing
  the reflected types Blueprints bind to.
- The UStruct layer can add engine-facing niceties (defaults, `UPROPERTY`
  metadata, editor categories) that have no place in a schema-derived DTO.

When a schema field is added, regenerate here, then extend the boundary mapping in
`InsimulTypes.h` to carry the new field across.
