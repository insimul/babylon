// Re-export shim — moved to @insimul/core (packages/core/src/language/quest-templates). US-3 of 93-runtime-logic-to-core.
// Kept so `@shared/language/quest-templates` imports (platform @shared aliases + the export-pipeline
// shared/ vendoring) keep resolving unchanged.
export * from '../../packages/core/src/language/quest-templates';
