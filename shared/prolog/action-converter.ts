/**
 * Action-to-Prolog Converter
 *
 * Converts Insimul action definitions (prerequisites/effects in JSON)
 * into Prolog predicates. Actions become queryable facts and rules:
 *
 *   action(ActionId, Name, Type, EnergyCost).
 *   action_prerequisite(ActionId, Goal).
 *   action_effect(ActionId, Effect).
 *   can_perform(Actor, ActionId) :- <prerequisites check>.
 */

import { ACTION_PREREQUISITES } from './action-prerequisites';
import { ACTION_EFFECTS } from './action-effects';

// ── Types ───────────────────────────────────────────────────────────────────

export interface ConvertOptions {
  /** New-style prerequisites as raw Prolog goal strings */
  prerequisites?: string[];
  /** New-style effects as raw Prolog effect term strings */
  effects?: string[];
  /** Whether this action inherits prerequisites from its parent */
  inheritsFromParent?: boolean;
}

interface ActionData {
  name: string;
  description?: string;
  actionType: string;
  category?: string;
  parentAction?: string | null;
  energyCost?: number | null;
  difficulty?: number | null;
  duration?: number | null;
  targetType?: string | null;
  requiresTarget?: boolean | null;
  range?: number | null;
  cooldown?: number | null;
  verbPast?: string | null;
  verbPresent?: string | null;
  emitsEvent?: string | null;
  gameActivityVerb?: string | null;
  completesObjectiveType?: string | null;
  prerequisites?: any[];
  effects?: any[];
  sideEffects?: any[];
  triggerConditions?: any[];
}

interface ConversionResult {
  prologContent: string;
  predicates: string[];
  errors: string[];
}

// ── Converter ───────────────────────────────────────────────────────────────

