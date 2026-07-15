/**
 * Quest Objective Fallback System
 *
 * Detects uncompletable quest objectives at runtime and provides fallback
 * alternatives. When an objective's target (NPC, item, location) is missing
 * from the world or the objective is otherwise blocked, this system substitutes
 * a completable alternative that preserves the quest's learning intent.
 */

import { VALID_OBJECTIVE_TYPES, CONVERSATION_ONLY_OBJECTIVE_TYPES } from './quest-objective-types';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ObjectiveFallback {
  /** The replacement objective type */
  type: string;
  /** Template description (use {target} for original target name) */
  descriptionTemplate: string;
  /** Whether this fallback requires a target entity */
  requiresTarget: boolean;
}

export interface FallbackObjective {
  id: string;
  questId: string;
  type: string;
  description: string;
  completed: boolean;
  /** ID of the original objective this replaced */
  replacedObjectiveId: string;
  /** Reason the original objective was replaced */
  fallbackReason: string;
  [key: string]: any;
}

export interface WorldState {
  /** NPC IDs or names currently present in the world */
  availableNpcs: string[];
  /** Location IDs or names currently accessible */
  availableLocations: string[];
  /** Item IDs or names currently available in the world */
  availableItems: string[];
}

export interface UncompletableObjective {
  objectiveId: string;
  objectiveType: string;
  reason: UncompletableReason;
  /** The missing target (NPC name, location, item, etc.) */
  missingTarget?: string;
}

export type UncompletableReason =
  | 'npc_missing'
  | 'location_unavailable'
  | 'item_unavailable'
  | 'target_missing'
  | 'dependency_unresolvable';

// ── Fallback mapping ────────────────────────────────────────────────────────
// Maps each objective type to ordered fallback alternatives. The first valid
// fallback is used. Fallbacks prefer the same interaction category (e.g.,
// NPC-based objectives fall back to other conversation types).

