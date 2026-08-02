# What the three editor plugins actually duplicate

*US-1 of `101-editor-plugin-core`. Measured 2026-08-02 against `unity`, `unreal`
and `godot` at the submodule checkouts, and against `packages/core` at
`04d5ebf`. Companion to [`runtime-contract.md`](runtime-contract.md) — that
document says what a native **runtime** adapter implements; this one says what a
native **editor** plugin should stop implementing.*

**Verdict: the plugins share considerably more than the tasklist assumed, and
core already owns a third of it as a reference implementation that nobody
consumes.** This tasklist continues. §6 names the first slice.

---

## 0. Method, and what it is worth

Every file under `unity/Editor`, `unreal/Source/InsimulEditor` and
`godot/addons/insimul/editor` was inventoried, plus the two places each engine
keeps the *pure* half of an editor capability outside those directories
(`unity/Runtime/{Binding,Scene}` and `godot/gdextension/src`). Line counts are
`wc -l` on source only; tests are counted separately in §1.3. Classification
(§2) is from reading the code; the drift claims in §5 are from checksumming and
parsing the committed fixtures, so they are facts about the repositories rather
than impressions.

Nothing here was executed. The Unity compiler, UBT and the Godot headless binary
are all absent from this harness (roadmap decision 9), so behavioural claims —
notably the re-import failure modes in §4.3 — are read from source and are
labelled as such.

---

## 1. Inventory

### 1.1 Totals

| | files | source lines | test lines |
|---|---:|---:|---:|
| Unity (`Editor/` + the pure cores in `Runtime/{Binding,Scene}`) | 34 | **6,538** | 5,203 |
| Unreal (`Source/InsimulEditor`, excl. `Tests/`) | 53 | **7,627** | 3,161 |
| Godot (`addons/insimul/editor` + the 3 editor files in `gdextension/src`) | 27 | **3,979** | 1,969 |
| **three engines** | **114** | **18,144** | **10,333** |
| `packages/core` today (`src/editor/` + `src/archetypes/taxonomy.ts`) | 7 | 1,505 | 1,035 |

The tasklist description quoted 61 files / 10.7k for Unreal, 29 / 3.8k for Godot
and 10 / 1.8k for Unity. Unreal's 10,788 is the whole module *including* its 3,161
lines of host tests; Unity's 1.8k counted only the top level of `Editor/` and
missed both `Editor/Connect/` and the ~2k of pure core it keeps in `Runtime/`.
The real spread is much flatter than "Unreal is 6× Unity": **7,627 / 6,538 /
3,979**.

### 1.2 By capability

Source lines (file count), tests excluded. The `core` column is what
`packages/core` already ships for that capability.

| Capability | Unity | Unreal | Godot | core today |
|---|---:|---:|---:|---:|
| Editor session, transport, secret store, v1 operation table | 742 (8) | 724 (10) | 299 (5) | **325** (2) |
| Generation console (job reducer + polling fallback) | 803 (3) | 1,056 (6) | 406 (3) | **361** (2) |
| World browser (list/detail/compat badge/import dry-run) | 832 (3) | 1,012 (6) | 348 (3) | **242** (1) |
| Conversation tester (picker, transcript reducer, fallback) | 884 (3) | 964 (4) | 500 (3) | **409** (1) |
| Binding resolution (chain, packs, tables, binding editor) | 1,660 (9) | 1,760 (12) | 1,070 (7) | 168 (1) † |
| Scene placement (manifest math + materialization) | 746 (3) | 1,126 (6) | 804 (3) | **0** |
| Re-import (diff classification + apply) | 490 (2) | 896 (6) | 552 (3) | **0** |
| Module boilerplate, content/native import, asmdefs | 381 (4) | 89 (3) | 0 | 0 |
| **total** | **6,538** | **7,627** | **3,979** | **1,505** |

† `src/archetypes/taxonomy.ts` is the *match primitive* only —
`matchArchetypeKey` / `archetypeSpecificity` / `archetypeAncestors`. The
resolution **chain** (priority-ordered tiers, first-tier-with-any-match wins,
pack parse/serialize, unbound report) is implemented four times and exists in
core zero times.

### 1.3 Tests

