/**
 * Prolog Metadata Extractor
 *
 * Parses Prolog rule/action/quest content to extract metadata facts that are
 * also stored as denormalized DB columns for query performance.
 *
 * Rules:
 *   rule_priority(Name, N).       → priority
 *   rule_likelihood(Name, N).     → likelihood
 *   rule_type(Name, Type).        → ruleType
 *   rule_category(Name, Cat).     → category
 *   rule_active(Name).            → isActive
 *   rule_source(Name, Source).    → sourceFormat (original import format)
 *
 * Actions:
 *   action(Id, Name, Type, EnergyCost).  → actionType, energyCost
 *   action_difficulty(Id, N).            → difficulty
 *   action_duration(Id, N).              → duration
 *   action_target_type(Id, Type).        → targetType
 *   action_requires_target(Id).          → requiresTarget
 *   action_range(Id, N).                 → range
 *   action_cooldown(Id, N).              → cooldown
 *
 * Quests:
 *   quest(Id, Title, Type, Difficulty, Status). → questType, difficulty, status
 */

export interface RuleMetadata {
  priority: number | null;
  likelihood: number | null;
  ruleType: string | null;
  category: string | null;
  isActive: boolean;
  sourceFormat: string | null;
  /** The rule name atom extracted from any metadata fact */
  ruleName: string | null;
}

export interface ActionMetadata {
  actionType: string | null;
  category: string | null;
  energyCost: number | null;
  difficulty: number | null;
  duration: number | null;
  targetType: string | null;
  requiresTarget: boolean;
  range: number | null;
  cooldown: number | null;
  isActive: boolean;
  /** The action name atom extracted from action/4 */
  actionName: string | null;
}

export interface QuestMetadata {
  questType: string | null;
  difficulty: string | null;
  status: string | null;
  /** The quest name atom extracted from quest/5 */
  questName: string | null;
}

/**
 * Extract all rule metadata from Prolog content.
 */
export function extractAllMetadata(prologContent: string): RuleMetadata {
  return {
    priority: extractPriority(prologContent),
    likelihood: extractLikelihood(prologContent),
    ruleType: extractRuleType(prologContent),
    category: extractCategory(prologContent),
    isActive: extractIsActive(prologContent),
    sourceFormat: extractSourceFormat(prologContent),
    ruleName: extractRuleName(prologContent),
  };
}

/**
 * Extract all action metadata from Prolog content.
 */
