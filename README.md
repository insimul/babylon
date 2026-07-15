# @insimul/runtime

The Insimul runtime: the engine-agnostic contract, the web/Babylon game runtime, and
the per-engine export templates that ship **inside** games built with the Insimul
platform. It is designed to build, type-check, and test **standalone** — with zero
references back into the authoring platform (`insimul-platform`).

## The two-package model

The runtime is consolidating around **one contract package plus one runtime package per
engine**, so a creator installs exactly one thing for their engine:

| Package | Path | Role |
| --- | --- | --- |
| `@insimul/core` | `packages/core` | **The contract.** Engine-agnostic save-file format, Prolog runtime, World IR, quest/language models, zod schemas + JSON Schema. Imports **no** engine (`@babylonjs/*`), UI (`react`), or DOM libs — so native plugins can consume it without dragging Babylon.js along. |
| `@insimul/babylon` | `packages/babylon` | **The web engine runtime.** Everything a web creator needs, in one package: `./conversation` (LLM/TTS/STT SDK), `./data` (DataSource, save-file persistence, loading UI, `BabylonWorld` React mount), `./engine` (the Babylon renderer, game logic, systems, voice), `./templates` (the Vite/Electron export shell). Depends only on `@insimul/core`. |
| `@insimul/unity` · `@insimul/unreal` · `@insimul/godot` | `packages/{unity,unreal,godot}` | **Native engine plugins.** C#/C++/GDScript SDK + export templates that consume the same `@insimul/core` contract (not TypeScript). |