Unity 5,203 (`Tests/Editor/*.cs`, run on a bare .NET SDK); Unreal 3,161
(`Tests/*.cpp`, host-tested under plain clang); Godot 1,390 GDScript + headless
harness scripts, plus 579 lines of C++ in `gdextension/test` covering the same
three capabilities again. Core has 1,035 lines under `src/editor/__tests__`.

**Godot implements binding resolution, scene placement and re-import twice** —
once as a GDScript `@tool` twin and once in `gdextension/src` C++ — 1,171 of its
3,979 source lines. Each file's header names the other as the mirror it must not
diverge from. That is intra-engine duplication of exactly the kind this tasklist
exists to remove, and it doubles the cost of every policy change in Godot.

---

## 2. Classification

### (a) Genuinely shared logic — belongs in a core

| Logic | Where it is now |
|---|---|
| v1 operation table (11 ops) + operationId → method/path resolution | **core** + 3 hand-written copies |
| Session/token lifecycle: verify on login, clear on 401, health probe | **core** + 3 copies |
| Generation-job reducer (`queued→running→succeeded\|failed`), SSE and polling folded through one reducer | **core** + 3 copies |
| Poller teardown semantics (dispose drops in-flight callbacks; stop on terminal) | **core** + 3 copies |
| World list/detail reduction, compatibility badge, import dry-run summary | **core** + 3 copies |
| Conversation transcript reducer + recorded-reasoning fallback | **core** + 3 copies |
| Archetype key grammar, match kinds, specificity | **core** + 3 copies |
| Binding **chain**: tier priority sort, first-tier-with-a-match, most-specific-within-tier, unbound report, canonical pack serialization | 4 copies, **none in core** |
| Placement **math**: entity-id minting, grid snap, bilinear terrain height sampling, coordinate quantization, canonical manifest serialization, canonical node ordering | 3 copies, **none in core** |
| Re-import **classification**: the five-way `added/updated/unchanged/skipped/deprecated` policy, `PlacedNodesEquivalent`, canonical report | 3 copies, **none in core** |
| Re-import **apply orchestration** over a mutator interface | 3 copies, **none in core** |

Six of these already live in `packages/core/src/editor/` and
`src/archetypes/taxonomy.ts`, written explicitly as "the engine-agnostic
contract every native engine's editor session mirrors". They are mirrored by
hand, not consumed. Four more — the binding chain, placement math, re-import
classification and re-import apply — are the un-shared remainder and are the
larger half by line count (**~5,900 of the 18,144**).

### (b) Decisions shareable, execution not — the interesting class

| Decision (core) | Execution (host) |
|---|---|
| Which node, at which transform, bound to which archetype (the placement manifest) | `GameObject`+prefab / `AActor`+`ULevelInstance`+Landscape / `Node3D`+`PackedScene` |
| Which entityIds to update, add, deprecate | scene-tree surgery, undo transactions, reparenting to the Deprecated group |
| An archetype key resolves to *this* binding entry in *this* tier | turning that entry's handle into a real asset (`AssetDatabase` GUID / `.uasset` soft path / `res://` path) |
| The request to make (operationId, method, URL, headers, body) | `UnityWebRequest` / `FHttpModule` / `HTTPRequest` |
| "The token is a secret and must never enter a VCS-committed project file" | `EditorPrefs` / UE per-user config / `EditorSettings` |
| Job/world/conversation view-model state | dock repaint, widget tree |

This is the shape the runtime core already uses (`host-contracts.ts`), and the
shape Unity's `IRadiantSolver` set the precedent for. The three engines have each
*already discovered it independently*: Unreal isolated its pure half into
`Source/InsimulEditor/Portable/`, Unity into `Runtime/{Binding,Scene}` behind
`IReimportSceneMutator` / `ISceneBuilder`, Godot into `gdextension/src`. Three
teams drew the same line in the same place. What is missing is one implementation
behind it.

### (c) Irreducibly per-engine

- Dock and window chrome: `EditorWindow` + IMGUI, Slate `SWidget`, `Control`
  docks registered by an `EditorPlugin`. ~1,100 lines across the three.
