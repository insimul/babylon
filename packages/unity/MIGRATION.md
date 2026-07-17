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

## Portable save system (US-UC2)

`Runtime/Save/InsimulSaveSystem.cs` + `Runtime/Save/JsonVal.cs` are the new
engine-agnostic save core — the C# port of the semantics authority in
`packages/core/src` (`save-file.ts`, `save-envelope.ts`, `save-file-migrations.ts`,
`save-extensions.ts`) and the twin of the Unreal
`Source/InsimulRuntime/Portable/InsimulSaveSystem.*`. It implements:

- **new-game** construction of a fresh, current-version `SaveFile` (embeds the
  read-only `worldSnapshot`, initializes `currentState` defaults, empty
  `prologFacts`),
- **load + version-gated migration** up to `SaveFileVersion` (v1→v2 language-
  progress backfill, v2→v3 snapshot-version stamping) PLUS the unconditional
  `migrateExtensions()` extension-registry backfill,
- **canonical-JSON serialization + SHA-256 integrity** byte-compatible with
  `computeSaveFileIntegrity()` — `CanonicalJson` in `JsonVal.cs` reproduces
  `JSON.stringify(sortDeep(value))` exactly (ordinal-sorted keys, ECMAScript
  number rendering, JSON string escaping),
- **export/import Envelope** build + validation (`insimul-save-v2`), and
- **`SnapshotFacts` / `RestoreFacts`** over `currentState.prologFacts` (the
  canonical truth the Prolog runtime hydrates from — `save.currentState` ONLY;
  `worldSnapshot` is never mutated).

`Runtime/Save/PersistentDataSaveStore.cs` is the thin Unity adapter — local slot
files under `Application.persistentDataPath/saves/slot-N.json` (atomic temp-then-
move writes) plus an `IInsimulSaveSync` server-sync seam. It holds no save-format
logic, so the runtimes can't diverge. **Server sync note:** the v1 saves API is
*not* in the currently-generated OpenAPI surface (only conversation endpoints are
emitted), so `IInsimulSaveSync` is a game-supplied hook rather than a generated
client call; envelopes are the wire format.

### Why System.Text.Json, not JsonUtility

Same rationale as US-UC1: `JsonUtility` cannot round-trip the schema-faithful
`Dictionary<string,object>` / `object[]` sections and would silently drop them.
`System.Text.Json` is used ONLY to bootstrap-parse into the mutable `JsonVal`
tree; **all canonical output is emitted by the hand-rolled `CanonicalJson` writer,
never by `System.Text.Json`**, so the integrity bytes are reproducible across the
TS / Unreal / Unity runtimes.

### The portability contract (cross-runtime parity)

- `tools/verify-unity/Program.cs` (`RunSaveSystemTests`, host-side gate) asserts
  the C# `CanonicalJson.Integrity` of each golden fixture equals the committed
  vector in `packages/core/conformance/saves/integrity-vectors.json`, and that
  loading+migrating `v1-minimal`/`v2-typical` reproduces the **byte-identical
  TS-migration golden** (`Tests/Editor/fixtures/save/*.migrated.canonical.json`,
  regenerate via a `vite-node` dump — never hand-author).
- `tools/verify-unity/cross-check.mjs` (node side, run via `vite-node`) recomputes
  the same vectors from the TS authority and validates a C#-produced envelope
  (written by the dotnet run to `tools/verify-unity/cross-check/`) via
  `validateSaveFileEnvelope` + the zod schemas — THE PORTABILITY TEST. On a box
  without the .NET SDK the envelope leg reports PENDING (autoMerge is off; CI runs
  the dotnet half).

### Retired template file

| Template file (retirement pending export-pipeline cutover) | Superseded by |
| ---------------------------------------------------------- | ------------- |
| `templates/scripts/systems/SaveSystem.cs`                  | `Runtime/Save/InsimulSaveSystem.cs` + `PersistentDataSaveStore.cs` |

