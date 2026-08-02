/**
 * GameQuestManager — the ported orchestrator (94-quest-manager-interface US-2).
 *
 * The platform copy this was transcribed from had no test of its own, so these
 * pin the behaviours the port could plausibly have broken, in the two places the
 * seam actually changed things:
 *
 *  1. **The seed-source seam** — generation must go through `IQuestSeedSource`
 *     (never a direct generator import), the orchestrator must still do its own
 *     storage reads and its own saving (stamping worldId/assignedTo/language and
 *     attaching Prolog content), and with no source wired it must degrade to
 *     "generates nothing" rather than throw.
 *  2. **Everything that is NOT generation** — completion, streak/bonus XP,
 *     prerequisite unlocking, the onboarding gate and radiant distribution are
 *     pure orchestration and must behave identically with a null seed source.
 */

import { describe, it, expect, vi } from 'vitest';

import { GameQuestManager, type GameQuestManagerConfig } from '../GameQuestManager';
import { GameEventBus } from '../GameEventBus';
import type { QuestStorageProvider } from '../../../quests/quest-storage-provider';
import type {
  Business,
  Character,
  InsertQuest,
  Quest,
  Settlement,
  World,
} from '../../../quests/types';
import {
  NULL_QUEST_SEED_SOURCE,
  type IQuestSeedSource,
} from '../../../quests/quest-seed-source';

// ── A tiny in-memory QuestStorageProvider ────────────────────────────────────

interface FakeWorld {
  world: World;
  quests: Quest[];
  characters: Character[];
  settlements: Settlement[];
  businesses: Business[];
}

function fakeStorage(seed: Partial<FakeWorld> = {}): QuestStorageProvider & { state: FakeWorld } {
  const state: FakeWorld = {
    world: seed.world ?? { id: 'w1' },
    quests: seed.quests ?? [],
    characters: seed.characters ?? [],
    settlements: seed.settlements ?? [],
    businesses: seed.businesses ?? [],
  };
  let nextId = 1;
  const unsupported = () => {
    throw new Error('not used by GameQuestManager');
  };
  return {
    state,
    getQuest: async (id) => state.quests.find((q) => q.id === id),
    // Copies, like a real Mongo/save-file provider: a later updateQuest must not
    // retroactively change a snapshot the caller already read.
    getQuestsByWorld: async () => state.quests.map((q) => ({ ...q })),
    getQuestsByPlayer: async () => state.quests.map((q) => ({ ...q })),
    createQuest: async (data: InsertQuest) => {
      const created: Quest = { ...data, id: `q${nextId++}` };
      state.quests.push(created);
      return created;
    },
    updateQuest: async (id, data) => {
      const quest = state.quests.find((q) => q.id === id);
      if (!quest) return undefined;
      Object.assign(quest, data);
      return quest;
    },
    deleteQuest: async () => true,
    getWorld: async () => state.world,
    getCharacter: async (id) => state.characters.find((c) => c.id === id),
    getCharactersByWorld: async () => [...state.characters],
    getBusinessesByWorld: async () => [...state.businesses],
    getSettlementsByWorld: async () => [...state.settlements],
    getTruthsByWorld: async () => [],
    createCharacter: unsupported,
    updateCharacter: unsupported,
    createTruth: unsupported,
    updateTruth: unsupported,
  };
}

function manager(
  storage: QuestStorageProvider,
  overrides: Partial<GameQuestManagerConfig> = {},
): GameQuestManager {
  return new GameQuestManager({
    storage,
    eventBus: new GameEventBus(),
    worldId: 'w1',
    playerName: 'Ada',
    ...overrides,
  });
}

// ── 1. The seed-source seam ──────────────────────────────────────────────────

