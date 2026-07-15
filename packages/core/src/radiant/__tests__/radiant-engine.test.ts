/**
 * US-RQ2 — radiant slot-filling engine.
 *
 * Proves the determinism/skip/cooldown/exclusion contract and that generated
 * quest content round-trips through `quest-hydrator.ts` into a live Quest.
 */

import { describe, expect, it } from 'vitest';

import {
  generateRadiantQuests,
  type RadiantGenerationResult,
} from '../radiant-engine';
import { hydrateQuestFromProlog } from '../../prolog/quest-hydrator';

/** World facts + one fetch template (2 givers × 2 items = 4 candidate fills). */
const FETCH_KB = `
:- dynamic(radiant_generated/3).
:- dynamic(radiant_cooldown_until/2).

character_occupation(anne, herbalist).
character_occupation(bob, herbalist).
item_category(sage, herb).
item_category(mint, herb).

radiant_template(rt_fetch, [category(fetch), title('Gather Herbs for {giver}'), quest_type(gathering), difficulty(2)]).
radiant_precondition(rt_fetch, giver, character_occupation(Giver, herbalist)).
radiant_precondition(rt_fetch, item, item_category(Item, herb)).
radiant_objective(rt_fetch, collect(Item, 5)).
radiant_objective(rt_fetch, deliver(Item, Giver)).
radiant_reward(rt_fetch, gold, times(20, difficulty)).
radiant_reward(rt_fetch, experience, 25).
radiant_cooldown(rt_fetch, 3600).
radiant_exclusion(rt_fetch, radiant_generated(_, rt_fetch, _)).
`;

/** A delivery template needing a recipient that differs from the giver (join). */
const DELIVERY_KB = `
:- dynamic(radiant_generated/3).
:- dynamic(radiant_cooldown_until/2).
:- dynamic(quest_active/2).

business_owner(anne, bakery).
business_owner(bob, forge).
person(anne).
person(bob).
person(cara).
item_category(bread, trade_good).

radiant_template(rt_delivery, [category(delivery), title('Deliver to {recipient}'), quest_type(delivery), difficulty(1)]).
radiant_precondition(rt_delivery, giver, business_owner(Giver, _Shop)).
radiant_precondition(rt_delivery, item, item_category(Item, trade_good)).
radiant_precondition(rt_delivery, recipient, (person(Recipient), Recipient \\= Giver)).
radiant_objective(rt_delivery, deliver(Item, Recipient)).
radiant_reward(rt_delivery, gold, per(item, 5)).
radiant_cooldown(rt_delivery, 1800).
radiant_exclusion(rt_delivery, quest_active(_, rt_delivery)).
`;

