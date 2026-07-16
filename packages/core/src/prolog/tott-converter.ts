/**
 * Talk-of-the-Town → Prolog Converter (US-PC4)
 *
 * Direct source-format converter for Talk-of-the-Town (Ryan & Samuel's social
 * simulation). Ported from the platform client's `unified-syntax.ts` ToTT parsers
 * (compileTott, parseTottConditions/Effects, parseTottPythonConditions/Effects,
 * mapTottRuleType, mapTottCategory) — with the same THREE source shapes ToTT
 * material arrives in:
 *
 *   - JSON-flat        — an array of rule objects, each carrying its own category.
 *   - JSON-categorized — an object mapping category → rule[]; rules inherit the key.
 *   - Python-class     — the original ToTT rule DSL: `class Name(VolitionRule):`
 *                        with `def when(self):` / `def then(self):` bodies.
 *
 * ⚠️ NOT to be confused with `tott-predicates.ts` — that is a *helper predicate
 * library* (`getTotTPredicates()`, standing hiring/social/economics/lifecycle
 * rules). THIS converter lowers ToTT *source rules* into Prolog, consulting the
 * source-attribute → predicate table in `tott-predicate-map.ts` (also distinct
 * from `tott-predicates.ts`; see that file's header). Three separate artifacts.
 *
 * All three shapes converge on one internal `TottRule`/`TottClause` model and
 * emit the canonical Insimul rule preamble shared by the Ensemble and Kismet
 * converters (see the converter contract in progress.txt):
 *
 *   rule_active/1, rule_type/2 (HARD — validateRuleContent rejects rules without
 *   it), rule_category/2, rule_source(.., tott), rule_priority/2,
 *   rule_likelihood/2 (only when the source carries one), rule_applies/3 :-
 *   <body>, and rule_effect/2 facts.
 *
 * No new predicate NAMES are emitted (the `rule` block in `predicate-schema.ts`
 * already registers the whole preamble; `tott` is a `rule_source` atom value, not
 * a distinct predicate), so no schema change is required.
 */

import type { ConversionResult } from './converter-types';
import {
  normalizeTottAttribute,
  resolveTottKind,
  type TottPredicateKind,
} from './tott-predicate-map';

// ── Internal normalized model ───────────────────────────────────────────

/** One condition/effect clause, shape-agnostic across the three source forms. */
export interface TottClause {
  /** The acting actor token (`x`, `subject`, a `?var`, or a named character). */
  subject: string;
  /** The second actor for two-actor predicates, if any. */
  object?: string;
  /** The source attribute — looked up in TOTT_PREDICATE_MAP for its kind. */
  attribute: string;
  /** Comparison (conditions) or `+`/`-`/`=` adjust (effects). */
  operator?: string;
  /** Numeric magnitude, boolean flag, or (for intent) the intent atom. */
  value?: number | boolean | string;
  /** Intent weight (volition effect payload). */
  weight?: number;
  /** Negated condition (`\+ Goal`). */
  negate?: boolean;
}

/** A normalized ToTT rule the emitter turns into a ConversionResult. */
export interface TottRule {
  name: string;
  /** Source rule-type label, mapped through `mapTottRuleType`. */
  ruleType?: string;
  category?: string;
  priority?: number;
  likelihood?: number;
  conditions: TottClause[];
  effects: TottClause[];
}

// ── Source rule-type + category mapping ─────────────────────────────────

/**
 * Map a ToTT source rule-type label to the `rule_type/2` value. ToTT rule kinds
 * that produce desires (`volition`, `desire`, `want`) are `volition`; feature /
 * belief / salience / reaction / personality rules mutate state on activation and
 * are `trigger`. Unknown/absent falls back to `trigger` (the safe non-volition
 * default) — but a `rule_type/2` is ALWAYS emitted (the hard validateRuleContent
 * requirement).
 */
export function mapTottRuleType(raw: string | undefined): 'volition' | 'trigger' {
  const t = (raw || '').trim().toLowerCase().replace(/[\s_-]*rule$/, '');
  switch (t) {
    case 'volition':
    case 'desire':
    case 'want':
    case 'intent':
      return 'volition';
    default:
      return 'trigger';
  }
}

