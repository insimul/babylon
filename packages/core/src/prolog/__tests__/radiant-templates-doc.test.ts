/**
 * US-RQ1 — radiant template vocabulary: design-doc parse + schema registration.
 *
 * Guards the three worked template examples in
 * `packages/core/docs/radiant-templates.md` against silent drift out of the
 * syntax subset `prolog-fact-parser.ts` supports, and asserts every radiant_*
 * predicate is registered (in the schema snapshot for the stored templates, and
 * in the save-restore validator's known set for the runtime provenance facts).
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { parsePrologFile } from '../prolog-fact-parser';
import { buildPredicateSchemaSnapshot } from '../predicate-schema';
import { buildKnownPredicateSignatures } from '../prolog-fact-validator';

const here = dirname(fileURLToPath(import.meta.url));
const docPath = join(here, '..', '..', '..', 'docs', 'radiant-templates.md');

/** Extract every ```prolog fenced code block from a markdown string. */
function extractPrologBlocks(md: string): string[] {
  const blocks: string[] = [];
  const re = /```prolog\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(md)) !== null) blocks.push(m[1]);
  return blocks;
}

describe('radiant-templates.md worked examples', () => {
  const md = readFileSync(docPath, 'utf8');
  const blocks = extractPrologBlocks(md);

  it('documents the three worked templates (fetch, delivery, bounty)', () => {
    expect(blocks.length).toBe(3);
  });

  it('every worked example parses cleanly through prolog-fact-parser', () => {
    for (const block of blocks) {
      const { errors } = parsePrologFile(block);
      expect(errors).toEqual([]);
    }
  });

  it('the parsed templates expose the expected radiant_* facts', () => {
    const all = blocks.join('\n');
    const { facts } = parsePrologFile(all);
    const sigs = new Set(facts.map((f) => `${f.predicate}/${f.arity}`));
    for (const sig of [
      'radiant_template/2',
      'radiant_precondition/3',
      'radiant_objective/2',
      'radiant_reward/3',
      'radiant_cooldown/2',
      'radiant_exclusion/2',
    ]) {
      expect(sigs.has(sig)).toBe(true);
    }
    // Each template must declare its identifying template fact.
    const templateIds = facts
      .filter((f) => f.predicate === 'radiant_template')
      .map((f) => (f.args[0].type === 'atom' ? f.args[0].value : ''));
    expect(templateIds.sort()).toEqual(['rt_bounty', 'rt_delivery', 'rt_fetch_herbs']);
  });
});

describe('radiant predicate registration', () => {
  it('all radiant_* predicates are in the predicate schema snapshot', () => {
    const snapshot = new Set(
      buildPredicateSchemaSnapshot().map((s) => `${s.name}/${s.arity}`),
    );
    for (const sig of [
      'radiant_template/2',
      'radiant_precondition/3',
      'radiant_objective/2',
      'radiant_reward/3',
      'radiant_cooldown/2',
      'radiant_exclusion/2',
      'radiant_generated/3',
      'radiant_cooldown_until/2',
    ]) {
      expect(snapshot.has(sig)).toBe(true);
    }
  });

  it('runtime provenance/cooldown facts pass the save-restore validator set', () => {
    // These are asserted into save.currentState.prologFacts and must not be
    // dropped on reload — the validator scans helper-predicates.ts dynamics.
    const known = buildKnownPredicateSignatures();
    expect(known.has('radiant_generated/3')).toBe(true);
    expect(known.has('radiant_cooldown_until/2')).toBe(true);
  });
});
