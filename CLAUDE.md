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