export function extractActionMetadata(prologContent: string): ActionMetadata {
  // action(Id, Name, Type, EnergyCost).
  const actionMatch = prologContent.match(/action\(\s*(\w+)\s*,\s*'[^']*'\s*,\s*(\w+)\s*,\s*(\d+(?:\.\d+)?)\s*\)/);
  return {
    actionType: actionMatch ? actionMatch[2] : null,
    energyCost: actionMatch ? parseFloat(actionMatch[3]) : null,
    actionName: actionMatch ? actionMatch[1] : null,
    category: extractActionCategory(prologContent),
    difficulty: extractActionDifficulty(prologContent),
    duration: extractActionDuration(prologContent),
    targetType: extractActionTargetType(prologContent),
    requiresTarget: /action_requires_target\(\s*\w+\s*\)/.test(prologContent),
    range: extractActionRange(prologContent),
    cooldown: extractActionCooldown(prologContent),
    isActive: extractIsActive(prologContent),
  };
}

/**
 * Extract all quest metadata from Prolog content.
 */
export function extractQuestMetadata(prologContent: string): QuestMetadata {
  // quest(Id, Title, Type, Difficulty, Status).
  const questMatch = prologContent.match(/quest\(\s*(\w+)\s*,\s*'[^']*'\s*,\s*(\w+)\s*,\s*(\w+)\s*,\s*(\w+)\s*\)/);
  return {
    questName: questMatch ? questMatch[1] : null,
    questType: questMatch ? questMatch[2] : null,
    difficulty: questMatch ? questMatch[3] : null,
    status: questMatch ? questMatch[4] : null,
  };
}

/**
 * Extract priority from `rule_priority(Name, N).`
 */
export function extractPriority(content: string): number | null {
  const match = content.match(/rule_priority\(\s*\w+\s*,\s*(\d+(?:\.\d+)?)\s*\)/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Extract likelihood from `rule_likelihood(Name, N).`
 */
export function extractLikelihood(content: string): number | null {
  const match = content.match(/rule_likelihood\(\s*\w+\s*,\s*(\d+(?:\.\d+)?)\s*\)/);
  return match ? parseFloat(match[1]) : null;
}

/**
 * Extract ruleType from `rule_type(Name, Type).`
 */
export function extractRuleType(content: string): string | null {
  const match = content.match(/rule_type\(\s*\w+\s*,\s*(\w+)\s*\)/);
  return match ? match[1] : null;
}

/**
 * Extract category from `rule_category(Name, Cat).`
 */
export function extractCategory(content: string): string | null {
  const match = content.match(/rule_category\(\s*\w+\s*,\s*(\w+)\s*\)/);
  return match ? match[1] : null;
}

/**
 * Check if rule_active(Name) is present (default true if no fact found).
 */
export function extractIsActive(content: string): boolean {
  // If there's an explicit rule_active fact, the rule is active
  // If no metadata facts at all, assume active
  // Only return false if there's evidence of inactivity (e.g., rule_inactive)
  if (/rule_inactive\(\s*\w+\s*\)/.test(content)) return false;
  return true;
}

/**
 * Extract source format from `rule_source(Name, Source).`
 */
export function extractSourceFormat(content: string): string | null {
  const match = content.match(/rule_source\(\s*\w+\s*,\s*(\w+)\s*\)/);
  return match ? match[1] : null;
}

/**
 * Extract the rule name atom from any metadata fact.
 */
export function extractRuleName(content: string): string | null {
  const match = content.match(/rule_(?:active|priority|likelihood|type|category|source|applies)\(\s*(\w+)/);
  return match ? match[1] : null;
}

// ── Action-specific extractors ──────────────────────────────────────────────

function extractActionCategory(content: string): string | null {
  // Look for comment line "% Type: actionType / category"
  const match = content.match(/% Type:\s*\w+\s*\/\s*(\w+)/);
  return match ? match[1] : null;
}

function extractActionDifficulty(content: string): number | null {
  const match = content.match(/action_difficulty\(\s*\w+\s*,\s*(\d+(?:\.\d+)?)\s*\)/);
  return match ? parseFloat(match[1]) : null;
}

function extractActionDuration(content: string): number | null {
  const match = content.match(/action_duration\(\s*\w+\s*,\s*(\d+(?:\.\d+)?)\s*\)/);
  return match ? parseFloat(match[1]) : null;
}

function extractActionTargetType(content: string): string | null {
  const match = content.match(/action_target_type\(\s*\w+\s*,\s*(\w+)\s*\)/);
  return match ? match[1] : null;
}

function extractActionRange(content: string): number | null {
  const match = content.match(/action_range\(\s*\w+\s*,\s*(\d+)\s*\)/);
  return match ? parseInt(match[1]) : null;
}

function extractActionCooldown(content: string): number | null {
  const match = content.match(/action_cooldown\(\s*\w+\s*,\s*(\d+)\s*\)/);
  return match ? parseInt(match[1]) : null;
}

/**
 * Ensure Prolog content contains standard metadata facts.
 * If any are missing, prepend them based on the provided defaults.
 */
export function ensureMetadataInProlog(
  content: string,
  defaults: {
    name: string;
    priority?: number;
    likelihood?: number;
    ruleType?: string;
    category?: string;
    isActive?: boolean;
  }
): string {
  const lines: string[] = [];
  const name = sanitizeAtom(defaults.name);

  // Check what's already present
  const hasPriority = /rule_priority\(/.test(content);
  const hasLikelihood = /rule_likelihood\(/.test(content);
  const hasActive = /rule_active\(/.test(content);
  const hasType = /rule_type\(/.test(content);
  const hasCategory = /rule_category\(/.test(content);

  if (!hasActive && defaults.isActive !== false) {
    lines.push(`rule_active(${name}).`);
  }
  if (!hasPriority && defaults.priority != null) {
    lines.push(`rule_priority(${name}, ${defaults.priority}).`);
  }
  if (!hasLikelihood && defaults.likelihood != null) {
    lines.push(`rule_likelihood(${name}, ${defaults.likelihood}).`);
  }
  if (!hasType && defaults.ruleType) {
    lines.push(`rule_type(${name}, ${sanitizeAtom(defaults.ruleType)}).`);
  }
  if (!hasCategory && defaults.category) {
    lines.push(`rule_category(${name}, ${sanitizeAtom(defaults.category)}).`);
  }

  if (lines.length === 0) return content;

  return lines.join('\n') + '\n' + content;
}

function sanitizeAtom(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^([0-9])/, '_$1')
    .replace(/_+/g, '_')
    .replace(/_$/, '');
}
