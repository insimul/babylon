/**
 * Advanced Prolog Predicates
 *
 * Phase 13 advanced features:
 *   - Resource constraints (CLP-like via custom rules)
 *   - Probabilistic reasoning (NPC decision uncertainty)
 *   - Abductive reasoning (mystery/detective quest generation)
 *   - Meta-predicates (rule-about-rules, governance)
 *   - Procedural content generation
 */

// ── Dynamic Declarations ──────────────────────────────────────────────────

const DYNAMIC_DECLARATIONS = [
  // Resource constraints
  'resource/3', 'resource_capacity/3', 'resource_production/3',
  'resource_consumption/3', 'resource_trade/4', 'resource_price/3',
  'resource_deficit/3', 'resource_surplus/3',
  // Probabilistic
  'probability/2', 'npc_preference/3', 'weighted_choice/3',
  'decision_factor/4',
  // Abductive / Mystery
  'clue/4', 'suspect/2', 'motive/3', 'alibi/3', 'evidence_for/3',
  'evidence_against/3', 'mystery/2', 'solved/2', 'accused/3',
  'witness/3', 'crime/3',
  // Meta / Governance
  'law/3', 'law_active/2', 'law_penalty/3', 'law_enforcer/2',
  'vote/3', 'council_member/2', 'authority/3',
  'tax_rate/3', 'tax_exempt/2',
  // Procedural generation
  'generated_name/2', 'name_pattern/2', 'terrain_type/2',
  'biome/2', 'climate/2', 'building_template/3',
  'npc_archetype/2', 'quest_template/3',
];

// ── Resource Constraint Rules ─────────────────────────────────────────────

const RESOURCE_RULES = [
  // Resource balance
  'resource_balance(Location, Resource, Balance) :- resource(Location, Resource, Current), resource_production(Location, Resource, Prod), resource_consumption(Location, Resource, Cons), Balance is Current + Prod - Cons',

  // Deficit/surplus detection
  'has_deficit(Location, Resource) :- resource_balance(Location, Resource, B), B < 0',
  'has_surplus(Location, Resource) :- resource_balance(Location, Resource, B), B > 0',

  // Can sustain population
  'can_sustain(Location) :- \\+ has_deficit(Location, food)',
  'starving(Location) :- has_deficit(Location, food), resource(Location, food, F), F < 10',

  // Trade feasibility
  'can_trade_resource(From, To, Resource) :- has_surplus(From, Resource), has_deficit(To, Resource)',
  'optimal_trade(From, To, Resource, Amount) :- resource_balance(From, Resource, Surplus), Surplus > 0, resource_balance(To, Resource, Deficit), Deficit < 0, NegDef is -Deficit, Amount is min(Surplus, NegDef)',

  // Resource dependency chains
  'depends_on(Product, Material) :- resource_production(_, Product, _), resource_consumption(_, Material, _)',
  'production_blocked(Location, Product) :- depends_on(Product, Material), resource(Location, Material, Amount), Amount =< 0',

  // Wealth from resources
  'location_wealth(Location, Wealth) :- findall(V, (resource(Location, R, Amount), resource_price(R, _, Price), V is Amount * Price), Values), sum_list(Values, Wealth)',

  // Capacity constraints
  'over_capacity(Location, Resource) :- resource(Location, Resource, Amount), resource_capacity(Location, Resource, Cap), Amount > Cap',
  'utilization(Location, Resource, Pct) :- resource(Location, Resource, Amount), resource_capacity(Location, Resource, Cap), Cap > 0, Pct is (Amount * 100) / Cap',
];

// ── Probabilistic Reasoning Rules ─────────────────────────────────────────