describe('generateRadiantQuests — determinism', () => {
  it('same KB + seed + now → byte-identical output', async () => {
    const a = await generateRadiantQuests(FETCH_KB, { seed: 'alpha', now: 1000 });
    const b = await generateRadiantQuests(FETCH_KB, { seed: 'alpha', now: 1000 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.quests).toHaveLength(1);
  });

  it('numeric and string seeds both drive a stable pick', async () => {
    const a = await generateRadiantQuests(FETCH_KB, { seed: 42, now: 1000 });
    const b = await generateRadiantQuests(FETCH_KB, { seed: 42, now: 1000 });
    expect(a.quests[0].questContent).toBe(b.quests[0].questContent);
  });

  it('emits provenance + cooldown facts and a deterministic quest id', async () => {
    const { quests } = await generateRadiantQuests(FETCH_KB, { seed: 'alpha', now: 1000 });
    const q = quests[0];
    expect(q.questId).toBe('radiant_rt_fetch_1000');
    expect(q.templateId).toBe('rt_fetch');
    expect(q.factsToAssert).toContain('radiant_generated(radiant_rt_fetch_1000, rt_fetch, 1000).');
    expect(q.factsToAssert).toContain('radiant_cooldown_until(rt_fetch, 4600).');
    expect(q.factsToRetract).toEqual([]);
  });
});

describe('generateRadiantQuests — skip conditions', () => {
  it('unsatisfiable precondition → template skipped', async () => {
    const kb = `
character_occupation(anne, herbalist).
radiant_template(rt_x, [category(fetch), title('x'), quest_type(gathering), difficulty(1)]).
radiant_precondition(rt_x, giver, character_occupation(Giver, herbalist)).
radiant_precondition(rt_x, item, item_category(Item, herb)).
radiant_objective(rt_x, collect(Item, 1)).
`;
    const { quests } = await generateRadiantQuests(kb, { seed: 's', now: 0 });
    expect(quests).toHaveLength(0);
  });

  it('active cooldown suppresses regeneration', async () => {
    const kb = FETCH_KB + '\nradiant_cooldown_until(rt_fetch, 5000).\n';
    const early = await generateRadiantQuests(kb, { seed: 's', now: 1000 });
    expect(early.quests).toHaveLength(0); // now < 5000 → still cooling down

    const late = await generateRadiantQuests(kb, { seed: 's', now: 6000 });
    expect(late.quests).toHaveLength(1); // cooldown elapsed
    // the stale cooldown fact is scheduled for retraction before the new one
    expect(late.quests[0].factsToRetract).toContain('radiant_cooldown_until(rt_fetch, 5000).');
    expect(late.quests[0].factsToAssert).toContain('radiant_cooldown_until(rt_fetch, 9600).');
  });

  it('exclusion goal suppresses duplicates', async () => {
    const kb = FETCH_KB + '\nradiant_generated(radiant_rt_fetch_0, rt_fetch, 0).\n';
    const { quests } = await generateRadiantQuests(kb, { seed: 's', now: 1000 });
    expect(quests).toHaveLength(0);
  });

  it('maxQuests caps the number generated across templates', async () => {
    const kb = FETCH_KB + '\n' + DELIVERY_KB;
    const all = await generateRadiantQuests(kb, { seed: 's', now: 0 });
    expect(all.quests.length).toBeGreaterThanOrEqual(2);
    const capped = await generateRadiantQuests(kb, { seed: 's', now: 0, maxQuests: 1 });
    expect(capped.quests).toHaveLength(1);
  });
});

describe('generateRadiantQuests — instantiation', () => {
  it('multi-slot join binds recipient distinct from giver', async () => {
    const { quests } = await generateRadiantQuests(DELIVERY_KB, { seed: 'j', now: 0 });
    expect(quests).toHaveLength(1);
    const content = quests[0].questContent;
    // deliver(Item, Recipient) — recipient must be a real person atom, not the giver var.
    const m = content.match(/deliver\((\w+), (\w+)\)/);
    expect(m).not.toBeNull();
    const recipient = m![2];
    expect(['anne', 'bob', 'cara']).toContain(recipient);
    // per(item, 5) with no numeric count on the deliver objective → 5 × 1 = 5.
    expect(content).toMatch(/quest_reward\(\w+, gold, 5\)\./);
  });

  it('reward times(Base, difficulty) resolves against template difficulty', async () => {
    const { quests } = await generateRadiantQuests(FETCH_KB, { seed: 'alpha', now: 1000 });
    // difficulty(2) × 20 = 40
    expect(quests[0].questContent).toMatch(/quest_reward\(radiant_rt_fetch_1000, gold, 40\)\./);
    expect(quests[0].questContent).toMatch(/quest_reward\(radiant_rt_fetch_1000, experience, 25\)\./);
  });
});

describe('generateRadiantQuests — quest-hydrator round-trip', () => {
  function hydrate(result: RadiantGenerationResult) {
    return hydrateQuestFromProlog({ content: result.quests[0].questContent });
  }

  it('generated content hydrates into a Quest with objectives and rewards', async () => {
    const result = await generateRadiantQuests(FETCH_KB, { seed: 'alpha', now: 1000 });
    const quest = hydrate(result);

    expect(quest.title).toMatch(/^Gather Herbs for (anne|bob)$/);
    expect(quest.questType).toBe('gathering');
    expect(quest.difficulty).toBe('2');
    expect(quest.status).toBe('available');

    expect(quest.objectives).toHaveLength(2);
    const [collect, deliver] = quest.objectives;
    expect(collect.type).toBe('collect_item');
    expect(collect.requiredCount).toBe(5);
    expect(deliver.type).toBe('deliver_item');

    // rewards: experience hoisted to experienceReward, gold into rewards map.
    expect(quest.experienceReward).toBe(25);
    expect(quest.rewards.gold).toBe(40);
  });
});
