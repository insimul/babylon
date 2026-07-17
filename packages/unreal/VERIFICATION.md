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
