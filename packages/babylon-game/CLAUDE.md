# @insimul/babylon-game — agent notes

## DEPRECATED passthrough (US-BC2)

The save/data/loading layer that used to live here **moved to `@insimul/babylon`**
(subpath `./data`, physically `packages/babylon/src/data/`). `packages/babylon-game/src/`
now contains **only one-line re-export shims** into `@insimul/babylon/data/*` so existing
consumers (the platform's npm dep + tsconfig/vite aliases, and
`shared/game-engine/rendering/BabylonGame.ts`, which imports
`@insimul/babylon-game/{WorldStateManager,DataSource,diagnostics/ResourceProfiler}`) keep
resolving. Do NOT add real source here — put it in `packages/babylon/src/data/` and shim it.
`OLD_EXPORT_SURFACE.json` snapshots the shimmed surface; the import-hygiene guard
(`shared/__tests__/import-hygiene.test.ts`) fails if any snapshotted shim goes missing or
stops being a thin re-export. The notes below are retained as history (the quest-storage
vendoring still lives in `shared/quests/`, unchanged).

## Quest storage: runtime-owned interface + save-file implementation

`SaveFileDataSource` needs a `QuestStorageProvider` so shared quest services can
run client-side (no server). The platform authors the canonical
`quest-storage-provider` / `save-game-quest-storage` under its own `shared/quests/`
against the Drizzle `schema.ts` types, but those don't exist in this repo.

**Decision (US-RS2):** vendor both modules into this repo's `shared/quests/`
(`quest-storage-provider.ts`, `save-game-quest-storage.ts`) rather than inverting
call sites onto `IDataSource`. `save-game-quest-storage` IS the game-client
implementation, so it belongs in the runtime; inverting would have duplicated its
overlay-merge logic. The vendored copies import their entity types
(`Quest`, `World`, `Character`, `Business`, `Settlement`, `Truth`, and the
`Insert*` aliases) from `@shared/quests/types` — loose `{ id: string; [k]: unknown }`
structural shapes — instead of `@shared/schema`. The platform's richer Drizzle
types stay **assignable** to these, so a `SaveGameQuestStorage` built here still
satisfies the same `QuestStorageProvider` contract the server's `MongoQuestStorage`
does. Keep the exported names (`QuestStorageProvider`, `ExportedWorldData`,
`createSaveGameQuestStorage`) interface-compatible with the platform's copies.

## `@shared/*` imports must resolve inside this repo

`VisualAsset` and friends come from `@shared/asset-types` (US-RS1), not
`@shared/schema` (which only exists platform-side). Any `@shared/...` import added
here must map to a real file under this repo's `shared/`.
