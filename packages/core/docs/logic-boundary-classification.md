# The game-engine/logic boundary, classified

**US-2 of `93-runtime-logic-to-core`.** Machine-generated ground truth lives in
[`shared/LOGIC_BOUNDARY.json`](../../../shared/LOGIC_BOUNDARY.json) (regenerate with
`npm run logic:classify`, drift-guarded by `shared/__tests__/import-hygiene.test.ts`).
This document is the reading of it: what the numbers mean, what has to happen before
US-3 moves anything, and what the other three engines are actually inheriting.

## Why the original measurement was not enough

`packages/babylon/src/engine/game-engine/logic/` contains **zero `@babylonjs` imports**.
That is true, and it is what made "logic/ is the shared runtime, rendering/ is one
platform's adapter" measurable in the first place. It is also not sufficient. A module
can be welded to the Babylon runtime three ways that an import scan for `@babylonjs`
never sees:

1. **Through a type.** `import type { CombatSystem } from '../rendering/CombatSystem'`
   names no engine package, and it erases at runtime — but it makes the file
   un-typecheckable outside the Babylon tree.
2. **Through a `@shared/*` shim.** 259 of the 420 files under `shared/` are one-line
   re-exports into `packages/babylon/src`. `@shared/game-engine/rendering/LanguageDebugLogger`
   *is* the Babylon runtime; the specifier just doesn't say so.
3. **Through a runtime assumption.** `window.addEventListener('beforeunload', ...)` needs
   a browser. `packages/core/tsconfig.json` deliberately omits the `dom` lib, so this is
   not even a judgement call — it does not compile in core.

So every module is classified by what its **transitive first-party closure actually
reaches**, following relative paths, `@shared/*` through the shims, and `@insimul/*`
aliases, with `import type` edges tracked separately from value edges.

## The counts

| class | modules | lines | meaning |
| --- | --- | --- | --- |
| **(a)** engine-agnostic, moving | 41 | 11,512 | Whole closure is already inside `logic/` or `packages/core/src`. Nothing has to move first. |
| **(b)** engine-agnostic, blocked | 19 | 6,729 | Clean itself; closure reaches real source still living in `shared/` or elsewhere in the Babylon package. Nine distinct blockers, all resolvable. |
| **(c)** actually Babylon-coupled | 10 | 6,546 | Named individually below. Do not move. |

70 modules, 24,787 lines. (`GameQuestManager.d.ts` is counted here but is a type surface,
not an implementation — its concrete class is injected by the platform at export time.)

## Class (c): the ten, named

The story's instruction is *do not paper over it* — a file that assumes a Babylon scene
graph will break Unity in a way no TypeScript check catches. Each has a recorded
`disposition` in `COUPLING_VERDICTS` (`scripts/classify-logic-boundary.mjs`), and the
drift guard fails if a class-(c) module ever appears without one.

**The headline finding: three of the five "heavy hitters" the PRD names for US-3 are
class (c), and all three for the same reason — a debug-logging seam.**

| module | lines | coupling | disposition |
| --- | --- | --- | --- |
| `GamePrologEngine.ts` | 2,267 | `isDebugLabelsEnabled()` from `rendering/DebugLabelUtils`; `getDebugEventBus()` from `debug-event-bus` | invert |
| `AssessmentEngine.ts` | 1,042 | inherits the above, plus one `window` reference | invert |
| `LanguageProgressTracker.ts` | 1,313 | `LanguageDebugLogger` (a rendering module); `window.addEventListener('beforeunload')` | invert |
| `RadiantQuestDirector.ts` | 186 | **type-only** `import type { GamePrologEngine }` — already constructor-injected | invert |
| `EquipmentManager.ts` | 111 | **type-only** `import type { CombatSystem }` | invert |
| `AmbientLifeBehaviorSystem.ts` | 460 | **type-only** `import type { NPCPersonality }` from `rendering/NPCScheduleSystem` | invert |
| `CraftingSystem.ts` | 521 | value import of `ResourceType` + `ResourceSystem` from `rendering/ResourceSystem` | invert |
| `ActionHotspotIntegration.ts` | 134 | constructs `PlayerActionSystem` | **stays** |
| `WorldObjectActionManager.ts` | 450 | `getItemTranslation` from `rendering/OnboardingLauncher`, which pulls in `@babylonjs/gui` | **stays** |
| `GameQuestManager.d.ts` | 62 | references the `GamePrologEngine` shim | platform surface |

