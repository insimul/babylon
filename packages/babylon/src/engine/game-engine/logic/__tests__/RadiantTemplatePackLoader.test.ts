/**
 * US-RQ5 — base template pack loader path.
 *
 * Proves the loader seam end to end: a world snapshot that carries a radiant
 * template pack (here `@insimul/core`'s BASE_RADIANT_TEMPLATES) gets it consulted
 * into the live KB at game start via `GamePrologEngine.initialize({
 * radiantTemplates })` — exactly like the base rule packs — and the
 * RadiantQuestDirector (US-RQ3) then generates quests against it.
 *
 * Headless: no rendering. This is the US-RQ3 integration harness driven with the
 * shipped base pack rather than an inline fixture template.
 */

import { describe, it, expect } from 'vitest';

import { BASE_RADIANT_TEMPLATES } from '@insimul/core';
import { GamePrologEngine } from '../GamePrologEngine';
import { PlaythroughQuestOverlay } from '../PlaythroughQuestOverlay';
import { RadiantQuestDirector } from '../RadiantQuestDirector';

/**
 * Build an engine whose world snapshot carries the base template pack via the
 * `radiantTemplates` loader field. World facts (persons/occupations/settlements)
 * come from `characters`/`settlements`; the item facts the fetch template needs
 * ride in as pre-generated `content` (a world export's Prolog blob).
 */
async function makeEngineWithPack(): Promise<GamePrologEngine> {
  const engine = new GamePrologEngine();
  await engine.initialize({
    characters: [{ id: 'c1', firstName: 'Anne', lastName: 'Herb', occupation: 'herbalist' }],
    settlements: [{ id: 's1', name: 'town1' }],
    rules: [],
    actions: [],
    quests: [],
    truths: [],
    content: 'item_category(sage, herb).\nitem_category(mint, herb).',
    radiantTemplates: BASE_RADIANT_TEMPLATES,
  });
  return engine;
}

describe('RadiantQuestDirector — base template pack loader (US-RQ5)', () => {
  it('a world snapshot carrying the pack produces radiant quests', async () => {
    const engine = await makeEngineWithPack();
    const overlay = new PlaythroughQuestOverlay();
    const director = new RadiantQuestDirector(engine, { seed: 'alpha' }, { overlay });

    const results = await director.tick(1000);

    // The satisfiable templates in the base pack fire: rt_fetch (herbalist + herb)
    // and rt_visit (settlement). The unsatisfiable ones (delivery/bounty/escort/
    // gather need business_owner/outlaw/traveller/blacksmith facts) are skipped.
    const templateIds = results.map((r) => r.generated.templateId).sort();
    expect(templateIds).toEqual(['rt_fetch', 'rt_visit']);

    // Each generated quest is queryable in the live KB and registered in the
    // overlay (→ save.currentState.quests).
    const created = overlay.serialize().created;
    for (const { generated, quest } of results) {
      const inKb = await engine.query(`quest(${generated.questId}, T, Ty, D, S)`);
      expect(inKb).toHaveLength(1);
      expect(created[generated.questId]).toBeTruthy();
      expect(quest.isRadiant).toBe(true);
    }
  });

  it('the loaded fetch template completes through the shared objective helpers', async () => {
    const engine = await makeEngineWithPack();
    const director = new RadiantQuestDirector(engine, { seed: 'alpha' });
    const results = await director.tick(1000);

    const fetch = results.find((r) => r.generated.templateId === 'rt_fetch')!;
    expect(fetch).toBeTruthy();
    const { generated } = fetch;

    const item = generated.questContent.match(/collect\((\w+),/)![1];
    const giver = generated.questContent.match(/deliver\(\w+, (\w+)\)/)![1];

    expect(await engine.isQuestComplete(generated.questId, 'player')).toBe(false);
    await engine.assertRuntimeFact(`collected(player, ${item}, 5).`);
    await engine.assertRuntimeFact(`delivered(player, ${giver}, ${item}).`);
    expect(await engine.isQuestComplete(generated.questId, 'player')).toBe(true);
  });

  it('template pack facts stay out of the save (consulted, not player facts)', async () => {
    const engine = await makeEngineWithPack();
    // Before any generation, no radiant_* runtime facts exist in the player-fact
    // set — the pack is stored world-layer data, consulted not asserted.
    expect(engine.getPlayerFacts().some((f) => f.startsWith('radiant_template'))).toBe(false);
    expect(engine.getPlayerFacts().some((f) => f.startsWith('radiant_precondition'))).toBe(false);
  });
});
