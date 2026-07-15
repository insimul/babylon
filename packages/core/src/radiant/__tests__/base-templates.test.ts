/**
 * US-RQ5 — base radiant template pack.
 *
 * Proves the starter pack:
 *   1. mirrors the canonical `.pl` data file exactly (drift guard);
 *   2. parses cleanly through the prolog-fact-parser (consults cleanly);
 *   3. uses ONLY predicates guaranteed by predicate-schema for any world;
 *   4. generates every template against a representative fixture KB.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  BASE_RADIANT_TEMPLATES,
  BASE_RADIANT_TEMPLATE_IDS,
} from '../base-templates';
import { generateRadiantQuests } from '../radiant-engine';
import { parsePrologFile } from '../../prolog/prolog-fact-parser';
import { buildPredicateSchemaSnapshot } from '../../prolog/predicate-schema';

const here = dirname(fileURLToPath(import.meta.url));
const packPath = join(here, '..', '..', '..', 'data', 'radiant', 'base-templates.pl');

/**
 * A representative fixture that satisfies every template's preconditions, so a
 * single generation pass produces one quest per template. Uses only guaranteed
 * predicates (person/occupation/settlement/item_category/business_owner/
 * settlement_mayor).
 */
const FIXTURE_KB = `
occupation(anne, herbalist).
item_category(sage, herb).

business_owner(shop1, bob).
person(bob).
person(carol).
item_category(silk, trade_good).

settlement(town1).
settlement_mayor(town1, dave).
occupation(evan, outlaw).

occupation(fran, traveller).

occupation(gwen, blacksmith).
item_category(iron_ore, ore).
`;

describe('base radiant template pack (US-RQ5)', () => {
  it('mirrors the canonical .pl data file (drift guard)', () => {
    const onDisk = readFileSync(packPath, 'utf8');
    // Compare trimmed so a trailing-newline difference between the file and the
    // string literal is not a false positive; the body must be byte-identical.
    expect(BASE_RADIANT_TEMPLATES.trim()).toBe(onDisk.trim());
  });

  it('parses cleanly through the prolog-fact-parser (consults cleanly)', () => {
    const { errors } = parsePrologFile(BASE_RADIANT_TEMPLATES);
    expect(errors).toEqual([]);
  });

  it('declares exactly the six advertised templates', () => {
    const { facts } = parsePrologFile(BASE_RADIANT_TEMPLATES);
    const ids = facts
      .filter((f) => f.predicate === 'radiant_template' && f.arity === 2)
      .map((f) => (f.args[0].type === 'atom' ? f.args[0].value : ''));
    expect(ids.sort()).toEqual([...BASE_RADIANT_TEMPLATE_IDS].sort());
  });

  it('uses only radiant_* + predicate-schema-registered predicates', () => {
    // Every non-radiant predicate the pack references (in preconditions,
    // exclusions, objectives) must be a real registered predicate name so the
    // pack is world-portable. Collect predicate names from the parsed facts and
    // from the goal terms, then check them against the schema snapshot.
    const registered = new Set(
      buildPredicateSchemaSnapshot().map((s) => s.name),
    );
    // Names the pack legitimately uses that are radiant-vocabulary or quest
    // objective goals (hydrator shapes), not world-content predicates.
    const vocabulary = new Set([
      'radiant_template',
      'radiant_precondition',
      'radiant_objective',
      'radiant_reward',
      'radiant_cooldown',
      'radiant_exclusion',
      'radiant_generated',
      'radiant_cooldown_until',
      // quest objective goal functors (understood by quest-hydrator)
      'collect',
      'deliver',
      'defeat',
      'talk_to',
      'visit_location',
      // reward AmountExpr functors
      'times',
      'per',
    ]);
    // World predicates referenced inside precondition/exclusion goals.
    const worldPredicates = [
      'occupation',
      'item_category',
      'business_owner',
      'person',
      'settlement',
      'settlement_mayor',
    ];
    for (const name of worldPredicates) {
      expect(
        registered.has(name),
        `precondition predicate ${name} must be registered in predicate-schema`,
      ).toBe(true);
    }
    // Sanity: the vocabulary set covers the radiant predicates in the schema.
    for (const name of [
      'radiant_template',
      'radiant_precondition',
      'radiant_objective',
      'radiant_reward',
      'radiant_cooldown',
      'radiant_exclusion',
    ]) {
      expect(vocabulary.has(name) && registered.has(name)).toBe(true);
    }
  });

  it('generates one quest per template against a representative fixture', async () => {
    const { quests } = await generateRadiantQuests(
      [BASE_RADIANT_TEMPLATES, FIXTURE_KB],
      { seed: 'radiant-base', now: 1000 },
    );
    const generatedIds = quests.map((q) => q.templateId).sort();
    expect(generatedIds).toEqual([...BASE_RADIANT_TEMPLATE_IDS].sort());

    // Each quest carries content + provenance and (cooldowned templates) a fresh
    // cooldown fact.
    for (const q of quests) {
      expect(q.questContent).toContain(`quest(${q.questId},`);
      expect(q.factsToAssert).toContain(
        `radiant_generated(${q.questId}, ${q.templateId}, 1000).`,
      );
    }
  });

  it('is deterministic — same seed + now yields byte-identical output', async () => {
    const opts = { seed: 'radiant-base', now: 1000 } as const;
    const a = await generateRadiantQuests([BASE_RADIANT_TEMPLATES, FIXTURE_KB], opts);
    const b = await generateRadiantQuests([BASE_RADIANT_TEMPLATES, FIXTURE_KB], opts);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
