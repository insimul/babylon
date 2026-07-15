/**
 * NPC Reasoning via Prolog
 *
 * Provides Prolog rules for NPC decision-making, lifecycle events,
 * and social dynamics. These rules are loaded into the tau-prolog engine
 * to drive NPC behavior based on knowledge base facts.
 *
 * Categories:
 *   - Lifecycle rules (romance, marriage, birth, death, education)
 *   - Decision-making rules (action selection, dialogue choice)
 *   - Social reasoning (relationship formation, knowledge sharing)
 *   - Emotional state derivation
 */

// ── Dynamic Declarations ──────────────────────────────────────────────────

const DYNAMIC_DECLARATIONS = [
  // Lifecycle
  'attracted_to/2', 'dating/3', 'married_to/2', 'marriage_date/3',
  'divorced_from/3', 'pregnant/3', 'gave_birth/3', 'birth_parent/2',
  'primary_caregiver/2', 'stepparent/2',
  'student/1', 'student_of/3', 'graduated/3', 'mentor/3', 'apprentice/3',
  'has_skill/3', 'learning/3',
  'came_of_age/2', 'eligible_for_marriage/1', 'eligible_for_work/1',
  'deceased/3', 'cause_of_death/2', 'inherits_from/3', 'estate_of/2',
  // Social
  'friends/2', 'enemies/2', 'rival/2',
  'conversation_count/3', 'relationship_charge/3', 'relationship_trust/3',
  'current_timestep/1',
  // Emotional
  'mood/2', 'stress_level/2', 'social_desire/2',
  // Action/dialogue
  'npc_action_preference/3', 'dialogue_topic_preference/3',
  // Personality
  'personality/3',
  // Employment
  'employed/1', 'employed_at/3', 'business_needs_worker/2',
  // Daily schedule
  'schedule/4', 'time_of_day/1',
  // Quest memory
  'npc_gave_quest/3', 'quest_outcome/3',
  'npc_quest_count/3', 'npc_quest_completed_count/3',
  'npc_quest_failed_count/3', 'npc_quest_abandoned_count/3',
  // Environment awareness
  'weather/1', 'game_hour/1', 'time_period/1', 'season/1',
  // Player progress
  'player_quests_completed/1', 'player_reputation/1', 'player_is_new/0',
  // Active quests
  'quest_active/2', 'quest_completed/2', 'quest_failed/2',
  // Recent events
  'recent_event/2',
];

// ── Lifecycle Rules ───────────────────────────────────────────────────────

const LIFECYCLE_RULES = [
  // Life stages
  'child(X) :- age(X, A), A < 18',
  'adolescent(X) :- age(X, A), A >= 13, A < 18',
  'adult(X) :- age(X, A), A >= 18',
  'elderly(X) :- age(X, A), A >= 65',
  'unmarried(X) :- person(X), \\+ married_to(X, _)',

  // Extended family
  'grandmother_of(GM, GC) :- gender(GM, female), grandparent_of(GM, GC)',
  'grandfather_of(GF, GC) :- gender(GF, male), grandparent_of(GF, GC)',
  'aunt_of(A, N) :- gender(A, female), sibling_of(A, P), parent_of(P, N)',
  'uncle_of(U, N) :- gender(U, male), sibling_of(U, P), parent_of(P, N)',
  'cousin_of(C1, C2) :- parent_of(P1, C1), parent_of(P2, C2), sibling_of(P1, P2), C1 \\= C2',
  'parent_in_law(PIL, CIL) :- parent_of(PIL, Spouse), married_to(Spouse, CIL)',
  'sibling_in_law(SIL1, SIL2) :- sibling_of(SIL1, Spouse), married_to(Spouse, SIL2)',

  // Romantic triggers
  'can_be_attracted(X, Y) :- adult(X), adult(Y), unmarried(X), unmarried(Y), X \\= Y, \\+ attracted_to(X, Y)',
  'mutual_attraction(X, Y) :- attracted_to(X, Y), attracted_to(Y, X)',
  'can_start_dating(X, Y) :- mutual_attraction(X, Y), \\+ dating(X, _, _), \\+ dating(Y, _, _)',
  'long_dating(X, Y) :- dating(X, Y, Start), current_timestep(Now), D is Now - Start, D > 200',
  'can_propose(X, Y) :- long_dating(X, Y), relationship_trust(X, Y, T), T > 0.8',

  // Reproduction
  'can_have_child(X, Y) :- married_to(X, Y), gender(X, female), age(X, A), A >= 18, A =< 45, \\+ pregnant(X, _, _)',

  // Education
  'can_start_school(X) :- child(X), age(X, A), A >= 6, \\+ student(X)',
  'can_apprentice(X) :- adolescent(X), age(X, A), A >= 14, \\+ apprentice(X, _, _)',
  'skilled_in(X, Skill) :- has_skill(X, Skill, Level), Level >= 3',

  // Coming of age
  'newly_adult(X) :- came_of_age(X, T), current_timestep(Now), D is Now - T, D < 10',
  'can_seek_employment(X) :- adult(X), \\+ employed(X)',

  // Death
  'alive(X) :- person(X), \\+ deceased(X, _, _)',
  'is_deceased(X) :- deceased(X, _, _)',
  'has_living_children(X) :- parent_of(X, C), alive(C)',
];

