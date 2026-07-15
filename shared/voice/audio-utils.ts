// Re-export shim — moved to @insimul/babylon/engine (packages/babylon/src/engine/voice/audio-utils).
// Kept so `@shared/voice/audio-utils` imports (platform @shared aliases + the
// export-pipeline shared/ vendoring) keep resolving. See US-BC3.
export * from "../../packages/babylon/src/engine/voice/audio-utils";
