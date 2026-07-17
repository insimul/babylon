# Insimul placeholder asset pack — licensing

All content in the bundled Insimul placeholder pack is **original work created by
the Insimul project and released under [CC0 1.0 Universal (public domain
dedication)](https://creativecommons.org/publicdomain/zero/1.0/)**. You may use,
modify, and redistribute it for any purpose, with or without attribution.

## What's in the pack

Nothing in this pack is a checked-in binary blob. The placeholder meshes and the
pre-wired binding table are **generated procedurally at editor time** by
`UInsimulPlaceholderPackGenerator::Generate()` (menu: **Insimul ▸ Generate
Placeholder Pack**), which walks the pure recipe in
`Source/InsimulEditor/Portable/InsimulPlaceholderPack.cpp`:

- one primitive `StaticMesh` per archetype spec — a box / capsule / cylinder /
  sphere / quad built from Unreal's own primitive builders, tinted with a single
  shared flat material (a taxonomy-labeled color);
- a pre-wired `UInsimulBindingTable` (SourceKind = `Placeholder`) mapping every
  base-taxonomy archetype key to its generated placeholder.

Because the geometry is UE's built-in primitives and the materials are flat
solid colors, **no third-party art, textures, or fonts are involved**, and there
is nothing to attribute. The PCG vegetation graph
(`data/pcg/insimul-vegetation-graph.json`) is likewise an original data
descriptor.

## Coverage guarantee

The pack's five base-node wildcards (`building.*`, `npc.*`, `item.*`, `prop.*`,
`terrain.*`) make **every** archetype key the golden world's IR uses resolve, so
an imported world is instantiable out of the box before any real art exists. This
is pinned by the host coverage test
(`Source/InsimulEditor/Tests/test_placeholder_pack.cpp`) against the shared
`golden-world-archetypes.json` fixture (byte-identical to the Unity/Godot legs).
