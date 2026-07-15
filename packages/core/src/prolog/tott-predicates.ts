/**
 * Talk of the Town (TotT) Prolog Predicates
 *
 * Generates Prolog rules that mirror the TotT social simulation modules.
 * These allow the Prolog engine to evaluate the same decisions that the
 * TypeScript systems make, enabling a gradual migration path:
 *
 * Phase 1: Prolog predicates run alongside TypeScript (validation/shadow mode)
 * Phase 2: TypeScript queries Prolog for decisions, manages state changes
 * Phase 3: Full Prolog-first simulation with TypeScript as execution layer
 *
 * Modules covered:
 *   - hiring-system     → qualified_for/2, available_position/2, best_candidate/3
 *   - social-dynamics    → will_befriend/2, compatibility/3, should_socialize/1
 *   - economics-system   → can_afford/2, market_price/2, economic_class/2
 *   - lifecycle-system   → can_marry/2, of_age/1, can_conceive/1
 *   - knowledge-system   → (already covered by Phase 6 predicates)
 */

// ── Dynamic Declarations ──────────────────────────────────────────────────

const DYNAMIC_DECLARATIONS = [
  // Hiring
  'qualified_for/2', 'has_experience/3', 'available_position/2',
  'position_skill_requirement/3', 'employed_at/3', 'job_level/2',
  'salary/2', 'years_experience/3',
  // Social dynamics
  'compatibility/3', 'charge/3', 'spark/3', 'trust/3',
  'salience/3', 'social_desire/2',
  // Economics
  'wealth/2', 'economic_class/2', 'owns_business/2',
  'market_price/3', 'supply/3', 'demand/3',
  'debt/3', 'income/2',
  // Lifecycle
  'romantic_status/3', 'pregnant/3', 'education/4',
  'life_stage/2', 'death_probability/2',
  'dating/3', 'married_to/2', 'divorced_from/3',
  'attracted_to/2',
  // Simulation per-timestep state (asserted by the simulation loop)
  'birth_chance/2',       // birth_chance(MotherId, Probability) — fertility adjusted by child count
  'random_chance/1',      // random_chance(P) — succeeds with probability P (implemented as JS bridge)
  // General state
  'current_timestep/1', 'current_year/1',
];

// ── Hiring System Rules ───────────────────────────────────────────────────

const HIRING_RULES = [
  // Qualification check
  'qualified_for(Person, Position) :- has_skill(Person, Skill, Level), position_skill_requirement(Position, Skill, MinLevel), Level >= MinLevel',
  'overqualified_for(Person, Position) :- has_skill(Person, Skill, Level), position_skill_requirement(Position, Skill, MinLevel), Level > MinLevel + 3',

  // Candidate scoring (simplified from evaluateCandidate)
  'candidate_score(Person, Position, Score) :- qualified_for(Person, Position), has_skill(Person, Skill, Level), position_skill_requirement(Position, Skill, _), age(Person, Age), AgeBonus is max(0, min(10, 40 - abs(Age - 30))), Score is Level * 10 + AgeBonus',

  // Best candidate selection
  'better_candidate(P1, P2, Position) :- candidate_score(P1, Position, S1), candidate_score(P2, Position, S2), S1 > S2',

  // Available for hiring
  'can_be_hired(Person) :- person(Person), adult(Person), alive(Person), \\+ employed(Person)',
  'can_be_hired(Person) :- person(Person), adult(Person), alive(Person), employed_at(Person, _, _), job_level(Person, Level), Level < 3',

  // Vacancy exists
  'has_vacancy(Business, Position) :- available_position(Business, Position), \\+ filled_position(Business, Position)',
  'filled_position(Business, Position) :- employed_at(_, Business, Position)',

  // Promotion eligibility
  'can_promote(Person) :- employed_at(Person, Business, Position), years_experience(Person, Position, Years), Years >= 3',
  'should_fire(Person) :- employed_at(Person, Business, _), job_level(Person, Level), Level < 1',
];

// ── Social Dynamics Rules ─────────────────────────────────────────────────