// ── Decision-Making Rules ─────────────────────────────────────────────────

const DECISION_RULES = [
  // NPC should socialize if extroverted and has social desire
  'wants_to_socialize(X) :- personality(X, extroversion, E), E > 0.5, social_desire(X, D), D > 0.3',

  // NPC prefers solitude if introverted
  'wants_solitude(X) :- personality(X, extroversion, E), E < 0.3',

  // NPC is stressed - should seek coping
  'is_stressed(X) :- stress_level(X, S), S > 0.7',
  'needs_rest(X) :- energy(X, E), E < 20',

  // Social approach - who to talk to
  'should_talk_to(X, Y) :- wants_to_socialize(X), person(Y), X \\= Y, alive(Y), same_location(X, Y), \\+ enemies(X, Y)',
  'should_avoid(X, Y) :- enemies(X, Y), alive(Y)',

  // Dialogue topic selection based on personality
  'prefers_topic(X, ideas) :- personality(X, openness, O), O > 0.7',
  'prefers_topic(X, work) :- personality(X, conscientiousness, C), C > 0.7',
  'prefers_topic(X, gossip) :- personality(X, extroversion, E), E > 0.7',
  'prefers_topic(X, feelings) :- personality(X, neuroticism, N), N > 0.6',
  'prefers_topic(X, cooperation) :- personality(X, agreeableness, A), A > 0.7',

  // Action preferences
  'prefers_peaceful_action(X) :- personality(X, agreeableness, A), A > 0.6',
  'prefers_risky_action(X) :- personality(X, openness, O), O > 0.7, personality(X, conscientiousness, C), C < 0.4',
  'prefers_social_action(X) :- personality(X, extroversion, E), E > 0.6',

  // Conflict resolution style
  'conflict_style(X, compromise) :- personality(X, agreeableness, A), A > 0.5, personality(X, extroversion, E), E > 0.5',
  'conflict_style(X, submit) :- personality(X, agreeableness, A), A > 0.5, personality(X, extroversion, E), E =< 0.5',
  'conflict_style(X, dominate) :- personality(X, agreeableness, A), A =< 0.5, personality(X, extroversion, E), E > 0.5',
  'conflict_style(X, withdraw) :- personality(X, agreeableness, A), A =< 0.5, personality(X, extroversion, E), E =< 0.5',
];

// ── Social Reasoning Rules ────────────────────────────────────────────────

