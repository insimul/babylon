# @insimul/babylon

The **consolidated Babylon.js runtime for Insimul** — one runtime package per web
engine. Install this single package to plug Insimul (AI NPC conversations, quests,
save files, the Babylon renderer) into a web game.

It depends only on [`@insimul/core`](../core), the engine-agnostic contract.

## Installation

`@insimul/*` packages are published to GitHub Packages, so your project needs an
`.npmrc` pointing the scope at that registry (see `.npmrc.example` at the repo root):

```
@insimul:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

```bash
npm install @insimul/babylon
```

## Entry points

| Subpath | What it is |
| --- | --- |
| `@insimul/babylon` | Convenience root — re-exports the conversation SDK. |
| `@insimul/babylon/conversation` | The conversation SDK: `InsimulClient` plus pluggable chat / TTS / STT providers and audio utilities. No Babylon, no React. |
| `@insimul/babylon/data` | `DataSource`, save-file persistence (`SaveFileDataSource`, `WorldStateManager`, `SaveQueue`), loading/optimization UI, and the `BabylonWorld` React mount. |
| `@insimul/babylon/engine` | The Babylon renderer, game logic, systems, and voice. |
| `@insimul/babylon/templates/*` | The Vite/Electron export-shell templates consumed by the platform's game-export pipeline. |

Deep imports work under every subpath (`@insimul/babylon/engine/rendering/...`).
React entry points (`BabylonWorld`, `LoadingScreen`, the save-migration modal) are
deep-import only, so importing a barrel never requires the optional `react` peer.

## Quickstart

**Mount a full Insimul world (React).**

```tsx
import { BabylonWorld } from '@insimul/babylon/data/BabylonWorld';

export function Game() {
  return (
    <BabylonWorld
      worldId="my-world"
      worldName="My World"
      token={null}      // null = standalone/offline (no server auth)
      assetMounts={[]}
      onBack={() => history.back()}
    />
  );
}
```

**Use the conversation SDK standalone** — no Babylon, no React:

```ts
import { InsimulClient } from '@insimul/babylon/conversation';

const client = new InsimulClient({ chat: 'browser', tts: 'browser', stt: 'none' });
client.on({ onTextChunk: (text, isFinal) => render(text, isFinal) });
client.setCharacter(npcId, worldId);
await client.sendText('Hello!');
```

## Dependencies

`@babylonjs/{core,gui,inspector,loaders}` are real dependencies. `react` and
`@mlc-ai/web-llm` are **optional peers** — only the React entry points and the
in-browser LLM provider need them.

## What ships in the tarball

TypeScript **source** (`src/`, minus tests) plus the export `templates/`. This
package is deliberately source-distributed: consumers build it with their own
bundler, and the platform's game-export pipeline vendors `src/` directly into the
generated game (`src/insimul-babylon`). There is no prebuilt `dist/`.

## Deprecated predecessors

`@insimul/typescript` (→ `./conversation`) and `@insimul/babylon-game` (→ `./data`)
still publish as 100% re-export shims so existing installs resolve unchanged. Do not
add them to new projects.

## More

- Repo README: the two-package model, guards, and the shim/deprecation timeline.
- [`docs/PUBLISHING.md`](../../docs/PUBLISHING.md) — how these packages are released.
- [`CHANGELOG.md`](../../CHANGELOG.md) — release-by-release record.

Licensed under [Apache-2.0](./LICENSE).
