# Architecture: how this repository is put together

This repository is a small monorepo, and almost everything about how it is organized
follows from a single decision: **the rules of a world and the code that renders it are
kept in separate packages.** A world's quests, dialogue, inventory, and save format
should not know or care whether it is drawn by Babylon.js in a browser or by a native
engine on a console. This document explains that split, the one rule that protects it,
and the pieces that fall out of it.

If you only want to *use* the library, the [README](../README.md) and the per-package
READMEs are enough — you do not need this file. Read it if you are contributing, writing
an engine adapter, or just curious why the code is laid out the way it is.

## Two packages, one direction

| Package | Path | What it is |
| --- | --- | --- |
| **`@insimul/core`** | [`packages/core`](../packages/core) | The **engine-agnostic contract and shared runtime**: the save-file format and its migrations, the World types, the Prolog toolchain, and the ~59 runtime systems (quest completion, dialogue, inventory, crafting, relationships, game time, truth sync…) that make a world *run*. It imports **no** engine (`@babylonjs/*`), UI (`react`), or DOM library, so a non-web engine can consume it as-is. |
| **`@insimul/babylon`** | [`packages/babylon`](../packages/babylon) | The **web runtime**: everything a browser game needs, in one package — the conversation SDK, the save/data/loading layer, the Babylon.js renderer, and the export templates. It depends on **`@insimul/core` and nothing else** first-party. |

The dependency arrow points one way and only one way:

```
@insimul/babylon  ─────▶  @insimul/core  ─────▶  (nothing first-party)
```

`@insimul/babylon` imports `@insimul/core`; **core never imports a runtime.** The reverse
would be a bug — and so would the sneakier version of it, where a module in core reaches
back into the Babylon package through an indirect import. Concretely, nothing under
`packages/core` may import `@babylonjs/*`, `react`/`react-dom`, any DOM API, a sibling
runtime package, or a relative path that escapes the package.

Why so strict? Because the whole value of core is that it is **portable**. When core needs
something only a host engine can provide — a way to speak audio, a place to store
resources — that is expressed as an *interface core defines and the host implements*, never
as a call back into a specific engine. Three independent guards enforce the direction so it
cannot quietly erode; see [DEVELOPMENT.md](./DEVELOPMENT.md#guards).

## One world engine, everywhere

The reason the split is worth the trouble is **determinism across platforms**. A world's
canonical state lives in a Prolog knowledge base, and game logic *queries* that knowledge
base rather than hardcoding rules. For that to mean anything, every platform has to reason
about a world identically.

So there is exactly one Prolog engine in the system: **libinsimul (Trealla), compiled to
`wasm32`** — the same engine source the native engines and the server run. The web runtime
does not ship its own interpreter; it runs that wasm build in the browser. The wasm artifact
is committed and ships inside `@insimul/core`, so a game builds with no native toolchain in
sight. A world that answers a quest one way on the web answers it the same way everywhere.

(The behavioural details of that shared engine — what a caller could observe versus an
older interpreter — are catalogued in `packages/core/docs/tau-wasm-parity.md`.)

## The shared runtime lives in core

It would be easy to assume `@insimul/core` is "just types and schemas." It is more than
that: it also holds the **implementation** of the systems every engine would otherwise
rewrite from scratch — quest completion, dialogue bridging, inventory and containers,
crafting/farming/fishing/mining, relationships, game time, save-conflict resolution, and
more, under `packages/core/src/game-engine/logic/`.

What stays out of core is what is genuinely per-engine: the **renderer** (`rendering/` —
meshes, cameras, input, GUI) lives in `@insimul/babylon`, because every engine draws a
world its own way. The dividing line, module by module, is documented in
[`packages/core/docs/logic-boundary-classification.md`](../packages/core/docs/logic-boundary-classification.md)
and in [`packages/core/README.md`](../packages/core/README.md). If you are writing a Unity,
Unreal, or Godot adapter, the document to read is
[`packages/core/docs/runtime-contract.md`](../packages/core/docs/runtime-contract.md).

## The entry points of `@insimul/babylon`

The web package is organized as four subpaths, each installable from the one package:

| Subpath | What it gives you |
| --- | --- |
| `@insimul/babylon/conversation` | The conversation SDK — `InsimulClient` plus pluggable chat (LLM), TTS, and STT providers (server, in-browser, or local). No Babylon, no React. |
| `@insimul/babylon/data` | The save/data/loading layer — `DataSource`, `SaveFileDataSource`, `WorldStateManager`, `SaveQueue`, loading/optimization UI, and the `BabylonWorld` React mount. |
| `@insimul/babylon/engine` | The Babylon.js renderer, game logic, systems, and voice. |
| `@insimul/babylon/templates` | The Vite/Electron export-shell templates used when a game is packaged for distribution. |

`react` is an **optional peer dependency**. Only the React entry points (`BabylonWorld`,
`LoadingScreen`, the save-migration modal) need it, and those are deep-import only — so
importing a barrel like `@insimul/babylon/conversation` never pulls React in. The in-browser
LLM provider similarly needs `@mlc-ai/web-llm` only if you use it.

## Migrating from the older package names

The web runtime used to be several packages. They were consolidated into `@insimul/babylon`,
and the old names still publish as **100% re-export shims** so existing installs keep
resolving unchanged. **Do not add them to new projects** — install `@insimul/babylon` and
import the subpath instead:

| Deprecated package | Install instead | Import instead |
| --- | --- | --- |
| `@insimul/typescript` | `@insimul/babylon` | `@insimul/babylon/conversation` |
| `@insimul/babylon-game` | `@insimul/babylon` | `@insimul/babylon/data` |

The removal path is deliberately gentle:

1. **Now** — `@insimul/babylon` is the one web-runtime package; the deprecated names still
   publish as thin re-export shims, so nothing an existing consumer imports breaks.
2. **Deprecation surfaced** — the old packages carry an `npm deprecate` notice pointing at
   the `@insimul/babylon` subpath. New code should import `@insimul/babylon` only.
3. **Shim removal** — once no consumer imports the old paths, the shims and the deprecated
   packages are dropped in a future major release, leaving the clean two-package model.

## Distribution: source, not a build

Both packages ship **TypeScript source**, not a prebuilt `dist/`. Consumers compile them
with their own bundler (the export pipeline vendors the source directly into a generated
game). `main`/`types` point straight at `src/`. This is why the packages carry no build
step — see [`docs/PUBLISHING.md`](./PUBLISHING.md) for the release mechanics and
[`docs/RELEASING.md`](./RELEASING.md) for how the web and native package families are cut.
