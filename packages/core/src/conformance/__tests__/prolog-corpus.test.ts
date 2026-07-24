/**
 * US-CE5 — golden Prolog query corpus runner.
 *
 * Executes every JSON case under `packages/core/conformance/prolog/*.json`
 * against the tau-prolog engine and asserts the produced solution set equals
 * the case's `expected` (compared as an unordered multiset). These same JSON
 * files are the future parity gate for libinsimul (native Prolog) — see
 * `conformance/README.md` for the case format.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { TauPrologEngine } from '../../prolog/tau-engine';

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(here, '..', '..', '..', 'conformance', 'prolog');

type Binding = Record<string, string | number | boolean | null>;

interface Case {
  name: string;
  kb: string[];
  query: string;
  expected: Binding[];
}

interface CaseFile {
  area: string;
  description: string;
  cases: Case[];
}

function loadCorpus(): Array<{ file: string; data: CaseFile }> {
  return readdirSync(corpusDir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((file) => ({
      file,
      data: JSON.parse(readFileSync(join(corpusDir, file), 'utf8')) as CaseFile,
    }));
}

/** Canonicalize a binding to a stable string (keys sorted) for set comparison. */
function canon(b: Binding): string {
  const keys = Object.keys(b).sort();
  return JSON.stringify(keys.map((k) => [k, b[k]]));
}

/** Compare two solution lists as unordered multisets. */
function sameSolutionSet(actual: Binding[], expected: Binding[]): boolean {
  if (actual.length !== expected.length) return false;
  const a = actual.map(canon).sort();
  const e = expected.map(canon).sort();
  return a.every((v, i) => v === e[i]);
}

async function runCase(c: Case): Promise<Binding[]> {
  const engine = new TauPrologEngine();
  const consulted = await engine.consult(c.kb.join('\n'));
  if (!consulted.success) {
    throw new Error(`consult failed for "${c.name}": ${consulted.error}`);
  }
  const result = await engine.query(c.query);
  if (!result.success) {
    throw new Error(`query failed for "${c.name}": ${result.error}`);
  }
  return result.bindings;
}

const corpus = loadCorpus();

describe('Prolog conformance corpus', () => {
  it('loads at least 25 cases across the required semantic areas', () => {
    const total = corpus.reduce((n, { data }) => n + data.cases.length, 0);
    expect(total).toBeGreaterThanOrEqual(25);

    const areas = new Set(corpus.map(({ data }) => data.area));
    for (const required of [
      'unification',
      'backtracking',
      'lists',
      'negation-as-failure',
      'arithmetic',
      'assert-retract',
      'gameplay-predicates',
      'kinp-identity',
      'kinp-equivalence',
    ]) {
      expect(areas, `missing area file for "${required}"`).toContain(required);
    }
  });

  for (const { file, data } of corpus) {
    describe(`${file} (${data.area})`, () => {
      it('has a unique name per case', () => {
        const names = data.cases.map((c) => c.name);
        expect(new Set(names).size).toBe(names.length);
      });

      it.each(data.cases.map((c) => [c.name, c] as const))(
        'case %s',
        async (_name, c) => {
          const actual = await runCase(c);
          expect(
            sameSolutionSet(actual, c.expected),
            `expected ${JSON.stringify(c.expected)} but got ${JSON.stringify(actual)}`,
          ).toBe(true);
        },
      );
    });
  }
});
