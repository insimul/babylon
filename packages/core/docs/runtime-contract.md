# The Insimul runtime contract

**US-4 of `93-runtime-logic-to-core`.** What `@insimul/core` provides, what an
engine adapter must provide back, what is deliberately *not* in scope, and what
still stands between here and one runtime shared by four engines.

Read this before writing a Unity, Unreal or Godot adapter. Its companion
documents are [`logic-boundary-classification.md`](./logic-boundary-classification.md)
(how the boundary was measured, and every module that did not cross it) and the
two interface files it describes:

| file | direction | what it declares |
| --- | --- | --- |
| [`src/game-engine/system-contracts.ts`](../src/game-engine/system-contracts.ts) | engine implements, engine owns | The nine systems each engine **ports** from the Babylon reference (combat, rules, quest, inventory, crafting, resources, survival, dialogue, actions). |
| [`src/game-engine/host-contracts.ts`](../src/game-engine/host-contracts.ts) | engine implements, **core calls** | The five hooks the shared runtime needs from its host (debug sink, lifecycle, speech, resource store, combat stats). |
| [`src/game-engine/data-source.ts`](../src/game-engine/data-source.ts) | engine implements, **core calls** | `IDataSource` — all persistence and content loading. Predates the split; already the interface core reads and writes through. |

Both `host-contracts.ts` and `system-contracts.ts` are subpath-only imports
(`@insimul/core/game-engine/host-contracts`); they are not in the flat
`src/index.ts` barrel, because 59 runtime systems collide on names like `Action`
and `ItemCategory`.

---

## 1. What core provides

