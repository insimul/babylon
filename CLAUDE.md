# insimul-runtime — agent notes

## Standalone type-check (non-negotiable)

`npm run check` (root) runs `tsc -p tsconfig.check.json` over `shared/` + the TS
packages' `src/` with the `@shared/* -> ./shared/*` and `@insimul/{typescript,
babylon-game}` aliases the platform uses. **It must stay green (exit 0).**

- Every `@shared/...` import must resolve to a file **in this repo** — no
  back-references into `insimul-platform`. If a runtime file needs an authoring
  module, vendor the runtime-needed slice (open logic/models) or add a narrow
  type surface; never pull in closed corpora / quest-seed generators.
- `tsconfig` `exclude` does **not** stop tsc checking a file that is *imported* by
  an included file. To quarantine such a file you must use an in-file `// @ts-nocheck`.
  Two files currently carry one (`shared/game-engine/types.ts`,
  `shared/game-engine/ir-types.ts`) for genuine pre-existing duplicate-interface bugs.
  **Do not add new `@ts-nocheck` directives to silence errors** — fix the type instead.
- When a runtime `.ts` needs a type whose concrete impl is platform-provided at export
  time (e.g. `GameQuestManager`), add a `.d.ts` type surface (ships no runtime code,
  can't shadow the platform's `.ts`) rather than vendoring the implementation.
- `@types/node`, `@types/react`, `typescript`, and `vite` are dev-only deps that back
  the check; they are not runtime deps.

## Tests (`npm test` -> `vitest run`)

