# @insimul/babylon-game

> **⚠️ Deprecated — passthrough only.** The save / data / loading layer now lives in
> the consolidated `@insimul/babylon` package (subpath `./data`). This package
> contains **only one-line re-export shims** so existing installs keep resolving, but
> new code should import from `@insimul/babylon`:
>
> ```typescript
> import { WorldStateManager, SaveFileDataSource } from '@insimul/babylon/data';
> ```
>
> Install `@insimul/babylon` instead. This package receives no new features and will
> be removed in a future major release.

## Migration

Every path this package exported still resolves, one-for-one, under
`@insimul/babylon/data`:

| Old | New |
| --- | --- |
| `@insimul/babylon-game/WorldStateManager` | `@insimul/babylon/data` (or `@insimul/babylon/data/WorldStateManager.js`) |
| `@insimul/babylon-game/SaveFileDataSource` | `@insimul/babylon/data` |
| `@insimul/babylon-game/SaveQueue` | `@insimul/babylon/data` |
| `@insimul/babylon-game/DataSource` | `@insimul/babylon/data` (`ApiDataSource` / `FileDataSource` / `createDataSource`) |
| `@insimul/babylon-game/optimization/*` | `@insimul/babylon/data/optimization/*.js` |
| `@insimul/babylon-game/diagnostics/*` | `@insimul/babylon/data/diagnostics/*.js` |
| `@insimul/babylon-game/BabylonWorld` | `@insimul/babylon/data/BabylonWorld.js` (React) |
| `@insimul/babylon-game/ui/SaveMigrationPromptModal` | `@insimul/babylon/data/ui/SaveMigrationPromptModal.js` (React) |

The `./data` barrel is React-free on purpose — the React entry points
(`BabylonWorld`, `LoadingScreen`, the migration modal) are deep-import only, so
importing the barrel never pulls in the optional `react` peer.

`OLD_EXPORT_SURFACE.json` (repo-only) snapshots the full shimmed surface; an
import-hygiene guard fails if any shim goes missing or stops being a thin re-export,
so the mapping above cannot silently rot.

## Installation

```bash
npm install @insimul/babylon   # preferred
# or, still supported as a passthrough:
npm install @insimul/babylon-game
```

Both are published to GitHub Packages under the `@insimul` scope — see
[`.npmrc.example`](../../.npmrc.example) and [`docs/PUBLISHING.md`](../../docs/PUBLISHING.md).

`@insimul/babylon-game` declares `@insimul/babylon` as a dependency, so installing
the passthrough pulls in the real implementation automatically.

## What ships

The tarball is the shim tree only: `src/**` (no tests), plus `README.md` and
`LICENSE`. There is no build step — like the rest of the web packages, this one is
source-distributed (see `docs/PUBLISHING.md` § "What ships").

## License

Apache-2.0 — see [LICENSE](./LICENSE).
