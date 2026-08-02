// Re-export shim — moved to @insimul/core (packages/core/src/quests/quest-storage-provider.ts).
// Kept so `@shared/quests/quest-storage-provider` imports (platform @shared aliases + the
// export-pipeline shared/ vendoring) keep resolving. See 94-quest-manager-interface US-1.
export * from '../../packages/core/src/quests/quest-storage-provider';