Three things are worth stating plainly about this table.

**The debug seam is doing more damage than anything else.** `GamePrologEngine` — 2,267
lines of Prolog runtime, the single most important module in this whole extraction — is
held on the Babylon side of the boundary by exactly two value imports: a boolean flag
getter (`isDebugLabelsEnabled`) that happens to live in a 332-line Babylon GUI module,
and an event bus whose own tie to Babylon is a single `import type DebugLogCategory`.
`AssessmentEngine` and `RadiantQuestDirector` are class (c) only because they touch
`GamePrologEngine` (as is `GameQuestManager.d.ts`, via the shim). Inverting one debug-sink
interface clears the coupling on four modules totalling 3,557 lines — `AssessmentEngine`
then needs one further thing, the host lifecycle hook described at the end of this
document.

**Four of the ten are coupled only through types.** `RadiantQuestDirector`,
`EquipmentManager`, `AmbientLifeBehaviorSystem` and `GameQuestManager.d.ts` have no value
edge into Babylon at all — 819 lines whose entire coupling erases at runtime. These are
the cheapest to fix, via the structural stand-in precedent already established in this
repo (`packages/core/src/game-engine/visual-types.ts`, US-CE6). Note especially
`AmbientLifeBehaviorSystem`: its one `import type { NPCPersonality }` drags the entire
interior-generation subtree — `BuildingInteriorGenerator`, `InteriorLightingSystem`,
`FurnitureModelLoader`, `@babylonjs/core/Lights/Shadows/shadowGenerator` — into its
closure. The long `@babylonjs` path list the JSON reports for it is that type import's
shadow, not a runtime dependency. Read `typeOnly` before reacting to a path.

**Two genuinely stay.** `ActionHotspotIntegration` exists to wire hotspots into the
Babylon player-action loop, and `WorldObjectActionManager` mediates between world objects
and on-screen prompts. Both are adapter glue by purpose, not runtime logic trapped on the
wrong side of a line. Splitting them is a rewrite, not a move. (`ActionHotspotIntegration`'s
sibling `ActionHotspotGenerator` *is* class (a) and moves — the generator/integration
split is already in the right place.)

## Class (b): nine blockers, and how each is resolved

AC3 of the story: a class-(b) dependency is resolved by **moving it into core or
inverting it — never by re-exporting from babylon back into core.** That route would
invert the dependency arrow US-1's guard exists to protect, so it is not merely
discouraged: every blocker carries a prescribed `moveTo` in `BLOCKER_RESOLUTIONS`, and
the drift guard fails if any target lands outside `packages/core/src`.

| blocker | blocks | resolution |
| --- | --- | --- |
| `game-engine/types.ts` | 13 | move the clean subset → `core/src/game-engine/runtime-types.ts` |
| `shared/language/phonetic-similarity.ts` | 4 | move → `core/src/language/phonetic-similarity.ts` |
| `shared/language/pronunciation-scoring.ts` | 4 | move → `core/src/language/pronunciation-scoring.ts` |
| `game-engine/action-selection.ts` | 2 | move → `core/src/game-engine/action-selection.ts` |
| `game-engine/quest-action-mapping.ts` | 2 | move → `core/src/game-engine/quest-action-mapping.ts` |
| `game-engine/action-matrix.ts` | 1 | move → `core/src/game-engine/action-matrix.ts` |
| `game-engine/system-contracts.ts` | 1 | move → `core/src/game-engine/system-contracts.ts` |
| `shared/asset-paths.ts` | 1 | move → `core/src/asset-paths.ts` |
| `shared/language/quest-templates.ts` | 1 | move → `core/src/language/quest-templates.ts` |

