/**
 * Rule-to-Prolog Converter
 *
 * Converts Insimul rule definitions (conditions/effects in JSON or DSL format)
 * into Prolog predicates that can be evaluated by tau-prolog.
 *
 * Supports:
 * - Ensemble format (JSON conditions with predicates)
 * - Insimul DSL format (when/then blocks)
 * - Plain JSON conditions/effects arrays
 */

// ── Types ───────────────────────────────────────────────────────────────────

interface EnsembleCondition {
  type: string;
  predicate?: string;
  first?: string;
  second?: string;
  operator?: string;
  value?: any;
  negated?: boolean;
}

interface EnsembleEffect {
  type: string;
  target?: string;
  action?: string;
  value?: any;
  parameters?: {
    category?: string;
    type?: string;
    first?: string;
    second?: string;
    weight?: number;
    intentType?: boolean;
  };
}

interface RuleData {
  name: string;
  content?: string;
  sourceFormat?: string;
  ruleType?: string;
  conditions?: any[];
  effects?: any[];
  priority?: number;
  likelihood?: number;
  category?: string;
  description?: string;
}

interface ConversionResult {
  prologContent: string;
  predicates: string[];
  errors: string[];
}

// ── Converter ───────────────────────────────────────────────────────────────

export function convertRuleToProlog(rule: RuleData): ConversionResult {
  const errors: string[] = [];
  const predicates: string[] = [];
  const lines: string[] = [];

  // Imported datasets (e.g., VESPACE) often use long English-sentence names.
  // sanitizeAtom would turn those into 10+ word underscore atoms, which the
  // structural validator rejects (max 4-6 words per rule handle). Produce a
  // short stable handle: first meaningful words + a short hash of the full
  // name to keep collisions rare.
  const ruleName = generateRuleHandle(rule.name);

  // Add metadata as comments
  lines.push(`% Rule: ${rule.name}`);
  if (rule.description) lines.push(`% ${rule.description}`);
  if (rule.category) lines.push(`% Category: ${rule.category}`);
  lines.push(`% Format: ${rule.sourceFormat || 'unknown'} / Type: ${rule.ruleType || 'default'}`);
  lines.push('');

  // Dynamic declarations for the rule predicate
  lines.push(`:- dynamic(rule_type/2).`);
  lines.push(`:- dynamic(rule_active/1).`);
  lines.push(`:- dynamic(rule_priority/2).`);
  lines.push(`:- dynamic(rule_likelihood/2).`);
  if (rule.category) {
    lines.push(`:- dynamic(rule_category/2).`);
  }
  lines.push('');

  // Rule metadata as facts. rule_type/2 is REQUIRED by the save-path schema
  // validator (see shared/prolog/content-validators.ts → validateRuleContent).
  // Absence rejects the rule at POST /api/rules with a 422.
  lines.push(`rule_type(${ruleName}, ${sanitizeAtom(rule.ruleType || 'trigger')}).`);
  lines.push(`rule_active(${ruleName}).`);
  if (rule.priority !== undefined) {
    lines.push(`rule_priority(${ruleName}, ${rule.priority}).`);
  }
  if (rule.likelihood !== undefined) {
    lines.push(`rule_likelihood(${ruleName}, ${rule.likelihood}).`);
  }
  if (rule.category) {
    lines.push(`rule_category(${ruleName}, ${sanitizeAtom(rule.category)}).`);
  }
  lines.push('');

  // Convert conditions and effects based on format
  const conditions = rule.conditions || [];
  const effects = rule.effects || [];

  if (conditions.length > 0 || effects.length > 0) {
    const conditionGoals = convertConditions(conditions, rule.sourceFormat, errors);
    const effectGoals = convertEffects(effects, rule.sourceFormat, errors);

    // Build the main rule predicate
    // rule_applies(RuleName, X, Y) :- <conditions>
    // rule_effect(RuleName, X, Y, Effect) :- <effect facts>

    if (conditionGoals.length > 0) {
      const condBody = conditionGoals.join(',\n    ');
      lines.push(`% Conditions`);
      lines.push(`:- dynamic(rule_applies/3).`);
      lines.push(`rule_applies(${ruleName}, X, Y) :-`);
      lines.push(`    ${condBody}.`);
      lines.push('');
      predicates.push(`rule_applies/3`);
    }

    if (effectGoals.length > 0) {
      lines.push(`% Effects`);
      lines.push(`:- dynamic(rule_effect/4).`);
      for (const effect of effectGoals) {
        lines.push(`rule_effect(${ruleName}, X, Y, ${effect}).`);
      }
      lines.push('');
      predicates.push(`rule_effect/4`);
    }
  }

  // If the rule has raw content in Insimul DSL, try to parse it too
  if (rule.content && rule.sourceFormat === 'insimul') {
    const dslResult = convertInsimulDSL(rule.content, ruleName, errors);
    if (dslResult) {
      lines.push('% Parsed from Insimul DSL');
      lines.push(dslResult);
      lines.push('');
    }
  }

  // If the rule content is already Prolog-like, include it directly
  if (rule.sourceFormat === 'prolog' && rule.content) {
    lines.push('% Direct Prolog content');
    lines.push(rule.content.trim());
    lines.push('');
  }

  return {
    prologContent: lines.join('\n'),
    predicates,
    errors,
  };
}