const SOCIAL_DYNAMICS_RULES = [
  // Compatibility (simplified from calculateCompatibility)
  'compatible(X, Y) :- compatibility(X, Y, C), C > 0.5',
  'highly_compatible(X, Y) :- compatibility(X, Y, C), C > 0.8',
  'incompatible(X, Y) :- compatibility(X, Y, C), C < 0.2',

  // Personality-based compatibility
  'personality_match(X, Y, Score) :- personality(X, openness, O1), personality(Y, openness, O2), personality(X, agreeableness, A1), personality(Y, agreeableness, A2), Diff1 is abs(O1 - O2), Diff2 is abs(A1 - A2), Score is 1.0 - (Diff1 + Diff2) / 2.0',

  // Relationship quality
  'positive_relationship(X, Y) :- charge(X, Y, C), C > 0',
  'negative_relationship(X, Y) :- charge(X, Y, C), C < 0',
  'strong_bond(X, Y) :- charge(X, Y, C), C > 10, trust(X, Y, T), T > 0.6',
  'weak_bond(X, Y) :- charge(X, Y, C), C > 0, C < 3',

  // Friendship potential
  'will_befriend(X, Y) :- person(X), person(Y), X \\= Y, alive(X), alive(Y), compatible(X, Y), \\+ enemies(X, Y), same_location(X, Y)',

  // Socialization
  'should_socialize(X) :- personality(X, extroversion, E), E > 0.4, social_desire(X, D), D > 0.3',
  'avoids_socializing(X) :- personality(X, extroversion, E), E < 0.3',

  // Salience-based interaction
  'salient_to(X, Y) :- salience(X, Y, S), S > 50',
  'highly_salient_to(X, Y) :- salience(X, Y, S), S > 100',
  'most_salient(X, Y) :- salient_to(X, Y), \\+ (salient_to(X, Z), Z \\= Y, salience(X, Z, SZ), salience(X, Y, SY), SZ > SY)',

  // Trust calculation
  'trustworthy(X, Y) :- trust(X, Y, T), T > 0.6',
  'distrusted(X, Y) :- trust(X, Y, T), T < 0.3',

  // Age-based social dynamics
  'age_appropriate_social(X, Y) :- age(X, AX), age(Y, AY), Diff is abs(AX - AY), Diff < 15',
  'generation_gap(X, Y) :- age(X, AX), age(Y, AY), Diff is abs(AX - AY), Diff >= 20',
];

// ── Economics System Rules ────────────────────────────────────────────────

const ECONOMICS_RULES = [
  // Wealth classification
  'is_wealthy(X) :- economic_class(X, wealthy)',
  'is_wealthy(X) :- economic_class(X, rich)',
  'is_poor(X) :- economic_class(X, poor)',
  'is_poor(X) :- economic_class(X, destitute)',
  'is_middle_class(X) :- economic_class(X, middle)',

  // Affordability
  'can_afford(X, Amount) :- wealth(X, W), W >= Amount',
  'cannot_afford(X, Amount) :- wealth(X, W), W < Amount',

  // Business ownership
  'is_business_owner(X) :- owns_business(X, _)',
  'business_has_employees(B) :- employed_at(_, B, _)',
  'business_employee_count(B, Count) :- findall(E, employed_at(E, B, _), Es), length(Es, Count)',

  // Trade feasibility
  'can_trade(Buyer, Seller, Item, Price) :- can_afford(Buyer, Price), wealth(Seller, _), market_price(Item, _, Price)',

  // Economic mobility
  'upward_mobility(X) :- economic_class(X, Class), income(X, I), I > 100, (Class = poor ; Class = middle)',
  'downward_risk(X) :- economic_class(X, Class), debt(X, _, Amount), Amount > 0, wealth(X, W), W < Amount',

  // Employment economics
  'earns_more_than(X, Y) :- salary(X, SX), salary(Y, SY), SX > SY',
  'underpaid(X) :- salary(X, S), has_skill(X, _, Level), Level > 5, S < 50',

  // Market dynamics
  'oversupplied(Item, Location) :- supply(Item, Location, S), demand(Item, Location, D), S > D * 1.5',
  'undersupplied(Item, Location) :- supply(Item, Location, S), demand(Item, Location, D), D > S * 1.5',
  'fair_price(Item, Location) :- market_price(Item, Location, P), P > 0',
];

// ── Lifecycle System Rules ────────────────────────────────────────────────

