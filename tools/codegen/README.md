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
| C# REST client | `packages/unity/Runtime/Generated/Api/InsimulApiClient.cs` | US-CG4 |
| Operation table | `packages/core/openapi/operations.json`        | US-CG4 |

## OpenAPI → REST client + operation table (US-CG4)

The REST surface is generated from a **vendored** copy of the platform's OpenAPI
spec at `packages/core/openapi/insimul-v1.yaml` (mirror of
`insimul-platform/openapi/insimul-v1.yaml`; the platform repo stays the source of
truth). Keep it in step with:

- `npm run openapi:sync` — diff the vendored copy against the platform spec (when
  `insimul-platform` is checked out beside/inside the runtime); exit 1 on drift.
- `npm run openapi:sync -- --write` — copy the platform spec into the vendored
  path, preserving the vendored provenance header. Then `npm run codegen`.

From that spec the pipeline emits, deterministically:

- **`InsimulApiClient.cs`** — a `System.Net.Http` REST client (namespace
  `Insimul.Generated.Api`). Transport-agnostic: the Unity plugin adapts it to
  `UnityWebRequest` at the boundary (see the generated `Api/README.md` and
  `InsimulHttpClient.cs`). JSON ops return the deserialized model; streaming
  (`text/event-stream`) ops return the raw `HttpResponseMessage`.
- **`operations.json`** — a machine-readable operation table (`operationId` /
  `method` / `path` / params) the hand-written C++ (Unreal) and GDScript (Godot)
  HTTP wrappers consume and check themselves against, so all three engines pin to
  one operation set.

> A **custom emitter** (`emit-csharp-api.mjs`), not NSwag / openapi-generator —
> for the same reason the GDScript emitter is hand-rolled: the drift guard needs
> byte-identical, offline, deterministic output, which the version-stamped,
> toolchain-heavy generators fight.

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
- `emit-cpp.mjs` — C++ (nlohmann::json, C++17) emitter (US-CG2).
- `emit-gdscript.mjs` — Godot 4 GDScript emitter (US-CG3); hand-rolled, since
  quicktype has no GDScript target. One `class_name Insimul*` script per top-level
  schema, with `from_dict`/`to_dict` and per-field validation.
- `openapi-spec.mjs` — loads/parses the vendored OpenAPI spec and flattens it into
  the deterministic operation list (`collectOperations`) shared by both OpenAPI
  emitters and the drift guard.
- `emit-operations.mjs` — emits `packages/core/openapi/operations.json` (US-CG4).
- `emit-csharp-api.mjs` — emits the `System.Net.Http` C# REST client (US-CG4).
- `openapi-sync.mjs` — `npm run openapi:sync`; diff/copy the vendored spec vs the
  platform source of truth.
- `gdscript-verify.mjs` — the structural self-test (`structuralCheck`,
  `collectSchemaKeys`) shared by the verify runner and the emitter unit test.
- `verify-cs/` — a net8.0, Unity-free console project + `run.mjs` that compiles the
  generated DTOs on a stock .NET SDK (`npm run codegen:verify-cs`). Skips loudly
  when `dotnet` is not on PATH.
- `verify-cpp/` — a clang++/g++ `-fsyntax-only` smoke build over the generated
  header (`npm run codegen:verify-cpp`).
- `verify-gdscript/` — `run.mjs` runs `godot --headless --check-only` when a `godot`
  binary is on PATH, else the structural self-test (`npm run codegen:verify-gdscript`).

## Determinism

quicktype output is a pure function of (schema, quicktype version, flags). The
version is pinned in the root `package.json` devDependencies, and `quicktype-runner`
invokes that exact install — so two runs produce byte-identical output.

## Adding / changing a type

1. Change the zod schema in `@insimul/core` and run `npm run schemas` there.
2. `npm run codegen` at the root; commit the regenerated `Generated/` files.
3. `npm test` (drift guard) + the per-lang verify scripts: `codegen:verify-cs`
   (needs a .NET SDK), `codegen:verify-cpp` (clang++/g++), `codegen:verify-gdscript`
   (godot if present, else the structural self-test).