const SOCIAL_RULES = [
  // Friendship formation
  'can_befriend(X, Y) :- person(X), person(Y), X \\= Y, alive(X), alive(Y), \\+ friends(X, Y), \\+ enemies(X, Y), same_location(X, Y)',
  'should_befriend(X, Y) :- can_befriend(X, Y), personality(X, agreeableness, A), A > 0.5',

  // Relationship quality assessment
  'good_relationship(X, Y) :- relationship_charge(X, Y, C), C > 5',
  'bad_relationship(X, Y) :- relationship_charge(X, Y, C), C < -5',
  'trusted_person(X, Y) :- relationship_trust(X, Y, T), T > 0.6',
  'distrusted_person(X, Y) :- relationship_trust(X, Y, T), T < 0.3',

  // Knowledge sharing willingness
  'willing_to_share(X, Y) :- trusted_person(X, Y), personality(X, agreeableness, A), A > 0.4',
  'will_gossip(X, Y) :- personality(X, extroversion, E), E > 0.6, \\+ distrusted_person(X, Y)',
  'will_keep_secret(X) :- personality(X, agreeableness, A), A > 0.7, personality(X, conscientiousness, C), C > 0.6',

  // Family obligation
  'has_family_obligation(X, Y) :- parent_of(X, Y), child(Y)',
  'has_family_obligation(X, Y) :- married_to(X, Y)',
  'has_family_obligation(X, Y) :- primary_caregiver(X, Y)',
];

// ── Emotional State Rules ─────────────────────────────────────────────────

const EMOTIONAL_RULES = [
  // Derive mood from facts
  'is_happy(X) :- mood(X, happy)',
  'is_happy(X) :- mood(X, joyful)',
  'is_sad(X) :- mood(X, sad)',
  'is_sad(X) :- mood(X, grieving)',
  'is_angry(X) :- mood(X, angry)',
  'is_anxious(X) :- mood(X, anxious)',
  'is_content(X) :- mood(X, content)',

  // Grieving
  'is_grieving(X) :- parent_of(X, C), is_deceased(C)',
  'is_grieving(X) :- married_to(X, S), is_deceased(S)',
  'is_grieving(X) :- parent_of(P, X), is_deceased(P)',

  // Lonely
  'is_lonely(X) :- wants_to_socialize(X), \\+ friends(X, _)',
  'is_lonely(X) :- wants_to_socialize(X), social_desire(X, D), D > 0.8',

  // Fulfilled
  'is_fulfilled(X) :- employed(X), has_living_children(X), married_to(X, _)',
  'is_partially_fulfilled(X) :- employed(X), friends(X, _)',
];

// ── Memory Rules ──────────────────────────────────────────────────────────

const MEMORY_RULES = [
  // Player interaction tracking
  'remembers_player(NPC) :- knows(NPC, player, name)',
  'had_positive_interaction(NPC, Player) :- relationship_charge(NPC, Player, C), C > 0',
  'had_negative_interaction(NPC, Player) :- relationship_charge(NPC, Player, C), C < 0',
  'first_meeting(NPC, Player) :- \\+ has_mental_model(NPC, Player)',
];

// ── Quest Memory Rules ──────────────────────────────────────────────────

const QUEST_MEMORY_RULES = [
  // NPC remembers giving a quest to the player
  'npc_remembers_quest(NPC, Player, QuestId) :- npc_gave_quest(NPC, Player, QuestId)',

  // Player reliability from quest outcomes
  'player_completed_quest_for(NPC, Player) :- npc_gave_quest(NPC, Player, Q), quest_outcome(Q, Player, completed)',
  'player_failed_quest_for(NPC, Player) :- npc_gave_quest(NPC, Player, Q), quest_outcome(Q, Player, failed)',
  'player_abandoned_quest_for(NPC, Player) :- npc_gave_quest(NPC, Player, Q), quest_outcome(Q, Player, abandoned)',

  // NPC disposition toward giving quests
  'npc_eager_to_give_quest(NPC, Player) :- npc_quest_completed_count(NPC, Player, C), C > 0, \\+ player_failed_quest_for(NPC, Player), \\+ player_abandoned_quest_for(NPC, Player)',
  'npc_cautious_about_quest(NPC, Player) :- player_failed_quest_for(NPC, Player), player_completed_quest_for(NPC, Player)',
  'npc_reluctant_to_give_quest(NPC, Player) :- npc_quest_failed_count(NPC, Player, F), F > 0, \\+ player_completed_quest_for(NPC, Player)',
  'npc_reluctant_to_give_quest(NPC, Player) :- npc_quest_abandoned_count(NPC, Player, A), A >= 2',

  // Quest dialogue hints — NPC references past quest outcomes
  'should_mention_past_quest(NPC, Player) :- npc_gave_quest(NPC, Player, _)',
  'should_thank_player(NPC, Player) :- player_completed_quest_for(NPC, Player)',
  'should_scold_player(NPC, Player) :- player_abandoned_quest_for(NPC, Player), personality(NPC, agreeableness, A), A < 0.5',
  'should_encourage_player(NPC, Player) :- player_failed_quest_for(NPC, Player), personality(NPC, agreeableness, A), A > 0.5',
];

