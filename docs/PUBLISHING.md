# Publishing the npm packages

This file covers the **TypeScript/web** packages. The native engine packages
(`unity` / `unreal` / `godot`) target different ecosystem registries and have their
own process — see [`RELEASING.md`](./RELEASING.md).

| Package | Path | Role |
| --- | --- | --- |
| `@insimul/core` | `packages/core` | The engine-agnostic contract. |
| `@insimul/babylon` | `packages/babylon` | The consolidated web/Babylon runtime. |
| `@insimul/typescript` | `packages/typescript` | **Deprecated** passthrough → `@insimul/babylon/conversation`. |
| `@insimul/babylon-game` | `packages/babylon-game` | **Deprecated** passthrough → `@insimul/babylon/data`. |

## ⚠️ Access is `restricted`, on purpose

Every package pins `publishConfig.access: "restricted"` (and
`publishConfig.registry: "https://npm.pkg.github.com"`). **Do not flip a package to
`public`** until the repository-hygiene work has landed:

- a **git history audit** — the published tarball is only half the story; a public
  repo/package exposes every prior commit, and the history has not yet been reviewed
  for credentials, private world content, or licensed corpora;
- a **third-party purge** — vendored/derived third-party content still needs to be
  inventoried and either removed, replaced, or attributed under a compatible license.

Until both are done, these packages are private-by-default artifacts for the Insimul
org on GitHub Packages. The publish gate (below) **fails** if a manifest sets
anything other than `restricted`, so the flip has to be a deliberate, reviewed edit.

## What ships

These packages are **source-distributed**: `main`, `module`, and `types` all point at
`src/index.ts`, and there is no prebuilt `dist/`. That is deliberate, not an omission:

- the platform's game-export pipeline **vendors `packages/babylon/src` directly** into
  each generated game (`src/insimul-babylon`) and builds it with the game's own Vite
  config — a prebuilt bundle would be dead weight there;
- `@insimul/babylon` imports `@shared/*` alias paths that only a bundler/tsconfig
  resolves, so a plain `tsc` emit would produce unresolvable specifiers;
- consumers are all bundler-based (Vite/webpack) or TypeScript-native, so they compile
  the source anyway — and get real types instead of generated `.d.ts` approximations.

Consequently the "built entry + types" for these packages **is** the TypeScript entry.
What the allow-lists (`files` in each `package.json`) exclude is the bloat:

- every test file and `__tests__/` directory,
- `conformance/` — the cross-engine parity corpus (test fixtures, ~176 kB),
- `scripts/` (dev tooling), `docs/`, and the guard snapshots
  (`OLD_*_EXPORT_SURFACE.json`).

The two **deprecated passthroughs** ship only their shim tree (`src/**`, no tests) plus
`README.md` and `LICENSE` — ~20–25 kB each. See "The deprecated passthroughs" below.

`@insimul/core` additionally ships the language-neutral contract artifacts a
non-TypeScript consumer reads directly — `schemas/*.schema.json` (emitted JSON
Schema), `openapi/` (the v1 REST contract), and `data/radiant/base-templates.pl`.
`@insimul/babylon` additionally ships `templates/` (the export shell).

Every package ships `README.md` and `LICENSE` (Apache-2.0).

## The publish gate

```bash
npm run publish:dry-run
```

`scripts/release/npm-publish-dry-run.mjs` runs `npm publish --dry-run --json` in each
package and asserts, per package:

- the manifest has a version, `license`, `repository`, a pinned
  `publishConfig.registry`, and `publishConfig.access === "restricted"`;
- the tarball contains `README.md`, `LICENSE`, the package entry, and **every
  concrete target its `exports` map advertises**;
- the tarball contains **no** test file, `__tests__/` directory, `conformance/`
  corpus, `scripts/` tooling, `node_modules/`, vitest config, or guard snapshot.

The `PACKAGES` table at the top of the script is the coverage list; it covers all
four web packages. Entries marked `deprecated: true` get the extra passthrough
assertions described below.

`--dry-run` stops before the registry write, so this never publishes anything and is
safe to run in CI on every push. It requires no registry credentials (npm prints a
"requires you to be logged in" warning and proceeds).

## The deprecated passthroughs

`@insimul/typescript` and `@insimul/babylon-game` are kept publishable so existing
installs keep resolving after the US-BC consolidation. They have two jobs — **say
they're deprecated**, and **still work** — and the gate checks both.

**Saying it.** Deprecation is stated in three places, because consumers meet the
package in three ways:

| Where | What | Who sees it |
| --- | --- | --- |
| `package.json` `description` | Starts with `DEPRECATED passthrough — …` | `npm view`, search results, the package page |
| `package.json` `deprecated` | Full message naming `@insimul/babylon` | Tooling that reads the manifest / the tarball |
| `README.md` | A blockquote banner + a per-path migration table | Anyone opening the package page |

The **registry-side** deprecation flag — the one that makes `npm install` print a
warning — is *not* a manifest field npm sets for you. It is a separate, explicit CLI
call made **after** publishing each version:

```bash
npm deprecate '@insimul/typescript@<version>' \
  "@insimul/typescript is deprecated — install @insimul/babylon (subpath ./conversation) instead."
npm deprecate '@insimul/babylon-game@<version>' \
  "@insimul/babylon-game is deprecated — install @insimul/babylon (subpath ./data) instead."
```