export function convertActionToProlog(action: ActionData, options?: ConvertOptions): ConversionResult {
  const errors: string[] = [];
  const predicates: string[] = [];
  const lines: string[] = [];
  const actionId = sanitizeAtom(action.name);

  // Metadata comments
  lines.push(`% Action: ${action.name}`);
  if (action.description) lines.push(`% ${action.description}`);
  lines.push(`% Type: ${action.actionType}${action.category ? ' / ' + action.category : ''}`);
  lines.push('');

  // Core action fact
  const energyCost = action.energyCost ?? 1;
  const difficulty = action.difficulty ?? 0.5;
  const duration = action.duration ?? 1;
  lines.push(`action(${actionId}, '${escapeString(action.name)}', ${sanitizeAtom(action.actionType)}, ${energyCost}).`);
  lines.push(`action_difficulty(${actionId}, ${difficulty}).`);
  lines.push(`action_duration(${actionId}, ${duration}).`);
  predicates.push('action/4', 'action_difficulty/2', 'action_duration/2');

  // Category
  if (action.category) {
    lines.push(`action_category(${actionId}, ${sanitizeAtom(action.category)}).`);
    predicates.push('action_category/2');
  }

  // Hierarchy
  if (action.parentAction) {
    lines.push(`action_parent(${actionId}, ${sanitizeAtom(action.parentAction)}).`);
    predicates.push('action_parent/2');
  }

  // Verb forms (for language learning)
  if (action.verbPast) {
    lines.push(`action_verb(${actionId}, past, '${escapeString(action.verbPast)}').`);
    predicates.push('action_verb/3');
  }
  if (action.verbPresent) {
    lines.push(`action_verb(${actionId}, present, '${escapeString(action.verbPresent)}').`);
  }

  // Target info
  if (action.targetType) {
    lines.push(`action_target_type(${actionId}, ${sanitizeAtom(action.targetType)}).`);
    predicates.push('action_target_type/2');
  }
  if (action.requiresTarget) {
    lines.push(`action_requires_target(${actionId}).`);
    predicates.push('action_requires_target/1');
  }
  if (action.range != null && action.range > 0) {
    lines.push(`action_range(${actionId}, ${action.range}).`);
    predicates.push('action_range/2');
  }
  if (action.cooldown != null && action.cooldown > 0) {
    lines.push(`action_cooldown(${actionId}, ${action.cooldown}).`);
    predicates.push('action_cooldown/2');
  }

  // Event mapping — links this action to the game event that triggers it
  if (action.emitsEvent) {
    lines.push(`action_emits_event(${actionId}, '${escapeString(action.emitsEvent)}').`);
    predicates.push('action_emits_event/2');
  }
  if (action.gameActivityVerb) {
    lines.push(`action_activity(${actionId}, ${sanitizeAtom(action.gameActivityVerb)}).`);
    predicates.push('action_activity/2');
  }
  if (action.completesObjectiveType) {
    lines.push(`action_completes_objective(${actionId}, ${sanitizeAtom(action.completesObjectiveType)}).`);
    predicates.push('action_completes_objective/2');
  }

  // ── New-style prerequisites & effects (from action-prerequisites.ts / action-effects.ts) ──
  const hasNewStylePrereqs = options?.prerequisites !== undefined;
  const hasNewStyleEffects = options?.effects !== undefined;

  // Collect all can_perform goals
  const canPerformGoals: string[] = [];

  if (hasNewStylePrereqs) {
    // Resolve parent prerequisites when inheriting
    if (options!.inheritsFromParent && action.parentAction) {
      const parentId = sanitizeAtom(action.parentAction);
      const parentDef = ACTION_PREREQUISITES[parentId];
      if (parentDef) {
        canPerformGoals.push(...parentDef.prerequisites);
      }
    }
    // Add own prerequisites
    canPerformGoals.push(...options!.prerequisites!);

    // Emit action_prerequisite/2 facts for each goal
    for (const goal of canPerformGoals) {
      lines.push(`action_prerequisite(${actionId}, (${goal})).`);
    }
    if (canPerformGoals.length > 0) {
      predicates.push('action_prerequisite/2');
    }
  } else {
    // Legacy: convert from ActionData JSON prerequisites
    const prereqs = action.prerequisites || [];
    for (const prereq of prereqs) {
      const goal = convertPrerequisite(prereq, errors);
      if (goal) {
        canPerformGoals.push(goal);
        lines.push(`action_prerequisite(${actionId}, ${wrapGoal(goal)}).`);
      }
    }
    if (canPerformGoals.length > 0) {
      predicates.push('action_prerequisite/2');
    }

    // Trigger conditions (legacy)
    const triggers = action.triggerConditions || [];
    for (const trigger of triggers) {
      const goal = convertPrerequisite(trigger, errors);
      if (goal) {
        lines.push(`action_trigger(${actionId}, ${wrapGoal(goal)}).`);
      }
    }
    if (triggers.length > 0) {
      predicates.push('action_trigger/2');
    }
  }

  // ── Effects ──────────────────────────────────────────────────────────────
  if (hasNewStyleEffects) {
    for (const effect of options!.effects!) {
      lines.push(`action_effect(${actionId}, (${effect})).`);
    }
    if (options!.effects!.length > 0) {
      predicates.push('action_effect/2');
    }
  } else {
    // Try auto-lookup from ACTION_EFFECTS catalog if no effects on the action data
    const actionKey = actionId.replace(/'/g, '');
    const catalogEntry = ACTION_EFFECTS[actionKey];
    const legacyEffects = action.effects || [];
    const effectsToUse = legacyEffects.length > 0 ? legacyEffects : (catalogEntry?.effects || []);

    if (catalogEntry && legacyEffects.length === 0) {
      // Use catalog effects directly as Prolog terms
      for (const effect of catalogEntry.effects) {
        lines.push(`action_effect(${actionId}, (${effect})).`);
      }
      if (catalogEntry.effects.length > 0) {
        predicates.push('action_effect/2');
      }
    } else {
      // Legacy: convert from ActionData JSON effects
      for (const effect of legacyEffects) {
        const term = convertEffect(effect, errors);
        if (term) {
          lines.push(`action_effect(${actionId}, ${term}).`);
        }
      }
      if (legacyEffects.length > 0) {
        predicates.push('action_effect/2');
      }
    }

    // Side effects (legacy only)
    const sideEffects = action.sideEffects || [];
    for (const effect of sideEffects) {
      const term = convertEffect(effect, errors);
      if (term) {
        lines.push(`action_side_effect(${actionId}, ${term}).`);
      }
    }
    if (sideEffects.length > 0) {
      predicates.push('action_side_effect/2');
    }
  }

  // ── Generate can_perform rule ────────────────────────────────────────────
  lines.push(`% Can Actor perform this action?`);

  if (hasNewStylePrereqs) {
    // New-style: prerequisites already include energy checks where needed
    if (canPerformGoals.length > 0) {
      if (action.requiresTarget) {
        lines.push(`can_perform(Actor, ${actionId}, Target) :-`);
        predicates.push('can_perform/3');
      } else {
        lines.push(`can_perform(Actor, ${actionId}) :-`);
        predicates.push('can_perform/2');
      }
      lines.push(`    ${canPerformGoals.join(',\n    ')}.`);
    } else {
      // No prerequisites — action is always available (animation-only / no requirements)
      if (action.requiresTarget) {
        lines.push(`can_perform(_, ${actionId}, _).`);
        predicates.push('can_perform/3');
      } else {
        lines.push(`can_perform(_, ${actionId}).`);
        predicates.push('can_perform/2');
      }
    }
  } else {
    // Legacy: default energy check
    const legacyConditions = [
      `action(${actionId}, _, _, EnergyCost)`,
      `energy(Actor, E, _)`,
      `E >= EnergyCost`,
    ];
    if (canPerformGoals.length > 0) {
      legacyConditions.push(...canPerformGoals.map(g => g.replace(/\binitiator\b/g, 'Actor').replace(/\bresponder\b/g, 'Target')));
    }
    if (action.requiresTarget) {
      lines.push(`can_perform(Actor, ${actionId}, Target) :-`);
      lines.push(`    ${legacyConditions.join(',\n    ')}.`);
      predicates.push('can_perform/3');
    } else {
      lines.push(`can_perform(Actor, ${actionId}) :-`);
      lines.push(`    ${legacyConditions.join(',\n    ')}.`);
      predicates.push('can_perform/2');
    }
  }

  // Collapse consecutive blank lines and trim trailing blanks
  const prologContent = lines.join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n\n$/,'\n');

  return {
    prologContent,
    predicates: Array.from(new Set(predicates)),
    errors,
  };
}

