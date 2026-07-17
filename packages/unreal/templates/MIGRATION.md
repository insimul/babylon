# Migration — retiring the `PrologEngine` substring stub (US-XP4)

The exported game template used to ship its own **fake Prolog engine**:
`templates/source/systems/PrologEngine.{h,cpp}` — a ~1.8k-line
`UGameInstanceSubsystem` (`UPrologEngine`) that stored the knowledge base as
plain text and answered every query by **string prefix / equality matching**. No
unification, no rule derivation, no arithmetic — just substring lookups over an
in-memory `TArray<FString>` of facts.

US-XP4 retires that stub. The real logic engine now lives in the `InsimulRuntime`
plugin as `UInsimulPrologSubsystem` (US-XP3), backed by `libinsimul` (Trealla).
`UPrologEngine` is **kept as a thin game-facing ADAPTER** over that subsystem so
existing Blueprint / gameplay callers keep binding to the same class and method
names — only the *semantics* change (substring match → real SLD unification).

## Why an adapter instead of a straight delete

The story brief said to "migrate the callers (QuestSystem, RuleEnforcer,
TruthSyncSystem) … delete the stub." Grepping the template tells a more honest
story:

- **No C++ system references `UPrologEngine` at all.** `QuestSystem`,
  `RuleEnforcer`, and `TruthSyncSystem` each have their *own* `LoadFromIR` /
  `CanPerformAction` methods (same names, unrelated classes) — none of them
  obtains or calls the Prolog subsystem in C++. The only compile-time coupling to
  the fake engine was:
  - `EventBus.h` — a doc comment naming `PrologEngine` as an event subscriber.
  - `PrologEngine.cpp` itself — subscribing to the `EventBus` and asserting facts
    from game events.
- The engine's rich surface (`IsQuestAvailable`, `WhoShouldTalkTo`,
  `EvaluateVolitionRules`, …) is **Blueprint / save-layer** surface, invoked from
  content and the game's persistence layer, not from the C++ systems.

Deleting the class outright would break any Blueprint that binds those nodes.
Converting it to an adapter preserves the surface and lets the real engine answer
the same questions correctly. So: **the substring *stub* is deleted; the
game-facing *class* survives as a delegating shim.**

## What changed structurally

| Before (stub) | After (adapter) |
| --- | --- |
| `FString KnowledgeBase` + `TArray<FString> Facts` / `Rules` held the KB in-process | KB lives in `UInsimulPrologSubsystem` (libinsimul). Adapter holds a cached `TWeakObjectPtr<UInsimulPrologSubsystem>` resolved lazily from the GameInstance. |
| `ParseKnowledgeBase()` line-classified text into facts/rules | **removed** — clauses are `ConsultWorldData(...)`'d into the real engine. |
| `HasFact(pattern)` — exact string compare | `QueryHas(goal)` → `UInsimulPrologSubsystem::QueryFirst` (real solve). |
| `FindFacts(prefix)` — prefix scan + hand string-parsing of args | `QueryColumn(goal, Var)` → `QueryAll` + `GetBoundValue` (real bindings). |
| `RetractPattern` / `RetractByPredicate` — prefix removal | `RetractAllMatching(goal)` — loops the engine's single-clause `RetractFact` over a goal carrying `_` wildcards. |
| `AssertFact` appended to text, de-duped by string equality | `AssertFact` → `UInsimulPrologSubsystem::AssertFact`, guarded by `QueryHas` so repeated asserts stay idempotent. |

Engine-agnostic **bookkeeping** is unchanged and stays in the adapter:
`ItemQuantities`, `ActiveQuestIds`, `CompletedObjectives` / `CompletedQuests`,
`CurrentGameState`, and the `PlayerFacts` log used for save files.

## Behavior deltas (substring → unification)

These are intended, not regressions. Content authored against the stub's *exact*
quirks may observe differences:

1. **Rules now fire.** The stub only matched *asserted ground facts*; predicates
   defined by rules (`quest_complete/2`, `should_talk_to/2`, `is_a/2`, CEFR/skill
   helpers, …) returned nothing unless a literal matching fact had been asserted.
   The adapter derives them via SLD resolution, so a rule head with no matching
   ground fact can now succeed. This is the whole point of the migration.
2. **Arithmetic & comparison work.** `>=`, `Qty >= N`, `cefr_gte/2`, etc. are
   evaluated by the engine; the stub could not compare numbers at all.
3. **`EvaluateCondition(Goal)` is a real goal solve**, not a fact-existence check
   — arbitrary goals (conjunctions, negation, arithmetic) now evaluate correctly.
4. **Assumed arities.** `QueryColumn` / `RetractAllMatching` build goals with an
   explicit arity. The migration pins the arities the stub's arg-parsing implied:
   `should_talk_to/2`, `prefers_topic/2`, `should_avoid/2`, `conflict_style/2`,
   `rule_applies/3`, `volition_score/4`, `quest_bonus_reward/4`,
   `quest_objective/3` (falls back to `/2`), `objective_complete/3`,
   `romance_stage/3`, `can_perform/{2,3}`, `can_romance_action/3`. A world KB that
   spells one of these at a different arity will read as "no results" rather than
   the stub's looser prefix match — align the world `*.pl` to these arities.
5. **De-dup is provability-based.** `AssertFact` skips a clause the engine can
   already prove. If a fact is *derivable via a rule* (not asserted), the adapter
   will not also assert it as an explicit clause — so it won't appear verbatim in
   a `SnapshotToString()` image and cannot be `RetractFact`'d. In practice the
   gameplay facts asserted here (`has/2`, `visited/2`, `quest_active/2`, …) are
   not rule-derived, so this is a corner case.
6. **Ordering.** `WhoShouldTalkTo` / `GetPreferredTopics` / `EvaluateVolitionRules`
   now return **engine solution order** (volition results are re-sorted by score
   descending in the adapter, as before). Callers already treated these as sets.

## Affected call sites

| Site | Change |
| --- | --- |
| `templates/source/systems/PrologEngine.{h,cpp}` | Rewritten as an adapter over `UInsimulPrologSubsystem`. Public method surface **unchanged**; substring internals removed. |
| `EventBus` integration (`SubscribeToEventBus` / `HandleGameEvent`) | Unchanged flow; each `AssertPlayerFact` / retract now hits the real KB. |
| C++ systems (`QuestSystem`, `RuleEnforcer`, `TruthSyncSystem`, …) | **No change required** — none referenced the fake engine in C++. |
| Save / load (`GameSaveState.prologFacts`) | `GetPlayerFacts()` / `RestorePlayerFacts()` still round-trip the player-fact log (re-asserted into the real KB on load). New `SnapshotToString()` / `RestoreFromString()` delegate to the subsystem for a whole-KB image — the recommended path for full state. |

## New surface on the adapter

- `SnapshotToString()` → `FString` — whole dynamic-KB image (delegates to the
  subsystem). Use for `GameSaveState.prologFacts` when you want full state, not
  just the narrower gameplay-fact list from `GetPlayerFacts()`.
- `RestoreFromString(Image)` → `bool` — replace dynamic state from that image.

## Prerequisites

The adapter needs `UInsimulPrologSubsystem` available on the GameInstance, which
needs `libinsimul` staged into
`Source/ThirdParty/InsimulLibrary/lib/<Platform>/` (see that module's README) and
the `InsimulRuntime` module enabled. If the subsystem is unavailable, adapter
mutations no-op and queries return empty / default (the same graceful-degradation
posture the stub had when uninitialized). See `VERIFICATION.md` → "US-XP4" for the
in-editor smoke checklist.