const OBJECTIVE_FALLBACK_MAP: Record<string, ObjectiveFallback[]> = {
  // NPC interaction fallbacks
  talk_to_npc: [
    { type: 'complete_conversation', descriptionTemplate: 'Have a conversation with any nearby NPC', requiresTarget: false },
    { type: 'use_vocabulary', descriptionTemplate: 'Practice vocabulary words in conversation', requiresTarget: false },
  ],
  conversation_initiation: [
    { type: 'talk_to_npc', descriptionTemplate: 'Talk to any available NPC', requiresTarget: false },
    { type: 'complete_conversation', descriptionTemplate: 'Have a conversation with any nearby NPC', requiresTarget: false },
  ],
  listen_and_repeat: [
    { type: 'pronunciation_check', descriptionTemplate: 'Practice pronunciation of target phrases', requiresTarget: false },
    { type: 'use_vocabulary', descriptionTemplate: 'Practice vocabulary words', requiresTarget: false },
  ],
  ask_for_directions: [
    { type: 'talk_to_npc', descriptionTemplate: 'Talk to any available NPC', requiresTarget: false },
    { type: 'complete_conversation', descriptionTemplate: 'Have a conversation with a nearby NPC', requiresTarget: false },
  ],
  order_food: [
    { type: 'talk_to_npc', descriptionTemplate: 'Talk to any available NPC', requiresTarget: false },
    { type: 'use_vocabulary', descriptionTemplate: 'Practice food-related vocabulary', requiresTarget: false },
  ],
  haggle_price: [
    { type: 'talk_to_npc', descriptionTemplate: 'Talk to any available NPC', requiresTarget: false },
    { type: 'use_vocabulary', descriptionTemplate: 'Practice number and price vocabulary', requiresTarget: false },
  ],
  introduce_self: [
    { type: 'talk_to_npc', descriptionTemplate: 'Introduce yourself to any available NPC', requiresTarget: false },
    { type: 'write_response', descriptionTemplate: 'Write a self-introduction in the target language', requiresTarget: false },
  ],
  build_friendship: [
    { type: 'talk_to_npc', descriptionTemplate: 'Talk to any available NPC', requiresTarget: false },
    { type: 'complete_conversation', descriptionTemplate: 'Have a friendly conversation with a nearby NPC', requiresTarget: false },
  ],
  give_gift: [
    { type: 'talk_to_npc', descriptionTemplate: 'Talk to any available NPC', requiresTarget: false },
    { type: 'use_vocabulary', descriptionTemplate: 'Practice gift-related vocabulary', requiresTarget: false },
  ],
  escort_npc: [
    { type: 'visit_location', descriptionTemplate: 'Visit a location in the area', requiresTarget: false },
    { type: 'talk_to_npc', descriptionTemplate: 'Talk to any available NPC', requiresTarget: false },
  ],
  deliver_item: [
    { type: 'talk_to_npc', descriptionTemplate: 'Talk to any available NPC about the delivery', requiresTarget: false },
    { type: 'complete_conversation', descriptionTemplate: 'Have a conversation about the item', requiresTarget: false },
  ],
  listening_comprehension: [
    { type: 'complete_conversation', descriptionTemplate: 'Have a conversation to practice comprehension', requiresTarget: false },
    { type: 'use_vocabulary', descriptionTemplate: 'Practice vocabulary through conversation', requiresTarget: false },
  ],
  teach_vocabulary: [
    { type: 'use_vocabulary', descriptionTemplate: 'Practice using vocabulary words', requiresTarget: false },
    { type: 'complete_conversation', descriptionTemplate: 'Have a conversation practicing vocabulary', requiresTarget: false },
  ],
  teach_phrase: [
    { type: 'pronunciation_check', descriptionTemplate: 'Practice pronouncing target phrases', requiresTarget: false },
    { type: 'use_vocabulary', descriptionTemplate: 'Practice using vocabulary words', requiresTarget: false },
  ],

  // Location-based fallbacks
  visit_location: [
    { type: 'discover_location', descriptionTemplate: 'Discover any new location', requiresTarget: false },
    { type: 'collect_vocabulary', descriptionTemplate: 'Collect vocabulary from your surroundings', requiresTarget: false },
  ],
  discover_location: [
    { type: 'visit_location', descriptionTemplate: 'Visit any known location', requiresTarget: false },
    { type: 'collect_vocabulary', descriptionTemplate: 'Collect vocabulary from your surroundings', requiresTarget: false },
  ],
  navigate_language: [
    { type: 'follow_directions', descriptionTemplate: 'Follow directions in the target language', requiresTarget: false },
    { type: 'visit_location', descriptionTemplate: 'Visit a nearby location', requiresTarget: false },
  ],

  // Item-based fallbacks
  collect_item: [
    { type: 'collect_vocabulary', descriptionTemplate: 'Collect vocabulary from nearby objects', requiresTarget: false },
    { type: 'identify_object', descriptionTemplate: 'Identify objects in your surroundings', requiresTarget: false },
  ],
  craft_item: [
    { type: 'collect_item', descriptionTemplate: 'Collect materials from the area', requiresTarget: false },
    { type: 'identify_object', descriptionTemplate: 'Identify crafting materials in the target language', requiresTarget: false },
  ],
  examine_object: [
    { type: 'identify_object', descriptionTemplate: 'Identify an object in the target language', requiresTarget: false },
    { type: 'collect_vocabulary', descriptionTemplate: 'Collect vocabulary from nearby objects', requiresTarget: false },
  ],
  read_sign: [
    { type: 'read_text', descriptionTemplate: 'Read any available text in the target language', requiresTarget: false },
    { type: 'collect_vocabulary', descriptionTemplate: 'Collect vocabulary from your surroundings', requiresTarget: false },
  ],
  point_and_name: [
    { type: 'identify_object', descriptionTemplate: 'Identify objects in the target language', requiresTarget: false },
    { type: 'use_vocabulary', descriptionTemplate: 'Practice naming vocabulary', requiresTarget: false },
  ],
  find_text: [
    { type: 'collect_vocabulary', descriptionTemplate: 'Collect vocabulary from your surroundings', requiresTarget: false },
    { type: 'read_sign', descriptionTemplate: 'Read any available sign or text', requiresTarget: false },
  ],
  read_text: [
    { type: 'read_sign', descriptionTemplate: 'Read any available sign or text', requiresTarget: false },
    { type: 'collect_vocabulary', descriptionTemplate: 'Collect vocabulary from your surroundings', requiresTarget: false },
  ],
  collect_text: [
    { type: 'collect_vocabulary', descriptionTemplate: 'Collect vocabulary from your surroundings', requiresTarget: false },
    { type: 'identify_object', descriptionTemplate: 'Identify objects in the target language', requiresTarget: false },
  ],

  // Combat fallback
  defeat_enemies: [
    { type: 'collect_item', descriptionTemplate: 'Collect items from the area', requiresTarget: false },
    { type: 'visit_location', descriptionTemplate: 'Explore the area', requiresTarget: false },
  ],
};

