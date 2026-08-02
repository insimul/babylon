/**
 * Insimul Core — Quest Seed Source contract.
 *
 * The capability a host must supply so the shared runtime can GENERATE quests.
 *
 * Generating quest content is authoring work: the seventeen generators behind it
 * (seed, assignment, business-roleplay, emergency, mystery, reading, side, fetch,
 * multi-NPC, shopping, crafting, number-practice, weather/time, error-correction,
 * adaptive, depletion, daily-rotation) plus the guild and chain managers live in
 * the CLOSED authoring platform and must not be vendored into the open runtime
 * (`docs/PLATFORM_SPLIT_AND_ENGINE_PLUGINS.md` §A0). `GameQuestManager` — the
 * runtime orchestrator that *drives* them — is not authoring work, so §A0's
 * remedy is to invert the dependency: core states the capability here, the
 * platform supplies an implementation, and no closed generator ever appears in
 * an open repo.
 *
 * This is the same shape as `game-engine/host-contracts.ts` — an interface
 * declared in the shared layer with the implementation handed in by the host,
 * after Unity's `IRadiantSolver` — and it obeys the same rules:
 *
 *  1. **Narrow to what core actually calls.** Every method and every field of
 *     every option bag below is transcribed from a real call site in the
 *     platform's `shared/game-engine/logic/GameQuestManager.ts`. Nothing is here
 *     because a quest system "ought" to have it. The option bags deliberately
 *     mirror what the orchestrator passes today (it builds them from
 *     `QuestStorageProvider` reads), so the platform's implementation is a
 *     delegating wrapper rather than a rewrite.
 *  2. **No closed generator is named.** The interface describes the capability,
 *     never the module that provides it, which is what lets the closed side
 *     satisfy it without anything closed entering an open repo.
 *  3. **No engine types, no DOM types.** It compiles under
 *     `packages/core/tsconfig.json`, which omits the `dom` lib on purpose.
 *  4. **Structural, and permissive at the edges.** Generator payloads core does
 *     not interpret (learning profiles, language progress, recurring-quest
 *     status, guild progress) are `unknown`, so core never owns the authoring
 *     vocabulary.
 *
 * A host that has not wired a seed source passes {@link NULL_QUEST_SEED_SOURCE}
 * and the runtime degrades to "no quests are generated" instead of crashing.
 *
 * Documented in `docs/runtime-contract.md` §2.2.
 */

import type {
  Business,
  Character,
  InsertQuest,
  Quest,
  Settlement,
  World,
} from './types';
import type { QuestStorageProvider } from './quest-storage-provider';

/** A generator may be synchronous or asynchronous; the orchestrator awaits either. */
export type MaybePromise<T> = T | Promise<T>;

// ─── Contexts the orchestrator builds and hands to generators ────────────────

/**
 * The world snapshot most generators take.
 *
 * Structurally the platform's `quest-assignment-engine.WorldContext`. The
 * orchestrator builds it with one parallel read of world / characters /
 * settlements / quests from {@link QuestStorageProvider}.
 */
export interface QuestSeedWorldContext {
  world: World;
  characters: Character[];
  settlements: Settlement[];
  existingQuests: Quest[];
}

/** Fields every content generator receives: who is playing, and in what language. */
export interface QuestSeedPlayerOptions {
  world: World;
  characters: Character[];
  targetLanguage: string;
  playerName: string;
}

// ─── Per-generator option bags ───────────────────────────────────────────────

/** Seed quests — one per objective type. `assignedTo` is the player's name. */
export interface QuestSeedOptions {
  world: World;
  characters: Character[];
  settlements: Settlement[];
  /** Restrict generation to these objective types; all types when absent. */
  onlyTypes?: string[];
  assignedTo: string;
}

/**
 * Proficiency-aware assignment options.
 *
 * Open-ended on purpose: callers pass a `Partial` of the platform's
 * `AssignmentOptions` straight through, and core does not own that vocabulary.
 */
export interface QuestAssignmentOptions {
  count?: number;
  playerName?: string;
  playerCharacterId?: string;
  [key: string]: unknown;
}

