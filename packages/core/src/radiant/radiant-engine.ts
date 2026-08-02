/**
 * Radiant Quest Slot-Filling Engine (US-RQ2)
 *
 * A pure, deterministic function of `(KB, seed, now)` that turns the radiant
 * template vocabulary (see `packages/core/docs/radiant-templates.md`) into
 * canonical quest Prolog content plus the runtime facts to assert.
 *
 * Portability keystone (plan §3.3): once radiant generation is Prolog template
 * DATA + this fixed algorithm, every native engine (`libinsimul`) reproduces it
 * by re-implementing the *same* algorithm over the *same* data. The conformance
 * corpus (US-RQ4) pins that contract, so this module MUST stay deterministic:
 *
 *  - candidate bindings are enumerated then **canonically sorted** (never trust
 *    the Prolog engine's enumeration order — a native engine may differ);
 *  - one candidate is chosen with a **seeded RNG** (mulberry32); `Math.random`
 *    is forbidden;
 *  - templates are processed in **sorted TplId order**.
 *
 * Same `(kb, seed, now)` ⇒ byte-identical `questContent` / `factsToAssert`.
 *
 * This file lives in `@insimul/core` and imports ONLY core siblings (the
 * Prolog engine seam, the fact parser). No Babylon / game-engine / DOM imports.
 */

import { createPrologEngine, type PrologEngine } from '../prolog/prolog-engine';
import {
  parsePrologFile,
  type PrologArg,
} from '../prolog/prolog-fact-parser';

// ── Public types ─────────────────────────────────────────────────────────────

export interface RadiantOptions {
  /** Deterministic RNG seed. A string is hashed to a uint32. */
  seed: number | string;
  /** Current in-game time (seconds). Drives cooldown checks + provenance. */
  now: number;
  /** Cap on the number of quests generated this tick. Default: unbounded. */
  maxQuests?: number;
}

export interface GeneratedRadiantQuest {
  /** Stable quest atom, e.g. `radiant_rt_fetch_herbs_1000`. */
  questId: string;
  /** The template this quest was generated from. */
  templateId: string;
  /** Canonical quest Prolog content (`quest/5` + `quest_objective/3` + `quest_reward/3`). */
  questContent: string;
  /** Runtime facts to assert: `radiant_generated/3` + `radiant_cooldown_until/2`. */
  factsToAssert: string[];
  /** Stale `radiant_cooldown_until/2` facts to retract before asserting the fresh one. */
  factsToRetract: string[];
}

export interface RadiantGenerationResult {
  quests: GeneratedRadiantQuest[];
}

// ── Internal template model (parsed from the KB source) ──────────────────────

interface TemplateMeta {
  category: string;
  title: string;
  questType: string;
  difficulty: number;
}

interface Precondition {
  slot: string;
  /** Raw goal text, engine-solvable, with earlier slot vars in scope. */
  goalText: string;
}

interface RadiantTemplate {
  id: string;
  meta: TemplateMeta;
  preconditions: Precondition[];
  objectives: PrologArg[];
  rewards: Array<{ kind: string; amount: PrologArg }>;
  cooldownSeconds: number;
  exclusions: string[];
}

// ── Entry point ──────────────────────────────────────────────────────────────

/**
 * Generate radiant quests from a knowledge base.
 *
 * @param kb  Prolog source (string, or lines) holding the world facts + rules,
 *            the radiant template pack, and any runtime `radiant_*` facts.
 * @param opts `{ seed, now, maxQuests? }`.
 */
