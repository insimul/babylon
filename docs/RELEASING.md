# Releasing the native engine packages

The three native engine packages — `packages/unity`, `packages/unreal`,
`packages/godot` — are **independently releasable**. Each targets a different
ecosystem registry, carries its own version (single-sourced from
[`VERSIONS.json`](../VERSIONS.json)), and ships its own release tooling under
`packages/<engine>/scripts/release/`.

Today these packages live in this monorepo. The planned platform split
(`docs/PLATFORM_SPLIT_AND_ENGINE_PLUGINS.md` in the platform repo, §1.2 + §A4)
will move each into its own repo (`insimul-unity` / `insimul-unreal` /
`insimul-godot`) as a pure directory move. **The release scripts are
self-contained (Node + system `zip`/
`tar` only, no repo-root imports) so they move verbatim with their package** —
nothing in `scripts/release/` reaches back into the runtime repo.

## Version discipline (do this first, every release)

`VERSIONS.json` at the repo root is the single source of truth. To cut a release:

1. Bump the package's entry in `VERSIONS.json`.
2. Sync the package manifest(s): unity `package.json` `version`; unreal `VERSION`
   + `Insimul.uplugin` `VersionName`; godot `addons/insimul/plugin.cfg` +
   `asset-lib.json` `version`.
3. Date the `## [Unreleased]` heading in that package's `CHANGELOG.md`.
4. Run `npm run engines:manifests` — it fails if any manifest disagrees with
   `VERSIONS.json`.

Because the packages are independent, their versions may diverge; only a
package's *own* manifest must match its *own* `VERSIONS.json` entry.

## Dry-run the artifacts

`npm run engines:release` builds and validates every package's release artifact
without publishing (each also runs standalone — see below). Artifacts land in
`packages/<engine>/dist/` (git-ignored). Every script asserts its output file
set and exits non-zero on a layout problem, so this doubles as a release gate.

| Engine | Command | Artifact | Distribution target |
| --- | --- | --- | --- |
| Unity | `npm run --workspace=com.insimul.sdk release:dry-run` | `dist/com.insimul.sdk-<v>.tgz` | OpenUPM / UPM registry |
| Unreal | `node packages/unreal/scripts/release/build-plugin-zip.mjs` | `dist/Insimul-<v>.zip` | FAB / Marketplace |
| Godot | `node packages/godot/scripts/release/build-assetlib-zip.mjs` | `dist/insimul-godot-<v>.zip` | Godot Asset Library |

### Unity — UPM tarball

`npm pack` produces the UPM tarball. The `files` allow-list in
`packages/unity/package.json` keeps it to the SDK (`Runtime/`, `Editor/`,
`Samples~/`, `README`, `CHANGELOG`, `package.json`) and **excludes the
`templates/` game-template tree** — that is a separate export-pipeline artifact
published from the root `@insimul/runtime` package, not part of the UPM SDK. The
dry-run asserts the tarball ships the SDK and never `templates/`, then prints an
OpenUPM readiness checklist. Publishing is a manual `npm publish` (or OpenUPM CI)
from a clean, tagged checkout.

### Unreal — FAB / Marketplace plugin zip

Stages the plugin into `dist/Insimul/` with `Insimul.uplugin` at the plugin-folder
root plus `Source/`, then zips it. Build intermediates (`Binaries/`,
`Intermediate/`) and the `templates/` tree are excluded. The dry-run asserts every
committed `Source/` file is present and `VersionName` matches `VERSION`. A real
compile against each supported UE version requires the Unreal editor and is **out
of this harness** (see `tools/README.md`); do it before submitting `dist/Insimul-<v>.zip`
to the FAB seller portal.

### Godot — Asset Library zip

Stages `addons/insimul/**` (the reusable plugin) plus docs into
`dist/insimul-godot/` and zips it in the layout the editor's AssetLib installer
preserves. The `templates/` tree is excluded. The dry-run asserts `plugin.cfg`
and every committed `addons/` file are present. Submission is manual at
godotengine.org/asset-library, pointing at a tagged commit.

## After the split

When a package moves to its own repo, drop `scripts/release/` in place (it already
has no runtime-repo dependencies), keep `VERSIONS.json` as a small per-repo file
(or inline the version into the manifest), and re-point the manifest validator at
the single package. This `RELEASING.md` moves with the split docs; the per-engine
release cadence is then owned by each split repo's CI.
