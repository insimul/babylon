# Insimul Unity Runtime — Human Verification Checklist (US-UC5)

The portable runtime cores (`InsimulWorldSource`, `InsimulSaveSystem`,
`InsimulQuestRuntime`, `InsimulRadiantEngine`, and the `InsimulRuntimeContext`
startup orchestrator) are all **UnityEngine-free** and are proven cross-runtime by
the host harness + the TS drift guards, which run **without** a Unity editor. This
document is the **human pass**: the things only a real Unity editor + play session
can confirm — the structural-gate-only MonoBehaviour seam and the full gameplay
loop end-to-end.

Everything in §1–§2 has an automated proxy that is already green (see the harness
commands in §0 and [MIGRATION.md](./MIGRATION.md)); the human is confirming an
already-proven sequence, not debugging it. `autoMerge` is **off** for this branch
precisely so a human runs this checklist before merge.

## 0. Automated pre-checks (run before the human pass)

These must all be green first — they gate the portable semantics the loop below
exercises.

- [ ] Root type-check: `npm run check` → exit 0.
- [ ] Root tests: `npm test` → all green (codegen drift + save-integrity + quest +
      radiant drift guards that pin the C# output to the TS authority).
- [ ] Native engine gate: `npm run engines:check` → OK. Runs the Unity C#
      structural syntax gate always; on a **.NET SDK box** it also runs the pure
      host harness (`tools/verify-unity/run.sh --pure`, which includes
      `RunBootstrapTests` — the full-loop proof for `InsimulRuntimeContext`) and the
      save-portability cross-check.
- [ ] On a .NET SDK box: `bash tools/verify-unity/run.sh` → all Cases pass
      (`Runtime context / bootstrap (US-UC5, pure)` among them), and the
      `C#-produced envelope validates` cross-check flips from PEND to PASS.

## 1. Build / editor-import gates (Unity editor required)

The UnityEngine-coupled files are structural-gate only and are NOT compiled by the
host harness. Confirm they import + compile in the editor:

- [ ] Open the exported/template project; the editor compiles with **no** errors in
      `templates/scripts/core/InsimulRuntimeBootstrap.cs` and the four Runtime
      cores it drives.
- [ ] The `System.Text.Json` assembly is present under `Runtime/Plugins/` (the
      generated DTOs + save/world cores need it — `JsonUtility` cannot round-trip
      the schema-faithful shapes; see MIGRATION.md).
- [ ] The EditMode test assembly compiles `Tests/Editor/BootstrapTests.cs`; Test
      Runner (EditMode) shows the `BootstrapTests` fixture green.

## 2. Full gameplay loop (Play mode)

Drive the whole loop the way the automated `RunBootstrapTests` host test does, but
in the live editor. Use the golden world (a `worldSnapshot`-bearing save or a
WorldIR export placed at `StreamingAssets/world/world.json`).

### New game on the golden world

- [ ] Add an empty GameObject with `InsimulRuntimeBootstrap`; set
      `worldRelativePath` to the golden world and `saveSlot` to an **empty** slot.
- [ ] Enter Play with no existing save. The log shows
      `Runtime booted (new game): N characters, M quests`.
- [ ] The world source's characters/quests match the golden world (not a hardcoded
      or server list) — `Runtime.World.Characters` / `Runtime.Quests`.

### Accept / offer a radiant quest

- [ ] Call `InsimulRuntimeBootstrap.Instance.RadiantTick(now)` (wire it to the
      quest-board-open / time-tick UI). A radiant-tagged quest is offered
      **deterministically** — re-running Play from the same state offers the same
      quest id/content (seeded RNG, no wall-clock).
- [ ] The generated quest appears in `Runtime.Quests` and fires
      `OnRadiantQuestGenerated`.

### Complete an objective

- [ ] Trigger an objective in-world (talk to the target NPC / satisfy the objective).
      The template `QuestSystem` event feeds a trigger fact into the runtime KB
      (`InsimulRuntimeBootstrap.WireQuestEvents`), then `EvaluateAllQuests` fires
      `OnObjectiveCompleted`, and `OnQuestCompleted` once all objectives are
      satisfied — and a `quest_complete(<id>)` fact is asserted into the KB.

### Save

- [ ] Call `InsimulRuntimeBootstrap.Instance.SaveToSlot()`. A canonical,
      integrity-stamped envelope is written under
      `Application.persistentDataPath/saves/slot-<N>.json`.
- [ ] (Optional, the cross-runtime property, §5.2 B2) Copy that slot to a Babylon
      build (or run the golden Babylon-produced save through this system) and
      confirm it still verifies + loads.

### Reload

- [ ] Stop and re-enter Play with the **same** slot. The log shows
      `Runtime booted (resumed save): …`; `DidResumeSave` is true.
- [ ] Quest + radiant progress is intact: the completed quest stays completed, the
      offered radiant quest is still present (KB facts round-tripped through
      `currentState.prologFacts`).
- [ ] The `worldSnapshot` hash is unchanged across the save/reload boundary (a
      `currentState`-only mutation must never perturb the world hash) — the host
      `CommitToSave_WorldSnapshotHashStable` test asserts this; confirm no
      world-drift warnings in the log.

### Resilience

- [ ] Corrupt the slot file (truncate it) and re-enter Play. The log warns
      `Slot <N> unreadable … — starting a new game` and boots a **new game**
      instead of bricking — matching `Boot_CorruptSave_FallsBackToNewGame`.

## 3. Deliberate deltas vs the Babylon behaviour reference

**Target: zero.** Unity ports the semantics authority (`packages/core`,
TypeScript; the Babylon runtime is the behaviour reference) byte-for-byte where it
matters — the save envelope + integrity, the quest hydration/completion, and the
radiant generation are all pinned by the shared corpora + drift guards the §0
pre-checks run. There are **no intentional observable behaviour deltas** at the
Unity seam. The only non-semantic, seam-level differences (none change
save/quest/world semantics) are:

| Difference | Where | Why it is NOT a semantic delta |
| ---------- | ----- | ------------------------------ |
| Slot timestamps (`createdAt` / `lastSavedAt` / envelope `exportedAt`) use `DateTime.UtcNow` at write time. | `InsimulRuntimeBootstrap` / `PersistentDataSaveStore` | Timestamps are identity metadata; the integrity hash covers the `saveFile` only, and the golden fixtures use fixed timestamps so the byte-pin holds. The host tests pass a fixed `CreatedAt`/`exportedAt`. |
| Serialization uses `System.Text.Json` + a hand-rolled `CanonicalJson` writer, not `JsonUtility`. | save/world cores | Required for schema fidelity (`JsonUtility` drops `Dictionary`/`object[]`); canonical output is byte-identical to the TS authority (proven by the integrity vectors). |
| On boot a resume re-registers every world quest (firing `OnQuestAccepted`) before restoring completion from the KB. | `InsimulRuntimeContext.Rehydrate` | The quest roster is derived from the read-only world source each session (never persisted); completion is restored from `currentState.prologFacts`, so the observable end state matches the Babylon reload. |

Any delta discovered during the human pass that is **not** listed here is a bug —
file it against this story rather than accepting it.