/** Canonical category synonyms folded before sanitizing to an atom. */
const CATEGORY_SYNONYMS: Record<string, string> = {
  social: 'socializing',
  socialize: 'socializing',
  socialise: 'socializing',
  romantic: 'romance',
  work: 'employment',
  job: 'employment',
  family_life: 'family',
};

/**
 * Map a ToTT source category to a canonical Prolog atom: lowercase, separator-
 * folded, synonym-canonicalized, then sanitized. Absent categories become
 * `general`.
 */
export function mapTottCategory(raw: string | undefined): string {
  const key = (raw || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!key) return 'general';
  return sanitizeAtom(CATEGORY_SYNONYMS[key] ?? key);
}

// ── Atom + variable helpers ──────────────────────────────────────────────

function sanitizeAtom(str: string): string {
  let atom = String(str)
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
 * Map a ToTT actor token to a Prolog variable. Role aliases bind the canonical
 * head variables (`subject`/`initiator`/`self` → X, `other`/`object`/`target`/
 * `responder` → Y, `third` → Z); a `?var` or named token becomes PascalCase, and
 * a result not beginning with an uppercase letter is prefixed `V_`.
 */
export function tottVarToProlog(token: string): string {
  const t = (token || '').trim().replace(/^\?/, '');
  switch (t.toLowerCase()) {
    case 'x':
    case 'subject':
    case 'initiator':
    case 'self':
      return 'X';
    case 'y':
    case 'other':
    case 'object':
    case 'target':
    case 'responder':
      return 'Y';
    case 'z':
    case 'third':
      return 'Z';
  }
  const parts = t.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (parts.length === 0) return 'X';
  const pascal = parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
  return /^[A-Z_]/.test(pascal) ? pascal : `V_${pascal}`;
}

/** A Prolog value variable derived from actor + attribute names. */
function valueVar(...parts: string[]): string {
  const joined = parts.map(p => p.replace(/[^a-zA-Z0-9_]/g, '_')).join('_');
  return /^[A-Z_]/.test(joined) ? joined : `V_${joined}`;
}

function comparisonToProlog(op: string | undefined, varName: string, value: unknown): string | null {
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

/** Normalize an effect operator token to a Prolog adjust sign `+`/`-`/`=`. */
function effectSign(op: string | undefined): '+' | '-' | '=' {
  switch (op) {
    case '-': case '-=': return '-';
    case '=': case 'set': case '==': return '=';
    default: return '+';
  }
}

function isNumeric(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

// ── Var-order tracking (head-actor selection) ────────────────────────────

class VarOrder {
  private readonly seen = new Set<string>();
  readonly vars: string[] = [];
  add(v: string): void {
    if (!this.seen.has(v)) {
      this.seen.add(v);
      this.vars.push(v);
    }
  }
}

// ── Condition clause → Prolog goal ───────────────────────────────────────

function conditionToGoal(clause: TottClause, order: VarOrder): string | null {
  const subj = tottVarToProlog(clause.subject);
  order.add(subj);
  const obj = clause.object ? tottVarToProlog(clause.object) : null;
  if (obj) order.add(obj);

  const name = sanitizeAtom(clause.attribute);
  const kind = resolveTottKind(clause.attribute, {
    hasObject: !!obj,
    numeric: isNumeric(clause.value) && clause.operator != null && clause.operator !== '',
  });
  // A boolean condition negates either via an explicit `negate` flag (Python
  // `not x.trait(...)`) or a `value: false` (the JSON "attribute is absent" form).
  const neg = clause.negate === true || clause.value === false;
  const wrap = (goal: string) => (neg ? `\\+ ${goal}` : goal);

  switch (kind) {
    case 'attribute': {
      if (isNumeric(clause.value) && clause.operator) {
        const V = valueVar(subj, name);
        const cmp = comparisonToProlog(clause.operator, V, clause.value);
        if (cmp) return `attribute(${subj}, ${name}, ${V}), ${cmp}`;
      }
      return wrap(`attribute(${subj}, ${name}, _)`);
    }
    case 'network': {
      if (!obj) return null;
      if (isNumeric(clause.value) && clause.operator) {
        const V = valueVar(subj, obj, name);
        const cmp = comparisonToProlog(clause.operator, V, clause.value);
        if (cmp) return `network(${subj}, ${obj}, ${name}, ${V}), ${cmp}`;
      }
      return wrap(`network(${subj}, ${obj}, ${name}, _)`);
    }
    case 'trait':
      return wrap(`trait(${subj}, ${name})`);
    case 'status':
      return wrap(`status(${subj}, ${name})`);
    case 'mood':
      return wrap(`mood(${subj}, ${name})`);
    case 'relationship': {
      if (!obj) return null;
      return wrap(`relationship(${subj}, ${obj}, ${name})`);
    }
    case 'directed_status': {
      if (!obj) return null;
      return wrap(`directed_status(${subj}, ${obj}, ${name})`);
    }
    case 'event': {
      const target = obj ?? '_';
      return wrap(`event(${subj}, ${target}, ${name}, _)`);
    }
    case 'intent': {
      // Intent as a condition: value carries the intent atom, object the target.
      const intent = typeof clause.value === 'string' ? sanitizeAtom(clause.value) : name;
      const target = obj ?? '_';
      return wrap(`intent(${subj}, ${intent}, ${target}, _)`);
    }
    default:
      return null;
  }
}

// ── Effect clause → rule_effect inner term ───────────────────────────────

function effectToTerm(clause: TottClause): string | null {
  const subj = tottVarToProlog(clause.subject);
  const obj = clause.object ? tottVarToProlog(clause.object) : null;
  const name = sanitizeAtom(clause.attribute);
  const kind = resolveTottKind(clause.attribute, {
    hasObject: !!obj,
    numeric: isNumeric(clause.value),
  });

  switch (kind) {
    case 'attribute': {
      const val = isNumeric(clause.value) ? clause.value : 0;
      return `modify_attribute(${subj}, ${name}, '${effectSign(clause.operator)}', ${val})`;
    }
    case 'network': {
      if (!obj) return null;
      const val = isNumeric(clause.value) ? clause.value : 0;
      return `modify_network(${subj}, ${obj}, ${name}, '${effectSign(clause.operator)}', ${val})`;
    }
    case 'trait':
      return clause.value === false
        ? `remove_trait(${subj}, ${name})`
        : `add_trait(${subj}, ${name})`;
    case 'status':
      return clause.value === false
        ? `remove_status(${subj}, ${name})`
        : `add_status(${subj}, ${name})`;
    case 'mood':
      return clause.value === false
        ? `remove_mood(${subj}, ${name})`
        : `set_mood(${subj}, ${name})`;
    case 'relationship': {
      if (!obj) return null;
      return clause.value === false
        ? `remove_relationship(${subj}, ${obj}, ${name})`
        : `add_relationship(${subj}, ${obj}, ${name})`;
    }
    case 'directed_status': {
      if (!obj) return null;
      return clause.value === false
        ? `remove_directed_status(${subj}, ${obj}, ${name})`
        : `add_directed_status(${subj}, ${obj}, ${name})`;
    }
    case 'event': {
      const target = obj ?? '_';
      return `record_event(${subj}, ${target}, ${name})`;
    }
    case 'intent': {
      // wants: value is the intent atom, object the target, weight the strength.
      const intent = typeof clause.value === 'string' ? sanitizeAtom(clause.value) : name;
      const target = obj ?? '_';
      const weight = isNumeric(clause.weight) ? clause.weight : 1;
      return `set_intent(${subj}, ${intent}, ${target}, ${weight})`;
    }
    default:
      return null;
  }
}

// ── Rule → Prolog ─────────────────────────────────────────────────────────

function clampPriority(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 5;
  return Math.min(10, Math.max(1, Math.round(value)));
}

function normalizeLikelihood(value: number | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(1, Math.max(0, value));
}

/** Convert a single normalized ToTT rule to a ConversionResult. */
export function convertTottRule(rule: TottRule): ConversionResult {
  const name = sanitizeRuleName(rule.name);

  if (!rule.conditions || rule.conditions.length === 0) {
    return { name: rule.name, prologContent: null, skipped: true, skipReason: 'no conditions' };
  }
  if (!rule.effects || rule.effects.length === 0) {
    return { name: rule.name, prologContent: null, skipped: true, skipReason: 'no effects' };
  }

  const order = new VarOrder();
  const body: string[] = [];
  for (const cond of rule.conditions) {
    const goal = conditionToGoal(cond, order);
    if (goal) body.push(goal);
  }
  if (body.length === 0) {
    return { name: rule.name, prologContent: null, skipped: true, skipReason: 'no convertible conditions' };
  }

  const effects: string[] = [];
  for (const eff of rule.effects) {
    const term = effectToTerm(eff);
    if (term) effects.push(term);
  }
  if (effects.length === 0) {
    return { name: rule.name, prologContent: null, skipped: true, skipReason: 'no convertible effects' };
  }

  const actor = order.vars[0] ?? 'X';
  const target = order.vars[1] ?? '_';

  const lines: string[] = [];
  lines.push(`% ${rule.name} [tott]`);
  lines.push(`rule_active(${name}).`);
  // rule_type/2 — HARD requirement (validateRuleContent rejects rules without it).
  lines.push(`rule_type(${name}, ${mapTottRuleType(rule.ruleType)}).`);
  lines.push(`rule_category(${name}, ${mapTottCategory(rule.category)}).`);
  lines.push(`rule_source(${name}, tott).`);
  lines.push(`rule_priority(${name}, ${clampPriority(rule.priority)}).`);

  const likelihood = normalizeLikelihood(rule.likelihood);
  if (likelihood != null) {
    lines.push(`rule_likelihood(${name}, ${likelihood}).`);
  }

  lines.push(`rule_applies(${name}, ${actor}, ${target}) :-\n    ${body.join(',\n    ')}.`);

  for (const term of effects) {
    lines.push(`rule_effect(${name}, ${term}).`);
  }

  return { name: rule.name, prologContent: lines.join('\n'), skipped: false };
}

// ── Shape 1: JSON-flat ────────────────────────────────────────────────────

/**
 * Coerce a raw source clause object into a `TottClause`. Accepts the common key
 * spellings across ToTT exports (`subject`/`actor`/`first`, `object`/`target`/
 * `second`, `attribute`/`predicate`/`type`, `op`/`operator`, `negate`/`not`).
 */
function toClause(raw: any): TottClause | null {
  if (!raw || typeof raw !== 'object') return null;
  const subject = raw.subject ?? raw.actor ?? raw.first ?? raw.who ?? 'x';
  const attribute = raw.attribute ?? raw.predicate ?? raw.type ?? raw.name;
  if (!attribute) return null;
  const clause: TottClause = { subject: String(subject), attribute: String(attribute) };
  const object = raw.object ?? raw.target ?? raw.second ?? raw.whom;
  if (object != null) clause.object = String(object);
  if (raw.operator != null || raw.op != null) clause.operator = String(raw.operator ?? raw.op);
  if (raw.value !== undefined) clause.value = raw.value;
  if (raw.weight != null) clause.weight = Number(raw.weight);
  if (raw.negate === true || raw.not === true) clause.negate = true;
  return clause;
}

function toRule(raw: any, inheritedCategory?: string): TottRule | null {
  if (!raw || typeof raw !== 'object') return null;
  const name = raw.name ?? raw.id ?? raw.title;
  if (!name) return null;
  const conditions = (raw.conditions ?? raw.when ?? []).map(toClause).filter(Boolean) as TottClause[];
  const effects = (raw.effects ?? raw.then ?? []).map(toClause).filter(Boolean) as TottClause[];
  return {
    name: String(name),
    ruleType: raw.ruleType ?? raw.type ?? raw.rule_type,
    category: raw.category ?? inheritedCategory,
    priority: raw.priority != null ? Number(raw.priority) : undefined,
    likelihood: raw.likelihood != null ? Number(raw.likelihood) : undefined,
    conditions,
    effects,
  };
}

/** Parse the JSON-flat shape: an array of rule objects (or a single object). */
export function parseTottFlat(data: unknown): TottRule[] {
  const arr = Array.isArray(data) ? data : [data];
  return arr.map(r => toRule(r)).filter(Boolean) as TottRule[];
}

// ── Shape 2: JSON-categorized ─────────────────────────────────────────────

/** Parse the JSON-categorized shape: `{ category: rule[] }`, rules inherit the key. */
export function parseTottCategorized(data: unknown): TottRule[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const rules: TottRule[] = [];
  for (const [category, list] of Object.entries(data as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    for (const raw of list) {
      const rule = toRule(raw, category);
      if (rule) rules.push(rule);
    }
  }
  return rules;
}

// ── Shape 3: Python-class DSL ──────────────────────────────────────────────

const NUM = /^-?\d+(?:\.\d+)?$/;

/** Snake_case a ClassName into a rule name (`ExtrovertSocializes` → `extrovert_socializes`). */
function classNameToRule(cls: string): string {
  return cls
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase();
}

/** Attribute-method names whose paren argument is the predicate NAME, not an actor. */
const NAME_ARG_METHODS = new Set(['trait', 'status', 'mood', 'has_trait', 'has_status', 'event']);

/** Parse ONE Python `when:` line into a condition clause, or null. */
export function parseTottPythonCondition(line: string): TottClause | null {
  let src = line.trim();
  let negate = false;
  const notMatch = /^not\s+(.*)$/.exec(src);
  if (notMatch) {
    negate = true;
    src = notMatch[1].trim();
  }

  // subj.attr[(arg)] <op> <number>
  const cmp = /^([A-Za-z_?][\w?]*)\.(\w+)(?:\(\s*([A-Za-z_?][\w?]*)\s*\))?\s*(>=|<=|==|=|>|<)\s*(-?\d+(?:\.\d+)?)$/.exec(src);
  if (cmp) {
    return {
      subject: cmp[1],
      attribute: cmp[2],
      object: cmp[3],
      operator: cmp[4],
      value: Number(cmp[5]),
      negate,
    };
  }

  // subj.method("name") — trait/status/mood/event where the arg is the predicate name
  const nameArg = /^([A-Za-z_?][\w?]*)\.(\w+)\(\s*["']?(\w+)["']?\s*(?:,\s*([A-Za-z_?][\w?]*)\s*)?\)$/.exec(src);
  if (nameArg) {
    const method = nameArg[2].toLowerCase();
    if (NAME_ARG_METHODS.has(method)) {
      // subj.trait("modest") / subj.event("insulted", other): arg is the name.
      return { subject: nameArg[1], attribute: nameArg[3], object: nameArg[4], negate };
    }
    // subj.relverb(other) — two-actor boolean (relationship / directed_status).
    return { subject: nameArg[1], attribute: method, object: nameArg[3], negate };
  }

  // bare property boolean: subj.attr
  const bare = /^([A-Za-z_?][\w?]*)\.(\w+)$/.exec(src);
  if (bare) {
    return { subject: bare[1], attribute: bare[2], negate };
  }
  return null;
}

/** Parse ONE Python `then:` line into an effect clause, or null. */
export function parseTottPythonEffect(line: string): TottClause | null {
  const src = line.trim();

  // subj.attr[(obj)] += n  /  -= n
  const adjust = /^([A-Za-z_?][\w?]*)\.(\w+)(?:\(\s*([A-Za-z_?][\w?]*)\s*\))?\s*(\+=|-=)\s*(-?\d+(?:\.\d+)?)$/.exec(src);
  if (adjust) {
    return {
      subject: adjust[1],
      attribute: adjust[2],
      object: adjust[3],
      operator: adjust[4] === '-=' ? '-' : '+',
      value: Number(adjust[5]),
    };
  }

  // subj.wants("intent"[, other][, weight])
  const wants = /^([A-Za-z_?][\w?]*)\.(?:wants|desires)\(\s*["']?(\w+)["']?\s*(?:,\s*([A-Za-z_?][\w?]*)\s*)?(?:,\s*(-?\d+(?:\.\d+)?)\s*)?\)$/.exec(src);
  if (wants) {
    return {
      subject: wants[1],
      attribute: 'wants',
      value: wants[2],
      object: wants[3],
      weight: wants[4] != null ? Number(wants[4]) : undefined,
    };
  }

  // subj.add_trait("t") / remove_status("s") / set_mood("m") / event("e", obj)
  const method = /^([A-Za-z_?][\w?]*)\.(add_trait|remove_trait|add_status|remove_status|set_mood|remove_mood|record_event|event)\(\s*["']?(\w+)["']?\s*(?:,\s*([A-Za-z_?][\w?]*)\s*)?\)$/.exec(src);
  if (method) {
    const verb = method[2].toLowerCase();
    const subject = method[1];
    const arg = method[3];
    const obj = method[4];
    if (verb === 'event' || verb === 'record_event') {
      return { subject, attribute: arg, object: obj, value: true };
    }
    const isRemove = verb.startsWith('remove_');
    const family = verb.replace(/^(add|remove|set)_/, '');
    return { subject, attribute: arg, value: family === 'trait' || family === 'status' || family === 'mood' ? !isRemove : true };
  }

  // subj.relverb(obj) = True/False
  const assign = /^([A-Za-z_?][\w?]*)\.(\w+)\(\s*([A-Za-z_?][\w?]*)\s*\)\s*=\s*(True|False|true|false)$/.exec(src);
  if (assign) {
    return {
      subject: assign[1],
      attribute: assign[2],
      object: assign[3],
      value: /true/i.test(assign[4]),
    };
  }

  // subj.attr[(obj)] = n  (a plain set, no += / -=)
  const setNum = /^([A-Za-z_?][\w?]*)\.(\w+)(?:\(\s*([A-Za-z_?][\w?]*)\s*\))?\s*=\s*(-?\d+(?:\.\d+)?)$/.exec(src);
  if (setNum) {
    return {
      subject: setNum[1],
      attribute: setNum[2],
      object: setNum[3],
      operator: '=',
      value: Number(setNum[4]),
    };
  }
  return null;
}

/**
 * Parse the Python-class ToTT DSL into normalized rules. Each rule is a
 * `class Name(SomethingRule):` block with optional `category`/`priority`/
 * `likelihood` assignments and `def when(self):` / `def then(self):` bodies.
 * `#` lines and blanks are comments.
 */
export function parseTottPython(source: string): TottRule[] {
  const rules: TottRule[] = [];
  const lines = source.split(/\r?\n/);

  let current: TottRule | null = null;
  let section: 'when' | 'then' | null = null;

  const flush = () => {
    if (current) rules.push(current);
    current = null;
    section = null;
  };

  const header = /^class\s+(\w+)\s*\(\s*(\w+)\s*\)\s*:/;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const h = header.exec(line);
    if (h) {
      flush();
      current = {
        name: classNameToRule(h[1]),
        ruleType: h[2],
        conditions: [],
        effects: [],
      };
      section = null;
      continue;
    }
    if (!current) continue;

    if (/^def\s+when\s*\(/.test(line)) { section = 'when'; continue; }
    if (/^def\s+then\s*\(/.test(line)) { section = 'then'; continue; }

    const meta = /^(category|priority|likelihood)\s*=\s*(.+)$/.exec(line);
    if (meta && section === null) {
      const key = meta[1];
      const value = meta[2].trim().replace(/^["']|["']$/g, '');
      if (key === 'category') current.category = value;
      else if (key === 'priority' && NUM.test(value)) current.priority = Number(value);
      else if (key === 'likelihood' && NUM.test(value)) current.likelihood = Number(value);
      continue;
    }

    // `pass` and other non-clause statements are ignored.
    if (line === 'pass') continue;

    if (section === 'when') {
      const c = parseTottPythonCondition(line);
      if (c) current.conditions.push(c);
    } else if (section === 'then') {
      const e = parseTottPythonEffect(line);
      if (e) current.effects.push(e);
    }
  }
  flush();
  return rules;
}

// ── Auto-detecting entry point ─────────────────────────────────────────────

/**
 * Convert a ToTT source in any of the three shapes to a list of
 * ConversionResults. Detects the shape: a string is the Python-class DSL, an
 * array is JSON-flat, an object is JSON-categorized. This is the stable
 * file-level entry.
 */
export function convertTottSource(source: string | unknown): ConversionResult[] {
  let rules: TottRule[];
  if (typeof source === 'string') {
    const trimmed = source.trimStart();
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      const parsed = JSON.parse(source);
      rules = Array.isArray(parsed) ? parseTottFlat(parsed) : parseTottCategorized(parsed);
    } else {
      rules = parseTottPython(source);
    }
  } else if (Array.isArray(source)) {
    rules = parseTottFlat(source);
  } else {
    rules = parseTottCategorized(source);
  }
  return rules.map(convertTottRule);
}
