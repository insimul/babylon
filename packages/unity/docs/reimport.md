# Conservative re-import diff (US-UB4)

A world's IR changes over its life: the author regenerates settlements, moves a
lot, adds a prop. Re-running **Insimul ▸ Generate Scene From World IR** from
scratch would throw away every hand edit a creator made in the interim — the
manually-placed statue, the tweaked building rotation, the extra decoration. The
plan (§5.3 risk 4) calls for a **conservative re-import** that folds upstream
changes in *without* clobbering local work.

**Insimul ▸ Re-import World IR (Diff)**
([`Editor/InsimulReimport.cs`](../Editor/InsimulReimport.cs)) does exactly that.

## The policy

Existing scene objects are matched to the freshly computed placement manifest by
their stable **`InsimulEntityId`** stamp (the same id the scene generator wrote).
Each matched / unmatched id is classified into exactly one action:

| Action | Condition | What happens |
|--------|-----------|--------------|
| **Added** | in the new IR, no existing object with that id | a fresh generated object is materialized + stamped |
| **Updated** | in both, existing is `generated=true`, transform/binding differs | the generated transform + binding is re-applied in place |
| **Unchanged** | in both, existing is `generated=true`, equivalent | no-op |
| **Skipped** | existing object is `generated=false` (a hand edit) | preserved **verbatim** — present in or absent from the new IR |
| **Deprecated** | existing is `generated=true` but gone from the new IR | reparented under a **`Deprecated/`** group, **never deleted** |

Two invariants make this safe for creators:

- **Hand edits are never touched.** Un-stamped objects (no `InsimulEntityId`) are
  invisible to the diff. A stamped object the creator marked `generated=false`
  (an adopted / overridden generated object) is always *Skipped* — never updated,
  never deprecated — whether or not the new IR still lists its id.
- **Nothing is destroyed.** A generated object the IR dropped is moved to the
  `Deprecated/` group for the human to review and remove, not silently deleted.

## Dry-run first

The classification is a **pure, side-effect-free** function of the old + new node
sets. The menu computes it, logs the canonical report, and shows an
added/updated/unchanged/skipped/deprecated summary dialog **before** any mutation;
the creator confirms (or cancels) with nothing changed. The whole apply is wrapped
in a single `Undo` group.

## Architecture: pure core + thin Unity seam

Like the rest of the Unity SDK, all decision logic is UnityEngine-free and
host-tested on a bare .NET SDK, so it can never drift from the cross-engine
contract:

| Layer | File | Coupling | Verified by |
|-------|------|----------|-------------|
| Diff classification + report | `Runtime/Scene/ReimportDiff.cs` (`ReimportDiff`) | pure (System.*) | `RunReimportDiffTests` (host) + `ReimportDiffTests` (EditMode) |
| Apply seam + orchestration | `Runtime/Scene/ReimportDiff.cs` (`IReimportSceneMutator` / `ReimportReconciler`) | pure | same |
| Live-tree mutator | `Editor/InsimulReimport.cs` (`UnitySceneReimporter`) | `UnityEngine` + `UnityEditor` | structural syntax gate |

`ReimportDiff.Compute(oldNodes, newNodes)` returns a **`DiffReport`** — five
ascending id lists (added / updated / unchanged / skipped / deprecated).
`ReimportReconciler.Apply(old, new, mutator)` runs that classification and drives
an `IReimportSceneMutator` (update / add / deprecate — unchanged & skipped are
no-ops by policy). The Unity implementation mutates the scene tree; a
`RecordingReimportMutator` test double records the decisions so the apply
orchestration is assertable without an editor.

## Determinism + the cross-engine golden

`ReimportDiff.SerializeReport` emits the report as canonical JSON (key-sorted via
the same `CanonicalJson` the placement manifest uses), so two runs — or two
engines — produce byte-identical bytes. The shared golden
[`Tests/Editor/fixtures/reimport/golden-diff-report.json`](../Tests/Editor/fixtures/reimport/golden-diff-report.json)
is byte-identical to the Godot leg's
(`packages/godot/addons/insimul/editor/reimport/fixtures/golden-diff-report.json`)
— the Unity/Godot/Unreal legs all reconcile against the *same* re-import policy,
mirroring `packages/godot/gdextension/src/reimport_diff.cpp` and its `@tool`
GDScript twin exactly.
