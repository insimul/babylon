# Unity DTO migration — hand-mirrored → generated

**Status:** in progress (codegen-pipeline PRD). Generated DTOs now exist; the
hand-written template DTOs are **not deleted yet** — they still serve the current
export pipeline.

## What changed

`npm run codegen` (root) reads the canonical JSON Schemas emitted by
`@insimul/core` —

- `packages/core/schemas/save-file.schema.json`
- `packages/core/schemas/save-envelope.schema.json`
- `packages/core/schemas/world-ir.schema.json`

— and emits C# DTOs into:

```
packages/unity/Runtime/Generated/InsimulGenerated.cs   (namespace Insimul.Generated)
```

covering `SaveFile`, `SaveFileEnvelope`, and `WorldIr` (+ nested `CurrentState`,
`WorldSnapshot`, `World`, `Meta`, and the `Status` / `Format` enums). The file is
**committed** (engines can't run npm) and guarded against drift by a vitest test
(`tools/codegen/__tests__/codegen-drift.test.ts`): it regenerates into a temp dir
and fails if the committed bytes differ, so a schema change without a regenerate
is caught in CI.

## Replacement path (do NOT delete yet)

Today these hand-maintained parallel re-declarations are the drift-prone status quo:

- `packages/unity/templates/scripts/data/*.cs` — 15 `Insimul*Data.cs` files
  (`InsimulWorldIR.cs`, `InsimulCharacterData.cs`, `InsimulQuestData.cs`, …) used by
  the **game export/runtime templates**.
- `packages/unity/Runtime/InsimulTypes.cs` — the SDK-side type surface.

The migration order (later stories in this and the per-engine runtime PRDs):

1. **US-CG1 (this story):** generate the schema-derived DTOs alongside the
   hand-written ones. No deletions. ✅
2. **US-CG5:** point the *live SDK* code (`Runtime/InsimulTypes.cs`) at the
   generated `Insimul.Generated` namespace for types that duplicate schema shapes.
   Conversation-event types stay hand-written (they are proto-derived). Add a
   type-provenance table to this package's README.
3. **Per-engine Unity runtime PRD (out of scope here):** retire the
   `templates/scripts/data/*.cs` re-declarations once the export pipeline consumes
   the generated DTOs. Those `.cs` are the *last* to go because a shipped game
   vendors them directly.

## Regenerating

```
npm run codegen            # regenerate all native DTOs
npm run codegen:verify-cs  # compile-check the C# on a stock .NET 8 SDK (skips if no dotnet)
npm test                   # includes the codegen drift guard
```

Never edit `Runtime/Generated/*.cs` by hand — change the core schema and rerun
`npm run codegen`.
