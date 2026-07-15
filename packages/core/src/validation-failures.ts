/**
 * Validation-failures diagnostics types (US-005).
 *
 * Captures generation attempts that exhausted their retries without passing
 * structural, schema, or referential-integrity validation. Surfaces in the
 * admin diagnostics panel so operators can inspect the failed content,
 * source prompt, and retry from the dashboard.
 */

export type ValidationFailureContentType = 'rule' | 'action' | 'quest';

export interface ValidationFailureCitation {
  title: string;
  content?: string | null;
  url?: string | null;
}

export interface ValidationFailure {
  id: string;
  worldId: string | null;
  contentType: ValidationFailureContentType;
  contentId: string | null;
  failedContent: string;
  errors: string[];
  warnings: string[];
  sourcePrompt: string | null;
  citations: ValidationFailureCitation[];
  attemptedRetries: number;
  createdAt: string;
}

export interface InsertValidationFailure {
  worldId?: string | null;
  contentType: ValidationFailureContentType;
  contentId?: string | null;
  failedContent: string;
  errors: string[];
  warnings?: string[];
  sourcePrompt?: string | null;
  citations?: ValidationFailureCitation[];
  attemptedRetries?: number;
}
