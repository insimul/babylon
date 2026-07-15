// Re-export shim — moved to @insimul/babylon/engine (packages/babylon/src/engine/voice/speech-recognition).
// Kept so `@shared/voice/speech-recognition` imports (platform @shared aliases + the
// export-pipeline shared/ vendoring) keep resolving. See US-BC3.
export * from "../../packages/babylon/src/engine/voice/speech-recognition";
