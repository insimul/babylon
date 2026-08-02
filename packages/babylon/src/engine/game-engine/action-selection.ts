// Re-export shim — moved to @insimul/core (@insimul/core/game-engine/action-selection). US-3 of 93-runtime-logic-to-core.
// Kept so the old `@shared/game-engine/...` / relative imports (platform @shared
// aliases + the export-pipeline vendoring) keep resolving unchanged.
export * from '@insimul/core/game-engine/action-selection';
