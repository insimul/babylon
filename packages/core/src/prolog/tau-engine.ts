/**
 * Portable Prolog Engine (tau-prolog)
 *
 * Runs in both Node.js and browser environments. Provides a clean async API
 * for managing a Prolog knowledge base with fact assertion/retraction,
 * rule definition, and query execution.
 *
 * This replaces the SWI-Prolog dependency (which requires a system install)
 * with a pure JavaScript implementation that can be bundled into the client.
 */

// tau-prolog is a CommonJS module — use default imports which work
// with both Vite (browser bundler) and tsx/Node.js ESM
//
// IMPORTANT: tau-prolog's core.js assigns `tau_file_system` without
// var/let/const, relying on sloppy-mode implicit globals. Vite bundles
// in strict mode where implicit globals throw ReferenceError.
// We patch globalThis before importing via a side-effect-only module.
import './tau-prolog-patch';
import pl from 'tau-prolog';
import loadLists from 'tau-prolog/modules/lists.js';
(loadLists as any)(pl);

export interface QueryBindings {
  [variable: string]: string | number | boolean | null;
}

export interface QueryResult {
  success: boolean;
  bindings: QueryBindings[];
  error?: string;
}

export interface EngineStats {
  factCount: number;
  ruleCount: number;
  dynamicPredicates: string[];
}

/**
 * Extracts variable bindings from a tau-prolog answer term.
 */
function extractBindings(answer: any): QueryBindings {
  const links = answer.links || {};
  const result: QueryBindings = {};
  for (const [key, val] of Object.entries(links)) {
    if (val === null || val === undefined) {
      result[key] = null;
    } else if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') {
      result[key] = val;
    } else if (typeof val === 'object') {
      const v = val as any;
      if (v.value !== undefined) {
        result[key] = v.value;
      } else if (v.id !== undefined) {
        result[key] = v.id;
      } else if (v.toJavaScript) {
        result[key] = v.toJavaScript();
      } else {
        result[key] = pl.format_answer(answer).includes(key)
          ? pl.format_answer({ links: { [key]: val } } as any)
          : String(val);
      }
    }
  }
  return result;
}

export class TauPrologEngine {
  private session: any;
  private dynamicPredicates: Set<string> = new Set();
  // Accumulated consulted programs. rebuild() reconstructs the FULL KB from
  // stored state, so consult() must ADD each program rather than replace the
  // previous one — otherwise a caller that consults several packs into one
  // engine (e.g. GamePrologEngine.initialize: world content + quests + helper
  // rule packs, each a separate consult) silently keeps only the last, which
  // breaks every rule defined in an earlier consult. Exact-duplicate chunks are
  // skipped so an idempotent re-consult can't double-count in findall/aggregate.
  private consultedPrograms: string[] = [];
  private factStore: Map<string, Set<string>> = new Map();
  private ruleStore: string[] = [];

  constructor(limit?: number) {
    this.session = pl.create(limit || 10000);
  }

  /**
   * Declare predicates as dynamic so they can be asserted/retracted at runtime.
   * Must be called before asserting facts for those predicates.
   *
   * @param predicates - Array of predicate signatures like "person/1", "age/2"
   */
  async declareDynamic(predicates: string[]): Promise<void> {
    const newPredicates = predicates.filter(p => !this.dynamicPredicates.has(p));
    if (newPredicates.length === 0) return;

    for (const p of newPredicates) {
      this.dynamicPredicates.add(p);
    }

    await this.rebuild();
  }

  /**
   * Consult a Prolog program (facts + rules as a string).
   * Dynamic declarations are automatically prepended.
   */
  async consult(program: string): Promise<{ success: boolean; error?: string }> {
    const trimmed = program.trim();
    if (trimmed && !this.consultedPrograms.includes(trimmed)) {
      this.consultedPrograms.push(trimmed);
    }

    // Extract any dynamic declarations from the program itself
    const dynamicRegex = /:-\s*dynamic\s*\(?\s*([a-z_]\w*\s*\/\s*\d+)\s*\)?\s*\./g;
    let match;
    while ((match = dynamicRegex.exec(program)) !== null) {
      this.dynamicPredicates.add(match[1].replace(/\s/g, ''));
    }

    return this.rebuild();
  }

