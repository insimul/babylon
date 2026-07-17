# Migration: fake `PrologEngine` stub → real libinsimul engine (US-UP4)

`templates/scripts/systems/PrologEngine.cs` used to be a **substring-matching
fact store** (~1.5k lines) — it kept asserted facts as strings in a `HashSet`
and answered every query by exact string lookup. It could not unify variables,
could not evaluate rules (`:-`) or arithmetic, and self-documented as a stub
("integrate a C# Prolog library … and replace the stub query methods").

US-UP4 replaces that with a **real Prolog engine**:

- **`Runtime/Prolog/PrologGameAdapter.cs`** (new) — the engine-agnostic,
  UnityEngine-free backing. It owns an `InsimulProlog` KB (P/Invoke over
  libinsimul) and exposes the game-facing surface with genuine unification. It
  is unit-tested host-side by `tools/verify-unity/` (no Unity editor needed).
- **`templates/scripts/systems/PrologEngine.cs`** (rewritten) — now a thin
  `MonoBehaviour` shell. It keeps the **same class name and public method
  surface** (scene/codegen wiring keyed on the type keeps working) but delegates
  every Prolog operation to `PrologGameAdapter`. Only the Unity glue remains:
  `MonoBehaviour` lifetime, `Debug.Log`, `GameEventBus` subscription, and the
  `OnQuestCompleted` / objective-completed events.

## Requirements after this change

The template's `Insimul.asmdef` now references **`Insimul.Runtime`** (the SDK
package under `packages/unity/Runtime`). That package needs:

1. The native `libinsimul` binaries under `Runtime/Plugins/` — fetch with
   `packages/unity/scripts/fetch-native.sh` (see `Runtime/Plugins/README.md`).
2. **`System.Text.Json.dll`** dropped into a `Plugins/` folder so
   `Insimul.Runtime` compiles in-editor (documented in
   `Runtime/Prolog/CLAUDE.md`).

Until both are present the template will not compile in the Unity editor. All
adapter logic is nonetheless verified host-side via `tools/verify-unity/run.sh`.

## Affected call sites (honest enumeration)

Grepping the template tree (`grep -rn PrologEngine templates/ --include=*.cs`)
shows **no other `.cs` file referenced `PrologEngine` at migration time** — it
was a self-contained MonoBehaviour with no compile-time callers among the
template systems. So there was no cross-file "call-site migration" to perform;
the migration is the in-place rewrite of `PrologEngine.cs` plus the new adapter.

Two related notes:

- `RuleEnforcer.cs` has its **own** separate `SetPrologKnowledgeBase(...)` that
  stored a Prolog string and did lightweight substring quest checks. It never
  used `PrologEngine`, and US-UP4 does **not** touch it — wiring `RuleEnforcer`
  to the real engine is a follow-up (it would call an injected `PrologEngine` /
  `PrologGameAdapter` instead of its private string scan).
- The public surface of `PrologEngine` (all `Initialize*`, `CanPerformAction`,
  quest checks, NPC queries, `Query`, save methods, `SubscribeToEventBus`, the
  romance/volition/reconcile helpers) is **unchanged in signature**, so any
  runtime `GetComponent<PrologEngine>()` wiring in a generated scene keeps
  compiling and calling the same methods.

## Behavioral changes: substring matching → real unification

These are genuine semantic differences a human tester should exercise in the
smoke scene (see the checklist in `.chief/state/progress.txt`).

| Method | Old (stub) | New (real engine) |
|--------|-----------|-------------------|
| `Query(goal)` | returned `[{ _match: true }]` on an exact string hit, else `[]` — **no variable bindings ever** | returns one dictionary of **variable → value bindings per solution**; a goal with variables unifies and enumerates all solutions |
| `EvaluateCondition(goal)` | exact string membership in the fact set | real goal resolution (rules + arithmetic evaluate) |
| Rules / `:-` in loaded content | parsed out and **dropped** (only fact lines were kept) | the whole program is `Consult`ed, so rules are queryable (IS-A reasoning, `cefr_gte`, `skill_gte`, … now actually work) |
| `CanPerformAction` | allowed if the exact `can_perform(...)` fact existed, or if **no** `can_perform` fact existed at all | allowed if `can_perform/2` (or `/3`) **succeeds**, or if the predicate is **undeclared** (existence_error → graceful allow); denied if declared-but-unmet |
| `IsQuestAvailable` / `IsWillingToShare` / `CanPerformRomanceAction` | same "exact fact or no facts of that predicate → allow" heuristic | undeclared predicate → allow; otherwise the goal must actually succeed |
| `WhoShouldTalkTo` / `GetPreferredTopics` / `WhoToAvoid` / `GetConflictStyle` | substring scan of `pred(first, X)` fact strings | real `QueryColumn("pred(first, X)", "X")` — values are unified, deduped |
| `GetApplicableRules(actor)` | scanned `rule_applies(...)` facts, matching the actor in **any** argument position | queries `rule_applies(Rule, actor)` — the actor must be the **second** argument |
| `EvaluateVolitionRules` / `GetBonusRewards` / `Reconcile` | string-split parsing of fact text | real queries with bound variables (`volition_score(N,A,T,S)`, `quest_bonus_reward(...)`, `quest_objective(Q,Idx)` + `objective_complete(...)`) |
| `RetractPattern` (dynamic state: energy, personality, relationships, has_item…) | prefix string removal (arity-agnostic) | `RetractAll("pred(a, _, …)")` — a well-formed term with `_` for value positions; loops the native retract until nothing matches, so it removes **all** matching clauses regardless of the ABI's retract arity |
| `FactCount` / `GetStats` | total count of asserted fact strings | count of **player-tracked** facts only (the native ABI exposes no total clause count); `ruleCount` reported as `0` |
| Item quantities | tracked in a `Dictionary<string,int>` alongside facts | derived by querying `has_item(player, Item, Qty)` — the fact **is** the quantity |

### Save / load

- **New primary path:** `SnapshotState()` / `RestoreState(string)` round-trip the
  **full KB** (world + player facts + rules) through the native
  `insimul_snapshot` / `insimul_restore`. This is what
  `GameSaveState.prologFacts` should migrate to — an opaque engine snapshot
  instead of a hand-rebuilt string list.
- **Legacy path retained:** `GetPlayerFacts()` still returns the tracked
  player-fact strings and `RestorePlayerFacts(string[])` re-asserts them, so
  existing `GameSaveState.prologFacts` saves keep loading. The adapter records
  which facts were player-asserted (`AssertPlayerFact`) so this list stays
  accurate; on load the facts are re-asserted into a fresh KB.
- `RestoreFromSaveState(json)` is unchanged in shape (parses the same
  `GameSaveState` DTO) but now asserts into the real engine.
- `ExportKnowledgeBase()` remains `[Obsolete]`; it now exports the tracked
  player facts (prefer `SnapshotState()`).

### Graceful degradation

The stub never threw. The adapter preserves that: `Query`, `Holds`,
`EvaluateCondition`, and the `TryEvaluate`-based checks **catch**
`InsimulPrologException` (e.g. an undeclared predicate's existence_error) and
treat it as "no solutions" — the last diagnostic is still readable via
`PrologGameAdapter.LastError`. This is why an undeclared `can_perform` allows by
default rather than crashing a scene.