const PROBABILISTIC_RULES = [
  // Weighted decision making based on personality
  'likely_action(Person, Action, Probability) :- decision_factor(Person, Action, Factor, Weight), personality(Person, Factor, Value), Probability is Value * Weight',

  // Social action probability
  'socialize_probability(Person, P) :- personality(Person, extroversion, E), personality(Person, agreeableness, A), P is (E * 0.6 + A * 0.4)',

  // Risk-taking probability
  'risk_probability(Person, P) :- personality(Person, openness, O), personality(Person, neuroticism, N), P is O * 0.7 - N * 0.3',

  // Conflict probability between two people
  'conflict_probability(X, Y, P) :- personality(X, agreeableness, AX), personality(Y, agreeableness, AY), charge(X, Y, C), Aggression is (1.0 - AX) * 0.3 + (1.0 - AY) * 0.3, Hostility is max(0, -C) * 0.01, P is min(1.0, Aggression + Hostility)',

  // Trust formation probability
  'trust_probability(X, Y, P) :- personality(X, agreeableness, AX), personality(X, neuroticism, NX), compatibility(X, Y, C), P is AX * 0.4 + (1.0 - NX) * 0.2 + C * 0.4',

  // Decision under uncertainty: choose action with highest expected value
  'best_action(Person, BestAction) :- findall(P-A, likely_action(Person, A, P), PAs), msort(PAs, Sorted), last(Sorted, _-BestAction)',

  // Mood-influenced decisions
  'mood_modifier(Person, Modifier) :- mood(Person, happy), Modifier is 1.2',
  'mood_modifier(Person, Modifier) :- mood(Person, sad), Modifier is 0.7',
  'mood_modifier(Person, Modifier) :- mood(Person, angry), Modifier is 0.9',
  'mood_modifier(Person, Modifier) :- \\+ mood(Person, _), Modifier is 1.0',

  // Adjusted probability with mood
  'adjusted_probability(Person, Action, AdjP) :- likely_action(Person, Action, P), mood_modifier(Person, M), AdjP is P * M',
];

// ── Abductive Reasoning Rules (Mystery/Detective) ─────────────────────────

const ABDUCTIVE_RULES = [
  // Crime investigation
  'suspect_for(Person, Crime) :- crime(Crime, _, _), motive(Person, Crime, _), \\+ alibi(Person, Crime, _)',
  'cleared(Person, Crime) :- alibi(Person, Crime, Witness), witness(Witness, Crime, credible)',
  'prime_suspect(Person, Crime) :- suspect_for(Person, Crime), evidence_for(Person, Crime, _), \\+ cleared(Person, Crime)',

  // Evidence evaluation
  'evidence_weight(Person, Crime, Weight) :- findall(1, evidence_for(Person, Crime, _), Fors), length(Fors, ForCount), findall(1, evidence_against(Person, Crime, _), Agns), length(Agns, AgnCount), Weight is ForCount - AgnCount',
  'most_evidence(Person, Crime) :- evidence_weight(Person, Crime, W), \\+ (evidence_weight(Other, Crime, W2), Other \\= Person, W2 > W)',

  // Motive inference (abductive)
  'infer_motive(Person, Crime, jealousy) :- crime(Crime, Victim, _), in_love(Person, Victim), married_to(Victim, Other), Other \\= Person',
  'infer_motive(Person, Crime, revenge) :- crime(Crime, Victim, _), enemies(Person, Victim)',
  'infer_motive(Person, Crime, greed) :- crime(Crime, Victim, _), wealth(Victim, W), W > 1000, inherits_from(Person, Victim, _)',
  'infer_motive(Person, Crime, power) :- crime(Crime, Victim, _), authority(Victim, Position, _), \\+ authority(Person, _, _)',

  // Clue chains
  'clue_leads_to(Clue, Person) :- clue(Clue, _, Location, _), at_location(Person, Location)',
  'connected_clues(C1, C2) :- clue(C1, _, _, Type), clue(C2, _, _, Type), C1 \\= C2',

  // Mystery solvability
  'solvable(Mystery) :- mystery(Mystery, Crime), prime_suspect(_, Crime)',
  'unsolvable(Mystery) :- mystery(Mystery, Crime), \\+ prime_suspect(_, Crime)',

  // Accusation validation
  'valid_accusation(Accuser, Accused, Crime) :- prime_suspect(Accused, Crime), evidence_weight(Accused, Crime, W), W >= 2',

  // Generate red herrings (characters with weak circumstantial links)
  'red_herring(Person, Crime) :- suspect_for(Person, Crime), evidence_weight(Person, Crime, W), W =< 0',
];

// ── Meta-Predicates (Governance) ──────────────────────────────────────────

