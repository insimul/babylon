/**
 * @insimul/core/identity — the KINP identity surface (US-1).
 *
 * `koine/specs/identity.md` (spec 0.2.1) in three files:
 *   - `kinp.ts`                 — the identifier grammar (IRI / CURIE / id/3) + registry
 *   - `identity-predicates.ts`  — the Prolog rule pack (accessors, world scoping)
 *   - `identity-facts.ts`       — the sanitized `_id` atom ⇄ identifier bridge facts
 */
export * from './kinp';
export * from './identity-predicates';
export * from './identity-facts';
