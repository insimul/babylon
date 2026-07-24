/**
 * @insimul/core/identity — the KINP identity surface (US-1).
 *
 * `koine/specs/identity.md` (spec 0.2.1):
 *   - `kinp.ts`                    — the identifier grammar (IRI / CURIE / id/3) + registry
 *   - `identity-predicates.ts`     — the Prolog rule pack (accessors, world scoping)
 *   - `identity-facts.ts`          — the sanitized `_id` atom ⇄ identifier bridge facts
 *   - `equivalence.ts`             — the §4 equivalence layer: minting same_as / based_on
 *   - `equivalence-predicates.ts`  — its Prolog rule pack (the §4.3 firewall)
 *   - `worlds.ts`                  — the §5 world model + the `@world(W)` context argument
 *   - `world-predicates.ts`        — its Prolog rule pack (inheritance + overrides)
 */
export * from './kinp';
export * from './identity-predicates';
export * from './identity-facts';
export * from './equivalence';
export * from './equivalence-predicates';
export * from './worlds';
export * from './world-predicates';
