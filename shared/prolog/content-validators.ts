/**
 * Content Validators for Rules, Actions, and Quests
 *
 * Validates that Prolog content follows the canonical Insimul predicate format.
 * Each validator checks for required predicates (errors), recommended predicates
 * (warnings), detects all predicates present, and performs basic syntax checks.
 *
 * These validators are intentionally lenient — they help users write better Prolog
 * without blocking valid but unconventional content.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  detectedPredicates: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Detects all predicate definitions in Prolog content.
 * Matches both fact and rule heads (e.g., `foo(a, b).` or `foo(X, Y) :-`).
 * Returns unique predicate signatures like `foo/2`.
 */
function detectPredicates(content: string): string[] {
  const detected = new Set<string>();

  // Strip comments to avoid false positives
  const stripped = content
    .replace(/%[^\n]*/g, '')           // line comments
    .replace(/\/\*[\s\S]*?\*\//g, ''); // block comments

  // Match predicate heads: `name(args)` followed by `.` or `:-`
  // We need to count args by tracking parenthesis depth to handle nested terms
  const headPattern = /([a-z_][a-zA-Z0-9_]*)\s*\(/g;
  let match: RegExpExecArray | null;

  while ((match = headPattern.exec(stripped)) !== null) {
    const name = match[1];

    // Skip Prolog built-ins and directives
    if (name === 'dynamic' || name === 'discontiguous' || name === 'module' ||
        name === 'use_module' || name === 'ensure_loaded' || name === 'findall' ||
        name === 'assert' || name === 'retract' || name === 'asserta' ||
        name === 'assertz' || name === 'retractall' || name === 'not' ||
        name === 'write' || name === 'writeln' || name === 'format' ||
        name === 'atom_string' || name === 'atom_chars' || name === 'atom_length' ||
        name === 'number_chars' || name === 'number_codes' ||
        name === 'succ' || name === 'plus' || name === 'is' ||
        name === 'append' || name === 'member' || name === 'length' ||
        name === 'msort' || name === 'sort' || name === 'nth0' || name === 'nth1' ||
        name === 'atomic_list_concat' || name === 'atom_concat' ||
        name === 'sub_atom' || name === 'char_code') {
      continue;
    }

    // Count arity by tracking parenthesis depth
    const startIdx = match.index + match[0].length;
    let depth = 1;
    let arity = 1;
    let i = startIdx;

    // Handle zero-arity: if first non-space char is ')'
    const firstContent = stripped.substring(startIdx).trimStart();
    if (firstContent.startsWith(')')) {
      arity = 0;
      detected.add(`${name}/0`);
      continue;
    }

    while (i < stripped.length && depth > 0) {
      const ch = stripped[i];
      if (ch === '(') {
        depth++;
      } else if (ch === ')') {
        depth--;
      } else if (ch === ',' && depth === 1) {
        arity++;
      } else if (ch === "'" || ch === '"') {
        // Skip quoted strings
        const quote = ch;
        i++;
        while (i < stripped.length && stripped[i] !== quote) {
          if (stripped[i] === '\\') i++; // skip escape
          i++;
        }
      }
      i++;
    }

    if (depth === 0) {
      detected.add(`${name}/${arity}`);
    }
  }

  return Array.from(detected).sort();
}

/**
 * Checks whether a specific predicate pattern exists in the content.
 * Uses a regex that matches the predicate name followed by `(`.
 */
function hasPredicatePattern(content: string, predicateName: string): boolean {
  // Strip comments
  const stripped = content
    .replace(/%[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const pattern = new RegExp(`(?:^|[^a-zA-Z0-9_])${escapeRegex(predicateName)}\\s*\\(`, 'm');
  return pattern.test(stripped);
}

/**
 * Checks whether a predicate with specific arity exists in detected list.
 */
function hasPredicateWithArity(detected: string[], name: string, arities: number[]): boolean {
  return arities.some(a => detected.includes(`${name}/${a}`));
}

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Checks for basic Prolog syntax issues.
 */
function checkSyntax(content: string): string[] {
  const errors: string[] = [];

  // Strip comments for syntax checking
  const stripped = content
    .replace(/%[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // Check for unbalanced parentheses
  let parenDepth = 0;
  let lineNum = 1;
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (ch === '\n') lineNum++;
    if (ch === "'" || ch === '"') {
      const quote = ch;
      i++;
      while (i < stripped.length && stripped[i] !== quote) {
        if (stripped[i] === '\\') i++;
        if (stripped[i] === '\n') lineNum++;
        i++;
      }
      continue;
    }
    if (ch === '(') parenDepth++;
    if (ch === ')') parenDepth--;
    if (parenDepth < 0) {
      errors.push(`Unexpected closing parenthesis near line ${lineNum}`);
      parenDepth = 0;
    }
  }
  if (parenDepth > 0) {
    errors.push(`Unclosed parenthesis (${parenDepth} unclosed)`);
  }

  // Check for clauses that don't end with a period
  // Split on periods that are followed by whitespace or end-of-string (not inside quotes)
  const clauses = stripped.split(/\.\s/);
  if (clauses.length > 0) {
    const lastClause = clauses[clauses.length - 1].trim();
    // The last clause should end with a period or be empty
    if (lastClause.length > 0 && !lastClause.endsWith('.') && !lastClause.startsWith(':-')) {
      // Only warn if there's actual content (not just whitespace/directives)
      const hasContent = lastClause.replace(/\s/g, '').length > 0;
      if (hasContent) {
        errors.push('Content may have a clause missing a terminating period');
      }
    }
  }

  return errors;
}

// ── Rule Validator ──────────────────────────────────────────────────────────

/**
 * Validates rule content follows the canonical Insimul Prolog format.
 *
 * Required predicates: rule_type/2, rule_applies/3 or rule_applies/2
 * Recommended: rule_priority/2, rule_likelihood/2, rule_category/2, rule_active/1, rule_source/2
 * Optional (new): rule_truth_requires/2, rule_truth_creates/3, rule_truth_modifies/3, rule_effect/2
 */
export function validateRuleContent(content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!content || content.trim().length === 0) {
    return { isValid: false, errors: ['Content is empty'], warnings: [], detectedPredicates: [] };
  }

  const detectedPredicates = detectPredicates(content);

  // Required predicates
  if (!hasPredicatePattern(content, 'rule_type')) {
    errors.push('Missing required predicate: rule_type/2 — defines the rule type (e.g., rule_type(my_rule, volition))');
  }

  const hasApplies2 = hasPredicateWithArity(detectedPredicates, 'rule_applies', [2]);
  const hasApplies3 = hasPredicateWithArity(detectedPredicates, 'rule_applies', [3]);
  if (!hasApplies2 && !hasApplies3) {
    errors.push('Missing required predicate: rule_applies/3 or rule_applies/2 — defines when the rule activates');
  }

  // Recommended predicates
  if (!hasPredicatePattern(content, 'rule_priority')) {
    warnings.push('Missing recommended predicate: rule_priority/2 — controls evaluation order (default: 5)');
  }
  if (!hasPredicatePattern(content, 'rule_likelihood')) {
    warnings.push('Missing recommended predicate: rule_likelihood/2 — probability of firing (0.0-1.0)');
  }
  if (!hasPredicatePattern(content, 'rule_category')) {
    warnings.push('Missing recommended predicate: rule_category/2 — groups related rules');
  }
  if (!hasPredicatePattern(content, 'rule_active')) {
    warnings.push('Missing recommended predicate: rule_active/1 — marks the rule as active');
  }
  if (!hasPredicatePattern(content, 'rule_source')) {
    warnings.push('Missing recommended predicate: rule_source/2 — attribution (e.g., ensemble, custom)');
  }

  // Syntax checks
  const syntaxErrors = checkSyntax(content);
  errors.push(...syntaxErrors);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    detectedPredicates,
  };
}

// ── Action Validator ────────────────────────────────────────────────────────

/**
 * Validates action content follows the canonical Insimul Prolog format.
 *
 * Required predicates: action/4 (id, name, type, energyCost)
 * Recommended: can_perform/2 or can_perform/3, action_effect/2, action_duration/2, action_difficulty/2
 * Optional (new): action_truth_requires/2, action_truth_creates/3, action_narrative/2
 */
export function validateActionContent(content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!content || content.trim().length === 0) {
    return { isValid: false, errors: ['Content is empty'], warnings: [], detectedPredicates: [] };
  }

  const detectedPredicates = detectPredicates(content);

  // Required predicates
  if (!hasPredicateWithArity(detectedPredicates, 'action', [4])) {
    // Check if they have action with a different arity
    const hasAnyAction = detectedPredicates.some(p => p.startsWith('action/'));
    if (hasAnyAction) {
      errors.push('Predicate action found but with wrong arity — expected action/4 (id, name, type, energyCost)');
    } else {
      errors.push('Missing required predicate: action/4 — defines the action (id, name, type, energyCost)');
    }
  }

  // Recommended predicates
  const hasCanPerform2 = hasPredicateWithArity(detectedPredicates, 'can_perform', [2]);
  const hasCanPerform3 = hasPredicateWithArity(detectedPredicates, 'can_perform', [3]);
  if (!hasCanPerform2 && !hasCanPerform3) {
    warnings.push('Missing recommended predicate: can_perform/2 or can_perform/3 — defines who can perform the action');
  }
  if (!hasPredicatePattern(content, 'action_effect')) {
    warnings.push('Missing recommended predicate: action_effect/2 — defines the action\'s effects');
  }
  if (!hasPredicatePattern(content, 'action_duration')) {
    warnings.push('Missing recommended predicate: action_duration/2 — how long the action takes');
  }
  if (!hasPredicatePattern(content, 'action_difficulty')) {
    warnings.push('Missing recommended predicate: action_difficulty/2 — difficulty level (0.0-1.0)');
  }

  // Syntax checks
  const syntaxErrors = checkSyntax(content);
  errors.push(...syntaxErrors);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    detectedPredicates,
  };
}

// ── Quest Validator ─────────────────────────────────────────────────────────

/**
 * Validates quest content follows the canonical Insimul Prolog format.
 *
 * Required predicates: quest/3 (id, title, type)
 * Recommended: quest_objective/4, quest_reward/3, quest_prerequisite/2, quest_location/2
 * Optional (new): quest_truth_requires/2, quest_truth_creates/3, quest_stage/3, quest_language_objective/4
 */
export function validateQuestContent(content: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!content || content.trim().length === 0) {
    return { isValid: false, errors: ['Content is empty'], warnings: [], detectedPredicates: [] };
  }

  const detectedPredicates = detectPredicates(content);

  // Required predicates — accept quest/3 or quest/5 (the converter produces quest/5)
  const hasQuest3 = hasPredicateWithArity(detectedPredicates, 'quest', [3]);
  const hasQuest5 = hasPredicateWithArity(detectedPredicates, 'quest', [5]);
  if (!hasQuest3 && !hasQuest5) {
    const hasAnyQuest = detectedPredicates.some(p => p.startsWith('quest/'));
    if (hasAnyQuest) {
      errors.push('Predicate quest found but with unexpected arity — expected quest/3 (id, title, type) or quest/5 (id, title, type, difficulty, status)');
    } else {
      errors.push('Missing required predicate: quest/3 — defines the quest (id, title, type)');
    }
  }

  // Recommended predicates
  if (!hasPredicatePattern(content, 'quest_objective')) {
    warnings.push('Missing recommended predicate: quest_objective/4 — defines quest objectives');
  }
  if (!hasPredicatePattern(content, 'quest_reward')) {
    warnings.push('Missing recommended predicate: quest_reward/3 — defines quest rewards');
  }
  if (!hasPredicatePattern(content, 'quest_prerequisite')) {
    warnings.push('Missing recommended predicate: quest_prerequisite/2 — defines quest prerequisites');
  }
  if (!hasPredicatePattern(content, 'quest_location')) {
    warnings.push('Missing recommended predicate: quest_location/2 — where the quest takes place');
  }

  // Syntax checks
  const syntaxErrors = checkSyntax(content);
  errors.push(...syntaxErrors);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    detectedPredicates,
  };
}
