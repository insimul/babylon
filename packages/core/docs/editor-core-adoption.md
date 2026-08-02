# Adopting the editor core — the per-engine specification

*US-3 of `101-editor-plugin-core`. Written 2026-08-02 against `unity`, `unreal`,
`godot` and `native/corebridge` at the submodule checkouts, and against
`packages/core` at `522ad68` (the US-2 commit). Companion to
[`editor-plugin-core-analysis.md`](editor-plugin-core-analysis.md), which measured
what the plugins duplicate, and to [`runtime-contract.md`](runtime-contract.md),
which does the same job for the runtime core.*

**This story specifies; it does not adopt.** Adoption is one tasklist per engine
repository, because Chief worktrees one submodule at a time. Nothing in `unity/`,
`unreal/` or `godot/` was modified. The point of this document is that those
tasklists open on a specification instead of an archaeology exercise — the same
handoff `94` left `97`.

Read §1 first. If its inherited decision is ever reopened, every number in §2
changes.

---

## 0. Method, and what it is worth

Line counts are `wc -l` over source files; the exact commands are in Appendix A so
every figure here is reproducible rather than asserted. Classification of a file as
*deletable* / *shrinks* / *kept* is from reading its header and its call sites.

**Nothing was executed.** Unity's compiler, UBT and the Godot headless binary are
absent from this harness (roadmap decision 9), and `libinsimulcore` is not built
here either. Every claim about how an engine loads a native library is therefore
read from that engine's own committed precedent — Unity's `NativeMethods.cs` +
`Runtime/Plugins/README.md`, Unreal's `Source/ThirdParty/InsimulLibrary`, Godot's
`insimul.gdextension` — not from a run. Those precedents exist because all three
engines *already* link `libinsimul`, which is what makes the sizing in §2 credible.

Appendix A's Unity figures differ from `editor-plugin-core-analysis.md` §1.1 by one
file and 15 lines (35 / 6,553 here, 34 / 6,538 there), because that section's walk
and this one's exclude a slightly different set of non-source files. No conclusion
in either document turns on the difference.

---

## 1. The language boundary — inherited, not re-derived

### 1.1 The decision

`docs/UNIFICATION_ROADMAP.md` decision 1 is **ANSWERED**, by
`100-godot-runtime-adapter` US-1:

> The boundary is a **C ABI, not a language**. All four runtimes bind one
> artifact — **`libinsimulcore`**, an opaque handle with JSON in / JSON out and an
> explicit error string, shaped exactly like `libinsimul`'s ABI that Godot
> (GDExtension), Unity (P/Invoke) and Unreal (module link) already consume. Behind
> that ABI runs TypeScript inside an embedded QuickJS today, and Rust later,
> invisibly to every adapter.
>
> **98, 99 and 101 must not invent a second mechanism.** The bridge is built once,
> in `native/`, not three times.

That instruction names this tasklist explicitly, so the answer to the acceptance
criterion is short: **the editor core binds the same artifact, through the same
five functions, with no editor-specific mechanism.** The rationale, the costed
alternatives and the rejected options are in `godot/RUNTIME_CORE_ADOPTION.md` §4
and are not restated here.

The dependency is live rather than hypothetical: tasklist `104` promoted the bridge
out of `godot/gdextension/corebridge/` into `native/corebridge/`, which today ships
`include/insimulcore.h` (the five functions), `src/insimulcore.c` (the QuickJS
host), `js/entry.js` (the method table) and `tools/vendor-core-bundle.mjs` (the
vendored-bundle drift guard).

**Adopting more of core means adding a row to `native/corebridge/js/entry.js`.**
That file is the only place that says which of core's functions cross the ABI, and
it is deliberately small enough to review in one screen. An editor adoption
tasklist's first commit is a set of `editor.*` rows there plus a re-vendored bundle.

### 1.2 What is different at edit time — and what is not

The runtime's hard rule is *nothing on a per-frame path crosses the boundary*. The
editor has no per-frame path at all, so that rule is satisfied vacuously. It is
replaced by a different one, in the opposite direction:

| | runtime | editor |
|---|---|---|
| call frequency | gameplay-event rate, many small calls | one call per click |
| payload | small (a quest offer, a recipe) | **large** — a whole World IR in, a whole placement manifest out |
| the risk | marshalling cost per call | a multi-MB string, and the handle's ownership rule |
| the budget | a frame | a human waiting on a dialog |

Three consequences the adoption tasklists must design for rather than discover:

1. **`insimul_core_call` returns a string owned by the handle**, valid only until
   the next call on that handle. A placement manifest for a large world is the
   biggest string this program will ever move across the ABI, and the host must
   copy it out *before* it makes another call. Unity's `NativeMethods.cs` already
   states this rule for `libinsimul` ("callers copy eagerly") — same discipline,
   larger buffer.
2. **Peak memory is doubled at the boundary**: the IR exists as JSON in the host,
   again as a JS value in QuickJS, and the manifest exists twice on the way back.
   Acceptable on a desktop editor; measure it on the largest committed world before
   claiming otherwise.
3. **If a payload ever gets too big, page it — do not stream it.** The ABI is
   synchronous and has no streaming shape. A `editor.scene.placeChunk` method taking
   a slice of the IR is a row in the method table; a streaming ABI is a fork of
   decision 1. Do not build one speculatively: the first adoption should measure.

### 1.3 What must **not** cross the boundary

`insimul_core_call` "drives the JS job queue until the returned promise settles",
and its header says plainly that "a method whose promise can only settle on external
I/O would therefore deadlock". The bridge does install host functions into QuickJS
(the four `__insimul_prolog_*` globals in `src/insimulcore.c`), but they are
installed in C and are **synchronous**.

Editor HTTP in all three engines is asynchronous-only — `UnityWebRequest`,
`FHttpModule`, Godot's `HTTPRequest`. Unity's ABI note goes further: the runtime ABI
is "intentionally POLL-ONLY (no callbacks / function pointers) so it is IL2CPP-safe".
So:

**The three callback-shaped classes on core's editor surface do not cross the ABI.**

| core module | shape | crosses? |
|---|---|---|
| `editor/operations` | pure table + lookup | ✅ |
| `editor/generation-console` | pure parsers + `jobReduce(job, ev)` | ✅ |
| `editor/world-browser` | pure parsers + `worldBrowserReduce` | ✅ |
| `editor/conversation-tester` | pure parsers + `conversationReduce` | ✅ (the reducers) |
| `editor/binding/{resolver,pack}` | pure functions over data | ✅ |
| `editor/scene/placement` | pure function IR → manifest | ✅ |
| `editor/reimport/diff` | pure classification; `applyReimport` calls a mutator | ✅ diff; ❌ apply |
| `editor/editor-session` | `EditorSession` calls an `EditorTransport` **back** | ❌ |
| `editor/job-poller` | `JobPoller` calls a `Scheduler` **back** | ❌ |
| `editor/conversation-tester` `ConversationController` | drives a stream **back** | ❌ |

The pure half is the large half, and it is the half with the drift (§5 of the
analysis). The recommendation is therefore:

> **Adopt the reducers and the pure functions across the ABI; keep the loop
> host-side.** Each engine keeps a thin driver — issue the request its own way,
> hand the response body to the adopted parser, fold the event through the adopted
> reducer, repaint. That driver is 100–200 lines per engine and is *genuinely*
> engine-specific, which is why §2 keeps it in every "kept" column.

The same applies to `applyReimport`: core computes the report (crosses), the host
walks the report's canonical order and performs the scene surgery (does not). Core's
`SceneMutator` interface is then implemented in the *host* language, driven by the
host, against a report core produced — not registered as a callback into QuickJS.