`vitest.config.ts` (root) sets the `@shared` / `@insimul/*` aliases and includes the
package suites (`packages/babylon-game/src/**/*.test.ts`) plus the **import-hygiene
guard** (`shared/__tests__/import-hygiene.test.ts`). The guard scans source text and
asserts every `@shared/...` import resolves in-repo and nothing imports `@shared/schema`
— it's the runtime companion to `npm run check`. If a new `@shared/foo` fails it, create
`shared/foo.ts` (don't edit the importer to dodge it).

- The four `shared/**/*.test.ts` under `shared/prolog` and `shared/game-engine/logic`
  are **legacy tsx harnesses** (run via `npx tsx <file>`, no `describe`/`it`), not
  vitest suites — `vitest.config.ts` excludes them by name so `vitest run` stays green.
  Migrate one to vitest (import `describe`/`it`/`expect` from `vitest`) to opt it in.
- `vitest` is a dev-only dep; it resolves from the workspace-hoisted `node_modules`.
- Any package under `packages/*` where `npm test` gets run directly (the ralph verify
  gate does this per-package) needs its **own scoped `vitest.config.ts`** — without
  one, vitest walks up to the root config, whose include globs match nothing from the
  package cwd, and exits 1 with "No test files found". See
  `packages/typescript/vitest.config.ts` and `packages/core/vitest.config.ts`.

## `@insimul/core` and the re-export-shim pattern (core-extraction)

The engine-agnostic contract is being carved out of `shared/` into
`packages/core` (`@insimul/core`) so native engine plugins can consume it without
Babylon.js. **`packages/core/src` must never import `@babylonjs/*`, `react`, or DOM
libs** — its `tsconfig.json` omits the `dom` lib on purpose.

When you move a module `shared/foo.ts` into `packages/core/src/foo.ts`:

1. `git mv` the file so history follows it.
2. Fix its imports: sibling modules that also moved stay relative (`./bar`);
   modules still in `shared/` become `@shared/bar` (core's `tsconfig.json` maps
   `@shared/*` to `../../shared/*`).
3. Leave a **one-line re-export shim** at the old path so `@shared/foo` and the
   Babylon export pipeline keep resolving unchanged:
   `export * from '../packages/core/src/foo';`
   (`export *` covers types + values; none of the moved files use `export default`.)
4. Add the new file to `packages/core/src/index.ts`.
5. `packages/core` is registered via the root `workspaces: ["packages/*"]` glob,
   the `@insimul/core` path aliases in `tsconfig.check.json`, and the `@insimul/core`
   alias in `vitest.config.ts` — no per-file wiring needed after that.

Two gotchas when the moved set is large (e.g. the `shared/prolog/` toolchain, US-CE2):

- **Side-effect-only modules** (no `import`/`export`, just top-level statements — e.g.
  `tau-prolog-patch.ts` patches `globalThis`) are NOT modules to `tsc`, so `export *
  from './x'` yields TS2306 and a bare re-export shim fails the same way. Use a
  side-effect import instead — in the barrel omit it entirely (its real importer, e.g.
  `tau-engine.ts`, already does `import './tau-prolog-patch'`), and make its shim
  `import '../../packages/core/src/prolog/tau-prolog-patch';` (not `export *`).
- **Ambiguous barrel names**: a flat `export *` barrel over many modules DOES error
  (TS2308) when two modules export the same name (e.g. `ValidationResult`,
  `PredicateArg`). Resolve by explicitly re-exporting one variant
  (`export type { ValidationResult } from './content-validators';`) after the star
  exports — both variants stay reachable via `@insimul/core/prolog/<module>`. (Check
  for dupes up front: `grep -hoE "^export (const|function|class|type|interface|enum)
  [A-Za-z0-9_]+" src/**/*.ts | sed ... | sort | uniq -d`.)

Two more rules learned moving the quest/IR/language contract (US-CE3):

- **Don't drag a file into core just because the PRD lists it — audit its transitive
  reach first.** A file whose only blocker is a couple of `@babylonjs/*` *type*
  imports (e.g. `quest-types/types.ts` used `Scene`/`Vector3`) can be decoupled in
  place: replace them with engine-agnostic stand-ins (`type Vector3 = {x,y,z}` — the
  Babylon class is structurally assignable so existing Babylon-layer callers still
  type-check; `type Scene = unknown`). But a file that transitively reaches
  `shared/game-engine/*` must stay in `shared/` even if it type-checks in core — e.g.
  `quest-difficulty.ts` imports `language/cefr-adaptation`, which imports
  `@shared/game-engine/logic/ConversationDifficultyMonitor`. Core edging into the
  engine layer violates the US-CE2 invariant, so it stays with a barrel comment.
- **Core→shared *type* edges are OK to leave for now, engine edges are not.** Moved
  files may keep `@shared/<pure-type-module>` imports (e.g. `game-engine/ir-types`
  → `@shared/game-engine/types`, `language/progress` → `@shared/assessment/*` and
  `@shared/feature-modules/*/types`) — those resolve through the shims and US-CE6
  cleans them up. The hard line is `@shared/game-engine/logic` / `rendering` and any
  `@babylonjs/*`.

Before committing a core-extraction story run, in order: `packages/core`
`npm run typecheck`, root `npm run check`, root `npm test` (the import-hygiene
guard already scans `packages/core/src`).

### Zod schemas + JSON Schema emission (US-CE4)

`packages/core/src/schemas/` holds zod validators for the SaveFile, its export
Envelope, and the World IR; `packages/core/schemas/*.schema.json` are their
emitted JSON Schema counterparts. Conventions:

- **Discipline**: exact on envelope keys / top-level `SaveFile` keys / IR section
  headers; permissive (`z.unknown()` / `z.object({}).passthrough()`) on deep
  sub-objects. `SaveFile.version` is a positive int (not a literal) so the schema
  validates the whole migratable fixture range (v1 + v2).
- **Emission runs under `vite-node`**, not `tsx` (tsx isn't a dep; `vite-node`
  ships with vitest). Script: `"schemas": "vite-node scripts/emit-schemas.ts"`.
- **`zod-to-json-schema` is a dev-only dep and must stay out of `src/`** — else the
  root `npm run check` compiles it into core's public surface. Keep the emission
  logic in `scripts/` (`scripts/schema-manifest.ts`), imported by both the CLI
  emitter and the drift-guard test so they can never disagree on options.
- **Drift guard**: a vitest test compares each committed `*.schema.json` against a
  fresh `zodToJsonSchema(...)`. After changing any schema, run `npm run schemas`
  and commit the regenerated JSON, or the guard fails.
- Core vitest suites now run via the root `npm test` (root `vitest.config.ts`
  `include` gained `packages/core/src/**/*.test.ts`; the legacy
  `prolog/tau-engine.test.ts` harness stays excluded by name).
- Golden save fixtures live in `packages/core/conformance/saves/` (copied
  read-only from `insimul-platform/shared/__tests__/fixtures/saves/`).
- **Bridge schema stubs (US-CE7)**: `schemas/grounding.schema.ts` reserves the
  LinguaScrape interchange seam (`groundingPackSchema`,
  `canonicalWorldExportSchema`) — schema-only, no import/export logic. Both are
  registered in `SCHEMA_ENTRIES` so `npm run schemas` emits
  `grounding-pack.schema.json` + `canonical-world-export.schema.json` and the same
  drift guard covers them. `contractVersion` is a `z.literal` of
  `GROUNDING_CONTRACT_VERSION`, so any new bridge shape added here MUST reuse that
  constant (or a stale-version fixture would be silently accepted).

### Conformance corpus (US-CE5)

`packages/core/conformance/` is the language-neutral, data-only cross-engine
parity gate (the future `libinsimul` C harness reads the same JSON). Layout and
gotchas:

- `conformance/prolog/*.json` — golden Prolog cases as `{ area, description,
  cases: [{ name, kb: string[], query, expected: Binding[] }] }`. `expected` is
  the full solution set: `[]` = fails, `[{}]` = succeeds with no bindings, one
  object per solution otherwise. Compared as an **unordered multiset** so a native
  engine may enumerate in any order. Format documented in `conformance/README.md`.
- **The tests live under `src/`, the data under `conformance/`.** The root
  `vitest.config.ts` `include` only matches `packages/core/src/**/*.test.ts`, so
  the runner (`src/conformance/__tests__/*.test.ts`) reads the JSON via a relative
  path up to `conformance/`. Don't put `*.test.ts` under `conformance/` — the root
  gate won't run it.
- **tau-prolog gotchas** (verified while authoring the corpus):
  - `library(lists)` predicates (`member/2`, `length/2`, `nth0/3`, …) need
    `:- use_module(library(lists)).` **in the program**, even though
    `tau-engine.ts` calls `loadLists(pl)` at import — the module is registered
    globally but not loaded into a fresh session without the directive.
  - An anonymous `_` **in the query goal** leaks into `QueryResult.bindings` as
    `{"_":"_"}`. To project one column cleanly, route it through a rule
    (`qa(Q) :- quest(Q,_,_,_,active).`) — `_` inside a **rule body** does not leak.
  - Atoms bind as JSON strings, integers as JSON numbers; quoted atoms
    (`'Find the Sword'`) come back unquoted.
- Migration conformance: `migrateSaveFile` (in `save-file.ts`) walks the
  `save-file-migrations.ts` registry to `SAVE_FILE_VERSION`; the v1 fixture
  exercises both steps (language-progress backfill, snapshot version stamping).
- **Radiant conformance (US-RQ4)**: `conformance/radiant/*.json` pins
  `generateRadiantQuests` — each case is `{ kb, templates, seed, now, maxQuests?,
  expected: { quests } }` and the runner (`src/conformance/__tests__/radiant-corpus.test.ts`)
  feeds `kb ⧺ templates` to the engine. Unlike the Prolog corpus (unordered
  solution *set*), radiant output is a single deterministic pick, so a case pins
  the EXACT quest; `content` / `factsToAssert` / `factsToRetract` are compared as
  sorted sets but the specific giver/item/target IS the contract (seed-driven).
  Regenerate expected values with a `vite-node` dump of the engine, never by hand.
  Format documented in `conformance/README.md` (§ "Radiant case format").
- **Base template pack + loader (US-RQ5)**: a portable `.pl` data file
  (`packages/core/data/radiant/base-templates.pl`) is the canonical, native-readable
  source; because core is browser-safe (no fs), it is mirrored as the string constant
  `BASE_RADIANT_TEMPLATES` in `src/radiant/base-templates.ts` (the
  `HELPER_PREDICATES_PROLOG` convention) with a drift-guard test keeping the two
  byte-identical. The loader seam is `GamePrologEngine.initialize({ radiantTemplates })`:
  a world-layer template pack is **consulted** (like the base rule packs / `narrative_*`
  templates), NOT asserted as a player fact, so it re-loads from the world export every
  session and never lands in a save. Base packs must use only predicate-schema-guaranteed
  predicates (`person`/`occupation`/`settlement`/`settlement_mayor`/`item_category`/
  `business_owner`) so they are world-portable.

### Dependency-direction guard (US-CE6)

`shared/__tests__/import-hygiene.test.ts` now also locks in the core-extraction
invariant with two describe blocks:

- **dependency direction** — scans every `packages/core/src` import specifier
  (comment/string-stripped) and fails if any is `@babylonjs/*`, `react[-dom]`,
  `@shared/*`, a sibling package (`@insimul/babylon*`, `@insimul/typescript`), or
  a relative path that **escapes the `packages/core` package** (into `shared/` or
  another package). Intra-package relatives are fine — a test reaching the
  package's own `scripts/` does not escape.
- **shim hygiene** — every `shared/` file that re-exports from `packages/core/src`
  must stay a thin re-export: each non-blank stripped line either references
  `packages/core/src` or is a bare member-list continuation. A `function`/`const`/
  `class`/`interface`/`=`/`(` in a shim = a re-implemented-in-shared regression.

To keep core `@shared`-free, US-CE6 removed the last pure-type edges two ways:

- **Move the clean module in** (with a shim at the old path) when it is Babylon-free
  and its transitive deps already live in core: `game-genres/types.ts` (→
  `game-engine/ir-types` `GenreConfig`) and the three feature-module type modules
  `feature-modules/{knowledge-acquisition,pattern-recognition,conversation-analytics}/types.ts`
  (→ `language/progress` bridges). These are NOT added to the flat `index.ts`
  barrel — they collide (`CameraMode`/`CombatStyle`/`MasteryLevel`) with modules
  already barrelled — but stay reachable via the shims and deep
  `@insimul/core/<subpath>` imports.
- **Structural stand-in** when the source can't move: `game-engine/types.ts` is a
  ~1.7k-line `@ts-nocheck` Babylon module, so its pure-data subset the IR needs is
  mirrored in `packages/core/src/game-engine/visual-types.ts` (Vec3/Color3/dungeon/
  spawn/need shapes — structurally identical, so Babylon-side values stay assignable
  to the IR). Likewise `AssessmentDimensionScores` (a 5-number interface used only as
  a shallow field) is a local stand-in in `language/progress.ts` rather than dragging
  the editor-layer `assessment/` module into core. Keep stand-ins in sync if the
  Babylon-side shape changes.

## `@insimul/babylon` — the one-package-per-web-engine consolidation (babylon-consolidation)

The web/Babylon side is collapsing into ONE package, `packages/babylon`
(`@insimul/babylon`), organized as `src/{conversation,data,engine,templates}`. Each old
package/dir moves in and leaves **cross-package one-line re-export shims** at its old path
so every existing consumer (the platform's npm deps + tsconfig/vite aliases, the export
pipeline's vendored source paths) keeps resolving unchanged:

- **US-BC1** — `packages/typescript/src` → `src/conversation`; typescript files are shims.
- **US-BC2** — `packages/babylon-game/src` → `src/data`; babylon-game files are shims.
  `packages/babylon-game/OLD_EXPORT_SURFACE.json` snapshots the shimmed surface and the
  import-hygiene guard fails if a shim goes missing / stops being a thin re-export.
- **US-BC3 (done)** — `shared/game-engine` + `shared/voice` → `src/engine/{game-engine,voice}`;
  254+4 one-line shims at the old `@shared/...` paths. `packages/babylon/OLD_ENGINE_EXPORT_SURFACE.json`
  snapshots both roots (`surfaces: [{root, movedTo, paths}]`). The `@babylonjs/*` deps moved
  from the root `package.json` into `packages/babylon`'s. Exports map gained `./engine` +
  `./engine/*` (barrel re-exports `./game-engine`'s curated index; rendering/logic/systems and
  voice are deep-import only).
- **US-BC4 (done)** — export pipeline survives. The shims re-export ACROSS the vendored
  boundary (`../../../packages/babylon/src/...`), so a game that vendors only the old dirs
  (`shared/`, `packages/{typescript,babylon-game}/src`) can no longer resolve them — the
  relative target escapes the vendored tree. Fix (option b): the export's Vite aliases point
  the moved roots DIRECTLY at the consolidated package, vendored at `src/insimul-babylon`
  (see `packages/babylon/templates/vite.config.ts` array-form aliases, moved roots first).
  `test:export-shell` (`scripts/export-shell-smoke.mjs`) proves it: a real `vite build` of a
  fixture mirroring an exported game bundles the WHOLE first-party consolidated graph
  (BabylonGame + engine + data + conversation + core + straggler `shared/`) into a runnable
  bundle, externalizing only third-party leaves (`@babylonjs/*`, react, mlc, sentry) and the
  platform-injected type-only surfaces (`GameQuestManager.d.ts` — impl injected at export).
  **A full standalone `BabylonGame` bundle is NOT achievable in this repo by design** (the
  `.d.ts`-only surfaces + the whole export env are platform-assembled; that's why the golden
  export gate lives platform-side). `SMOKE_BREAK=1` disables the fix to demonstrate the gate
  fails. **A platform follow-up IS required** (the copy step must additionally vendor
  `packages/babylon/src -> src/insimul-babylon`) — recorded verbatim in progress.txt (US-BC4).
- **US-BC5 (done)** — the two-package endgame is guarded + documented. Two new
  `shared/__tests__/import-hygiene.test.ts` describe blocks: (1) **source-location** —
  non-shim source may live only under `packages/{core,babylon}`; a file is a "shim" when
  its stripped body re-exports into `babylon/src/` or `packages/core/src`. Pre-existing
  stragglers are grandfathered in `shared/GRANDFATHERED_SOURCE.json` (79 files); the guard
  fails on a NEW non-shim file under `shared/`/deprecated dirs AND on a stale snapshot
  entry (so the list only shrinks). (2) **import direction** — `@insimul/babylon` may
  import `@insimul/core` + itself among first-party packages, never a deprecated
  passthrough (`@insimul/typescript`, `@insimul/babylon-game`) or a native-engine sibling.
  Both direction/source guards scan SHIPPED source only (exclude `*.test.*`/`__tests__/`) —
  `exports-map.test.ts` deliberately imports the deprecated aliases to prove the shims
  resolve, which is correct and must not trip the direction guard. To keep babylon off its
  own deprecated aliases, US-BC5 rewrote the 3 moved-in files that still imported them
  (`InsimulClientRegistry`, `BabylonGame`, `BabylonChatPanel`) to `@insimul/babylon/{conversation,data}`
  subpaths — pure specifier swap (same physical target via the shim), verified by check+tests.
  README rewritten around the two-package model + quickstart; `CHANGELOG.md` seeded.
  (`@shared/*` self-references inside babylon are fine — `@shared` is the shared tree, not
  a separate npm package; only cross-PACKAGE `@insimul/*` deps are constrained.)

Conventions when moving a tree in:

- **`git mv` the whole subtree** preserving internal structure so intra-tree relative
  imports stay valid and `@shared/*` imports resolve unchanged through the root alias
  (they don't care where the file physically lives). Then write a shim at each OLD
  importable (non-test) path: `export * from '<relative path into
  ../../babylon/src/<area>/...>'` (no default exports exist, so `export *` is complete).
  Tests move WITH the code (no shim); they're not an importable surface.
- **Extend the exports map** in `packages/babylon/package.json` (`./<area>` barrel +
  `./<area>/*` glob), and mirror it in **both** vitest configs' `@insimul/babylon` alias
  (already points at the `src` directory) — the root `tsconfig.check.json`
  `@insimul/babylon/*` path already covers deep subpaths.
- **A barrel `index.ts` per area** is React-free: re-export collision-free runtime
  modules flat, but **namespace** (`export * as foo from './foo'`) modules that share
  symbol names (the optimization/diagnostics toolkits collide on `QualityPreset`,
  `QUALITY_PRESETS`, `estimateMeshBytes`, …), and DON'T re-export React entry points
  (`BabylonWorld`, `LoadingScreen`, the migration modal) — they stay deep-import-only so
  importing the barrel never needs the optional `react` peer. `DataSource` is a type-only
  `interface`; the runtime values are `ApiDataSource`/`FileDataSource`/`createDataSource`.
- **React is an optional peer of `@insimul/babylon`** (`peerDependenciesMeta.react.optional`).
  The scoped `packages/babylon/vitest.config.ts` needs `@shared`, `@insimul/core`, and
  `@insimul/babylon-game` aliases (mirroring the root config) once the moved suites pull them.
- **Guard the surface**: add subpath assertions to
  `packages/babylon/src/__tests__/exports-map.test.ts` and shim-completeness to
  `import-hygiene.test.ts`. Verify a guard actually FAILS on a violation (delete a shim,
  run, restore) — a vacuous guard is worse than none.

Two gotchas learned moving `shared/game-engine` (a subtree with relative escapes, US-BC3):

- **`git mv` preserves INTRA-tree relatives but breaks relatives that ESCAPE the tree.**
  `@shared/*` imports survive (alias, location-independent), but a relative path that
  pointed OUT of the old subtree (`../../narrative/...`, `../../packages/core/src/...`)
  silently resolves to a now-nonexistent path at the new depth. tsc reports these as
  `TS2307 Cannot find module` PLUS a cascade of `TS2305 has no exported member` / implicit-any
  in files that imported the broken types — on a repo that was green on main, **treat every
  new error as a symptom of the move**, not pre-existing debt. Fix by rewriting the escaping
  relatives to aliases: `@shared/<sibling>` for shared/ siblings, `@insimul/core/<path>` for
  the core shims (`babylon → core` is an allowed direction). Detect them with a resolve-check
  script (relative specifier whose target file doesn't exist post-move), not by eyeballing.
- **Moved `*.test.ts` land under a new `include` glob.** The 3 legacy tsx harnesses in
  `game-engine/logic/*.test.ts` (broken `/game-engine/...` absolute imports, no describe/it)
  were excluded by name at their old `shared/` path; after moving under
  `packages/babylon/src/engine/` they matched BOTH the root and the scoped vitest `src/**`
  include globs — re-add the exclude at the NEW path in **both** `vitest.config.ts` files.
### Ensemble → Prolog converter is canonical, not the VESPACE e2e set (US-PC1)

`packages/core/src/prolog/ensemble-converter.ts` is the **canonical** Ensemble →
Prolog path (stable entry surface `convertVolitionRuleFile` / `convertEnsembleAction`,
consumed by the platform `server/migrations/012-import-ensemble-as-prolog.ts` via the
`@shared/prolog/ensemble-converter` shim). The verdict + capabilities table live in
`packages/core/docs/ensemble-converter-decision.md`. The VESPACE e2e converter set
(`insimul-platform/server/__tests__/vespace-rule-generation-e2e/`) is a **separate
research/LLM-baseline harness** with an incompatible output vocabulary (decomposed
`female(X)`/`affinity/3`, compact multi-head rules, a 3-tier action tree) and
platform-only deps — do **not** promote it into core. New source-format converters
(Kismet US-PC3, ToTT US-PC4) follow the legacy converter's preamble + `ConversionResult`
contract, not the e2e vocabulary.

### Ensemble converter completeness contract (US-PC2)

`ensemble-converter.ts` now emits the full rule preamble. Two hard-won details the
Kismet/ToTT converters MUST replicate:

- **`rule_type/2` is a hard requirement** — `content-validators.validateRuleContent`
  rejects any rule prologContent lacking it (a 422 at the save path). The ensemble
  converter emits `rule_type(Name, volition)` by default (these are volition-rule
  files), overridable to `trigger` via the source rule's `type` field. Every source
  converter must emit a `rule_type/2`.
- **`rule_likelihood/2`** is emitted only when the source carries a likelihood, clamped
  to `[0.0, 1.0]` (`normalizeLikelihood`); non-finite values are dropped, not emitted.
- **Category matching is case- AND separator-insensitive** via `normalizeCategory`
  (splits camelCase, folds `_`/`-`/whitespace to a single space, lowercases). Source
  corpora spell multi-word VESPACE categories as `"directed status"` / `"DirectedStatus"`
  / `"directed_status"` interchangeably — normalize before the category `switch`, don't
  compare raw strings.
- **The 1:1 registry rule**: predicates the converter emits must be in
  `predicate-schema.ts`. US-PC2 added `rule_type/2`, `rule_category/2`, `rule_source/2`,
  `rule_effect/2` (the source-format arity; editor `rule-converter.ts` still emits
  `rule_effect/4`) to the `rule` block, and the action-preamble predicates
  (`action_source/2`, `action_difficulty/2`, `action_duration/2`, `action_leads_to/2`,
  `action_accept/1`, `action_reject/1`) to the `action` block. The mass-conversion test
  (`__tests__/ensemble-mass-conversion.test.ts`) validates every emitted ground fact
  against `getCurrentPredicateSchema()`, so an unregistered predicate fails CI.
- **Fixture corpus**: platform `data/ensemble/VESPACE/*.json` is NOT checked out in this
  worktree (the `insimul-platform` submodule dir is empty here), so the VESPACE-style
  seed corpus is hand-authored under `__tests__/fixtures/ensemble/`. When the platform
  submodule IS available, copy real seeds into that dir to widen coverage.

### Kismet direct converter + shared converter-types (US-PC3)

`packages/core/src/prolog/kismet-converter.ts` converts the Kismet social-sim DSL
(a text format, not JSON) to Prolog. Key facts for the ToTT converter (US-PC4) and
anyone touching the three source-format converters:

- **`ConversionResult` now lives in `converter-types.ts`** (shim at
  `shared/prolog/converter-types.ts`). `ensemble-converter.ts` re-exports it
  (`export type { ConversionResult } from './converter-types'`) so the stable
  `@shared/prolog/ensemble-converter` import path (migration-012) is unchanged.
  ToTT should `import type { ConversionResult } from './converter-types'` too.
- **Three dialects, three parse paths**: `trait` / `volition` share
  `parseKismetCondition` + `parseKismetEffect` (explicit-keyword grammar:
  `?A trait X`, `?A net type op n ?B`, `?A wants intent ?B weight n`, …);
  `pattern` uses `parseKismetPatternCondition` + `parseKismetPatternEffect`
  (infix verbs mapped by `KISMET_PATTERN_VERBS` to `relationship`/`directed_status`).
  `rule_type/2` is dialect-driven: `volition` → `volition`, `trait`/`pattern` →
  `trigger`.
- **`?Var → PascalCase`** via `kismetVarToProlog` (`?x → X`, `?best_friend →
  BestFriend`); a leading digit/lowercase result is prefixed `V_`. Negation is
  accepted both leading (`not ?A trait X`) and infix (`?A not trait X`).
- **No new predicates needed** — Kismet emits the same preamble the `rule` block
  already registers (`rule_active/1`, `rule_type/2`, `rule_category/2`,
  `rule_source/2` with value `kismet`, `rule_priority/2`, `rule_likelihood/2`,
  `rule_applies/3`, `rule_effect/2`). `rule_source` VALUES (`ensemble|kismet|tott`)
  are atom args, not separate predicates, so no schema change for a new source.
- **Fixture corpus** is hand-authored under `__tests__/fixtures/kismet/*.kismet`
  (one file per dialect) — the platform client's unified-syntax Kismet test data
  isn't checked out here. Same two gates as ensemble: `kismet-converter.test.ts`
  (per-dialect ?Var + preamble) and `kismet-mass-conversion.test.ts` (zero
  skipped + `validateRuleContent` + `validatePrologFact` vs the registry).

### Talk-of-the-Town direct converter + predicate map (US-PC4)

`packages/core/src/prolog/tott-converter.ts` converts Talk-of-the-Town source
rules to Prolog. Three files share the `tott-` prefix — keep them straight (each
one's header cross-references the other two):

- **`tott-converter.ts`** — the direct source converter (US-PC4).
- **`tott-predicate-map.ts`** — the source-attribute → predicate-kind table
  (`TOTT_PREDICATE_MAP`, `resolveTottKind`) the converter consults. Big-Five
  features → `attribute/3`; `charge`/`spark`/`salience` → `network/4`; social ties
  → `relationship/3`; directed feelings → `directed_status/3`; plus status / mood /
  event / intent. An unmapped attribute is resolved **structurally** by
  `resolveTottKind` (second-actor + numeric ⇒ network; +boolean ⇒ directed_status;
  one-actor numeric ⇒ attribute; boolean ⇒ trait) so no corpus clause is dropped.
- **`tott-predicates.ts`** — the pre-existing *helper predicate library*
  (`getTotTPredicates()`, standing hiring/social/economics/lifecycle rules). NOT a
  converter. Do not confuse it with the two above.

Key facts:

- **Three source shapes, one internal model.** `parseTottFlat` (array of rule
  objects), `parseTottCategorized` (`{category: rule[]}`, rules inherit the key),
  and `parseTottPython` (the `class Name(VolitionRule):` DSL with `def when/then`
  bodies) all normalize to `TottRule`/`TottClause`, then flow through one
  condition/effect emitter. `convertTottSource` auto-detects: a string starting
  with `[`/`{` is JSON, otherwise Python; a non-string array/object routes to
  flat/categorized.
- **`mapTottRuleType`** folds `volition|desire|want|intent` → `volition`, else
  `trigger` (always emits *some* `rule_type/2` — the hard gate). **`mapTottCategory`**
  canonicalizes synonyms (`social`→`socializing`, `romantic`→`romance`,
  `work`→`employment`) then sanitizes to an atom (`general` when absent).
- **Boolean negation is dual-encoded**: a condition negates via an explicit
  `negate` flag (Python `not x.trait(...)`) OR `value: false` (the JSON
  "attribute is absent" form) — `conditionToGoal` treats both as `\+`. On effects,
  `value: false` emits the `remove_`/`remove_directed_status` variant.
- **No new predicates** — same preamble the `rule` block registers; `tott` is a
  `rule_source` atom value. Fixtures hand-authored under `__tests__/fixtures/tott/`
  (`flat.json`, `categorized.json`, `python.tott`, one per shape). Same two gates
  as ensemble/kismet: `tott-converter.test.ts` + `tott-mass-conversion.test.ts`.

### Install gotcha in this workspace

The **workspace-parent worktree** (`.worktrees/<name>/package.json`) lists
`insimul-runtime` and `insimul-runtime/packages/*` as npm workspaces, so `npm
install` run from anywhere hoists deps into the **parent** `node_modules`, and
gates resolve up into it — `insimul-runtime/` has no `node_modules` or lockfile
of its own. When you add a dependency to a `packages/*/package.json`, run `npm
install` at the parent worktree root to pick it up. Declare the dep in the
package's `package.json` (committed to insimul-runtime); do NOT commit the
parent's regenerated `package-lock.json` (workspace-parent, runner-owned).
