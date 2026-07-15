/**
 * Quest-to-Prolog Converter
 *
 * Converts Insimul quest definitions (objectives, completion criteria, prerequisites)
 * into Prolog predicates. Quests become queryable facts and rules:
 *
 *   quest(QuestId, Title, QuestType, Difficulty, Status).
 *   quest_objective(QuestId, ObjectiveIndex, ObjectiveGoal).
 *   quest_completion(QuestId, CriteriaGoal).
 *   quest_prerequisite(QuestId, PrerequisiteQuestId).
 *   quest_reward(QuestId, RewardType, Value).
 *   quest_available(Player, QuestId) :- <prerequisites check>.
 *   quest_complete(Player, QuestId) :- <completion criteria check>.
 */

import { getDefaultRequiredCount, OBJECTIVE_TYPE_DEFAULTS } from '../quest-objective-types.js';

// ── Types ───────────────────────────────────────────────────────────────────

interface QuestBranchChoice {
  choiceId: string;
  label: string;
  targetStageId: string;
  consequence?: string;
}

interface QuestStage {
  stageId: string;
  title: string;
  description: string;
  objectives: any[];
  preconditions?: string[];
  postconditions?: string[];
  nextStageIds?: string[];
  branchChoices?: QuestBranchChoice[];
}

interface QuestData {
  title: string;
  description?: string;
  questType: string;
  difficulty: string;
  status?: string;
  assignedTo?: string;
  assignedBy?: string | null;
  targetLanguage?: string;
  experienceReward?: number;
  objectives?: any[] | null;
  completionCriteria?: Record<string, any> | null;
  prerequisites?: any[] | null;
  prerequisiteQuestIds?: string[] | null;
  rewards?: Record<string, any> | null;
  itemRewards?: Array<{ itemId: string; quantity: number; name: string }> | null;
  skillRewards?: Array<{ skillId: string; name: string; level: number }> | null;
  unlocks?: Array<{ type: string; id: string; name: string }> | null;
  failureConditions?: Record<string, any> | null;
  questChainId?: string | null;
  questChainOrder?: number | null;
  tags?: string[] | null;
  stages?: QuestStage[] | null;
  parentQuestId?: string | null;
  locationName?: string | null;
  locationId?: string | null;
  location?: string | null;
  cefrLevel?: string | null;
  customData?: Record<string, any> | null;
  /** Quest atoms to auto-activate when this quest completes */
  activatesQuestIds?: string[] | null;
}

interface ConversionResult {
  prologContent: string;
  predicates: string[];
  errors: string[];
}

// ── Converter ───────────────────────────────────────────────────────────────

