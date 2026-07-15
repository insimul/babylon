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

### Install gotcha in this workspace

The **workspace-parent worktree** (`.worktrees/<name>/package.json`) lists
`insimul-runtime` and `insimul-runtime/packages/*` as npm workspaces, so `npm
install` run from anywhere hoists deps into the **parent** `node_modules`, and
gates resolve up into it — `insimul-runtime/` has no `node_modules` or lockfile
of its own. When you add a dependency to a `packages/*/package.json`, run `npm
install` at the parent worktree root to pick it up. Declare the dep in the
package's `package.json` (committed to insimul-runtime); do NOT commit the
parent's regenerated `package-lock.json` (workspace-parent, runner-owned).
