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

---

## US-XE2 — World Browser: connect ▸ browse ▸ import (Unreal editor + backend required)

The World Browser tab's parsing, list/detail/selection reducer, compatibility
badge (imported snapshot version vs the world's current snapshot), open-in-web
link, and Import/Sync orchestration all live in the Unreal-Engine-free
`insimul::FWorldBrowserModel`, host-tested headless over a routing transport + a
fake registry/pipeline (`test_world_browser.cpp`, `npm run
engines:unreal:world-browser`). This is the **human pass** for the two UE-coupled
seams only a real editor + backend can exercise: the `FInsimulEditorHttpTransport`
HTTP path (US-XE1) and the `FInsimulSceneImportPipeline` bridge into the
US-XG2/US-XG4 scene generation + re-import diff, with the imported-version record
persisted per-user in `FInsimulImportedWorldRegistry` (GEditorPerProjectIni —
never a committed asset). A running backend (`UInsimulSettings::ServerURL`) with at
least one world on the account is required.

### 0. Automated pre-checks (run before the human pass)

- [ ] `npm run engines:unreal:world-browser` — the view-model host gate is green
      (parsing, list load incl. 401 re-auth, detail merge, selection reducer,
      compatibility badge, open-in-web, import wiring, report summary).
- [ ] `npm run engines:check` — the structural syntax gate covers the new UE-coupled
      seams (`FWorldBrowserModel` bridge, imported-world registry, scene-import
      pipeline).

### 1. Connect + browse

- [ ] In **Project Settings ▸ Insimul**, set the server URL and authenticate
      (world API key or user login — US-XE1). Open **Insimul ▸ World Browser** and
      click **Refresh worlds**. The account's worlds list, each showing name, genre
      bundle, `snapshot vN`, and NPC / Settlement / Quest counts.
- [ ] Every never-imported world shows the **Not imported** badge. Select one and
      confirm its detail counts match the world on the web.
- [ ] Click **Open in web** — the browser opens `…/worlds/<id>` for that world.

### 2. Import / Sync through the scene pipeline

- [ ] With a level open, click **Preview Sync (dry run)**. A report line appears
      (`+A / ~U / -D (… unchanged, … hand-edited)`) and the scene is **NOT**
      mutated (no generated actors added/moved).
- [ ] Click **Sync IR now…**, confirm the dialog. The scene's generated actors
      update per the US-XG4 re-import policy (generated nodes added/updated,
      hand-edited nodes untouched, dropped nodes reparented under the **Deprecated**
      group — never deleted), all in one **Undo** group. The badge flips to **Up to
      date (vN)**.
- [ ] With **no level open**, the Import action is disabled and the tab shows
      *"Open a level to import a world into the scene."* (the pipeline's unavailable
      reason).

### 3. Stale-version detection + re-auth

- [ ] Regenerate/advance the world on the backend so its snapshot version bumps,
      **Refresh worlds** again, and confirm the badge now reads **Update available
      (imported vN → vM)** — the stale-version detection driven off the per-user
      imported-version record.
- [ ] Let the token expire (or revoke it) and Refresh: the tab shows the **Session
      expired — re-authenticate** warning (the `NeedsReauth` state), and
      re-authenticating in Project Settings restores the list on the next Refresh.

### Deltas vs Unity/Godot

**Target: zero on the parsing + reducer + badge + import-orchestration contract.**
`FWorldBrowserModel` mirrors `InsimulWorldBrowserModel.cs` and
`world-browser.ts` case-for-case (same `WorldBrowserTests` set). Only the
engine-specific scene mutations (UE actors + `UInsimulEntityIdComponent` vs Unity
GameObjects) differ, by design. Any parsing / selection / badge / count difference
found in the human pass is a bug — file it against US-XE2.

---

## US-XE3 — Generation Console: invoke ▸ track progress ▸ sync (Unreal editor + backend required)

The Generation Console's start-body build, status/event/diff parsing, the job
lifecycle state machine (Idle → Starting → Queued → Running →
Completed/Failed/Canceled), and the leak-free poll teardown all live in the
Unreal-Engine-free `insimul::FGenerationConsoleModel` + `insimul::FJobPoller`,
host-tested headless over a routing transport + a scripted stream + a fake clock
(`test_generation_console.cpp`, `npm run engines:unreal:generation`). This is the
**human pass** for the two UE-coupled seams only a real editor + backend can
exercise: the `FInsimulEditorHttpTransport` HTTP start (US-XE1) and the
`FInsimulHttpJobStream` FTimerManager+FHttpModule poll stream. A running backend
(`UInsimulSettings::ServerURL`, authenticated) with at least one world is required.

### 0. Automated pre-checks (run before the human pass)

- [ ] `npm run engines:unreal:generation` — the view-model host gate is green
      (36 cases: body+parsing, lifecycle over a scripted stream, start guards incl.
      401 re-auth, cancel/dispose/reset, and the FJobPoller no-leaked-ticker
      teardown + maxPolls cap + end-to-end poll→stream→model).
- [ ] `npm run engines:check` — the structural syntax gate covers the new UE-coupled
      seam (`FInsimulTimerScheduler`, `FInsimulHttpJobStream(Factory)`).

### 1. Invoke a generator + live progress

- [ ] Authenticate (US-XE1) and select a world in the World Browser, then open
      **Insimul ▸ Generation Console**. Click **Regenerate settlements** (or
      **Generate characters** / **Generate quests**).
- [ ] The status advances **Queued → Running** with a live progress bar + phase
      label as the poll returns fresh `getGenerationJob` frames (roughly one update
      per second). No editor hitch/freeze while polling (the poll is non-blocking).
- [ ] On completion the status reads **Completed**, the progress bar is full, and a
      results line shows the entity diff (`+A added / ~U updated / -R removed`).

### 2. Sync-now

- [ ] With a level open, the completed job shows **Sync IR now…**. Click it, confirm
      the dialog: the scene's generated actors update through the same US-XG4
      re-import path (World Browser `ApplyImport`), and the World Browser badge for
      that world flips to **Up to date (vN)**.
- [ ] Re-open the Console and confirm a **New job** / reset returns it to Idle.

### 3. Failure, cancel, and domain-reload safety

- [ ] Trigger a failing generation (e.g. an invalid world / server-side error). The
      status reads **Failed** with the server reason; no Sync is offered.
- [ ] Start a job, then **Cancel** mid-run — the status reads **Canceled** and the
      poll loop stops immediately (no further progress updates). The server job may
      still finish; the editor simply stops tracking it.
- [ ] Start a job, then force a **domain reload** (recompile / Live Coding, or enter
      PIE). Confirm no orphaned polling continues after the tab is torn down — no
      `getGenerationJob` requests fire once the Console tab is closed/reloaded, and
      no `Ensure`/access-violation from a timer touching a freed widget.
- [ ] Let the token expire and start a job: the Console surfaces the **Session
      expired — re-authenticate** state (the `NeedsReauth` flag armed by the 401 on
      `startGenerationJob`).

### Deltas vs Unity/Godot

**Target: zero on the parsing + lifecycle + teardown contract.**
`FGenerationConsoleModel` / `FJobPoller` mirror `InsimulGenerationConsoleModel.cs` /
the core `generation-console.ts` + `job-poller.ts` case-for-case (same
`GenerationConsoleTests` set). Only the engine-specific timer (`FTimerManager` vs
`EditorApplication.update` vs `SceneTreeTimer`) and HTTP client differ, by design.
Any status / progress / diff / teardown difference found in the human pass is a bug
— file it against US-XE3.

---

## US-XE4 — Conversation Tester: talk to an NPC in the editor (Unreal editor + backend required)

The whole turn lifecycle (send → stream reply chunks → complete/error), the
character-list + SSE parsing, and the multi-turn transcript over one session id live
in the Unreal-Engine-free `insimul::FConversationTesterModel`, host-tested headless
over a routing transport + a scripted conversation stream
(`test_conversation_tester.cpp`, `npm run engines:unreal:conversation`). This is the
**human pass** for the UE-coupled seam only a real editor + backend can exercise: the
`FInsimulHttpConversationStream` SSE POST driven off the editor tick, and the
tab's pump / dispose wiring. A running backend (`UInsimulSettings::ServerURL`,
authenticated) with the conversation service and at least one world with characters is
required. **Text streaming works in edit mode; audio playback + lip sync do not (Play
mode only) — see the README ▸ Conversation Tester window mode constraint.**