// Universal fallback for any type not in the map
const UNIVERSAL_FALLBACK: ObjectiveFallback = {
  type: 'complete_conversation',
  descriptionTemplate: 'Have a conversation with any nearby NPC',
  requiresTarget: false,
};

// ── Detection ───────────────────────────────────────────────────────────────

/**
 * Check a single objective against the current world state to determine
 * if it can be completed. Returns null if completable, or an
 * UncompletableObjective if not.
 */
export function detectUncompletableObjective(
  objective: { id: string; type: string; npcId?: string; npcName?: string; locationName?: string; itemName?: string; target?: string; [key: string]: any },
  worldState: WorldState,
): UncompletableObjective | null {
  const type = objective.type;
  if (!VALID_OBJECTIVE_TYPES.has(type)) return null;

  const typeInfo = getTargetRequirement(type);

  // Only flag objectives with placeholder/template targets as uncompletable.
  // Objectives with real named targets from Prolog content should be kept —
  // the player can still complete them even if our world state matching is imperfect.
  const isPlaceholder = (target: string | undefined): boolean => {
    if (!target) return false; // no target = no issue
    // Placeholder patterns: {npc}, {location}, empty, or MongoDB ObjectIds
    return target.startsWith('{') || target === '' || /^[0-9a-f]{24}$/i.test(target);
  };

  if (typeInfo === 'npc') {
    const target = objective.npcId || objective.npcName || objective.target;
    if (isPlaceholder(target)) {
      return {
        objectiveId: objective.id,
        objectiveType: type,
        reason: 'npc_missing',
        missingTarget: target,
      };
    }
  }

  if (typeInfo === 'location') {
    const target = objective.locationName || objective.target;
    if (isPlaceholder(target)) {
      return {
        objectiveId: objective.id,
        objectiveType: type,
        reason: 'location_unavailable',
        missingTarget: target,
      };
    }
  }

  if (typeInfo === 'item') {
    const target = objective.itemName || objective.target;
    if (isPlaceholder(target)) {
      return {
        objectiveId: objective.id,
        objectiveType: type,
        reason: 'item_unavailable',
        missingTarget: target,
      };
    }
  }

  return null;
}

/**
 * Scan all objectives in a quest and return those that cannot be completed
 * given the current world state.
 */
export function detectUncompletableObjectives(
  objectives: Array<{ id: string; type: string; completed?: boolean; dependsOn?: string[]; [key: string]: any }>,
  worldState: WorldState,
): UncompletableObjective[] {
  const results: UncompletableObjective[] = [];

  for (const obj of objectives) {
    // Skip already-completed objectives
    if (obj.completed) continue;

    const issue = detectUncompletableObjective(obj, worldState);
    if (issue) {
      results.push(issue);
    }
  }

  // Check for dependency chains that are broken by uncompletable objectives
  const uncompletableIds = new Set(results.map(r => r.objectiveId));
  for (const obj of objectives) {
    if (obj.completed || uncompletableIds.has(obj.id)) continue;

    if (obj.dependsOn && obj.dependsOn.some(depId => uncompletableIds.has(depId))) {
      results.push({
        objectiveId: obj.id,
        objectiveType: obj.type,
        reason: 'dependency_unresolvable',
        missingTarget: undefined,
      });
      uncompletableIds.add(obj.id);
    }
  }

  return results;
}

// ── Fallback generation ─────────────────────────────────────────────────────

/**
 * Get fallback alternatives for a specific objective type.
 * Returns the ordered list of fallbacks, or the universal fallback if none defined.
 */
export function getFallbacksForType(objectiveType: string): ObjectiveFallback[] {
  return OBJECTIVE_FALLBACK_MAP[objectiveType] || [UNIVERSAL_FALLBACK];
}

