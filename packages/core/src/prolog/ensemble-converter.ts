/**
 * Ensemble JSON → Prolog Converter
 *
 * Converts Ensemble-format volition rules and actions into Prolog facts and rules.
 *
 * Ensemble uses a structured condition/effect model with categories:
 *   - network (affinity, trust, closeness, etc.) — numeric, between two actors
 *   - attribute (intelligence, charisma, etc.) — numeric, on one actor
 *   - trait (modest, vain, cruel, etc.) — boolean, on one actor
 *   - status (hungry, happy, tired, etc.) — boolean, on one actor
 *   - relationship (married, allies, friends, etc.) — boolean, between two actors
 *   - directed status (attracted to, jealous of, etc.) — boolean, between two actors
 *   - event (met, nice, mean, etc.) — happened between actors
 *   - intent (beg, flirt, fight, etc.) — desired action
 *
 * These map to Prolog predicates:
 *   - network(Actor1, Actor2, Type, Value)
 *   - attribute(Actor, Type, Value)
 *   - trait(Actor, Type)  /  \+ trait(Actor, Type) for value=false
 *   - status(Actor, Type) /  \+ status(Actor, Type)
 *   - relationship(Actor1, Actor2, Type)
 *   - directed_status(Actor1, Actor2, Type)
 *   - event(Actor1, Actor2, Type, TurnsAgo)
 *   - intent(Actor, Type, Target, Weight)
 */

// ── Types ───────────────────────────────────────────────────────────────

interface EnsembleCondition {
  category: string;
  type: string;
  first: string;
  second?: string;
  operator?: string;
  value?: any;
  turnsAgoBetween?: [number, number];
}

interface EnsembleEffect {
  category: string;
  type: string;
  first: string;
  second?: string;
  operator?: string;
  value?: any;
  weight?: number;
  intentType?: boolean;
}

interface EnsembleVolitionRule {
  name: string;
  title?: string;
  /**
   * Rule type emitted as `rule_type/2` (a HARD requirement — `validateRuleContent`
   * rejects rules without it). Ensemble volition-rule files are `volition` by
   * construction, so this defaults to `'volition'`; a source rule tagged as a
   * state-changing trigger passes `'trigger'` explicitly.
   */
  type?: 'volition' | 'trigger';
  /** Firing probability 0.0–1.0, emitted as `rule_likelihood/2` when present. */
  likelihood?: number;
  conditions: EnsembleCondition[];
  effects: EnsembleEffect[];
}

interface EnsembleAction {
  name: string;
  displayName?: string;
  conditions: EnsembleCondition[];
  effects: EnsembleEffect[];
  leadsTo?: string[];
  influenceRules?: any[];
  isAccept?: boolean;
  intent?: any;
}

export interface ConversionResult {
  name: string;
  prologContent: string | null;
  skipped: boolean;
  skipReason?: string;
  /** Citations from source material (e.g., VESPACE literary references). */
  citations?: Array<{ title: string; content?: string; url?: string }>;
}

// ── Variable mapping ────────────────────────────────────────────────────