`editor/host-contracts` is therefore adopted **in the host's own language**, not
across the ABI: its three interfaces (`SceneMutator`, `AssetResolver`,
`ProgressSink`, the last taking a `ProgressStep` per unit of work) describe what
the plugin does *after* core has answered, and each engine implements them in C#,
C++ or GDScript against a report or manifest that arrived as JSON. Core's
TypeScript `RecordingSceneMutator` / `RecordingProgressSink` stay what they are —
the in-memory references core's own tests and the Babylon host use.

Every field of `EditorHostAdapter` is optional with a documented fallback, and
that is what makes staged adoption possible: a plugin can land the bridge and the
pure reducers first, run re-import as a dry run with no `sceneMutator` at all,
then add the mutator, then the resolver. Each engine tasklist should sequence its
own stories that way rather than landing all three interfaces in one commit.

This is not a compromise forced by the bridge. It is the same class (a) / class (b)
line the analysis drew, arriving at the boundary and holding.

### 1.4 What each engine links

| | mechanism | precedent already in the repo | editor-specific note |
|---|---|---|---|
| **Unity** | P/Invoke `libinsimulcore` from the `Insimul.Editor` asmdef | `Runtime/Prolog/NativeMethods.cs` + `Runtime/Plugins/README.md` (fetched, not committed; `InsimulNativeImporter` derives `PluginImporter` settings from the folder) | the editor bridge belongs under **`Editor/Plugins/`**, editor-only in the importer, so it can never enter a player build |
| **Unreal** | a second `ThirdParty` module beside `InsimulLibrary`, in `InsimulEditor.Build.cs`'s `PrivateDependencyModuleNames` | `Source/ThirdParty/InsimulLibrary/InsimulLibrary.Build.cs` (`ModuleType.External`, per-`Target.Platform` lib, Win64 delay-load + import lib) | `InsimulEditor` is already an editor module; the binaries stay gitignored and are staged at package time |
| **Godot** | the existing `InsimulCore` GDExtension `RefCounted`, called from the `@tool` GDScript docks | `gdextension/src/insimul_core.{h,cpp}` — already written, already JSON-in/JSON-out | `insimul.gdextension` already sets `reloadable = true`, which is what makes editor iteration bearable |
| **Babylon** | none — it *is* the JS runtime | `packages/babylon/src/engine/editor/babylon-editor-host.ts` | imports `@insimul/core/editor` directly; no bundle, no ABI, no marshalling |

Godot is the cheapest leg by a wide margin: its wrapper class exists, its descriptor
is already reloadable, and its editor plugin is GDScript, which has `JSON.stringify`
/ `JSON.parse` built in. Unity is next (one P/Invoke file, mirroring one it already
has). Unreal is the most build-system work and the largest payoff.

### 1.5 The one thing that is genuinely cheaper here than in the runtime

The editor already has a service boundary — `InsimulHttpClient` and its siblings —
because the generation service it calls is closed and remote. `RUNTIME_CORE_ADOPTION.md`
§4.3 rejects a service boundary for a shipping game but explicitly keeps it "for
*editor*-time only, where this repo already has it".

That does **not** license a second mechanism for the *core*. An HTTP-hosted editor
core would fork decision 1, would put a network round-trip inside a binding
resolution, and would make the plugin useless offline. The rule to write into each
adoption tasklist: **the closed pipelines service stays behind HTTP; `@insimul/core`
comes in over the ABI.** Those are two different dependencies and only one of them
moved.

---

## 2. Per-engine adoption notes

Each section is: what it deletes, what it implements against the interfaces, what it
keeps, and the expected reduction. "Deletable" means a core module ships the same
decision today; "shrinks" means part of the file is a decision core owns and part is
execution the engine keeps.

### 2.1 Unreal — the largest prize

Unreal already isolated its pure half into `Source/InsimulEditor/Portable/`, which is
**4,534 lines across 22 files** and maps almost one-to-one onto core's editor surface.
That directory is the adoption target, and it is the single largest deletion available
anywhere in this program's editor layer.

**Delete (4,264 lines / 20 files):**

