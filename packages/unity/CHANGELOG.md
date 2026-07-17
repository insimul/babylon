# Changelog — Insimul Unity SDK (`com.insimul.sdk`)

All notable changes to the Unity package are documented here. This package is
independently versioned; its version is the `unity` entry in the repo-root
`VERSIONS.json` (the single source of truth, enforced by
`npm run engines:manifests`) and must match `package.json`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Release identity hardened for the standalone-package split: explicit empty
  `dependencies` block in `package.json`, version pinned to `VERSIONS.json`, and
  a manifest-validation gate (`npm run engines:manifests`).
- UPM release dry-run (`scripts/release/pack-upm.mjs`, `npm run release:dry-run`):
  builds + validates the `npm pack` tarball layout. Added a `files` allow-list to
  `package.json` so the tarball ships the SDK only (no `templates/` tree).

## [0.1.0]

### Added
- Initial UPM package: `InsimulManager`, `InsimulNPC`, streaming text/audio/lip-sync
  components, microphone capture, and the Basic Conversation sample.
