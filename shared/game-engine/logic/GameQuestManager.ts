// Re-export shim — moved to @insimul/babylon/engine (packages/babylon/src/engine/game-engine/logic/GameQuestManager).
// Kept so `@shared/game-engine/logic/GameQuestManager` imports (platform @shared aliases + the
// export-pipeline shared/ vendoring) keep resolving. See US-BC3; the real implementation now
// lives in packages/core (US-2 of 94-quest-manager-interface).
export * from "../../../packages/babylon/src/engine/game-engine/logic/GameQuestManager";
