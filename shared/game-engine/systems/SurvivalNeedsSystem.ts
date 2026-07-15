// Re-export shim — moved to @insimul/babylon/engine (packages/babylon/src/engine/game-engine/systems/SurvivalNeedsSystem).
// Kept so `@shared/game-engine/systems/SurvivalNeedsSystem` imports (platform @shared aliases + the
// export-pipeline shared/ vendoring) keep resolving. See US-BC3.
export * from "../../../packages/babylon/src/engine/game-engine/systems/SurvivalNeedsSystem";
