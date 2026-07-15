/**
 * PrologTestBed — ergonomic helper for semantic testing of generated
 * Prolog content (US-006).
 *
 * Wraps `TauPrologEngine` with a small, test-friendly API: load a
 * program, seed entities, assert facts, query the knowledge base, and
 * verify rule firings or captured effects. Each method throws with a
 * descriptive diff when expectations fail so test failures are actionable.
 *
 * Callbacks in tau-prolog are async; methods here await internally so
 * individual test steps read top-to-bottom without scheduler ceremony.
 */

import { TauPrologEngine, type QueryBindings } from '../../tau-engine';

export type Bindings = QueryBindings;

export interface PrologTestBed {
  readonly engine: TauPrologEngine;
  load(prologContent: string): Promise<void>;
  assert(fact: string): Promise<void>;
  assertAll(facts: string[]): Promise<void>;
  query(goal: string): Promise<Bindings[]>;
  querySucceeds(goal: string): Promise<boolean>;
  assertFires(ruleHead: string, withBindings?: Bindings): Promise<void>;
  captureEffects(trigger: string): Promise<string[]>;
  seedCharacter(id: string, traits?: TraitMap): Promise<void>;
  seedLocation(id: string, traits?: TraitMap): Promise<void>;
  seedItem(id: string, traits?: TraitMap): Promise<void>;
  seedRelationship(from: string, kind: string, to: string): Promise<void>;
}

export type TraitMap = Record<string, string | number | boolean>;

const ATOM_PATTERN = /^[a-z][a-zA-Z0-9_]*$/;

function formatArg(val: string | number | boolean): string {
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  const s = String(val);
  if (ATOM_PATTERN.test(s)) return s;
  if (/^-?\d+(\.\d+)?$/.test(s)) return s;
  return `'${s.replace(/'/g, "''")}'`;
}

/**
 * Read raw Prolog-formatted term strings from an engine answer without
 * going through the default binding extractor (which collapses compound
 * terms to their functor name). Uses `Term.prototype.toString()` for
 * faithful round-tripping of list/compound bindings.
 */
async function queryTermStrings(
  engine: TauPrologEngine,
  goal: string,
): Promise<Array<Record<string, string>>> {
  const session = (engine as unknown as { session: any }).session;
  const normalized = goal.trim().replace(/\.\s*$/, '') + '.';

  return new Promise((resolve, reject) => {
    const results: Array<Record<string, string>> = [];

    session.query(normalized, {
      success: () => {
        const collect = () => {
          session.answer({
            success: (answer: any) => {
              const links = answer.links || {};
              const rec: Record<string, string> = {};
              for (const [k, v] of Object.entries(links)) {
                rec[k] = (v as { toString(): string }).toString();
              }
              results.push(rec);
              collect();
            },
            fail: () => resolve(results),
            error: (err: unknown) => {
              if (results.length > 0) resolve(results);
              else reject(new Error(String(err)));
            },
            limit: () => resolve(results),
          });
        };
        collect();
      },
      error: (err: unknown) => reject(new Error(String(err))),
    });
  });
}

class PrologTestBedImpl implements PrologTestBed {
  constructor(public readonly engine: TauPrologEngine) {}

  async load(prologContent: string): Promise<void> {
    const result = await this.engine.consult(prologContent);
    if (!result.success) {
      throw new Error(`PrologTestBed.load: consult failed: ${result.error}`);
    }
  }

  async assert(fact: string): Promise<void> {
    const ok = await this.engine.assertFact(fact);
    if (!ok) throw new Error(`PrologTestBed.assert: failed to assert "${fact}"`);
  }

  async assertAll(facts: string[]): Promise<void> {
    if (facts.length === 0) return;
    const ok = await this.engine.assertFacts(facts);
    if (!ok) throw new Error(`PrologTestBed.assertAll: failed to assert ${facts.length} facts`);
  }

  async query(goal: string): Promise<Bindings[]> {
    const result = await this.engine.query(goal);
    if (!result.success) {
      throw new Error(`PrologTestBed.query: "${goal}" failed: ${result.error}`);
    }
    return result.bindings;
  }

  async querySucceeds(goal: string): Promise<boolean> {
    return this.engine.queryOnce(goal);
  }

  async assertFires(ruleHead: string, withBindings?: Bindings): Promise<void> {
    const goal = substituteBindings(ruleHead, withBindings);
    const ok = await this.engine.queryOnce(goal);
    if (!ok) {
      const stats = this.engine.getStats();
      const bindingsRepr = withBindings ? JSON.stringify(withBindings) : '(none)';
      throw new Error(
        `PrologTestBed.assertFires: rule head did not fire\n` +
        `  head:     ${ruleHead}\n` +
        `  query:    ${goal}\n` +
        `  bindings: ${bindingsRepr}\n` +
        `  kb:       ${stats.factCount} facts, ${stats.ruleCount} rules`,
      );
    }
  }

  async captureEffects(trigger: string): Promise<string[]> {
    await this.ensureEffectsHelpers();
    const expanded = `${trigger.replace(/\.\s*$/, '')}, testbed_in(__E, Effects)`;
    const rows = await queryTermStrings(this.engine, expanded);
    return rows
      .map(row => row.__E)
      .filter((s): s is string => typeof s === 'string' && s.length > 0);
  }

  private effectsHelpersLoaded = false;

  private async ensureEffectsHelpers(): Promise<void> {
    if (this.effectsHelpersLoaded) return;
    await this.engine.addRules([
      'testbed_in(X, [X|_])',
      'testbed_in(X, [_|T]) :- testbed_in(X, T)',
    ]);
    this.effectsHelpersLoaded = true;
  }

  async seedCharacter(id: string, traits: TraitMap = {}): Promise<void> {
    await this.seedEntity('character', id, traits);
  }

  async seedLocation(id: string, traits: TraitMap = {}): Promise<void> {
    await this.seedEntity('location', id, traits);
  }

  async seedItem(id: string, traits: TraitMap = {}): Promise<void> {
    await this.seedEntity('item', id, traits);
  }

  async seedRelationship(from: string, kind: string, to: string): Promise<void> {
    await this.assert(`${kind}(${formatArg(from)}, ${formatArg(to)})`);
  }

  private async seedEntity(kind: string, id: string, traits: TraitMap): Promise<void> {
    const facts = [`${kind}(${formatArg(id)})`];
    for (const [key, val] of Object.entries(traits)) {
      facts.push(`${key}(${formatArg(id)}, ${formatArg(val)})`);
    }
    await this.assertAll(facts);
  }
}

function substituteBindings(head: string, bindings?: Bindings): string {
  if (!bindings) return head;
  let out = head;
  for (const [variable, value] of Object.entries(bindings)) {
    if (value === null || value === undefined) continue;
    const re = new RegExp(`\\b${escapeRegex(variable)}\\b`, 'g');
    out = out.replace(re, formatArg(value as string | number | boolean));
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a fresh PrologTestBed. If `seedFacts` is provided, it is
 * consulted into the engine before returning so tests can preload a
 * shared schema or base rule set.
 */
export async function createTestBed(seedFacts?: string): Promise<PrologTestBed> {
  const engine = new TauPrologEngine();

  if (seedFacts && seedFacts.trim().length > 0) {
    const result = await engine.consult(seedFacts);
    if (!result.success) {
      throw new Error(`createTestBed: seed consult failed: ${result.error}`);
    }
  }

  return new PrologTestBedImpl(engine);
}
