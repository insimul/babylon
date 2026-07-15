/**
 * Barrel for the runtime-owned language layer (`@shared/language`).
 *
 * This mirrors the platform's `shared/language/index.ts` but re-exports ONLY the
 * modules that live in the runtime (open language *models* and runtime logic).
 * The closed authoring corpora the platform's barrel also re-exports
 * (vocabulary-corpus, french-vocabulary-corpus, character-profile) are NOT
 * present here by design — see shared/language/CLAUDE.md for the open/closed
 * boundary. Keep this list to modules that exist in-repo so `@shared/language`
 * resolves standalone.
 */

export * from './types';
export * from './progress';
export * from './utils';
export * from './gamification';
export * from './quest-templates';
export * from './pronunciation-scoring';
export * from './phonetic-similarity';
export * from './bilingual-names';
export * from './vocabulary-review';
export * from './speech-complexity';