| Portable file(s) | lines | replaced by |
|---|---:|---|
| `InsimulConversationTesterModel.{h,cpp}` | 762 | `editor/conversation-tester` |
| `InsimulWorldBrowserModel.{h,cpp}` | 706 | `editor/world-browser` |
| `InsimulGenerationConsoleModel.{h,cpp}` | 643 | `editor/generation-console` |
| `InsimulScenePlacement.{h,cpp}` | 455 | `editor/scene/placement` |
| `InsimulReimportDiff.{h,cpp}` | 411 | `editor/reimport/diff` |
| `InsimulBindingResolver.{h,cpp}` | 405 | `editor/binding/resolver` + `archetypes/taxonomy` |
| `InsimulEditorSession.{h,cpp}` | 340 | `editor/editor-session` (reducer half) |
| `InsimulJobPoller.{h,cpp}` | 246 | `editor/job-poller` (policy half) |
| `InsimulPlaceholderPack.{h,cpp}` | 188 | `editor/binding/pack` |
| `InsimulV1Operations.{h,cpp}` | 108 | `editor/operations` |

**Plus 2,927 of the 3,161 lines under `Tests/`** — eight of the nine test files exist
to pin behaviour that becomes core's, and are replaced by
`packages/core/conformance/editor/` read by a thin host runner. `test_binding_editor_model.cpp`
(234) stays, because its subject does (below).

**Total: 7,191 of the module's 10,788 lines — 67%.** That is the number the tasklist
description was reaching for when it called Unreal's editor "the largest prize", and
it is larger than it guessed, because the guess counted tests in the denominator but
not in the numerator.

**Keep, unchanged (3,038 lines under `Private/`+`Public/`, plus `InsimulEditor.Build.cs`):**
Slate widgets, the `IModuleInterface`, `UInsimulEntityIdComponent`, `AActor` /
`ULevelInstance` / Landscape materialization, `InsimulPcgVegetation`, the HTTP
transports and secret store, `InsimulImportedWorldRegistry`.

**Implement (new, ~400–600 lines):**
- a `ThirdParty` module for `libinsimulcore` and a small `FInsimulCore` RAII wrapper
  over the five C functions (mirroring `InsimulKB` in `InsimulRuntime`);
- `IReimportSceneMutator` re-pointed at core's report shape — the interface already
  exists and already has the right three operations;
- an `AssetResolver` returning `.uasset` soft object paths;
- a `ProgressSink` raising Slate notifications;
- the retained transport drivers rewired to feed the adopted reducers.

**Engine-specific risk:** `InsimulScenePlacement` and `InsimulReimportDiff` are host-
tested under plain clang today, with no UE toolchain. Routing them through the ABI
means the host gate must link `libinsimulcore`, so `tools/verify-unreal/` needs a
built bridge where it needs none now. Budget that, and keep the corpus runner able to
report "bridge unavailable" distinctly from "bridge disagrees".

### 2.2 Unity

**Delete (3,182 lines / 11 files):**

| file | lines | replaced by |
|---|---:|---|
| `Editor/Connect/InsimulConversationTesterModel.cs` | 551 | `editor/conversation-tester` |
| `Editor/Connect/InsimulWorldBrowserModel.cs` | 501 | `editor/world-browser` |
| `Editor/Connect/InsimulGenerationConsoleModel.cs` | 486 | `editor/generation-console` + `editor/job-poller` |
| `Runtime/Scene/SceneGenerator.cs` | 404 | `editor/scene/placement` |
| `Runtime/Scene/ReimportDiff.cs` | 282 | `editor/reimport/diff` |
| `Runtime/Binding/BindingPack.cs` | 224 | `editor/binding/pack` |
| `Editor/Connect/InsimulEditorSession.cs` | 224 | `editor/editor-session` (reducer half) |
| `Runtime/Binding/ArchetypeKey.cs` | 167 | `archetypes/taxonomy` |
| `Runtime/Binding/BindingModel.cs` | 135 | `editor/binding/*` types |
| `Runtime/Binding/BindingResolver.cs` | 122 | `editor/binding/resolver` |
| `Editor/Connect/InsimulV1Operations.cs` | 86 | `editor/operations` |