export function convertQuestToProlog(quest: QuestData): ConversionResult {
  const errors: string[] = [];
  const predicates: string[] = [];
  const lines: string[] = [];
  const questId = sanitizeAtom(quest.title);

  // Metadata comments
  lines.push(`% Quest: ${quest.title}`);
  if (quest.description) lines.push(`% ${quest.description}`);
  lines.push(`% Type: ${quest.questType} / Difficulty: ${quest.difficulty}`);
  lines.push('');

  // Core quest fact
  const status = quest.status || 'active';
  lines.push(`quest(${questId}, '${escapeString(quest.title)}', ${sanitizeAtom(quest.questType)}, ${sanitizeAtom(quest.difficulty)}, ${sanitizeAtom(status)}).`);
  predicates.push('quest/5');

  // Quest assignment
  if (quest.assignedTo) {
    lines.push(`quest_assigned_to(${questId}, '${escapeString(quest.assignedTo)}').`);
    predicates.push('quest_assigned_to/2');
  }
  if (quest.assignedBy) {
    lines.push(`quest_assigned_by(${questId}, '${escapeString(quest.assignedBy)}').`);
    predicates.push('quest_assigned_by/2');
  }

  // Target language
  if (quest.targetLanguage) {
    lines.push(`quest_language(${questId}, ${sanitizeAtom(quest.targetLanguage)}).`);
    predicates.push('quest_language/2');
  }

  // Quest chain info — DEPRECATED: sequencing is now handled by quest_prerequisite/2.
  // Chain predicates are no longer emitted to avoid redundancy.
  // Legacy quest_chain/2 and quest_chain_order/2 facts in existing content
  // are harmless but not used by the game engine at runtime.

  // Tags
  const tags = quest.tags || [];
  for (const tag of tags) {
    lines.push(`quest_tag(${questId}, ${sanitizeAtom(tag)}).`);
  }
  if (tags.length > 0) {
    predicates.push('quest_tag/2');
  }

  // Quest discovery method (how the player finds this quest)
  const discoveryMethod = deriveDiscoveryMethod(quest);
  lines.push(`quest_discovery(${questId}, ${discoveryMethod}).`);
  predicates.push('quest_discovery/2');

  // Notice board text (displayed on the physical notice board in-game)
  if ((quest as any).noticeText) {
    lines.push(`quest_notice_text(${questId}, '${escapeString((quest as any).noticeText)}').`);
    predicates.push('quest_notice_text/2');
  }

  // Quest location (where the quest takes place)
  const customData = (quest as any).customData || {};
  const locationName = quest.locationName || quest.location || customData.locationName || null;
  const locationId = quest.locationId || customData.locationId || null;
  if (locationName) {
    lines.push(`quest_location(${questId}, '${escapeString(locationName)}').`);
  } else if (locationId) {
    lines.push(`quest_location(${questId}, ${sanitizeAtom(locationId)}).`);
  } else {
    lines.push(`quest_location(${questId}, anywhere).`);
  }
  predicates.push('quest_location/2');

  // CEFR level gate. Assessment quests may carry the level in customData
  // (e.g. customData.cefrLevel or customData.assessment.cefrLevel) when
  // they target a specific proficiency band; fall back to quest.cefrLevel.
  const assessmentCefrLevel = customData?.assessment?.cefrLevel;
  const cefrLevelRaw = quest.cefrLevel || customData?.cefrLevel || assessmentCefrLevel;
  if (cefrLevelRaw) {
    lines.push(`quest_cefr_level(${questId}, ${sanitizeAtom(cefrLevelRaw)}).`);
    predicates.push('quest_cefr_level/2');
  }

  lines.push('');

  // ── Objectives → Prolog goals ──────────────────────────────────────────

  // For assessment quests, expand phases from customData.assessment into objectives
  // instead of relying on a single 'complete_assessment' objective
  const assessmentPhases = customData?.assessment?.phases;
  const isAssessmentWithPhases = quest.questType === 'assessment' && Array.isArray(assessmentPhases) && assessmentPhases.length > 0;

  if (isAssessmentWithPhases) {
    // Use the actual assessment phases as objectives
    for (let i = 0; i < assessmentPhases.length; i++) {
      const phase = assessmentPhases[i];
      const phaseId = phase.id || `phase_${i}`;
      const phaseType = phase.type || 'unknown';
      lines.push(`quest_objective(${questId}, ${i}, assessment_phase('${escapeString(phaseId)}', '${escapeString(phaseType)}')).`);
    }
    predicates.push('quest_objective/3');

    // Objective locations: each phase takes place at the quest's own location
    const questLocation = locationName
      ? `location('${escapeString(locationName)}')`
      : locationId
        ? sanitizeAtom(locationId)
        : 'anywhere';
    for (let i = 0; i < assessmentPhases.length; i++) {
      lines.push(`quest_objective_location(${questId}, ${i}, ${questLocation}).`);
    }
    predicates.push('quest_objective_location/3');
  } else {
    // Standard objective conversion
    const objectives = quest.objectives || [];
    for (let i = 0; i < objectives.length; i++) {
      const obj = objectives[i];
      const goal = convertObjective(obj, i, errors);
      if (goal) {
        lines.push(`quest_objective(${questId}, ${i}, ${goal}).`);
      }
    }
    if (objectives.length > 0) {
      predicates.push('quest_objective/3');
    }

    // Objective locations (where each objective can be completed)
    for (let i = 0; i < objectives.length; i++) {
      const obj = objectives[i];
      const type = obj.type || obj.objectiveType || '';
      const objLocation = deriveObjectiveLocation(obj, type, quest);
      lines.push(`quest_objective_location(${questId}, ${i}, ${objLocation}).`);
    }
    if (objectives.length > 0) {
      predicates.push('quest_objective_location/3');
    }

    // Objective details — conversation guidance, vocabulary, grammar topics
    for (let i = 0; i < objectives.length; i++) {
      const obj = objectives[i];
      const details = obj.details || obj.conversationGuidance || obj.prompt;
      if (details && typeof details === 'string') {
        lines.push(`quest_objective_details(${questId}, ${i}, '${escapeString(details)}').`);
      }
    }
    if (objectives.some((o: any) => o.details || o.conversationGuidance || o.prompt)) {
      predicates.push('quest_objective_details/3');
    }
  }

  lines.push('');

  // ── Completion Criteria → Prolog goal ──────────────────────────────────

  const criteria = quest.completionCriteria;
  if (criteria && typeof criteria === 'object') {
    const criteriaGoal = convertCompletionCriteria(criteria, errors);
    if (criteriaGoal) {
      lines.push(`quest_completion(${questId}, ${criteriaGoal}).`);
      predicates.push('quest_completion/2');
    }
  }
  // Default: completion requires all objectives
  if (!predicates.includes('quest_completion/2')) {
    lines.push(`quest_completion(${questId}, all_objectives_complete).`);
    predicates.push('quest_completion/2');
  }

  // ── Failure Conditions ─────────────────────────────────────────────────

  const failureConditions = quest.failureConditions;
  if (failureConditions && typeof failureConditions === 'object') {
    const failGoal = convertFailureCondition(failureConditions, errors);
    if (failGoal) {
      lines.push(`quest_failure_condition(${questId}, ${failGoal}).`);
      predicates.push('quest_failure_condition/2');
    }
  }

  lines.push('');

  // ── Prerequisites ──────────────────────────────────────────────────────

  const prereqIds = (quest.prerequisiteQuestIds || []).filter(id => id && id.trim());
  if (prereqIds.length > 0) {
    for (const prereqId of prereqIds) {
      const prereqAtom = sanitizeAtom(prereqId);
      if (prereqAtom) {
        lines.push(`quest_prerequisite(${questId}, ${prereqAtom}).`);
      }
    }
  } else {
    lines.push(`quest_prerequisite(${questId}, none).`);
  }
  predicates.push('quest_prerequisite/2');

  lines.push('');

  // ── Rewards ────────────────────────────────────────────────────────────

  const xpReward = quest.experienceReward || 0;
  if (xpReward > 0) {
    lines.push(`quest_reward(${questId}, experience, ${xpReward}).`);
    predicates.push('quest_reward/3');
  }

  // General rewards object
  const rewards = quest.rewards || {};
  for (const [key, value] of Object.entries(rewards)) {
    if (typeof value === 'number') {
      lines.push(`quest_reward(${questId}, ${sanitizeAtom(key)}, ${value}).`);
    } else if (typeof value === 'string') {
      lines.push(`quest_reward(${questId}, ${sanitizeAtom(key)}, '${escapeString(value)}').`);
    }
  }

  // Item rewards
  const itemRewards = quest.itemRewards || [];
  for (const item of itemRewards) {
    lines.push(`quest_item_reward(${questId}, '${escapeString(item.name)}', ${item.quantity}).`);
  }
  if (itemRewards.length > 0) {
    predicates.push('quest_item_reward/3');
  }

  // Skill rewards
  const skillRewards = quest.skillRewards || [];
  for (const skill of skillRewards) {
    lines.push(`quest_skill_reward(${questId}, '${escapeString(skill.name)}', ${skill.level}).`);
  }
  if (skillRewards.length > 0) {
    predicates.push('quest_skill_reward/3');
  }

  // Unlocks
  const unlocks = quest.unlocks || [];
  for (const unlock of unlocks) {
    lines.push(`quest_unlock(${questId}, ${sanitizeAtom(unlock.type)}, '${escapeString(unlock.name)}').`);
  }
  if (unlocks.length > 0) {
    predicates.push('quest_unlock/3');
  }

  // Auto-activate: when this quest completes, set target quest to 'active'
  const activatesIds = quest.activatesQuestIds || [];
  for (const targetId of activatesIds) {
    const targetAtom = sanitizeAtom(targetId);
    if (targetAtom) {
      lines.push(`quest_activates(${questId}, ${targetAtom}).`);
    }
  }
  if (activatesIds.length > 0) {
    predicates.push('quest_activates/2');
  }

  lines.push('');

  // ── quest_available rule ───────────────────────────────────────────────
  // Availability is determined by Prolog at runtime. The rule checks:
  //   1. The quest exists (quest/5 fact)
  //   2. All prerequisites are met (quest_prerequisite/2 + quest_status/3)
  //   3. CEFR level gate if applicable (cefrLevel field)
  // The quest's status field in quest/5 is the *initial* status hint, but
  // quest_available/2 is the runtime truth.

  lines.push(`% Can Player take this quest?`);
  const availConditions: string[] = [
    `quest(${questId}, _, _, _, _)`,
  ];

  if (prereqIds.length > 0) {
    for (const prereqId of prereqIds) {
      const prereqAtom = sanitizeAtom(prereqId);
      if (prereqAtom) {
        availConditions.push(`quest_status(Player, ${prereqAtom}, completed)`);
      }
    }
  }

  // CEFR level gating — mirrors the quest_cefr_level fact emitted above.
  if (cefrLevelRaw) {
    availConditions.push(`player_meets_cefr(Player, ${sanitizeAtom(cefrLevelRaw)})`);
  }

  lines.push(`quest_available(Player, ${questId}) :-`);
  lines.push(`    ${availConditions.join(',\n    ')}.`);
  predicates.push('quest_available/2');

  lines.push('');

  // ── quest_complete rule ────────────────────────────────────────────────

  if (criteria && typeof criteria === 'object') {
    const completeGoal = convertCompletionCheck(criteria, questId, errors);
    if (completeGoal) {
      lines.push(`% Check if quest is complete for Player`);
      lines.push(`quest_complete(Player, ${questId}) :-`);
      lines.push(`    ${completeGoal}.`);
      predicates.push('quest_complete/2');
    }
  }
  // Default: quest is complete when ALL objectives are complete
  if (!predicates.includes('quest_complete/2')) {
    lines.push(`% Check if quest is complete for Player (default: all objectives)`);
    lines.push(`quest_complete(Player, ${questId}) :-`);
    lines.push(`    \\+ (quest_objective(${questId}, Idx, _), \\+ objective_complete(Player, ${questId}, Idx)).`);
    predicates.push('quest_complete/2');
  }

  // ── Multi-stage quests ─────────────────────────────────────────────────

  const stages = quest.stages || [];
  if (stages.length > 0) {
    lines.push('');
    lines.push(`% Quest stages for ${quest.title}`);

    for (const stage of stages) {
      const stageAtom = sanitizeAtom(stage.stageId);
      const nextStages = (stage.nextStageIds || []).map(s => sanitizeAtom(s));
      const nextList = nextStages.length > 0 ? `[${nextStages.join(', ')}]` : '[]';

      lines.push(`quest_stage(${questId}, ${stageAtom}, ${nextList}).`);

      // Stage objectives
      for (let i = 0; i < stage.objectives.length; i++) {
        const goal = convertObjective(stage.objectives[i], i, errors);
        if (goal) {
          lines.push(`stage_objective(${questId}, ${stageAtom}, ${i}, ${goal}).`);
        }
      }

      // Stage preconditions
      if (stage.preconditions && stage.preconditions.length > 0) {
        for (const pre of stage.preconditions) {
          lines.push(`stage_precondition(${questId}, ${stageAtom}, ${sanitizeAtom(pre)}).`);
        }
      }

      // Stage postconditions
      if (stage.postconditions && stage.postconditions.length > 0) {
        for (const post of stage.postconditions) {
          lines.push(`stage_postcondition(${questId}, ${stageAtom}, ${sanitizeAtom(post)}).`);
        }
      }

      // Branch choices — player conversation choices that determine the next stage
      if (stage.branchChoices && stage.branchChoices.length > 0) {
        for (const choice of stage.branchChoices) {
          const choiceAtom = sanitizeAtom(choice.choiceId);
          const targetAtom = sanitizeAtom(choice.targetStageId);
          lines.push(`branch_choice(${questId}, ${stageAtom}, ${choiceAtom}, ${targetAtom}, '${escapeString(choice.label)}').`);
        }
      }
    }

    predicates.push('quest_stage/3', 'stage_objective/4', 'stage_precondition/3', 'stage_postcondition/3', 'branch_choice/5');

    // Stage completion rule
    lines.push('');
    lines.push(`% Stage complete: all objectives done`);
    lines.push(`stage_complete(Player, ${questId}, Stage) :-`);
    lines.push(`    quest_stage(${questId}, Stage, _),`);
    lines.push(`    \\+ (stage_objective(${questId}, Stage, Idx, _), \\+ objective_complete(Player, ${questId}, Stage, Idx)).`);
    predicates.push('stage_complete/3');
  }

  // ── Parent quest ────────────────────────────────────────────────────

  if (quest.parentQuestId) {
    lines.push(`quest_parent(${questId}, ${sanitizeAtom(quest.parentQuestId)}).`);
    predicates.push('quest_parent/2');
  }

  return {
    prologContent: lines.join('\n'),
    predicates: Array.from(new Set(predicates)),
    errors,
  };
}