- Editor lifecycle and registration: `[MenuItem]`, `IModuleInterface`,
  `_enter_tree`/`_exit_tree`, `.asmdef` / `.Build.cs` / `plugin.cfg`.
- Asset materialization and engine-native formats: prefab vs Blueprint vs
  `PackedScene`; Unity's `PlaceholderPackGenerator` building primitive meshes
  (174 lines), Unreal's `InsimulPcgVegetation` driving PCG (317 lines) and its
  Landscape/Level-Instance path.
- The entity stamp itself: a `MonoBehaviour` component, a `UActorComponent`, and
  node metadata + groups are not the same object. The five *fields* are shared;
  the carrier is not.

---

## 3. Overlap with the runtime core — what must not be defined twice

This is the failure mode the story exists to prevent, so it is stated as a rule
list rather than prose.

| Concept | Already owned by | Editor core must |
|---|---|---|
| World IR | `src/game-engine/ir-types.ts` (`WorldIR` + ~60 `*IR` interfaces) | **consume** it. The placement input is a `WorldIR`, not a new shape. |
| Save/world format version | `src/save-file.ts` `SAVE_FILE_VERSION` | reuse. Precedent already set: `editor/world-browser.ts` imports it for the compatibility badge rather than inventing a constant. |
| Archetype taxonomy | `src/archetypes/taxonomy.ts` (five roots) | reuse — and *enforce*, which nothing does today (§5.3). |
| Entity identity | `src/identity/kinp.ts` | see the open question below. |
| Authored-content unit | `schemas/content-library.schema.ts` | reuse for any import path; do not define a second library shape. |
| Canonical JSON | each engine has its own (`InsimulCanonicalJson.h`, `canonical_json.cpp`, …) | one canonical serializer, since every artifact in §4 is byte-compared. |

**Open question for US-2 — one id scheme or two.** Every placement manifest and
every re-import diff keys on a bare local id (`building.a`,
`bld-townhall.interior`, `terrain.chunk.0_0`). KINP (§3.3 of
`src/identity/kinp.ts`) says a world-scoped entity is
`insimul:world:<w>:ent:<id>`, and `sanitizeLocalId` is lossless precisely so an
id can round-trip. The editor's match key and the runtime's identity are the same
concept spelled two ways. Either the editor core adopts CURIEs for the stamp, or
it documents the stamp as a deliberately world-local shorthand with a stated
mapping. Guessing silently is how two cores that each define identity happen.

**Separation, and where it is already broken.** A shipping game embeds the
runtime core and not the editor core, so the two must share types without being
entangled. Both sides currently violate that:

- **Unity ships its editor cores in the player build.**
  `Runtime/Scene/ReimportDiff.cs`, `Runtime/Scene/SceneGenerator.cs` and the
  whole of `Runtime/Binding/` sit under the `Insimul.Runtime` asmdef —
  `autoReferenced: true`, no `excludePlatforms` — so ~2,000 lines of edit-time
  policy compile into every Unity player.
- **Core did the same thing in TypeScript.** `src/index.ts` re-exported five
  editor modules (`operations`, `editor-session`, `world-browser`,
  `generation-console`, `job-poller`) from the flat runtime barrel, so anything
  importing `@insimul/core` pulled edit-time view-models into its graph. Only
  `editor/conversation-tester` was deep-import-only, and only because of a name
  collision, not by design.

  **US-2 emptied that list** — the barrel now names no editor module and the
  surface is deep-import-only (`@insimul/core/editor`, `@insimul/core/editor/<module>`):

  <!-- barrelled-editor-modules -->
  ```
  ```

  The block is drift-guarded in both directions, so a re-added export fails as
  loudly as a removed one. `src/editor/__tests__/editor-surface.test.ts` guards
  the same invariant from the other side: no runtime module may import `editor/`,
  and no editor module may import the flat barrel.

  `archetypes/taxonomy` stays in the runtime barrel deliberately — 168 lines of
  pure string grammar with no view-model, transport or session state, i.e. a
  shared *type*, which US-2's criterion explicitly allows.