const META_RULES = [
  // Law enforcement
  'law_applies(Person, LawId) :- law(LawId, _, Scope), law_active(LawId, true), in_scope(Person, Scope)',
  'in_scope(Person, all) :- person(Person)',
  'in_scope(Person, Location) :- at_location(Person, Location)',
  'in_scope(Person, Class) :- economic_class(Person, Class)',

  // Law violation detection
  'violates_law(Person, LawId) :- law(LawId, Condition, _), law_applies(Person, LawId), call(Condition)',
  'law_abiding(Person) :- person(Person), \\+ (law_applies(Person, LawId), violates_law(Person, LawId))',

  // Governance decisions
  'council_majority(Vote, Result) :- findall(1, vote(_, Vote, yes), Yeses), length(Yeses, YCount), findall(1, vote(_, Vote, no), Nos), length(Nos, NCount), (YCount > NCount -> Result = passed ; Result = rejected)',

  // Authority hierarchy
  'has_authority_over(Superior, Subordinate) :- authority(Superior, _, Level1), authority(Subordinate, _, Level2), Level1 > Level2',
  'highest_authority(Person) :- authority(Person, _, Level), \\+ (authority(Other, _, L2), Other \\= Person, L2 > Level)',

  // Taxation
  'tax_owed(Person, Amount) :- income(Person, I), tax_rate(_, _, Rate), \\+ tax_exempt(Person, _), Amount is I * Rate / 100',
  'tax_exempt_reason(Person, Reason) :- tax_exempt(Person, Reason)',

  // Rule priority resolution
  'rule_overrides(R1, R2) :- law(R1, _, _), law(R2, _, _), law_active(R1, true), law_active(R2, true)',

  // Social contract
  'citizen_of(Person, Location) :- person(Person), at_location(Person, Location)',
  'citizen_rights(Person, vote) :- citizen_of(Person, _), adult(Person)',
  'citizen_rights(Person, trade) :- citizen_of(Person, _)',
  'citizen_duties(Person, tax) :- citizen_of(Person, _), income(Person, I), I > 0',
];

// ── Procedural Content Generation ─────────────────────────────────────────

const PROCEDURAL_RULES = [
  // NPC archetype matching
  'matches_archetype(Person, warrior) :- personality(Person, extroversion, E), E > 0.6, personality(Person, agreeableness, A), A < 0.4',
  'matches_archetype(Person, scholar) :- personality(Person, openness, O), O > 0.7, personality(Person, conscientiousness, C), C > 0.6',
  'matches_archetype(Person, merchant) :- personality(Person, extroversion, E), E > 0.5, personality(Person, conscientiousness, C), C > 0.5',
  'matches_archetype(Person, healer) :- personality(Person, agreeableness, A), A > 0.7, personality(Person, neuroticism, N), N < 0.4',
  'matches_archetype(Person, rogue) :- personality(Person, openness, O), O > 0.5, personality(Person, agreeableness, A), A < 0.3, personality(Person, conscientiousness, C), C < 0.4',
  'matches_archetype(Person, leader) :- personality(Person, extroversion, E), E > 0.7, personality(Person, conscientiousness, C), C > 0.6, personality(Person, neuroticism, N), N < 0.4',

  // Quest generation from world state
  'needs_quest(escort, From, To) :- person(From), person(To), at_location(From, L1), at_location(To, L2), L1 \\= L2, enemies(From, _)',
  'needs_quest(delivery, Item, Destination) :- has_deficit(Destination, Item), has_surplus(_, Item)',
  'needs_quest(investigate, Mystery, Location) :- mystery(Mystery, Crime), crime(Crime, _, Location), unsolvable(Mystery)',
  'needs_quest(rescue, Person, Location) :- person(Person), at_location(Person, Location), \\+ alive(Person)',
  'needs_quest(trade, Resource, Location) :- starving(Location), can_trade_resource(_, Location, Resource)',

  // Conflict generation
  'potential_conflict(X, Y, rivalry) :- person(X), person(Y), X @< Y, personality(X, agreeableness, AX), AX < 0.3, personality(Y, agreeableness, AY), AY < 0.3, same_location(X, Y)',
  'potential_conflict(X, Y, love_triangle) :- in_love(X, Z), in_love(Y, Z), X \\= Y',
  'potential_conflict(X, Y, power_struggle) :- authority(X, Pos, L1), authority(Y, Pos, L2), abs(L1 - L2) =< 1',

  // Event generation from state
  'event_candidate(wedding, X, Y) :- dating(X, Y, Start), current_timestep(Now), Duration is Now - Start, Duration > 200, trust(X, Y, T), T > 0.7',
  'event_candidate(funeral, Person, Location) :- deceased(Person, _, _), at_location(Person, Location)',
  'event_candidate(festival, Location, harvest) :- has_surplus(Location, food), resource(Location, food, Amount), Amount > 100',
  'event_candidate(trial, Accused, Crime) :- accused(Accused, Crime, _), \\+ solved(_, Crime)',

  // Dialogue topic generation from relationships
  'dialogue_topic(X, Y, gossip, Z) :- knows(X, Z, _), knows(Y, Z, _), Z \\= X, Z \\= Y',
  'dialogue_topic(X, Y, trade, Resource) :- occupation(X, merchant), has_surplus(_, Resource)',
  'dialogue_topic(X, Y, family, Child) :- parent_of(X, Child), knows(Y, Child, _)',
  'dialogue_topic(X, Y, conflict, Enemy) :- enemies(X, Enemy), knows(Y, Enemy, _)',
];

