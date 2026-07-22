# Changelog

All notable changes to the `@insimul/runtime` packages are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/); this repo publishes several
packages, so entries are tagged with the package they affect.

## [Unreleased]

### Added — `@insimul/babylon` (the consolidated web runtime, `packages/babylon`)

The three web packages (`@insimul/typescript`, `@insimul/babylon-game`, the old
`@insimul/babylon` export-template shell) and the Babylon side of `shared/` are
consolidated into **one** package, `@insimul/babylon` — one runtime package per engine,
so a web creator installs exactly one thing (plan: `docs/PLATFORM_SPLIT_AND_ENGINE_PLUGINS.md`
§A1.5).

- **`./conversation`** (US-BC1) — the conversation SDK (LLM/TTS/STT), formerly
  `@insimul/typescript`.
- **`./data`** (US-BC2) — DataSource, save-file persistence (`SaveFileDataSource`,
  `WorldStateManager`, `SaveQueue`), loading/optimization UI, and the `BabylonWorld`
  React mount, formerly `@insimul/babylon-game`. `react` is now an **optional peer** —
  only the React entry points need it.
- **`./engine`** (US-BC3) — the Babylon renderer, game logic, systems, and voice,
  formerly `shared/game-engine` + `shared/voice`. The `@babylonjs/*` dependencies moved
  from the root `package.json` into `@insimul/babylon`.
- **`./templates`** (US-BC4) — the Vite/Electron export shell, with aliases that resolve
  the consolidated package directly in a generated game (`src/insimul-babylon`).
- **`@insimul/babylon` internal source** (US-BC5) — canonicalized off the deprecated
  aliases: it now imports `@insimul/babylon/conversation` and `@insimul/babylon/data`
  rather than `@insimul/typescript` / `@insimul/babylon-game`, so the package no longer
  depends on its own deprecated passthroughs.

### Added — guards & docs (US-BC5)

- **Source-location guard** — non-shim source may live only under
  `packages/{core,babylon}`; a new module landing in `shared/` or a deprecated package
  fails the check. Pre-existing straggler domain files are grandfathered in
  `shared/GRANDFATHERED_SOURCE.json` (a list that may only shrink).
- **Import-direction guard** — `@insimul/babylon` may depend on `@insimul/core` only
  among first-party packages (mirror of the existing `@insimul/core → nothing` guard).
- README rewritten around the two-package model with a "plug Insimul into your existing
  web game" quickstart.

### Added — publishing (US-PB1)

- **`@insimul/core` + `@insimul/babylon` are publish-ready.** Both pin
  `publishConfig.access: "restricted"` (public release is gated on the git-history
  audit + third-party purge — see `docs/PUBLISHING.md`), ship `LICENSE` (Apache-2.0)
  and a package `README.md` (new for `@insimul/babylon`), and carry tightened `files`
  allow-lists that exclude every test file, `__tests__/` directory, the `conformance/`
  parity corpus, and dev tooling. `@insimul/core` now also ships its language-neutral
  contract artifacts (`schemas/*.schema.json`, `openapi/`, `data/`).
- **`npm run publish:dry-run`** (`scripts/release/npm-publish-dry-run.mjs`) — a publish
  gate that dry-runs each package and asserts the tarball contents, the `exports`-map
  targets, and the `restricted` access pin. It never publishes.
- **`docs/PUBLISHING.md`** — the npm release process, the source-distribution rationale
  (no `dist/` build by design), and the hygiene gate on going public.

### Added — publishable deprecated passthroughs (US-PB2)

- **`@insimul/typescript` + `@insimul/babylon-game` are publish-ready as deprecated
  stubs.** Both now ship `LICENSE` and a `README.md` (new for `@insimul/babylon-game`,
  with a per-path migration table), pin `publishConfig.access: "restricted"`, carry a
  `deprecated` message in the manifest alongside the `DEPRECATED …` description, and
  exclude tests from `files`. `@insimul/typescript`'s README no longer claims MIT — the
  package is Apache-2.0 like the rest.
- **Each passthrough declares `@insimul/babylon` as a dependency**, so installing the
  old name pulls in the implementation its shims re-export.
- **The publish gate covers all four packages.** For a deprecated one it additionally
  asserts the deprecation metadata (manifest + description + README) names
  `@insimul/babylon`, and that every shipped shim's relative re-export resolves — from
  the installed package root — to a file `@insimul/babylon` actually ships. Renaming or
  un-shipping a module in the successor package now fails the gate instead of a
  consumer's install.

### Added — release workflow (US-PB3)

- **`npm run release:dry-run`** (`scripts/release/publish-web-packages.mjs`) — the
  release orchestrator, dry-run by default. It runs the preflight (manifest versions vs
  the new `web` block in `VERSIONS.json`, the `restricted` access pin, a `web-v*` tag on
  a clean HEAD) and the publish gate, then **prints** the `npm publish` /
  `npm deprecate` commands it would run. Publishing requires `--execute` *and*
  `INSIMUL_PUBLISH=1`; a stray flag alone exits non-zero.
- **`.github/workflows/release-web-packages.yml`** — cuts a release on a `web-v<train>`
  tag (e.g. `web-v2026.07.22`). The `verify` job runs `check`, `test`,
  `test:export-shell`, the publish gate, and the release dry-run; the `publish` job runs
  only when the `INSIMUL_PUBLISH_ENABLED` repository variable is `"true"` **and** a
  reviewer approves the `npm-release` environment — so no tag, push, or manual run
  publishes by accident. Publishing is idempotent: versions already on the registry are
  skipped, so one tag releases only what changed.
- **`VERSIONS.json` now covers the web packages** (`web` block) alongside the native
  engines; the packages stay independently versioned, and the preflight fails on any
  manifest/`VERSIONS.json` drift.
- **`shared/__tests__/release-workflow.test.ts`** — parses the workflow and fails if a
  step that can reach the registry loses a guard, or if the verify job stops running a
  gate.
- **Docs** — `docs/PUBLISHING.md` gained "Versioning" (tag format + semver policy, incl.
  shim removal = major) and "The release workflow"; `docs/RELEASING.md` now indexes both
  package families and restates that going public awaits the history-audit /
  third-party-purge hygiene.

### Deprecated

- **`@insimul/typescript`** → install `@insimul/babylon`, import `@insimul/babylon/conversation`.
- **`@insimul/babylon-game`** → install `@insimul/babylon`, import `@insimul/babylon/data`.

  Both keep publishing as 100% re-export shims so existing installs resolve unchanged;
  they are marked deprecated via `npm deprecate` at publish time (a separate CLI step —
  publishing alone does not set the registry flag; see `docs/PUBLISHING.md`). The
  `@shared/game-engine/*` and `@shared/voice/*` module paths likewise still resolve
  through one-line shims. Removal is deferred to a future major release once no consumer
  imports the old paths (see the README shim / deprecation timeline).

### Notes

- **Platform follow-up required before the next game export** (recorded verbatim in
  `scripts/ralph/progress.txt` US-BC4): the export copy step must additionally vendor
  `packages/babylon/src → src/insimul-babylon` so the new template aliases resolve.
- The straggler game/domain layer still under `shared/` (language-learning, assessment,
  quest, narrative, onboarding, procedural, telemetry) is future `@insimul/core` /
  domain-package territory, out of scope for the web-engine consolidation.

## [0.1.1] — pre-consolidation baseline

The prior layout: `@insimul/runtime` (`shared/`), `@insimul/typescript`,
`@insimul/babylon` (export templates only), `@insimul/babylon-game`, plus the extracted
`@insimul/core` contract. Superseded by the two-package model above.
