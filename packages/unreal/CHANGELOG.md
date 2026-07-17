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

### Notes
- **Editor module deferred.** The plugin currently ships a single `InsimulRuntime`
  module (`Type: Runtime`). A dedicated `Type: Editor` module is planned (its source
  lands in the unreal-editor PRD). It is intentionally **not** declared in
  `Insimul.uplugin` yet: Unreal Build Tool fails to load/package a plugin that
  declares a module with no source directory, so declaring an empty Editor module
  now would break packaging. The layout is documented in the README instead and the
  manifest entry is added when the module source exists.
- `EngineVersion` is intentionally left unset: this is a source plugin that builds
  against the installed engine. It is pinned per target at release time (FAB /
  Marketplace submission).

## [1.0.0]

### Added
- Initial plugin: `InsimulRuntime` module — streaming NPC conversations, TTS/STT,
  quest management, and crowd character integration.