// ── LLM Cost Reduction Rules ──────────────────────────────────────────────

const LLM_REDUCTION_RULES = [
  // Can answer without AI: factual queries about known state
  'answerable_by_prolog(who_is, Person) :- person(Person)',
  'answerable_by_prolog(age_of, Person) :- age(Person, _)',
  'answerable_by_prolog(occupation_of, Person) :- occupation(Person, _)',
  'answerable_by_prolog(location_of, Person) :- at_location(Person, _)',
  'answerable_by_prolog(relationship, Person) :- married_to(Person, _)',
  'answerable_by_prolog(relationship, Person) :- parent_of(Person, _)',
  'answerable_by_prolog(relationship, Person) :- parent_of(_, Person)',

  // Dialogue that can use templates instead of AI
  'template_dialogue(greeting, X, Y) :- person(X), person(Y), \\+ enemies(X, Y)',
  'template_dialogue(farewell, X, Y) :- person(X), person(Y)',
  'template_dialogue(trade_offer, X, Y) :- occupation(X, merchant), person(Y)',
  'template_dialogue(family_news, X, Y) :- parent_of(X, Child), knows(Y, Child, _)',

  // Decision that Prolog can make without AI
  'prolog_decidable(should_marry, X, Y) :- can_marry(X, Y)',
  'prolog_decidable(should_trade, X, Y) :- can_trade(X, Y, _, _)',
  'prolog_decidable(should_hire, Person, Position) :- qualified_for(Person, Position)',
  'prolog_decidable(should_socialize, Person) :- should_socialize(Person)',
  'prolog_decidable(should_flee, Person) :- enemies(Person, Enemy), same_location(Person, Enemy)',

  // Classify query complexity (prolog_simple = no AI needed)
  'query_complexity(simple, Q) :- answerable_by_prolog(Q, _)',
  'query_complexity(template, Q) :- template_dialogue(Q, _, _)',
  'query_complexity(decidable, Q) :- prolog_decidable(Q, _)',
  'query_complexity(needs_ai, _)',
];

// ── Exported Functions ────────────────────────────────────────────────────

/**
 * Get all advanced Prolog predicates as a complete program.
 */
export function getAdvancedPredicates(): string {
  const lines: string[] = [];

  lines.push('% Advanced Prolog Predicates - Phase 13');
  lines.push(`% Generated: ${new Date().toISOString()}`);
  lines.push('');

  // Dynamic declarations
  for (const pred of DYNAMIC_DECLARATIONS) {
    lines.push(`:- dynamic(${pred}).`);
  }
  lines.push('');

  // Helper: sum_list (not always available)
  lines.push('% Helper predicates');
  lines.push('sum_list([], 0).');
  lines.push('sum_list([H|T], Sum) :- sum_list(T, Rest), Sum is H + Rest.');
  lines.push('');

  const sections: { name: string; rules: string[] }[] = [
    { name: 'Resource Constraints', rules: RESOURCE_RULES },
    { name: 'Probabilistic Reasoning', rules: PROBABILISTIC_RULES },
    { name: 'Abductive Reasoning (Mystery)', rules: ABDUCTIVE_RULES },
    { name: 'Meta-Predicates (Governance)', rules: META_RULES },
    { name: 'Procedural Content Generation', rules: PROCEDURAL_RULES },
    { name: 'LLM Cost Reduction', rules: LLM_REDUCTION_RULES },
  ];

  for (const section of sections) {
    lines.push(`% === ${section.name} ===`);
    for (const rule of section.rules) { lines.push(`${rule}.`); }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Get just the dynamic predicate declarations.
 */
export function getAdvancedDynamicPredicates(): string[] {
  return [...DYNAMIC_DECLARATIONS];
}

/**
 * Check if a query can be answered by Prolog without AI.
 * Returns the complexity level.
 */
export function getQueryComplexityRules(): string {
  return LLM_REDUCTION_RULES.map(r => `${r}.`).join('\n');
}