/**
 * Batch convert multiple rules into a single Prolog program.
 */
export function convertRulesToProlog(rules: RuleData[]): ConversionResult {
  const allLines: string[] = [];
  const allPredicates: string[] = [];
  const allErrors: string[] = [];

  allLines.push('% Insimul Rules - Auto-generated Prolog');
  allLines.push(`% Generated: ${new Date().toISOString()}`);
  allLines.push(`% Total rules: ${rules.length}`);
  allLines.push('');

  // Shared dynamic declarations
  allLines.push(':- dynamic(rule_active/1).');
  allLines.push(':- dynamic(rule_priority/2).');
  allLines.push(':- dynamic(rule_likelihood/2).');
  allLines.push(':- dynamic(rule_applies/3).');
  allLines.push(':- dynamic(rule_effect/4).');
  allLines.push('');

  for (const rule of rules) {
    const result = convertRuleToProlog(rule);
    // Strip redundant dynamic declarations (already declared above)
    const filtered = result.prologContent
      .split('\n')
      .filter(line => !line.startsWith(':- dynamic('))
      .join('\n');
    allLines.push(filtered);
    allLines.push('');
    allPredicates.push(...result.predicates);
    if (result.errors.length > 0) {
      allErrors.push(`[${rule.name}]: ${result.errors.join('; ')}`);
    }
  }

  // Helper rules for rule evaluation
  allLines.push('% Helper: find all applicable rules for two characters');
  allLines.push('applicable_rules(X, Y, Rules) :-');
  allLines.push('    findall(R, (rule_active(R), rule_applies(R, X, Y)), Rules).');
  allLines.push('');
  allLines.push('% Helper: get highest priority applicable rule');
  allLines.push('best_rule(X, Y, Rule) :-');
  allLines.push('    applicable_rules(X, Y, Rules),');
  allLines.push('    Rules \\= [],');
  allLines.push('    sort_by_priority(Rules, Sorted),');
  allLines.push('    Sorted = [Rule|_].');
  allLines.push('');
  allLines.push('sort_by_priority([], []).');
  allLines.push('sort_by_priority(Rules, Sorted) :-');
  allLines.push('    findall(P-R, (member(R, Rules), (rule_priority(R, P) -> true ; P = 5)), Pairs),');
  allLines.push('    sort(1, @>=, Pairs, SortedPairs),');
  allLines.push('    findall(R, member(_-R, SortedPairs), Sorted).');

  return {
    prologContent: allLines.join('\n'),
    predicates: Array.from(new Set(allPredicates)),
    errors: allErrors,
  };
}

// ── Condition Converters ────────────────────────────────────────────────────