**Shrinks:** `Editor/InsimulReimport.cs` (208 → the mutator implementation only),
`Runtime/Binding/InsimulBindingTable.cs` (150 → a `ScriptableObject` holding prefab
references; the projection into a `BindingLayer` goes),
`Runtime/Scene/ISceneBuilder.cs` (115 → superseded by `SceneMutator` + `AssetResolver`
on the re-import path; the generation-time terrain/navmesh calls stay).

**Total: ~3,182 deleted outright, ~3,650 counting the shrink, of 6,553 — 50–56%**,
plus the matching share of its 5,203 test lines.

**Unity's adoption fixes a bug the other engines do not have.** The analysis §3 found
that `Runtime/Binding/` and `Runtime/Scene/` sit under the `Insimul.Runtime` asmdef
with `autoReferenced: true` and no `excludePlatforms`, so **~2,000 lines of edit-time
policy compile into every Unity player build**. Adoption is the fix: the deleted files
are exactly that set, and what replaces them is an editor-only native plugin under
`Editor/Plugins/`. Treat "no editor policy in the player build" as an acceptance
criterion of the Unity tasklist, not a side effect.

**Implement (new, ~350–500 lines):** `Editor/Connect/CoreNativeMethods.cs` (P/Invoke,
UTF-8 in, `IntPtr`+`PtrToStringUTF8` out, copy eagerly), a managed `InsimulCore`
wrapper, `IReimportSceneMutator` over `GameObject`/`PrefabUtility`, an `AssetResolver`
returning `AssetDatabase` GUIDs, a `ProgressSink` over `EditorUtility.DisplayProgressBar`,
and an `Editor/Plugins/` fetch step in `scripts/fetch-native.sh`.

**Engine-specific risk:** on Windows, a native library P/Invoked from the Unity Editor
stays loaded for the Editor process's lifetime, so re-vendoring the core bundle needs
an Editor restart. Tolerable — the bundle is a build artifact refreshed by a script,
not a file edited live — but say so in the plugin's README before a creator files it
as a bug.

### 2.3 Godot — the smallest plugin and the biggest structural win

Godot's headline is not its line count, it is that it implements binding resolution,
scene placement and re-import **twice**: once as a `@tool` GDScript twin and once in
`gdextension/src` C++, with each file's header naming the other as the mirror it must
not diverge from. Adoption collapses both onto one call.

**Delete outright (2,314 lines / 12 files):**

| file | lines | replaced by |
|---|---:|---|
| `gdextension/src/scene_placement.{h,cpp}` | 493 | `editor/scene/placement` |
| `gdextension/src/binding_resolver.{h,cpp}` | 366 | `editor/binding/resolver` |
| `gdextension/src/reimport_diff.{h,cpp}` | 312 | `editor/reimport/diff` |
| `editor/conversation/conversation_reducer.gd` | 265 | `editor/conversation-tester` |
| `editor/binding/insimul_binding_table.gd` | 182 | `editor/binding/pack` |
| `editor/browser/world_browser_model.gd` | 167 | `editor/world-browser` |
| `editor/generation/job_reducer.gd` | 140 | `editor/generation-console` |
| `editor/connect/insimul_editor_session.gd` | 129 | `editor/editor-session` (reducer half) |
| `editor/generation/job_poller.gd` | 98 | `editor/job-poller` (policy half) |
| `editor/connect/v1_client.gd` | 80 | `editor/operations` |
| `editor/browser/world_compat.gd` | 32 | `editor/world-browser` (`worldCompatibility`) |
| `editor/binding/insimul_binding_resolver.gd` | 50 | `editor/binding/resolver` |

**Shrinks:** `editor/scene/insimul_scene_generator.gd` (311 → materialization only),
`editor/reimport/insimul_reimport.gd` (240 → the mutator + confirm dialog),
`editor/conversation/conversation_controller.gd` (76 → the stream driver).

