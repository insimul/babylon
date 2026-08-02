/**
 * GameQuestManager — Client-side quest generation orchestrator.
 *
 * Replaces server API calls for quest generation, completion, and lifecycle
 * management. All quest generators are called through {@link IQuestSeedSource},
 * with results persisted via {@link QuestStorageProvider} (SaveGameQuestStorage
 * for standalone games, MongoQuestStorage for the in-app game).
 *
 * Key responsibilities:
 *   - Generate quests from all 17+ generators on demand or via triggers
 *   - Complete quests with bonus XP, streak, and chain completion
 *   - Auto-replenish quest pool when it runs low (depletion monitoring)
 *   - Manage daily/recurring quest rotation
 *   - Manage guild quest progression
 *   - Wire into GameEventBus for automatic triggers
 *
 * ── Why this file is in core (US-2 of 94-quest-manager-interface) ────────────
 *
 * This orchestrator used to live in the CLOSED authoring platform
 * (`insimul-platform/shared/game-engine/logic/GameQuestManager.ts`) and the open
 * runtime carried only a `.d.ts` type surface for it, because it imported the
 * seventeen quest generators directly and those are authoring content that must
 * not be vendored into an open repo (`docs/PLATFORM_SPLIT_AND_ENGINE_PLUGINS.md`
 * §A0). Driving generators is runtime work, so §A0's remedy was to invert the
 * dependency: the capability is declared as {@link IQuestSeedSource} in
 * `quests/quest-seed-source.ts`, the orchestrator moved here, and the closed
 * platform hands its generators in through `GameQuestManagerConfig.seedSource`.
 *
 * The body below is a transcription of the platform implementation, not a
 * rewrite. The only deliberate differences are the ones the seam forces:
 *
 *  1. Every `generateX(...)` free-function call became `this.seeds.generateX(...)`
 *     and is `await`ed, because a host's generator may be async
 *     ({@link IQuestSeedSource} returns `MaybePromise`). The platform's
 *     generators are synchronous, and awaiting a non-promise only defers to a
 *     microtask, so ordering within each method is unchanged.
 *  2. `new GuildQuestManager()` / `new QuestChainManager(storage)` became
 *     `seeds.createGuildQuestSource()` / `seeds.createQuestChainSource(storage)`.
 *  3. `GamePrologEngine` (Babylon-side) is taken structurally as
 *     {@link QuestPrologSink} — core calls exactly one method on it.
 *  4. Core's `Quest`/`Character` are the loose structural types from
 *     `quests/types`, so a few field reads the platform got from its Drizzle
 *     schema need a cast here (see {@link QuestGiverFields}). No read changed.
 *  5. With no seed source wired the manager falls back to
 *     {@link NULL_QUEST_SEED_SOURCE}: generation returns nothing rather than
 *     throwing, so an engine adapter that has not supplied one still runs.
 */

import type { GameEventBus } from './GameEventBus';
import type { QuestStorageProvider } from '../../quests/quest-storage-provider';
import type {
  Character,
  InsertQuest,
  Quest,
  Settlement,
  World,
} from '../../quests/types';
import { convertQuestToProlog } from '../../prolog/quest-converter';
import {
  NULL_QUEST_SEED_SOURCE,
  type IQuestChainSource,
  type IQuestGuildSource,
  type IQuestSeedSource,
  type QuestAssignmentOptions,
  type QuestChainCompletionResult,
  type QuestSeedWorldContext,
} from '../../quests/quest-seed-source';

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * The one thing the orchestrator asks of a live Prolog engine: assert the
 * generated quest's Prolog content so queries see it this session.
 *
 * Structural on purpose — Babylon's `GamePrologEngine` (which lives in
 * `@insimul/babylon`, class (c) of the logic-boundary classification) satisfies
 * it as-is, and core never learns the engine type.
 */
export interface QuestPrologSink {
  assertFact(fact: string, source?: string): Promise<void>;
}

export interface GameQuestManagerConfig {
  storage: QuestStorageProvider;
  eventBus: GameEventBus;
  /**
   * Where generated quest content comes from. Defaults to
   * {@link NULL_QUEST_SEED_SOURCE} — a host that has not wired one gets a
   * manager that completes, unlocks and distributes the quests its world export
   * already carries, and generates no new ones.
   */
  seedSource?: IQuestSeedSource;
  prologEngine?: QuestPrologSink | null;
  worldId: string;
  playerName: string;
  playerCharacterId?: string;
  targetLanguage?: string;
}

/**
 * Result of finishing the last quest of a chain.
 *
 * Alias kept for the name the pre-US-2 `.d.ts` type surface exported; the
 * canonical spelling is {@link QuestChainCompletionResult}.
 */
