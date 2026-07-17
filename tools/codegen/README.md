# tools/codegen — cross-language DTO codegen

`npm run codegen` (from the insimul-runtime root) reads the canonical JSON Schemas
emitted by `@insimul/core` and emits native DTOs into the engine packages,
replacing the hand-mirrored, drift-prone type re-declarations.

> Generated code is **committed** (engines can't run npm). A vitest drift guard
> regenerates into a temp dir and fails on any diff — see
> `__tests__/codegen-drift.test.ts`.

## Sources

- `packages/core/schemas/save-file.schema.json`     → `SaveFile`
- `packages/core/schemas/save-envelope.schema.json` → `SaveFileEnvelope`
- `packages/core/schemas/world-ir.schema.json`      → `WorldIR`

## Targets

| Lang     | Output                                              | Story  |
| -------- | --------------------------------------------------- | ------ |
| C#       | `packages/unity/Runtime/Generated/InsimulGenerated.cs` | US-CG1 |
| C++      | `packages/unreal/Source/InsimulRuntime/Generated/`  | US-CG2 |
| GDScript | `packages/godot/addons/insimul/generated/`          | US-CG3 |

## Files

- `index.mjs` — entrypoint; runs every generator in `GENERATORS`. `--out <dir>`
  redirects the base dir (the drift guard writes into a temp dir).
- `build-merged-schema.mjs` — merges the three core schemas into ONE JSON Schema
  document with a wrapper root (`InsimulSchemas`). See the header there for why:
  quicktype emits shared serialization helpers once per output file, so all types
  must live in a single file; a single `$ref`-linked document also dedupes the
  `SaveFile` tree that the envelope embeds inline.
- `quicktype-runner.mjs` — locates and invokes the pinned local `quicktype`
  (deterministic/offline; not `npx`).
- `emit-csharp.mjs` — C# (System.Text.Json) emitter (US-CG1).
- `verify-cs/` — a net8.0, Unity-free console project + `run.mjs` that compiles the
  generated DTOs on a stock .NET SDK (`npm run codegen:verify-cs`). Skips loudly
  when `dotnet` is not on PATH.

## Determinism

quicktype output is a pure function of (schema, quicktype version, flags). The
version is pinned in the root `package.json` devDependencies, and `quicktype-runner`
invokes that exact install — so two runs produce byte-identical output.

## Adding / changing a type

1. Change the zod schema in `@insimul/core` and run `npm run schemas` there.
2. `npm run codegen` at the root; commit the regenerated `Generated/` files.
3. `npm test` (drift guard) + `npm run codegen:verify-cs` where a .NET SDK exists.