**Plus the twin tests**: `binding_resolver_test.gd` (122), `reimport_test.gd` (154),
`scene_generator_test.gd` (168) and the 579 C++ lines under `gdextension/test` that
cover the same three capabilities a third time.

**Total: ~2,314 of 3,979 source lines — 58% — and roughly 1,000 test lines**, with
the double-implementation tax removed permanently.

**Implement (new, ~150–250 lines):** almost nothing. `InsimulCore` exists; the docks
gain `JSON.stringify` / `JSON.parse` call sites, a `SceneMutator` over
`Node3D`/`PackedScene`, an `AssetResolver` returning `res://` paths, and a
`ProgressSink` over the editor toast.

**Godot also owes two corrections settled by US-2** (§7.2 of the analysis), and
adoption is when they get paid:
- stop emitting `road.*` and `interior.*` archetype keys — they are outside
  `ARCHETYPE_ROOTS` and can never resolve against a taxonomy-conformant pack. Emit
  `terrain.texture.road` / `terrain.chunk`, or propose the roots.
- rename the manifest's `scene` key to `assetRef` and stop case-folding
  `bindingSource`, so its manifests can be read by the other two engines.

Both are behaviour changes to committed goldens, so they are their own commits inside
the Godot tasklist, not incidental to the port.

### 2.4 Babylon — no plugin to reduce

Roadmap decision 3: Babylon ships no editor plugin; its editor is the closed platform
web app. So Babylon deletes nothing, has no boundary to cross, and its adoption note
is the inverse of the other three: **everything is net-new**, and the reference host
`packages/babylon/src/engine/editor/babylon-editor-host.ts` is the seed rather than a
port. That file already drives the full loop against a real `NullEngine` scene — IR →
placement → scene → hand edit → regeneration → re-import, with the hand edit surviving —
so what is missing is chrome and a session UI, not decisions.

Sequence it last. It has no drift to fix and no duplication to remove, and a plugin
built before the other three adopt would be the fourth hand-port this program exists
to stop making.

---

## 3. The aggregate

| | source now | deletable now | % | tests that follow |
|---|---:|---:|---:|---|
| Unreal | 7,627 | 4,264 | 56% | 2,927 of 3,161 |
| Unity | 6,553 | 3,182 | 49% | a matching share of 5,203 |
| Godot | 3,979 | 2,314 | 58% | ~1,023 of 1,969 |
| **three engines** | **18,159** | **9,760** | **54%** | |
| replaced by | | `packages/core` `src/editor/` + `src/archetypes/taxonomy.ts` | | `conformance/editor/` |

Net: **9,760 lines of hand-ported decision logic deleted, and the ~2,900 lines of
core that replace it are written once.** The three engines then add back roughly
900–1,350 lines of bridge + host-interface implementation, so the honest net is
around **8,500 source lines** plus a larger test reduction.

The analysis's §6 estimate — "~11,900 of the 18,144 is class (a) or the decision half
of class (b)" — is consistent with this: the ~2,100-line gap is the capabilities core
does not ship yet (§4), which stay hand-written until a second slice lands.

---

## 4. Capability asymmetries — net-new work, not ports

An adoption tasklist that treats these as ports will be mis-sized. Each row is a
capability one plugin has and another does not.

### 4.1 Portable, so genuinely net-new for the laggard

