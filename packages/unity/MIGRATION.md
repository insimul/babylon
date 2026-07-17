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

1. **US-CG1:** generate the schema-derived DTOs alongside the
   hand-written ones. No deletions. ✅
2. **US-CG5 (this story):** audited the *live SDK* code (`Runtime/`) for types that
   duplicate the generated schema DTOs. **None were found** — the SDK carries no
   `SaveFile`/`SaveFileEnvelope`/`WorldIr` re-declaration. Its one world-data type,
   `InsimulExportedWorld`, is the *distilled offline export* (`world_export.json`) —
   a flattened dialogue-context shape, not the schema `WorldIr`, read via Unity's
   `JsonUtility` (which can't deserialize the `Dictionary<string, object>` sections
   a schema-faithful `WorldIr` needs) — so it stays hand-written. Conversation-event
   types stay hand-written (proto-derived). Added a **type-provenance table** to the
   unity / unreal / godot READMEs (generated / hand-written / template-legacy) and a
   documented **Unity-batchmode compile check** for the `Runtime/` SDK (which can't
   compile under the pure-.NET `verify-cs` project because it depends on
   `UnityEngine`). New save/load or World-IR code should consume `Insimul.Generated`. ✅
3. **Per-engine Unity runtime PRD (out of scope here):** retire the
   `templates/scripts/data/*.cs` re-declarations once the export pipeline consumes
   the generated DTOs. Those `.cs` are the *last* to go because a shipped game
   vendors them directly.

## World loading via generated DTOs (US-UC1)

`Runtime/World/InsimulWorldSource.cs` is the new engine-agnostic world-loading
core. It reads world data — either a **SaveFile's embedded `worldSnapshot`** or a
**WorldIR export** — through the generated `Insimul.Generated` DTOs and
**`System.Text.Json`**, and exposes typed accessors (`Characters`, `Settlements`,
`Lots`, `Items`, `Quests`, plus `QuestPrologContent()` for the authored Prolog
`content` strings). It ports the world-snapshot version-compatibility semantics
from `packages/core/src/world-snapshot-version.ts` (`WorldSnapshotVersion`): a save
whose snapshot is ahead of, or more than `MAX_COMPATIBLE_VERSION_GAP` (50) behind,
the current world is **rejected** with the documented message.

`Runtime/World/StreamingAssetsWorldSource.cs` is the thin Unity adapter — it only
reads the JSON bytes off `Application.streamingAssetsPath` (with a `UnityWebRequest`
coroutine variant for Android) and hands the text to the core. No parsing logic
lives there, so the two runtimes can't diverge.

### Why System.Text.Json, not JsonUtility (the Unity compatibility choice)

Unity's built-in `JsonUtility` cannot deserialize the schema-faithful DTO shapes:
it has no support for `Dictionary<string, object>` (the WorldIR sections and
`CurrentState` maps) or `object[]` (the weakly-typed snapshot entity arrays), and
it silently drops such fields. The generated DTOs are therefore consumed with
`System.Text.Json` (the same serializer used by the `Runtime/Prolog` conformance
stack). In a Unity build this requires the `System.Text.Json` assembly to be
present under `Runtime/Plugins/` (see `Runtime/Plugins/README.md`), exactly as the
Prolog wrapper already needs it. **New world/save/World-IR code MUST use
`System.Text.Json` + `Insimul.Generated`, never `JsonUtility`.**

### Incremental retirement mapping (template `data/*.cs`)

These hand-written template `data/*.cs` classes duplicate world shapes that
`InsimulWorldSource` now covers. They are **not deleted yet** (a shipped game still
vendors them for the export pipeline / `JsonUtility` scene load); this table is the
retirement map as each consumer moves onto the generated path:

| Template `data/*.cs`                         | Superseded by                                   |
| -------------------------------------------- | ----------------------------------------------- |
| `InsimulWorldIR.cs`                          | `Insimul.Generated.WorldIr` + `InsimulWorldSource` |
| `InsimulCharacterData.cs`, `InsimulNPCData.cs` | `InsimulWorldSource.Characters` (`WorldEntity`) |
| `InsimulSettlementData.cs`                   | `InsimulWorldSource.Settlements`                |
| `InsimulLotData.cs`, `InsimulBuildingData.cs` | `InsimulWorldSource.Lots`                        |
| `InsimulQuestData.cs`                        | `InsimulWorldSource.Quests` / `QuestPrologContent()` |
| `InsimulRuleData.cs`, `InsimulActionData.cs` | `worldSnapshot.rules` / `.actions` (quest-as-Prolog path, US-UC3) |

Not superseded (kept hand-written, out of scope for world loading):
`InsimulAIConfig.cs`, `InsimulAnimationData.cs`, `InsimulAssetManifest.cs`,
`InsimulBiomeZoneData.cs`, `InsimulWaterFeatureData.cs`, `InsimulDialogueContext.cs`
— these are presentation/asset/dialogue-context concerns, not schema world data.

## Regenerating

```
npm run codegen            # regenerate all native DTOs
npm run codegen:verify-cs  # compile-check the C# on a stock .NET 8 SDK (skips if no dotnet)
npm test                   # includes the codegen drift guard
```

Never edit `Runtime/Generated/*.cs` by hand — change the core schema and rerun
`npm run codegen`.
