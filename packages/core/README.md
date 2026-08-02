# @insimul/core

The **engine-agnostic Insimul contract**. This package holds the parts of the
runtime that native engine plugins (Unreal/Unity/Godot) must be able to consume
**without** pulling in Babylon.js, React, or any DOM API:

- the **save-file** format, its envelope/export helpers, and migrations
- **world types** and world-snapshot versioning
- the **playthrough overview** DTO
- the Prolog toolchain, IR types, quest types, and the `IDataSource` interface
- the **shared runtime** — `src/game-engine/logic/`, ~18k lines of quest
  completion, dialogue, inventory/containers, crafting/farming/mining/herbalism,
  volition, truth sync, save-conflict resolution and the rest of what it takes to
  *run* a world (see [The shared runtime](#the-shared-runtime-srcgame-enginelogic))

## Why this exists

`shared/` historically mixed this contract with the Babylon implementation.
Carving the contract into `@insimul/core` lets native engines depend on the
save/quest/Prolog surface alone. See
`docs/PLATFORM_SPLIT_AND_ENGINE_PLUGINS.md` (Part 1 §1.3, Part 2 §A1).

## Import paths keep working

Every module here is re-exported from its historical `shared/<name>` path via a
one-line shim, so existing `@shared/*` imports and the Babylon export pipeline
resolve unchanged. New code should prefer `@insimul/core`.

## The one-way rule

**Runtimes depend on core. Core never depends on a runtime.**

Every dependency arrow points *into* this package. `@insimul/babylon` imports
`@insimul/core`; the reverse is a bug, and so is the sneakier version of it — an
`@shared/...` import whose one-line shim re-exports into `packages/babylon/src`.
That specifier names no Babylon package anywhere, but it *is* the Babylon runtime.

Concretely, nothing under `packages/core` may import:

- `@babylonjs/*`, `react` / `react-dom`, or any DOM API
- `@insimul/babylon`, `@insimul/babylon-game`, `@insimul/typescript`
- `@shared/*` — including a shim that resolves into the Babylon runtime
- a relative path that escapes the package

When core needs something a host engine owns, that is an **interface core
defines and the adapter implements** — never a re-export from the runtime back
into core. (A re-export would satisfy the compiler and defeat the whole split.)

Three independent mechanisms hold the line:

| Mechanism | What it catches |
| --- | --- |
| `shared/__tests__/import-hygiene.test.ts` | Any import under `packages/core` (including `scripts/`, not just `src/`) that reaches the Babylon runtime — reported as `file:line`, with the shim-resolution case covered. |
| `npm run check:core-standalone` (repo root) | That core still typechecks *and* tests with cwd = `packages/core`, i.e. in isolation. A green repo-wide run proves nothing here: it supplies the `@shared/*` and `@insimul/*` aliases core must not need. Coverage may grow, never shrink (`STANDALONE_BASELINE.json`). |
| `tsconfig.json` | No `dom` lib and **no `@shared/*` path mapping**, so a stray `@shared/...` import fails the standalone typecheck too. |

This matters more than it looks: `@insimul/core` is destined for its own
repository, and every one of these violations converts that extraction from a
file move into a rewrite. `shared/SHIM_INVENTORY.json` records which `@shared/*`
aliases follow core out and which stay with the runtime.

## `@insimul/core` vs. `insimul-native` — two layers, confusingly similar names

They are **not** the same layer, and neither contains the other:

| | `@insimul/core` (this package) | `insimul-native` / `libinsimul` |
| --- | --- | --- |
| What | The engine-agnostic **contract and shared runtime** — save format, world/IR types, quest and Prolog *toolchain*, and (in progress) the shared runtime systems every engine would otherwise reimplement. | The **C Prolog substrate**: a C-ABI native library (`include/insimul.h`, `libinsimul.a`) that *executes* Prolog. |
| Language | TypeScript, source-distributed | C, with a C ABI |
| Repo | this one (`packages/core`), extraction pending | sibling checkout `../insimul-native` |
| Consumed by | every engine adapter — Babylon, Unity, Unreal, Godot | the native engine wrappers (Unity P/Invoke, an Unreal ThirdParty module, a Godot GDExtension) |
| Relationship | defines *what* is true of a world | the engine that *evaluates* it — including in the browser, which runs its wasm32 build (tasklist 91) |

Rule of thumb: if it is a **type, schema, or rule the whole system agrees on**,
it belongs here. If it **runs Prolog**, it is the native substrate.

## The shared runtime (`src/game-engine/logic/`)

Everything above is the *contract*. This directory is the **implementation of it
that every engine would otherwise write four times** — 59 modules moved out of
the Babylon package by US-3 of `93-runtime-logic-to-core`, unchanged except for
their import paths.

Where the line falls:

| | lives in | why |
| --- | --- | --- |
| `game-engine/logic/` | **here** | Quest completion, dialogue/conversation bridging, inventory + containers, crafting/farming/fishing/mining/herbalism, volition, relationships/romance, game time, truth sync, save-conflict resolution, notifications, onboarding. No scene graph, no browser. |
| `game-engine/rendering/` | `@insimul/babylon` | One platform's adapter — meshes, GUI, input, cameras. Every engine writes its own. |

Three logic modules stayed behind on purpose, and they are named, not hidden:
`ActionHotspotIntegration` and `WorldObjectActionManager` are Babylon adapter
glue by purpose, and `StreetNetworkLayout` depends on the duplicate-shape
`StreetNode`/`StreetNetwork` interfaces still quarantined under `@ts-nocheck` in
the Babylon `types.ts` (it is also street *geometry*, which stays per-engine).
Seven more are reachable but need an inverted interface first — a debug/telemetry
sink, a persistence lifecycle hook, a harvestable-resource query. The full
classification, with the specific coupling for each, is
[`docs/logic-boundary-classification.md`](./docs/logic-boundary-classification.md)
and its machine-generated ground truth `shared/LOGIC_BOUNDARY.json`.

These modules are **not** re-exported from the flat `src/index.ts` barrel — 59
runtime systems collide on common names (`Action`, `GameEvent`, `ItemCategory`, …).
Import them by subpath: `@insimul/core/game-engine/logic/QuestCompletionEngine`.
The Babylon package reaches them through one-line re-export shims left at the old
`game-engine/logic/*` paths, so `@shared/*` consumers and the export pipeline
resolve unchanged.

## Writing an engine adapter

[`docs/runtime-contract.md`](./docs/runtime-contract.md) is the document to read
before starting a Unity, Unreal or Godot adapter. It states what core provides
(all 59 runtime modules, grouped by capability), what the adapter must provide
back, what is deliberately out of scope, and what still blocks a genuinely
shared four-way runtime.

Two interface files hold the seam, and they run in opposite directions:

| file | who implements | what it declares |
| --- | --- | --- |
| `src/game-engine/system-contracts.ts` | the engine, for itself | The nine systems each engine **ports** from the Babylon reference — combat, rules, quest, inventory, crafting, resources, survival, dialogue, actions. |
| `src/game-engine/host-contracts.ts` | the engine, **for core** | The five hooks the shared runtime calls back into its host — `IDebugSink`, `IHostLifecycle`, `ISpeechSynthesizer`, `IResourceStore`, `ICombatStatSink`. Persistence is the older `IDataSource` in `game-engine/data-source.ts`. |

Both are subpath-only imports (`@insimul/core/game-engine/host-contracts`), for
the same name-collision reason as the runtime modules. The host hooks are
declared but **not yet wired**: the seven modules that need them are still in
`packages/babylon` (§2.1 of the contract explains why, and what an adapter gets
in the meantime). A drift guard —
`src/game-engine/__tests__/runtime-contract.test.ts` — fails if a runtime module
or a host hook is missing from the document.

The engine-agnostic type subset those modules need lives in
`src/game-engine/runtime-types.ts`: 52 declarations lifted out of the Babylon
`types.ts` as a real, **checked** module. The `@ts-nocheck` on the Babylon file
was deliberately left behind — core's entire value is that it typechecks
standalone.

## Transport schemas (`src/schemas/`)

Zod schemas validate the three transport shapes at trust boundaries
(import/upload/export):

- `saveFileSchema` — the v2 `SaveFile` (validates the whole migratable range,
  including v1/v2 golden fixtures)
- `saveEnvelopeSchema` — the `insimul-save-v2` export envelope (strict `format`
  literal + integrity digest; cryptographic verification stays in
  `validateSaveFileEnvelope`)
- `worldIrSchema` — the World IR

They are **exact on the envelope/top-level `SaveFile` keys and the IR section
headers**, and permissive (`z.unknown()` / passthrough) on deep sub-objects,
tightened incrementally.

`npm run schemas` regenerates the JSON Schema counterparts in
`schemas/*.schema.json` from these zod definitions (via `zod-to-json-schema`).
The committed JSON is drift-guarded — a test in
`src/schemas/__tests__/schemas.test.ts` fails if regeneration would produce a
diff, so **run `npm run schemas` and commit the result** after changing any
schema. The emission logic is shared between the CLI and the guard in
`scripts/schema-manifest.ts`.

Golden save fixtures for the schema tests live in `conformance/saves/`.

## Scripts

- `npm run typecheck` — standalone `tsc --noEmit`
- `npm test` — `vitest run`
- `npm run schemas` — regenerate `schemas/*.schema.json` from the zod schemas

From the repo root:

- `npm run check:core-standalone` — typecheck + test this package in isolation
  against `STANDALONE_BASELINE.json` (see [The one-way rule](#the-one-way-rule))
- `npm run shims:inventory` — regenerate `shared/SHIM_INVENTORY.json`

## What ships in the tarball

TypeScript **source** (`src/`, minus `__tests__`/`*.test.ts`) plus the
language-neutral contract artifacts a non-TypeScript consumer reads directly:

| Shipped | Why |
| --- | --- |
| `src/**` | The contract itself. Source-distributed — consumers build it with their own bundler/compiler, so there is no prebuilt `dist/`. `main`/`types` both point at `src/index.ts`. |
| `schemas/*.schema.json` | Emitted JSON Schema for the save file, envelope, World IR, content library, and bridge shapes — validate Insimul data from any language. |
| `openapi/` | The v1 REST contract (`insimul-v1.yaml` + the generated `operations.json`) mirrored by `src/editor/operations.ts`. |
| `data/radiant/base-templates.pl` | The canonical, natively-readable radiant template pack (mirrored as a string constant in `src/radiant/base-templates.ts`). |
| `README.md`, `LICENSE` | — |

Deliberately **excluded**: `conformance/` (the cross-engine parity corpus — a test
fixture set, not a runtime artifact), `scripts/` (dev tooling), `docs/`, and every
test file.

See [`docs/PUBLISHING.md`](../../docs/PUBLISHING.md) for the release process.

Licensed under [Apache-2.0](./LICENSE).