### 0. Automated pre-checks (run before the human pass)

- [ ] `npm run engines:unreal:conversation` — the view-model host gate is green
      (30 cases: parsing, character load incl. 401 re-auth, send guards, the turn
      lifecycle over a scripted stream, multi-turn session sharing, character-switch
      reset, dispose-on-teardown).
- [ ] `npm run engines:check` — the structural syntax gate covers the new UE-coupled
      seam (`FInsimulHttpConversationClient` / `FInsimulHttpConversationStream`).

### 1. Load characters + two-turn conversation

- [ ] With the session authenticated (Project Settings ▸ Insimul), open **Insimul ▸
      Conversation Tester**. Select a world (copy the id from the World Browser) and
      click **Load characters** — the **Character** picker fills with the world's NPCs.
- [ ] Pick a character, type a message, and click **Send**: the **Transcript** shows a
      **You** line immediately, then an **NPC** line as the reply streams in, without
      freezing the editor (the request runs off the editor tick, not blocking).
- [ ] Send a **second** turn to the same character and confirm the reply is coherent
      in context (the two turns share one conversation session) and **both** exchanges
      remain in the transcript (four lines total).

### 2. Audio, switching, and re-auth

- [ ] If the world's characters have TTS enabled, confirm a **TTS audio: N chunk(s)
      returned (not played in edit mode)** line appears — audio is not played here by
      design (drive Play mode with `InsimulConversationComponent` to hear it).