/**
 * Batch convert multiple quests.
 */
export function convertQuestsToProlog(quests: QuestData[]): ConversionResult {
  const allLines: string[] = [];
  const allPredicates: string[] = [];
  const allErrors: string[] = [];

  allLines.push('% Insimul Quests - Auto-generated Prolog');
  allLines.push(`% Generated: ${new Date().toISOString()}`);
  allLines.push(`% Total quests: ${quests.length}`);
  allLines.push('');

  // Shared dynamic declarations
  const dynamicPreds = [
    'quest/5', 'quest_assigned_to/2', 'quest_assigned_by/2',
    'quest_language/2', 'quest_chain/2', 'quest_chain_order/2',
    'quest_tag/2', 'quest_objective/3', 'quest_completion/2',
    'quest_failure_condition/2', 'quest_prerequisite/2',
    'quest_reward/3', 'quest_item_reward/3', 'quest_skill_reward/3',
    'quest_unlock/3', 'quest_available/2', 'quest_complete/2',
    'quest_status/3', 'quest_progress/3',
    'quest_stage/3', 'stage_objective/4', 'stage_precondition/3',
    'stage_postcondition/3', 'stage_complete/3', 'branch_choice/5', 'quest_parent/2',
  ];
  for (const p of dynamicPreds) {
    allLines.push(`:- dynamic(${p}).`);
  }
  allLines.push('');

  for (const quest of quests) {
    const result = convertQuestToProlog(quest);
    allLines.push(result.prologContent);
    allLines.push('');
    allPredicates.push(...result.predicates);
    if (result.errors.length > 0) {
      allErrors.push(`[${quest.title}]: ${result.errors.join('; ')}`);
    }
  }

  // Helper rules
  allLines.push('% Helper: find all available quests for a player');
  allLines.push('available_quests(Player, Quests) :-');
  allLines.push('    findall(Q, quest_available(Player, Q), Quests).');
  allLines.push('');
  allLines.push('% Helper: find completed quests for a player');
  allLines.push('completed_quests(Player, Quests) :-');
  allLines.push('    findall(Q, quest_status(Player, Q, completed), Quests).');
  allLines.push('');
  allLines.push('% Helper: find quests by type');
  allLines.push('quests_of_type(Type, Quests) :-');
  allLines.push('    findall(Q, quest(Q, _, Type, _, _), Quests).');

  return {
    prologContent: allLines.join('\n'),
    predicates: Array.from(new Set(allPredicates)),
    errors: allErrors,
  };
}