/** Map Ensemble actor names to Prolog variables */
function actorToVar(actor: string): string {
  switch (actor.toLowerCase()) {
    case 'x':
    case 'initiator':
      return 'X';
    case 'y':
    case 'responder':
      return 'Y';
    case 'z':
    case 'third':
    case 'someone':
    case 'someoneelse':
      return 'Z';
    case 'other':
      return 'Other';
    case 'victim':
      return 'Victim';
    case 'mutualfriend':
      return 'MutualFriend';
    case 'wouldbelover':
      return 'WouldBeLover';
    default:
      // Named characters or unknown — use sanitized atom
      return sanitizeAtom(actor);
  }
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

function sanitizeRuleName(name: string): string {
  return sanitizeAtom(name.replace(/\s+/g, '_').substring(0, 80));
}

/**
 * Normalize a source category label to the canonical spaced-lowercase key the
 * condition/effect switches match on.
 *
 * Category audit (US-PC2 / old US-004): source corpora spell the multi-word
 * VESPACE categories inconsistently — `"directed status"`, `"DirectedStatus"`,
 * `"directed_status"`, `"Directed Status"` all denote the same category. This
 * splits camelCase, folds separators (`_`/`-`/whitespace) to a single space, and
 * lowercases, so category matching is both case-insensitive AND separator-
 * insensitive. Every `switch (normalizeCategory(...))` case below uses the
 * canonical spaced form.
 */
function normalizeCategory(cat: string | undefined): string {
  if (!cat) return '';
  return cat
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2') // camelCase → spaced words
    .toLowerCase()
    .replace(/[_\-\s]+/g, ' ') // underscores / dashes / runs of space → one space
    .trim();
}

// ── Condition → Prolog clause ───────────────────────────────────────────

function conditionToProlog(cond: EnsembleCondition): string | null {
  const cat = normalizeCategory(cond.category);
  const type = sanitizeAtom(cond.type || 'unknown');
  const first = actorToVar(cond.first || 'x');
  const second = cond.second ? actorToVar(cond.second) : null;

  switch (cat) {
    case 'network': {
      if (!second) return null;
      const valVar = `${type}_val`.replace(/[^a-zA-Z0-9_]/g, '_');
      const ValVar = valVar.charAt(0).toUpperCase() + valVar.slice(1);
      const comparison = operatorToProlog(cond.operator, ValVar, cond.value);
      if (!comparison) {
        return `network(${first}, ${second}, ${type}, _)`;
      }
      return `network(${first}, ${second}, ${type}, ${ValVar}), ${comparison}`;
    }

    case 'attribute': {
      const valVar = `${type}_val`.replace(/[^a-zA-Z0-9_]/g, '_');
      const ValVar = valVar.charAt(0).toUpperCase() + valVar.slice(1);
      if (cond.operator && cond.value != null) {
        const comparison = operatorToProlog(cond.operator, ValVar, cond.value);
        if (!comparison) return `attribute(${first}, ${type}, _)`;
        return `attribute(${first}, ${type}, ${ValVar}), ${comparison}`;
      }
      return `attribute(${first}, ${type}, _)`;
    }

    case 'trait': {
      if (cond.value === false) {
        return `\\+ trait(${first}, ${type})`;
      }
      return `trait(${first}, ${type})`;
    }

    case 'status': {
      if (cond.value === false) {
        return `\\+ status(${first}, ${type})`;
      }
      return `status(${first}, ${type})`;
    }

    case 'mood': {
      if (cond.value === false) {
        return `\\+ mood(${first}, ${type})`;
      }
      return `mood(${first}, ${type})`;
    }

    case 'relationship': {
      if (!second) return `relationship(${first}, _, ${type})`;
      if (cond.value === false) {
        return `\\+ relationship(${first}, ${second}, ${type})`;
      }
      return `relationship(${first}, ${second}, ${type})`;
    }

    case 'directed status': {
      if (!second) return null;
      if (cond.value === false) {
        return `\\+ directed_status(${first}, ${second}, ${type})`;
      }
      return `directed_status(${first}, ${second}, ${type})`;
    }

    case 'event':
    case 'event undirected': {
      if (cond.turnsAgoBetween) {
        const [min, max] = cond.turnsAgoBetween;
        const turnsVar = 'TurnsAgo';
        const target = second || '_';
        return `event(${first}, ${target}, ${type}, ${turnsVar}), ${turnsVar} >= ${min}, ${turnsVar} =< ${max}`;
      }
      const target = second || '_';
      if (cond.value === false) {
        return `\\+ event(${first}, ${target}, ${type}, _)`;
      }
      return `event(${first}, ${target}, ${type}, _)`;
    }

    case 'intent': {
      const target = second || '_';
      return `intent(${first}, ${type}, ${target}, _)`;
    }

    default:
      return null;
  }
}

function operatorToProlog(op: string | undefined, varName: string, value: any): string | null {
  if (op == null || value == null) return null;
  switch (op) {
    case '>': return `${varName} > ${value}`;
    case '<': return `${varName} < ${value}`;
    case '>=': return `${varName} >= ${value}`;
    case '<=': case '=<': return `${varName} =< ${value}`;
    case '=': case '==': return `${varName} =:= ${value}`;
    default: return null;
  }
}

// ── Effect → Prolog fact ────────────────────────────────────────────────

function effectToProlog(effect: EnsembleEffect, ruleName: string): string | null {
  const cat = normalizeCategory(effect.category);
  const type = sanitizeAtom(effect.type || 'unknown');
  const first = actorToVar(effect.first || 'x');
  const second = effect.second ? actorToVar(effect.second) : null;

  switch (cat) {
    case 'network': {
      if (!second) return null;
      const op = effect.operator || '+';
      const val = effect.value ?? 0;
      return `rule_effect(${ruleName}, modify_network(${first}, ${second}, ${type}, '${op}', ${val}))`;
    }

    case 'attribute': {
      const op = effect.operator || '+';
      const val = effect.value ?? 0;
      return `rule_effect(${ruleName}, modify_attribute(${first}, ${type}, '${op}', ${val}))`;
    }

    case 'trait': {
      if (effect.value === false) {
        return `rule_effect(${ruleName}, remove_trait(${first}, ${type}))`;
      }
      return `rule_effect(${ruleName}, add_trait(${first}, ${type}))`;
    }

    case 'status': {
      if (effect.value === false) {
        return `rule_effect(${ruleName}, remove_status(${first}, ${type}))`;
      }
      return `rule_effect(${ruleName}, add_status(${first}, ${type}))`;
    }

    case 'relationship': {
      if (!second) return null;
      if (effect.value === false) {
        return `rule_effect(${ruleName}, remove_relationship(${first}, ${second}, ${type}))`;
      }
      return `rule_effect(${ruleName}, add_relationship(${first}, ${second}, ${type}))`;
    }

    case 'directed status': {
      if (!second) return null;
      if (effect.value === false) {
        return `rule_effect(${ruleName}, remove_directed_status(${first}, ${second}, ${type}))`;
      }
      return `rule_effect(${ruleName}, add_directed_status(${first}, ${second}, ${type}))`;
    }

    case 'event':
    case 'event undirected': {
      const target = second || '_';
      return `rule_effect(${ruleName}, record_event(${first}, ${target}, ${type}))`;
    }

    case 'intent': {
      const target = second || '_';
      const weight = effect.weight ?? 1;
      return `rule_effect(${ruleName}, set_intent(${first}, ${type}, ${target}, ${weight}))`;
    }

    case 'mood': {
      if (effect.value === false) {
        return `rule_effect(${ruleName}, remove_mood(${first}, ${type}))`;
      }
      return `rule_effect(${ruleName}, set_mood(${first}, ${type}))`;
    }

    default:
      return null;
  }
}

// ── Volition Rule Converter ─────────────────────────────────────────────

/**
 * Resolve the `rule_type/2` value. Ensemble volition-rule files are `volition`
 * by construction, so that is the default; a source rule explicitly tagged
 * `'trigger'` (a state-changing rule that happened to land in this converter)
 * overrides it. Any other/absent value falls back to `'volition'`.
 */
function resolveRuleType(rule: EnsembleVolitionRule): 'volition' | 'trigger' {
  return rule.type === 'trigger' ? 'trigger' : 'volition';
}

/**
 * Coerce a source likelihood into a Prolog-safe number in [0.0, 1.0], or null
 * when the source carries none. Non-finite / non-numeric inputs are dropped
 * (no `rule_likelihood/2` is emitted) rather than producing a malformed fact.
 */
function normalizeLikelihood(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

export function convertVolitionRule(
  rule: EnsembleVolitionRule,
  category: string,
  citationMap?: Record<string, Array<{ title: string; content?: string; url?: string }>>,
): ConversionResult {
  const name = sanitizeRuleName(rule.name);

  if (!rule.conditions || rule.conditions.length === 0) {
    return { name: rule.name, prologContent: null, skipped: true, skipReason: 'no conditions' };
  }
  if (!rule.effects || rule.effects.length === 0) {
    return { name: rule.name, prologContent: null, skipped: true, skipReason: 'no effects' };
  }

  // Convert conditions to Prolog body clauses
  const bodyClauses: string[] = [];
  for (const cond of rule.conditions) {
    const clause = conditionToProlog(cond);
    if (clause) {
      bodyClauses.push(clause);
    }
  }

  if (bodyClauses.length === 0) {
    return { name: rule.name, prologContent: null, skipped: true, skipReason: 'no convertible conditions' };
  }

  // Determine actors used
  const actors = new Set<string>();
  for (const c of rule.conditions) {
    if (c.first) actors.add(actorToVar(c.first));
    if (c.second) actors.add(actorToVar(c.second));
  }

  // Build the head — use appropriate arity based on actors
  const actorList = Array.from(actors).filter(a => a === a.toUpperCase() || a.charAt(0) === a.charAt(0).toUpperCase());
  const headActors = actorList.length > 0 ? actorList.slice(0, 3) : ['X'];

  const lines: string[] = [];

  // Metadata facts
  lines.push(`% ${rule.title || rule.name}`);
  lines.push(`rule_active(${name}).`);

  // rule_type/2 — HARD requirement (validateRuleContent rejects rules without it).
  lines.push(`rule_type(${name}, ${resolveRuleType(rule)}).`);

  // Category
  const catAtom = sanitizeAtom(category);
  lines.push(`rule_category(${name}, ${catAtom}).`);
  lines.push(`rule_source(${name}, ensemble).`);

  // Extract weight from effects (used as priority/likelihood)
  const weights = rule.effects.filter(e => e.weight != null).map(e => e.weight!);
  const maxWeight = weights.length > 0 ? Math.max(...weights) : 5;
  const priority = Math.min(10, Math.max(1, Math.round(Math.abs(maxWeight))));
  lines.push(`rule_priority(${name}, ${priority}).`);

  // rule_likelihood/2 — emitted only when the source carries a likelihood.
  const likelihood = normalizeLikelihood(rule.likelihood);
  if (likelihood != null) {
    lines.push(`rule_likelihood(${name}, ${likelihood}).`);
  }

  // Build rule_applies
  const head = headActors.length >= 2
    ? `rule_applies(${name}, ${headActors[0]}, ${headActors[1]})`
    : `rule_applies(${name}, ${headActors[0]}, _)`;

  const body = bodyClauses.join(',\n    ');
  lines.push(`${head} :-\n    ${body}.`);

  // Build effects
  for (const effect of rule.effects) {
    const effectClause = effectToProlog(effect, name);
    if (effectClause) {
      lines.push(`${effectClause}.`);
    }
  }

  const result: ConversionResult = {
    name: rule.name,
    prologContent: lines.join('\n'),
    skipped: false,
  };

  // Attach citations if available from the citation map
  const citations = citationMap?.[rule.name];
  if (citations && citations.length > 0) {
    result.citations = citations;
  }

  return result;
}

// ── Action Converter ────────────────────────────────────────────────────

export function convertEnsembleAction(action: EnsembleAction, category: string): ConversionResult {
  const name = sanitizeRuleName(action.name || action.displayName || 'unnamed');
  const displayName = action.displayName || action.name || name;

  // Actions with no conditions are unconditional — still valid
  const lines: string[] = [];

  lines.push(`% ${displayName}`);

  // Core action fact: action(Id, Name, Type, EnergyCost).
  const catAtom = sanitizeAtom(category);
  lines.push(`action(${name}, '${escapeString(displayName)}', ${catAtom}, 0).`);
  lines.push(`action_source(${name}, ensemble).`);

  // Tags from category
  lines.push(`action_tag(${name}, ${catAtom}).`);

  // Recommended metadata predicates (fixes "Missing recommended predicate" errors)
  lines.push(`action_difficulty(${name}, 0.5).`);
  lines.push(`action_duration(${name}, 1).`);

  // leadsTo transitions
  if (action.leadsTo && action.leadsTo.length > 0) {
    for (const next of action.leadsTo) {
      const nextAtom = sanitizeRuleName(next);
      lines.push(`action_leads_to(${name}, ${nextAtom}).`);
    }
  }

  // isAccept
  if (action.isAccept === true) {
    lines.push(`action_accept(${name}).`);
  } else if (action.isAccept === false) {
    lines.push(`action_reject(${name}).`);
  }

  // Build can_perform rule from conditions
  if (action.conditions && action.conditions.length > 0) {
    const bodyClauses: string[] = [];
    for (const cond of action.conditions) {
      const clause = conditionToProlog(cond);
      if (clause) bodyClauses.push(clause);
    }

    if (bodyClauses.length > 0) {
      const body = bodyClauses.join(',\n    ');
      lines.push(`can_perform(X, ${name}) :-\n    person(X),\n    ${body}.`);
    } else {
      // All conditions failed to convert — still allow action
      lines.push(`can_perform(X, ${name}) :- person(X).`);
    }
  } else {
    // Unconditional action
    lines.push(`can_perform(X, ${name}) :- person(X).`);
  }

  // Effects — use action_effect/2 (not rule_effect/2) for actions
  if (action.effects) {
    for (const effect of action.effects) {
      const effectClause = effectToActionProlog(effect, name);
      if (effectClause) {
        lines.push(`${effectClause}.`);
      }
    }
  }

  return {
    name: displayName,
    prologContent: lines.join('\n'),
    skipped: false,
  };
}

/**
 * Convert an Ensemble effect to a Prolog action_effect/2 fact.
 * Actions use action_effect/2 instead of rule_effect/2 to distinguish
 * action effects from volition rule effects.
 */
function effectToActionProlog(effect: EnsembleEffect, actionName: string): string | null {
  const cat = normalizeCategory(effect.category);
  const type = sanitizeAtom(effect.type || 'unknown');
  const first = actorToVar(effect.first || 'x');
  const second = effect.second ? actorToVar(effect.second) : null;

  switch (cat) {
    case 'network': {
      if (!second) return null;
      const op = effect.operator || '+';
      const val = effect.value ?? 0;
      return `action_effect(${actionName}, modify_network(${first}, ${second}, ${type}, '${op}', ${val}))`;
    }

    case 'attribute': {
      const op = effect.operator || '+';
      const val = effect.value ?? 0;
      return `action_effect(${actionName}, modify_attribute(${first}, ${type}, '${op}', ${val}))`;
    }

    case 'trait': {
      if (effect.value === false) {
        return `action_effect(${actionName}, remove_trait(${first}, ${type}))`;
      }
      return `action_effect(${actionName}, add_trait(${first}, ${type}))`;
    }

    case 'status': {
      if (effect.value === false) {
        return `action_effect(${actionName}, remove_status(${first}, ${type}))`;
      }
      return `action_effect(${actionName}, add_status(${first}, ${type}))`;
    }

    case 'relationship': {
      if (!second) return null;
      if (effect.value === false) {
        return `action_effect(${actionName}, remove_relationship(${first}, ${second}, ${type}))`;
      }
      return `action_effect(${actionName}, add_relationship(${first}, ${second}, ${type}))`;
    }

    case 'directed status': {
      if (!second) return null;
      if (effect.value === false) {
        return `action_effect(${actionName}, remove_directed_status(${first}, ${second}, ${type}))`;
      }
      return `action_effect(${actionName}, add_directed_status(${first}, ${second}, ${type}))`;
    }

    case 'event':
    case 'event undirected': {
      const target = second || '_';
      return `action_effect(${actionName}, record_event(${first}, ${target}, ${type}))`;
    }

    case 'intent': {
      const target = second || '_';
      const weight = effect.weight ?? 1;
      return `action_effect(${actionName}, set_intent(${first}, ${type}, ${target}, ${weight}))`;
    }

    case 'mood': {
      if (effect.value === false) {
        return `action_effect(${actionName}, remove_mood(${first}, ${type}))`;
      }
      return `action_effect(${actionName}, set_mood(${first}, ${type}))`;
    }

    default:
      return null;
  }
}

// ── Batch Converters ────────────────────────────────────────────────────

export function convertVolitionRuleFile(
  fileData: {
    fileName: string;
    category: string;
    rules: EnsembleVolitionRule[];
  },
  citationMap?: Record<string, Array<{ title: string; content?: string; url?: string }>>,
): ConversionResult[] {
  return fileData.rules.map(rule => convertVolitionRule(rule, fileData.category, citationMap));
}

export function convertActionFile(fileData: {
  category: string;
  actions: EnsembleAction[];
}): ConversionResult[] {
  return fileData.actions.map(action => convertEnsembleAction(action, fileData.category));
}

// ── Helpers ─────────────────────────────────────────────────────────────

function escapeString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
