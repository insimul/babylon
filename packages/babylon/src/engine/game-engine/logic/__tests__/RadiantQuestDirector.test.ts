/**
 * US-RQ3 — Babylon runtime integration for radiant quest generation.
 *
 * Headless (no rendering): instantiate GamePrologEngine with a fixture KB, drive
 * the RadiantQuestDirector, and prove the full loop:
 *   tick → quest appears in the quest system → completing its objectives marks it
 *   complete → cooldown/exclusion prevents an immediate duplicate → the generated
 *   quest and its runtime state survive save/load while worldSnapshot is untouched.
 */

import { describe, it, expect } from 'vitest';

import { GamePrologEngine } from '../GamePrologEngine';
import { PlaythroughQuestOverlay } from '../PlaythroughQuestOverlay';
import { RadiantQuestDirector } from '../RadiantQuestDirector';

/**
 * A representative fixture: world facts + one fetch template. Loaded via
 * `consultContent` to mirror the US-RQ5 loader path (worldSnapshot → consult the
 * template pack into the live KB at game start).
 */
const TEMPLATE_PACK = `
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

async function makeEngine(): Promise<GamePrologEngine> {
  const engine = new GamePrologEngine();
  await engine.initialize({
    characters: [],
    settlements: [],
    rules: [],
    actions: [],
    quests: [],
    truths: [],
  });
  await engine.consultContent(TEMPLATE_PACK);
  return engine;
}

describe('RadiantQuestDirector — headless integration', () => {
  it('tick generates a quest that appears in the quest system', async () => {
    const engine = await makeEngine();
    const overlay = new PlaythroughQuestOverlay();
    const hooked: any[] = [];
    const director = new RadiantQuestDirector(
      engine,
      { seed: 'alpha' },
      { overlay, onQuestGenerated: (q) => hooked.push(q) },
    );

    const results = await director.tick(1000);
    expect(results).toHaveLength(1);
    const { generated, quest } = results[0];
    expect(generated.questId).toBe('radiant_rt_fetch_1000');
    expect(generated.templateId).toBe('rt_fetch');

    // Appears in the live KB (queryable quest/5).
    const inKb = await engine.query(
      `quest(${generated.questId}, T, Ty, D, S)`,
    );
    expect(inKb).toHaveLength(1);

    // Hydrated into a Quest object with objectives + rewards.
    expect(quest.title).toMatch(/^Gather Herbs for (anne|bob)$/);
    expect(quest.objectives).toHaveLength(2);
    expect(quest.experienceReward).toBe(25);
    expect(quest.isRadiant).toBe(true);
    expect(quest.radiantTemplateId).toBe('rt_fetch');

    // Registered in the overlay — the data source BabylonQuestTracker reads.
    const created = overlay.serialize().created;
    expect(created[generated.questId]).toBeTruthy();
    expect(created[generated.questId].content).toBe(generated.questContent);

    // onQuestGenerated fired for HUD/completion-engine registration.
    expect(hooked).toHaveLength(1);

    // Provenance + cooldown persisted as player facts (→ save.currentState).
    expect(engine.getPlayerFacts()).toContain(
      'radiant_generated(radiant_rt_fetch_1000, rt_fetch, 1000).',
    );
    expect(engine.getPlayerFacts()).toContain(
      'radiant_cooldown_until(rt_fetch, 4600).',
    );
  });

  it('completing the objectives marks the quest complete', async () => {
    const engine = await makeEngine();
    const director = new RadiantQuestDirector(engine, { seed: 'alpha' });
    const [{ generated }] = await director.tick(1000);

    // Extract the actual slot fills the seed produced.
    const item = generated.questContent.match(/collect\((\w+),/)![1];
    const giver = generated.questContent.match(/deliver\(\w+, (\w+)\)/)![1];

    expect(await engine.isQuestComplete(generated.questId, 'player')).toBe(false);

    // Simulate gameplay: collect enough + deliver to the giver.
    await engine.assertRuntimeFact(`collected(player, ${item}, 5).`);
    await engine.assertRuntimeFact(`delivered(player, ${giver}, ${item}).`);

    expect(await engine.isQuestComplete(generated.questId, 'player')).toBe(true);
  });

  it('cooldown/exclusion prevents an immediate duplicate on the next tick', async () => {
    const engine = await makeEngine();
    const director = new RadiantQuestDirector(engine, { seed: 'alpha' });

    const first = await director.tick(1000);
    expect(first).toHaveLength(1);

    // Next tick well within the 3600s cooldown → no regeneration.
    const second = await director.tick(1001);
    expect(second).toHaveLength(0);
  });

  it('is deterministic — same seed + now yields the same quest id/content', async () => {
    const a = new RadiantQuestDirector(await makeEngine(), { seed: 'alpha' });
    const b = new RadiantQuestDirector(await makeEngine(), { seed: 'alpha' });
    const [ra] = await a.tick(1000);
    const [rb] = await b.tick(1000);
    expect(ra.generated.questContent).toBe(rb.generated.questContent);
  });
});

describe('RadiantQuestDirector — save/load', () => {
  it('generated quest + runtime state survive reload; worldSnapshot byte-identical', async () => {
    // worldSnapshot is read-only world-template data. currentState holds all
    // per-playthrough state.
    const worldSnapshot = {
      worldId: 'w1',
      characters: [{ id: 'c1', firstName: 'Z' }],
      quests: [],
    };
    const worldSnapshotJson = JSON.stringify(worldSnapshot);
    const currentState: {
      prologFacts: string[];
      quests: { progress: Record<string, any>; dynamicQuests: any[] };
    } = { prologFacts: [], quests: { progress: {}, dynamicQuests: [] } };

    // ── Session 1: generate + persist ─────────────────────────────────────
    const engine1 = await makeEngine();
    const overlay1 = new PlaythroughQuestOverlay();
    const director1 = new RadiantQuestDirector(
      engine1,
      { seed: 'alpha' },
      { overlay: overlay1 },
    );
    const [{ generated }] = await director1.tick(1000);

    // Persist ONLY into currentState — never worldSnapshot.
    currentState.prologFacts = engine1.getPlayerFacts();
    const overlayState = overlay1.serialize();
    currentState.quests.dynamicQuests = Object.values(overlayState.created);

    // Invariant: the world snapshot is untouched by generation + persistence.
    expect(JSON.stringify(worldSnapshot)).toBe(worldSnapshotJson);
    // The generated quest is in currentState, not the world.
    expect(currentState.quests.dynamicQuests).toHaveLength(1);
    expect(currentState.prologFacts).toContain(
      'radiant_generated(radiant_rt_fetch_1000, rt_fetch, 1000).',
    );

    // ── Session 2: reload ─────────────────────────────────────────────────
    const engine2 = await makeEngine();
    const overlay2 = new PlaythroughQuestOverlay();
    overlay2.deserialize(overlayState);
    const director2 = new RadiantQuestDirector(
      engine2,
      { seed: 'alpha' },
      { overlay: overlay2 },
    );

    // Restore runtime facts (radiant_generated + radiant_cooldown_until must be
    // registered signatures, or the validator drops them — US-RQ1).
    const { droppedFacts } = await engine2.restorePlayerFacts(
      currentState.prologFacts,
    );
    expect(droppedFacts).toEqual([]);

    // Re-consult saved quest content (regenerable, persisted via the overlay).
    await director2.restoreGeneratedQuests(currentState.quests.dynamicQuests);

    // The generated quest survives the round-trip.
    const inKb = await engine2.query(
      `quest(${generated.questId}, T, Ty, D, S)`,
    );
    expect(inKb).toHaveLength(1);

    // Its completion loop still works after reload.
    const item = generated.questContent.match(/collect\((\w+),/)![1];
    const giver = generated.questContent.match(/deliver\(\w+, (\w+)\)/)![1];
    await engine2.assertRuntimeFact(`collected(player, ${item}, 5).`);
    await engine2.assertRuntimeFact(`delivered(player, ${giver}, ${item}).`);
    expect(await engine2.isQuestComplete(generated.questId, 'player')).toBe(true);

    // Cooldown/provenance survived → an immediate regen tick is still suppressed.
    const regen = await director2.tick(1001);
    expect(regen).toHaveLength(0);
  });
});
