// Re-export shim — moved to @insimul/core (packages/core/src/language/phonetic-similarity). US-3 of 93-runtime-logic-to-core.
// Kept so `@shared/language/phonetic-similarity` imports (platform @shared aliases + the export-pipeline
// shared/ vendoring) keep resolving unchanged.
export * from '../../packages/core/src/language/phonetic-similarity';
