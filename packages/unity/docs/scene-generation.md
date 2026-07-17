# Editor-time scene generation (US-UB3)

The Unity SDK's **Insimul ▸ Generate Scene From World IR** menu turns a world's
exported IR into a native Unity scene under `Assets/Insimul/Generated/`. This is
the higher-value creator path (plan §4.3): instead of the runtime procedural
generators, a creator gets real, hand-editable GameObjects, prefab instances, and
a baked NavMesh at edit time.

## Architecture: pure core + thin Unity seam

All placement **math** is UnityEngine-free and host-tested on a bare .NET SDK, so
it can never silently drift:

| Layer | File | Coupling | Verified by |
|-------|------|----------|-------------|
| Placement math + manifest | `Runtime/Scene/SceneGenerator.cs` | pure (System.*) | `RunSceneGenTests` (host) + `SceneGenTests` (EditMode) |
| Pipeline seam + orchestration | `Runtime/Scene/ISceneBuilder.cs` | pure | same |
| Entity-id stamp | `Runtime/Scene/InsimulEntityId.cs` | `MonoBehaviour` | structural syntax gate |
| Unity materializer | `Editor/InsimulSceneGenerator.cs` (`UnitySceneBuilder`) | `UnityEngine` + `UnityEditor` | structural syntax gate |

`SceneGenerator.ComputePlacement(ir, resolver)` returns a **`PlacementManifest`** —
the ordered list of `PlacedNode` (entity id, kind, resolved archetype/asset,
world transform). `ScenePipeline.Build(manifest, builder)` walks it and dispatches
each node to an `ISceneBuilder`. The Unity implementation creates the GameObjects;
a `RecordingSceneBuilder` test double records the calls so the orchestration is
assertable without an editor.

## Pipeline stages (in order)

1. **Terrain** — one Unity `Terrain` tile per `chunkSize × chunkSize` cell; the
   tile height is the bilinear sample of the IR heightmap at the chunk centre.
2. **Roads** — a mesh strip positioned at the centroid of each road's control
   points, height-sampled onto the terrain.
3. **Buildings (+ interiors)** — the footprint position is snapped to the 1-unit
   placement grid, terrain-height-sampled, and scaled by the building's zone role
   (`commercial 1.3`, `downtown 1.4`, `industrial 1.2`, `outskirts 0.9`, else
   `1.0`). A building flagged `interior: true` also emits a separate interior node
   at the origin (the additive-scene door-warp convention).
4. **Props** — item/prop placements at their IR position + rotation.
5. **NavMesh** — a single `nav.region` bake root, then a `NavMeshSurface` bake
   stage (via the AI Navigation package; the bake degrades to a no-op if the
   optional package is absent).

Nodes are emitted in a canonical **`entityId` ordinal order** so the hierarchy is
deterministic regardless of IR array order. Every generated GameObject is stamped
with an `InsimulEntityId` (id + kind + archetype + binding source + `generated`
flag) — the match key the conservative re-import diff (US-UB4) uses.

## Unity archetype mapping (five roots)

Unity is locked to the US-UB1 five taxonomy roots (`building`, `npc`, `item`,
`prop`, `terrain`), so the generator maps IR entities onto those roots — it does
**not** invent `road` / `interior` / `nav` roots the way the Godot mirror does:

| IR entity | Unity archetype | Resolves to (placeholder) |
|-----------|-----------------|---------------------------|
| terrain chunk | `terrain.chunk` | `terrain.*` |
| road | `terrain.texture.road` | exact |
| building (role R) | `building.<R>` | `building.<R>.*` or `building.*` |
| interior | *(none)* | unbound — generated additive scene root |
| prop (kind K) | `prop.<K>` | `prop.*` |
| nav region | *(none)* | unbound bake root |

## Determinism + the manifest contract

`SceneGenerator.SerializeManifest(manifest)` emits canonical JSON (sorted keys,
coordinates quantized to `0.001`) via the same `JsonVal`/`CanonicalJson` core the
save system uses. Same IR + same binding table → **byte-identical** manifest.

The golden fixtures pin the math:

- `Tests/Editor/fixtures/scene/golden-ir.json` — the input world IR.
- `Tests/Editor/fixtures/scene/golden-placement-manifest.json` — the expected
  output. Its `position` / `rotationY` / `scale` numbers match the **Godot
  cross-engine golden** (`packages/godot/addons/insimul/editor/scene/fixtures/
  golden-placement-manifest.json`) exactly, so the placement math is identical
  across engines; only the Unity-native archetype/asset strings differ.

Regenerate the golden manifest from a host dump of `ComputePlacement`, never by
hand.