export async function generateRadiantQuests(
  kb: string | string[],
  opts: RadiantOptions,
): Promise<RadiantGenerationResult> {
  const program = Array.isArray(kb) ? kb.join('\n') : kb;
  const maxQuests = opts.maxQuests ?? Number.POSITIVE_INFINITY;

  const templates = parseTemplates(program);
  // Deterministic processing order, independent of source layout.
  templates.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // A generation tick builds a throwaway KB, so it must RELEASE it — wasm has
  // no finalizers (see PrologEngine.destroy), and a director that ticks every
  // few seconds would otherwise leak a handle per tick.
  const engine = await createPrologEngine();
  try {
    const consulted = await engine.consult(program);
    if (!consulted.success) {
      throw new Error(`radiant: KB consult failed: ${consulted.error}`);
    }

    const quests: GeneratedRadiantQuest[] = [];
    for (const tpl of templates) {
      if (quests.length >= maxQuests) break;

      // 1. Exclusion — any exclusion goal that succeeds suppresses this template.
      let excluded = false;
      for (const goal of tpl.exclusions) {
        if (await succeeds(engine, goal)) {
          excluded = true;
          break;
        }
      }
      if (excluded) continue;

      // 2. Cooldown — an active `radiant_cooldown_until` in the future suppresses.
      const cooldownUntils = await solveAll(engine, `radiant_cooldown_until(${tpl.id}, T)`);
      const active = cooldownUntils
        .map((b) => Number(b['T']))
        .filter((t) => Number.isFinite(t));
      if (active.some((t) => t > opts.now)) continue;

      // 3. Preconditions — solve the conjunction; enumerate candidate slot fills.
      const candidates = await solveCandidates(engine, tpl);
      if (candidates.length === 0) continue; // unsatisfiable this tick → skip

      // 4. Pick one candidate with a per-template seeded RNG.
      const rng = mulberry32(hashSeed(opts.seed) ^ hashSeed(tpl.id));
      const chosen = candidates[Math.floor(rng() * candidates.length)];

      // 5. Instantiate the quest content + provenance / cooldown bookkeeping.
      quests.push(buildQuest(tpl, chosen, opts.now, active));
    }

    return { quests };
  } finally {
    engine.destroy?.();
  }
}

// ── Template parsing (KB source → structured templates) ──────────────────────

function parseTemplates(program: string): RadiantTemplate[] {
  const { facts } = parsePrologFile(program);

  const byId = new Map<string, RadiantTemplate>();
  const ensure = (id: string): RadiantTemplate => {
    let t = byId.get(id);
    if (!t) {
      t = {
        id,
        meta: { category: 'radiant', title: '', questType: 'radiant', difficulty: 1 },
        preconditions: [],
        objectives: [],
        rewards: [],
        cooldownSeconds: 0,
        exclusions: [],
      };
      byId.set(id, t);
    }
    return t;
  };

  for (const f of facts) {
    const id = firstAtom(f.args[0]);
    if (!id) continue;
    switch (`${f.predicate}/${f.arity}`) {
      case 'radiant_template/2':
        ensure(id).meta = parseMeta(f.args[1]);
        break;
      case 'radiant_precondition/3': {
        const slot = firstAtom(f.args[1]);
        if (slot) ensure(id).preconditions.push({ slot, goalText: goalText(f.args[2]) });
        break;
      }
      case 'radiant_objective/2':
        ensure(id).objectives.push(f.args[1]);
        break;
      case 'radiant_reward/3': {
        const kind = firstAtom(f.args[1]);
        if (kind) ensure(id).rewards.push({ kind, amount: f.args[2] });
        break;
      }
      case 'radiant_cooldown/2':
        ensure(id).cooldownSeconds = argNum(f.args[1]) ?? 0;
        break;
      case 'radiant_exclusion/2':
        ensure(id).exclusions.push(goalText(f.args[1]));
        break;
      default:
        break;
    }
  }

  // Only surface entries that actually declared a template header.
  return Array.from(byId.values()).filter((t) => t.meta.title !== '' || t.objectives.length > 0);
}

function parseMeta(arg: PrologArg | undefined): TemplateMeta {
  const meta: TemplateMeta = { category: 'radiant', title: '', questType: 'radiant', difficulty: 1 };
  if (!arg || arg.type !== 'list') return meta;
  for (const el of arg.elements) {
    if (el.type !== 'compound' || el.args.length !== 1) continue;
    const v = el.args[0];
    switch (el.functor) {
      case 'category':
        meta.category = argText(v);
        break;
      case 'title':
        meta.title = argText(v);
        break;
      case 'quest_type':
        meta.questType = argText(v);
        break;
      case 'difficulty':
        meta.difficulty = argNum(v) ?? 1;
        break;
      default:
        break;
    }
  }
  return meta;
}

// ── Candidate enumeration + deterministic ordering ───────────────────────────

/**
 * Solve a template's preconditions as one conjunction (earlier slot vars stay in
 * scope for later goals — a multi-slot join), project onto the slot variables,
 * deduplicate, and sort canonically so selection never depends on the Prolog
 * engine's enumeration order.
 */
