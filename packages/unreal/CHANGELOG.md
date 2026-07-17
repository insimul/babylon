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

### Notes
- `EngineVersion` is intentionally left unset: this is a source plugin that builds
  against the installed engine. It is pinned per target at release time (FAB /
  Marketplace submission).

## [1.0.0]

### Added
- Initial plugin: `InsimulRuntime` module — streaming NPC conversations, TTS/STT,
  quest management, and crowd character integration.
