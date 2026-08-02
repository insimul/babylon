/**
 * The no-op quest seed source (94-quest-manager-interface US-1).
 *
 * The point of `NULL_QUEST_SEED_SOURCE` is that a host which has not wired a
 * seed source still constructs and runs, so what is asserted here is exactly
 * that: every method of `IQuestSeedSource` is implemented (a missing one would
 * be a `TypeError` at the first trigger, not a compile error at the call site
 * that matters), and every one returns the empty answer rather than throwing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  NULL_QUEST_CHAIN_SOURCE,
  NULL_QUEST_GUILD_SOURCE,
  NULL_QUEST_SEED_SOURCE,
  type IQuestSeedSource,
} from '../quest-seed-source';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = join(HERE, '..', 'quest-seed-source.ts');

/** Method names declared on `IQuestSeedSource`, read off the declaration itself. */
function declaredMethods(): string[] {
  const src = readFileSync(SOURCE, 'utf8');
  const body = src.slice(src.indexOf('export interface IQuestSeedSource {'));
  return Array.from(body.matchAll(/^ {2}(\w+)\(/gm)).map((m) => m[1]);
}

describe('NULL_QUEST_SEED_SOURCE', () => {
  it('implements every method IQuestSeedSource declares', () => {
    const methods = declaredMethods();
    // Guards the guard: the regex must actually have found the interface body.
    expect(methods.length).toBeGreaterThan(15);

    const missing = methods.filter(
      (name) => typeof (NULL_QUEST_SEED_SOURCE as unknown as Record<string, unknown>)[name] !==
        'function',
    );
    expect(
      missing,
      `NULL_QUEST_SEED_SOURCE is missing these IQuestSeedSource methods, so a host ` +
        `without a seed source would crash on the first trigger:\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
  });

  it('generates nothing instead of throwing', async () => {
    const s: IQuestSeedSource = NULL_QUEST_SEED_SOURCE;
    const ctx = { world: {} as never, characters: [], settlements: [], existingQuests: [] };
    const player = { world: {} as never, characters: [], targetLanguage: 'French', playerName: 'P' };

    expect(await s.generateSeedQuests({ ...ctx, assignedTo: 'P' })).toEqual([]);
    expect(await s.assignQuests(ctx, { count: 3 })).toEqual([]);
    expect(await s.generateBusinessRoleplayQuests({ ...player, businesses: [] })).toEqual([]);
    expect(await s.generateEmergencyQuests({ ...player, businesses: [] })).toEqual([]);
    expect(await s.generateReadingQuests({ ...player, texts: [] })).toEqual([]);
    expect(await s.generateSideQuests({ ...player, settlements: [] })).toEqual([]);
    expect(await s.generateFetchQuests({ ...player, settlements: [] })).toEqual([]);
    expect(await s.generateMultiNpcQuests({ ...player, businesses: [] })).toEqual([]);
    expect(await s.generateShoppingQuests({ ...player, businesses: [] })).toEqual([]);
    expect(await s.generateCraftingQuests({ ...player, craftableItems: [] })).toEqual([]);
    expect(await s.generateNumberPracticeQuests({ ...player, businesses: [] })).toEqual([]);
    expect(
      await s.generateWeatherTimeQuests({
        ...ctx,
        schedule: { currentHour: 8, timeOfDay: 'day' },
        targetLanguage: 'French',
        playerName: 'P',
      }),
    ).toEqual([]);
    expect(
      await s.generateErrorCorrectionQuests(ctx, {}, { playerName: 'P', targetLanguage: 'French' }),
    ).toEqual([]);
    expect(
      await s.generateAdaptiveQuests(ctx, {}, { playerName: 'P', targetLanguage: 'French' }),
    ).toEqual([]);
    expect(await s.generateRecurringQuests(ctx, 'P', 'daily', async () => undefined, {
      dailyQuestCount: 3,
    })).toEqual([]);
  });

  it('has nothing to reason about: no mystery, no replenishment, no active quests', async () => {
    const s: IQuestSeedSource = NULL_QUEST_SEED_SOURCE;
    const storage = {} as never;

    expect(await s.generateMysteryQuest(storage, 'w1')).toBeNull();
    expect(
      await s.checkAndReplenishQuests(
        [],
        { world: {} as never, characters: [], settlements: [], existingQuests: [] },
        'P',
        { minActiveQuests: 3, replenishCount: 3 },
        async () => ({ id: 'q1' }),
      ),
    ).toEqual({ generatedQuests: [] });
    expect(s.countActiveQuests([], 'P', 'w1')).toBe(0);
    expect(await s.getRecurringQuestStatus([], 'P', 'w1', async () => undefined)).toBeUndefined();
  });

  it('hands out the null guild and chain sub-capabilities', async () => {
    const s: IQuestSeedSource = NULL_QUEST_SEED_SOURCE;

    const guild = s.createGuildQuestSource();
    expect(guild).toBe(NULL_QUEST_GUILD_SOURCE);
    expect(guild.findGuildMasterNpc('merchants', [])).toBeNull();
    expect(guild.receiveNextQuest('merchants', [])).toBeNull();
    expect(guild.getAllGuildProgress([]).size).toBe(0);

    const chain = s.createQuestChainSource({} as never);
    expect(chain).toBe(NULL_QUEST_CHAIN_SOURCE);
    expect(await chain.checkChainCompletion({ id: 'q1' })).toBeNull();
    expect(await chain.getNextQuestInChain({ id: 'q1' })).toBeNull();
  });
});