// ── Environment Awareness Rules ──────────────────────────────────────────

const ENVIRONMENT_AWARENESS_RULES = [
  // Weather-driven behavior
  'should_seek_shelter(X) :- weather(storm), personality(X, neuroticism, N), N > 0.4',
  'should_seek_shelter(X) :- weather(rain), personality(X, conscientiousness, C), C > 0.6',
  'enjoys_weather(X) :- weather(clear), personality(X, openness, O), O > 0.5',
  'enjoys_weather(X) :- weather(snow), personality(X, openness, O), O > 0.7',
  'weather_complaint_likely(X) :- weather(storm), personality(X, neuroticism, N), N > 0.5',
  'weather_complaint_likely(X) :- weather(rain), personality(X, neuroticism, N), N > 0.6',

  // Time-driven dialogue topics
  'prefers_topic(X, morning_routine) :- time_period(morning), personality(X, conscientiousness, C), C > 0.5',
  'prefers_topic(X, evening_plans) :- time_period(evening), personality(X, extroversion, E), E > 0.5',
  'prefers_topic(X, weather) :- weather(rain)',
  'prefers_topic(X, weather) :- weather(storm)',
  'prefers_topic(X, weather) :- weather(snow)',

  // Quest awareness affects dialogue
  'prefers_topic(X, quests) :- npc_gave_quest(X, player, _), quest_active(player, _)',
  'is_quest_giver(X) :- npc_gave_quest(X, player, _)',

  // Player progress affects NPC attitude
  'respects_player(NPC) :- player_quests_completed(C), C > 3, personality(NPC, conscientiousness, Con), Con > 0.3',
  'impressed_by_player(NPC) :- player_quests_completed(C), C > 5, player_reputation(R), R > 50',
  'wary_of_newcomer(NPC) :- player_is_new, personality(NPC, neuroticism, N), N > 0.5',
  'welcoming_to_newcomer(NPC) :- player_is_new, personality(NPC, agreeableness, A), A > 0.5',

  // Late-night behavior
  'should_be_sleeping(X) :- time_period(night), personality(X, conscientiousness, C), C > 0.6',
  'is_night_owl(X) :- time_period(night), personality(X, openness, O), O > 0.6, personality(X, conscientiousness, C), C < 0.4',
];

// ── Daily Schedule Rules ─────────────────────────────────────────────────

