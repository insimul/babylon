// Re-export shim — lives at @insimul/babylon/engine (packages/babylon/src/engine/game-engine/logic/RadiantQuestDirector).
// Kept so `@shared/game-engine/logic/RadiantQuestDirector` imports (platform @shared aliases + the
// export-pipeline shared/ vendoring) keep resolving. See US-BC3 / US-RQ3.
export * from "../../../packages/babylon/src/engine/game-engine/logic/RadiantQuestDirector";
