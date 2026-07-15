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

Before committing a core-extraction story run, in order: `packages/core`
`npm run typecheck`, root `npm run check`, root `npm test` (the import-hygiene
guard already scans `packages/core/src`).
