// Re-export shim — moved to @insimul/babylon/engine (packages/babylon/src/engine/voice/voice-websocket-client).
// Kept so `@shared/voice/voice-websocket-client` imports (platform @shared aliases + the
// export-pipeline shared/ vendoring) keep resolving. See US-BC3.
export * from "../../packages/babylon/src/engine/voice/voice-websocket-client";