export type ChainCompletionResult = QuestChainCompletionResult;

export interface QuestCompletionResult {
  quest: Quest;
  bonusXP: number;
  streakCount: number;
  chainCompletion: ChainCompletionResult | null;
  replenished: Quest[];
}

/**
 * Character fields this orchestrator reads. Core's `Character` is `{ id }` plus
 * an index signature (the platform's Drizzle-typed Character stays assignable to
 * it), so the platform's `c.firstName` reads become one cast at the top of each
 * method rather than a cast per property.
 */
interface QuestGiverFields {
  firstName?: string | null;
  lastName?: string | null;
  isAlive?: boolean | null;
  occupation?: string | null;
}

type QuestGiverCharacter = Character & QuestGiverFields;

/** What {@link GameQuestManager._buildSeedContext} assembles for seed generation. */
interface SeedContext {
  world: World;
  characters: Character[];
  settlements: Settlement[];
}

// ── Manager ──────────────────────────────────────────────────────────────────

export class GameQuestManager {
  private storage: QuestStorageProvider;
  private eventBus: GameEventBus;
  private seeds: IQuestSeedSource;
  private prologEngine: QuestPrologSink | null;
  private worldId: string;
  private playerName: string;
  private playerCharacterId?: string;
  private targetLanguage: string;
  private guildManager: IQuestGuildSource;
  private chainManager: IQuestChainSource;
  private _eventUnsubscribers: Array<() => void> = [];
  /** Whether the player has completed onboarding (Arrival Assessment + The Missing Writer Notice). */
  private _onboardingComplete = false;

  constructor(config: GameQuestManagerConfig) {
    this.storage = config.storage;
    this.eventBus = config.eventBus;
    this.seeds = config.seedSource ?? NULL_QUEST_SEED_SOURCE;
    this.prologEngine = config.prologEngine ?? null;
    this.worldId = config.worldId;
    this.playerName = config.playerName;
    this.playerCharacterId = config.playerCharacterId;
    this.targetLanguage = config.targetLanguage ?? 'French';
    this.guildManager = this.seeds.createGuildQuestSource();
    this.chainManager = this.seeds.createQuestChainSource(config.storage);

    this._wireEventBus();
  }

  // ── Onboarding Gate ──────────────────────────────────────────────────────

  /** Check existing quest states to determine if onboarding is already complete. */
  async checkOnboardingStatus(): Promise<void> {
    const quests = await this.storage.getQuestsByWorld(this.worldId);
    const hasCompletedNoticeBoard = quests.some(
      q => q.title === 'The Missing Writer Notice' && q.status === 'completed',
    );
    this._onboardingComplete = hasCompletedNoticeBoard;
  }

  /** Whether auto-quest-generation and radiant distribution are enabled. */
  get onboardingComplete(): boolean {
    return this._onboardingComplete;
  }