async function solveCandidates(
  engine: PrologEngine,
  tpl: RadiantTemplate,
): Promise<Array<Record<string, string | number>>> {
  if (tpl.preconditions.length === 0) return [];

  const goal = tpl.preconditions.map((p) => p.goalText).join(', ');
  const slotVars = tpl.preconditions.map((p) => ({ slot: p.slot, varName: slotVar(p.slot) }));

  const solutions = await solveAll(engine, goal);

  const seen = new Set<string>();
  const projected: Array<Record<string, string | number>> = [];
  for (const sol of solutions) {
    const row: Record<string, string | number> = {};
    let complete = true;
    for (const { slot, varName } of slotVars) {
      const raw = sol[varName];
      if (raw === undefined || raw === null || typeof raw === 'boolean') {
        complete = false;
        break;
      }
      row[slot] = raw;
    }
    if (!complete) continue;
    const key = canonKey(row, slotVars.map((s) => s.slot));
    if (seen.has(key)) continue;
    seen.add(key);
    projected.push(row);
  }

  // Canonical ordering: sort by the tuple of slot values (in slot declaration order).
  const slots = slotVars.map((s) => s.slot);
  projected.sort((a, b) => (canonKey(a, slots) < canonKey(b, slots) ? -1 : 1));
  return projected;
}

function canonKey(row: Record<string, string | number>, slots: string[]): string {
  return JSON.stringify(slots.map((s) => [s, typeof row[s], row[s]]));
}

// ── Quest instantiation ──────────────────────────────────────────────────────

function buildQuest(
  tpl: RadiantTemplate,
  bindings: Record<string, string | number>,
  now: number,
  staleCooldowns: number[],
): GeneratedRadiantQuest {
  const questId = `radiant_${tpl.id}_${now}`;
  const bindMap = new Map<string, string | number>(Object.entries(bindings));

  const lines: string[] = [];
  lines.push(
    `quest(${questId}, ${quoteProlog(fillTitle(tpl.meta.title, bindings))}, ` +
      `${atom(tpl.meta.questType)}, ${tpl.meta.difficulty}, available).`,
  );

  tpl.objectives.forEach((obj, i) => {
    lines.push(`quest_objective(${questId}, ${i}, ${argToProlog(substitute(obj, bindMap))}).`);
  });

  for (const reward of tpl.rewards) {
    const amount = evalAmount(reward.amount, tpl, bindMap);
    lines.push(`quest_reward(${questId}, ${atom(reward.kind)}, ${amount}).`);
  }

  const factsToAssert: string[] = [`radiant_generated(${questId}, ${tpl.id}, ${now}).`];
  const factsToRetract: string[] = [];
  if (tpl.cooldownSeconds > 0) {
    for (const t of staleCooldowns) {
      factsToRetract.push(`radiant_cooldown_until(${tpl.id}, ${t}).`);
    }
    factsToAssert.push(`radiant_cooldown_until(${tpl.id}, ${now + tpl.cooldownSeconds}).`);
  }

  return {
    questId,
    templateId: tpl.id,
    questContent: lines.join('\n'),
    factsToAssert,
    factsToRetract,
  };
}

/** Replace `{slot}` placeholders in a title with the bound display value. */
function fillTitle(title: string, bindings: Record<string, string | number>): string {
  return title.replace(/\{(\w+)\}/g, (whole, slot) =>
    slot in bindings ? String(bindings[slot]) : whole,
  );
}

/**
 * Evaluate a `radiant_reward` AmountExpr to an integer:
 *  - integer literal;
 *  - `times(Base, Factor)` — Base × Factor, where a factor of the atom
 *    `difficulty` is the template difficulty and a slot variable resolves to its
 *    (numeric) binding;
 *  - `per(Slot, Unit)` — Unit × the numeric count paired with that slot in an
 *    objective (e.g. `collect(Item, 5)` ⇒ 5), defaulting to 1.
 */
function evalAmount(
  arg: PrologArg,
  tpl: RadiantTemplate,
  bindMap: Map<string, string | number>,
): number {
  if (arg.type === 'number') return Math.trunc(arg.value);

  if (arg.type === 'compound' && arg.functor === 'times' && arg.args.length === 2) {
    return Math.trunc(evalFactor(arg.args[0], tpl, bindMap) * evalFactor(arg.args[1], tpl, bindMap));
  }

  if (arg.type === 'compound' && arg.functor === 'per' && arg.args.length === 2) {
    const slot = argText(arg.args[0]);
    const unit = evalFactor(arg.args[1], tpl, bindMap);
    return Math.trunc(unit * countForSlot(slot, tpl));
  }

  // Unknown expression → 0 (never NaN, so output stays deterministic).
  return 0;
}

