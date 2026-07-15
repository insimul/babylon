// Re-export shim — moved to @insimul/babylon/engine (packages/babylon/src/engine/game-engine/quest-action-mapping).
// Kept so `@shared/game-engine/quest-action-mapping` imports (platform @shared aliases + the
// export-pipeline shared/ vendoring) keep resolving. See US-BC3.
export * from "../../packages/babylon/src/engine/game-engine/quest-action-mapping";