  /**
   * Handle quest-completion-based unlocks. Scans all unavailable quests
   * for those whose Prolog prerequisite matches the completed quest's atom,
   * and promotes them based on their discovery method:
   *   - chain → available (auto-offered as next main quest)
   *   - notice_board → available (appears on notice board)
   *   - npc → available (distributed to NPCs via radiant system)
   *   - guild → available (offered by guild master)
   *
   * Also handles onboarding gate:
   *   - The Missing Writer Notice completion enables guild tier-0 quests, NPC quests,
   *     and activates the radiant distribution system.
   */
  async handleQuestProgression(completedQuestTitle: string): Promise<void> {
    const quests = await this.storage.getQuestsByWorld(this.worldId);

    // Derive the Prolog atom for the completed quest title
    const completedAtom = completedQuestTitle
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

    // Find the completed quest to check for quest_activates directives
    const completedQuest = quests.find(q =>
      q.status === 'completed' && q.title === completedQuestTitle
    );

    // Parse quest_activates atoms from the completed quest's Prolog content
    const activatesAtoms = new Set<string>();
    if (completedQuest) {
      const content = (completedQuest as any).content as string || '';
      const activatesPattern = /quest_activates\(\s*\w+\s*,\s*(\w+)\s*\)/g;
      let m;
      while ((m = activatesPattern.exec(content)) !== null) {
        activatesAtoms.add(m[1]);
      }
    }

    // Find all unavailable quests whose prerequisite matches the completed quest
    let unlocked = 0;
    for (const q of quests) {
      if (q.status !== 'unavailable') continue;
      const content = (q as any).content as string || '';
      // Extract prerequisite atom from Prolog content
      const prereqMatch = content.match(/quest_prerequisite\([^,]+,\s*(\w+)\)/);
      const prereqAtom = prereqMatch?.[1];
      if (!prereqAtom || prereqAtom === 'none') continue;

      if (prereqAtom === completedAtom) {
        // Check if this quest should be auto-activated (quest_activates directive)
        const questAtom = content.match(/^quest\((\w+)/m)?.[1];
        const shouldActivate = questAtom && activatesAtoms.has(questAtom);

        await this.storage.updateQuest(q.id, { status: shouldActivate ? 'active' : 'available' });
        const title = content.match(/quest\([^,]+,\s*'([^']*)/)?.[1] || q.id;
        const disc = content.match(/quest_discovery\([^,]+,\s*(\w+)\)/)?.[1] || '?';
        console.log(`[GameQuestManager] ${shouldActivate ? 'Activated' : 'Unlocked'} "${title}" (discovery: ${disc})`);
        unlocked++;
      }
    }

    // Handle onboarding gate: The Missing Writer Notice completion opens the world up
    if (completedQuestTitle === 'The Missing Writer Notice' && !this._onboardingComplete) {
      this._onboardingComplete = true;

      // Unlock tier-0 guild join quests and assign guild master NPCs
      const characters = await this.storage.getCharactersByWorld(this.worldId);
      const guildJoinQuests = quests.filter(
        q => (q as any).guildTier === 0 && q.status === 'unavailable',
      );
      for (const gq of guildJoinQuests) {
        const guildId = (gq as any).guildId;
        const guildMaster = guildId
          ? this.guildManager.findGuildMasterNpc(guildId, characters)
          : null;
        await this.storage.updateQuest(gq.id, {
          status: 'available',
          ...(guildMaster ? { assignedBy: guildMaster.name, assignedByCharacterId: guildMaster.id } : {}),
        } as any);
      }
      if (guildJoinQuests.length > 0) {
        console.log(`[GameQuestManager] Unlocked ${guildJoinQuests.length} guild join quests`);
      }

      // Promote NPC-discovery quests to 'available'
      const npcQuests = quests.filter(
        q => q.status === 'unavailable' && (q as any).discoveryMethod === 'npc',
      );
      for (const nq of npcQuests) {
        await this.storage.updateQuest(nq.id, { status: 'available' });
      }
      if (npcQuests.length > 0) {
        console.log(`[GameQuestManager] Promoted ${npcQuests.length} NPC-discovery quests to available`);
      }

      // Distribute available quests to NPCs (assigns guild masters and random NPCs)
      await this.distributeRadiantQuests(5);
    }

    if (unlocked > 0) {
      console.log(`[GameQuestManager] Total unlocked: ${unlocked} quests`);
    }
  }

  dispose(): void {
    for (const unsub of this._eventUnsubscribers) unsub();
    this._eventUnsubscribers = [];
  }

  // ── Quest Generation ──────────────────────────────────────────────────────

  /** Generate seed quests (one per objective type). */
  async generateSeedQuests(onlyTypes?: string[]): Promise<Quest[]> {
    const ctx = await this._buildSeedContext();
    const quests = await this.seeds.generateSeedQuests({
      ...ctx,
      onlyTypes,
      assignedTo: this.playerName,
    });
    return this._saveQuests(quests);
  }

  /** Generate quests using the assignment engine (proficiency-aware). */
  async generateAssignedQuests(options?: Partial<QuestAssignmentOptions>): Promise<Quest[]> {
    const ctx = await this._buildWorldContext();
    const quests = await this.seeds.assignQuests(ctx, {
      count: 3,
      playerName: this.playerName,
      playerCharacterId: this.playerCharacterId,
      ...options,
    });
    return this._saveQuests(quests.map((q: any) => q as InsertQuest));
  }

  /** Generate business roleplay quests for nearby businesses. */
  async generateBusinessRoleplayQuests(filter?: {
    businessType?: string;
    difficulty?: string;
  }): Promise<Quest[]> {
    const [world, characters, businesses] = await Promise.all([
      this.storage.getWorld(this.worldId),
      this.storage.getCharactersByWorld(this.worldId),
      this.storage.getBusinessesByWorld(this.worldId),
    ]);
    if (!world) return [];
    const quests = await this.seeds.generateBusinessRoleplayQuests({
      world,
      characters,
      businesses,
      targetLanguage: this.targetLanguage,
      playerName: this.playerName,
      ...filter,
    });
    return this._saveQuests(quests.map((q: any) => q as InsertQuest));
  }

  /** Generate time-pressure emergency quests. */
  async generateEmergencyQuests(filter?: {
    scenario?: string;
    difficulty?: string;
  }): Promise<Quest[]> {
    const [world, characters, businesses] = await Promise.all([
      this.storage.getWorld(this.worldId),
      this.storage.getCharactersByWorld(this.worldId),
      this.storage.getBusinessesByWorld(this.worldId),
    ]);
    if (!world) return [];
    const quests = await this.seeds.generateEmergencyQuests({
      world,
      characters,
      businesses,
      targetLanguage: this.targetLanguage,
      playerName: this.playerName,
      ...filter,
    });
    return this._saveQuests(quests.map((q: any) => q as InsertQuest));
  }

