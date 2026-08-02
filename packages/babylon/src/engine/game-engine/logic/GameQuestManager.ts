// Re-export shim — moved to @insimul/core (packages/core/src/game-engine/logic/GameQuestManager).
// US-2 of 94-quest-manager-interface: the orchestrator used to live in the CLOSED authoring
// platform and this path carried only a `.d.ts` type surface for it. The closed dependency is
// now inverted behind `IQuestSeedSource` (quests/quest-seed-source.ts), so this is real code in
// the contract package that Unity/Unreal/Godot can consume — and the `.d.ts` is gone.
// Kept so `@shared/game-engine/logic/GameQuestManager` (platform @shared aliases, the shared/
// shim chain, and the export-pipeline vendoring) keeps resolving unchanged.
export * from '@insimul/core/game-engine/logic/GameQuestManager';
