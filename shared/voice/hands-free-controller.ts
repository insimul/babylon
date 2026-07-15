// Re-export shim — moved to @insimul/babylon/engine (packages/babylon/src/engine/voice/hands-free-controller).
// Kept so `@shared/voice/hands-free-controller` imports (platform @shared aliases + the
// export-pipeline shared/ vendoring) keep resolving. See US-BC3.
export * from "../../packages/babylon/src/engine/voice/hands-free-controller";