export interface QuestBusinessRoleplayOptions extends QuestSeedPlayerOptions {
  businesses: Business[];
  businessType?: string;
  difficulty?: string;
}

export interface QuestEmergencyOptions extends QuestSeedPlayerOptions {
  businesses: Business[];
  scenario?: string;
  difficulty?: string;
}

export interface QuestMysteryOptions {
  victimId?: string;
  crimeType?: string;
}

/**
 * What a mystery generator returns: a draft, not a persisted quest. The
 * orchestrator fills in world/difficulty/rewards and saves it.
 */
export interface QuestMysteryDraft {
  title: string;
  description: string;
  objectives: Array<{ type: string; description: string }>;
}

export interface QuestReadingOptions extends QuestSeedPlayerOptions {
  /** In-world texts to comprehend. Empty until the storage layer carries them. */
  texts: unknown[];
  maxQuests?: number;
}

export interface QuestSideOptions extends QuestSeedPlayerOptions {
  settlements: Settlement[];
  maxQuests?: number;
}

export interface QuestFetchOptions extends QuestSeedPlayerOptions {
  settlements: Settlement[];
  difficulty?: string;
  maxQuests?: number;
}

export interface QuestMultiNpcOptions extends QuestSeedPlayerOptions {
  businesses: Business[];
  difficulty?: string;
  maxQuests?: number;
}

export interface QuestShoppingOptions extends QuestSeedPlayerOptions {
  businesses: Business[];
  difficulty?: string;
  maxQuests?: number;
}

export interface QuestCraftingOptions extends QuestSeedPlayerOptions {
  /** Recipes the player may be sent to craft. Empty until world items carry them. */
  craftableItems: unknown[];
  cefrLevel?: string;
  maxQuests?: number;
}

export interface QuestNumberPracticeOptions extends QuestSeedPlayerOptions {
  businesses: Business[];
  cefrLevel?: string;
  maxQuests?: number;
}

/** Weather/time quests take the whole world context plus the in-game clock. */
export interface QuestWeatherTimeOptions extends QuestSeedWorldContext {
  schedule: { currentHour: number; timeOfDay: string };
  targetLanguage: string;
  playerName: string;
}

export interface QuestErrorCorrectionOptions {
  playerName: string;
  targetLanguage: string;
}

export interface QuestAdaptiveOptions {
  playerName: string;
  targetLanguage: string;
  /** Opaque language-progress record; core never reads inside it. */
  languageProgress?: unknown;
}

// ─── Depletion monitoring / daily rotation ───────────────────────────────────

export interface QuestReplenishOptions {
  /** Below this many active quests, the pool is considered depleted. */
  minActiveQuests: number;
  /** How many quests to generate when it is. */
  replenishCount: number;
}

export interface QuestReplenishResult {
  /** Quests generated and persisted by the replenish pass; absent when none. */
  generatedQuests?: Quest[];
}

export interface QuestRecurringOptions {
  dailyQuestCount: number;
}

// ─── Guild and chain sub-capabilities ────────────────────────────────────────

/** The NPC a guild's quests are handed out by. */
export interface QuestGuildMaster {
  id: string;
  name: string;
}

/**
 * The loose character shape the guild source is given when the orchestrator
 * forwards a caller-supplied roster instead of one it read from storage.
 */
export interface QuestGuildCharacter {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  occupation?: string | null;
}

/**
 * IQuestGuildSource
 *
 * Guild membership tiers and their quest ladder. Structurally the platform's
 * `GuildQuestManager`; the orchestrator holds exactly one, built at construction.
 */
export interface IQuestGuildSource {
  /** The NPC who runs `guildId`, or `null` if this world has no such NPC. */
  findGuildMasterNpc(
    guildId: string,
    characters: Array<Character | QuestGuildCharacter>,
  ): QuestGuildMaster | null;
  /** Id of the next quest the guild will hand out, or nullish when the ladder is exhausted. */
  receiveNextQuest(
    guildId: string,
    quests: Quest[],
    characters?: Array<Character | QuestGuildCharacter>,
  ): string | null | undefined;
  /** Per-guild progress, keyed by guild id. The value is host-defined. */
  getAllGuildProgress(quests: Quest[]): Map<string, unknown>;
}