The shared runtime is `src/game-engine/logic/` — **59 modules, 17,946 lines**,
moved out of the Babylon package by US-3 unchanged except for their import
paths. It is engine-agnostic in the strict sense: no `@babylonjs/*`, no `react`,
no DOM (core's `tsconfig.json` omits the `dom` lib), and it typechecks and tests
standalone with cwd = `packages/core`.

Alongside it core provides the **contract** layer the runtime operates on: the
save-file format and its migrations, the World IR, quest and language types, the
KINP identity/equivalence/world surface, the radiant-quest generator, the Prolog
toolchain (`src/prolog/`) with its predicate schema, and the zod/JSON schemas.

### 1.1 Quest and narrative state — 15 modules, 5,299 lines

| module | lines | what it is |
| --- | --- | --- |
| `QuestCompletionEngine` | 1,897 | Prolog-backed objective evaluation and completion detection. The flagship. |
| `DynamicQuestWaypointDirector` | 478 | Chooses which waypoint a live quest should point at. |
| `NoticeGenerator` | 428 | Notice-board copy for generated quests. |
| `QuestMarkerService` | 340 | Quest → marker records (positions in, markers out; no meshes). |
| `ClueStore` | 326 | Investigative clue state. |
| `TutorialQuestSystem` | 321 | The onboarding quest chain. |
| `QuestDebugOverlay` | 280 | Diagnostic view model over quest state. |
| `QuestPostConditionValidator` | 230 | Post-completion world-state assertions. |
| `QuestRewardIntegration` | 193 | Reward application on completion. |
| `DynamicQuestBoard` | 190 | Board contents and refresh policy. |
| `PlaythroughQuestOverlay` | 188 | Per-playthrough overrides on authored quests. |
| `QuestMinimapMarkers` | 166 | Minimap marker records. |
| `ConversationQuestBridge` | 161 | Routes dialogue outcomes into quest progress. |
| `QuestAutoCompletionDetector` | 81 | Detects objectives satisfied incidentally. |
| `waypointFading` | 20 | Distance → waypoint opacity curve. |

### 1.2 Dialogue, language and observation — 13 modules, 3,057 lines

| module | lines | what it is |
| --- | --- | --- |
| `ConversationalActionDetector` | 425 | Recognises in-dialogue actions from player utterances. |
| `pronunciation-helpers` | 347 | Pronunciation scoring helpers over `src/language/`. |
| `ConversationDifficultyMonitor` | 283 | Live CEFR difficulty tracking. |
| `KnowledgeCollectionSystem` | 281 | Knowledge/fact collection progress. |
| `ObjectIdentificationSystem` | 281 | "Name this object" identification loop. |
| `PointAndNameAction` | 270 | The point-and-name learning interaction. |
| `VocabularyCollectionSystem` | 239 | Vocabulary acquisition state. |
| `VisualVocabularyDetector` | 219 | Maps observed objects to vocabulary items. |
| `LocalNpcConversation` | 177 | Local (non-LLM) NPC conversation fallback. |
| `actions/ListenAndRepeatAction` | 167 | Listen-and-repeat drill. |
| `actions/ReadSignAction` | 131 | Read-a-sign drill. |
| `GameTextTypes` | 113 | The in-world text taxonomy. |
| `ConversationGoalEvaluator` | 124 | Scores a conversation against its goal. |

### 1.3 Inventory, crafting and gathering — 6 modules, 2,608 lines

| module | lines | what it is |
| --- | --- | --- |
| `RecipeCraftingSystem` | 665 | Recipe-driven crafting. |
| `FarmingSystem` | 534 | Planting, growth stages, harvest. |
| `HerbalismSystem` | 534 | Herb identification and gathering. |
| `MiningSystem` | 384 | Node depletion and yields. |
| `FishingSystem` | 340 | Catch tables and timing. |
| `ContainerManager` | 151 | Container contents and transfers. |

### 1.4 Social simulation — 7 modules, 2,207 lines

| module | lines | what it is |
| --- | --- | --- |
| `VolitionSystem` | 648 | Volition rules — what an NPC wants to do and why. |
| `ResidenceActivitySystem` | 331 | What NPCs do at home. |
| `BusinessBehaviorSystem` | 300 | What NPCs do at work. |
| `RomanceSystem` | 252 | Romance progression. |
| `CulturalEventManager` | 235 | Festivals and scheduled cultural events. |
| `RelationshipManager` | 226 | Relationship values and tiers. |
| `ActivityObservationRewards` | 215 | Rewards for observing NPC activity. |

### 1.5 World state, time and pacing — 6 modules, 2,482 lines

| module | lines | what it is |
| --- | --- | --- |
| `GameTruthSync` | 926 | Keeps the Prolog KB and the live world in agreement. |
| `RunManager` | 560 | Run/session lifecycle. |
| `GameEventBus` | 285 | Typed in-runtime event bus (`GameEventType`). |
| `ContentGatingManager` | 264 | Gates content on progression. |
| `GameTimeManager` | 227 | Game clock, day phase, calendar. |
| `TemporaryStateSystem` | 220 | Timed buffs, debuffs and flags. |

### 1.6 Session and persistence — 3 modules, 513 lines

| module | lines | what it is |
| --- | --- | --- |
| `SaveConflictResolver` | 377 | Reconciles divergent saves. |
| `NotificationStore` | 82 | Pending player notifications. |
| `OnboardingManager` | 54 | First-run onboarding state. |

### 1.7 Presentation-neutral data the adapter renders — 9 modules, 1,780 lines

These decide *what* should exist or be shown. They emit plain records — ids,
positions, weights, manifests — and never touch a scene graph. The adapter turns
them into meshes, sounds and input bindings.

| module | lines | what it is |
| --- | --- | --- |
| `actions/ActionManager` | 421 | Registry and dispatch for player actions. |
| `ActionHotspotGenerator` | 350 | Computes where interaction hotspots belong. |
| `AmbientSoundSystem` | 250 | Decides which ambience should be playing. |
| `NPCModelManifest` | 201 | NPC → model/asset selection. |
| `TerrainVegetationPlacer` | 175 | Vegetation placement records. |
| `NPCModelVariety` | 109 | Model variation assignment. |
| `KeyboardMap` | 103 | Default action → key bindings (data, not input handling). |
| `NatureLODConfig` | 96 | LOD thresholds. |
| `VRComfortSettings` | 75 | Comfort-option defaults. |

---

## 2. What an engine adapter must provide

Five hooks in [`host-contracts.ts`](../src/game-engine/host-contracts.ts), plus
`IDataSource`. Every field of `EngineHostAdapter` is optional and degrades to a
documented fallback, so an adapter can come up in stages.

| interface | core needs it for | Babylon reference implementation | fallback when absent |
| --- | --- | --- | --- |
| `IDebugSink` | Developer diagnostics from the Prolog engine, quest evaluation and language scoring. | `isDebugLabelsEnabled()` (`rendering/DebugLabelUtils.ts`) + `getDebugEventBus()` (`game-engine/debug-event-bus.ts`) | `NULL_DEBUG_SINK` — no diagnostics. |
| `IHostLifecycle` | Flushing unsaved progress before the host goes away. | `window.addEventListener('beforeunload', …)` in `LanguageProgressTracker` | No flush-on-exit; progress persists on its normal cadence only. |
| `ISpeechSynthesizer` | Pronunciation playback and assessment passages. | `AssessmentEngine`'s speech SDK path, falling back to Electron Piper TTS | Text-only practice. Returning `null` is a normal outcome, not an error. |
| `IResourceStore` | "Can I afford this recipe / take the ingredients." | `rendering/ResourceSystem`'s `hasResources` / `consumeResources` | Crafting from world resources unavailable. |
| `ICombatStatSink` | Applying equipment bonuses to player stats. | `CombatSystem.getEntity(id)` plus direct field writes | Equipment tracked, stats not applied. |
| `IDataSource` | **All** content loading and persistence. | `ApiDataSource` / `FileDataSource` | None — this one is required. |

`host-contracts.ts` also carries the plain data shapes those hooks exchange —
`DebugSinkEvent`, `SynthesizedSpeech`, `CombatStats`, and `NpcPersonalityTraits`
(the Big-Five weights `AmbientLifeBehaviorSystem` scores behaviour by,
structurally identical to Babylon's `NPCPersonality`). They are stand-ins in the
`visual-types.ts` sense: the existing Babylon values are assignable to them, so
the adapter is a wrapper rather than a rewrite.

The nine ported systems in `system-contracts.ts` are the other half of the
adapter's job. Each already carries its per-engine filename in a doc comment
(`ICombatSystem` → `CombatSystem.h` / `CombatSystem.cs` / `combat_system.gd`).

**The precedent for this shape is Unity's `IRadiantSolver`:** an interface
declared in the shared layer with a native implementation behind it, so the
shared code calls one name and each engine supplies its own solver. Every entry
above follows it — an interface core defines and the adapter implements, never a
re-export from a runtime back into core. `packages/core/README.md` § "The one-way
rule" explains why that distinction is load-bearing, and three mechanisms
enforce it (`import-hygiene.test.ts`, `npm run check:core-standalone`, core's
`tsconfig.json`).

### 2.1 These interfaces are declared, not yet wired

Stated plainly because an adapter author will otherwise go looking: the seven
modules that need these hooks **still live in `packages/babylon`**. They are
class (c) of the boundary classification — `GamePrologEngine` (2,267),
`LanguageProgressTracker` (1,313), `AssessmentEngine` (1,042),
`CraftingSystem` (521), `AmbientLifeBehaviorSystem` (460),
`RadiantQuestDirector` (186), `EquipmentManager` (111), **5,900 lines**. Four of
the seven are coupled only through `import type`, so their coupling erases at
runtime.

Declaring the interfaces here is what US-4 owed; performing the inversion is a
behaviour change and belongs to its own story, not to the import-path-only move
US-3 made. Until it happens, an adapter implements these interfaces and gets the
59 modules above; the seven arrive with the inversion.

### 2.2 Quest seed generation — `IQuestSeedSource`

The same pattern, for the one capability that is *authoring* rather than
*engine*: generating quest content.
[`quests/quest-seed-source.ts`](../src/quests/quest-seed-source.ts) declares
`IQuestSeedSource`, the whole surface the runtime quest orchestrator
(`GameQuestManager`) asks a host for — twenty methods, one per generator call
site, plus two sub-capabilities (`IQuestGuildSource`, `IQuestChainSource`) it
holds for its lifetime.

It is separate from `EngineHostAdapter` on purpose. Those five hooks are
*engine* seams — an adapter author writing `combat_system.gd` implements them.
This one is a *content* seam: the implementation is seventeen quest generators
(~17k lines) that live in the closed authoring platform and must not be vendored
into the open runtime (`docs/PLATFORM_SPLIT_AND_ENGINE_PLUGINS.md` §A0). Core
states the capability; the platform hands in an implementation at export time;
no closed generator ever appears in an open repo. An engine adapter, in
contrast, normally supplies nothing here — an exported game's quests are already
in its world export.

| what the host supplies | core needs it for | platform reference implementation | fallback when absent |
| --- | --- | --- | --- |
| `IQuestSeedSource` | Generating quests on demand and on world triggers: seed, assignment, business-roleplay, emergency, mystery, reading, side, fetch, multi-NPC, shopping, crafting, number-practice, weather/time, error-correction, adaptive, plus pool replenishment and daily rotation. | the seventeen `shared/quests/*` generators (closed) | `NULL_QUEST_SEED_SOURCE` — no quests are generated; a world plays with the quests its export already carries. |
| `IQuestGuildSource` | Finding the guild-master NPC for a guild and walking its quest ladder. | `quests/guild-quest-manager.ts` (closed) | `NULL_QUEST_GUILD_SOURCE` — no guilds. |
| `IQuestChainSource` | Chain-completion bonuses and unlocking the next quest in a linear chain. | `quests/quest-chain-manager.ts` (closed) | `NULL_QUEST_CHAIN_SOURCE` — chains never complete or advance. |

Two shape rules make the interface satisfiable without leaking the closed side:

- **Each option bag mirrors what the orchestrator already passes** — it builds
  them from `QuestStorageProvider` reads (world, characters, settlements,
  businesses, existing quests) — so the platform's implementation is a
  delegating wrapper, not a rewrite, and the ported orchestrator's behaviour is
  unchanged.
- **Payloads core does not interpret are `unknown`** (learning profiles,
  language progress, recurring-quest status, guild progress). Core owns the call
  graph, never the authoring vocabulary.

Generators return drafts (`InsertQuest`) and never persist; the orchestrator
saves, so it can stamp world/player/language fields and attach Prolog content
uniformly. `QuestStorageProvider` — the storage surface both sides read through
— moved into core with this story
([`quests/quest-storage-provider.ts`](../src/quests/quest-storage-provider.ts),
re-export shim left at `@shared/quests/quest-storage-provider`).

**Declared, not yet wired**, exactly as §2.1: `GameQuestManager` is still a
`.d.ts` type surface in `packages/babylon` at this story. Moving the
implementation into core behind this interface is US-2 of
`94-quest-manager-interface`, and supplying the platform-side implementation is
tasklist 97.

---

## 3. What is NOT covered, by design

**Rendering and geometry stay per-engine.** `game-engine/rendering/` — 155 files
in `packages/babylon` — is one platform's adapter, and every engine writes its
own. There is no shared mesh, material, camera, GUI or input-handling layer in
core, and there never will be one: the abstraction that spans Babylon, Unreal,
Unity and Godot rendering is each engine's own scene API.

**Geometry is not generated at play time.** The editor plugin places content
once, into the World IR; the runtime consumes those placements. So an adapter
author will not find (and does not need) building generation, interior layout,
street networks or terrain synthesis here. `StreetNetworkLayout` is the visible
edge of this: it is engine-agnostic TypeScript and still did not move, both
because it is street *geometry* and because it depends on duplicate-shape
`StreetNode` / `StreetNetwork` interfaces quarantined under `@ts-nocheck` in the
Babylon `types.ts` (it moves when US-RS4 dedupes them).

**Two modules are adapter glue by purpose** and stay in `packages/babylon`
forever: `ActionHotspotIntegration` (134) wires hotspots into the Babylon
player-action loop, and `WorldObjectActionManager` (450) mediates between world
objects and on-screen prompts. Their engine-agnostic siblings — notably
`ActionHotspotGenerator` — did move. Splitting these two is a rewrite, not a
move.

**`GameQuestManager` is a platform surface, not a runtime module.** It ships as a
`.d.ts` type surface; the concrete class is injected by the platform at export
time.

**Authoring is out of scope entirely.** Generating a world (quest seeds, corpora,
LLM content pipelines) is the platform's, per `docs/OPEN_SOURCE_STRATEGY.md`.
Core is what you embed to *run* a world.

---

## 4. Net-new capability for Unity, Unreal and Godot

The three engine packages carry their own runtimes today — roughly 13.2k lines
(Unity), 17.1k (Unreal) and 1.5k (Godot). The nine interfaces in
`system-contracts.ts` are what they have ported. Comparing those interfaces
against §1 gives the honest sizing question this section exists to answer:
**what is a port, and what is capability that does not exist outside the Babylon
tree at all?**

### 4.1 Where a counterpart exists, it is much shallower than core's module

| ported interface | its whole surface | core's module for the same area |
| --- | --- | --- |
| `IQuestSystem` | `loadQuests` / `startQuest` / `completeObjective` / `failQuest` / status queries — a status machine over a list | `QuestCompletionEngine`, 1,897 lines of Prolog-backed objective evaluation, plus 14 more quest modules |
| `IDialogueSystem` | `startDialogue` / `selectChoice` / `advance` — a dialogue-tree cursor | The 13 dialogue/language modules, incl. utterance-driven action detection and live CEFR difficulty |
| `ICraftingSystem` | `loadRecipes` / `canCraft` / `craft` | `RecipeCraftingSystem` plus farming, herbalism, mining, fishing |
| `IInventorySystem` | add/remove/query/weight | `ContainerManager` and the equipment path |
| `IResourceSystem` | `registerNode` / `harvest` / `tickRespawn` | the four gathering systems above |
| `IActionSystem` | `loadActions` / `executeAction` / cooldowns | `actions/ActionManager` and the action drills |
| `ICombatSystem`, `IRuleEnforcer`, `ISurvivalSystem` | combat, rule checks, needs | **no core counterpart** — these stay engine-side; core supplies the rule *data* through the Prolog toolchain |

So "Unity already has a QuestSystem" is true and does not mean quest logic is a
port. The ported systems are execution surfaces; core is the decision layer
behind them.

### 4.2 Whole capability areas with no counterpart in any of the three engines

Everything below exists **only** in the Babylon tree today. These are net-new
capability rather than a port, and their line counts are the sizing estimate:

| capability | modules | lines |
| --- | --- | --- |
| Prolog-backed quest completion, post-conditions, auto-detection, rewards | §1.1 minus the marker/board view models | ~2,900 |
| Quest presentation state — waypoints, markers, minimap, boards, notices, clues, overlays | §1.1 remainder | ~2,400 |
| Language acquisition — vocabulary, knowledge, pronunciation, CEFR difficulty, the four learning drills | §1.2 | 3,057 |
| Social simulation — volition, relationships, romance, residence/business behaviour, cultural events | §1.4 | 2,207 |
| World-truth synchronisation between the Prolog KB and the live world | `GameTruthSync` | 926 |
| Run/session lifecycle, game time, content gating, temporary state, the event bus | §1.5 remainder | 1,556 |
| Save-conflict resolution, notifications, onboarding | §1.6 | 513 |
| Placement and manifest data — hotspots, NPC models, vegetation, LOD, ambience, key maps, VR comfort | §1.7 | 1,780 |

Two of these are worth calling out to whoever plans the adapter wave. The
**language-acquisition stack** is the product, not a subsystem, and no engine
package has any of it. **`GameTruthSync`** is the module that makes Prolog-backed
world state work at all; without it an engine has a KB and a world that drift.

---

## 5. What still blocks a genuinely shared four-way runtime

Honest list. Nothing here is fatal; all of it is unfinished.

**1. ~~Two different Prolog implementations.~~ RESOLVED by tasklist 91.** The
browser used to run **tau-prolog** while the native engines linked
**libinsimul** — two implementations of the same corpus that disagreed on
library loading, on error reporting and on unbound bindings. Tasklist **91**
put both behind one interface (`src/prolog/prolog-engine.ts`), diffed them over
the corpus and the shipped rule packs in one process
(`docs/tau-wasm-parity.md`), and then deleted tau-prolog. The browser now runs
libinsimul/Trealla compiled to wasm32 — the *same engine source* as Unity,
Unreal, Godot and the Rust server, not a second implementation of it.

What remains is a gate rather than a proof: `conformance/prolog/*.json` is a
language-neutral parity corpus — **76 cases** across arithmetic, unification,
backtracking, negation, lists, assert/retract, gameplay, and the KINP
identity/equivalence/world packs — compared as an unordered multiset so a native
engine may enumerate in any order. One case carries a documented, printed
amendment (`AMENDMENTS` in `prolog-corpus.test.ts`, matching libinsimul's three
harnesses). An adapter that links libinsimul inherits the web runtime's Prolog
behaviour; one that brings its own interpreter is back in the old position and
should read `docs/tau-wasm-parity.md` first.

**2. The seven un-inverted modules** (§2.1, 5,900 lines) — including
`GamePrologEngine` itself. An adapter today gets the 59 modules and must supply
its own equivalent of those seven.

**3. `StreetNetworkLayout` and the duplicate-shape types** — blocked on US-RS4
deduping `StreetNode` / `StreetNetwork` / `StreetSegment` out from under the
Babylon `types.ts` `@ts-nocheck`.

**4. Type surfaces the platform injects at export time** (`GameQuestManager.d.ts`).
A native adapter has no export pipeline to inject them, so it must implement
them directly.

**5. No native adapter has been built against this contract yet.** Every
interface here is derived from exactly one implementation — Babylon's. Expect the
first Unity or Unreal adapter to find shapes that assumed a single-threaded,
garbage-collected host, and treat this document as revisable when it does.

---

## Keeping this document true

`src/game-engine/__tests__/runtime-contract.test.ts` fails if a module under
`src/game-engine/logic/` is missing from §1, or if an interface exported from
`host-contracts.ts` is missing from §2. A runtime system cannot join core
without appearing in the contract that describes core.
