/**
 * Backward-compat shim for the top-level `@shared/language-progress` specifier.
 *
 * The canonical language-progress model lives at `@shared/language/progress`.
 * Some rendering-layer files import it via the flat `@shared/language-progress`
 * path (the platform aliases both), so re-export it here to keep that path
 * resolving standalone. Do not add data here — edit shared/language/progress.ts.
 */

export * from './language/progress';