- [ ] Switch to a **different** character in the picker: the transcript clears (a fresh
      conversation), and the next turn starts a **new** session id.
- [ ] Let the token expire / revoke it and **Load characters** again: the load fails and
      the panel shows the **Session expired — re-authenticate** state (the `NeedsReauth`
      flag armed by the 401 on `getWorldDetail`).

### 3. Domain-reload safety

- [ ] Send a turn, then force a **recompile** (Live Coding) or **enter Play mode** while
      it is streaming. Confirm the editor does not throw, **no** `/api/conversation/stream`
      request keeps running after the reload/close, and re-opening the window starts
      clean (the tab's `Dispose()` → cancel-request + drop-late-callback path).

### Deltas vs Unity/Godot

**Target: zero on the parsing + lifecycle + teardown contract.**
`FConversationTesterModel` mirrors `InsimulConversationTesterModel.cs` / the core
`conversation-tester.ts` case-for-case (same `ConversationTesterTests` set). Only the
engine-specific streaming HTTP client (`FHttpModule` vs `UnityWebRequest` vs
`HTTPRequest`) and the edit-mode audio-playback wall (shared across all three) differ,
by design. Any load / send-guard / transcript / teardown difference found in the human
pass is a bug — file it against US-XE4.

## US-XU1 — Default-UI registry + theme + widget-generation preservation (Unreal editor required)

**Automated cores are green before the human pass; the UMG/asset seam is
editor-verified (autoMerge off).**

### 0. Automated pre-checks

- [ ] `npm run engines:unreal:ui` — the default-UI host gate is green (20 cases:
      registry default/override/missing + the real WBP default map, the loading
      view-model weighted-progress/monotonicity/label/completion/tips against
      `conformance/ui/loading-phases.json`, and the theme-token table vs
      `conformance/ui/theme-tokens.json`).
- [ ] `npm run engines:check` — the structural syntax gate covers the new UE seams
      (`UInsimulUIRegistry`, `UInsimulUITheme`) and the grep-guard confirms the
      cores stay UE-free.

### 1. Generation preserves widgets + registry + fonts

- [ ] Run the export pipeline (or `Scripts/GenerateInsimulContent.py` manually) on a
      project with the InsimulExport module built. Confirm `/Game/UI/WBP_*` are
      created as before (dialogue, game menu, quest tracker, quest offer, intro, …)
      with their bound child widgets named to match the C++ `BindWidget` properties.
- [ ] Confirm `/Game/UI/DA_InsimulUIRegistry` exists and its **Panels** array binds
      `dialogue`, `game_menu`, `loading_screen`, `quest_offer`, `quest_tracker` to the
      matching `WBP_*` generated classes. Confirm `/Game/UI/DA_InsimulUITheme` exists
      with the shared token defaults.
- [ ] With a `Content/Fonts/` folder present, confirm fonts still import and the
      created text widgets use them (CJK/Arabic/Devanagari renders glyphs, not tofu) —
      the i18n font path is unchanged by this story.

### 2. Registry override + loading screen

- [ ] Point **Project Settings ▸ Insimul ▸ UI ▸ UIRegistry** at a custom
      `UInsimulUIRegistry` (or add a `Panels` entry overriding, e.g., `dialogue`).
      Confirm `ResolvePanelClass("dialogue")` returns the override class, and an
      unknown key logs the `No panel registered for key` warning.
- [ ] Drive a boot from the main menu and confirm the loading screen advances through
      the phases (Starting up → Loading world → … → Ready) with a monotonically
      rising bar and a per-phase tip, reaching 100% at **Ready**.

### Deltas vs Unity/Godot

**Target: zero on the registry + loading + token contract.** The three cores mirror
the Godot leg (`insimul_ui_registry.gd` / `loading_screen_model.gd` /
`insimul_ui_tokens.gd`) and the shared corpus case-for-case; only the concrete
default map (WBP asset paths vs Godot `.tscn`) and the native theme representation
(Slate vs Godot `Theme`) differ by design. Any resolution / progress / token
divergence found in the human pass is a bug — file it against US-XU1.

## US-XU2 — Quest journal / tracker / offer + notifications (Unreal editor required)

**Automated cores are green before the human pass; the UMG seam is
editor-verified (autoMerge off).**

### 0. Automated pre-checks

- [ ] `npm run engines:unreal:quest-ui` — the quest-UI host gate is green (29
      assertions): the full `conformance/ui/quest-journal-cases.json` matrix (tab
      filtering + counts, accept/decline offers, bounded tracker HUD, radiant
      arrival via upsert), the **event-driven** surface (every mutation pushes a
      `FQuestJournalEvent`; read-only + rejected ops emit nothing — proving no
      polling), the toast notifications core (push / tick-expiry / dismiss /
      kind→color), and the quest-events-drive-toasts integration.
- [ ] `npm run engines:check` — the structural syntax gate covers the new UE seam
      (`UInsimulQuestJournal` + its `OnQuestJournalChanged` dynamic multicast
      delegate) and the grep-guard confirms `InsimulQuestJournalModel` /
      `InsimulNotifications` stay UE-free.

### 1. Journal filtering + counts

- [ ] Open the quest journal (WBP_QuestJournal). Confirm the tab row shows the
      per-status counts and switching tabs (All / Active / Completed / Available)
      partitions the list to exactly the matching quests, in stable order.

### 2. Tracker HUD (bounded, event-driven)

- [ ] Track an active quest — it appears on the HUD tracker immediately (the widget
      rebuilds off the `QuestTracked` event, not a tick). Track past the configured
      max: further tracks are rejected with no HUD change. Untrack frees a slot.
- [ ] Complete a tracked active quest: it auto-untracks (drops off the HUD) and moves
      to the Completed tab in one event round-trip.

### 3. Offer dialog + radiant arrival + toasts

- [ ] Trigger a quest offer (InsimulQuestOfferPanel). Accept → the quest moves to
      Active and a success toast fires; Decline → the offer is removed entirely.
- [ ] Let a radiant quest arrive (quest_offered): it appears under the Available tab
      and raises an info toast, with no per-frame polling on the panels. Toasts age
      out on their own timer.

### Deltas vs Unity/Godot

**Target: zero on the journal/tracker/offer + notifications contract.** The cores
mirror the Godot leg (`quest_journal_model.gd` / `insimul_notifications.gd`) and the
shared `quest-journal-cases.json` case-for-case; only the UMG widget layer (dynamic
multicast delegate vs Godot signals) differs by design. Any lifecycle / filtering /
tracking / notification divergence found in the human pass is a bug — file it
against US-XU2.
