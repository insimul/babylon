/**
 * @insimul/core/prolog — the engine-agnostic Prolog toolchain (US-CE2).
 *
 * tau-engine + the predicate schema/migrations, fact parser/serializer/validator,
 * the quest/action/narrative hydrators, the converters, and the helper/advanced/
 * gameplay/tott predicate libraries. Zero @babylonjs/*, react, or DOM deps; the
 * Babylon-facing GamePrologEngine orchestration stays in shared/game-engine/logic
 * and imports THIS, never the reverse.
 *
 * NOTE: PredicateArg and ValidationResult are each declared in two modules; a flat
 * \`export *\` barrel makes those two names ambiguous (TS drops them here). Import
 * them from their specific module (@insimul/core/prolog/<module>) if you need them.
 */
export * from './action-converter';
export * from './action-effects';
export * from './action-hydrator';
export * from './action-prerequisites';
export * from './advanced-predicates';
export * from './content-validators';
export * from './converter-types';
export * from './ensemble-converter';
export * from './kismet-converter';
export * from './export-validator';
export * from './gameplay-predicates';
export * from './helper-predicates';
export * from './mvt-context';
export * from './narrative-hydrator';
export * from './npc-reasoning';
export * from './player-language-state';
export * from './predicate-migrations';
export * from './predicate-schema';
export * from './prolog-fact-parser';
export * from './prolog-fact-serializer';
export * from './prolog-fact-validator';
export * from './prolog-importer';
export * from './prolog-kb-optimizer';
export * from './prolog-metadata-extractor';
export * from './prolog-schema-diff';
export * from './prolog-to-insimul';
export * from './quest-converter';
export * from './quest-hydrator';
export * from './rule-converter';
export * from './tau-engine';
// tau-prolog-patch is a side-effect-only global patch (no exports); tau-engine
// imports it directly, so the barrel does not re-export it.
export * from './tott-converter';
export * from './tott-predicate-map';
export * from './tott-predicates';
export * from './truth-converter';
export * from './types';

// Disambiguate names declared in two modules (TS2308). Both variants remain
// reachable via their specific module path (@insimul/core/prolog/<module>).
export type { ValidationResult } from './content-validators';
export type { PredicateArg } from './gameplay-predicates';
