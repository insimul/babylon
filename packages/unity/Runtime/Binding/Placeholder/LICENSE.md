# Insimul placeholder asset pack — licensing

All content in this placeholder pack is **original and released under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)** (public
domain dedication). No third-party assets, textures, meshes, or downloaded
binaries are used.

## What's in the pack

The pack is **generated procedurally at editor time**, not shipped as binaries:

- **Meshes** — Unity's built-in primitives (cube, capsule, cylinder, sphere,
  quad). No mesh files are committed.
- **Materials** — flat, single-color materials tinted per taxonomy root
  (`building.*`, `npc.*`, `item.*`, `prop.*`, `terrain.*`). Generated, not committed.
- **Prefabs** — one primitive prefab per placeholder recipe, written under
  `Generated/` when you run **Insimul ▸ Generate Placeholder Pack**.
- **Binding table** — `PlaceholderBindingTable.asset`, a pre-wired
  `InsimulBindingTable` (`sourceKind = Placeholder`) mapping every base taxonomy
  node to its generated primitive prefab.

The recipe is the pure, UnityEngine-free `PlaceholderPack` (see
`../PlaceholderPack.cs`); the editor generator
(`../../../Editor/PlaceholderPackGenerator.cs`) materializes it. Because the five
base-node wildcards cover every root, **any imported world is instantiable out of
the box** — ugly-but-functional grey-box art you replace via your own project
binding table (which always overrides the placeholder tier).

You may use, modify, and redistribute this placeholder content with no
attribution required.
