# Insimul for Babylon.js

> Drop AI-driven NPC conversations, quest logic, and persistent save files into a
> [Babylon.js](https://www.babylonjs.com/) game — backed by a world whose canonical state
> lives in a knowledge base, not scattered across your code.

This repository is the **web runtime** of Insimul, a system for building fictional worlds
and games in which the "truth" of the world — who knows whom, which quests are open, what's
in the tavern — is held in a Prolog knowledge base rather than hardcoded. If you build for
the web with Babylon.js and want NPCs that actually talk (with pluggable LLM / voice
backends), quests and inventory that behave consistently, and save files that survive schema
changes, this is the library that gives you all of that in one install.

You do **not** need to know anything about the wider Insimul project to use it. If you know
JavaScript/TypeScript and a little Babylon.js, you know enough.

## What it gives you

- **Talking NPCs, standalone.** A conversation SDK with pluggable **chat (LLM)**, **TTS**,
  and **STT** providers — server-hosted, fully in-browser, or local. It has no dependency on
  Babylon or React, so you can drop it into any game loop.
- **A world engine, not a scripting mess.** Quests, dialogue, inventory and containers,
  crafting/farming/fishing/mining, relationships, game time, and truth propagation — all
  driven by queries against a world's knowledge base, so behaviour stays consistent as the
  world grows.
- **Save files that don't rot.** A versioned save-file format with migrations, persistence,
  and loading UI. Old saves migrate forward instead of breaking.
- **A Babylon.js renderer + a one-component mount.** `BabylonWorld` is the whole game surface
  — rendering, quests, and save persistence — as a single React component.

## How it works

Three ideas explain most of the design:

- **The world's truth lives in a knowledge base.** Canonical state is a set of facts and
  rules in Prolog; game logic *asks questions of it* instead of hand-maintaining state. This
  is what keeps a large world coherent.
- **One reasoning engine, everywhere.** That knowledge base is evaluated by a single Prolog
  engine — [Trealla](https://github.com/trealla-prolog/trealla) compiled to WebAssembly — so
  a world behaves **identically** in the browser and on native engines. The wasm build ships
  inside the package; there is no native toolchain to set up.
- **Rules and rendering are separate packages.** The engine-agnostic contract and shared
  logic live in `@insimul/core`; the Babylon.js renderer and web glue live in
  `@insimul/babylon`, which depends on core and nothing else. See
  [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full picture.

As a web developer you install **one package, `@insimul/babylon`**, and reach for the piece
you need through a subpath.

## Getting started

The `@insimul/*` packages are published to **GitHub Packages**, so your project needs an
`.npmrc` pointing the `@insimul` scope at that registry (copy
[`.npmrc.example`](.npmrc.example)) with a `GITHUB_TOKEN` that has `read:packages`:

```ini
@insimul:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Then install the one package:

```bash
npm install @insimul/babylon
```

### A minimal example

**Mount a full world (React).** `BabylonWorld` is rendering + quests + save persistence in
one component:

```tsx
import { BabylonWorld } from '@insimul/babylon/data/BabylonWorld';

export function Game() {
  return (
    <BabylonWorld
      worldId="my-world"
      worldName="My World"
      token={null}        // null = standalone / offline (no server auth)
      assetMounts={[]}    // asset bundles the game loads
      onBack={() => history.back()}
    />
  );
}
```

**Or just the NPC conversations** — no Babylon, no React:

```ts
import { InsimulClient } from '@insimul/babylon/conversation';

const client = new InsimulClient({ chat: 'browser', tts: 'browser', stt: 'none' });
client.on({ onTextChunk: (text, isFinal) => render(text, isFinal) });
client.setCharacter(npcId, worldId);
await client.sendText('Hello!');
```

`react` and the in-browser LLM backend (`@mlc-ai/web-llm`) are **optional peers** — you only
install them if you use the entry points that need them.

## The pieces

You install `@insimul/babylon`, but the code is two packages with one-way dependencies:

| Package | Install for | Highlights |
| --- | --- | --- |
| [**`@insimul/babylon`**](packages/babylon) | building a web game | `@insimul/babylon/conversation` (the NPC SDK), `/data` (save + `BabylonWorld`), `/engine` (the Babylon renderer), `/templates` (export shell). |
| [**`@insimul/core`**](packages/core) | tooling or a native engine | The engine-agnostic contract: save-file format + migrations, World types, the Prolog toolchain, and the shared runtime systems. No Babylon, React, or DOM. |

Each package has its own README with a full API tour — start there when you want depth.

## Learn by example / deeper usage

- [**`packages/babylon/README.md`**](packages/babylon/README.md) — every entry point of the
  web runtime, with quickstarts for each.
- [**`packages/core/README.md`**](packages/core/README.md) — the contract, the shared
  runtime, the transport schemas, and how to consume it from a non-web engine.
- [**`docs/ARCHITECTURE.md`**](docs/ARCHITECTURE.md) — why it's two packages, the one-way
  dependency rule, the single wasm Prolog engine, and how to migrate off the older package
  names.

## Repository layout

| Path | Contents |
| --- | --- |
| [`packages/babylon/`](packages/babylon) | `@insimul/babylon` — the web/Babylon.js runtime you install. |
| [`packages/core/`](packages/core) | `@insimul/core` — the engine-agnostic contract and shared runtime. |
| `packages/typescript/`, `packages/babylon-game/` | Deprecated re-export shims for the old package names ([migration](docs/ARCHITECTURE.md#migrating-from-the-older-package-names)). |
| [`docs/`](docs) | Architecture, development, and release documentation. |
| `shared/` | Straggler modules and the import-hygiene guards, mid-migration into the two packages. |

## Going deeper

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the repository is put together.
- [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md) — building, type-checking, testing, and the guards.
- [`docs/PUBLISHING.md`](docs/PUBLISHING.md) · [`docs/RELEASING.md`](docs/RELEASING.md) — the npm and native release processes.
- [`CHANGELOG.md`](CHANGELOG.md) — the release-by-release record.

The native-engine runtimes for the same worlds (Unity / Unreal / Godot) are separate
sibling projects that consume the same `@insimul/core` contract; you don't need them to
build for the web.

## License

[Apache-2.0](LICENSE).