/**
 * Generate a fallback objective to replace an uncompletable one.
 * Tries each fallback in order and returns the first valid one.
 */
export function generateFallbackObjective(
  original: { id: string; questId: string; type: string; description: string; order?: number; dependsOn?: string[]; [key: string]: any },
  reason: UncompletableReason,
  missingTarget?: string,
): FallbackObjective {
  const fallbacks = getFallbacksForType(original.type);
  const chosen = fallbacks[0] || UNIVERSAL_FALLBACK;

  const description = chosen.descriptionTemplate.replace(
    '{target}',
    missingTarget || 'the target',
  );

  return {
    id: original.id,
    questId: original.questId,
    type: chosen.type,
    description,
    completed: false,
    replacedObjectiveId: original.id,
    fallbackReason: formatFallbackReason(reason, missingTarget),
    // Preserve ordering
    ...(original.order != null ? { order: original.order } : {}),
    // Clear broken dependencies — a fallback should be completable
    // Keep dependsOn only if the dependencies aren't the cause
    ...(reason !== 'dependency_unresolvable' && original.dependsOn
      ? { dependsOn: original.dependsOn }
      : {}),
  };
}

/**
 * Apply fallbacks to all uncompletable objectives in a quest.
 * Returns the updated objectives array and a log of changes made.
 */
export function applyObjectiveFallbacks(
  objectives: Array<{ id: string; questId: string; type: string; description: string; completed?: boolean; [key: string]: any }>,
  worldState: WorldState,
): { objectives: typeof objectives; applied: FallbackResult[] } {
  const issues = detectUncompletableObjectives(objectives, worldState);
  if (issues.length === 0) {
    return { objectives, applied: [] };
  }

  const issueMap = new Map(issues.map(i => [i.objectiveId, i]));
  const applied: FallbackResult[] = [];

  const updatedObjectives = objectives.map(obj => {
    const issue = issueMap.get(obj.id);
    if (!issue || obj.completed) return obj;

    const fallback = generateFallbackObjective(obj, issue.reason, issue.missingTarget);
    applied.push({
      originalObjectiveId: obj.id,
      originalType: obj.type,
      fallbackType: fallback.type,
      reason: issue.reason,
      missingTarget: issue.missingTarget,
    });

    return fallback;
  });

  return { objectives: updatedObjectives, applied };
}

export interface FallbackResult {
  originalObjectiveId: string;
  originalType: string;
  fallbackType: string;
  reason: UncompletableReason;
  missingTarget?: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function getTargetRequirement(type: string): 'npc' | 'item' | 'location' | 'none' {
  const npcTypes = new Set([
    'talk_to_npc', 'conversation_initiation', 'deliver_item', 'escort_npc',
    'build_friendship', 'give_gift', 'listening_comprehension', 'listen_and_repeat',
    'ask_for_directions', 'order_food', 'haggle_price', 'introduce_self',
    'teach_vocabulary', 'teach_phrase',
  ]);
  const locationTypes = new Set(['visit_location', 'discover_location', 'navigate_language']);
  const itemTypes = new Set([
    'collect_item', 'craft_item', 'examine_object', 'read_sign',
    'point_and_name', 'find_text', 'read_text',
  ]);

  if (npcTypes.has(type)) return 'npc';
  if (locationTypes.has(type)) return 'location';
  if (itemTypes.has(type)) return 'item';
  return 'none';
}

function matchesAny(target: string, available: string[]): boolean {
  const normalized = target.toLowerCase().trim();
  return available.some(a => a.toLowerCase().trim() === normalized);
}

function formatFallbackReason(reason: UncompletableReason, target?: string): string {
  switch (reason) {
    case 'npc_missing':
      return target ? `NPC "${target}" is not available` : 'Required NPC is not available';
    case 'location_unavailable':
      return target ? `Location "${target}" is not accessible` : 'Required location is not accessible';
    case 'item_unavailable':
      return target ? `Item "${target}" is not available` : 'Required item is not available';
    case 'target_missing':
      return target ? `Target "${target}" is missing` : 'Required target is missing';
    case 'dependency_unresolvable':
      return 'A required preceding objective cannot be completed';
  }
}