| capability | has it | lacks it | why it matters |
|---|---|---|---|
| **Binding-editor view-model** — taxonomy tree annotated bound/placeholder/unbound, plus fuzzy project-asset suggestion ranking | Unity (`BindingEditorModel`, 209), Unreal (`InsimulBindingEditorModel`, 270), Godot (`insimul_binding_dock_model.gd`, 162) | **core** | 641 lines, three implementations, *no core module*. This is the strongest candidate for the second slice — see §6. |
| **Editor-time content-library importer** | Unity (`InsimulContentImporter` + `Runtime/Content/ContentImporter`, 220+) | Unreal, Godot (both validate a library in their *runtime* tier; neither materializes one from the editor) | core already owns the schema (`schemas/content-library.schema.ts`), so only the materialization is new — but it is new, not a port |
| **Imported-world registry** — remembering which world a scene came from, so a re-import knows what to diff against | Unreal (`InsimulImportedWorldRegistry`), Unity (`UnityWorldImportSeams`) | **Godot** | without it Godot's re-import is driven entirely by user selection; core's diff takes (old, new) and does not supply the "which world" answer |
| **`binding/resolver-matrix.json` fixture** | Unreal, Godot | **Unity** | free on adoption: `conformance/editor/binding-resolver.json` *is* that matrix plus six cases, so Unity gains a gate it never had |
| **`scene/golden-ir.json` + `golden-placement-manifest.json`** | Unity, Unreal | **Godot** | likewise free — `conformance/editor/scene-placement.json` carries both |

### 4.2 Engine-specific, so **not** net-new for anyone

Listed so an adoption tasklist does not budget for them:

- Unreal's `InsimulPcgVegetation` (317) drives UE's PCG framework. Unity and Godot
  have no PCG. Not a gap.
- Unreal's Landscape + `ULevelInstance` interior path, Unity's `Terrain` +
  `NavMeshSurface` bake, Godot's `PackedScene` interiors: three answers to
  "materialize this manifest node", all correct, none portable.
- Unity's `InsimulNativeImporter` (139) exists because Unity needs a `PluginImporter`
  post-processor. UBT and Godot's `.gdextension` descriptor solve the same problem
  declaratively.
