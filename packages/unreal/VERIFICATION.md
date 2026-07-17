# Insimul Unreal plugin — human verification checklist

The native-Prolog stack has two verification tiers:

1. **Automated, in this harness** — the plain-C++ `insimul::InsimulKB` core is
   unit- and conformance-tested on the host clang toolchain against a real
   `libinsimul` (`npm run engines:unreal:host`), and every UE `.h/.cpp` passes the
   structural syntax gate (`npm run engines:check`). See `tools/README.md`.
2. **Human, in a real UE editor** — the UE-coupled layer (subsystems, actors,
   widgets) cannot be built in this harness (no Unreal SDK / UBT), so it is
   syntax-gated only and verified by a person following the checklists below.
   `autoMerge` is **off** for this branch precisely so a human runs these first.

Perform the relevant checklist in an editor with `libinsimul` staged into
`Source/ThirdParty/InsimulLibrary/lib/<Platform>/` (see that module's
`lib/README.md`).

---

## US-XP3 — `UInsimulPrologSubsystem` in-editor smoke

**Goal:** confirm the real Prolog engine is wired through the GameInstance
subsystem and callable from Blueprint + C++.

### Setup

- [ ] `libinsimul` static/shared lib for your platform is present under
      `Source/ThirdParty/InsimulLibrary/lib/<Mac|Linux|Win64>/`.
- [ ] The project compiles with the `InsimulRuntime` module enabled (Development
      Editor target).
- [ ] Play-In-Editor (PIE) starts without a fatal log from `LogInsimulProlog`.

### Lifecycle

- [ ] On PIE start, the log shows `InsimulPrologSubsystem initialized (insimul
      <version> …)` — confirms the KB was created and `GetPrologVersion()`
      returns a real version string.
- [ ] `IsPrologReady()` returns `true` during play.
- [ ] On PIE stop, `Deinitialize` runs with no crash / assert (KB released
      cleanly on the game thread).

### Blueprint surface (in a Level Blueprint or test widget)

Get the subsystem via **Get Game Instance Subsystem → InsimulPrologSubsystem**.

- [ ] `ConsultWorldData("parent(tom, bob). parent(bob, ann).")` returns `true`.
- [ ] `ConsultWorldData("parent(tom, .")` (malformed) returns `false` and
      `GetLastError()` is non-empty.
- [ ] `AssertFact("quest(find_sword, active)")` returns `true`.
- [ ] `QueryFirst("parent(tom, X)", …)` returns `true`; `GetBoundValue(Binding,
      "X", …)` yields a value whose `DisplayString` is `bob`.
- [ ] `QueryAll("parent(P, C)", …)` returns `true` with **2** solutions
      (`tom/bob`, `bob/ann`) — order-independent.
- [ ] `QueryFirst("parent(nobody, X)", …)` returns `false` and `GetLastError()`
      is **empty** (a no-solution, not an error).
- [ ] `RetractFact("quest(find_sword, active)")` returns `true`; a second
      `RetractFact` of the same clause returns `false`.

### Snapshot / restore round-trip

- [ ] After asserting a few facts, `SnapshotToString()` returns non-empty Prolog
      text.
- [ ] Clearing/reloading (or restoring into a fresh session) via
      `RestoreFromString(image)` returns `true`, and the previously-asserted facts
      re-query successfully.
- [ ] (Contract note) A KB whose clauses rely on a **custom operator** declared
      with `:- op/3` will NOT restore into a fresh KB — snapshots serialize
      clauses only. Round-trip plain clauses.

### Thread affinity

- [ ] Calling any subsystem method from a background task (e.g. inside an
      `AsyncTask(ENamedThreads::AnyThread, …)`) logs an error from
      `LogInsimulProlog` and returns `false`/`""` **without** corrupting the KB —
      subsequent game-thread calls still work.

---

## US-XP4 — `UPrologEngine` adapter (game-template smoke)

**Goal:** confirm the exported game template's `UPrologEngine` — now a thin
adapter over `UInsimulPrologSubsystem` (the substring stub is retired) — drives
the **real** engine end-to-end. See `templates/MIGRATION.md` for the behavior
deltas this checklist exercises.

### Setup

- [ ] Same prerequisites as US-XP3 (libinsimul staged, `InsimulRuntime` enabled).
- [ ] The exported game module (`InsimulExport`) compiles with both
      `UPrologEngine` and `UInsimulPrologSubsystem` present.