  /**
   * Assert a fact into the knowledge base.
   * The predicate must be declared dynamic first (or will be auto-declared).
   *
   * @param fact - Prolog fact string, e.g. "person(john)" or "age(john, 35)"
   */
  async assertFact(fact: string): Promise<boolean> {
    const normalized = fact.trim().replace(/\.\s*$/, '');
    const predSig = this.extractPredicateSignature(normalized);

    if (predSig && !this.dynamicPredicates.has(predSig)) {
      this.dynamicPredicates.add(predSig);
    }

    if (!this.factStore.has(predSig || '')) {
      this.factStore.set(predSig || '', new Set());
    }
    this.factStore.get(predSig || '')!.add(normalized + '.');

    return (await this.rebuild()).success;
  }

  /**
   * Assert multiple facts at once (more efficient than individual assertFact calls).
   */
  async assertFacts(facts: string[]): Promise<boolean> {
    for (const fact of facts) {
      const normalized = fact.trim().replace(/\.\s*$/, '');
      const predSig = this.extractPredicateSignature(normalized);

      if (predSig && !this.dynamicPredicates.has(predSig)) {
        this.dynamicPredicates.add(predSig);
      }

      if (!this.factStore.has(predSig || '')) {
        this.factStore.set(predSig || '', new Set());
      }
      this.factStore.get(predSig || '')!.add(normalized + '.');
    }

    return (await this.rebuild()).success;
  }

  /**
   * Retract a fact from the knowledge base.
   */
  async retractFact(fact: string): Promise<boolean> {
    const normalized = fact.trim().replace(/\.\s*$/, '') + '.';
    const predSig = this.extractPredicateSignature(normalized.replace(/\.$/, ''));

    const facts = this.factStore.get(predSig || '');
    if (facts) {
      facts.delete(normalized);
      if (facts.size === 0) this.factStore.delete(predSig || '');
    }

    return (await this.rebuild()).success;
  }