/** Result of finishing the last quest of a chain. Mirrors `quest-chain-manager`. */
export interface QuestChainCompletionResult {
  isComplete: boolean;
  bonusXP: number;
  achievement: string | null;
  chainName: string;
  totalQuests: number;
  completedQuests: number;
}

/**
 * IQuestChainSource
 *
 * Linear quest chains. Structurally the platform's `QuestChainManager`, which is
 * constructed with the storage provider — hence the factory on
 * {@link IQuestSeedSource} rather than a bare property.
 */
export interface IQuestChainSource {
  checkChainCompletion(quest: Quest): MaybePromise<QuestChainCompletionResult | null>;
  getNextQuestInChain(quest: Quest): MaybePromise<Quest | null | undefined>;
}

// ─── The capability ──────────────────────────────────────────────────────────

/**
 * IQuestSeedSource
 *
 * Everything the runtime quest orchestrator asks a host for. Each method
 * corresponds one-to-one with a generator call in the platform implementation;
 * every one returns plain records (`InsertQuest` drafts or persisted `Quest`s),
 * never scene objects, and none of them persist — saving is the orchestrator's
 * job, so it can stamp world/player/language fields and attach Prolog content
 * uniformly.
 *
 * Platform: the seventeen `shared/quests/*` generators (closed).
 * Unreal / Unity / Godot: an adapter over the same exported content, or
 *   {@link NULL_QUEST_SEED_SOURCE} until one exists.
 */
export interface IQuestSeedSource {
  // ── Bulk generation ────────────────────────────────────────────────────
  /** One seed quest per objective type. */
  generateSeedQuests(options: QuestSeedOptions): MaybePromise<InsertQuest[]>;
  /** Proficiency-aware assignment across the whole world context. */
  assignQuests(
    context: QuestSeedWorldContext,
    options: QuestAssignmentOptions,
  ): MaybePromise<InsertQuest[]>;

  // ── Situational generators ─────────────────────────────────────────────
  generateBusinessRoleplayQuests(
    options: QuestBusinessRoleplayOptions,
  ): MaybePromise<InsertQuest[]>;
  generateEmergencyQuests(options: QuestEmergencyOptions): MaybePromise<InsertQuest[]>;
  /**
   * A detective/mystery quest, reasoned out of world truths — hence the storage
   * provider: this is the one generator that reads the world itself rather than
   * a snapshot the orchestrator assembled.
   */
  generateMysteryQuest(
    storage: QuestStorageProvider,
    worldId: string,
    options?: QuestMysteryOptions,
  ): MaybePromise<QuestMysteryDraft | null>;
  generateReadingQuests(options: QuestReadingOptions): MaybePromise<InsertQuest[]>;
  generateSideQuests(options: QuestSideOptions): MaybePromise<InsertQuest[]>;
  generateFetchQuests(options: QuestFetchOptions): MaybePromise<InsertQuest[]>;
  generateMultiNpcQuests(options: QuestMultiNpcOptions): MaybePromise<InsertQuest[]>;
  generateShoppingQuests(options: QuestShoppingOptions): MaybePromise<InsertQuest[]>;
  generateCraftingQuests(options: QuestCraftingOptions): MaybePromise<InsertQuest[]>;
  generateNumberPracticeQuests(
    options: QuestNumberPracticeOptions,
  ): MaybePromise<InsertQuest[]>;
  generateWeatherTimeQuests(options: QuestWeatherTimeOptions): MaybePromise<InsertQuest[]>;

  // ── Learner-driven generators ──────────────────────────────────────────
  /** `languageProgress` is the host's opaque progress record. */
  generateErrorCorrectionQuests(
    context: QuestSeedWorldContext,
    languageProgress: unknown,
    options: QuestErrorCorrectionOptions,
  ): MaybePromise<InsertQuest[]>;
  /** `profile` is the host's opaque learning profile. */
  generateAdaptiveQuests(
    context: QuestSeedWorldContext,
    profile: unknown,
    options: QuestAdaptiveOptions,
  ): MaybePromise<InsertQuest[]>;