const LIFECYCLE_RULES = [
  // Life stage derivation (mirrors getLifeStage)
  'infant(X) :- age(X, A), A < 2',
  'toddler(X) :- age(X, A), A >= 2, A < 6',
  'child(X) :- age(X, A), A >= 6, A < 13',
  'adolescent(X) :- age(X, A), A >= 13, A < 18',
  'young_adult(X) :- age(X, A), A >= 18, A < 30',
  'adult(X) :- age(X, A), A >= 18',
  'middle_aged(X) :- age(X, A), A >= 40, A < 65',
  'elderly(X) :- age(X, A), A >= 65',

  // Marriage eligibility (mirrors canMarry conditions)
  'can_marry(X, Y) :- adult(X), adult(Y), X \\= Y, unmarried(X), unmarried(Y), alive(X), alive(Y), \\+ sibling_of(X, Y), \\+ parent_of(X, Y), \\+ parent_of(Y, X)',
  'of_age(X) :- age(X, A), A >= 18',
  'eligible_for_marriage(X) :- of_age(X), unmarried(X), alive(X)',

  // Romantic compatibility (mirrors calculateRomanticCompatibility)
  'romantically_compatible(X, Y) :- can_marry(X, Y), compatible(X, Y)',
  'strong_romantic_match(X, Y) :- romantically_compatible(X, Y), compatibility(X, Y, C), C > 0.7',

  // Dating progression
  'ready_to_date(X) :- adult(X), unmarried(X), alive(X), \\+ dating(X, _, _)',
  'should_propose(X, Y) :- dating(X, Y, Start), current_timestep(Now), D is Now - Start, D > 200, trust(X, Y, T), T > 0.8, charge(X, Y, C), C > 15',

  // Pregnancy eligibility (mirrors checkPregnancyEligibility)
  'can_conceive(X) :- gender(X, female), age(X, A), A >= 18, A =< 45, married_to(X, _), \\+ pregnant(X, _, _)',

  // Death probability (mirrors calculateDeathProbability)
  'low_death_risk(X) :- age(X, A), A < 50',
  'moderate_death_risk(X) :- age(X, A), A >= 50, A < 70',
  'high_death_risk(X) :- age(X, A), A >= 70, A < 85',
  'very_high_death_risk(X) :- age(X, A), A >= 85',

  // Education eligibility
  'school_age(X) :- age(X, A), A >= 6, A < 18',
  'can_enroll(X) :- school_age(X), \\+ student(X)',
  'can_graduate(X) :- student(X), age(X, A), A >= 18',
  'apprentice_age(X) :- age(X, A), A >= 14, A < 20',

  // Inheritance
  'primary_heir(Deceased, Heir) :- parent_of(Deceased, Heir), alive(Heir)',
  'spouse_heir(Deceased, Spouse) :- married_to(Deceased, Spouse), alive(Spouse)',
];

// ── Simulation Event Rules ───────────────────────────────────────────────
// These are the "should happen this timestep" predicates that drive
// the Prolog-first simulation loop. Each collects a list of events
// that the TotT effect handlers should execute.

const SIMULATION_EVENT_RULES = [
  // ── Death events ──────────────────────────────────────────────────
  // A person should die if they are elderly and pass a probability check.
  // death_probability/2 is asserted per-character by the simulation loop
  // based on age curves (matching TotT's calculateDeathProbability).
  'should_die(X, old_age) :- person(X), alive(X), age(X, A), A >= 68, death_probability(X, P), random_chance(P)',

  // Collect all deaths for this timestep
  'pending_deaths(Deaths) :- findall(death(X, Cause), should_die(X, Cause), Deaths)',

  // ── Marriage events ───────────────────────────────────────────────
  // Two people should marry if they are both eligible, compatible,
  // and pass a random chance check (lo-fi: ~15% per eligible pair per year)
  'should_marry(X, Y) :- eligible_for_marriage(X), eligible_for_marriage(Y), X @< Y, gender(X, GX), gender(Y, GY), GX \\= GY, compatible(X, Y), random_chance(0.15)',

  // Collect all marriages
  'pending_marriages(Marriages) :- findall(marry(X, Y), should_marry(X, Y), Marriages)',

  // ── Birth events ──────────────────────────────────────────────────
  // A woman should conceive if married, of childbearing age, not pregnant,
  // and passes a fertility check. birth_chance/2 is asserted per-character.
  'should_conceive(Mother, Father) :- person(Mother), alive(Mother), gender(Mother, female), age(Mother, A), A >= 18, A =< 45, married_to(Mother, Father), alive(Father), \\+ pregnant(Mother, _, _), birth_chance(Mother, P), random_chance(P)',

  // Collect all conceptions
  'pending_conceptions(Conceptions) :- findall(conceive(M, F), should_conceive(M, F), Conceptions)',

  // Birth from existing pregnancy (due date reached)
  'should_give_birth(Mother) :- pregnant(Mother, _, DueDate), current_timestep(Now), Now >= DueDate',
  'pending_births(Births) :- findall(birth(M), should_give_birth(M), Births)',

  // ── Divorce events ────────────────────────────────────────────────
  'should_divorce(X, Y) :- married_to(X, Y), X @< Y, alive(X), alive(Y), bad_relationship(X, Y), random_chance(0.01)',
  'pending_divorces(Divorces) :- findall(divorce(X, Y), should_divorce(X, Y), Divorces)',

  // ── Education events ──────────────────────────────────────────────
  'should_enroll(X) :- person(X), alive(X), age(X, A), A >= 18, A =< 22, \\+ student(X), \\+ employed(X), personality(X, conscientiousness, C), C > 0.3, personality(X, openness, O), O > 0.3, random_chance(0.3)',
  'pending_enrollments(Enrollments) :- findall(enroll(X), should_enroll(X), Enrollments)',

  // ── Business events ───────────────────────────────────────────────
  'should_found_business(X) :- person(X), alive(X), adult(X), \\+ employed(X), age(X, A), A >= 25, A =< 60, random_chance(0.05)',
  'should_close_business(B) :- business(B), \\+ business_out_of_business(B), random_chance(0.02)',
  'pending_business_foundings(Foundings) :- findall(found(X), should_found_business(X), Foundings)',
  'pending_business_closings(Closings) :- findall(close(B), should_close_business(B), Closings)',

  // ── Hiring events ─────────────────────────────────────────────────
  'should_hire(Business, Person, Position) :- has_vacancy(Business, Position), can_be_hired(Person), qualified_for(Person, Position)',
  'pending_hires(Hires) :- findall(hire(B, P, Pos), should_hire(B, P, Pos), Hires)',

  // ── Master event collector ────────────────────────────────────────
  // Query this to get ALL events that should fire this timestep.
  // Returns a list of event terms. The simulation loop iterates this
  // and dispatches each to the appropriate TotT effect handler.
  'collect_simulation_events(Events) :- pending_deaths(D), pending_marriages(M), pending_conceptions(C), pending_births(B), pending_divorces(Div), pending_enrollments(E), pending_business_foundings(BF), pending_business_closings(BC), append(D, M, DM), append(DM, C, DMC), append(DMC, B, DMCB), append(DMCB, Div, DMCBDiv), append(DMCBDiv, E, DMCBDivE), append(DMCBDivE, BF, All1), append(All1, BC, Events)',
];