  /** Generate a detective/mystery quest via Prolog reasoning. */
  async generateMysteryQuest(opts?: {
    victimId?: string;
    crimeType?: string;
  }): Promise<Quest | null> {
    const quest = await this.seeds.generateMysteryQuest(this.storage, this.worldId, opts);
    if (!quest) return null;
    const saved = await this._saveQuests([{
      worldId: this.worldId,
      assignedTo: this.playerName,
      title: quest.title,
      description: quest.description,
      questType: 'mystery',
      difficulty: 'intermediate',
      targetLanguage: this.targetLanguage,
      status: 'active',
      experienceReward: 100,
      objectives: quest.objectives.map((obj, i) => ({
        id: `obj_${i}`,
        type: obj.type,
        description: obj.description,
        completed: false,
        current: 0,
        required: 1,
      })),
      tags: ['mystery', 'generated'],
    } as InsertQuest]);
    return saved[0] ?? null;
  }

  /** Generate reading comprehension quests. */
  async generateReadingQuests(maxQuests?: number): Promise<Quest[]> {
    const [world, characters] = await Promise.all([
      this.storage.getWorld(this.worldId),
      this.storage.getCharactersByWorld(this.worldId),
    ]);
    if (!world) return [];
    const quests = await this.seeds.generateReadingQuests({
      world,
      characters,
      texts: [], // TODO: pass game texts when available in storage
      targetLanguage: this.targetLanguage,
      playerName: this.playerName,
      maxQuests,
    });
    return this._saveQuests(quests);
  }

  /** Generate NPC occupation-based side quests. */
  async generateSideQuests(maxQuests?: number): Promise<Quest[]> {
    const [world, characters, settlements] = await Promise.all([
      this.storage.getWorld(this.worldId),
      this.storage.getCharactersByWorld(this.worldId),
      this.storage.getSettlementsByWorld(this.worldId),
    ]);
    if (!world) return [];
    const quests = await this.seeds.generateSideQuests({
      world,
      characters,
      settlements,
      targetLanguage: this.targetLanguage,
      playerName: this.playerName,
      maxQuests,
    });
    return this._saveQuests(quests);
  }

  /** Generate fetch/collection quests. */
  async generateFetchQuests(difficulty?: string, maxQuests?: number): Promise<Quest[]> {
    const [world, characters, settlements] = await Promise.all([
      this.storage.getWorld(this.worldId),
      this.storage.getCharactersByWorld(this.worldId),
      this.storage.getSettlementsByWorld(this.worldId),
    ]);
    if (!world) return [];
    const quests = await this.seeds.generateFetchQuests({
      world,
      characters,
      settlements,
      targetLanguage: this.targetLanguage,
      playerName: this.playerName,
      difficulty,
      maxQuests,
    });
    return this._saveQuests(quests);
  }

  /** Generate multi-NPC cross-business quests. */
  async generateMultiNpcQuests(opts?: { difficulty?: string; maxQuests?: number }): Promise<Quest[]> {
    const [world, characters, businesses] = await Promise.all([
      this.storage.getWorld(this.worldId),
      this.storage.getCharactersByWorld(this.worldId),
      this.storage.getBusinessesByWorld(this.worldId),
    ]);
    if (!world) return [];
    const quests = await this.seeds.generateMultiNpcQuests({
      world,
      characters,
      businesses,
      targetLanguage: this.targetLanguage,
      playerName: this.playerName,
      ...opts,
    });
    return this._saveQuests(quests.map((q: any) => q as InsertQuest));
  }

  /** Generate shopping/economic vocabulary quests. */
  async generateShoppingQuests(opts?: { difficulty?: string; maxQuests?: number }): Promise<Quest[]> {
    const [world, characters, businesses] = await Promise.all([
      this.storage.getWorld(this.worldId),
      this.storage.getCharactersByWorld(this.worldId),
      this.storage.getBusinessesByWorld(this.worldId),
    ]);
    if (!world) return [];
    const quests = await this.seeds.generateShoppingQuests({
      world,
      characters,
      businesses,
      targetLanguage: this.targetLanguage,
      playerName: this.playerName,
      ...opts,
    });
    return this._saveQuests(quests);
  }