Not deleted yet — a shipped game still vendors `SaveSystem.cs` for the current
export/scene path; it retires once the template bootstrap (US-UC5) consumes the
new core.

## US-UC3 — Quest system on real Prolog

`Runtime/Quest/` rebuilds the template quest layer on the real KB, porting the
semantics (not the code) of `packages/core/src/prolog/quest-hydrator.ts` and the
`QuestCompletionEngine` completion pattern, matching the Unreal twin
(`packages/unreal/Source/InsimulRuntime/Portable/InsimulQuestSystem.*`):

- **`Runtime/Quest/InsimulQuestSystem.cs`** — the UnityEngine-free portable core.
  `HydrateFromContent(content, status)` parses the quest's Prolog `content` (the
  single source of truth) into a `HydratedQuest` — title/type/difficulty/status,
  objectives (the same three goal-mapping tables as the hydrator), rewards
  (`quest_reward/3`, experience promoted), prerequisites, tags, completion
  criteria. `ToProjection()` emits the present-only projection, serialized by
  `CanonicalJson` **byte-identical to `hydrateQuestFromProlog`**. Completion is
  **query-driven** over an `InsimulKB` (the `currentState.prologFacts` fact store):
  `IsObjectiveSatisfied` reads trigger facts (`objective_satisfied/2`, or
  `talked_to`/`visited`/`delivered(player, target)`); `EvaluateQuest` asserts
  `quest_objective_complete/2` per satisfied objective and, when all are satisfied
  under an all-objectives criterion, asserts `quest_complete/1` and flips the
  status to `completed` (the fact-asserting transition).
- **`Runtime/Quest/InsimulQuestRuntime.cs`** — the stateful shell (UnityEngine-free)
  that owns the KB + registered quests and **preserves the template QuestSystem
  events** (`OnQuestAccepted`, `OnObjectiveCompleted`, `OnQuestCompleted`) so UI
  code keeps working. `AssertFact` records a trigger fact, `EvaluateQuest`
  re-checks + broadcasts new transitions, `GetExperienceReward` reads the reward
  from Prolog. Save/load is KB-backed: `Facts` → `InsimulSaveSystem.SnapshotFacts`;
  `LoadFacts(RestoreFacts())` restores + re-derives each quest's status from the
  restored `quest_complete` facts.

### The quest parity contract

- `tools/verify-unity/Program.cs` (`RunQuestSystemTests`, host-side gate) asserts
  `HydrateCanonical` reproduces every committed `expected` projection in
  `packages/core/conformance/quests/hydration-cases.json` — the SAME golden JSON
  the TS drift guard (`quest-goldens-crosscheck.test.ts`) and the Unreal host
  harness (`test_quest_system.cpp`) read, so a semantics change surfaces in every
  gate. It also exercises fact-driven completion (status flip + asserted facts +
  fired events), rewards-read-from-Prolog, and save/load round-trip; the native
  section (`RunQuestKbRoundTripNative`) mirrors the asserted facts into a real
  `InsimulProlog` KB and confirms `quest_complete`/`quest_objective_complete` are
  queryable.
- A grep-guard in `scripts/engines-check.sh` fails if the quest core hardcodes a
  denormalized `ExperienceReward = <number>` — rewards come from `quest_reward/3`.
- On a box without the .NET SDK the host tests SKIP (autoMerge is off; CI runs the
  dotnet half). The C# hydration logic is proven against the goldens via a JS
  transliteration during development (see progress.txt).

### Retired template file

| Template file (retirement pending export-pipeline cutover) | Superseded by |
| ---------------------------------------------------------- | ------------- |
| `templates/scripts/systems/QuestSystem.cs` (in-memory completion twin) | `Runtime/Quest/InsimulQuestSystem.cs` + `InsimulQuestRuntime.cs` |
| `templates/scripts/systems/QuestCompletionManager.cs`      | `InsimulQuestSystem.EvaluateQuest` (KB-backed completion) |

