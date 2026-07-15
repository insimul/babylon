// Re-export shim — moved to @insimul/babylon/engine (packages/babylon/src/engine/game-engine/rendering/StreamingAudioPlayer).
// Kept so `@shared/game-engine/rendering/StreamingAudioPlayer` imports (platform @shared aliases + the
// export-pipeline shared/ vendoring) keep resolving. See US-BC3.
export * from "../../../packages/babylon/src/engine/game-engine/rendering/StreamingAudioPlayer";