  /** Generate language-gated crafting quests. */
  async generateCraftingQuests(opts?: { cefrLevel?: string; maxQuests?: number }): Promise<Quest[]> {
    const [world, characters] = await Promise.all([
      this.storage.getWorld(this.worldId),
      this.storage.getCharactersByWorld(this.worldId),
    ]);
    if (!world) return [];
    const quests = await this.seeds.generateCraftingQuests({
      world,
      characters,
      craftableItems: [], // TODO: populate from world items
      targetLanguage: this.targetLanguage,
      playerName: this.playerName,
      ...opts,
    });
    return this._saveQuests(quests);
  }

  /** Generate number/counting vocabulary quests. */
  async generateNumberPracticeQuests(opts?: { cefrLevel?: string; maxQuests?: number }): Promise<Quest[]> {
    const [world, characters, businesses] = await Promise.all([
      this.storage.getWorld(this.worldId),
      this.storage.getCharactersByWorld(this.worldId),
      this.storage.getBusinessesByWorld(this.worldId),
    ]);
    if (!world) return [];
    const quests = await this.seeds.generateNumberPracticeQuests({
      world,
      characters,
      businesses,
      targetLanguage: this.targetLanguage,
      playerName: this.playerName,
      ...opts,
    });
    return this._saveQuests(quests);
  }

  /** Generate weather/time-of-day vocabulary quests. */
  async generateWeatherTimeQuests(currentHour: number): Promise<Quest[]> {
    const ctx = await this._buildWorldContext();
    const quests = await this.seeds.generateWeatherTimeQuests({
      ...ctx,
      schedule: { currentHour, timeOfDay: currentHour >= 6 && currentHour < 20 ? 'day' : 'night' },
      targetLanguage: this.targetLanguage,
      playerName: this.playerName,
    });
    return this._saveQuests(quests.map((q: any) => q as InsertQuest));
  }

  /** Generate error-correction quests based on player's language mistakes. */
  async generateErrorCorrectionQuests(languageProgress: any): Promise<Quest[]> {
    const ctx = await this._buildWorldContext();
    const quests = await this.seeds.generateErrorCorrectionQuests(ctx, languageProgress, {
      playerName: this.playerName,
      targetLanguage: this.targetLanguage,
    });
    return this._saveQuests(quests.map((q: any) => q as InsertQuest));
  }

  /** Generate adaptive quests based on learning profile. */
  async generateAdaptiveQuests(profile: any, languageProgress?: any): Promise<Quest[]> {
    const ctx = await this._buildWorldContext();
    const quests = await this.seeds.generateAdaptiveQuests(ctx, profile, {
      playerName: this.playerName,
      targetLanguage: this.targetLanguage,
      languageProgress,
    });
    return this._saveQuests(quests.map((q: any) => q as InsertQuest));
  }

  // ── Quest Completion ──────────────────────────────────────────────────────