Not deleted yet — a shipped game still vendors these for the current export/scene
path; they retire once the template bootstrap (US-UC5) forwards its MonoBehaviour
events to `InsimulQuestRuntime`.

## US-UC4 — Radiant tick

`Runtime/Radiant/InsimulRadiantEngine.cs` ports the radiant slot-filling
generator (`packages/core/src/radiant/radiant-engine.ts`) — a byte-for-byte C#
twin of `generateRadiantQuests`. It is a **semantics port, not a native tick**:
the radiant generator is Prolog template DATA + a fixed deterministic algorithm,
so it re-implements the algorithm over the SAME real KB (via the `IRadiantSolver`
seam) rather than needing a `libinsimul` radiant entry point.

- **Determinism (the conformance contract)**: candidate slot fills come from the
  real Prolog engine, are CANONICALLY SORTED here (never trust engine enumeration
  order), and exactly one is chosen with a seeded `mulberry32` RNG (the same
  uint32 arithmetic as the TS reference). Templates process in sorted TplId order.
  Same `(kb, seed, now)` ⇒ byte-identical `questContent` / `factsToAssert` /
  `factsToRetract`.
- **Native backing**: `Runtime/Radiant/InsimulPrologRadiantSolver.cs` wraps an
  `InsimulProlog` session so preconditions / exclusions / cooldowns solve against
  the real `libinsimul` KB (the same engine the Prolog conformance corpus uses).
- **Wiring**: `InsimulQuestRuntime.RunRadiantTick(program, solver, opts)` generates
  side quests, registers each (`RegisterQuest`), folds its provenance / cooldown
  bookkeeping into `currentState.prologFacts` (retract-then-assert), and fires
  `OnRadiantQuestGenerated`. The caller triggers it on the same events as the
  Babylon `RadiantQuestDirector` (time tick / quest board open / quest completion).
  The read-only `worldSnapshot` is never touched — this runtime only mutates the KB.

### Verification

- `RadiantCorpus.cs` (framework-agnostic) + `RadiantCorpusTests.cs` (Unity NUnit)
  run every case in `packages/core/conformance/radiant/*.json` through the engine
  backed by the real `InsimulProlog`; `tools/verify-unity/Program.cs`
  (`RunRadiantConformance`) is the authoritative host gate.
- `RunRadiantPureTests` (Program.cs) + the pure NUnit tests drive the deterministic
  engine with a `StubRadiantSolver` (no native library): seed-driven pick,
  cooldown/exclusion suppression, and the tick-folds-into-quest-system +
  worldSnapshot-byte-stable assertions.
- On a box without the .NET SDK the host tests SKIP (autoMerge is off; CI runs the
  dotnet half). The C# parser + uint32 RNG + serialization are proven byte-identical
  to all 11 golden corpus cases via a JS transliteration during development (see
  progress.txt).

### Retired template file

None — radiant generation is a NEW capability (the template `QuestSystem.cs`
prototype had no procedural/radiant quest generation).

## US-UC5 — Template bootstrap integration + human checklist

`Runtime/InsimulRuntimeContext.cs` is the new **startup orchestrator** — the
UnityEngine-free, host-testable core (the Unity twin of the Unreal
`FInsimulRuntimeContext`) that ties the four US-UC1..UC4 cores into the single full
loop the game template drives:

```
world source  ->  save slot select / new-game  ->  KB up  ->  systems init
```

- **`Boot(existingSaveJson, fallbackWorldSnapshotJson, options)`** — resume a valid
  save (integrity-checked, migrated up) or, if there is none / it is corrupt /
  incompatible, start a **new game** from the golden world. A bad slot never bricks
  the boot. `StartNewGame` / `LoadFromSave` are the explicit entry points.
