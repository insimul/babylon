// Backward-compatible re-export. Canonical location: @shared/language/progress
// RUNTIME-OWNED shim mirroring the platform's `@shared/language/language-progress`.
// The canonical `progress.ts` (LanguageProgress, VocabularyEntry, GrammarPattern,
// ConversationRecord, EncounterType, EvalDimensionScores, DimensionTrend, ...) already
// lives in this repo, so no data is vendored — this just preserves the import path.
export * from '@shared/language/progress';