// ── Objective Location Derivation ──────────────────────────────────────────

/**
 * Derive where an objective can be completed.
 * Returns a Prolog term: specific location, npc(Id), any_npc, or anywhere.
 */
function deriveObjectiveLocation(obj: any, type: string, quest?: any): string {
  // ── Specific target from objective data ──────────────────────────────────

  // Location-based objectives → specific location
  if (type === 'visit_location' || type === 'discover_location') {
    const loc = obj.locationName || obj.location || obj.target || '';
    return loc ? `location('${escapeString(loc)}')` : 'settlement';
  }

  // NPC-based objectives → specific NPC or any_npc
  if (type === 'talk_to_npc' || type === 'introduce_self' || type === 'give_gift' ||
      type === 'deliver_item' || type === 'build_friendship') {
    const npcRef = obj.npcName || obj.npc || obj.npcId || obj.target || '';
    if (npcRef && npcRef !== '{npc}') return `npc('${escapeString(npcRef)}')`;
    return 'any_npc';
  }

  if (type === 'complete_conversation' || type === 'sustained_conversation') {
    const npcRef = obj.npcName || obj.npc || obj.npcId || '';
    if (npcRef) return `npc('${escapeString(npcRef)}')`;
    return 'any_npc';
  }

  // Commerce objectives → specific merchant or guild marchands
  if (type === 'order_food' || type === 'haggle_price' || type === 'buy_item' || type === 'sell_item') {
    const merchant = obj.merchantId || obj.target || '';
    if (merchant) return `merchant('${escapeString(merchant)}')`;
    return 'any_merchant';
  }

  // Craft objectives → guild artisans or crafting station
  if (type === 'craft_item') return 'any_crafting_station';

  // Reading/text objectives → library / conteurs guild / text location
  if (type === 'read_document' || type === 'read_text' || type === 'find_text' ||
      type === 'collect_text' || type === 'read_sign') {
    return 'any_text_location';
  }

  // Photography objectives → wherever the subject is
  if (type === 'photograph' || type === 'photograph_subject') {
    const subject = obj.targetSubject || '';
    return subject ? `photo_subject('${escapeString(subject)}')` : 'settlement';
  }

  // Assessment conversation objectives → NPC
  if (type.includes('conversation') || type.includes('initiate_conversation')) {
    return 'any_npc';
  }
  // Assessment reading/writing/listening objectives → Notice Board
  if (type === 'complete_assessment' || type.startsWith('arrival_') ||
      type.startsWith('departure_') || type.startsWith('periodic_')) {
    return `location('Notice Board')`;
  }

  // ── Infer from quest context (tags/guild) when objective has no target ──

  const tags = quest?.tags || [];
  const questLocation = quest?.locationName;

  // Guild quest objectives → guild building
  const guildLocations: Record<string, string> = {
    guild_marchands: "Bergeron's La Guilde des Marchands",
    guild_artisans: "Sonnier's La Guilde des Artisans",
    guild_conteurs: "Bergeron's La Guilde des Conteurs",
    guild_explorateurs: "Robichaux's La Guilde des Explorateurs",
    guild_diplomates: "Bégnaud's La Guilde des Diplomates",
  };
  for (const [tag, loc] of Object.entries(guildLocations)) {
    if (tags.includes(tag)) return `location('${escapeString(loc)}')`;
  }

  // Quest has a specific location → use it
  if (questLocation && questLocation !== 'anywhere') {
    return `location('${escapeString(questLocation)}')`;
  }

  // Vocabulary/grammar/language objectives → NPC conversations
  if (type === 'use_vocabulary' || type === 'collect_vocabulary' || type === 'vocabulary' ||
      type === 'grammar' || type === 'conversation' || type === 'listen_and_repeat' ||
      type === 'translation_challenge' || type === 'pronunciation_check' ||
      type === 'listening_comprehension' || type === 'comprehension_quiz') {
    return 'any_npc';
  }

  // Writing/description objectives → Notice Board
  if (type === 'write_response' || type === 'describe_scene') {
    return `location('Notice Board')`;
  }

  // Exploration-tagged quests → settlement
  if (tags.includes('exploration') || tags.includes('navigation') || tags.includes('directions')) {
    return 'settlement';
  }

  // Commerce-tagged quests → marketplace
  if (tags.includes('commerce') || tags.includes('market') || tags.includes('food')) {
    return 'any_merchant';
  }

  // Navigation objectives → NPC conversations for directions
  if (type === 'follow_directions' || type === 'navigate_language' || type === 'ask_for_directions') {
    return 'any_npc';
  }

  // Collect/examine/identify → settlement (objects are in the world)
  if (type === 'collect_item' || type === 'examine_object' || type === 'identify_object' ||
      type === 'point_and_name' || type === 'find_vocabulary_items') {
    return 'settlement';
  }

  // Physical action → settlement hotspots
  if (type === 'physical_action') return 'settlement';

  // Reputation → settlement
  if (type === 'gain_reputation') return 'settlement';

  // Combat → settlement outskirts
  if (type === 'defeat_enemies') return 'settlement';

  // Escort → destination or settlement
  if (type === 'escort_npc') {
    const dest = obj.destination || '';
    return dest ? `location('${escapeString(dest)}')` : 'settlement';
  }

  // Clue collection → settlement
  if (type === 'collect_clue') return 'settlement';

  // Default: settlement (player should go to town)
  return 'settlement';
}

// ── Objective Converter ─────────────────────────────────────────────────────