  /** Complete a quest: apply rewards, check chain, auto-replenish. */
  async completeQuest(questId: string): Promise<QuestCompletionResult | null> {
    const allQuests = await this.storage.getQuestsByWorld(this.worldId);
    const quest = allQuests.find(q => q.id === questId);
    if (!quest) return null;

    // Mark completed
    const completed = await this.storage.updateQuest(questId, {
      status: 'completed',
      completedAt: new Date(),
    });
    if (!completed) return null;

    // Calculate streak
    const recentCompleted = allQuests.filter(
      q => q.status === 'completed' && q.assignedTo === this.playerName,
    );
    const streakCount = recentCompleted.length + 1;

    // Calculate bonus XP (10% per streak, max 50%)
    const baseXP = quest.experienceReward || 0;
    const streakBonus = Math.min(0.5, streakCount * 0.1);
    const bonusXP = Math.round(baseXP * streakBonus);

    // Check quest chain completion and unlock next quest in chain
    let chainCompletion: ChainCompletionResult | null = null;
    if (quest.questChainId) {
      chainCompletion = await this.chainManager.checkChainCompletion(completed);
      // Unlock next quest in the linear chain
      const nextQuest = await this.chainManager.getNextQuestInChain(completed);
      if (nextQuest && nextQuest.status === 'unavailable') {
        // Check if the completed quest has quest_activates for this next quest
        const content = (quest as any).content as string || '';
        const nextContent = (nextQuest as any).content as string || '';
        const nextAtom = nextContent.match(/^quest\((\w+)/m)?.[1];
        const activatesPattern = /quest_activates\(\s*\w+\s*,\s*(\w+)\s*\)/g;
        let shouldActivate = false;
        let m;
        while ((m = activatesPattern.exec(content)) !== null) {
          if (m[1] === nextAtom) { shouldActivate = true; break; }
        }
        await this.storage.updateQuest(nextQuest.id, { status: shouldActivate ? 'active' : 'available' });
        console.log(`[GameQuestManager] ${shouldActivate ? 'Activated' : 'Unlocked'} next chain quest: "${nextQuest.title}"`);
      }
    }

    // Auto-replenish quest pool (only after onboarding)
    const replenished = this._onboardingComplete
      ? await this._checkAndReplenish(allQuests)
      : [];

    // Emit completion event
    this.eventBus.emit({
      type: 'quest_completed',
      questId,
      questTitle: quest.title,
      questType: quest.questType,
      experienceReward: baseXP + bonusXP,
      bonusXP,
      streakCount,
    } as any);

    return {
      quest: completed,
      bonusXP,
      streakCount,
      chainCompletion,
      replenished,
    };
  }

  // ── Depletion Monitoring ──────────────────────────────────────────────────

  /** Check if quest pool is low and auto-generate replacements. */
  private async _checkAndReplenish(existingQuests?: Quest[]): Promise<Quest[]> {
    const quests = existingQuests ?? await this.storage.getQuestsByWorld(this.worldId);
    const ctx = await this._buildWorldContext();

    const result = await this.seeds.checkAndReplenishQuests(
      quests,
      ctx,
      this.playerName,
      { minActiveQuests: 3, replenishCount: 3 },
      async (quest) => this.storage.createQuest(quest),
    );

    return result.generatedQuests || [];
  }

  // ── Daily Quest Rotation ──────────────────────────────────────────────────

  /** Check and generate recurring/daily quests. */
  async checkDailyReset(): Promise<{ generated: Quest[]; status: unknown }> {
    const quests = await this.storage.getQuestsByWorld(this.worldId);
    const ctx = await this._buildWorldContext();

    const status = await this.seeds.getRecurringQuestStatus(
      quests, this.playerName, this.worldId,
      async (id, data) => {
        await this.storage.updateQuest(id, data as any);
        return quests.find(q => q.id === id);
      },
    );
    const generated = await this.seeds.generateRecurringQuests(
      { ...ctx, existingQuests: quests },
      this.playerName,
      'daily',
      async (quest) => {
        const saved = await this._saveQuests([quest as InsertQuest]);
        return saved[0];
      },
      { dailyQuestCount: 3 },
    );

    const saved = generated;

    if (saved.length > 0) {
      this.eventBus.emit({ type: 'daily_quests_reset' } as any);
    }

    return { generated: saved, status };
  }

  // ── Guild Quests ──────────────────────────────────────────────────────────

  /** Receive the next quest from a guild, assigning the guild master NPC. */
  async receiveGuildQuest(guildId: string, characters?: Array<{ id?: string; name?: string; firstName?: string; lastName?: string; occupation?: string | null }>): Promise<Quest | null> {
    const quests = await this.storage.getQuestsByWorld(this.worldId);
    const questId = this.guildManager.receiveNextQuest(guildId, quests, characters);
    if (!questId) return null;
    const quest = quests.find(q => q.id === questId);
    return quest ?? null;
  }

  /** Get guild progress for all guilds. */
  async getGuildProgress(): Promise<Map<string, unknown>> {
    const quests = await this.storage.getQuestsByWorld(this.worldId);
    return this.guildManager.getAllGuildProgress(quests);
  }

  // ── NPC Guidance ──────────────────────────────────────────────────────────

  /** Get quest guidance for an NPC (what should the NPC talk about). */
  async getNpcQuestGuidance(npcId: string): Promise<{
    hasGuidance: boolean;
    systemPromptAddition?: string;
  } | null> {
    try {
      const quests = await this.storage.getQuestsByWorld(this.worldId);
      const activeQuests = quests.filter(
        q => q.status === 'active' && q.assignedTo === this.playerName,
      );

      // Find quests where this NPC is relevant (assigned by them, or objectives target them)
      const relevantQuests = activeQuests.filter(q => {
        if (q.assignedByCharacterId === npcId) return true;
        const objectives = (q.objectives || []) as any[];
        return objectives.some((obj: any) => obj.npcId === npcId || obj.target === npcId);
      });

      if (relevantQuests.length === 0) return { hasGuidance: false };

      // Build guidance prompt from relevant quest objectives
      const lines = relevantQuests.flatMap(q => {
        const incomplete = ((q.objectives || []) as any[]).filter((o: any) => !o.completed);
        return incomplete.map((o: any) => `- Quest "${q.title}": ${o.description}`);
      });

      return {
        hasGuidance: true,
        systemPromptAddition: `The player has active quests involving you:\n${lines.join('\n')}\nNaturally steer the conversation toward helping with these objectives.`,
      };
    } catch {
      return null;
    }
  }

  // ── Radiant Quest Distribution ─────────────────────────────────────────

  /**
   * Distribute available quests to NPCs so they show quest indicators.
   * Staggered: only `maxOffering` NPCs will have quests at a time.
   * Quests are set to status='available' with assignedByCharacterId pointing
   * to the NPC who offers them. When the player talks to that NPC,
   * the QuestOfferPanel shows and the quest becomes 'active' on accept.
   *
   * Call this at game start and periodically to refresh offerings.
   */
  async distributeRadiantQuests(maxOffering: number = 5): Promise<number> {
    const [quests, rawCharacters] = await Promise.all([
      this.storage.getQuestsByWorld(this.worldId),
      this.storage.getCharactersByWorld(this.worldId),
    ]);
    const characters = rawCharacters as QuestGiverCharacter[];

    // Count how many NPCs already have available quests
    const currentlyOffering = new Set(
      quests
        .filter(q => q.status === 'available' && q.assignedByCharacterId)
        .map(q => q.assignedByCharacterId),
    );

    // Find unassigned available quests that could be offered by NPCs.
    // Exclude notice_board quests — they belong on the board, not on NPCs.
    const unassigned = quests.filter(
      q => q.status === 'available' && !q.assignedByCharacterId
        && (q as any).discoveryMethod !== 'notice_board',
    );

    if (unassigned.length === 0) return 0;

    let distributed = 0;

    // Pass 1: Assign quests with a known giver — either from assignedBy name
    // (quest_assigned_by Prolog predicate) or from guildId (guild master NPC)
    const remainingUnassigned: typeof unassigned = [];
    for (const quest of unassigned) {
      // Try assignedBy name first
      const giverName = (quest as any).assignedBy as string | undefined;
      if (giverName && giverName !== 'System' && giverName !== 'unassigned') {
        const giver = characters.find(c =>
          `${c.firstName} ${c.lastName}`.trim().toLowerCase() === giverName.toLowerCase()
          || c.firstName?.toLowerCase() === giverName.toLowerCase()
        );
        if (giver) {
          await this.storage.updateQuest(quest.id, {
            assignedByCharacterId: giver.id,
            assignedBy: `${giver.firstName} ${giver.lastName}`.trim(),
          } as any);
          currentlyOffering.add(giver.id);
          distributed++;
          continue;
        }
      }
      // Try guild master for guild quests
      const guildId = (quest as any).guildId as string | undefined;
      if (guildId) {
        const guildMaster = this.guildManager.findGuildMasterNpc(guildId, characters);
        if (guildMaster) {
          await this.storage.updateQuest(quest.id, {
            assignedByCharacterId: guildMaster.id,
            assignedBy: guildMaster.name,
          } as any);
          currentlyOffering.add(guildMaster.id);
          distributed++;
          continue;
        }
      }
      remainingUnassigned.push(quest);
    }

    // Pass 2: Randomly assign remaining quests up to maxOffering
    const slotsAvailable = maxOffering - currentlyOffering.size;
    if (slotsAvailable <= 0 || remainingUnassigned.length === 0) return distributed;

    // Find eligible NPCs (alive, not already offering, has an occupation)
    const eligibleNpcs = characters.filter(c => {
      if (!c.isAlive) return false;
      if (currentlyOffering.has(c.id)) return false;
      if (!c.occupation) return false;
      return true;
    });

    if (eligibleNpcs.length === 0) return distributed;

    // Shuffle NPCs and quests for variety
    const shuffledNpcs = [...eligibleNpcs].sort(() => Math.random() - 0.5);
    const shuffledQuests = [...remainingUnassigned].sort(() => Math.random() - 0.5);

    for (let i = 0; i < Math.min(slotsAvailable, shuffledNpcs.length, shuffledQuests.length); i++) {
      const npc = shuffledNpcs[i];
      const quest = shuffledQuests[i];

      await this.storage.updateQuest(quest.id, {
        assignedByCharacterId: npc.id,
        assignedBy: `${npc.firstName} ${npc.lastName}`,
      } as any);

      distributed++;
    }

    return distributed;
  }

  /**
   * When a quest is accepted from an NPC, mark it as active.
   * Called by the QuestOfferPanel accept flow.
   */
  async acceptQuestFromNpc(questId: string): Promise<Quest | null> {
    const updated = await this.storage.updateQuest(questId, {
      status: 'active',
    } as any);
    return updated ?? null;
  }

  // ── Internal Helpers ──────────────────────────────────────────────────────

  private async _buildWorldContext(): Promise<QuestSeedWorldContext> {
    const [world, characters, settlements, quests] = await Promise.all([
      this.storage.getWorld(this.worldId),
      this.storage.getCharactersByWorld(this.worldId),
      this.storage.getSettlementsByWorld(this.worldId),
      this.storage.getQuestsByWorld(this.worldId),
    ]);
    return {
      world: world as World,
      characters,
      settlements,
      existingQuests: quests,
    };
  }

  private async _buildSeedContext(): Promise<SeedContext> {
    const [world, characters, settlements] = await Promise.all([
      this.storage.getWorld(this.worldId),
      this.storage.getCharactersByWorld(this.worldId),
      this.storage.getSettlementsByWorld(this.worldId),
    ]);
    return {
      world: world as World,
      characters,
      settlements,
    };
  }

  /** Persist generated quests, adding Prolog content to each. */
  private async _saveQuests(quests: InsertQuest[]): Promise<Quest[]> {
    const saved: Quest[] = [];
    for (const quest of quests) {
      // Ensure required fields
      if (!quest.worldId) (quest as any).worldId = this.worldId;
      if (!quest.assignedTo) (quest as any).assignedTo = this.playerName;
      if (!quest.targetLanguage) (quest as any).targetLanguage = this.targetLanguage;
      if (!quest.gameType) (quest as any).gameType = 'language-learning';

      // Generate Prolog content
      if (!quest.content) {
        try {
          const result = convertQuestToProlog(quest as any);
          if (result.prologContent) (quest as any).content = result.prologContent;
        } catch { /* non-fatal */ }
      }

      try {
        const created = await this.storage.createQuest(quest);
        saved.push(created);

        // Load Prolog content into live engine if available
        if (this.prologEngine && created.content) {
          try {
            await this.prologEngine.assertFact(created.content);
          } catch { /* non-fatal */ }
        }
      } catch (err) {
        console.warn('[GameQuestManager] Failed to save quest:', (err as Error)?.message);
      }
    }
    return saved;
  }

  /** Wire event bus listeners for automatic triggers. */
  private _wireEventBus(): void {
    // On quest completion: handle onboarding progression, then (if onboarding
    // is done) auto-replenish and redistribute radiant quests.
    this._eventUnsubscribers.push(
      this.eventBus.on('quest_completed', (event: any) => {
        const title = event?.questTitle;
        // Always handle onboarding unlocks
        if (title) {
          this.handleQuestProgression(title).catch(() => {});
        }
        // Only auto-replenish/redistribute after onboarding is complete
        if (this._onboardingComplete) {
          this._checkAndReplenish()
            .then(() => this.distributeRadiantQuests(5))
            .catch(() => {});
        }
      }),
    );

    // Daily reset check on hour change + weather/time quest generation
    // (only after onboarding)
    this._eventUnsubscribers.push(
      this.eventBus.on('hour_changed' as any, (event: any) => {
        if (!this._onboardingComplete) return;
        const hour = event?.hour;
        if (hour === 0 || hour === 6) {
          this.checkDailyReset().catch(() => {});
        }
        if (hour === 8 || hour === 14 || hour === 19) {
          this.generateWeatherTimeQuests(hour).catch(() => {});
        }
      }),
    );

    // Generate contextual quests when entering a settlement (only after onboarding)
    this._eventUnsubscribers.push(
      this.eventBus.on('settlement_entered' as any, () => {
        if (!this._onboardingComplete) return;
        this._generateContextualQuests().catch(() => {});
      }),
    );

    // Generate adaptive quests after assessment completion
    this._eventUnsubscribers.push(
      this.eventBus.on('assessment_completed' as any, (event: any) => {
        if (event?.cefrLevel) {
          this.generateErrorCorrectionQuests(event).catch(() => {});
        }
      }),
    );
  }

  /**
   * Generate contextual quests based on the player's current situation.
   * Called when entering new areas, visiting shops, etc.
   * Limits generation to avoid overwhelming the player.
   */
  private async _generateContextualQuests(): Promise<void> {
    const quests = await this.storage.getQuestsByWorld(this.worldId);
    const activeCount = this.seeds.countActiveQuests(quests, this.playerName, this.worldId);
    const pendingCount = quests.filter(
      q => q.worldId === this.worldId && q.assignedTo === this.playerName
        && q.status === 'available' && !q.assignedByCharacterId,
    ).length;

    // Don't generate more if player already has plenty (active + pending for distribution)
    if (activeCount + pendingCount >= 8) return;

    // Pick 1-2 contextual generators at random for variety
    const generators = [
      () => this.generateShoppingQuests({ maxQuests: 1 }),
      () => this.generateSideQuests(1),
      () => this.generateFetchQuests(undefined, 1),
      () => this.generateNumberPracticeQuests({ maxQuests: 1 }),
    ];

    const shuffled = generators.sort(() => Math.random() - 0.5);
    const toRun = shuffled.slice(0, 2);

    for (const gen of toRun) {
      try {
        const generated = await gen();
        if (generated.length > 0) {
          // Distribute the new quest to an NPC
          await this.distributeRadiantQuests(5);
          break; // Only add one contextual quest per trigger
        }
      } catch { /* non-fatal */ }
    }
  }
}