function convertConditions(conditions: any[], sourceFormat: string | undefined, errors: string[]): string[] {
  const goals: string[] = [];

  for (const cond of conditions) {
    if (typeof cond === 'string') {
      // Raw string condition — try to use as-is if it looks like Prolog
      goals.push(cond);
      continue;
    }

    if (!cond || typeof cond !== 'object') continue;

    const goal = convertSingleCondition(cond, sourceFormat, errors);
    if (goal) goals.push(goal);
  }

  return goals;
}

function convertSingleCondition(cond: any, sourceFormat: string | undefined, errors: string[]): string | null {
  const type = cond.type || '';

  // Ensemble-style predicate conditions
  if (type === 'predicate' && cond.predicate) {
    return convertEnsemblePredicate(cond, errors);
  }

  // Simple property conditions
  if (type === 'mood') {
    return convertPropertyCondition('mood', 'X', cond.operator, cond.value);
  }
  if (type === 'relationship') {
    return convertPropertyCondition('relationship_strength', 'X, Y', cond.operator, cond.value);
  }
  if (type === 'trait') {
    return `has_trait(X, ${sanitizeAtom(String(cond.value || cond.trait || ''))})`;
  }
  if (type === 'location') {
    return `at_location(X, ${sanitizeAtom(String(cond.value || ''))})`;
  }
  if (type === 'age') {
    return convertPropertyCondition('age', 'X', cond.operator, cond.value);
  }
  if (type === 'occupation') {
    return `occupation(X, ${sanitizeAtom(String(cond.value || ''))})`;
  }
  if (type === 'status') {
    return `status(X, ${sanitizeAtom(String(cond.value || ''))})`;
  }
  if (type === 'has_item') {
    return `has_item(X, ${sanitizeAtom(String(cond.value || cond.item || ''))}, _)`;
  }
  if (type === 'knowledge' || type === 'knows') {
    const fact = sanitizeAtom(String(cond.value || cond.fact || ''));
    const subject = cond.second ? (cond.second === 'y' ? 'Y' : sanitizeAtom(cond.second)) : 'Y';
    return `knows(X, ${subject}, ${fact})`;
  }
  if (type === 'knowledge_value' || type === 'knows_value') {
    const attr = sanitizeAtom(String(cond.attribute || cond.property || ''));
    const subject = cond.second ? (cond.second === 'y' ? 'Y' : sanitizeAtom(cond.second)) : 'Y';
    if (cond.value !== undefined) {
      const val = typeof cond.value === 'string' ? `'${cond.value}'` : String(cond.value);
      return `knows_value(X, ${subject}, ${attr}, ${val})`;
    }
    return `knows_value(X, ${subject}, ${attr}, _)`;
  }
  if (type === 'belief' || type === 'believes') {
    const quality = sanitizeAtom(String(cond.value || cond.quality || ''));
    const subject = cond.second ? (cond.second === 'y' ? 'Y' : sanitizeAtom(cond.second)) : 'Y';
    if (cond.operator && cond.threshold !== undefined) {
      return convertPropertyCondition_belief(quality, subject, cond.operator, cond.threshold);
    }
    return `believes(X, ${subject}, ${quality}, _)`;
  }
  if (type === 'mental_model') {
    const subject = cond.second ? (cond.second === 'y' ? 'Y' : sanitizeAtom(cond.second)) : 'Y';
    if (cond.operator && cond.value !== undefined) {
      return `mental_model_confidence(X, ${subject}, C), C ${convertCompOp(cond.operator)} ${cond.value}`;
    }
    return `has_mental_model(X, ${subject})`;
  }

  // Generic fallback
  if (cond.predicate || cond.attribute) {
    const pred = sanitizeAtom(cond.predicate || cond.attribute);
    if (cond.first && cond.second) {
      return `${pred}(${cond.first === 'x' ? 'X' : sanitizeAtom(cond.first)}, ${cond.second === 'y' ? 'Y' : sanitizeAtom(cond.second)})`;
    }
    if (cond.first) {
      return `${pred}(${cond.first === 'x' ? 'X' : sanitizeAtom(cond.first)})`;
    }
    return `${pred}(X)`;
  }

  errors.push(`Unknown condition type: ${type}`);
  return null;
}

