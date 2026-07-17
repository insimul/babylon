# Conservative re-import diff + Binding Editor (US-XG4)

A world's IR changes over its life: the author regenerates settlements, moves a
lot, adds a prop. Re-running **Insimul ▸ Generate Scene From World IR** from
scratch would throw away every hand edit a creator made in the interim — the
manually-placed statue, the tweaked building rotation, the extra decoration. The
plan (§4.3 Unreal) calls for a **conservative re-import** that folds upstream
changes in *without* clobbering local work — the SAME policy the Unity and Godot
legs implement.

**Insimul ▸ Re-import World IR (Diff)**
([`Public/InsimulReimport.h`](../Source/InsimulEditor/Public/InsimulReimport.h))
does exactly that.

## The policy

Existing scene actors are matched to the freshly computed placement manifest by
their stable **`InsimulEntityId`** stamp (the `UInsimulEntityIdComponent` the
scene generator wrote, US-XG2). Each matched / unmatched id is classified into
exactly one action:

| Action | Condition | What happens |
|--------|-----------|--------------|
| **Added** | in the new IR, no existing actor with that id | a fresh generated actor is materialized + stamped |
| **Updated** | in both, existing is `generated=true`, transform/binding differs | the generated transform + binding is re-applied in place |
| **Unchanged** | in both, existing is `generated=true`, equivalent | no-op |
| **Skipped** | existing actor is `generated=false` (a hand edit) | preserved **verbatim** — present in or absent from the new IR |
| **Deprecated** | existing is `generated=true` but gone from the new IR | reparented under a **`Deprecated/`** folder, **never deleted** |

Two invariants make this safe for creators:

- **Hand edits are never touched.** Un-stamped actors (no
  `UInsimulEntityIdComponent`) are invisible to the diff. A stamped actor the
  creator marked `bGenerated=false` (an adopted / overridden generated actor) is
  always *Skipped* — never updated, never deprecated — whether or not the new IR
  still lists its id.
- **Nothing is destroyed.** A generated actor the IR dropped is moved to the
  `Deprecated/` folder for the human to review and remove, not silently deleted.

## Dry-run first

The classification is a **pure, side-effect-free** function of the old + new node
sets. `UInsimulReimport::DryRun` computes it, logs the canonical report, and
returns an added/updated/unchanged/skipped/deprecated summary **before** any
mutation; the creator confirms (or cancels) with nothing changed.
`UInsimulReimport::Apply` runs the same classification and then mutates, wrapped
in a single `FScopedTransaction` (one Undo group).

## Architecture: pure core + thin Unreal seam

Like the rest of the Unreal SDK, all decision logic is Unreal-Engine-free and
host-tested on a bare clang toolchain, so it can never drift from the
cross-engine contract:

| Layer | File | Coupling | Verified by |
|-------|------|----------|-------------|
| Diff classification + report | `Portable/InsimulReimportDiff.{h,cpp}` (`ComputeReimportDiff` / `SerializeDiffReport`) | pure (std) | `run-reimport-tests.sh` (host) |
| Apply seam + orchestration | `Portable/InsimulReimportDiff.{h,cpp}` (`IReimportSceneMutator` / `ApplyReimport`) | pure | same |
| Live-tree mutator + driver | `Private/InsimulReimport.cpp` (`FUnrealReimportMutator` / `UInsimulReimport`) | `UnrealEd` + `Engine` | structural syntax gate |

`ComputeReimportDiff(OldNodes, NewNodes)` returns an **`FDiffReport`** — five
ascending id lists (added / updated / unchanged / skipped / deprecated).
`ApplyReimport(old, new, mutator)` runs that classification and drives an
`IReimportSceneMutator` (update / add / deprecate — unchanged & skipped are
no-ops by policy). The Unreal implementation mutates the scene tree; an
`FRecordingReimportMutator` test double records the decisions so the apply
orchestration is assertable without an editor.

## Determinism + the cross-engine golden

`SerializeDiffReport` emits the report as canonical JSON (key-sorted via the same
`CanonicalJsonStringify` the placement manifest uses), so two runs — or two
engines — produce byte-identical bytes. The shared golden
[`Tests/fixtures/reimport/golden-diff-report.json`](../Source/InsimulEditor/Tests/fixtures/reimport/golden-diff-report.json)
is byte-identical to the Unity leg's
(`packages/unity/Tests/Editor/fixtures/reimport/golden-diff-report.json`) and the
Godot leg's — the Unity/Godot/Unreal legs all reconcile against the *same*
re-import policy, mirroring `packages/godot/gdextension/src/reimport_diff.cpp` and
`packages/unity/Runtime/Scene/ReimportDiff.cs` exactly.

The manifest field carrying the resolved asset handle is `assetRef` (matching the
Unity manifest, US-XG2), so the old/new fixtures + golden are copied byte-for-byte
from the Unity leg.

## The Binding Editor

The Binding Editor is an **Editor Utility Widget**
([`Public/InsimulBindingEditorWidget.h`](../Source/InsimulEditor/Public/InsimulBindingEditorWidget.h))
over the pure view-model
[`Portable/InsimulBindingEditorModel.{h,cpp}`](../Source/InsimulEditor/Portable/InsimulBindingEditorModel.h):

- **taxonomy-grouped archetype list** with bound / placeholder / unbound status
  (`BuildTaxonomyTree` + `StatusFor`) — a `building` binding covers every
  `building.*` archetype (the resolver's descendant match);
- **asset picker with suggestions** ranked by dot-segment name/tag/path match
  (`SuggestBindings`, score desc then path asc);
- **bind / bind-descendants** into the project-tier `UInsimulBindingTable`;
- **pack import/export** — the `insimul-binding-pack` interchange shared with
  Unity/Godot (`ImportPackJson` / `ExportPackJson`).

Every decision is delegated to `insimul::FBindingEditorModel`, host-tested by
`run-binding-editor-tests.sh` against the SAME cases the Unity leg
(`BindingEditorTests`) proves — so the two editors can never disagree. The widget
itself only marshals the Asset Registry + object pickers + the binding table into
the model, so it is syntax-gated only.