/**
 * Batch convert multiple actions.
 */
export function convertActionsToProlog(actions: ActionData[]): ConversionResult {
  const allLines: string[] = [];
  const allPredicates: string[] = [];
  const allErrors: string[] = [];

  allLines.push('% Insimul Actions - Auto-generated Prolog');
  allLines.push(`% Generated: ${new Date().toISOString()}`);
  allLines.push(`% Total actions: ${actions.length}`);
  allLines.push('');

  // Shared dynamic declarations
  const dynamicPreds = [
    'action/4', 'action_difficulty/2', 'action_duration/2',
    'action_category/2', 'action_parent/2', 'action_verb/3',
    'action_target_type/2', 'action_requires_target/1',
    'action_range/2', 'action_cooldown/2',
    'action_prerequisite/2', 'action_trigger/2',
    'action_effect/2', 'action_side_effect/2',
    'can_perform/2', 'can_perform/3',
    'energy/3',
  ];
  for (const p of dynamicPreds) {
    allLines.push(`:- dynamic(${p}).`);
  }
  allLines.push('');

  for (const action of actions) {
    const result = convertActionToProlog(action);
    allLines.push(result.prologContent);
    allLines.push('');
    allPredicates.push(...result.predicates);
    if (result.errors.length > 0) {
      allErrors.push(`[${action.name}]: ${result.errors.join('; ')}`);
    }
  }

  // Helper rules
  allLines.push('% Helper: find all actions an actor can perform');
  allLines.push('available_actions(Actor, Actions) :-');
  allLines.push('    findall(A, can_perform(Actor, A), Actions).');
  allLines.push('');
  allLines.push('% Helper: find actions by type');
  allLines.push('actions_of_type(Type, Actions) :-');
  allLines.push('    findall(A, action(A, _, Type, _), Actions).');

  return {
    prologContent: allLines.join('\n'),
    predicates: Array.from(new Set(allPredicates)),
    errors: allErrors,
  };
}

// ── Prerequisite Converter ──────────────────────────────────────────────────