describe('GameQuestManager — the IQuestSeedSource seam', () => {
  it('routes generation through the injected source and saves what it returns', async () => {
    const storage = fakeStorage({
      characters: [{ id: 'c1', firstName: 'Rem', lastName: 'Bell' }],
      settlements: [{ id: 's1' }],
    });
    const generateSeedQuests = vi.fn(() => [
      { title: 'Greet the baker', questType: 'dialogue' } as InsertQuest,
    ]);
    const seedSource: IQuestSeedSource = { ...NULL_QUEST_SEED_SOURCE, generateSeedQuests };

    const saved = await manager(storage, { seedSource, targetLanguage: 'Spanish' })
      .generateSeedQuests(['dialogue']);

    // The world snapshot the orchestrator assembled, not one the source fetched.
    expect(generateSeedQuests).toHaveBeenCalledWith({
      world: storage.state.world,
      characters: storage.state.characters,
      settlements: storage.state.settlements,
      onlyTypes: ['dialogue'],
      assignedTo: 'Ada',
    });
    // Saving is the orchestrator's job: it stamps the fields and persists.
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      worldId: 'w1',
      assignedTo: 'Ada',
      targetLanguage: 'Spanish',
      gameType: 'language-learning',
    });
    expect(storage.state.quests).toHaveLength(1);
  });

  it('attaches Prolog content to a generated quest and asserts it into a live engine', async () => {
    const storage = fakeStorage();
    const assertFact = vi.fn(async () => {});
    const seedSource: IQuestSeedSource = {
      ...NULL_QUEST_SEED_SOURCE,
      generateSeedQuests: () => [
        { title: 'Find the Sword', description: 'A blade', questType: 'fetch' } as InsertQuest,
      ],
    };

    const saved = await manager(storage, { seedSource, prologEngine: { assertFact } })
      .generateSeedQuests();

    expect(saved[0].content).toContain('quest(');
    expect(assertFact).toHaveBeenCalledWith(saved[0].content);
  });

  it('awaits an ASYNC source — hosts may generate off-thread', async () => {
    const storage = fakeStorage();
    const seedSource: IQuestSeedSource = {
      ...NULL_QUEST_SEED_SOURCE,
      generateSideQuests: async () => [{ title: 'Deliver bread' } as InsertQuest],
    };

    const saved = await manager(storage, { seedSource }).generateSideQuests(1);

    expect(saved.map((q) => q.title)).toEqual(['Deliver bread']);
  });

  it('degrades instead of crashing when no seed source is wired', async () => {
    const storage = fakeStorage();
    const m = manager(storage);

    await expect(m.generateSeedQuests()).resolves.toEqual([]);
    await expect(m.generateMysteryQuest()).resolves.toBeNull();
    await expect(m.checkDailyReset()).resolves.toEqual({ generated: [], status: undefined });
    await expect(m.getGuildProgress()).resolves.toEqual(new Map());
    expect(storage.state.quests).toEqual([]);
  });
});

// ── 2. Orchestration that does not depend on a seed source ───────────────────

