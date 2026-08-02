// Re-export shim — moved to @insimul/core (packages/core/src/game-engine/logic/ContainerManager).
// US-3 of 93-runtime-logic-to-core: `game-engine/logic/` is the engine-agnostic shared
// runtime, so it now lives in the contract package that Unity/Unreal/Godot can consume.
// Kept so `@shared/game-engine/logic/ContainerManager` (platform @shared aliases, the shared/
// shim chain, and the export-pipeline vendoring) keeps resolving unchanged.
export * from '@insimul/core/game-engine/logic/ContainerManager';
