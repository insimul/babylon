/**
 * Prolog Fact Parser
 *
 * Parses .pl files into structured fact/rule objects. Handles the Insimul
 * export format (ISO-style single-quoted strings with '' for apostrophes,
 * unquoted atoms, numbers, and Prolog rules with :- bodies).
 *
 * This is NOT a full Prolog parser — it handles the subset of syntax that
 * our export pipeline produces: ground facts, simple rules, and directives.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PrologFact {
  predicate: string;
  arity: number;
  args: PrologArg[];
  /** Original line number in the source file */
  line: number;
}

export interface PrologRule {
  head: PrologFact;
  /** Raw body text (not parsed — rules are stored as content) */
  body: string;
  /** Full original text of the rule (head + :- + body) */
  raw: string;
  line: number;
}

export type PrologArg =
  | { type: 'atom'; value: string }
  | { type: 'string'; value: string }     // quoted atom — 'text here'
  | { type: 'number'; value: number }
  | { type: 'variable'; value: string }
  | { type: 'compound'; functor: string; args: PrologArg[] }
  | { type: 'list'; elements: PrologArg[] };

export interface ParseResult {
  facts: PrologFact[];
  rules: PrologRule[];
  /** Raw Prolog content blocks (rules/actions/quests with :- bodies) */
  contentBlocks: ContentBlock[];
  errors: ParseError[];
}

export interface ContentBlock {
  /** The primary predicate that identifies this block (e.g., 'quest', 'action', 'rule_active') */
  primaryPredicate: string;
  /** The first argument (entity atom) */
  entityAtom: string;
  /** All raw lines comprising this block (for stored-content entities) */
  raw: string;
  line: number;
}

export interface ParseError {
  line: number;
  message: string;
  text: string;
}

// ─── Category Detection ─────────────────────────────────────────────────────

/** Primary predicates that identify entity categories */
const CATEGORY_SIGNATURES: Record<string, string[]> = {
  world:      ['world/1', 'world/2', 'world_type/2', 'world_description/2', 'game_type/2'],
  country:    ['country/2', 'country/3', 'country_description/2', 'government_type/2'],
  state:      ['state/2', 'state/3', 'state_type/2'],
  settlement: ['settlement/2', 'settlement/3', 'settlement/4', 'settlement_type/2', 'district/3'],
  character:  ['person/1', 'first_name/2', 'last_name/2', 'full_name/2', 'gender/2', 'alive/1'],
  location:   ['lot/2', 'lot/3', 'lot_type/2', 'lot_district/2', 'building/3'],
  item:       ['item/2', 'item/3', 'item_type/2', 'item_rarity/2', 'item_value/2'],
  truth:      ['truth/3', 'truth_content/2', 'truth_importance/2', 'truth_character/2'],
  language:   ['language/2', 'language_description/2', 'language_code/2', 'language_primary/1'],
  grammar:    ['grammar/2', 'grammar_rule/3', 'grammar_description/2'],
  text:       ['game_text/3', 'text_page/3', 'text_vocabulary/4', 'text_cefr_level/2'],
  quest:      ['quest/5', 'quest_objective/3', 'quest_reward/3', 'quest_available/2'],
  action:     ['action/4', 'action_verb/3', 'action_difficulty/2', 'can_perform/2', 'can_perform/3'],
  rule:       ['rule_active/1', 'rule_likelihood/2', 'rule_priority/2', 'rule_applies/3'],
  narrative:  ['narrative/2', 'narrative_writer/2', 'narrative_chapter/4', 'narrative_act/4'],
};

/**
 * Detect the entity category of a .pl file from its predicate signatures.
 * Returns the category name or 'unknown'.
 */
export function detectCategory(facts: PrologFact[], rules: PrologRule[]): string {
  const predicateSet = new Set<string>();
  for (const f of facts) {
    predicateSet.add(`${f.predicate}/${f.arity}`);
  }
  for (const r of rules) {
    predicateSet.add(`${r.head.predicate}/${r.head.arity}`);
  }

  let bestCategory = 'unknown';
  let bestScore = 0;

  for (const [category, signatures] of Object.entries(CATEGORY_SIGNATURES)) {
    const score = signatures.filter(sig => predicateSet.has(sig)).length;
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
    }
  }

  return bestCategory;
}

/**
 * Detect category from filename as a fallback.
 */
export function detectCategoryFromFilename(filename: string): string {
  const base = filename.replace(/\.pl$/i, '').toLowerCase().replace(/[^a-z]/g, '_');
  const map: Record<string, string> = {
    world: 'world', worlds: 'world',
    country: 'country', countries: 'country',
    state: 'state', states: 'state',
    settlement: 'settlement', settlements: 'settlement',
    character: 'character', characters: 'character',
    location: 'location', locations: 'location', lots: 'location',
    item: 'item', items: 'item',
    base_items: 'item',
    truth: 'truth', truths: 'truth',
    language: 'language', languages: 'language',
    grammar: 'grammar', grammars: 'grammar',
    text: 'text', texts: 'text',
    quest: 'quest', quests: 'quest',
    action: 'action', actions: 'action',
    base_actions: 'action',
    rule: 'rule', rules: 'rule',
    base_rules: 'rule',
    narrative: 'narrative',
    history: 'history',
    cast: 'character',
  };
  return map[base] || 'unknown';
}

