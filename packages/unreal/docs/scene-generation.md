# Editor-time scene generation (US-XG2)

The `InsimulEditor` module's **Insimul ▸ Generate Scene From World IR** action
turns a world's exported IR into a native Unreal scene. This is the higher-value
creator path (plan §4.3): instead of the runtime procedural world generators, a
creator gets real, hand-editable actors, a sculpted Landscape, Level-Instance
interiors, and a baked NavMesh at edit time.

## Architecture: pure core + thin UE seam

All placement **math** is Unreal-Engine-free and host-tested on a bare clang
toolchain, so the scene tree and the cross-engine golden can never silently drift:

| Layer | File | Coupling | Verified by |
|-------|------|----------|-------------|
| Placement math + manifest | `Source/InsimulEditor/Portable/InsimulScenePlacement.{h,cpp}` | pure (std only) | `run-scene-tests.sh` (host) |
| Binding resolver | `Source/InsimulEditor/Portable/InsimulBindingResolver.{h,cpp}` | pure | `run-binding-tests.sh` (host) |
| Identity stamp | `Public/InsimulEntityIdComponent.h` | `UActorComponent` | structural syntax gate |
| Materializer + entry point | `Public/InsimulSceneGenerator.h`, `Private/InsimulSceneGenerator.cpp` | `UWorld` + Landscape/Actor/Nav APIs | structural syntax gate |

`insimul::ComputePlacement(ir, resolver)` returns an **`FPlacementResult`** — the
ordered list of `FPlacedNode` (entity id, kind, resolved archetype/asset, world
transform). `UInsimulSceneGenerator::GenerateFromWorldIr(...)` builds the resolver
from the project's `UInsimulBindingTable`s, runs that pure core, then walks the
manifest and materializes each node through a stage.

## Pipeline stages (in order)

1. **Terrain** — one Landscape tile per `chunkSize × chunkSize` cell; the tile
   height is the bilinear sample of the IR heightmap at the chunk centre.
2. **Roads** — a Landscape Spline traced through each road's control points,
   positioned at their centroid and projected onto the terrain height.
3. **Buildings (+ interiors)** — the footprint position is snapped to the 1-unit
   placement grid, terrain-height-sampled, and scaled by the building's zone role
   (`commercial 1.3`, `downtown 1.4`, `industrial 1.2`, `outskirts 0.9`, else
   `1.0`). A building flagged `interior: true` also emits a separate interior node
   at the origin materialized as a **Level Instance** (the door-warp convention).
4. **Props** — bound prop actors at their IR position + rotation.
5. **NavMesh** — a single `nav.region` bake root becomes a `NavMeshBoundsVolume`
   covering the terrain extent (+ `NavBoundsPadding`), then a bake pass.

Nodes are emitted in canonical **`entityId` ordinal order** so the hierarchy is
deterministic regardless of IR array order. Every spawned actor is stamped with a
`UInsimulEntityIdComponent` (id + kind + archetype + binding source + `generated`
flag) **and** the `Insimul.Generated` actor tag — the match key the conservative
re-import diff (US-XG4) uses.

Worlds whose side exceeds `WorldPartitionThreshold` metres enable **World
Partition** so content streams by grid cell.

## Unreal archetype mapping (five roots)

Unreal mirrors the Unity leg exactly — locked to the US-UB1 five taxonomy roots
(`building`, `npc`, `item`, `prop`, `terrain`):

| IR entity | Archetype | Resolves to (placeholder) |
|-----------|-----------|---------------------------|
| terrain chunk | `terrain.chunk` | `terrain.*` |
| road | `terrain.texture.road` | exact |
| building (role R) | `building.<R>` | `building.<R>.*` or `building.*` |
| interior | *(none)* | unbound — generated Level Instance |
| prop (kind K) | `prop.<K>` | `prop.*` |
| nav region | *(none)* | unbound bake root |

An IR entity may override its archetype with an explicit `archetype` field.

## Heightmap & scale conventions

- **IR units are metres, +Y up, right-handed** (`{x, y, z}` points). The IR
  heightmap is a **row-major** `resolution × resolution` grid of heights (metres)
  covering `[0..size.x] × [0..size.z]`. Height at a world `(x, z)` is a **bilinear
  interpolation** of the four surrounding grid samples; world coords outside the
  grid **clamp to the edge**. A degenerate map (resolution `< 1` or empty heights)
  samples `0`; `resolution == 1` returns the single value everywhere.
- **Chunking**: the terrain is split into `ceil(size.x / chunkSize) ×
  ceil(size.z / chunkSize)` chunks; each chunk actor sits at its cell centre
  `(cx·chunkSize + chunkSize/2, height, cz·chunkSize + chunkSize/2)`.
- **Building footprints** snap to a **1.0-metre grid** (round-half-away-from-zero)
  before height sampling, then scale by the zone-role table above.
- **Unreal frame conversion** (in the materializer only, never in the manifest):
  Unreal is **centimetres, left-handed (X forward, Y right, Z up)**. A manifest
  position `(x, y, z)` metres maps to the UE world location
  `(x·100, z·100, y·100)` cm. Rotation is about +Y in the IR (radians) and about
  +Z (yaw, degrees) in UE.
- **Determinism / quantization**: every serialized coordinate is rounded to
  **`0.001`** (`kSceneCoordQuantum`) so a 32-bit engine float and a 64-bit host
  double round to the same value — the manifest is byte-identical run-to-run and
  across engines.

## Determinism + the cross-engine contract

`insimul::SerializePlacementManifest(result)` emits canonical JSON (sorted keys,
coordinates quantized to `0.001`) via the same `InsimulJson`/`InsimulCanonicalJson`
core the save system uses. Same IR + same binding tables → **byte-identical**
manifest.

The golden fixtures pin the math:

- `Source/InsimulEditor/Tests/fixtures/scene/golden-ir.json` — the input world IR
  (byte-copied from the Unity leg).
- `Source/InsimulEditor/Tests/fixtures/scene/unity-golden-placement-manifest.json`
  — Unity's **committed golden** (byte-copied from
  `packages/unity/Tests/Editor/fixtures/scene/golden-placement-manifest.json`). The
  host test (`run-scene-tests.sh`) computes the placement over the shared IR and
  asserts every node's `entityId` / `kind` / `archetype` / `generated` / `position`
  / `rotationY` / `scale` — plus `nodeCount` + `seed` — match Unity's golden. Only
  the engine-specific `assetRef` / `bindingSource` strings differ; the placement
  **math** is the shared cross-engine contract (Unity ⇄ Unreal ⇄ Godot).

Regenerate a manifest dump with `test_scene_placement --dump <fixtures-dir>`,
never edit the golden by hand.
