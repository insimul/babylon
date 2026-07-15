// Re-export shim — moved to @insimul/babylon/engine (packages/babylon/src/engine/game-engine/rendering/CharacterController).
// Kept so `@shared/game-engine/rendering/CharacterController` imports (platform @shared aliases + the
// export-pipeline shared/ vendoring) keep resolving. See US-BC3.
export * from "../../../packages/babylon/src/engine/game-engine/rendering/CharacterController";