function convertEnsemblePredicate(cond: EnsembleCondition, errors: string[]): string | null {
  const pred = cond.predicate || '';

  // Parse ensemble predicate names like "trait_child", "directed status_rivals"
  const parts = pred.split(/\s+/);
  const isDirected = parts[0] === 'directed';
  const predicateName = sanitizeAtom(isDirected ? parts.slice(1).join('_') : pred);

  const first = cond.first === 'x' ? 'X' : cond.first === 'y' ? 'Y' : sanitizeAtom(cond.first || 'X');
  const second = cond.second === 'y' ? 'Y' : cond.second === 'x' ? 'X' : (cond.second ? sanitizeAtom(cond.second) : undefined);

  let goal: string;
  if (isDirected && second) {
    goal = `${predicateName}(${first}, ${second})`;
  } else if (second) {
    goal = `${predicateName}(${first}, ${second})`;
  } else {
    goal = `${predicateName}(${first})`;
  }

  // Handle value comparison
  if (cond.operator && cond.operator !== 'equals' && cond.value !== undefined) {
    const op = convertOperator(cond.operator);
    if (op) {
      const varName = `${predicateName.charAt(0).toUpperCase()}${predicateName.slice(1)}Val`;
      goal = `${predicateName}(${first}${second ? ', ' + second : ''}, ${varName}), ${varName} ${op} ${cond.value}`;
    }
  } else if (cond.operator === 'equals' && cond.value === false) {
    goal = `\\+ ${goal}`;
  }

  if (cond.negated) {
    goal = `\\+ (${goal})`;
  }

  return goal;
}

function convertPropertyCondition(predicate: string, args: string, operator: string | undefined, value: any): string {
  if (!operator || operator === 'equals') {
    if (typeof value === 'string') {
      return `${predicate}(${args}, ${sanitizeAtom(value)})`;
    }
    return `${predicate}(${args}, ${value})`;
  }

  const op = convertOperator(operator);
  if (op) {
    const varName = 'Val';
    return `${predicate}(${args}, ${varName}), ${varName} ${op} ${value}`;
  }

  return `${predicate}(${args}, ${value})`;
}

function convertOperator(op: string): string | null {
  switch (op) {
    case 'equals': return '=:=';
    case 'not_equals': return '=\\=';
    case 'greater_than': return '>';
    case 'less_than': return '<';
    case 'greater_equal': case 'gte': return '>=';
    case 'less_equal': case 'lte': return '=<';
    default: return null;
  }
}

function convertCompOp(op: string): string {
  return convertOperator(op) || '=:=';
}

function convertPropertyCondition_belief(quality: string, subject: string, operator: string, threshold: any): string {
  const op = convertOperator(operator) || '>=';
  return `believes(X, ${subject}, ${quality}, C), C ${op} ${threshold}`;
}

// ── Effect Converters ───────────────────────────────────────────────────────

function convertEffects(effects: any[], sourceFormat: string | undefined, errors: string[]): string[] {
  const goals: string[] = [];

  for (const effect of effects) {
    if (typeof effect === 'string') {
      goals.push(sanitizeAtom(effect));
      continue;
    }

    if (!effect || typeof effect !== 'object') continue;

    const goal = convertSingleEffect(effect, sourceFormat, errors);
    if (goal) goals.push(goal);
  }

  return goals;
}

