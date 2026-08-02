// Re-export shim — moved to @insimul/core (packages/core/src/language/pronunciation-scoring). US-3 of 93-runtime-logic-to-core.
// Kept so `@shared/language/pronunciation-scoring` imports (platform @shared aliases + the export-pipeline
// shared/ vendoring) keep resolving unchanged.
export * from '../../packages/core/src/language/pronunciation-scoring';
