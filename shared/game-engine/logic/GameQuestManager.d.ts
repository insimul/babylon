/**
 * Type surface for `@shared/game-engine/logic/GameQuestManager` (runtime-standalone only).
 *
 * The concrete `GameQuestManager` implementation lives in the AUTHORING platform
 * (insimul-platform/shared/game-engine/logic/GameQuestManager.ts) because it depends
 * on the closed quest-seed / quest-generator subsystem, which must NOT be vendored
 * into the open runtime (see docs/PLATFORM_SPLIT_AND_ENGINE_PLUGINS.md §A0 and
 * shared/language/CLAUDE.md's open/closed boundary). The platform's export pipeline
 * copies the real `.ts` into generated games, and the platform's own tsconfig maps
 * this specifier to its own file — so this declaration is used ONLY by the runtime's
 * standalone `npm run check`. It ships no executable code (a `.d.ts` emits nothing and
 * bundlers ignore it), so it cannot shadow the platform's implementation.
 *
 * Fully resolving this last runtime→authoring back-reference (moving GameQuestManager
 * into the runtime with the seed generators injected, per §A0's "invert the
 * dependency") requires platform-side changes and is tracked as follow-up to US-RS4.
 */

import type { QuestStorageProvider } from '@shared/quests/quest-storage-provider';
import type { GameEventBus } from '@shared/game-engine/logic/GameEventBus';
import type { GamePrologEngine } from '@shared/game-engine/logic/GamePrologEngine';
import type { Quest } from '@shared/quests/types';

export interface GameQuestManagerConfig {
  storage: QuestStorageProvider;
  eventBus: GameEventBus;
  prologEngine?: GamePrologEngine | null;
  worldId: string;
  playerName: string;
  playerCharacterId?: string;
  targetLanguage?: string;
}

/** Mirrors the platform's ChainCompletionResult (quest-chain-manager.ts). */
export interface ChainCompletionResult {
  isComplete: boolean;
  bonusXP: number;
  achievement: string | null;
  chainName: string;
  totalQuests: number;
  completedQuests: number;
}

export interface QuestCompletionResult {
  quest: Quest;
  bonusXP: number;
  streakCount: number;
  chainCompletion: ChainCompletionResult | null;
  replenished: Quest[];
}

export declare class GameQuestManager {
  constructor(config: GameQuestManagerConfig);
  get onboardingComplete(): boolean;
  checkOnboardingStatus(): Promise<void>;
  completeQuest(questId: string): Promise<QuestCompletionResult | null>;
  getNpcQuestGuidance(
    npcId: string,
  ): Promise<{ hasGuidance: boolean; systemPromptAddition?: string } | null>;
  distributeRadiantQuests(maxOffering?: number): Promise<number>;
  dispose(): void;
}
