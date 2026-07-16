/**
 * Shared converter types (US-PC3)
 *
 * The `ConversionResult` shape is the common contract returned by every
 * source-format → Prolog converter in this package:
 *   - `ensemble-converter.ts`   (Ensemble JSON, US-PC1/PC2)
 *   - `kismet-converter.ts`     (Kismet DSL, US-PC3)
 *   - `tott-converter.ts`       (Talk-of-the-Town, US-PC4)
 *
 * It lived on `ensemble-converter.ts` originally; it was hoisted here so the
 * three converters share one definition instead of re-declaring it. To avoid
 * breaking the platform migration-012 consumer that imports `ConversionResult`
 * from `@shared/prolog/ensemble-converter`, `ensemble-converter.ts` re-exports
 * this type — the import path stays stable.
 */

export interface ConversionResult {
  /** The source-material name of the converted rule/action (unsanitized). */
  name: string;
  /** The emitted Prolog, or `null` when the source was skipped. */
  prologContent: string | null;
  /** True when nothing was emitted (see `skipReason`). */
  skipped: boolean;
  /** Human-readable reason a source item was skipped. */
  skipReason?: string;
  /** Citations from source material (e.g., VESPACE literary references). */
  citations?: Array<{ title: string; content?: string; url?: string }>;
}