  // ── Pool maintenance ───────────────────────────────────────────────────
  /**
   * Top the quest pool back up when it runs low. `createQuest` is supplied by
   * the orchestrator so replenished quests are persisted the same way generated
   * ones are.
   */
  checkAndReplenishQuests(
    quests: Quest[],
    context: QuestSeedWorldContext,
    playerName: string,
    options: QuestReplenishOptions,
    createQuest: (quest: InsertQuest) => Promise<Quest>,
  ): MaybePromise<QuestReplenishResult>;
  /** How many of `quests` are active for this player in this world. Pure. */
  countActiveQuests(quests: Quest[], playerName: string, worldId: string): number;

  // ── Recurring / daily rotation ─────────────────────────────────────────
  /** `cadence` is the host's rotation vocabulary — the orchestrator asks for `'daily'`. */
  generateRecurringQuests(
    context: QuestSeedWorldContext,
    playerName: string,
    cadence: string,
    saveQuest: (quest: InsertQuest) => Promise<Quest | undefined>,
    options: QuestRecurringOptions,
  ): MaybePromise<Quest[]>;
  /** Host-defined rotation status; `updateQuest` lets it expire stale dailies. */
  getRecurringQuestStatus(
    quests: Quest[],
    playerName: string,
    worldId: string,
    updateQuest: (id: string, data: Partial<Quest>) => Promise<Quest | undefined>,
  ): MaybePromise<unknown>;

  // ── Sub-capabilities the orchestrator holds for its lifetime ───────────
  createGuildQuestSource(): IQuestGuildSource;
  createQuestChainSource(storage: QuestStorageProvider): IQuestChainSource;
}

// ─── Default: a host with no seed source ─────────────────────────────────────

/** {@link IQuestGuildSource} that knows about no guilds. */
export const NULL_QUEST_GUILD_SOURCE: IQuestGuildSource = {
  findGuildMasterNpc: () => null,
  receiveNextQuest: () => null,
  getAllGuildProgress: () => new Map<string, unknown>(),
};

/** {@link IQuestChainSource} that knows about no chains. */
export const NULL_QUEST_CHAIN_SOURCE: IQuestChainSource = {
  checkChainCompletion: () => null,
  getNextQuestInChain: () => null,
};

/**
 * The no-op seed source.
 *
 * Generates nothing, replenishes nothing, and knows about no guilds or chains,
 * so a runtime whose host has not wired a seed source still constructs and runs
 * — it simply has only the quests its world export already carries. Every
 * `IQuestSeedSource` consumer must tolerate this: an engine adapter part-way
 * through being written should degrade, not crash.
 *
 * The `IDebugSink` / `NULL_DEBUG_SINK` pair in `game-engine/host-contracts.ts`
 * is the same idea for engine hooks.
 */
export const NULL_QUEST_SEED_SOURCE: IQuestSeedSource = {
  generateSeedQuests: () => [],
  assignQuests: () => [],
  generateBusinessRoleplayQuests: () => [],
  generateEmergencyQuests: () => [],
  generateMysteryQuest: () => null,
  generateReadingQuests: () => [],
  generateSideQuests: () => [],
  generateFetchQuests: () => [],
  generateMultiNpcQuests: () => [],
  generateShoppingQuests: () => [],
  generateCraftingQuests: () => [],
  generateNumberPracticeQuests: () => [],
  generateWeatherTimeQuests: () => [],
  generateErrorCorrectionQuests: () => [],
  generateAdaptiveQuests: () => [],
  checkAndReplenishQuests: () => ({ generatedQuests: [] }),
  countActiveQuests: () => 0,
  generateRecurringQuests: () => [],
  getRecurringQuestStatus: () => undefined,
  createGuildQuestSource: () => NULL_QUEST_GUILD_SOURCE,
  createQuestChainSource: () => NULL_QUEST_CHAIN_SOURCE,
};