Seven of the nine are dependency-free files — zero imports each — so they are a straight
`git mv` plus the four-line re-export shim this repo already uses everywhere. The two
that are not:

- **`game-engine/types.ts` is the one that needs judgement.** It blocks 13 modules, more
  than the other eight combined. Its own header declares it engine-agnostic ("must NOT
  import any engine-specific modules") and it imports nothing — but it sits under
  `@ts-nocheck` for genuine pre-existing duplicate-interface bugs. Crucially, **every one
  of those duplicates is interior/street geometry** (`InteriorTemplateConfig` ×3,
  `InteriorLayoutTemplate`, `StreetNode`, `StreetNetwork`, `UnifiedBuildingTypeConfig`),
  and **none of them is in the ~20-symbol subset `logic/` actually imports** — that subset
  is `Action`/`ActionContext`/`ActionResult`/`ActionEffect`/`ActionState`/`ACTION_UI_CONFIGS`,
  `InventoryItem`, `EquipmentSlot`, `Container`/`ContainerItem`, `CraftingRecipe`/`CraftedItem`/`ItemCategory`,
  `GameSaveState`, `SavedConversationRecord`, `AnimationState`, `NPCRole`, `NoticeArticle`,
  `ILocalAIProvider`. So the move is: lift that subset into core as a real, *checked*
  module and have the Babylon `types.ts` re-export it (babylon → core is the allowed
  direction). Do **not** carry the `@ts-nocheck` into core — CLAUDE.md forbids adding one,
  and the whole point of core is that it typechecks standalone.
- **Two ordering constraints, not extra blockers.** `system-contracts.ts` imports
  `./types`, so it moves after the subset above. `action-matrix.ts` imports
  `type GameEventType` from `logic/GameEventBus`, which is itself class (a) — so it moves
  *with* the US-3 wave rather than ahead of it.

One near-miss worth recording: `game-engine/data-source.ts` looks like a blocker and is
not. It is a one-line `export * from '@insimul/core/game-engine/data-source'` — a shim
whose arrow already runs the right way. The classifier treats any file whose entire body
is import/export-from statements as transparent, so shim chains
(`shared/game-engine/data-source` → `babylon/.../data-source` → core) are walked through
rather than reported. Without that, core would appear to depend on babylon when it does
not.

## What this means for US-3 and after

**Sequence.** (1) Move the seven dependency-free blockers and lift the `types.ts` subset.
That converts all 19 class-(b) modules to class (a) with no behaviour change. (2) Move the
resulting 60 modules into core behind shims. (3) Invert the debug seam — that is the
single highest-leverage change on this list and it reclaims `GamePrologEngine`.

**For the engine adapters (and for 94).** Of the 24,787 lines under `logic/` today:

- **18,241 lines (60 modules) are shared runtime** — class (a) plus class (b), which is
  class (a) once its dependencies move. This is what Unity, Unreal and Godot get to stop
  re-implementing.
- **5,900 lines (7 modules) are reachable but need an inverted interface first.** Those
  interfaces are exactly what US-4 has to specify — a debug/telemetry sink, a persistence
  lifecycle hook (`beforeunload`-equivalent), a harvestable-resource query. The Babylon
  modules become the reference implementations.
- **584 lines (2 modules) are Babylon adapter glue** and stay. Every engine writes its
  own.

**The `dom` findings are an adapter surface, not a nuisance.** `LanguageProgressTracker`
flushes progress on `beforeunload`; `AssessmentEngine` reads a `window` field. Neither
wants a browser specifically — both want "tell me when the host is going away". That is a
persistence lifecycle hook the adapter provides, and it belongs in US-4's contract.