- [ ] PIE starts with no fatal `LogTemp` / `LogInsimulProlog` error.

### Lifecycle & wiring

- [ ] On PIE start, `UPrologEngine::LoadFromIR(worldJson)` logs
      `PrologEngine loaded via real engine (…)` and **does not** log
      `UInsimulPrologSubsystem unavailable`.
- [ ] `LoadItemReasoningRules()` and `LoadHelperPredicates()` log success (rules
      consulted, no `GetLastError` warning).

### Real unification (the migration's whole point)

- [ ] Assert `person(alice)` and a rule via `LoadFromIR` world data, then a query
      method that depends on a **rule** (e.g. an `is_a/2` chain, or
      `IsQuestComplete` whose `quest_complete/2` is rule-defined) returns `true`
      where the old substring stub returned `false`.
- [ ] `EvaluateCondition("2 >= 1")` returns `true` (arithmetic — impossible under
      the stub).
- [ ] `EvaluateCondition("nonexistent_pred(x)")` returns `false`.

### Fact management & queries

- [ ] After `InitializeInventory` with an item of quantity 3, `Query("has_item(player, X, N)")`
      returns one solution binding `N=3`.
- [ ] `WhoShouldTalkTo(npc)` / `GetPreferredTopics(npc)` return the expected
      targets when the world KB defines `should_talk_to/2` / `prefers_topic/2`.
- [ ] An `EventBus` item-collect event updates `has_item/3` (collect twice →
      quantity accumulates; drop below 1 → `has(player, item)` no longer holds).

### Save round-trip via Snapshot/Restore

- [ ] Assert some gameplay facts, call `SnapshotToString()` → non-empty image;
      store it as `GameSaveState.prologFacts`.
- [ ] In a fresh session, `LoadFromIR(...)` then `RestoreFromString(image)`
      returns `true` and the previously-asserted gameplay facts re-query
      successfully.
- [ ] Alternatively, `GetPlayerFacts()` → save array → `RestorePlayerFacts(array)`
      after `LoadFromIR` re-establishes the same facts (item quantities included).

### Graceful degradation

- [ ] With `libinsimul` absent (subsystem unavailable), `LoadFromIR` logs the
      "unavailable" error and adapter mutations no-op / queries return
      empty-or-default **without** crashing PIE.
# Insimul Unreal Runtime — Human Verification Checklist (US-XC4)

The portable runtime core (`FInsimul*`) is proven cross-runtime by the host
harness and the TS drift guards; those run without an engine. This document is
the **human pass**: the things only a real Unreal Editor + build can confirm —
the syntax gates on the UE-coupled seam and the full gameplay loop end-to-end.

Everything in §1–§2 has an automated proxy that is already green (see
[MIGRATION.md](./MIGRATION.md) and the harness commands below); the human is
confirming an already-proven sequence, not debugging it.

## 0. Automated pre-checks (run before the human pass)

These must all be green first — they gate the portable semantics the loop below
exercises.

- [ ] Host harness: `cd packages/unreal/tools/verify-unreal && cmake -S . -B build && cmake --build build && ctest --test-dir build --output-on-failure`
      → 4/4 (`world_source`, `save_system`, `quest_system`, **`bootstrap`**).
- [ ] Root type-check: `npm run check` → exit 0.
- [ ] Root tests: `npm test` → all green (includes the save-integrity + quest
      drift guards that pin the C++ output to the TS authority).
- [ ] Save portability cross-check: `npx vite-node packages/unreal/tools/cross-check/verify-save-integrity.ts` → exit 0.

## 1. Build / syntax gates (Unreal Editor required)

The UE-coupled files are syntax-gated (`#if WITH_ENGINE`, UHT `GENERATED_BODY`)
and are NOT compiled by the host harness. Confirm they build under UBT:

- [ ] Generate project files and build the `InsimulExport` editor target
      (`templates/project/`) — see `templates/project/INTEGRATION_GUIDE.md`.
- [ ] The build compiles the new engine seam cleanly:
  - [ ] `UInsimulRuntimeSubsystem` (`Public/InsimulRuntimeSubsystem.h`, `Private/InsimulRuntimeSubsystem.cpp`) — the startup orchestrator.
  - [ ] `FInsimulSaveSystemShell`, `FInsimulQuestSystemShell`, `InsimulWorldBoundary` (the US-XC1..XC3 seams the subsystem drives).
  - [ ] The re-pointed consumers: `AInsimulLevelScriptActor`, `AInsimulSpawner`, `UInsimulCrowdIntegration`.