// ── Exported Functions ────────────────────────────────────────────────────

/**
 * Get all TotT Prolog predicates as a complete program.
 */
export function getTotTPredicates(): string {
  const lines: string[] = [];

  lines.push('% Talk of the Town - Social Simulation Prolog Predicates');
  lines.push(`% Generated: ${new Date().toISOString()}`);
  lines.push('');

  // Dynamic declarations
  for (const pred of DYNAMIC_DECLARATIONS) {
    lines.push(`:- dynamic(${pred}).`);
  }
  lines.push('');

  // Section: Hiring
  lines.push('% === Hiring System ===');
  for (const rule of HIRING_RULES) { lines.push(`${rule}.`); }
  lines.push('');

  // Section: Social Dynamics
  lines.push('% === Social Dynamics ===');
  for (const rule of SOCIAL_DYNAMICS_RULES) { lines.push(`${rule}.`); }
  lines.push('');

  // Section: Economics
  lines.push('% === Economics ===');
  for (const rule of ECONOMICS_RULES) { lines.push(`${rule}.`); }
  lines.push('');

  // Section: Lifecycle
  lines.push('% === Lifecycle ===');
  for (const rule of LIFECYCLE_RULES) { lines.push(`${rule}.`); }
  lines.push('');

  // Section: Simulation Events
  lines.push('% === Simulation Event Rules ===');
  for (const rule of SIMULATION_EVENT_RULES) { lines.push(`${rule}.`); }
  lines.push('');

  // Helper queries
  lines.push('% === Helper Queries ===');
  lines.push('all_candidates(Position, Candidates) :- findall(P, (can_be_hired(P), qualified_for(P, Position)), Candidates).');
  lines.push('all_vacancies(Business, Positions) :- findall(P, has_vacancy(Business, P), Positions).');
  lines.push('all_eligible_bachelors(Bachelors) :- findall(P, (eligible_for_marriage(P), gender(P, male)), Bachelors).');
  lines.push('all_eligible_bachelorettes(Bachelorettes) :- findall(P, (eligible_for_marriage(P), gender(P, female)), Bachelorettes).');
  lines.push('potential_couples(X, Y) :- eligible_for_marriage(X), eligible_for_marriage(Y), X @< Y, romantically_compatible(X, Y).');

  return lines.join('\n');
}

/**
 * Get just the dynamic predicate declarations.
 */
export function getTotTDynamicPredicates(): string[] {
  return [...DYNAMIC_DECLARATIONS];
}
