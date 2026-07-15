/**
 * Prolog-to-Insimul Bridge
 *
 * Converts Prolog content back to structured Insimul format for backward
 * compatibility when exporting to Ensemble, Kismet, or TotT formats.
 *
 * This is the inverse of rule-converter, action-converter, and quest-converter.
 * It uses regex parsing to extract structured data from Prolog predicates.
 */

// ── Rule Bridge ────────────────────────────────────────────────────────────

export interface InsimulRuleData {
  name: string;
  priority: number;
  likelihood: number;
  ruleType: string;
  category: string | null;
  isActive: boolean;
  conditions: InsimulCondition[];
  effects: InsimulEffect[];
}

export interface InsimulCondition {
  type: string;
  first?: string;
  second?: string;
  property?: string;
  operator?: string;
  value?: any;
}

export interface InsimulEffect {
  type: string;
  first?: string;
  second?: string;
  property?: string;
  value?: any;
}

/**
 * Extract structured rule data from Prolog content.
 */
export function prologToInsimulRule(prologContent: string): InsimulRuleData {
  const name = extractRuleAtomName(prologContent) || 'unknown_rule';

  return {
    name,
    priority: extractNumber(prologContent, /rule_priority\(\s*\w+\s*,\s*(\d+(?:\.\d+)?)\s*\)/) ?? 5,
    likelihood: extractNumber(prologContent, /rule_likelihood\(\s*\w+\s*,\s*(\d+(?:\.\d+)?)\s*\)/) ?? 1.0,
    ruleType: extractAtom(prologContent, /rule_type\(\s*\w+\s*,\s*(\w+)\s*\)/) || 'volition',
    category: extractAtom(prologContent, /rule_category\(\s*\w+\s*,\s*(\w+)\s*\)/),
    isActive: !/rule_inactive\(\s*\w+\s*\)/.test(prologContent),
    conditions: extractConditions(prologContent),
    effects: extractEffects(prologContent),
  };
}

// ── Action Bridge ──────────────────────────────────────────────────────────

export interface InsimulActionData {
  name: string;
  actionType: string;
  category: string | null;
  energyCost: number;
  difficulty: number;
  duration: number;
  targetType: string | null;
  requiresTarget: boolean;
  range: number;
  cooldown: number;
  prerequisites: InsimulCondition[];
  effects: InsimulEffect[];
  sideEffects: InsimulEffect[];
  triggerConditions: InsimulCondition[];
}

/**
 * Extract structured action data from Prolog content.
 */
export function prologToInsimulAction(prologContent: string): InsimulActionData {
  // action(Id, Name, Type, EnergyCost).
  const actionMatch = prologContent.match(/action\(\s*(\w+)\s*,\s*'([^']*)'\s*,\s*(\w+)\s*,\s*(\d+(?:\.\d+)?)\s*\)/);

  return {
    name: actionMatch ? actionMatch[2] : extractActionAtomName(prologContent) || 'unknown_action',
    actionType: actionMatch ? actionMatch[3] : 'social',
    energyCost: actionMatch ? parseFloat(actionMatch[4]) : 1,
    category: extractAtom(prologContent, /% Type:\s*\w+\s*\/\s*(\w+)/),
    difficulty: extractNumber(prologContent, /action_difficulty\(\s*\w+\s*,\s*(\d+(?:\.\d+)?)\s*\)/) ?? 0.5,
    duration: extractNumber(prologContent, /action_duration\(\s*\w+\s*,\s*(\d+(?:\.\d+)?)\s*\)/) ?? 1,
    targetType: extractAtom(prologContent, /action_target_type\(\s*\w+\s*,\s*(\w+)\s*\)/),
    requiresTarget: /action_requires_target\(\s*\w+\s*\)/.test(prologContent),
    range: extractNumber(prologContent, /action_range\(\s*\w+\s*,\s*(\d+)\s*\)/) ?? 0,
    cooldown: extractNumber(prologContent, /action_cooldown\(\s*\w+\s*,\s*(\d+)\s*\)/) ?? 0,
    prerequisites: extractActionPrerequisites(prologContent),
    effects: extractActionEffects(prologContent, 'action_effect'),
    sideEffects: extractActionEffects(prologContent, 'action_side_effect'),
    triggerConditions: extractActionTriggers(prologContent),
  };
}

// ── Quest Bridge ───────────────────────────────────────────────────────────