- [ ] No UHT errors on the `USTRUCT`/`UCLASS`/`UFUNCTION` reflection surface.

## 2. Full gameplay loop (Play-In-Editor)

Drive the whole loop the way the automated `bootstrap` host test does, but in the
live engine. Use the golden world (`Content/Data/` export, or a bundled
`worldSnapshot`).

### New game on the golden world

- [ ] Start Play with **no existing save slot**. `UInsimulRuntimeSubsystem::Boot`
      logs `Insimul runtime booted (new game): N characters, M quests`.
- [ ] NPCs spawn from the **world source**, not a hardcoded/server list:
      `AInsimulSpawner` logs `populated N characters from the world source`
      (and `AInsimulLevelScriptActor` uses the world-source ids when present).
- [ ] The spawned character ids/names match the golden world's characters.

### Radiant quest

- [ ] A radiant-tagged quest is offered deterministically (the same offering the
      `radiant-cases.json` corpus + host test pin). Re-running Play from the same
      state offers the **same** quest(s) in the same order (RNG-free).

### Objective

- [ ] Complete an objective's trigger in-world (e.g. talk to the target NPC).
      The quest system shell broadcasts `OnObjectiveCompleted`, then
      `OnQuestCompleted` once all objectives are satisfied — and a
      `quest_complete(<id>)` fact is asserted into the KB.

### Save

- [ ] Save to a slot (`UInsimulRuntimeSubsystem::SaveToSlot`). A canonical,
      integrity-stamped envelope file is written under the project SaveGames dir.
- [ ] (Optional) Copy that slot file to another device/runtime and confirm it
      still verifies — the cross-runtime portability property (§5.2 B2).

### Reload

- [ ] Stop and re-enter Play. `Boot` logs `resumed save`; `DidResumeSave()` is
      true.
- [ ] Quest + radiant progress is intact: the completed quest stays completed,
      the offered radiant quest is still offered (KB facts round-tripped).
- [ ] The `worldSnapshot` hash is unchanged across the save/reload boundary (a
      `currentState`-only mutation must never perturb the world hash) — the host
      `bootstrap` test asserts this; confirm no world-drift warnings in the log.

## 3. Deliberate deltas vs the Babylon/Unity behaviour reference

**Target: zero.** The portable core ports the semantics authority
(`packages/core`, TypeScript; Unity is the reference implementation) byte-for-byte
where it matters, pinned by the shared corpora + drift guards. Known,
**intentional** deltas at the UE seam (none change observable save/quest/world
semantics):

| Delta | Where | Why it is not a semantic difference |
| ----- | ----- | ----------------------------------- |
| Slot timestamps (`createdAt`/`lastSavedAt`/envelope `exportedAt`) use `FDateTime::UtcNow()` at write time. | `FInsimulSaveSystemShell` | Timestamps are identity metadata, not part of the integrity-hashed contract dimension the corpora pin; the golden envelope uses a fixed timestamp so the byte-pin holds. |
| No native Prolog resolution engine yet (KB is a ground-fact store with Assert/Has). | `FInsimulKB` | Sufficient for query-driven completion; `unreal-native-prolog` plugs in behind the same Assert/Has shape without changing the fact contract. |
| Corrupt/incompatible save slot falls back to a new game instead of aborting boot. | `FInsimulRuntimeContext::Boot` | Resilience choice, not a semantic difference; a valid save always resumes. Matches the "never brick startup" intent. |

Any delta discovered during the human pass that is **not** listed here is a bug —
file it against this story rather than accepting it.

---

## US-XG4 — Scene generation ▸ re-import ▸ Binding Editor (full editor loop)

**Goal:** confirm the interactive Editor-module pipeline (US-XG1..4) works
end-to-end in a real UE editor — import the golden world, bind a custom mesh,
regenerate, and verify placement + the conservative re-import diff. The placement
math + resolver + placeholder coverage + re-import policy + binding-editor logic
all host-test green (`npm run engines:check`); this is the human pass over the
UE-coupled seam (the `UInsimul*` widgets / generators / drivers that UBT compiles
but the harness only syntax-gates).

### 0. Automated pre-checks (run before the human pass)