const SCHEDULE_RULES = [
  // Default schedules based on occupation
  'schedule(X, morning, workplace, work) :- person(X), occupation(X, _), \\+ dead(X)',
  'schedule(X, afternoon, workplace, work) :- person(X), occupation(X, _), \\+ dead(X)',
  'schedule(X, evening, home, rest) :- person(X), \\+ dead(X)',
  'schedule(X, night, home, sleep) :- person(X), \\+ dead(X)',

  // Students go to school
  'schedule(X, morning, school, study) :- person(X), school_age(X), \\+ dead(X)',
  'schedule(X, afternoon, school, study) :- person(X), school_age(X), \\+ dead(X)',

  // Social NPCs socialize in the evening
  'schedule(X, evening, tavern, socialize) :- person(X), should_socialize(X), \\+ dead(X)',

  // Grieving NPCs stay home
  'schedule(X, morning, home, grieve) :- person(X), grieving(X)',
  'schedule(X, afternoon, home, grieve) :- person(X), grieving(X)',

  // Where should NPC be right now
  'expected_location(X, Location) :- time_of_day(T), schedule(X, T, Location, _)',
  'expected_activity(X, Activity) :- time_of_day(T), schedule(X, T, _, Activity)',

  // Helper: school_age is a child who is old enough for school
  'school_age(X) :- child(X), age(X, A), A >= 6',

  // Helper: should_socialize derives from wants_to_socialize
  'should_socialize(X) :- wants_to_socialize(X)',

  // Helper: grieving maps from is_grieving
  'grieving(X) :- is_grieving(X)',
];

// ── Exported Functions ────────────────────────────────────────────────────

/**
 * Get all NPC reasoning rules as a Prolog program string.
 * Load this into the tau-prolog engine at game start.
 */
export function getNPCReasoningRules(): string {
  const lines: string[] = [];

  lines.push('% NPC Reasoning Rules - Auto-generated');
  lines.push(`% Generated: ${new Date().toISOString()}`);
  lines.push('');

  // Dynamic declarations
  for (const pred of DYNAMIC_DECLARATIONS) {
    lines.push(`:- dynamic(${pred}).`);
  }
  lines.push('');

  // All rule categories
  const allRules = [
    ...LIFECYCLE_RULES,
    ...DECISION_RULES,
    ...SOCIAL_RULES,
    ...EMOTIONAL_RULES,
    ...MEMORY_RULES,
    ...QUEST_MEMORY_RULES,
    ...ENVIRONMENT_AWARENESS_RULES,
    ...SCHEDULE_RULES,
  ];

  for (const rule of allRules) {
    lines.push(`${rule}.`);
  }

  return lines.join('\n');
}

/**
 * Get dynamic declarations for NPC reasoning predicates.
 */
export function getNPCDynamicPredicates(): string[] {
  return [...DYNAMIC_DECLARATIONS];
}

/**
 * Assert personality facts for a character.
 */
export function getPersonalityFacts(characterId: string, personality: {
  openness?: number;
  conscientiousness?: number;
  extroversion?: number;
  agreeableness?: number;
  neuroticism?: number;
}): string[] {
  const id = sanitize(characterId);
  const facts: string[] = [];

  if (personality.openness !== undefined) facts.push(`personality(${id}, openness, ${personality.openness})`);
  if (personality.conscientiousness !== undefined) facts.push(`personality(${id}, conscientiousness, ${personality.conscientiousness})`);
  if (personality.extroversion !== undefined) facts.push(`personality(${id}, extroversion, ${personality.extroversion})`);
  if (personality.agreeableness !== undefined) facts.push(`personality(${id}, agreeableness, ${personality.agreeableness})`);
  if (personality.neuroticism !== undefined) facts.push(`personality(${id}, neuroticism, ${personality.neuroticism})`);

  return facts;
}

/**
 * Assert relationship facts for a pair of characters.
 */
export function getRelationshipFacts(char1Id: string, char2Id: string, relationship: {
  charge?: number;
  trust?: number;
  conversationCount?: number;
  isFriend?: boolean;
  isEnemy?: boolean;
  isMarried?: boolean;
  isDating?: boolean;
  datingStart?: number;
}): string[] {
  const id1 = sanitize(char1Id);
  const id2 = sanitize(char2Id);
  const facts: string[] = [];

  if (relationship.charge !== undefined) facts.push(`relationship_charge(${id1}, ${id2}, ${relationship.charge})`);
  if (relationship.trust !== undefined) facts.push(`relationship_trust(${id1}, ${id2}, ${relationship.trust})`);
  if (relationship.conversationCount !== undefined) facts.push(`conversation_count(${id1}, ${id2}, ${relationship.conversationCount})`);
  if (relationship.isFriend) facts.push(`friends(${id1}, ${id2})`);
  if (relationship.isEnemy) facts.push(`enemies(${id1}, ${id2})`);
  if (relationship.isMarried) facts.push(`married_to(${id1}, ${id2})`);
  if (relationship.isDating && relationship.datingStart !== undefined) {
    facts.push(`dating(${id1}, ${id2}, ${relationship.datingStart})`);
  }

  return facts;
}