// ─── Parser ─────────────────────────────────────────────────────────────────

/**
 * Parse a .pl file into structured facts, rules, and content blocks.
 */
export function parsePrologFile(source: string): ParseResult {
  const facts: PrologFact[] = [];
  const rules: PrologRule[] = [];
  const contentBlocks: ContentBlock[] = [];
  const errors: ParseError[] = [];

  const lines = source.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('%')) {
      i++;
      continue;
    }

    // Skip directives (:- dynamic(...), etc.)
    if (line.startsWith(':-')) {
      i++;
      continue;
    }

    // Collect the full clause (may span multiple lines until we find a terminal '.')
    let clause = line;
    let startLine = i + 1; // 1-indexed
    while (!clauseEnds(clause) && i + 1 < lines.length) {
      i++;
      const nextLine = lines[i].trim();
      if (!nextLine || nextLine.startsWith('%')) continue;
      clause += '\n' + nextLine;
    }

    // Try to parse as fact or rule
    const ruleIdx = findRuleOperator(clause);
    if (ruleIdx >= 0) {
      // It's a rule (head :- body)
      const headText = clause.substring(0, ruleIdx).trim();
      const bodyText = clause.substring(ruleIdx + 2).trim().replace(/\.\s*$/, '');
      const head = parseTerm(headText);
      if (head && head.type === 'fact') {
        rules.push({
          head: head.fact,
          body: bodyText,
          raw: clause,
          line: startLine,
        });
      } else {
        errors.push({ line: startLine, message: 'Failed to parse rule head', text: clause.substring(0, 80) });
      }
    } else {
      // It's a fact
      const factText = clause.replace(/\.\s*$/, '').trim();
      const result = parseTerm(factText);
      if (result && result.type === 'fact') {
        result.fact.line = startLine;
        facts.push(result.fact);
      } else if (factText) {
        errors.push({ line: startLine, message: 'Failed to parse fact', text: factText.substring(0, 80) });
      }
    }

    i++;
  }

  // Build content blocks for stored-content entities (rules, actions, quests)
  // Group consecutive facts/rules by their primary entity atom
  buildContentBlocks(facts, rules, contentBlocks, source, lines);

  return { facts, rules, contentBlocks, errors };
}

// ─── Term Parser ────────────────────────────────────────────────────────────

interface TermResult {
  type: 'fact';
  fact: PrologFact;
}

function parseTerm(text: string): TermResult | null {
  text = text.trim();
  if (!text) return null;

  // Match: functor(arg1, arg2, ...)
  const match = text.match(/^([a-z_][a-z0-9_]*)\s*\(([\s\S]*)\)$/);
  if (!match) {
    // Bare atom fact (no args) — e.g., "alive(foo)" already handled, but "foo." is rare
    return null;
  }

  const predicate = match[1];
  const argsText = match[2];
  const args = parseArgList(argsText);

  return {
    type: 'fact',
    fact: { predicate, arity: args.length, args, line: 0 },
  };
}

function parseArgList(text: string): PrologArg[] {
  const args: PrologArg[] = [];
  let current = '';
  let depth = 0;
  let inSingleQuote = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inSingleQuote) {
      if (ch === "'" && i + 1 < text.length && text[i + 1] === "'") {
        // Doubled single quote — escaped apostrophe
        current += "''";
        i += 2;
        continue;
      } else if (ch === "'") {
        inSingleQuote = false;
        current += ch;
        i++;
        continue;
      }
      current += ch;
      i++;
      continue;
    }

    if (ch === "'") {
      inSingleQuote = true;
      current += ch;
      i++;
      continue;
    }

    if (ch === '(' || ch === '[') {
      depth++;
      current += ch;
    } else if (ch === ')' || ch === ']') {
      depth--;
      current += ch;
    } else if (ch === ',' && depth === 0) {
      args.push(parseArg(current.trim()));
      current = '';
      i++;
      continue;
    } else {
      current += ch;
    }
    i++;
  }

  if (current.trim()) {
    args.push(parseArg(current.trim()));
  }

  return args;
}