export interface InsimulQuestData {
  title: string;
  questType: string;
  difficulty: string;
  status: string;
  objectives: Array<{ type: string; description: string; target?: string; count?: number }>;
  rewards: Record<string, number>;
  prerequisiteQuestIds: string[];
}

/**
 * Extract structured quest data from Prolog content.
 */
export function prologToInsimulQuest(prologContent: string): InsimulQuestData {
  // quest(Id, Title, Type, Difficulty, Status).
  const questMatch = prologContent.match(/quest\(\s*\w+\s*,\s*'([^']*)'\s*,\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)/);

  return {
    title: questMatch ? questMatch[1] : 'Unknown Quest',
    questType: questMatch ? questMatch[2] : 'conversation',
    difficulty: questMatch ? questMatch[3] : 'beginner',
    status: questMatch ? questMatch[4] : 'active',
    objectives: extractQuestObjectives(prologContent),
    rewards: extractQuestRewards(prologContent),
    prerequisiteQuestIds: extractQuestPrerequisites(prologContent),
  };
}

// ── Extraction Helpers ─────────────────────────────────────────────────────

function extractNumber(content: string, pattern: RegExp): number | null {
  const match = content.match(pattern);
  return match ? parseFloat(match[1]) : null;
}

function extractAtom(content: string, pattern: RegExp): string | null {
  const match = content.match(pattern);
  return match ? match[1] : null;
}

function extractRuleAtomName(content: string): string | null {
  const match = content.match(/rule_(?:active|priority|likelihood|type|category)\(\s*(\w+)/);
  return match ? match[1] : null;
}

function extractActionAtomName(content: string): string | null {
  const match = content.match(/action\(\s*(\w+)/);
  return match ? match[1] : null;
}

// ── Condition Extraction ───────────────────────────────────────────────────

function extractConditions(content: string): InsimulCondition[] {
  const conditions: InsimulCondition[] = [];

  // rule_applies(Name) :- Body.
  const ruleMatch = content.match(/rule_applies\(\s*\w+\s*\)\s*:-\s*([\s\S]*?)\./);
  if (ruleMatch) {
    parseGoalBody(ruleMatch[1], conditions);
  }

  return conditions;
}

function extractEffects(content: string): InsimulEffect[] {
  const effects: InsimulEffect[] = [];

  // rule_effect(Name, Effect).
  const effectPattern = /rule_effect\(\s*\w+\s*,\s*(.*?)\)\s*\./g;
  let match;
  while ((match = effectPattern.exec(content)) !== null) {
    const effect = parseEffectTerm(match[1]);
    if (effect) effects.push(effect);
  }

  return effects;
}

// ── Action-specific extraction ─────────────────────────────────────────────

function extractActionPrerequisites(content: string): InsimulCondition[] {
  const conditions: InsimulCondition[] = [];

  // action_prerequisite(Id, Goal).
  const pattern = /action_prerequisite\(\s*\w+\s*,\s*(.*?)\)\s*\./g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const goal = match[1].trim();
    const condition = parseGoalToCondition(goal);
    if (condition) conditions.push(condition);
  }

  return conditions;
}

function extractActionEffects(content: string, predicate: string): InsimulEffect[] {
  const effects: InsimulEffect[] = [];
  const pattern = new RegExp(`${predicate}\\(\\s*\\w+\\s*,\\s*(.*?)\\)\\s*\\.`, 'g');
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const effect = parseEffectTerm(match[1]);
    if (effect) effects.push(effect);
  }
  return effects;
}

function extractActionTriggers(content: string): InsimulCondition[] {
  const conditions: InsimulCondition[] = [];
  const pattern = /action_trigger\(\s*\w+\s*,\s*(.*?)\)\s*\./g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const condition = parseGoalToCondition(match[1].trim());
    if (condition) conditions.push(condition);
  }
  return conditions;
}

// ── Quest-specific extraction ──────────────────────────────────────────────

function extractQuestObjectives(content: string): Array<{ type: string; description: string; target?: string; count?: number }> {
  const objectives: Array<{ type: string; description: string; target?: string; count?: number }> = [];

  // quest_objective(Id, Index, Goal).
  const pattern = /quest_objective\(\s*\w+\s*,\s*\d+\s*,\s*(.*?)\)\s*\./g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const goal = match[1].trim();
    const obj = parseObjectiveGoal(goal);
    if (obj) objectives.push(obj);
  }

  return objectives;
}