- **Rehydrate** builds `InsimulWorldSource` off the SaveFile's embedded
  `worldSnapshot`, registers every world quest's Prolog `content` into the
  `InsimulQuestRuntime`, and restores the KB from `currentState.prologFacts` (which
  re-derives each quest's completion).
- **`CommitToSave`** snapshots the live KB back into `currentState.prologFacts`;
  **`EvaluateAllQuests`** applies the fact-asserting quest transitions;
  **`RunRadiantTick`** drives the deterministic radiant generator. The read-only
  `worldSnapshot` is never mutated, so **`WorldSnapshotIntegrity()`** stays
  byte-stable across a commit + save/reload (§5.2 B2).

`templates/scripts/core/InsimulRuntimeBootstrap.cs` is the thin Unity
(MonoBehaviour) layer over it — structural-gate only (UnityEngine-coupled). It
reads the StreamingAssets world, picks a save slot (`PersistentDataSaveStore`),
stands up the native Prolog KB, and **bridges the existing template
`Insimul.Systems.QuestSystem` MonoBehaviour to the runtime without rewriting it**:
it subscribes to that MonoBehaviour's public gameplay events and feeds them into the
runtime KB as trigger facts, then re-evaluates. The runtime's own events
(`OnQuestAccepted` / `OnObjectiveCompleted` / `OnQuestCompleted`, US-UC3) keep the
same signatures the template exposed, so shipped UI keeps working.

### Verification

- `tools/verify-unity/Program.cs` (`RunBootstrapTests`) is the authoritative host
  gate: new-game boot, resume, corrupt-save fallback, both-bad clean failure,
  commit round-trip + worldSnapshot hash stability, `EvaluateAllQuests`, and
  envelope validation. `Tests/Editor/BootstrapTests.cs` mirrors it as an EditMode
  NUnit fixture. On a box without the .NET SDK the host tests SKIP (autoMerge off;
  CI runs the dotnet half).
- The human pass is `packages/unity/VERIFICATION.md` (referenced from
  `.chief/state/progress.txt`) — the editor-only full gameplay loop.
- **Babylon behaviour-reference deltas: target zero, achieved.** See
  `VERIFICATION.md` §3 for the (non-semantic, seam-level) differences and why none
  changes observable save/quest/world semantics.

### Retired template files (superseded by the new bootstrap)

The new startup path supersedes the legacy per-file JSON bootstrap. These template
files are **not deleted yet** — a shipped game still vendors them for the current
export/scene path, and other template MonoBehaviours (UI/indicators) still
reference them; they retire physically at the export-pipeline cutover (the separate
per-engine packaging concern). US-UC5 makes good on the "retire once the bootstrap
lands" note in the US-UC2/UC3 sections by providing the replacement:

| Template file | Superseded by |
| ------------- | ------------- |
| `templates/scripts/core/InsimulGameManager.cs` (world/save/quest bootstrap via `JsonUtility` + `Resources.Load`) | `templates/scripts/core/InsimulRuntimeBootstrap.cs` → `Runtime/InsimulRuntimeContext.cs` |
| `templates/scripts/systems/SaveSystem.cs` | `Runtime/Save/InsimulSaveSystem.cs` + `PersistentDataSaveStore.cs` (driven by the bootstrap) |
| `templates/scripts/systems/QuestSystem.cs` (in-memory completion twin) | `Runtime/Quest/InsimulQuestRuntime.cs` (KB-backed; the template MonoBehaviour is retained only as the UI event source the bootstrap bridges) |
| `templates/scripts/systems/QuestCompletionManager.cs` | `InsimulQuestSystem.EvaluateQuest` (KB-backed completion via the runtime) |

The `InsimulGameManager` **scene-spawning** responsibilities (terrain / buildings /
NPCs / props) are *presentation*, not world-data loading, and are **not** superseded
— a game keeps them and simply feeds them from `InsimulRuntimeContext.World`
instead of a `JsonUtility`-parsed `InsimulWorldIR`.

## Regenerating

```
npm run codegen            # regenerate all native DTOs
npm run codegen:verify-cs  # compile-check the C# on a stock .NET 8 SDK (skips if no dotnet)
npm test                   # includes the codegen drift guard
```

Never edit `Runtime/Generated/*.cs` by hand — change the core schema and rerun
`npm run codegen`.