- The placeholder-pack *generators* — Unity's `PlaceholderPackGenerator` (174),
  Unreal's (110+52), Godot's `insimul_placeholder_pack.gd` (122) — all three exist,
  and all three build engine-native primitive meshes. The *table* they emit is shared
  (core's `editor/binding/pack`); the mesh building is not.

---

## 5. What is not shareable, and why — settled, do not reopen

| | why | evidence |
|---|---|---|
| **Dock and window chrome** | `EditorWindow`+IMGUI, Slate `SWidget`, `Control`+`EditorPlugin` have no common shape, and a cross-engine UI layer would be a bigger dependency than the one it removes | ~1,100 lines across three, analysis §2(c) |
| **Editor lifecycle and registration** | `[MenuItem]` / `IModuleInterface` / `_enter_tree`, `.asmdef` / `.Build.cs` / `plugin.cfg` | analysis §2(c) |
| **Asset materialization and engine-native formats** | a prefab, a Blueprint and a `PackedScene` are not the same object; core stops at the *handle* | `AssetResolver` exists precisely to end core's involvement here |
| **The entity stamp's carrier** | a `MonoBehaviour`, a `UActorComponent` and node metadata + groups are different objects. The five *fields* are shared; the carrier is not | analysis §4.2 |
| **HTTP transport, SSE framing, secret storage** | `UnityWebRequest` / `FHttpModule` / `HTTPRequest`, `EditorPrefs` / UE per-user config / `EditorSettings`. The *decision* half (which request, which operation, which token lifecycle) is already core's; the execution is not | analysis §6 "deliberately not in the first slice" |
| **The reducer *loops*** | `EditorSession`, `JobPoller` and `ConversationController` call back into the host, and the ABI is one-way by design and IL2CPP-safe because of it | §1.3 above |
| **Geometry generation at play time** | out of scope for the editor core by construction — the editor places content once | `runtime-contract.md` §3 |
| **The generation service** | closed. The plugins are open; the pipelines service they call is not; this program does not move that line | tasklist scope note |

---

## 6. Sequencing, gates, and the second slice

**Order: Godot → Unity → Unreal → Babylon.**

Godot first because its bridge wrapper already exists, its descriptor is already
reloadable, and it carries the double-implementation tax — so it is the cheapest leg
*and* the one where the win is most visible. Unity second because its adoption also
closes the player-build leak (§2.2), which is a correctness fix and not just a
refactor. Unreal third because it is the most build-system work, and by then two legs
will have proven the bridge. Babylon last, because it is net-new product work with no
duplication to remove.

**Every adoption tasklist's gate is the same three things**, and none of them is "the
tests still pass":

1. `packages/core/conformance/editor/*.json` vendored and read by that engine's host
   runner, with a drift guard against the source copy — the same discipline
   `conformance/prolog` already has. This is the instrument whose absence caused
   every §5 drift in the analysis.
2. The engine's *own* committed goldens still match, or the diff is classified
   fix / tolerable / regression and explained. Two of the three engines owe a
   deliberate golden change (§2.3); those must be commits that say so.
3. The bundle's provenance: `native/corebridge/tools/vendor-core-bundle.mjs --check`
   green, with the recorded core commit named in the adoption note.

**The second slice, when someone asks for one:** the binding-editor view-model
(§4.1) — 641 lines, three implementations, zero in core, and the highest-value
remaining duplicate. It is a pure function from (world archetype keys, binding
layers, an asset index) to (annotated tree, suggestion ranking), so it crosses the
ABI cleanly. Do it after at least one engine has adopted the first slice, so the
shape is validated by a real consumer rather than by a third guess.

---

## 7. What an adoption tasklist must not guess

Two questions are open on purpose. Closing either one silently, in one engine, is
how four implementations happen again.

1. **One id scheme or two** (analysis §3, §7.4). Every placement manifest and every
   re-import diff keys on a bare local id (`building.a`, `terrain.chunk.0_0`); KINP
   says a world-scoped entity is `insimul:world:<w>:ent:<id>`. Until that is decided,
   `PlacementWorldIR` stays the placement-relevant subset of the *exported* world
   document and core's full `WorldIR` is not projected into it, because `RoadIR` and
   `NatureObjectIR` carry no stable id. An engine that mints its own id policy to get
   unblocked has answered a program-level question in a plugin.
2. **Re-import's per-field ownership** (analysis §4.3 items 1–2, §7.4). The `generated`
   flag is opt-out with no per-field ownership, and only direct children of the
   generated root are diffed. Both are now pinned by named tests in
   `src/editor/__tests__/reimport-diff.test.ts` that record *today's* behaviour, so a
   policy story has something to change. Adoption must reproduce today's behaviour,
   not improve it — improving it in one engine while consolidating would put core at
   odds with three engines' goldens, which is the exact failure this tasklist exists
   to end.

---

## Appendix A — reproducing the measurements

From the project checkout that contains the four submodules:

```bash
# §2.1 Unreal: the Portable tier (the deletion target) and the rest
find unreal/Source/InsimulEditor/Portable -type f | xargs wc -l | tail -1
find unreal/Source/InsimulEditor/{Private,Public} -type f | xargs wc -l | tail -1
wc -l unreal/Source/InsimulEditor/Tests/*.cpp | sort -k1 -nr

# §2.2 Unity: source only (excludes .meta, .asmdef and Placeholder/LICENSE.md)
find unity/Editor unity/Runtime/Binding unity/Runtime/Scene -type f \
  -name '*.cs' | xargs wc -l | sort -k1 -nr

# §2.3 Godot: the GDScript plugin and the C++ twin it duplicates
find godot/addons/insimul/editor -name '*.gd' -not -name '*_test.gd' \
  | xargs wc -l | tail -1
wc -l godot/gdextension/src/{binding_resolver,reimport_diff,scene_placement}.{h,cpp}

# core's editor surface (the replacement)
find packages/core/src/editor packages/core/src/archetypes -name '*.ts' \
  -not -path '*__tests__*' | xargs wc -l | tail -1
```

The bridge this document specifies against:

```bash
sed -n '1,80p'  native/corebridge/include/insimulcore.h   # the five functions
sed -n '1,40p'  native/corebridge/js/entry.js             # the method table
node native/corebridge/tools/vendor-core-bundle.mjs --check
```