function convertSingleEffect(effect: any, sourceFormat: string | undefined, errors: string[]): string | null {
  const type = effect.type || '';
  const params = effect.parameters || {};

  // Ensemble-style effects
  if (type === 'modify' || type === 'set') {
    const category = params.category || effect.action || '';
    const effectType = params.type || '';
    const weight = params.weight !== undefined ? params.weight : effect.value;

    if (category === 'network' || category === 'intent') {
      const first = params.first === 'x' ? 'X' : params.first === 'y' ? 'Y' : sanitizeAtom(params.first || 'X');
      const second = params.second === 'x' ? 'X' : params.second === 'y' ? 'Y' : sanitizeAtom(params.second || 'Y');
      return `effect(${sanitizeAtom(category)}, ${sanitizeAtom(effectType)}, ${first}, ${second}, ${weight})`;
    }

    if (effect.action) {
      return `effect(${sanitizeAtom(effect.action)}, ${sanitizeAtom(String(effect.value || ''))})`;
    }
  }

  // Simple effects
  if (type === 'dialogue') {
    return `effect(dialogue, '${escapeString(String(effect.value || ''))}')`;
  }
  if (type === 'relationship_change') {
    return `effect(relationship_change, ${effect.value || 0})`;
  }
  if (type === 'mood_change') {
    return `effect(mood_change, ${sanitizeAtom(String(effect.value || ''))})`;
  }
  if (type === 'give_item') {
    return `effect(give_item, ${sanitizeAtom(String(effect.item || effect.value || ''))})`;
  }
  if (type === 'remove_item') {
    return `effect(remove_item, ${sanitizeAtom(String(effect.item || effect.value || ''))})`;
  }
  if (type === 'learn_fact' || type === 'knowledge') {
    const fact = sanitizeAtom(String(effect.fact || effect.value || ''));
    return `effect(learn_fact, ${fact})`;
  }
  if (type === 'learn_value') {
    const attr = sanitizeAtom(String(effect.attribute || effect.property || ''));
    return `effect(learn_value, ${attr})`;
  }
  if (type === 'add_belief' || type === 'belief') {
    const quality = sanitizeAtom(String(effect.quality || effect.value || ''));
    return `effect(add_belief, ${quality})`;
  }
  if (type === 'share_knowledge') {
    return `effect(share_knowledge, all)`;
  }

  // Fallback
  if (effect.action) {
    return `effect(${sanitizeAtom(effect.action)}, ${sanitizeAtom(String(effect.value || ''))})`;
  }

  errors.push(`Unknown effect type: ${type}`);
  return null;
}

// ── Insimul DSL Parser ──────────────────────────────────────────────────────

/**
 * Parse a full Insimul DSL rule block of the form:
 *
 *   rule <name> {
 *     when (
 *       predicate(?var, arg) and
 *       other_predicate(?var)
 *     )
 *     then {
 *       action(?var, arg)
 *       notify(?var, "message")
 *     }
 *     priority: 10
 *     likelihood: 1.0
 *   }
 *
 * Returns the full Prolog block (rule_active / rule_priority / rule_likelihood
 * / rule_applies / rule_effect facts) ready to store as `content`, or `null`
 * if the input doesn't parse.
 *
 * Conventions:
 *   - `?var` names become PascalCase Prolog vars (`?actor` → `Actor`).
 *   - The first two distinct `?var` names seen become the Actor/Target slots
 *     of `rule_applies/3` and `rule_effect/4`. Additional vars remain fresh.
 *   - Each effect predicate becomes one `rule_effect/4` fact. Non-var args
 *     collapse into the effect payload: zero args → `true`, one → scalar,
 *     many → list.
 */
