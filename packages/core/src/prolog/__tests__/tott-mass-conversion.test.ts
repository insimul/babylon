/**
 * US-PC4 — Talk-of-the-Town mass-conversion gate.
 *
 * Runs the whole ToTT corpus (fixtures/tott/*, one file per source shape) through
 * the converter and asserts the set converts cleanly:
 *   1. zero unparsed rules (nothing skipped),
 *   2. every rule prologContent passes `validateRuleContent` (REQUIRES
 *      `rule_type/2` — the hard requirement ToTT inherits from the contract),
 *   3. every emitted ground fact passes `validatePrologFact` against the
 *      signatures registered in `PREDICATE_SCHEMA` (the 1:1-registry check).
 *
 * The three fixtures exercise the three source shapes: `flat.json` (JSON-flat),
 * `categorized.json` (JSON-categorized), `python.tott` (Python-class DSL). The
 * platform client's unified-syntax ToTT test data is not checked out in this
 * worktree, so the corpus is hand-authored in-repo (see each fixture's header).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { convertTottSource } from '../tott-converter';
import { validateRuleContent } from '../content-validators';
import { validatePrologFact } from '../prolog-fact-validator';
import { getCurrentPredicateSchema } from '../prolog-schema-diff';

const FIXTURE_DIR = join(__dirname, 'fixtures', 'tott');

/** name/arity signatures the emitted ground facts are validated against. */
const KNOWN_SIGNATURES = new Set(
  getCurrentPredicateSchema().map(e => `${e.name}/${e.arity}`),
);

function corpusFiles(): string[] {
  return readdirSync(FIXTURE_DIR).filter(f => f.endsWith('.json') || f.endsWith('.tott'));
}

function loadSource(file: string): string {
  return readFileSync(join(FIXTURE_DIR, file), 'utf-8');
}

/**
 * Split prologContent into clauses and return the ground-fact clauses only
 * (dropping comments and `:- ...` rule clauses). Clauses terminate at a `.`
 * followed by newline/end — a lookahead that skips the `.` inside floats like
 * `0.8`. Full-line comments are stripped so a `% title` preceding a fact does
 * not glue onto it.
 */
function groundFactClauses(content: string): string[] {
  return content
    .split(/\.(?=\r?\n|\s*$)/)
    .map(seg =>
      seg
        .split(/\r?\n/)
        .filter(line => !line.trim().startsWith('%'))
        .join('\n')
        .trim(),
    )
    .filter(seg => seg.length > 0)
    .filter(seg => !seg.includes(':-'));
}

describe('ToTT mass conversion (per-shape corpus)', () => {
  it('registry set includes the ToTT preamble predicates', () => {
    expect(KNOWN_SIGNATURES.has('rule_type/2')).toBe(true);
    expect(KNOWN_SIGNATURES.has('rule_source/2')).toBe(true);
    expect(KNOWN_SIGNATURES.has('rule_category/2')).toBe(true);
    expect(KNOWN_SIGNATURES.has('rule_priority/2')).toBe(true);
    expect(KNOWN_SIGNATURES.has('rule_likelihood/2')).toBe(true);
    expect(KNOWN_SIGNATURES.has('rule_effect/2')).toBe(true);
    expect(KNOWN_SIGNATURES.has('rule_applies/3')).toBe(true);
  });

  it('converts every rule in the corpus with zero unparsed rules', () => {
    const files = corpusFiles();
    expect(files.length).toBeGreaterThanOrEqual(3);

    let ruleCount = 0;
    for (const file of files) {
      const results = convertTottSource(loadSource(file));
      expect(results.length, `${file}: no rules parsed`).toBeGreaterThan(0);
      for (const r of results) {
        ruleCount++;
        expect(r.skipped, `${file}: rule "${r.name}" was skipped (${r.skipReason})`).toBe(false);
        expect(r.prologContent).not.toBeNull();
      }
    }
    expect(ruleCount).toBeGreaterThanOrEqual(9);
  });

  it('every converted rule passes validateRuleContent (rule_type/2 present)', () => {
    for (const file of corpusFiles()) {
      for (const r of convertTottSource(loadSource(file))) {
        const v = validateRuleContent(r.prologContent!);
        expect(v.isValid, `${file}: rule "${r.name}" invalid — ${v.errors.join('; ')}`).toBe(true);
      }
    }
  });

  it('every emitted ground fact is schema-known and well-formed (prolog-fact-validator)', () => {
    for (const file of corpusFiles()) {
      for (const r of convertTottSource(loadSource(file))) {
        if (r.skipped || !r.prologContent) continue;
        for (const clause of groundFactClauses(r.prologContent)) {
          const res = validatePrologFact(clause, KNOWN_SIGNATURES);
          expect(
            res.valid,
            `${file}: fact "${clause}" rejected — ${res.valid ? '' : res.reason}`,
          ).toBe(true);
        }
      }
    }
  });
});