function parseArg(text: string): PrologArg {
  text = text.trim();

  // Single-quoted string: 'text with ''escaped'' quotes'
  if (text.startsWith("'") && text.endsWith("'") && text.length >= 2) {
    const inner = text.slice(1, -1).replace(/''/g, "'");
    return { type: 'string', value: inner };
  }

  // Number (integer or float)
  if (/^-?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?$/.test(text)) {
    return { type: 'number', value: parseFloat(text) };
  }

  // Variable (starts with uppercase or _)
  if (/^[A-Z_][A-Za-z0-9_]*$/.test(text)) {
    return { type: 'variable', value: text };
  }

  // List: [a, b, c]
  if (text.startsWith('[') && text.endsWith(']')) {
    const inner = text.slice(1, -1).trim();
    if (!inner) return { type: 'list', elements: [] };
    const elements = parseArgList(inner);
    return { type: 'list', elements };
  }

  // Compound term: functor(args)
  const compMatch = text.match(/^([a-z_][a-z0-9_]*)\s*\(([\s\S]*)\)$/);
  if (compMatch) {
    const functor = compMatch[1];
    const innerArgs = parseArgList(compMatch[2]);
    return { type: 'compound', functor, args: innerArgs };
  }

  // Bare atom
  return { type: 'atom', value: text };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Check if a clause string ends with a terminal period (not inside quotes) */
function clauseEnds(clause: string): boolean {
  let inQuote = false;
  for (let i = 0; i < clause.length; i++) {
    if (clause[i] === "'" && !inQuote) {
      inQuote = true;
    } else if (clause[i] === "'" && inQuote) {
      if (i + 1 < clause.length && clause[i + 1] === "'") {
        i++; // skip doubled quote
      } else {
        inQuote = false;
      }
    } else if (clause[i] === '.' && !inQuote && (i + 1 >= clause.length || /\s/.test(clause[i + 1]))) {
      return true;
    }
  }
  return false;
}

/** Find the :- operator position outside of quotes */
function findRuleOperator(clause: string): number {
  let inQuote = false;
  let depth = 0;
  for (let i = 0; i < clause.length - 1; i++) {
    if (clause[i] === "'" && !inQuote) {
      inQuote = true;
    } else if (clause[i] === "'" && inQuote) {
      if (i + 1 < clause.length && clause[i + 1] === "'") {
        i++;
      } else {
        inQuote = false;
      }
    } else if (!inQuote) {
      if (clause[i] === '(') depth++;
      else if (clause[i] === ')') depth--;
      else if (depth === 0 && clause[i] === ':' && clause[i + 1] === '-') {
        return i;
      }
    }
  }
  return -1;
}

/** Build content blocks from consecutive facts/rules sharing an entity atom */
function buildContentBlocks(
  facts: PrologFact[],
  rules: PrologRule[],
  blocks: ContentBlock[],
  _source: string,
  lines: string[],
): void {
  // Group facts by their first argument (the entity atom)
  const groups = new Map<string, { predicate: string; startLine: number; endLine: number }>();

  for (const fact of facts) {
    const entityArg = fact.args[0];
    if (!entityArg) continue;
    const entityAtom = argToString(entityArg);
    if (!groups.has(entityAtom)) {
      groups.set(entityAtom, { predicate: fact.predicate, startLine: fact.line, endLine: fact.line });
    } else {
      const g = groups.get(entityAtom)!;
      g.endLine = Math.max(g.endLine, fact.line);
    }
  }

  for (const rule of rules) {
    const entityArg = rule.head.args[0];
    if (!entityArg) continue;
    const entityAtom = argToString(entityArg);
    if (!groups.has(entityAtom)) {
      groups.set(entityAtom, { predicate: rule.head.predicate, startLine: rule.line, endLine: rule.line });
    } else {
      const g = groups.get(entityAtom)!;
      g.endLine = Math.max(g.endLine, rule.line);
    }
  }

  Array.from(groups.entries()).forEach(([entityAtom, group]) => {
    // Extract raw lines for this block (from first to last line, inclusive)
    const rawLines: string[] = [];
    for (let l = group.startLine - 1; l < group.endLine && l < lines.length; l++) {
      rawLines.push(lines[l]);
    }

    blocks.push({
      primaryPredicate: group.predicate,
      entityAtom,
      raw: rawLines.join('\n'),
      line: group.startLine,
    });
  });
}

/** Convert a PrologArg to its string representation */
export function argToString(arg: PrologArg): string {
  switch (arg.type) {
    case 'atom': return arg.value;
    case 'string': return arg.value;
    case 'number': return String(arg.value);
    case 'variable': return arg.value;
    case 'compound': return `${arg.functor}(${arg.args.map(argToString).join(', ')})`;
    case 'list': return `[${arg.elements.map(argToString).join(', ')}]`;
  }
}

/** Get the string value of an argument (unwrap atoms and strings) */
export function argValue(arg: PrologArg | undefined): string {
  if (!arg) return '';
  if (arg.type === 'atom' || arg.type === 'string') return arg.value;
  if (arg.type === 'number') return String(arg.value);
  return argToString(arg);
}

/** Get the numeric value of an argument */
export function argNumber(arg: PrologArg | undefined): number | undefined {
  if (!arg) return undefined;
  if (arg.type === 'number') return arg.value;
  if (arg.type === 'atom' || arg.type === 'string') {
    const n = parseFloat(arg.value);
    return isNaN(n) ? undefined : n;
  }
  return undefined;
}