  /**
   * Add a Prolog rule (with :- body).
   *
   * @param rule - e.g. "adult(X) :- person(X), age(X, A), A >= 18"
   */
  async addRule(rule: string): Promise<boolean> {
    const normalized = rule.trim().replace(/\.\s*$/, '') + '.';

    // Auto-declare head predicate as dynamic
    const headMatch = normalized.match(/^([a-z_]\w*)\s*\(/);
    if (headMatch) {
      const headName = headMatch[1];
      const arityMatch = normalized.match(/^[^(]*\(([^)]*)\)/);
      if (arityMatch) {
        const arity = arityMatch[1].split(',').length;
        const sig = `${headName}/${arity}`;
        if (!this.dynamicPredicates.has(sig)) {
          this.dynamicPredicates.add(sig);
        }
      }
    }

    if (!this.ruleStore.includes(normalized)) {
      this.ruleStore.push(normalized);
    }

    return (await this.rebuild()).success;
  }

  /**
   * Add multiple rules at once.
   */
  async addRules(rules: string[]): Promise<boolean> {
    for (const rule of rules) {
      const normalized = rule.trim().replace(/\.\s*$/, '') + '.';
      const headMatch = normalized.match(/^([a-z_]\w*)\s*\(/);
      if (headMatch) {
        const headName = headMatch[1];
        const arityMatch = normalized.match(/^[^(]*\(([^)]*)\)/);
        if (arityMatch) {
          const arity = arityMatch[1].split(',').length;
          const sig = `${headName}/${arity}`;
          if (!this.dynamicPredicates.has(sig)) {
            this.dynamicPredicates.add(sig);
          }
        }
      }
      if (!this.ruleStore.includes(normalized)) {
        this.ruleStore.push(normalized);
      }
    }

    return (await this.rebuild()).success;
  }

  /**
   * Execute a Prolog query and return all results.
   *
   * @param queryString - Prolog goal, e.g. "person(X)" or "adult(X), age(X, A)"
   * @param maxResults - Maximum number of results to return (default: 1000)
   */
  async query(queryString: string, maxResults: number = 1000): Promise<QueryResult> {
    const goal = queryString.trim().replace(/\.\s*$/, '') + '.';

    return new Promise((resolve) => {
      this.session.query(goal, {
        success: () => {
          const bindings: QueryBindings[] = [];
          const collect = () => {
            if (bindings.length >= maxResults) {
              resolve({ success: true, bindings });
              return;
            }
            this.session.answer({
              success: (answer: any) => {
                bindings.push(extractBindings(answer));
                collect();
              },
              fail: () => {
                resolve({ success: true, bindings });
              },
              error: (err: any) => {
                // Some queries produce errors after partial results
                if (bindings.length > 0) {
                  resolve({ success: true, bindings });
                } else {
                  resolve({ success: false, bindings: [], error: String(err) });
                }
              },
              limit: () => {
                resolve({
                  success: true,
                  bindings,
                  error: 'Inference limit reached',
                });
              },
            });
          };
          collect();
        },
        error: (err: any) => {
          resolve({ success: false, bindings: [], error: String(err) });
        },
      });
    });
  }

  /**
   * Execute a yes/no query (no variable bindings needed).
   */
  async queryOnce(queryString: string): Promise<boolean> {
    const result = await this.query(queryString, 1);
    return result.success && result.bindings.length > 0;
  }

  /**
   * Get all facts for a given predicate.
   */
  getFactsForPredicate(predicateSignature: string): string[] {
    const facts = this.factStore.get(predicateSignature);
    return facts ? Array.from(facts) : [];
  }

  /**
   * Get all stored facts.
   */
  getAllFacts(): string[] {
    const all: string[] = [];
    Array.from(this.factStore.values()).forEach(facts => {
      Array.from(facts).forEach(f => all.push(f));
    });
    return all;
  }

  /**
   * Get all stored rules.
   */
  getAllRules(): string[] {
    return [...this.ruleStore];
  }

  /**
   * Clear all facts and rules.
   */
  async clear(): Promise<void> {
    this.dynamicPredicates.clear();
    this.factStore.clear();
    this.ruleStore = [];
    this.consultedPrograms = [];
    this.session = pl.create(this.session.limit);
  }

  /**
   * Clear only facts (keep rules and consulted program).
   */
  async clearFacts(): Promise<void> {
    this.factStore.clear();
    await this.rebuild();
  }

  /**
   * Export the entire knowledge base as a Prolog program string.
   */
  export(): string {
    const parts: string[] = [];

    parts.push('% Prolog Knowledge Base (exported from Insimul)');
    parts.push('% Generated: ' + new Date().toISOString());
    parts.push('');

    // Dynamic declarations
    if (this.dynamicPredicates.size > 0) {
      parts.push('% Dynamic predicate declarations');
      Array.from(this.dynamicPredicates).forEach(p => {
        parts.push(`:- dynamic(${p}).`);
      });
      parts.push('');
    }

    // Consulted program
    const consulted = this.consultedProgramText();
    if (consulted) {
      parts.push('% Consulted program');
      parts.push(consulted);
      parts.push('');
    }

    // Rules
    if (this.ruleStore.length > 0) {
      parts.push('% Rules');
      this.ruleStore.forEach(r => parts.push(r));
      parts.push('');
    }

    // Facts (grouped by predicate)
    if (this.factStore.size > 0) {
      parts.push('% Facts');
      Array.from(this.factStore.entries()).forEach(([sig, facts]) => {
        parts.push(`% ${sig}`);
        Array.from(facts).forEach(f => parts.push(f));
      });
      parts.push('');
    }

    return parts.join('\n');
  }

  /**
   * Import a Prolog program string, adding to the current knowledge base.
   */
  async import(program: string): Promise<{ success: boolean; error?: string }> {
    const lines = program.split('\n');
    const facts: string[] = [];
    const rules: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('%')) continue;

      // Dynamic declaration
      const dynMatch = trimmed.match(/^:-\s*dynamic\s*\(?\s*([a-z_]\w*\s*\/\s*\d+)\s*\)?\s*\.$/);
      if (dynMatch) {
        this.dynamicPredicates.add(dynMatch[1].replace(/\s/g, ''));
        continue;
      }

      // Skip other directives
      if (trimmed.startsWith(':-')) continue;

      // Rule (has :- in body)
      if (trimmed.includes(':-')) {
        rules.push(trimmed);
      } else if (trimmed.endsWith('.')) {
        facts.push(trimmed.replace(/\.\s*$/, ''));
      }
    }

    if (rules.length > 0) await this.addRules(rules.map(r => r.replace(/\.\s*$/, '')));
    if (facts.length > 0) await this.assertFacts(facts);

    return { success: true };
  }