function convertPrerequisite(prereq: any, errors: string[]): string | null {
  if (typeof prereq === 'string') return prereq;
  if (!prereq || typeof prereq !== 'object') return null;

  const type = prereq.type || prereq.category || '';
  const first = normalizeTarget(prereq.first);
  const second = normalizeTarget(prereq.second);
  const prop = prereq.property ? sanitizeAtom(prereq.property) : null;
  const op = prereq.operator;
  const val = prereq.value;

  // Attribute check: attribute(Actor, property, Value), Value op val
  if (type === 'attribute' && prop) {
    if (op && val !== undefined) {
      const prologOp = convertOperator(op);
      if (prologOp) {
        return `attribute(${first}, ${prop}, Val), Val ${prologOp} ${val}`;
      }
    }
    return `attribute(${first}, ${prop}, _)`;
  }

  // Trait check
  if (type === 'trait' && prop) {
    if (val === false) return `\\+ has_trait(${first}, ${prop})`;
    return `has_trait(${first}, ${prop})`;
  }

  // Relationship check
  if (type === 'relationship' && prop) {
    if (op && val !== undefined) {
      const prologOp = convertOperator(op);
      if (prologOp) {
        return `relationship(${first}, ${second || 'Target'}, ${prop}, Val), Val ${prologOp} ${val}`;
      }
    }
    return `relationship(${first}, ${second || 'Target'}, ${prop}, _)`;
  }

  // Network check (ensemble-style)
  if (type === 'network' && prop) {
    if (op && val !== undefined) {
      const prologOp = convertOperator(op);
      if (prologOp) {
        return `network(${first}, ${second || 'Target'}, ${prop}, Val), Val ${prologOp} ${val}`;
      }
    }
    return `network(${first}, ${second || 'Target'}, ${prop}, _)`;
  }

  // Status check
  if (type === 'status' && prop) {
    if (val === false) return `\\+ status(${first}, ${second || 'Target'}, ${prop})`;
    return `status(${first}, ${second || 'Target'}, ${prop})`;
  }

  // Event check
  if (type === 'event' && prop) {
    return `event_occurred(${first}, ${prop})`;
  }

  // Location check
  if (type === 'location') {
    if (val) return `at_location(${first}, ${sanitizeAtom(String(val))})`;
    return `at_location(${first}, _)`;
  }

  // Energy check
  if (type === 'energy') {
    if (op && val !== undefined) {
      const prologOp = convertOperator(op);
      if (prologOp) return `energy(${first}, E), E ${prologOp} ${val}`;
    }
    return `energy(${first}, _)`;
  }

  // Intent check (ensemble)
  if (type === 'intent' && prop) {
    return `intent(${first}, ${second || 'Target'}, ${prop})`;
  }

  // Knowledge check
  if (type === 'knowledge' && prop) {
    return `knows(${first}, ${second || 'Target'}, ${prop})`;
  }

  // Knowledge value check
  if (type === 'knowledge_value' && prop) {
    if (val !== undefined) {
      const valueAtom = typeof val === 'string' ? `'${val}'` : String(val);
      return `knows_value(${first}, ${second || 'Target'}, ${prop}, ${valueAtom})`;
    }
    return `knows_value(${first}, ${second || 'Target'}, ${prop}, _)`;
  }

  // Belief check
  if (type === 'belief' && prop) {
    if (op && val !== undefined) {
      const prologOp = convertOperator(op);
      if (prologOp) {
        return `believes(${first}, ${second || 'Target'}, ${prop}, C), C ${prologOp} ${val}`;
      }
    }
    return `believes(${first}, ${second || 'Target'}, ${prop}, _)`;
  }

  // Mental model check
  if (type === 'mental_model') {
    if (op && val !== undefined) {
      const prologOp = convertOperator(op);
      if (prologOp) {
        return `mental_model_confidence(${first}, ${second || 'Target'}, C), C ${prologOp} ${val}`;
      }
    }
    return `has_mental_model(${first}, ${second || 'Target'})`;
  }

  // Generic predicate fallback
  if (prereq.predicate) {
    const pred = sanitizeAtom(prereq.predicate);
    if (second) return `${pred}(${first}, ${second})`;
    return `${pred}(${first})`;
  }

  errors.push(`Unknown prerequisite type: ${type}`);
  return null;
}

// ── Effect Converter ────────────────────────────────────────────────────────

