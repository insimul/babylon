/**
 * US-RQ4 — radiant generation conformance corpus runner.
 *
 * Executes every JSON case under `packages/core/conformance/radiant/*.json`
 * against `generateRadiantQuests` (the TS radiant engine) and asserts the
 * generated quests equal the case's `expected`. These same JSON files are the
 * contract the future native `libinsimul` `insimul_radiant_tick()` MUST match —
 * see `conformance/README.md` (§ "Radiant case format") for the shape.
 *
 * Determinism note: the engine sorts candidate fills canonically and picks one
 * with a seeded RNG, and processes templates in sorted TplId order, so a case's
 * `(kb, templates, seed, now)` pins an exact output. Quest content clauses and
 * fact lists are compared as sorted arrays (a conforming engine may emit clauses
 * in any order); the quest list order is the deterministic sorted-TplId order.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { generateRadiantQuests } from '../../radiant/radiant-engine';

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(here, '..', '..', '..', 'conformance', 'radiant');

interface ExpectedQuest {
  questId: string;
  templateId: string;
  /** Quest content clauses, order-independent (sorted for comparison). */
  content: string[];
  /** `radiant_*` facts to assert, order-independent (sorted). */
  factsToAssert: string[];
  /** Stale facts to retract, order-independent (sorted). */
  factsToRetract: string[];
}

interface RadiantCase {
  name: string;
  kb: string[];
  templates: string[];
  seed: string | number;
  now: number;
  maxQuests?: number;
  expected: { quests: ExpectedQuest[] };
}

interface CaseFile {
  area: string;
  description: string;
  cases: RadiantCase[];
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

/** Split quest content into individual clause lines, sorted for comparison. */
function normContent(content: string): string[] {
  return content
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .sort();
}

/** Run a case and reduce the engine output to the comparable expected shape. */
async function runCase(c: RadiantCase): Promise<ExpectedQuest[]> {
  const program = [...c.kb, ...c.templates].join('\n');
  const result = await generateRadiantQuests(program, {
    seed: c.seed,
    now: c.now,
    maxQuests: c.maxQuests,
  });
  return result.quests.map((q) => ({
    questId: q.questId,
    templateId: q.templateId,
    content: normContent(q.questContent),
    factsToAssert: [...q.factsToAssert].sort(),
    factsToRetract: [...q.factsToRetract].sort(),
  }));
}

/** Normalize the expected quests the same way (sort the order-independent lists). */
function normExpected(quests: ExpectedQuest[]): ExpectedQuest[] {
  return quests.map((q) => ({
    questId: q.questId,
    templateId: q.templateId,
    content: [...q.content].sort(),
    factsToAssert: [...q.factsToAssert].sort(),
    factsToRetract: [...q.factsToRetract].sort(),
  }));
}

const corpus = loadCorpus();

describe('Radiant conformance corpus', () => {
  it('loads at least 8 cases covering the required scenarios', () => {
    const total = corpus.reduce((n, { data }) => n + data.cases.length, 0);
    expect(total).toBeGreaterThanOrEqual(8);

    const areas = new Set(corpus.map(({ data }) => data.area));
    for (const required of [
      'radiant-single-slot',
      'radiant-multi-slot',
      'radiant-exclusion-cooldown',
      'radiant-empty',
      'radiant-maxquests',
    ]) {
      expect(areas, `missing area file for "${required}"`).toContain(required);
    }
  });

  it('has a globally unique name per case', () => {
    const names = corpus.flatMap(({ data }) => data.cases.map((c) => c.name));
    expect(new Set(names).size).toBe(names.length);
  });

  for (const { file, data } of corpus) {
    describe(`${file} (${data.area})`, () => {
      it.each(data.cases.map((c) => [c.name, c] as const))(
        'case %s',
        async (_name, c) => {
          const actual = await runCase(c);
          expect(actual).toEqual(normExpected(c.expected.quests));
        },
      );
    });
  }
});