function evalFactor(
  arg: PrologArg,
  tpl: RadiantTemplate,
  bindMap: Map<string, string | number>,
): number {
  if (arg.type === 'number') return arg.value;
  if (arg.type === 'atom') {
    if (arg.value === 'difficulty') return tpl.meta.difficulty;
    const n = Number(arg.value);
    return Number.isFinite(n) ? n : 0;
  }
  if (arg.type === 'variable') {
    const v = bindMap.get(slotForVar(arg.value));
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** The numeric count paired with `slot`'s variable in any objective, else 1. */
function countForSlot(slot: string, tpl: RadiantTemplate): number {
  const v = slotVar(slot);
  for (const obj of tpl.objectives) {
    if (obj.type !== 'compound') continue;
    const hasSlot = obj.args.some((a) => a.type === 'variable' && a.value === v);
    if (!hasSlot) continue;
    const num = obj.args.find((a) => a.type === 'number');
    if (num && num.type === 'number') return num.value;
  }
  return 1;
}

// ── PrologArg substitution + serialization ───────────────────────────────────

/** Replace slot variables in a term with their bindings. */
function substitute(arg: PrologArg, bindMap: Map<string, string | number>): PrologArg {
  switch (arg.type) {
    case 'variable': {
      const slot = slotForVar(arg.value);
      const v = bindMap.get(slot);
      if (v === undefined) return arg;
      return typeof v === 'number' ? { type: 'number', value: v } : { type: 'atom', value: v };
    }
    case 'compound':
      return { type: 'compound', functor: arg.functor, args: arg.args.map((a) => substitute(a, bindMap)) };
    case 'list':
      return { type: 'list', elements: arg.elements.map((a) => substitute(a, bindMap)) };
    default:
      return arg;
  }
}

/** Serialize a (substituted) PrologArg back to Prolog source text. */
function argToProlog(arg: PrologArg): string {
  switch (arg.type) {
    case 'number':
      return String(arg.value);
    case 'atom':
    case 'string':
      return atom(arg.value);
    case 'variable':
      return arg.value;
    case 'compound':
      return `${arg.functor}(${arg.args.map(argToProlog).join(', ')})`;
    case 'list':
      return `[${arg.elements.map(argToProlog).join(', ')}]`;
  }
}

// ── Prolog goal helpers over the engine ──────────────────────────────────────

async function succeeds(engine: PrologEngine, goal: string): Promise<boolean> {
  try {
    const r = await engine.query(goal, 1);
    return r.success && r.bindings.length > 0;
  } catch {
    return false;
  }
}

async function solveAll(
  engine: PrologEngine,
  goal: string,
): Promise<Array<Record<string, string | number | boolean | null>>> {
  try {
    const r = await engine.query(goal);
    return r.success ? r.bindings : [];
  } catch {
    return [];
  }
}

// ── Small value helpers ──────────────────────────────────────────────────────

/** The slot's Prolog variable: slot `giver` → `Giver`. */
function slotVar(slot: string): string {
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}

/** Map a variable name back to the slot key it fills (lowercased first char). */
function slotForVar(varName: string): string {
  return varName.charAt(0).toLowerCase() + varName.slice(1);
}

function firstAtom(arg: PrologArg | undefined): string | null {
  if (!arg) return null;
  if (arg.type === 'atom') return arg.value;
  if (arg.type === 'string') return arg.value;
  return null;
}

function argText(arg: PrologArg | undefined): string {
  if (!arg) return '';
  if (arg.type === 'atom' || arg.type === 'string') return arg.value;
  if (arg.type === 'number') return String(arg.value);
  if (arg.type === 'variable') return arg.value;
  return '';
}

function argNum(arg: PrologArg | undefined): number | null {
  if (arg && arg.type === 'number') return arg.value;
  return null;
}

/** The raw goal source for a precondition/exclusion term (engine-solvable). */
function goalText(arg: PrologArg | undefined): string {
  return argToGoalSource(arg);
}

function argToGoalSource(arg: PrologArg | undefined): string {
  if (!arg) return 'fail';
  switch (arg.type) {
    case 'atom':
      return arg.value; // parenthesised conjunctions land here verbatim
    case 'string':
      return quoteProlog(arg.value);
    case 'number':
      return String(arg.value);
    case 'variable':
      return arg.value;
    case 'compound':
      return `${arg.functor}(${arg.args.map(argToGoalSource).join(', ')})`;
    case 'list':
      return `[${arg.elements.map(argToGoalSource).join(', ')}]`;
  }
}

// ── Prolog atom / string quoting (matches prolog-fact-serializer) ────────────

const ATOM_RE = /^[a-z][a-zA-Z0-9_]*$/;

function atom(s: string): string {
  if (s === '') return quoteProlog('');
  return ATOM_RE.test(s) ? s : quoteProlog(s);
}

function quoteProlog(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

// ── Deterministic RNG (mulberry32) — Math.random is forbidden here ───────────

function hashSeed(seed: number | string): number {
  if (typeof seed === 'number') return seed >>> 0;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
