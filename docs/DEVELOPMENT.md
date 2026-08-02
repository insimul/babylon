# Development

This is the contributor's guide to building, checking, and testing the packages in this
repository. If you only want to *use* `@insimul/babylon` in a game, the
[README](../README.md) covers installation and usage; you do not need this file.

The repository is an npm workspace with two source packages, `@insimul/core` and
`@insimul/babylon` (plus two deprecated re-export shims — see
[ARCHITECTURE.md](./ARCHITECTURE.md#migrating-from-the-older-package-names)).

## Install

The `@insimul/*` packages resolve from GitHub Packages, so you need an `.npmrc` pointing
the scope at that registry. Copy [`.npmrc.example`](../.npmrc.example) and set a
`GITHUB_TOKEN` with `read:packages` in your environment. Then, from the workspace root:

```bash
npm install
```

Dependencies hoist to the workspace root `node_modules`; the individual packages do not
each carry their own. Run `npm install` from the root, not from inside a package.

## Typecheck

```bash
npm run check          # tsc -p tsconfig.check.json over the whole repo
```

This is the gate that keeps the runtime **self-contained**: it type-checks every package's
source and fails if anything reaches outside the repository. A green run proves the code
builds standalone, with no back-references to an authoring platform.

To prove `@insimul/core` in particular stays engine-agnostic, there is a stricter check
that compiles it in isolation, without the workspace aliases that would let a stray
cross-package import resolve:

```bash
npm run check:core-standalone
```

> **Known type debt.** A couple of files in the Babylon engine carry a temporary in-file
> `// @ts-nocheck` for genuine pre-existing duplicate-interface bugs whose correct fix is a
> deliberate refactor. Draining those is tracked follow-up work — **do not add new
> `@ts-nocheck` directives** to silence errors; fix the type instead.

## Test

```bash
npm test                    # vitest run — the package suites + the guard suite
npm run test:export-shell   # a real `vite build` of a fixture mirroring an exported game
```

`test:export-shell` proves the export pipeline still produces a runnable bundle: it builds
a fixture that vendors the consolidated package and bundles the whole first-party graph
(engine + data + conversation + core), externalizing only third-party leaves.

## Guards

A set of tests in `shared/__tests__/import-hygiene.test.ts` lock in the invariants that
keep the [architecture](./ARCHITECTURE.md) from regressing. They scan source text and fail
CI when a rule is broken, so a violation surfaces as a failing test rather than a silent
erosion:

- **Dependency direction** — `@insimul/core` imports nothing from `@babylonjs/*`, `react`,
  a sibling package, or a path escaping the package; `@insimul/babylon` imports no
  first-party package but `@insimul/core`.
- **Source location** — non-shim source may live only under `packages/{core,babylon}`. A
  new module landing back in a deprecated location fails the guard.
- **Shim completeness** — every deprecated import path must stay a thin re-export shim; the
  guard fails if one stops resolving into `@insimul/babylon`.

When you touch these boundaries, verify a guard actually *fails* on a violation (introduce
one, run, revert). A guard you cannot make fail is not protecting anything.

## Releasing

Publishing and release mechanics — the publish dry-run gate, versioning policy, and the
tagged CI workflow — live in their own documents:

- [`docs/PUBLISHING.md`](./PUBLISHING.md) — the npm publish gate and source-distribution rationale.
- [`docs/RELEASING.md`](./RELEASING.md) — how the web and native package families are cut.