function convertObjective(obj: any, index: number, errors: string[]): string | null {
  if (typeof obj === 'string') return `'${escapeString(obj)}'`;
  if (!obj || typeof obj !== 'object') return null;

  const type = obj.type || obj.objectiveType || '';
  const desc = obj.description || obj.text || '';

  // Common objective patterns
  if (type === 'collect' || type === 'gather') {
    const item = obj.item || obj.target || '';
    const count = obj.count || obj.quantity || 1;
    return `collect('${escapeString(item)}', ${count})`;
  }

  if (type === 'talk' || type === 'speak' || type === 'conversation') {
    const npc = obj.npcName || obj.npc || obj.target || obj.character || '';
    return `talk_to('${escapeString(npc)}')`;
  }

  if (type === 'visit' || type === 'go_to' || type === 'travel') {
    const location = obj.location || obj.target || '';
    return `visit_location('${escapeString(location)}')`;
  }

  if (type === 'defeat' || type === 'kill' || type === 'combat') {
    const target = obj.target || obj.enemy || '';
    const count = obj.count || 1;
    return `defeat('${escapeString(target)}', ${count})`;
  }

  if (type === 'use' || type === 'use_item') {
    const item = obj.item || obj.target || '';
    return `use_item(${sanitizeAtom(item)})`;
  }

  if (type === 'deliver') {
    const item = obj.item || '';
    const to = obj.to || obj.target || '';
    return `deliver('${escapeString(item)}', '${escapeString(to)}')`;
  }

  if (type === 'learn' || type === 'vocabulary_usage') {
    const words = obj.words || obj.requiredWords || [];
    if (words.length > 0) {
      return `learn_words([${words.map((w: string) => `'${escapeString(w)}'`).join(', ')}])`;
    }
    const count = obj.count || obj.requiredCount || 1;
    return `learn_words_count(${count})`;
  }

  if (type === 'grammar_pattern') {
    const pattern = obj.pattern || obj.target || '';
    const count = obj.count || obj.requiredCount || 1;
    return `practice_grammar('${escapeString(pattern)}', ${count})`;
  }

  if (type === 'craft' || type === 'craft_item') {
    const item = obj.item || obj.target || '';
    const count = obj.count || obj.quantity || 1;
    return `craft_item(${sanitizeAtom(item)}, ${count})`;
  }

  if (type === 'reach_level' || type === 'level') {
    const skill = obj.skill || obj.attribute || '';
    const level = obj.level || obj.value || 1;
    return `reach_level(${sanitizeAtom(skill)}, ${level})`;
  }

  if (type === 'escort' || type === 'escort_npc') {
    const npc = obj.npc || obj.target || '';
    const dest = obj.destination || obj.location || '';
    return `escort('${escapeString(npc)}', '${escapeString(dest)}')`;
  }

  if (type === 'discover' || type === 'discover_location' || type === 'explore') {
    const location = obj.location || obj.target || '';
    return `discover_location('${escapeString(location)}')`;
  }

  if (type === 'reputation' || type === 'gain_reputation') {
    const faction = obj.faction || obj.target || '';
    const amount = obj.amount || obj.required || OBJECTIVE_TYPE_DEFAULTS['gain_reputation']?.reputationRequired || 100;
    return `gain_reputation(${sanitizeAtom(faction)}, ${amount})`;
  }

  if (type === 'survive' || type === 'survive_duration') {
    const duration = obj.duration || obj.time || 60;
    return `survive(${duration})`;
  }

  if (type === 'puzzle' || type === 'solve_puzzle') {
    const puzzleId = obj.puzzleId || obj.target || '';
    return `solve_puzzle('${escapeString(puzzleId)}')`;
  }

  if (type === 'collect_item' || type === 'collect_items') {
    const item = obj.item || obj.itemName || obj.target || '';
    const count = obj.count || obj.quantity || 1;
    return `collect('${escapeString(item)}', ${count})`;
  }

  if (type === 'talk_to_npc') {
    const npc = obj.npcName || obj.npc || obj.npcId || obj.target || '';
    const turns = obj.requiredTurns || obj.minTurns || obj.required || 1;
    return `talk_to('${escapeString(npc)}', ${turns})`;
  }

  if (type === 'deliver_item') {
    const item = obj.item || obj.itemName || '';
    const npc = obj.npcName || obj.npc || obj.npcId || obj.to || '';
    return `deliver('${escapeString(item)}', '${escapeString(npc)}')`;
  }

  if (type === 'visit_location') {
    const location = obj.location || obj.locationId || obj.target || '';
    return `visit_location('${escapeString(location)}')`;
  }

  if (type === 'defeat_enemies') {
    const enemyType = obj.enemyType || obj.target || obj.enemy || '';
    const count = obj.count || obj.required || 1;
    return `defeat('${escapeString(enemyType)}', ${count})`;
  }

  if (type === 'use_vocabulary') {
    const words = obj.targetWords || obj.words || [];
    const count = obj.requiredCount || words.length || getDefaultRequiredCount('use_vocabulary');
    if (words.length > 0) {
      return `learn_words([${words.map((w: string) => `'${escapeString(w)}'`).join(', ')}])`;
    }
    return `learn_words_count(${count})`;
  }

  if (type === 'complete_conversation') {
    const turns = obj.requiredTurns || obj.requiredCount || 5;
    return `conversation_turns(${turns})`;
  }

  // ── Assessment phase objectives ─────────────────────────────────────────
  if (type === 'complete_assessment') {
    return `complete_assessment`;
  }
  if (type.startsWith('arrival_') || type.startsWith('departure_') || type.startsWith('periodic_')) {
    const trigger = obj.completionTrigger || type;
    const count = obj.requiredCount || obj.count || getDefaultRequiredCount(type);
    const minWords = obj.minWordCount || OBJECTIVE_TYPE_DEFAULTS[type]?.minWordCount;
    const extras = minWords ? `, ${minWords}` : '';
    return `assessment_phase('${escapeString(type)}', '${escapeString(trigger)}', ${count}${extras})`;
  }

  // ── Language skill objectives ───────────────────────────────────────────
  if (type === 'collect_vocabulary') {
    const count = obj.requiredCount || obj.count || getDefaultRequiredCount('collect_vocabulary');
    return `collect_vocabulary(${count})`;
  }
  if (type === 'identify_object' || type === 'point_and_name') {
    const count = obj.requiredCount || obj.count || 1;
    return `identify_object(${count})`;
  }
  if (type === 'examine_object') {
    const count = obj.requiredCount || obj.count || 1;
    return `examine_object(${count})`;
  }
  if (type === 'read_sign') {
    const count = obj.requiredCount || obj.count || 1;
    return `read_sign(${count})`;
  }
  if (type === 'write_response' || type === 'describe_scene') {
    const count = obj.requiredCount || obj.count || 1;
    return `write_response(${count})`;
  }
  if (type === 'listening_comprehension') {
    const count = obj.requiredCount || obj.count || getDefaultRequiredCount('listening_comprehension');
    return `listening_comprehension(${count})`;
  }
  if (type === 'listen_and_repeat') {
    const count = obj.requiredCount || obj.count || getDefaultRequiredCount('listen_and_repeat');
    return `listen_and_repeat(${count})`;
  }
  if (type === 'translation_challenge') {
    const count = obj.requiredCount || obj.count || getDefaultRequiredCount('translation_challenge');
    return `translation_challenge(${count})`;
  }
  if (type === 'pronunciation_check') {
    const count = obj.requiredCount || obj.count || getDefaultRequiredCount('pronunciation_check');
    return `pronunciation_check(${count})`;
  }
  if (type === 'introduce_self') {
    return `introduce_self`;
  }

  // ── Text/document objectives ───────────────────────────────────────────
  if (type === 'read_document' || type === 'read_text') {
    const textId = obj.textId || '';
    return textId ? `read_text('${escapeString(textId)}')` : `read_text(any)`;
  }
  if (type === 'find_text' || type === 'collect_text') {
    const count = obj.requiredCount || obj.count || 1;
    return `find_text(${count})`;
  }
  if (type === 'comprehension_quiz') {
    const count = obj.requiredCorrect || obj.requiredCount || getDefaultRequiredCount('comprehension_quiz');
    return `comprehension_quiz(${count})`;
  }
  if (type === 'collect_clue') {
    const count = obj.requiredCount || obj.count || 1;
    return `collect_clue(${count})`;
  }

  // ── Commerce objectives ────────────────────────────────────────────────
  if (type === 'order_food') {
    const count = obj.requiredCount || obj.count || 1;
    return `order_food(${count})`;
  }
  if (type === 'haggle_price') {
    const count = obj.requiredCount || obj.count || 1;
    return `haggle_price(${count})`;
  }
  if (type === 'buy_item') {
    const count = obj.requiredCount || obj.count || 1;
    return `buy_item(${count})`;
  }
  if (type === 'sell_item') {
    const count = obj.requiredCount || obj.count || 1;
    return `sell_item(${count})`;
  }

  // ── Interaction objectives ─────────────────────────────────────────────
  if (type === 'give_gift') {
    const npc = obj.npcId || obj.npc || '';
    return npc ? `give_gift('${escapeString(npc)}')` : `give_gift(any)`;
  }
  if (type === 'build_friendship') {
    const strength = obj.requiredStrength ?? OBJECTIVE_TYPE_DEFAULTS['build_friendship']?.requiredStrength ?? 0.5;
    return `build_friendship(${strength})`;
  }
  if (type === 'photograph' || type === 'photograph_subject') {
    const subject = obj.targetSubject || '';
    const count = obj.requiredCount || obj.count || 1;
    return subject ? `photograph('${escapeString(subject)}', ${count})` : `photograph(any, ${count})`;
  }
  if (type === 'physical_action') {
    const action = obj.actionType || '';
    const count = obj.requiredCount || obj.count || 1;
    return `physical_action('${escapeString(action)}', ${count})`;
  }
  if (type === 'escort_npc') {
    const npc = obj.npc || obj.npcId || '';
    return `escort('${escapeString(npc)}')`;
  }

  // ── Navigation objectives ──────────────────────────────────────────────
  if (type === 'follow_directions' || type === 'navigate_language') {
    const count = obj.requiredCount || obj.count || 1;
    return `follow_directions(${count})`;
  }
  if (type === 'ask_for_directions') {
    const count = obj.requiredCount || obj.count || 1;
    return `ask_for_directions(${count})`;
  }

  // ── Meta-objectives (chapter quests) ───────────────────────────────────
  if (type === 'vocabulary') {
    const count = obj.requiredCount || obj.required || 1;
    return `vocabulary_activities(${count})`;
  }
  if (type === 'conversation') {
    const count = obj.requiredCount || obj.required || 1;
    return `conversation_activities(${count})`;
  }
  if (type === 'grammar') {
    const count = obj.requiredCount || obj.required || getDefaultRequiredCount('grammar');
    return `grammar_activities(${count})`;
  }

  // ── Misc objectives ───────────────────────────────────────────────────
  if (type === 'sustained_conversation') {
    const count = obj.requiredCount || obj.count || 1;
    return `sustained_conversation(${count})`;
  }
  if (type === 'master_words') {
    const count = obj.requiredCount || obj.count || 1;
    return `master_words(${count})`;
  }
  if (type === 'learn_new_words') {
    const count = obj.requiredCount || obj.count || 1;
    return `learn_new_words(${count})`;
  }
  if (type === 'find_vocabulary_items') {
    const count = obj.requiredCount || obj.count || 1;
    return `find_vocabulary_items(${count})`;
  }

  // ── Item management objectives ──────────────────────────────────────────
  if (type === 'equip_item') {
    const item = obj.item || obj.itemName || obj.target || '';
    return item ? `equip_item(${sanitizeAtom(item)})` : `equip_item(any)`;
  }
  if (type === 'drop_item') {
    const item = obj.item || obj.itemName || obj.target || '';
    return item ? `drop_item(${sanitizeAtom(item)})` : `drop_item(any)`;
  }

  // ── Combat objectives ─────────────────────────────────────────────────
  if (type === 'combat_action') {
    const count = obj.requiredCount || obj.count || 1;
    return `combat_action(${count})`;
  }

  // ── Quest lifecycle objectives ────────────────────────────────────────
  if (type === 'accept_quest') {
    const questId = obj.questId || obj.target || '';
    return questId ? `accept_quest('${escapeString(questId)}')` : `accept_quest(any)`;
  }

  // ── Observation objectives ────────────────────────────────────────────
  if (type === 'observe_activity') {
    const count = obj.requiredCount || obj.count || getDefaultRequiredCount('observe_activity');
    const duration = obj.observeDurationRequired || OBJECTIVE_TYPE_DEFAULTS['observe_activity']?.observeDurationSeconds || 5;
    return `observe_activity(${count}, ${duration})`;
  }

  // ── Description-based recovery ─────────────────────────────────────────
  // When the type is 'objective' or unrecognized, try to parse the description
  // string to recover a structured goal.
  let recoveryDesc = desc || type;
  if (recoveryDesc) {
    // Strip nested objective('...') / Objective('...') wrappers that accumulate from repeated backfills
    let unwrapped = recoveryDesc;
    for (let i = 0; i < 5; i++) { // max 5 levels of nesting
      // Case-insensitive: handles both objective(...) and Objective(...)
      const inner = unwrapped.match(/^[Oo]bjective\(\s*'?((?:[^'\\]|\\.)*)(?:'?\s*)\)$/);
      if (inner) {
        unwrapped = inner[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
      } else {
        // Also try without quotes: Objective(objective(...))
        const bare = unwrapped.match(/^[Oo]bjective\(\s*(.*)\s*\)$/);
        if (bare) {
          unwrapped = bare[1];
        } else break;
      }
    }
    recoveryDesc = unwrapped;

    // Deep recovery: strip ALL objective/Objective wrappers and quotes aggressively
    // to find a buried Prolog term like visit_location('...')
    let stripped = recoveryDesc
      .replace(/[Oo]bjective\(\s*'?/g, '')  // strip all objective( prefixes
      .replace(/'?\s*\)(?:\s*'\s*\))*\s*$/g, '') // strip trailing ')') chains
      .replace(/^'+|'+$/g, '')               // strip outer quotes
      .trim();
    // If we found a recognizable Prolog functor, extract the name between parens
    const buriedFunctor = stripped.match(/^(visit[\s_]location|discover[\s_]location|talk[\s_]to|collect|deliver)\s*\(\s*'?/i);
    if (buriedFunctor) {
      const funcName = buriedFunctor[1].replace(/\s/g, '_').toLowerCase();
      // Extract everything after the opening paren, strip trailing quotes/parens
      const afterParen = stripped.slice(buriedFunctor[0].length);
      const targetName = afterParen.replace(/[')\s]+$/g, '').trim();
      if (targetName) {
        return `${funcName}('${escapeString(targetName)}')`;
      }
    }

    // "Learn vocabulary words (N)" / "Learn N vocabulary words"
    const learnWordsMatch = recoveryDesc.match(/learn\s+(?:(\d+)\s+)?vocabulary\s+words(?:\s+\((\d+)\))?/i);
    if (learnWordsMatch) {
      const count = parseInt(learnWordsMatch[1] || learnWordsMatch[2] || '1');
      return `learn_words_count(${count})`;
    }
    // Vocabulary activities — "Complete vocabulary activities (N)" or "Vocabulary activities(N"
    const vocabActMatch = recoveryDesc.match(/(?:complete\s+)?vocabulary\s+activities?\s*\(?(\d+)\)?/i);
    if (vocabActMatch) return `vocabulary_activities(${parseInt(vocabActMatch[1])})`;
    // Conversation turns — "Complete conversation turns (N)" or "Conversation turns(N"
    const convTurnsMatch = recoveryDesc.match(/(?:complete\s+)?conversation\s+turns?\s*\(?(\d+)\)?/i);
    if (convTurnsMatch) return `conversation_turns(${parseInt(convTurnsMatch[1])})`;
    // Grammar activities — "Complete grammar activities (N)" or "Grammar activities(N"
    const grammarMatch = recoveryDesc.match(/(?:complete\s+)?grammar\s+activities?\s*\(?(\d+)\)?/i);
    if (grammarMatch) return `grammar_activities(${parseInt(grammarMatch[1])})`;
    // Learn words count — "Learn words count(N)" or "Learn words count (N)"
    const lwcMatch = recoveryDesc.match(/learn\s+words?\s+count\s*\(?(\d+)\)?/i);
    if (lwcMatch) return `learn_words_count(${parseInt(lwcMatch[1])})`;
    // Nested: "visit location('Place Name')" — handle escaped quotes
    const nestedVisitMatch = recoveryDesc.match(/visit[\s_]+location\s*\(\s*'((?:[^'\\]|\\.)*)'\s*\)/i);
    if (nestedVisitMatch) {
      const loc = nestedVisitMatch[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
      return `visit_location('${escapeString(loc)}')`;
    }
    // Nested: "discover location('Place Name')"
    const nestedDiscoverMatch = recoveryDesc.match(/discover[\s_]+location\s*\(\s*'((?:[^'\\]|\\.)*)'\s*\)/i);
    if (nestedDiscoverMatch) {
      const loc = nestedDiscoverMatch[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
      return `discover_location('${escapeString(loc)}')`;
    }
    // "Have a N-turn conversation" / "N-turn conversation"
    const turnConvMatch = recoveryDesc.match(/(\d+)[\s-]+turn\s+conversation/i);
    if (turnConvMatch) return `conversation_turns(${parseInt(turnConvMatch[1])})`;
    // "talk_to('NPC Name')" embedded in description
    const talkMatch = recoveryDesc.match(/talk[\s_]+to\s*\(\s*'((?:[^'\\]|\\.)*)'\s*\)/i);
    if (talkMatch) {
      const npc = talkMatch[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
      return `talk_to('${escapeString(npc)}')`;
    }
  }

  // Also try to use `required` / `requiredCount` with the type to produce a count-based goal
  const count = obj.required || obj.requiredCount || obj.count || 0;
  if (count > 0 && type) {
    // Map common questType names to Prolog functors
    const typeToFunctor: Record<string, string> = {
      'visit_location': 'visit_location',
      'complete_conversation': 'conversation_turns',
      'use_vocabulary': 'learn_words_count',
      'find_text': 'find_text',
      'read_sign': 'read_sign',
      'examine_object': 'examine_object',
      'read_text': 'read_text',
    };
    const functor = typeToFunctor[type];
    if (functor) return `${functor}(${count})`;
  }

  // Generic: store as a quoted description
  if (desc) {
    return `objective('${escapeString(desc)}')`;
  }

  // Raw JSON fallback
  try {
    return `objective('${escapeString(JSON.stringify(obj))}')`;
  } catch {
    errors.push(`Could not convert objective at index ${index}`);
    return null;
  }
}

// ── Completion Criteria Converter ───────────────────────────────────────────

function convertCompletionCriteria(criteria: Record<string, any>, errors: string[]): string | null {
  const type = criteria.type || '';

  if (type === 'vocabulary_usage') {
    const count = criteria.requiredCount || 1;
    const words = criteria.requiredWords || [];
    if (words.length > 0) {
      return `vocabulary_usage([${words.map((w: string) => `'${escapeString(w)}'`).join(', ')}], ${count})`;
    }
    return `vocabulary_count(${count})`;
  }

  if (type === 'conversation_turns') {
    const turns = criteria.requiredTurns || 1;
    return `conversation_turns(${turns})`;
  }

  if (type === 'grammar_pattern') {
    const count = criteria.requiredCount || 1;
    return `grammar_patterns(${count})`;
  }

  if (type === 'conversation_engagement') {
    const messages = criteria.requiredMessages || 1;
    return `conversation_engagement(${messages})`;
  }

  if (type === 'all_objectives') {
    return `all_objectives_complete`;
  }

  if (type === 'score' || type === 'points') {
    const target = criteria.targetScore || criteria.requiredPoints || 0;
    return `score_reached(${target})`;
  }

  if (type === 'collect_items' || type === 'collect_item') {
    const itemName = criteria.itemName || criteria.items?.[0] || '';
    const count = criteria.count || criteria.items?.length || 1;
    return `collect(${sanitizeAtom(itemName)}, ${count})`;
  }

  if (type === 'defeat_enemies') {
    const enemyType = criteria.enemyType || '';
    const count = criteria.count || 1;
    return `defeat('${escapeString(enemyType)}', ${count})`;
  }

  if (type === 'deliver_item') {
    const itemName = criteria.itemName || '';
    const npc = criteria.targetNpc || '';
    return `deliver(${sanitizeAtom(itemName)}, '${escapeString(npc)}')`;
  }

  if (type === 'discover_location') {
    const location = criteria.locationId || criteria.locationName || '';
    return `discover_location('${escapeString(location)}')`;
  }

  if (type === 'escort_npc') {
    const npc = criteria.npcName || criteria.npcId || '';
    return `escort('${escapeString(npc)}', destination)`;
  }

  if (type === 'gain_reputation') {
    const faction = criteria.factionId || '';
    const amount = criteria.amount || 100;
    return `gain_reputation(${sanitizeAtom(faction)}, ${amount})`;
  }

  if (type === 'craft_item') {
    const itemName = criteria.itemName || '';
    const count = criteria.count || 1;
    return `craft_item(${sanitizeAtom(itemName)}, ${count})`;
  }

  if (type === 'custom' && criteria.predicate) {
    return sanitizeAtom(criteria.predicate);
  }

  if (criteria.description) {
    return `criteria('${escapeString(criteria.description)}')`;
  }

  return null;
}

function convertCompletionCheck(criteria: Record<string, any>, questId: string, errors: string[]): string | null {
  const type = criteria.type || '';

  if (type === 'vocabulary_usage') {
    const count = criteria.requiredCount || 1;
    return `quest_progress(Player, ${questId}, Progress), Progress >= ${count}`;
  }

  if (type === 'conversation_turns') {
    const turns = criteria.requiredTurns || 1;
    return `quest_progress(Player, ${questId}, Turns), Turns >= ${turns}`;
  }

  if (type === 'grammar_pattern') {
    const count = criteria.requiredCount || 1;
    return `quest_progress(Player, ${questId}, Count), Count >= ${count}`;
  }

  if (type === 'collect_items' || type === 'collect_item') {
    const itemName = sanitizeAtom(criteria.itemName || '');
    const count = criteria.count || criteria.items?.length || 1;
    return `collected(Player, ${itemName}, Qty), Qty >= ${count}`;
  }

  if (type === 'defeat_enemies') {
    const enemyType = sanitizeAtom(criteria.enemyType || 'any');
    const count = criteria.count || 1;
    return `aggregate_all(count, defeated(Player, ${enemyType}), C), C >= ${count}`;
  }

  if (type === 'deliver_item') {
    const itemName = sanitizeAtom(criteria.itemName || '');
    const npcId = sanitizeAtom(criteria.targetNpcId || '');
    return `delivered(Player, ${npcId}, ${itemName})`;
  }

  if (type === 'discover_location') {
    const locationId = sanitizeAtom(criteria.locationId || criteria.locationName || '');
    return `discovered(Player, ${locationId})`;
  }

  if (type === 'escort_npc') {
    const npcId = sanitizeAtom(criteria.npcId || '');
    const destId = sanitizeAtom(criteria.destinationId || 'destination');
    return `escorted(Player, ${npcId}, ${destId})`;
  }

  if (type === 'gain_reputation') {
    const factionId = sanitizeAtom(criteria.factionId || '');
    const amount = criteria.amount || 100;
    return `reputation(Player, ${factionId}, Rep), Rep >= ${amount}`;
  }

  if (type === 'craft_item') {
    const itemName = sanitizeAtom(criteria.itemName || '');
    const count = criteria.count || 1;
    return `crafted(Player, ${itemName}, Qty), Qty >= ${count}`;
  }

  if (type === 'conversation_engagement') {
    const messages = criteria.requiredMessages || 1;
    return `quest_progress(Player, ${questId}, Msgs), Msgs >= ${messages}`;
  }

  if (type === 'follow_directions') {
    const steps = criteria.stepsRequired || criteria.requiredCount || 1;
    return `quest_progress(Player, ${questId}, Steps), Steps >= ${steps}`;
  }

  if (type === 'all_objectives') {
    return `\\+ (quest_objective(${questId}, Idx, _), \\+ objective_complete(Player, ${questId}, Idx))`;
  }

  // Generic: check all objectives complete (safer than progress >= 100 which has no tracking)
  return `\\+ (quest_objective(${questId}, Idx, _), \\+ objective_complete(Player, ${questId}, Idx))`;
}

// ── Failure Condition Converter ─────────────────────────────────────────────

function convertFailureCondition(condition: Record<string, any>, errors: string[]): string | null {
  const type = condition.type || '';

  if (type === 'timeout' || type === 'expired') {
    return 'timeout';
  }

  if (type === 'death' || type === 'player_death') {
    return 'player_death';
  }

  if (type === 'reputation' && condition.threshold != null) {
    return `reputation_below(${condition.threshold})`;
  }

  if (condition.description) {
    return `failure('${escapeString(condition.description)}')`;
  }

  return null;
}

// ── Discovery Method ────────────────────────────────────────────────────────

/** Objective types discovered via the settlement notice board. */
const NOTICE_BOARD_TYPES = new Set([
  'visit_location', 'discover_location', 'read_sign', 'describe_scene',
  'follow_directions', 'navigate_language', 'examine_object', 'collect_item',
  'read_document',
]);

/** Objective types discovered by talking to NPCs. */
const NPC_TYPES = new Set([
  'talk_to_npc', 'complete_conversation', 'introduce_self', 'build_friendship',
  'give_gift', 'gain_reputation', 'order_food', 'haggle_price',
  'ask_for_directions', 'listening_comprehension', 'listen_and_repeat',
  'escort_npc', 'deliver_item', 'defeat_enemies',
]);

/**
 * Derive how the player discovers a quest. Encoded as a Prolog atom:
 *   notice_board — found on the settlement notice board
 *   npc          — offered by an NPC in conversation
 *   guild        — offered by a guild master (skill-focused)
 *   chain        — unlocked by completing a predecessor quest
 *   auto         — automatically available (e.g. Arrival Assessment)
 */
function deriveDiscoveryMethod(quest: QuestData): string {
  // Assessment / onboarding quests are auto-started
  if (quest.tags?.includes('assessment') || quest.tags?.includes('onboarding')) return 'auto';
  // Main narrative chain quests are unlocked by chain progression
  if (quest.questChainId || quest.tags?.includes('main-quest') || quest.tags?.includes('main_quest') || quest.tags?.includes('narrative')) return 'chain';
  // Guild quests
  if (quest.tags?.some(t => t.startsWith('guild'))) return 'guild';

  // Classify by primary objective type
  const objectives = quest.objectives || [];
  const primaryType = objectives[0]?.type;
  if (primaryType) {
    if (NOTICE_BOARD_TYPES.has(primaryType)) return 'notice_board';
    if (NPC_TYPES.has(primaryType)) return 'npc';
  }

  // Fallback: classify by questType
  const qt = (quest.questType || '').toLowerCase();
  if (qt === 'exploration' || qt === 'navigation' || qt === 'cultural') return 'notice_board';
  if (qt === 'conversation' || qt === 'social' || qt === 'commerce') return 'npc';

  // Default to guild for skill-focused quests
  return 'guild';
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeAtom(str: string): string {
  if (!str || !str.trim()) return 'unknown';
  let atom = str
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  // Prolog atoms must start with a lowercase letter; prefix if it starts with a digit
  if (/^[0-9]/.test(atom)) atom = `n${atom}`;
  return atom || 'unknown';
}

function escapeString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