  /**
   * Get engine statistics.
   */
  getStats(): EngineStats {
    let factCount = 0;
    Array.from(this.factStore.values()).forEach(facts => {
      factCount += facts.size;
    });
    return {
      factCount,
      ruleCount: this.ruleStore.length,
      dynamicPredicates: Array.from(this.dynamicPredicates),
    };
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  /** Join every consulted program chunk into one program string. */
  private consultedProgramText(): string {
    return this.consultedPrograms.join('\n').trim();
  }

  /**
   * Rebuild the tau-prolog session from stored state.
   * tau-prolog doesn't support incremental assert/retract well on
   * static predicates, so we rebuild the full program when state changes.
   */
  private async rebuild(): Promise<{ success: boolean; error?: string }> {
    const parts: string[] = [];

    // Dynamic declarations first
    Array.from(this.dynamicPredicates).forEach(p => {
      parts.push(`:- dynamic(${p}).`);
    });

    // Consulted program
    const consulted = this.consultedProgramText();
    if (consulted) {
      parts.push(consulted);
    }

    // Rules
    this.ruleStore.forEach(r => parts.push(r));

    // Facts
    Array.from(this.factStore.values()).forEach(facts => {
      Array.from(facts).forEach(f => parts.push(f));
    });

    const fullProgram = parts.join('\n');

    // Create a fresh session and consult
    this.session = pl.create(this.session.limit || 10000);

    return new Promise((resolve) => {
      if (!fullProgram.trim()) {
        resolve({ success: true });
        return;
      }

      this.session.consult(fullProgram, {
        success: () => resolve({ success: true }),
        error: (err: any) => resolve({ success: false, error: String(err) }),
      });
    });
  }

  /**
   * Extract predicate signature (name/arity) from a fact string.
   */
  private extractPredicateSignature(fact: string): string {
    const match = fact.match(/^([a-z_]\w*)\s*\(([^)]*)\)/);
    if (!match) {
      // Atom fact (no arguments)
      const atomMatch = fact.match(/^([a-z_]\w*)\s*\.?$/);
      if (atomMatch) return `${atomMatch[1]}/0`;
      return '';
    }

    const name = match[1];
    // Count args carefully — handle nested parens and quoted strings
    let depth = 0;
    let arity = 1;
    const argsStr = match[2];
    for (let i = 0; i < argsStr.length; i++) {
      const ch = argsStr[i];
      if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') depth--;
      else if (ch === ',' && depth === 0) arity++;
      else if (ch === "'" || ch === '"') {
        // Skip quoted string
        const quote = ch;
        i++;
        while (i < argsStr.length && argsStr[i] !== quote) {
          if (argsStr[i] === '\\') i++; // skip escaped char
          i++;
        }
      }
    }

    return `${name}/${arity}`;
  }
}