US-2's first acceptance criterion ("must not be entangled") therefore started by
*fixing an existing violation*, not by avoiding a hypothetical one. **The Unity
half is not fixed** — `Runtime/{Binding,Scene}` still compiles into every player
build — and it cannot be from this worktree; it is adoption work for US-3's
per-engine note.

---

## 4. Re-import, analysed on its own

### 4.1 The policy, which all three already share

Five mutually exclusive classes, keyed on the entity stamp:

| Class | Condition | Action |
|---|---|---|
| `added` | in NEW, absent from OLD | materialize + stamp |
| `updated` | in BOTH, old is `generated`, transform/binding differ | re-apply fresh transform + binding |
| `unchanged` | in BOTH, old is `generated`, equivalent after quantization | no-op |
| `skipped` | OLD has `generated == false` | preserve verbatim — present *or* absent from NEW |
| `deprecated` | OLD is `generated`, absent from NEW | reparent under `Deprecated`, **never delete** |

A dry run renders the report; the human confirms; only then does anything mutate.
The report is a pure function of (old nodes, new nodes), with ascending id lists
and canonical key-sorted minified JSON so two engines produce byte-identical
output.

### 4.2 How each engine detects a creator edit

| | stamp carrier | fields |
|---|---|---|
| Unity | `InsimulEntityId` MonoBehaviour | `entityId, kind, archetype, bindingSource, generated` |
| Unreal | `UInsimulEntityIdComponent` | same five |
| Godot | node metadata `insimul_*` + groups | same five |

An **untagged** object is never in the diff and is never touched — that is how a
hand-*placed* object survives. A **tagged** object survives by having its
`generated` flag cleared.