export function convertInsimulDSLRule(
  content: string,
  fallbackName?: string,
  errors: string[] = [],
): string | null {
  const block = content.match(/rule\s+(\w+)\s*\{([\s\S]*)\}\s*$/);
  if (!block) return null;

  const ruleName = sanitizeAtom(block[1] || fallbackName || 'unnamed_rule');
  const body = block[2];

  // `when ( ... )` — paren-delimited, multiline, balanced
  const whenBlock = extractBalanced(body, /when\s*\(/g, '(', ')');
  // `then { ... }` — brace-delimited, multiline, balanced
  const thenBlock = extractBalanced(body, /then\s*\{/g, '{', '}');

  if (whenBlock === null && thenBlock === null) return null;

  const priorityMatch = body.match(/priority\s*:\s*(-?\d+(?:\.\d+)?)/);
  const likelihoodMatch = body.match(/likelihood\s*:\s*(-?\d+(?:\.\d+)?)/);

  // Var registry — first two seen map to the Actor/Target slots.
  const varMap = new Map<string, string>();
  const assignVar = (dslName: string): string => {
    const key = dslName.toLowerCase();
    const existing = varMap.get(key);
    if (existing) return existing;
    const pascal = dslName
      .replace(/^\?+/, '')
      .replace(/(^|_)([a-z])/g, (_, __, c) => c.toUpperCase());
    const name = /^[A-Z]/.test(pascal) ? pascal : `V${pascal || varMap.size}`;
    varMap.set(key, name);
    return name;
  };

  const conditionGoals: string[] = [];
  if (whenBlock !== null) {
    for (const call of splitDSLStatements(whenBlock)) {
      const goal = parseDSLPredicate(call, assignVar, errors);
      if (goal) conditionGoals.push(goal);
    }
  }

  const effectFacts: string[] = [];
  if (thenBlock !== null) {
    for (const call of splitDSLStatements(thenBlock)) {
      const eff = parseDSLEffect(call, assignVar, errors);
      if (eff) effectFacts.push(eff);
    }
  }

  if (conditionGoals.length === 0 && effectFacts.length === 0) return null;

  // Resolve Actor/Target slot names — first two registered vars, or _.
  const registered = Array.from(varMap.values());
  const actorSlot = registered[0] || '_';
  const targetSlot = registered[1] || '_';

  const lines: string[] = [];
  lines.push(`% Rule: ${ruleName}`);
  lines.push(`% Format: prolog / Type: dsl-converted`);
  lines.push(`:- dynamic(rule_active/1).`);
  lines.push(`:- dynamic(rule_priority/2).`);
  lines.push(`:- dynamic(rule_likelihood/2).`);
  lines.push(`:- dynamic(rule_applies/3).`);
  lines.push(`:- dynamic(rule_effect/4).`);
  lines.push('');
  lines.push(`rule_active(${ruleName}).`);
  if (priorityMatch) {
    lines.push(`rule_priority(${ruleName}, ${priorityMatch[1]}).`);
  }
  if (likelihoodMatch) {
    lines.push(`rule_likelihood(${ruleName}, ${likelihoodMatch[1]}).`);
  }
  lines.push('');

  if (conditionGoals.length > 0) {
    lines.push(`rule_applies(${ruleName}, ${actorSlot}, ${targetSlot}) :-`);
    lines.push(`    ${conditionGoals.join(',\n    ')}.`);
    lines.push('');
  }

  for (const fact of effectFacts) {
    lines.push(`rule_effect(${ruleName}, ${actorSlot}, ${targetSlot}, ${fact}).`);
  }

  return lines.join('\n');
}

/**
 * Legacy entry point retained for the {@link convertRuleToProlog} DSL branch.
 * Emits only the rule_applies / rule_effect clauses (no metadata facts).
 */
function convertInsimulDSL(content: string, ruleName: string, errors: string[]): string | null {
  const full = convertInsimulDSLRule(content, ruleName, errors);
  if (!full) return null;
  // Strip the lines that convertRuleToProlog has already emitted.
  return full
    .split('\n')
    .filter(l =>
      !l.startsWith('% Rule:') &&
      !l.startsWith('% Format:') &&
      !l.startsWith(':- dynamic(') &&
      !l.startsWith('rule_active(') &&
      !l.startsWith('rule_priority(') &&
      !l.startsWith('rule_likelihood('),
    )
    .join('\n')
    .trim() || null;
}

/** Pull out the contents of the first balanced `open…close` region following a marker. */
function extractBalanced(source: string, markerRegex: RegExp, open: string, close: string): string | null {
  markerRegex.lastIndex = 0;
  const m = markerRegex.exec(source);
  if (!m) return null;
  let depth = 1;
  let i = m.index + m[0].length;
  const start = i;
  while (i < source.length && depth > 0) {
    const ch = source[i];
    if (ch === open) depth++;
    else if (ch === close) depth--;
    if (depth === 0) return source.slice(start, i);
    i++;
  }
  return null;
}

/** Split a DSL body into individual predicate calls on `and`, `;`, commas, or newlines. */
function splitDSLStatements(body: string): string[] {
  const out: string[] = [];
  let buf = '';
  let depth = 0;
  let inStr: string | null = null;
  const tokens = body.split('');
  for (let i = 0; i < tokens.length; i++) {
    const ch = tokens[i];
    if (inStr) {
      buf += ch;
      if (ch === inStr && tokens[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = ch; buf += ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; buf += ch; continue; }
    if (ch === ')' || ch === ']' || ch === '}') { depth--; buf += ch; continue; }
    if (depth === 0 && (ch === '\n' || ch === ';')) {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());

  // Also split any remaining top-level `and`/`AND` separators within a line,
  // and strip trailing/leading `and` tokens left behind by newline splits.
  const flat: string[] = [];
  for (const stmt of out) {
    const parts = stmt.split(/\s+and\s+/i).map(s => s.trim()).filter(Boolean);
    for (const p of parts) {
      const stripped = p.replace(/\s+and\s*$/i, '').replace(/^\s*and\s+/i, '').trim();
      if (stripped) flat.push(stripped);
    }
  }
  return flat;
}

/** Parse `predicate(arg1, arg2, …)` into a Prolog goal. */
function parseDSLPredicate(call: string, assignVar: (name: string) => string, errors: string[]): string | null {
  const m = call.match(/^([a-zA-Z_][\w]*)\s*\(([\s\S]*)\)\s*$/);
  if (!m) {
    // Bare identifier condition (e.g. `alive(?actor)`) already matches above.
    // Handle comparison operators: `expr OP expr`.
    const cmp = call.match(/^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+?)$/);
    if (cmp) {
      const [, left, op, right] = cmp;
      const l = coerceTerm(left.trim(), assignVar);
      const r = coerceTerm(right.trim(), assignVar);
      const prologOp = op === '==' ? '=' : op === '!=' ? '\\=' : op;
      return `${l} ${prologOp} ${r}`;
    }
    errors.push(`Unparseable DSL condition: ${call}`);
    return null;
  }
  const [, name, argsStr] = m;
  const args = splitArgs(argsStr).map(a => coerceTerm(a, assignVar));
  if (args.length === 0) return `${sanitizeAtom(name)}`;
  return `${sanitizeAtom(name)}(${args.join(', ')})`;
}

/**
 * Parse a DSL effect call into a `rule_effect/4`-compatible term.
 * `add_violation(?actor, combat)` with actor as Actor slot → `effect(add_violation, combat)`.
 */
function parseDSLEffect(call: string, assignVar: (name: string) => string, errors: string[]): string | null {
  const m = call.match(/^([a-zA-Z_][\w]*)\s*\(([\s\S]*)\)\s*$/);
  if (!m) {
    // Bareword effect (no args) → effect(name, true)
    const bare = call.match(/^([a-zA-Z_][\w]*)\s*$/);
    if (bare) return `effect(${sanitizeAtom(bare[1])}, true)`;
    errors.push(`Unparseable DSL effect: ${call}`);
    return null;
  }
  const [, name, argsStr] = m;
  const rawArgs = splitArgs(argsStr);
  // Coerce every arg so that `?var` references are registered in the var map
  // (giving them Actor/Target slots in the rule_effect head), then drop those
  // bindings from the effect payload since the head already carries them.
  const coerced = rawArgs.map(a => ({ raw: a.trim(), term: coerceTerm(a, assignVar) }));
  const payload = coerced.filter(x => !/^\?/.test(x.raw)).map(x => x.term);
  const actionName = sanitizeAtom(name);
  if (payload.length === 0) return `effect(${actionName}, true)`;
  if (payload.length === 1) return `effect(${actionName}, ${payload[0]})`;
  return `effect(${actionName}, [${payload.join(', ')}])`;
}

/** Convert a DSL atom/var/number/string into a Prolog term. */
function coerceTerm(raw: string, assignVar: (name: string) => string): string {
  const t = raw.trim();
  if (!t) return `_`;
  // Quoted string
  const strMatch = t.match(/^["'](.*)["']$/);
  if (strMatch) return `'${escapeString(strMatch[1])}'`;
  // DSL variable
  if (t.startsWith('?')) return assignVar(t);
  // Number (int or float, with optional leading minus)
  if (/^-?\d+(?:\.\d+)?$/.test(t)) return t;
  // Negation of a goal / arg
  if (t.startsWith('!')) return `\\+ ${coerceTerm(t.slice(1), assignVar)}`;
  // Nested predicate call
  const call = t.match(/^([a-zA-Z_][\w]*)\s*\(([\s\S]*)\)\s*$/);
  if (call) {
    const inner = splitArgs(call[2]).map(a => coerceTerm(a, assignVar));
    return `${sanitizeAtom(call[1])}(${inner.join(', ')})`;
  }
  // Plain identifier → atom
  return sanitizeAtom(t);
}

/** Split a comma-separated arg list respecting quotes and nesting. */
function splitArgs(argsStr: string): string[] {
  const out: string[] = [];
  let buf = '';
  let depth = 0;
  let inStr: string | null = null;
  for (let i = 0; i < argsStr.length; i++) {
    const ch = argsStr[i];
    if (inStr) {
      buf += ch;
      if (ch === inStr && argsStr[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = ch; buf += ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; buf += ch; continue; }
    if (ch === ')' || ch === ']' || ch === '}') { depth--; buf += ch; continue; }
    if (depth === 0 && ch === ',') {
      if (buf.trim()) out.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

// ── Prolog Validation ───────────────────────────────────────────────────────

/**
 * Validate Prolog content syntax using tau-prolog.
 * Returns errors if any.
 */
export async function validatePrologSyntax(prologContent: string): Promise<string[]> {
  // Dynamic import to avoid circular deps if needed
  const { TauPrologEngine } = await import('./tau-engine');
  const engine = new TauPrologEngine();

  const result = await engine.consult(prologContent);
  if (!result.success) {
    return [result.error || 'Invalid Prolog syntax'];
  }
  return [];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sanitizeAtom(str: string): string {
  let atom = str
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (/^[0-9]/.test(atom)) atom = `n${atom}`;
  return atom || 'unknown';
}

/**
 * Stopwords that add no identifying value to a rule handle.
 * Mostly articles, pronouns, auxiliaries, conjunctions, and filler adverbs.
 */
const HANDLE_STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'of', 'to', 'in', 'on', 'at', 'by', 'for', 'with', 'from', 'as',
  'and', 'or', 'but', 'not', 'no', 'nor', 'so', 'yet',
  'will', 'would', 'should', 'could', 'can', 'may', 'might', 'must',
  'has', 'have', 'had', 'do', 'does', 'did',
  'this', 'that', 'these', 'those', 'it', 'its',
  'who', 'whom', 'which', 'what', 'when', 'where', 'why', 'how',
]);

/**
 * Build a short stable Prolog handle for a rule from its name. Targets
 * ≤ 4 content words + a 4-char hash suffix for collision resistance, keeping
 * the total under the 48-char/6-word cap enforced by the structural
 * validator in server/services/prolog-rule-validator.ts.
 *
 * Imported datasets often have long English descriptions as "names"
 * (e.g. "Talkative and médisant is annoying for virtuous, seeks to gain
 * emulation from others"). sanitizeAtom alone produces a sentence-shaped
 * atom that the validator rejects. This helper strips stopwords and trims.
 */
function generateRuleHandle(name: string): string {
  const sanitized = sanitizeAtom(name);
  const words = sanitized.split('_').filter(Boolean);
  const keep = words.filter((w) => !HANDLE_STOPWORDS.has(w)).slice(0, 4);
  const base = (keep.length > 0 ? keep : words.slice(0, 4)).join('_') || 'rule';

  // 32-bit FNV-1a over the original name → 4 hex chars. Cheap, stable,
  // avoids collisions when two rules share the same leading content words.
  let hash = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const suffix = hash.toString(16).padStart(8, '0').slice(0, 4);

  const handle = `${base}_${suffix}`;
  // Hard cap at 48 chars to match the structural validator's ceiling.
  return handle.length > 48 ? handle.slice(0, 48) : handle;
}

function escapeString(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