- [ ] `npm run engines:check` → green. Includes the five unreal host gates:
      binding resolver (21/21), scene placement (13/13), placeholder coverage
      (12/12), **re-import diff (19/19)**, **binding-editor view-model (17/17)**,
      plus the C++ structural syntax gate over every `.h/.cpp`.
- [ ] The InsimulEditor module builds under UBT (Development Editor target) with
      no UHT errors on the `USTRUCT`/`UCLASS`/`UFUNCTION` reflection surface —
      `UInsimulSceneGenerator`, `UInsimulReimport`, `UInsimulBindingEditorWidget`,
      `UInsimulEntityIdComponent`, `UInsimulBindingTable`,
      `UInsimulPlaceholderPackGenerator`, `UInsimulPcgVegetation`.

### 1. Import the golden world + placeholder coverage

- [ ] Generate the placeholder pack (**Insimul ▸ Generate Placeholder Pack**) →
      a `UInsimulBindingTable` (SourceKind = Placeholder) + primitive meshes are
      written under `Content/Insimul/Placeholders/`.
- [ ] Run **Insimul ▸ Generate Scene From World IR** on the golden world export.
      The scene populates: terrain, roads, buildings (+ interiors), props, a
      NavMesh bounds volume. Every generated actor carries a
      `UInsimulEntityIdComponent` (+ the `Insimul.Generated` tag).
- [ ] With ONLY the placeholder pack bound, **every** archetype the golden IR uses
      resolves (nothing renders as an unbound/empty actor) — the coverage rule.

### 2. Binding Editor: bind a custom mesh

Open the Binding Editor utility widget (a Blueprint child of
`UInsimulBindingEditorWidget`), set `WorldArchetypes` to the golden world's keys.

- [ ] `BuildRows()` shows the taxonomy-grouped archetype list; used-archetype
      leaves show **Placeholder** status (bound only via the placeholder tier).
- [ ] `SuggestBindings("building.commercial.bakery")` ranks project assets whose
      name/path/tags contain the most dot-segments first.
- [ ] **Bind** a custom StaticMesh/Blueprint to a building archetype in the
      project table. That row now shows **Bound** (project tier wins over
      placeholder); `BoundKeys()` includes it, `UnboundKeys()` does not.
- [ ] **Bind-descendants** on a parent key (e.g. `building`) — every `building.*`
      archetype with no more-specific entry now resolves to it.
- [ ] **Export Pack** → portable `insimul-binding-pack` JSON; re-**Import Pack**
      of that JSON reproduces the same table (keys + fixups preserved).

### 3. Regenerate + verify placement

- [ ] Re-run **Generate Scene From World IR**. The building you bound now spawns
      your custom asset at the SAME lot footprint / transform the placeholder used
      — placement is a pure function of the IR, independent of the bound asset.
- [ ] The spawned transform matches the host golden manifest coordinates (the
      cross-engine determinism the `run-scene-tests.sh` gate pins).

### 4. Conservative re-import diff (the payoff)

- [ ] Hand-edit the scene: move a generated building, and add a hand-placed prop
      (no `UInsimulEntityIdComponent`). Mark one generated actor `bGenerated=false`
      (an adopted override).
- [ ] Run **Insimul ▸ Re-import World IR (Diff)** (dry run) on a *changed* IR
      export. The summary logs canonical counts: added / updated / unchanged /
      skipped / deprecated. Confirm the JSON matches
      `UInsimulReimport::DryRun(...).ReportJson`.
- [ ] **Apply** the re-import (one Undo group):
  - [ ] Moved generated actors are snapped back to the fresh IR transform
        (**Updated**).
  - [ ] The hand-placed prop is untouched, and the `bGenerated=false` override is
        **Skipped** (not updated, not deprecated) — hand edits survive.
  - [ ] A generated actor the new IR dropped is reparented under the `Deprecated/`
        folder, **not deleted**.
  - [ ] Brand-new IR ids are materialized + stamped (**Added**).
- [ ] Undo restores the pre-apply state in one step.

### Deltas vs Unity/Godot

**Target: zero on the numeric + policy contract.** The scene placement numbers,
the placeholder coverage set, the re-import classification, and the binding-editor
decisions are all pinned byte-for-byte against the shared cross-engine fixtures
(the Unity manifests/goldens are copied verbatim). Only the engine-specific
asset-ref strings (`placeholder:building` vs a real `/Game/...` path) differ, by
design. Any classification / placement / coverage difference discovered in the
human pass is a bug — file it against US-XG4.
