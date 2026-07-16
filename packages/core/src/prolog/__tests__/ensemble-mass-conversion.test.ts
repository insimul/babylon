/**
 * US-PC2 — Ensemble mass-conversion gate.
 *
 * Runs a VESPACE-style Ensemble seed corpus (fixtures/ensemble/*.json) through
 * the canonical converter and asserts the whole set converts cleanly:
 *   1. zero unparsed rules (nothing skipped),
 *   2. every rule prologContent passes `validateRuleContent` (which REQUIRES
 *      `rule_type/2` — the US-PC2 hard requirement),
 *   3. every emitted ground fact passes `validatePrologFact` against the
 *      signatures registered in `PREDICATE_SCHEMA` (the 1:1-registry check —
 *      catches any predicate the converter emits but nobody registered).
 *
 * The platform's `data/ensemble/VESPACE/*.json` seed set is not checked out in
 * this worktree, so the corpus is hand-authored in-repo (see the fixture
 * `_note`); it exercises every condition/effect category, likelihood present /
 * absent, explicit `rule_type`, mixed category spellings, and someone/other-only
 * head variables.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  convertActionFile,
  convertVolitionRuleFile,
  type ConversionResult,
} from '../ensemble-converter';
import { validateRuleContent } from '../content-validators';
import { validatePrologFact } from '../prolog-fact-validator';
import { getCurrentPredicateSchema } from '../prolog-schema-diff';

const FIXTURE_DIR = join(__dirname, 'fixtures', 'ensemble');

function loadJson(file: string): any {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, file), 'utf-8'));
}

/** name/arity signatures the emitted ground facts are validated against. */
const KNOWN_SIGNATURES = new Set(
  getCurrentPredicateSchema().map(e => `${e.name}/${e.arity}`),
);

/**
 * Split prologContent into clauses and return the ground-fact clauses only
 * (dropping comments and `:- ... ` rule clauses). Clauses terminate at a `.`
 * followed by newline/end — a lookahead that skips the `.` inside floats like
 * `0.8`. Leading full-line comments are stripped so a `% title` line preceding
 * a fact does not glue onto it.
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
    .filter(seg => !seg.includes(':-')); // rule clauses are validated as whole content, not per-fact
}

function ruleFileFixtures(): string[] {
  return readdirSync(FIXTURE_DIR).filter(f => f.endsWith('.rules.json'));
}

describe('Ensemble mass conversion (VESPACE-style corpus)', () => {
  it('registry set is non-empty and includes the US-PC2 predicates', () => {
    expect(KNOWN_SIGNATURES.has('rule_type/2')).toBe(true);
    expect(KNOWN_SIGNATURES.has('rule_likelihood/2')).toBe(true);
    expect(KNOWN_SIGNATURES.has('rule_category/2')).toBe(true);
    expect(KNOWN_SIGNATURES.has('rule_source/2')).toBe(true);
    expect(KNOWN_SIGNATURES.has('rule_effect/2')).toBe(true);
  });

  it('converts every rule in the corpus with zero unparsed rules', () => {
    const files = ruleFileFixtures();
    expect(files.length).toBeGreaterThan(0);

    let ruleCount = 0;
    for (const file of files) {
      const results = convertVolitionRuleFile(loadJson(file));
      for (const r of results) {
        ruleCount++;
        expect(r.skipped, `${file}: rule "${r.name}" was skipped (${r.skipReason})`).toBe(false);
        expect(r.prologContent).not.toBeNull();
      }
    }
    expect(ruleCount).toBeGreaterThanOrEqual(8);
  });

  it('every converted rule passes validateRuleContent (rule_type/2 present)', () => {
    for (const file of ruleFileFixtures()) {
      for (const r of convertVolitionRuleFile(loadJson(file))) {
        const v = validateRuleContent(r.prologContent!);
        expect(
          v.isValid,
          `${file}: rule "${r.name}" invalid — ${v.errors.join('; ')}`,
        ).toBe(true);
      }
    }
  });

  it('every emitted ground fact is schema-known and well-formed (prolog-fact-validator)', () => {
    const check = (results: ConversionResult[], file: string) => {
      for (const r of results) {
        if (r.skipped || !r.prologContent) continue;
        for (const clause of groundFactClauses(r.prologContent)) {
          const res = validatePrologFact(clause, KNOWN_SIGNATURES);
          expect(
            res.valid,
            `${file}: fact "${clause}" rejected — ${res.valid ? '' : res.reason}`,
          ).toBe(true);
        }
      }
    };

    for (const file of ruleFileFixtures()) {
      check(convertVolitionRuleFile(loadJson(file)), file);
    }
    check(convertActionFile(loadJson('social.actions.json')), 'social.actions.json');
  });
});