Use the manifest's own `deprecated` string as the message so the two never diverge.

**Still working.** Each passthrough declares `@insimul/babylon` as a real
`dependency`, so installing the old name pulls in the implementation. The shims
themselves re-export through **relative** paths (`../../babylon/src/…`) rather than the
`@insimul/babylon` specifier — that form is what lets the platform's export pipeline
vendor the trees (see the US-BC4 notes in `CLAUDE.md`), and it survives installation
because npm lays scoped packages out as siblings: from the installed package root,
`../babylon/src/x` is `node_modules/@insimul/babylon/src/x`, mirroring the repo's
`packages/babylon/src/x` exactly.

The gate encodes that invariant. For every shim in the tarball it resolves each
relative specifier against the package root and fails unless the result lands under
`../babylon/src/` **and** names a file `@insimul/babylon` actually ships. So deleting
or renaming a module in `@insimul/babylon`, or dropping it from that package's
`files` allow-list, breaks the publish gate rather than a consumer's install. Runtime
resolution of the same shims is covered by
`packages/babylon/src/__tests__/exports-map.test.ts`.

## Versioning

The four web packages are **independently versioned** — `@insimul/babylon` moves when
the runtime changes, the passthroughs only when a shim surface does — so their versions
diverge on purpose. [`VERSIONS.json`](../VERSIONS.json) is the single source of truth: a
`web` block pins each package's version, and the release preflight fails if a manifest
disagrees with it. (The native engine packages use the same file; see
[`RELEASING.md`](./RELEASING.md).)

To bump a package: edit its `VERSIONS.json` `web` entry, sync `package.json`
`version`, and add a `CHANGELOG.md` entry. Semver applies normally, with one
consolidation-specific rule: **dropping a shim** from a deprecated passthrough (or
removing a passthrough package) is a **major** bump — that is the step-4 "shim removal"
milestone in the root README's timeline, not a patch.

A release is cut by tagging: `web-v<train>`, where the train is the release date —
e.g. `web-v2026.07.22`. The tag names the *release train*, not a version; the release
publishes whichever per-package versions are not yet on the registry, so re-running a
tag is idempotent and a train that only bumps one package publishes only that one.

## The release workflow

```bash
npm run release:dry-run          # rehearse the whole release; publishes nothing
```

`scripts/release/publish-web-packages.mjs` is the release orchestrator, and
[`.github/workflows/release-web-packages.yml`](../.github/workflows/release-web-packages.yml)
is the tag-triggered CI job that runs it. Both run the same four steps in the same
order, so the dry-run is a real rehearsal:

| Step | What | Fails on |
| --- | --- | --- |
| 1. preflight | manifest versions vs `VERSIONS.json` `web`; `access: restricted`; the tag is a `web-v*` tag pointing at HEAD; clean worktree | a version drift, a `public` flip, an untagged or dirty checkout |
| 2. gate | `npm run publish:dry-run` (tarball contents, above) | missing entry/README/LICENSE, leaked tests, a broken passthrough shim |
| 3. publish | `npm publish` per package, skipping versions already on the registry | a registry error |
| 4. deprecate | `npm deprecate` per passthrough, using the manifest's own message | a registry error |

In dry-run mode steps 3–4 are **printed, not run** (`would run npm publish …`), so you
can read the exact plan before authorizing it.

### Why this cannot publish by accident

Publishing is outward and irreversible, so the real publish path takes **three
independent opt-ins**, none of them a default:

1. the workflow's `publish` job requires the repository variable
   `INSIMUL_PUBLISH_ENABLED` to be exactly `"true"` — unset (the current state) means
   every tag and every manual run is a rehearsal;
2. that job runs in the `npm-release` GitHub environment, so it waits on that
   environment's reviewers;
3. the script itself publishes only with `--execute` **and** `INSIMUL_PUBLISH=1` in the
   environment — a stray `--execute` alone exits non-zero.

`shared/__tests__/release-workflow.test.ts` parses the workflow and fails if any step
that can reach the registry loses one of those guards, or if the verify job stops
running a gate.

## Actually publishing

Publishing is a **deliberate human/CI step** and is never triggered by this repo's task
tooling. Preconditions:

1. a clean checkout tagged `web-v<train>` (see "Versioning" above),
2. `GITHUB_TOKEN` with `write:packages` (see `.npmrc.example`),
3. a green `npm run check`, `npm test`, `npm run test:export-shell`,
   `npm run publish:dry-run`, and `npm run release:dry-run`,
4. the hygiene gate above still being satisfied (i.e. `access: restricted`),
5. `INSIMUL_PUBLISH_ENABLED=true` set as a repository variable and a reviewer on the
   `npm-release` environment ready to approve.

Then push the tag and approve the `publish` job. To release from a workstation
instead:

```bash
GITHUB_TOKEN=… INSIMUL_PUBLISH=1 \
  node scripts/release/publish-web-packages.mjs --execute --tag web-v2026.07.22
```

Step 4 of the orchestrator issues the `npm deprecate` call for each passthrough version
right after its publish (see "The deprecated passthroughs" above) — publishing alone
does **not** set the registry deprecation flag.

**Going public is still blocked.** Everything above releases *restricted* packages to
the Insimul org. The flip to `public` awaits the git-history audit and the third-party
purge described at the top of this file; until then the publish gate fails on any
manifest that is not `restricted`, in the release path as well as in CI.