describe('GameQuestManager — completion, unlocking and distribution', () => {
  it('completes a quest with streak bonus XP and emits quest_completed', async () => {
    const storage = fakeStorage({
      quests: [
        { id: 'done1', status: 'completed', assignedTo: 'Ada' },
        { id: 'done2', status: 'completed', assignedTo: 'Ada' },
        { id: 'target', status: 'active', assignedTo: 'Ada', title: 'Buy milk', experienceReward: 100 },
      ],
    });
    const eventBus = new GameEventBus();
    const events: unknown[] = [];
    eventBus.on('quest_completed', (e) => events.push(e));

    const result = await manager(storage, { eventBus }).completeQuest('target');

    // 2 prior completions + this one = streak 3 → min(0.5, 0.3) of 100 XP.
    expect(result).toMatchObject({ streakCount: 3, bonusXP: 30, chainCompletion: null, replenished: [] });
    expect(result!.quest.status).toBe('completed');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'quest_completed', questId: 'target', bonusXP: 30 });
  });

  it('returns null for an unknown quest id', async () => {
    await expect(manager(fakeStorage()).completeQuest('nope')).resolves.toBeNull();
  });

  it('unlocks a quest whose Prolog prerequisite is the completed title, and activates it when quest_activates says so', async () => {
    const storage = fakeStorage({
      quests: [
        {
          id: 'a',
          status: 'completed',
          title: 'The Lost Key',
          content: "quest(the_lost_key, 'The Lost Key').\nquest_activates(the_lost_key, the_locked_door).",
        },
        {
          id: 'b',
          status: 'unavailable',
          content: "quest(the_locked_door, 'The Locked Door').\nquest_prerequisite(the_locked_door, the_lost_key).",
        },
        {
          id: 'c',
          status: 'unavailable',
          content: "quest(the_cellar, 'The Cellar').\nquest_prerequisite(the_cellar, the_lost_key).",
        },
        {
          id: 'd',
          status: 'unavailable',
          content: "quest(elsewhere, 'Elsewhere').\nquest_prerequisite(elsewhere, something_else).",
        },
      ],
    });

    await manager(storage).handleQuestProgression('The Lost Key');

    const byId = Object.fromEntries(storage.state.quests.map((q) => [q.id, q.status]));
    expect(byId).toEqual({ a: 'completed', b: 'active', c: 'available', d: 'unavailable' });
  });

  it('opens the world on The Missing Writer Notice: onboarding flips, guild + npc quests unlock', async () => {
    const storage = fakeStorage({
      characters: [{ id: 'gm', firstName: 'Iris', lastName: 'Vale', occupation: 'smith', isAlive: true }],
      quests: [
        { id: 'notice', status: 'completed', title: 'The Missing Writer Notice' },
        { id: 'guild0', status: 'unavailable', guildTier: 0, guildId: 'smiths' },
        { id: 'npcq', status: 'unavailable', discoveryMethod: 'npc' },
      ],
    });
    const seedSource: IQuestSeedSource = {
      ...NULL_QUEST_SEED_SOURCE,
      createGuildQuestSource: () => ({
        ...NULL_QUEST_SEED_SOURCE.createGuildQuestSource(),
        findGuildMasterNpc: () => ({ id: 'gm', name: 'Iris Vale' }),
      }),
    };
    const m = manager(storage, { seedSource });
    expect(m.onboardingComplete).toBe(false);

    await m.handleQuestProgression('The Missing Writer Notice');

    expect(m.onboardingComplete).toBe(true);
    const guild = storage.state.quests.find((q) => q.id === 'guild0')!;
    expect(guild).toMatchObject({ status: 'available', assignedBy: 'Iris Vale', assignedByCharacterId: 'gm' });
    expect(storage.state.quests.find((q) => q.id === 'npcq')!.status).toBe('available');
  });

  it('checkOnboardingStatus reads the gate back off the completed notice quest', async () => {
    const storage = fakeStorage({
      quests: [{ id: 'n', title: 'The Missing Writer Notice', status: 'completed' }],
    });
    const m = manager(storage);
    await m.checkOnboardingStatus();
    expect(m.onboardingComplete).toBe(true);
  });

  it('distributes a quest to its named giver and leaves notice_board quests on the board', async () => {
    const storage = fakeStorage({
      characters: [
        { id: 'c1', firstName: 'Rem', lastName: 'Bell', occupation: 'baker', isAlive: true },
        { id: 'c2', firstName: 'Odi', lastName: 'Kane', occupation: 'guard', isAlive: true },
      ],
      quests: [
        { id: 'named', status: 'available', assignedBy: 'Rem Bell' },
        { id: 'board', status: 'available', discoveryMethod: 'notice_board' },
        { id: 'loose', status: 'available' },
      ],
    });

    const distributed = await manager(storage).distributeRadiantQuests(5);

    expect(distributed).toBe(2); // the named one, plus 'loose' to a random eligible NPC
    expect(storage.state.quests.find((q) => q.id === 'named')!.assignedByCharacterId).toBe('c1');
    expect(storage.state.quests.find((q) => q.id === 'board')!.assignedByCharacterId).toBeUndefined();
    expect(storage.state.quests.find((q) => q.id === 'loose')!.assignedByCharacterId).toBeTruthy();
  });

  it('builds NPC guidance from the objectives of that NPC\'s active quests', async () => {
    const storage = fakeStorage({
      quests: [
        {
          id: 'q1',
          status: 'active',
          assignedTo: 'Ada',
          assignedByCharacterId: 'npc1',
          title: 'Bread run',
          objectives: [
            { description: 'Buy a baguette', completed: false },
            { description: 'Pay for it', completed: true },
          ],
        },
        { id: 'q2', status: 'active', assignedTo: 'Ada', assignedByCharacterId: 'npc2', objectives: [] },
      ],
    });
    const m = manager(storage);

    const guidance = await m.getNpcQuestGuidance('npc1');
    expect(guidance!.hasGuidance).toBe(true);
    expect(guidance!.systemPromptAddition).toContain('Buy a baguette');
    expect(guidance!.systemPromptAddition).not.toContain('Pay for it');

    await expect(m.getNpcQuestGuidance('npc3')).resolves.toEqual({ hasGuidance: false });
  });

  it('wires quest_completed to progression handling, and dispose() unwires it', async () => {
    const storage = fakeStorage();
    const eventBus = new GameEventBus();
    const m = manager(storage, { eventBus });
    const spy = vi.spyOn(m, 'handleQuestProgression').mockResolvedValue();

    eventBus.emit({ type: 'quest_completed', questId: 'x', questTitle: 'Anything' });
    expect(spy).toHaveBeenCalledWith('Anything');

    m.dispose();
    eventBus.emit({ type: 'quest_completed', questId: 'y', questTitle: 'Later' });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
