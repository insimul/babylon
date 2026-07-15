# @insimul/runtime

The Insimul runtime SDK: the shared game engine, Prolog runtime, save-file format,
language-tracking models, game-engine UI/rendering, and per-engine export templates
that ship **inside** games built with the Insimul platform.

This repository is consumed by the authoring platform (`insimul-platform`) via the
`@insimul/runtime`, `@insimul/typescript`, `@insimul/babylon`, and
`@insimul/babylon-game` packages, and is designed to build, type-check, and test
**standalone** — with zero references back into the platform.

## Packages

| Package | Path | Contents |
| --- | --- | --- |
| `@insimul/runtime` | `shared/` | Shared engine, Prolog runtime, save-file format, language models, game-engine UI/rendering. |
| `@insimul/typescript` | `packages/typescript` | Conversation-service client SDK. |
| `@insimul/babylon` | `packages/babylon` | Babylon.js export **templates** (copied into generated game projects). |
| `@insimul/babylon-game` | `packages/babylon-game` | Babylon.js game runtime: DataSource, save-file persistence, optimization, loading UI. |
| `@insimul/*` (unity/unreal/godot) | `packages/{unity,unreal,godot}` | Engine SDK + export templates (C#/C++/GDScript — not TypeScript). |

## Development

Install dependencies (workspace-hoisted; `@insimul/*` scoped packages come from
GitHub Packages — see `.npmrc.example`):

```bash
npm install
```

### Type-check the whole repo standalone

```bash
npm run check
```

`npm run check` runs `tsc --noEmit` against `tsconfig.check.json`, which covers the
`shared/` tree plus the `src/` of the TypeScript packages (`typescript`,
`babylon-game`) with the `@shared/* -> ./shared/*` path mapping and the
`@insimul/{typescript,babylon-game}` self-aliases that the platform uses to consume
this package. It is the gate that keeps the runtime self-contained: every
`@shared/...` import must resolve to a file **in this repo** (no back-references into
`insimul-platform`).

Engine template trees (`packages/{unity,unreal,godot}/templates` and the C#/C++/GDScript
`Source`/`Runtime`/`addons` directories) are excluded — they are not TypeScript. The
Babylon export templates (`packages/babylon/templates`) are also excluded: they use
relative imports that only resolve inside a *generated* game project, not standalone.

> **Known type debt.** Two files (`shared/game-engine/types.ts`,
> `shared/game-engine/ir-types.ts`) carry a temporary in-file `// @ts-nocheck` because
> each has genuine pre-existing duplicate-interface bugs whose correct fix is a
> deliberate refactor with runtime-behavior risk (see the header comment in each file
> and `scripts/ralph/progress.txt`). Draining those two directives — and resolving the
> `GameQuestManager` cross-repo back-reference described in
> `docs/PLATFORM_SPLIT_AND_ENGINE_PLUGINS.md` §A0 — is tracked follow-up. Do **not** add
> new `@ts-nocheck` directives to silence errors.