/**
 * Assert emotional state facts for a character.
 */
export function getEmotionalStateFacts(characterId: string, state: {
  mood?: string;
  stressLevel?: number;
  socialDesire?: number;
  energy?: number;
}): string[] {
  const id = sanitize(characterId);
  const facts: string[] = [];

  if (state.mood) facts.push(`mood(${id}, ${sanitize(state.mood)})`);
  if (state.stressLevel !== undefined) facts.push(`stress_level(${id}, ${state.stressLevel})`);
  if (state.socialDesire !== undefined) facts.push(`social_desire(${id}, ${state.socialDesire})`);
  if (state.energy !== undefined) facts.push(`energy(${id}, ${state.energy})`);

  return facts;
}

/**
 * Get schedule-related facts for the current time of day.
 * Assert these into the engine to enable schedule queries.
 *
 * @param timeOfDay - One of 'morning', 'afternoon', 'evening', 'night'
 */
export function getScheduleFacts(timeOfDay: string): string[] {
  const sanitized = sanitize(timeOfDay);
  return [`time_of_day(${sanitized})`];
}

/**
 * Generate Prolog facts for an NPC's quest memory with a player.
 * Assert these into the engine when loading NPC quest history.
 */
export function getQuestMemoryFacts(npcId: string, playerId: string, memory: {
  questInteractions: Array<{ questId: string; outcome: string }>;
  totalQuestsGiven: number;
  completedCount: number;
  failedCount: number;
  abandonedCount: number;
}): string[] {
  const npc = sanitize(npcId);
  const player = sanitize(playerId);
  const facts: string[] = [];

  for (const qi of memory.questInteractions) {
    const qid = sanitize(qi.questId);
    facts.push(`npc_gave_quest(${npc}, ${player}, ${qid})`);
    if (qi.outcome !== 'assigned') {
      facts.push(`quest_outcome(${qid}, ${player}, ${sanitize(qi.outcome)})`);
    }
  }

  facts.push(`npc_quest_count(${npc}, ${player}, ${memory.totalQuestsGiven})`);
  facts.push(`npc_quest_completed_count(${npc}, ${player}, ${memory.completedCount})`);
  facts.push(`npc_quest_failed_count(${npc}, ${player}, ${memory.failedCount})`);
  facts.push(`npc_quest_abandoned_count(${npc}, ${player}, ${memory.abandonedCount})`);

  return facts;
}

/**
 * Generate Prolog facts for the current environment state.
 * Assert these into the engine when the environment changes.
 */
export function getEnvironmentFacts(env: {
  gameHour: number;
  timePeriod: string;
  weather: string;
  season?: string;
  playerQuestsCompleted?: number;
  playerReputation?: number;
  playerIsNew?: boolean;
}): string[] {
  const facts: string[] = [];

  facts.push(`game_hour(${env.gameHour})`);
  facts.push(`time_period(${sanitize(env.timePeriod)})`);
  facts.push(`weather(${sanitize(env.weather)})`);
  if (env.season) facts.push(`season(${sanitize(env.season)})`);
  if (env.playerQuestsCompleted !== undefined) {
    facts.push(`player_quests_completed(${env.playerQuestsCompleted})`);
  }
  if (env.playerReputation !== undefined) {
    facts.push(`player_reputation(${env.playerReputation})`);
  }
  if (env.playerIsNew) facts.push('player_is_new');

  return facts;
}

function sanitize(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^([0-9])/, '_$1')
    .replace(/_+/g, '_')
    .replace(/_$/, '');
}
