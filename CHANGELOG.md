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

### Deprecated

- **`@insimul/typescript`** → install `@insimul/babylon`, import `@insimul/babylon/conversation`.
- **`@insimul/babylon-game`** → install `@insimul/babylon`, import `@insimul/babylon/data`.

  Both keep publishing as 100% re-export shims so existing installs resolve unchanged;
  they are marked deprecated via `npm deprecate` at publish time. The
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