The arrows point one way: **`@insimul/babylon` → `@insimul/core`, and `@insimul/core` →
nothing.** Two filesystem guards in `shared/__tests__/import-hygiene.test.ts` enforce
this (see [Guards](#guards)).

### Deprecated passthrough packages

Two packages from the pre-consolidation layout are kept **only** as thin re-export
shims so existing installs keep resolving. **Do not add them to new projects** —
install `@insimul/babylon` and import the subpath instead:

| Deprecated package | Install this instead | Import this instead |
| --- | --- | --- |
| `@insimul/typescript` | `@insimul/babylon` | `@insimul/babylon/conversation` |
| `@insimul/babylon-game` | `@insimul/babylon` | `@insimul/babylon/data` |

Every old import path (`@insimul/typescript/*`, `@insimul/babylon-game/*`, and the
`@shared/game-engine/*` / `@shared/voice/*` module paths) still resolves through a
one-line re-export shim, snapshotted and guarded so a shim can never silently go
missing. See the [shim / deprecation timeline](#shim--deprecation-timeline).

## Quickstart — plug Insimul into your existing web game

Install the one package:

```bash
npm install @insimul/babylon
```

**Option A — mount a full Insimul world (React).** `BabylonWorld` is the whole game
surface (rendering + quests + save persistence) as one component:

```tsx
import { BabylonWorld } from '@insimul/babylon/data/BabylonWorld';

export function Game() {
  return (
    <BabylonWorld
      worldId="my-world"
      worldName="My World"
      token={null}              // null = standalone/offline (no server auth)
      assetMounts={[]}          // asset bundles the game loads
      onBack={() => history.back()}
    />
  );
}
```

`react` is an **optional peer dependency** — only the React entry points
(`BabylonWorld`, `LoadingScreen`, the save-migration modal) need it. Importing
`@insimul/babylon/data` (the DataSource / save-file barrel) or
`@insimul/babylon/conversation` never pulls React in.

**Option B — use the conversation SDK standalone.** Drop Insimul NPC conversations
(pluggable LLM / TTS / STT providers, server or fully in-browser) into any game loop —
no Babylon, no React:

```ts
import { InsimulClient } from '@insimul/babylon/conversation';

const client = new InsimulClient({ chat: 'browser', tts: 'browser', stt: 'none' });
client.on({ onTextChunk: (text, isFinal) => render(text, isFinal) });
client.setCharacter(npcId, worldId);
await client.sendText('Hello!');
```

**Option C — read/write save files against the contract.** For tooling or a native
engine, depend on `@insimul/core` directly (the engine-agnostic save-file format,
Prolog runtime, and World IR with emitted JSON Schemas):

```ts
import { migrateSaveFile, SAVE_FILE_VERSION } from '@insimul/core';
```

## Development

Install dependencies (workspace-hoisted; `@insimul/*` scoped packages come from
GitHub Packages — see `.npmrc.example`):

```bash
npm install
```

> **Workspace install gotcha.** The npm workspace root is the **parent** directory (it
> lists `insimul-runtime` and `insimul-runtime/packages/*` as workspaces), so deps hoist
> to the parent `node_modules` and `insimul-runtime/` has no `node_modules` or lockfile
> of its own. Run `npm install` from the parent, never inside `insimul-runtime` (a nested
> install creates a rogue partial `node_modules` and typecheck fails with bogus
> "Cannot find module"). See `scripts/ralph/progress.txt` → Codebase Patterns.

### Type-check the whole repo standalone

```bash
npm run check
```

Runs `tsc --noEmit` against `tsconfig.check.json`, which covers `shared/` plus the TS
packages' `src/` with the `@shared/* -> ./shared/*` and `@insimul/*` aliases the
platform uses. It is the gate that keeps the runtime self-contained: every
`@shared/...` import must resolve to a file **in this repo** (no back-references into
`insimul-platform`).

Engine template trees (`packages/{unity,unreal,godot}/templates` and the C#/C++/GDScript
sources) are excluded — not TypeScript. The Babylon export templates
(`packages/babylon/templates`) are also excluded: they use aliases that only resolve
inside a *generated* game project (see `test:export-shell` below).

> **Known type debt.** Two files (`packages/babylon/src/engine/game-engine/types.ts`,
> `.../ir-types.ts`) carry a temporary in-file `// @ts-nocheck` for genuine pre-existing
> duplicate-interface bugs whose correct fix is a deliberate refactor with runtime-behavior
> risk. Draining those — and resolving the `GameQuestManager` type-only surface (its impl
> is injected platform-side at export) — is tracked follow-up. Do **not** add new
> `@ts-nocheck` directives.

### Run the tests

```bash
npm test              # vitest run — package suites + the import-hygiene / guard suite
npm run test:export-shell   # real `vite build` of a fixture mirroring an exported game
```

`test:export-shell` proves the export pipeline survives the consolidation: it builds a
fixture that vendors the consolidated package at `src/insimul-babylon` and bundles the
whole first-party graph (`BabylonGame` + engine + data + conversation + core) under the
new-layout Vite aliases. A full standalone `BabylonGame` boot is **not** achievable in
this repo by design — the export environment (`.d.ts`-only surfaces like
`GameQuestManager`, generated sentry/mlc stubs) is platform-assembled; that end-to-end
check lives in the platform golden-export gate.

### Guards

`shared/__tests__/import-hygiene.test.ts` locks in the invariants that keep the
consolidation from regressing:

- **`@shared` self-containment** — every `@shared/...` import resolves to a file in this
  repo; nothing imports the platform-only `@shared/schema`.
- **Dependency direction** — `@insimul/core` imports nothing from `@babylonjs/*`,
  `react`, `@shared/*`, or a sibling package; `@insimul/babylon` imports **no first-party
  package but `@insimul/core`** (its own subpaths and `@shared/*` aside), never a
  deprecated passthrough or a native-engine sibling.
- **Source location** — non-shim source may live **only** under
  `packages/{core,babylon}`. A new module landing back in `shared/` or a deprecated
  package fails the guard; the pre-existing straggler domain files are grandfathered in
  `shared/GRANDFATHERED_SOURCE.json`, a list that may only shrink.
- **Shim completeness** — the moved surfaces are snapshotted
  (`packages/babylon-game/OLD_EXPORT_SURFACE.json`,
  `packages/babylon/OLD_ENGINE_EXPORT_SURFACE.json`); the guard fails if any old
  importable path stops being a thin re-export shim.

## Shim / deprecation timeline

1. **Now (consolidated, shims live).** `@insimul/babylon` is the one web-runtime package.
   `@insimul/typescript` and `@insimul/babylon-game` still publish as 100% re-export
   shims; `@shared/game-engine/*` and `@shared/voice/*` module paths still resolve
   through shims. Nothing an existing consumer imports breaks.
2. **Deprecation surfaced.** The deprecated packages are published with an `npm deprecate`
   notice pointing at the `@insimul/babylon` subpath. New code should import
   `@insimul/babylon` only.
3. **Straggler extraction (future).** The engine-agnostic game/domain layer still under
   `shared/` (language-learning, assessment, quest, narrative, onboarding, procedural,
   telemetry — see `shared/GRANDFATHERED_SOURCE.json`) moves into `@insimul/core` (or a
   future domain package), shrinking the grandfathered list toward zero.
4. **Shim removal (major version).** Once no consumer imports the old paths, the shims
   and the deprecated `@insimul/{typescript,babylon-game}` packages are dropped in a
   major release — leaving the clean two-package (`@insimul/core` + `@insimul/babylon`)
   model.

See `CHANGELOG.md` for the release-by-release record and
`docs/PLATFORM_SPLIT_AND_ENGINE_PLUGINS.md` §A1.5 for the master plan.