function extractQuestRewards(content: string): Record<string, number> {
  const rewards: Record<string, number> = {};

  // quest_reward(Id, Type, Value).
  const pattern = /quest_reward\(\s*\w+\s*,\s*(\w+)\s*,\s*(\d+(?:\.\d+)?)\s*\)/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    rewards[match[1]] = parseFloat(match[2]);
  }

  return rewards;
}

function extractQuestPrerequisites(content: string): string[] {
  const prereqs: string[] = [];

  // quest_prerequisite(Id, PrereqId).
  const pattern = /quest_prerequisite\(\s*\w+\s*,\s*(\w+)\s*\)/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    prereqs.push(match[1]);
  }

  return prereqs;
}

// ── Goal/Term Parsers ──────────────────────────────────────────────────────

function parseGoalBody(body: string, conditions: InsimulCondition[]): void {
  // Split on commas (simple — doesn't handle nested commas in terms)
  const goals = body.split(/,\s*(?![^(]*\))/);
  for (const goal of goals) {
    const condition = parseGoalToCondition(goal.trim());
    if (condition) conditions.push(condition);
  }
}

function parseGoalToCondition(goal: string): InsimulCondition | null {
  // attribute(X, prop, Val), Val op N
  const attrMatch = goal.match(/attribute\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)(?:\s*,\s*\w+\s*(>=|=<|>|<|=:=|=\\=)\s*(\d+(?:\.\d+)?))?/);
  if (attrMatch) {
    return {
      type: 'attribute',
      first: denormTarget(attrMatch[1]),
      property: attrMatch[2],
      operator: attrMatch[4] ? denormOp(attrMatch[4]) : undefined,
      value: attrMatch[5] ? parseFloat(attrMatch[5]) : undefined,
    };
  }

  // has_trait(X, trait) or \+ has_trait(X, trait)
  const traitMatch = goal.match(/(\\[+]\s+)?has_trait\(\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (traitMatch) {
    return {
      type: 'trait',
      first: denormTarget(traitMatch[2]),
      property: traitMatch[3],
      value: traitMatch[1] ? false : true,
    };
  }

  // relationship(X, Y, type, Val)
  const relMatch = goal.match(/relationship\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)(?:\s*,\s*\w+\s*(>=|=<|>|<|=:=|=\\=)\s*(\d+(?:\.\d+)?))?/);
  if (relMatch) {
    return {
      type: 'relationship',
      first: denormTarget(relMatch[1]),
      second: denormTarget(relMatch[2]),
      property: relMatch[3],
      operator: relMatch[5] ? denormOp(relMatch[5]) : undefined,
      value: relMatch[6] ? parseFloat(relMatch[6]) : undefined,
    };
  }

  // network(X, Y, type, Val)
  const netMatch = goal.match(/network\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (netMatch) {
    return {
      type: 'network',
      first: denormTarget(netMatch[1]),
      second: denormTarget(netMatch[2]),
      property: netMatch[3],
    };
  }

  // status(X, Y, prop)
  const statusMatch = goal.match(/(\\[+]\s+)?status\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (statusMatch) {
    return {
      type: 'status',
      first: denormTarget(statusMatch[2]),
      second: denormTarget(statusMatch[3]),
      property: statusMatch[4],
      value: statusMatch[1] ? false : true,
    };
  }

  // at_location(X, loc)
  const locMatch = goal.match(/at_location\(\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (locMatch) {
    return { type: 'location', first: denormTarget(locMatch[1]), value: locMatch[2] };
  }

  // energy(X, E), E op N
  const energyMatch = goal.match(/energy\(\s*(\w+)\s*,\s*(\w+)\s*\)(?:\s*,\s*\w+\s*(>=|=<|>|<|=:=|=\\=)\s*(\d+(?:\.\d+)?))?/);
  if (energyMatch) {
    return {
      type: 'energy',
      first: denormTarget(energyMatch[1]),
      operator: energyMatch[3] ? denormOp(energyMatch[3]) : undefined,
      value: energyMatch[4] ? parseFloat(energyMatch[4]) : undefined,
    };
  }

  // intent(X, Y, prop)
  const intentMatch = goal.match(/intent\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (intentMatch) {
    return { type: 'intent', first: denormTarget(intentMatch[1]), second: denormTarget(intentMatch[2]), property: intentMatch[3] };
  }

  // knows(X, Y, prop)
  const knowsMatch = goal.match(/knows\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (knowsMatch) {
    return { type: 'knowledge', first: denormTarget(knowsMatch[1]), second: denormTarget(knowsMatch[2]), property: knowsMatch[3] };
  }

  return null;
}

function parseEffectTerm(term: string): InsimulEffect | null {
  // modify_relationship(X, Y, prop, val)
  const relMatch = term.match(/modify_relationship\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/);
  if (relMatch) {
    return { type: 'relationship', first: denormTarget(relMatch[1]), second: denormTarget(relMatch[2]), property: relMatch[3], value: parseFloat(relMatch[4]) };
  }

  // modify_attribute(X, prop, val)
  const attrMatch = term.match(/modify_attribute\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/);
  if (attrMatch) {
    return { type: 'attribute', first: denormTarget(attrMatch[1]), property: attrMatch[2], value: parseFloat(attrMatch[3]) };
  }

  // set_status(X, Y, prop)
  const statusMatch = term.match(/set_status\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (statusMatch) {
    return { type: 'status', first: denormTarget(statusMatch[1]), second: denormTarget(statusMatch[2]), property: statusMatch[3] };
  }

  // trigger_event(X, prop)
  const eventMatch = term.match(/trigger_event\(\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (eventMatch) {
    return { type: 'event', first: denormTarget(eventMatch[1]), property: eventMatch[2] };
  }

  // give_item(X, item)
  const itemMatch = term.match(/give_item\(\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (itemMatch) {
    return { type: 'item', first: denormTarget(itemMatch[1]), value: itemMatch[2] };
  }

  // modify_gold(X, val)
  const goldMatch = term.match(/modify_gold\(\s*(\w+)\s*,\s*(-?\d+)\s*\)/);
  if (goldMatch) {
    return { type: 'gold', first: denormTarget(goldMatch[1]), value: parseInt(goldMatch[2]) };
  }

  // set_mood(X, mood)
  const moodMatch = term.match(/set_mood\(\s*(\w+)\s*,\s*(\w+)\s*\)/);
  if (moodMatch) {
    return { type: 'mood_change', first: denormTarget(moodMatch[1]), value: moodMatch[2] };
  }

  // modify_network(X, Y, type, weight)
  const netMatch = term.match(/modify_network\(\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/);
  if (netMatch) {
    return { type: 'network', first: denormTarget(netMatch[1]), second: denormTarget(netMatch[2]), property: netMatch[3], value: parseFloat(netMatch[4]) };
  }

  return null;
}

function parseObjectiveGoal(goal: string): { type: string; description: string; target?: string; count?: number } | null {
  // collect(item, count)
  const collectMatch = goal.match(/collect\(\s*(\w+)\s*,\s*(\d+)\s*\)/);
  if (collectMatch) return { type: 'collect', description: `Collect ${collectMatch[2]} ${collectMatch[1]}`, target: collectMatch[1], count: parseInt(collectMatch[2]) };

  // talk_to('NPC')
  const talkMatch = goal.match(/talk_to\(\s*'([^']*)'\s*\)/);
  if (talkMatch) return { type: 'talk', description: `Talk to ${talkMatch[1]}`, target: talkMatch[1] };

  // visit_location('Place')
  const visitMatch = goal.match(/visit_location\(\s*'([^']*)'\s*\)/);
  if (visitMatch) return { type: 'visit', description: `Visit ${visitMatch[1]}`, target: visitMatch[1] };

  // defeat('Enemy', count)
  const defeatMatch = goal.match(/defeat\(\s*'([^']*)'\s*,\s*(\d+)\s*\)/);
  if (defeatMatch) return { type: 'defeat', description: `Defeat ${defeatMatch[2]} ${defeatMatch[1]}`, target: defeatMatch[1], count: parseInt(defeatMatch[2]) };

  // objective('description')
  const objMatch = goal.match(/objective\(\s*'([^']*)'\s*\)/);
  if (objMatch) return { type: 'custom', description: objMatch[1] };

  // Fallback
  return { type: 'custom', description: goal };
}

// ── Target/Operator denormalization ────────────────────────────────────────

function denormTarget(atom: string): string {
  if (atom === 'Actor' || atom === 'X') return 'initiator';
  if (atom === 'Target' || atom === 'Y') return 'responder';
  if (atom === 'Z') return 'third';
  return atom;
}

function denormOp(op: string): string {
  switch (op) {
    case '=:=': return '=';
    case '=\\=': return '!=';
    case '>=': return '>=';
    case '=<': return '<=';
    case '>': return '>';
    case '<': return '<';
    default: return op;
  }
}