function convertEffect(effect: any, errors: string[]): string | null {
  if (typeof effect === 'string') return sanitizeAtom(effect);
  if (!effect || typeof effect !== 'object') return null;

  const type = effect.type || '';
  const first = normalizeTarget(effect.first || effect.target);
  const second = normalizeTarget(effect.second);
  const prop = effect.property ? sanitizeAtom(effect.property) : null;
  const val = effect.value;

  if (type === 'relationship' && prop) {
    return `modify_relationship(${first}, ${second || 'Target'}, ${prop}, ${val || 0})`;
  }
  if (type === 'attribute' && prop) {
    return `modify_attribute(${first}, ${prop}, ${val || 0})`;
  }
  if (type === 'status' && prop) {
    return `set_status(${first}, ${second || 'Target'}, ${prop})`;
  }
  if (type === 'event' && prop) {
    return `trigger_event(${first}, ${prop})`;
  }
  if (type === 'item') {
    return `give_item(${first}, ${sanitizeAtom(String(val || ''))})`;
  }
  if (type === 'knowledge') {
    return `add_knowledge(${first}, ${sanitizeAtom(String(val || ''))})`;
  }
  if (type === 'learn_fact' && prop) {
    return `assert_knows(${first}, ${second || 'Target'}, ${prop})`;
  }
  if (type === 'learn_value' && prop) {
    const valueAtom = typeof val === 'string' ? `'${escapeString(val)}'` : String(val || 0);
    return `assert_knows_value(${first}, ${second || 'Target'}, ${prop}, ${valueAtom})`;
  }
  if (type === 'add_belief' || type === 'belief') {
    if (prop) {
      const confidence = val || 0.5;
      return `assert_believes(${first}, ${second || 'Target'}, ${prop}, ${confidence})`;
    }
  }
  if (type === 'share_knowledge') {
    return `share_knowledge(${first}, ${second || 'Target'})`;
  }
  if (type === 'gold') {
    return `modify_gold(${first}, ${val || 0})`;
  }
  if (type === 'dialogue') {
    return `dialogue('${escapeString(String(val || ''))}')`;
  }
  if (type === 'relationship_change') {
    return `modify_relationship(${first || 'Actor'}, Target, affinity, ${val || 0})`;
  }
  if (type === 'mood_change') {
    return `set_mood(${first || 'Actor'}, ${sanitizeAtom(String(val || ''))})`;
  }

  // Ensemble network effects
  const category = effect.category || '';
  const params = effect.parameters || {};
  if (category === 'network' || category === 'intent') {
    const effType = params.type || effect.action || type;
    const weight = params.weight !== undefined ? params.weight : val;
    const p1 = normalizeTarget(params.first);
    const p2 = normalizeTarget(params.second);
    return `modify_network(${p1}, ${p2}, ${sanitizeAtom(effType)}, ${weight || 0})`;
  }

  if (effect.action) {
    return `effect(${sanitizeAtom(effect.action)}, ${sanitizeAtom(String(val || ''))})`;
  }

  errors.push(`Unknown effect type: ${type}`);
  return null;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalizeTarget(target: string | undefined | null): string {
  if (!target) return 'Actor';
  if (target === 'initiator' || target === 'x' || target === 'self') return 'Actor';
  if (target === 'responder' || target === 'y' || target === 'other' || target === 'target') return 'Target';
  return sanitizeAtom(target);
}

function convertOperator(op: string): string | null {
  switch (op) {
    case '=': case 'equals': case '==': return '=:=';
    case '!=': case 'not_equals': return '=\\=';
    case '>': case 'greater_than': return '>';
    case '<': case 'less_than': return '<';
    case '>=': case 'greater_equal': case 'gte': return '>=';
    case '<=': case 'less_equal': case 'lte': return '=<';
    case '+': return '>';  // "+" in ensemble often means "positive"
    case '-': return '<';
    default: return null;
  }
}

function wrapGoal(goal: string): string {
  // Wrap a goal string as a Prolog term for storage
  if (goal.includes(',') || goal.includes('\\+')) {
    return `(${goal})`;
  }
  return goal;
}

function sanitizeAtom(str: string): string {
  let atom = str
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (/^[0-9]/.test(atom)) atom = `n${atom}`;
  return atom || 'unknown';
}

function escapeString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