The three legs agree: `golden-diff-report.json` is byte-identical across Unity,
Unreal and Godot (Godot's file differs only by a trailing newline). This is the
one place in the whole editor layer where all three genuinely converge.

### 4.3 What the policy does *not* protect — the product risk, sharpened

Read from source; not executed.

1. **The `generated` flag is opt-out, and the creator must know to flip it.**
   A creator who nudges a generated building without clearing `generated` is
   classified `updated` — `PlacedNodesEquivalent` compares the quantized
   transform, so a moved node is by definition not equivalent — and `UpdateNode`
   re-applies the manifest transform over their edit. There is no per-field
   ownership ("the transform is mine, the asset is yours"), so the only way to
   keep a tweak is to opt the whole node out of future updates, which also opts
   it out of every future fix. This is identical in all three engines because
   they hand-ported one policy.
2. **Only direct children of the generated root are diffed.** Unity's
   `ReadTreeNodes` iterates `foreach (Transform child in root)` and the Unreal
   and Godot appliers mirror it. A creator who organises generated nodes into
   sub-groups of their own removes them from OLD; the next import classifies them
   `added` and creates duplicates alongside the originals. Reorganising a scene
   is a normal thing to do, and nothing warns.
3. **`deprecated` never converges.** Nodes accumulate under `Deprecated` forever
   with no lifecycle. Correct as a safety default; not yet a workflow.
4. **Nothing diffs the binding table or the placeholder pack**, only the placed
   nodes. Re-resolving an archetype after a pack changes is invisible to the
   report.
5. **Babylon has nothing.** Roadmap decision 3: Babylon ships no editor plugin.
   Whatever core lands here is the seed for one, not a port of one.

Items 1 and 2 are the ones that break trust, and they are policy — which means
they are fixable **once**, in core, and inherited by three engines. That is the
strongest single argument in this document for the editor core existing.

---

## 5. Drift already in the field

The plugins were written to mirror one another. They have already diverged, and
nothing catches it, because **`packages/core/conformance/` has no editor area** —
the vendored corpora in each engine cover `prolog`, `quests`, `radiant`, `saves`,
`ui`, `content-library`, and nothing about binding, placement or re-import.

### 5.1 The placement manifest has forked

Same 13 nodes, same entityIds, and the numeric placement (`position`,
`rotationY`, `scale`) is **identical to the quantum** between Unity and Godot.
But the serialized shape is not:

| | asset handle key | `bindingSource` values |
|---|---|---|
| Unity, Unreal | `assetRef` | `Project`, `Placeholder` |
| Godot | `scene` | `project`, `placeholder` |

A manifest written by one engine cannot be read by another, despite the math
agreeing exactly.

### 5.2 Fixture sharing is partial, and the headers overstate it

| fixture | Unity | Unreal | Godot |
|---|---|---|---|
| `reimport/golden-diff-report.json` | ✓ | ✓ | ✓ (trailing newline) |
| `reimport/{old,new}-manifest.json` | ✓ | ✓ | ✗ (`scene`/lowercase) |
| `scene/golden-ir.json` | ✓ | ✓ | ✗ |
| `scene/golden-placement-manifest.json` | ✓ | ✓ | ✗ |
| `binding/resolver-matrix.json` | **absent** | ✓ | ✓ |
| `binding/unity-fixture-pack.json` | **absent** | ✓ | ✓ |
| `binding/golden-world-archetypes.json` | ✓ | ✓ | ✗ |

`InsimulBindingResolver.h` says its matrix "is byte-identical to the Godot leg's
and to the Unity leg's cases — the SAME cross-engine contract all three native
binding layers resolve against". Unity has no `resolver-matrix.json` at all. This
is roadmap decision 10's finding — "every claim that the corpus is vendored
byte-identically into all three engines was false for two of them" — repeating
one layer up.

### 5.3 Godot emits archetype keys outside the taxonomy

`ARCHETYPE_ROOTS` is `building | npc | item | prop | terrain`. Godot's scene
generator (both twins) emits:

| node | Unity / Unreal | Godot |
|---|---|---|
| terrain chunk | `terrain.chunk` | `terrain` |
| road | `terrain.texture.road` | `road` / `road.street` |
| interior | *(unbound)* | `interior.<role>` |

`road` and `interior` are not roots. Those keys cannot resolve against a
taxonomy-conformant binding pack, and `isValidArchetypePattern` would reject a
rule written to match them. Nothing in Godot's gate checks a key against the
taxonomy, because the taxonomy lives in core and Godot does not consume core.

### 5.4 Two resolver semantics are in the field

| | tie-break |
|---|---|
| core (TS) | `exact ? 2N : 2N-1`. Descendant and wildcard at equal depth **tie**, unresolved. |
| Unity (C#) | core's score, then **ordinal key order**. |
| Unreal, Godot (C++) | matched segments, then kind (`Exact > Descendant > Wildcard`), then **first-authored entry**. |

At equal segment count the C++ legs prefer a descendant over a wildcard; the
TS/C# legs treat them as equal and fall to a different, engine-specific
tie-break. Separately, the C++ legs accept a bare `*` match-all entry, which core
rejects outright as an unrooted pattern.

None of these is catastrophic in isolation. Together they are what an unguarded
four-way hand-port looks like after one year.

---

## 6. Recommendation

**Build the core. The overlap is larger than assumed, not smaller** — 18,144
lines across three engines, of which ~11,900 is class (a) or the decision half of
class (b), against 1,505 lines of core that already covers a third of it and is
mirrored by hand instead of consumed.

### First slice (US-2)

Add to `packages/core/src/editor/`, as a **deep-import-only** surface:

1. **`editor/binding/`** — the resolution chain over the existing
   `archetypes/taxonomy` primitives: `BindingEntry` / `BindingSource` / tier
   priority sort, `resolve()`, `collectUnbound()`, pack parse + canonical
   serialize. Settle §5.4 (one tie-break) and §5.3 (validate keys against
   `ARCHETYPE_ROOTS`) here rather than in three engines.
2. **`editor/scene/`** — placement math over a `WorldIR` and a resolver:
   quantization, grid snap, terrain height sampling, canonical node order, and
   **one** manifest serialization. Settle §5.1 by picking a single asset-handle
   key and a single `bindingSource` casing, and record the rename each engine
   owes.
3. **`editor/reimport/`** — the five-way classification, `placedNodesEquivalent`,
   the canonical report, and `applyReimport(old, new, mutator)` over a
   `SceneMutator` interface.

Host interfaces core calls, mirroring `host-contracts.ts`:
`SceneMutator` (update / add / deprecate), `AssetResolver` (archetype → engine
asset handle), `ProgressSink` (report a dry run / progress).

Alongside the code:

4. **`packages/core/conformance/editor/`** — the resolver matrix, a golden IR, a
   golden placement manifest and the golden diff report, so the editor layer gets
   the parity gate the runtime already has. Every engine's fixtures become
   vendored copies with a drift guard, per `tools/vendor-conformance.mjs`.
5. **Un-barrel the editor surface** — remove `src/index.ts` lines 111–117 and
   guard against re-entry, so the editor core cannot be pulled into a shipping
   game's graph.

The Babylon reference implementation of `SceneMutator` is the piece that also
seeds Babylon's missing editor plugin (roadmap decision 3), so it is not
throwaway scaffolding.

### Deliberately not in the first slice

- HTTP transport, SSE stream handling, secret storage — class (b) with a thin
  decision half; the shared part is already in `editor/editor-session.ts`.
- Dock chrome, asset generation (`PlaceholderPackGenerator`,
  `InsimulPcgVegetation`), engine asset formats — class (c).
- Fixing re-import's per-field ownership gap (§4.3 items 1–2). It is a policy
  *change*, not a consolidation, and it needs a creator-facing design. Landing
  the policy in core first is what makes it a one-place fix later.
- Adoption. One tasklist per engine repo, specified by US-3.

### What US-3 inherits

The language boundary is already decided and must not be re-derived:
`docs/UNIFICATION_ROADMAP.md` decision 1 — a **C ABI over `libinsimulcore`**, not
a language, with TypeScript in embedded QuickJS behind it, promoted out of
`godot/gdextension/corebridge/` by tasklist 104 (this tasklist's `dependsOn`).
The editor core binds the same artifact. Note the one asymmetry US-3 must handle:
the runtime rule is "nothing on a per-frame path crosses the boundary", and the
editor has no per-frame path at all — a whole-world import crossing the ABI once
per click is a different cost profile, and a cheaper one.

---

## 7. Epilogue — what US-2 landed

*Written 2026-08-02, after implementing §6's first slice. §§0–6 above are the
US-1 analysis and are left as measured; this section records the outcome so a
reader does not have to diff the tree to find out which recommendations were
taken.*

### 7.1 The modules

Everything below is **deep-import-only**: `@insimul/core/editor` for the area
barrel, `@insimul/core/editor/<path>` for one module. Nothing is re-exported
from `src/index.ts`.

The whole editor surface, US-1's six modules and US-2's nine together:

| Module | What it owns |
|---|---|
| `editor/index` | the editor-area barrel |
| `editor/operations` | the v1 operation table + `resolveOperation` (US-GE1) |
| `editor/editor-session` | session/token lifecycle, health probe (US-GE1) |
| `editor/world-browser` | world list/detail, compatibility badge, import dry run (US-GE2) |
| `editor/generation-console` | the generation-job lifecycle reducer (US-GE2) |
| `editor/job-poller` | the polling fallback + teardown semantics (US-GE2) |
| `editor/conversation-tester` | the NPC conversation tester view-model (US-GE3) |
| `editor/host-contracts` | `SceneMutator`, `AssetResolver`, `ProgressSink`, `EditorHostAdapter`, plus in-memory `Recording*` references |
| `editor/binding/index` | the binding-area barrel |
| `editor/binding/resolver` | `matchArchetype`, the specificity ordering, `BindingResolver` (tier sort, `resolve`, `collectUnbound`) |
| `editor/binding/pack` | pack parse, canonical serialize, taxonomy validation (`validateBindingSource`, `validateArchetypeKeys`) |
| `editor/scene/index` | the scene-area barrel |
| `editor/scene/placement` | `quantizeSceneCoord`, `sampleTerrainHeight`, `computePlacement`, the canonical manifest, `parseManifestNodes` |
| `editor/reimport/index` | the re-import-area barrel |
| `editor/reimport/diff` | `placedNodesEquivalent`, `computeReimportDiff`, `serializeDiffReport`, `applyReimport` |

The three host interfaces are what §2's class (b) turns into: core decides,
`SceneMutator` / `AssetResolver` / `ProgressSink` execute. The Babylon reference
lives outside core, at
`packages/babylon/src/engine/editor/babylon-editor-host.ts`
(`BabylonSceneMutator` over `TransformNode`s, `BabylonAssetResolver` mapping a
binding handle to a URL, `BabylonProgressSink`), and is tested end-to-end against
a real `NullEngine` scene: IR → placement → scene → hand edit → regeneration →
re-import, with the hand edit surviving. That is also the seed for the editor
plugin Babylon does not yet have.

### 7.2 The three drifts, settled

- **§5.4 (two resolver tie-breaks)** — the C++ ordering wins and is now the one
  contract: `(matchedSegments, kind)` with `Exact > Descendant > Wildcard`, ties
  keeping the earlier-declared entry. It is total (no tie falls through to a
  per-engine rule), it is what the only cross-engine fixture already pins, and it
  is what two of the four legs already do. `archetypeSpecificity`'s
  `exact ? 2N : 2N-1` keeps its existing callers but no longer decides
  resolution. **Owed by the TS/C# legs**: adopt kind-based tie-breaking.
- **§5.3 (keys outside the taxonomy)** — matching stays root-agnostic on purpose,
  because a resolver that silently dropped `road.*` would hide the finding rather
  than report it. `validateBindingSource` classifies an unknown root as an
  **error**, and the match-all `*` and a shadowed duplicate as **warnings**;
  `validateArchetypeKeys` names the non-conformant keys a scene generator emits.
  **Owed by Godot**: emit `terrain.chunk` / `terrain.texture.road` and stop
  emitting `road.*` and `interior.*`, or propose the roots.
- **§5.1 (the forked manifest)** — the canonical form is `assetRef` for the asset
  handle, and `bindingSource` carrying the resolving tier's `name` **verbatim**.
  Two of three legs already write `assetRef`, and a tier name is data (`packs`,
  `insimul-placeholder`), not an enum, so title-casing it loses information.
  **Owed by Godot**: rename `scene` → `assetRef`, drop the case-folding.
  **Owed by Unity**: emit the layer name on the re-import path too, not the
  `BindingSourceKind` enum name (its scene path already does).

### 7.3 The parity gate that did not exist

`packages/core/conformance/editor/` is the answer to §5's root cause. Three
data-only fixtures, run by `src/conformance/__tests__/editor-corpus.test.ts` and
readable verbatim by a native harness:

| Fixture | Pins |
|---|---|
| `binding-resolver.json` | the chain. Its default sources + first nine cases ARE the shared matrix Unreal and Godot vendor; six more cover the settled tie-break, stable ordering and the unbound report. |
| `scene-placement.json` | the golden IR + the CC0 placeholder tier → the manifest. Verified node-for-node identical to Unity's committed `golden-placement-manifest.json`, so the port is exact, not merely plausible. |
| `reimport.json` | the five-way policy. Its canonical report is byte-identical to the `golden-diff-report.json` all three legs commit, plus the mutator call order the goldens cannot express. |

Regenerate the derived `expected*` values with `npm run editor-goldens`
(`packages/core/scripts/emit-editor-goldens.ts`); the inputs and the per-class id
lists are authored by hand, so the corpus never merely proves the code agrees
with itself.

### 7.4 Deliberately still open

- **§4.3's two product risks are consolidated, not fixed.** The `generated` flag
  is still opt-out with no per-field ownership, and only direct children of the
  generated root are diffed. Both are now pinned by named tests in
  `src/editor/__tests__/reimport-diff.test.ts` that say *what today's behaviour
  is*, so a later story changing the policy has something to change. Fixing them
  is a behaviour change needing a creator-facing design; doing it silently while
  consolidating would put core at odds with three engines' own goldens.
- **The World IR projection.** `PlacementWorldIR` is the placement-relevant
  subset of the exported world document — the shape all three engines already
  parse and pin. Projecting core's full `WorldIR` (`game-engine/ir-types.ts`)
  into it is NOT implemented, because `RoadIR` and `NatureObjectIR` carry no
  stable id while every placed node and every re-import match key needs one. That
  is §3's open question (bare local ids versus KINP CURIEs) wearing a different
  hat, and it is not guessed here.
- **Adoption.** Unchanged from §6: one tasklist per engine repo, specified by
  US-3. Nothing in the three engine checkouts was modified by US-2.
