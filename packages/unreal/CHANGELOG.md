# Changelog — Insimul Unreal Plugin

All notable changes to the Unreal Engine plugin are documented here. This package
is independently versioned; its version is the `unreal` entry in the repo-root
`VERSIONS.json` (the single source of truth, enforced by
`npm run engines:manifests`) and must match both `Insimul.uplugin`'s `VersionName`
and the `VERSION` file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `VERSION` file alongside `Insimul.uplugin`, kept in sync with the manifest's
  `VersionName` and `VERSIONS.json` by `npm run engines:manifests`.
- FAB/Marketplace release dry-run (`scripts/release/build-plugin-zip.mjs`): stages
  the plugin (`.uplugin` + `Source/`, no `templates/` or build intermediates) and
  builds + validates a `dist/Insimul-<version>.zip`.
- **`InsimulEditor` module (`Type: Editor`) + Asset Binding Layer (US-XG1).** New
  `Source/InsimulEditor` module, now declared in `Insimul.uplugin`. It ships the
  `UInsimulBindingTable` UDataAsset (archetype-key → soft asset reference + transform
  fixups + sockets; resolution order Project → Pack → Placeholder) as a thin adapter
  over a UE-free resolver core (`Portable/InsimulBindingResolver.{h,cpp}`) with
  wildcard/descendant matching, most-specific-within-source + first-matching-source
  selection, sorted/canonical portable-pack import/export, and an unbound report. The
  core host-tests on the bare clang toolchain against the same cross-engine fixtures
  (`resolver-matrix.json` + Unity's `unity-fixture-pack.json`) as the Unity/Godot legs
  (`npm run engines:unreal:binding`; wired into `npm run engines:check`).

- **Terrain + settlement generation pipeline (US-XG2).** New UE-free placement
  core (`Source/InsimulEditor/Portable/InsimulScenePlacement.{h,cpp}`): given a
  parsed World IR + the binding resolver it computes the deterministic, canonically
  ordered PLACEMENT MANIFEST (terrain chunks from the IR heightmap, roads at road-
  point centroids, buildings on grid-snapped + zone-scaled footprints, interiors,
  props, and a nav bake root) — bilinear heightmap sampling, 1-unit footprint grid,
  zone-role scaling, `0.001` coordinate quantization, all host-tested. The archetype
  keys + numbers mirror the Unity leg exactly, so the host gate
  (`npm run engines:unreal:scene`) asserts every node reproduces Unity's committed
  golden manifest (byte-copied fixtures) — the cross-engine determinism contract.
  The UE-coupled materializer (`InsimulSceneGenerator` entry point + pipeline stages,
  `InsimulEntityIdComponent` identity stamp + `Insimul.Generated` tag) is syntax-
  gated; `Landscape`/`LandscapeEditor`/`Foliage`/`NavigationSystem`/`PCG` deps
  declared in `InsimulEditor.Build.cs`. Conventions in `docs/scene-generation.md`.
  Wired into `npm run engines:check`.
- **PCG vegetation + placeholder pack (US-XG3).** New UE-free placeholder pack
  recipe (`Source/InsimulEditor/Portable/InsimulPlaceholderPack.{h,cpp}`): an
  ordinally sorted list of primitive+taxonomy-color specs (five base-node wildcards
  `building.*`/`npc.*`/`item.*`/`prop.*`/`terrain.*` + nicer sub-node defaults)
  projected into a Priority-0 Placeholder-tier `FBindingSource`. Host coverage gate
  (`npm run engines:unreal:placeholder`) proves every archetype key in the shared
  `golden-world-archetypes.json` (byte-identical to Unity's) resolves with zero
  unbound. The UE-coupled generator (`InsimulPlaceholderPackGenerator`) walks the
  same specs to materialize primitive meshes + a pre-wired `UInsimulBindingTable`.
  PCG vegetation scatter: portable graph descriptor
  (`data/pcg/insimul-vegetation-graph.json`) + the syntax-gated
  `InsimulPcgVegetation` stage that feeds graph parameters from the IR biome/density
  slice. Licensing note `data/placeholders/LICENSE.md` (all original / CC0).
  Conventions in `docs/scene-generation.md`; wired into `npm run engines:check`.

### Notes
- `EngineVersion` is intentionally left unset: this is a source plugin that builds
  against the installed engine. It is pinned per target at release time (FAB /
  Marketplace submission).

## [1.0.0]

### Added
- Initial plugin: `InsimulRuntime` module — streaming NPC conversations, TTS/STT,
  quest management, and crowd character integration.
