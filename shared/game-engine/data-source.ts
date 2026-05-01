/**
 * IDataSource — Engine-agnostic data access interface.
 *
 * This is the canonical interface for loading and persisting game data.
 * It abstracts over two implementations:
 *   - ApiDataSource (client/src/components/3DGame/DataSource.ts) — live API calls for the in-app game
 *   - FileDataSource (same file) — static JSON loading for standalone Babylon.js exports
 *
 * Game logic in shared/game-engine/ should depend on this interface,
 * never on the concrete implementations.
 */

import type { VisualAsset } from '@shared/schema';

// ─── Supporting Types ────────────────────────────────────────────────────────

/** Lightweight summary of an AI generation job for loading screen display. */
export interface GenerationJobSummary {
  id: string;
  jobType: string;
  assetType: string | null;
  status: string;
  progress: number;
  completedCount: number;
  batchSize: number;
}

/** Result from an NPC-NPC conversation. */
export interface NpcConversationResult {
  exchanges: Array<{ speakerId: string; speakerName: string; text: string }>;
  relationshipDelta: { friendshipChange: number; trustChange: number; romanceSpark: number };
  topic: string;
  languageUsed: string;
  /** Where the conversation content came from */
  source?: 'pool' | 'template' | 'llm' | 'template_with_replacement';
}

/** Playthrough quest overlay interface (subset used by IDataSource). */
export interface IQuestOverlay {
  getQuests(): any[];
  getQuest(questId: string): any | undefined;
  updateQuest(questId: string, data: any): void;
  mergeBaseQuests(baseQuests: any[]): any[];
}

// ─── Core Interface ──────────────────────────────────────────────────────────

export interface IDataSource {
  /** Playthrough-scoped quest overlay. When set, loadQuests merges overlay
   *  state on top of base world quests, and updateQuest writes to the overlay. */
  questOverlay: IQuestOverlay | null;

  // ── World data ──
  loadWorld(worldId: string): Promise<any>;
  loadCharacters(worldId: string): Promise<any[]>;
  loadActions(worldId: string): Promise<any[]>;
  loadBaseActions(): Promise<any[]>;
  loadQuests(worldId: string): Promise<any[]>;
  loadSettlements(worldId: string): Promise<any[]>;
  loadRules(worldId: string): Promise<any[]>;
  loadBaseRules(): Promise<any[]>;
  loadCountries(worldId: string): Promise<any[]>;
  loadStates(worldId: string): Promise<any[]>;
  loadBaseResources(worldId: string): Promise<any>;
  loadAssets(worldId: string): Promise<any[]>;
  loadConfig3D(worldId: string): Promise<any>;
  loadTruths(worldId: string, playthroughId?: string): Promise<any[]>;
  loadCharacter(characterId: string): Promise<any>;
  loadGeography(worldId: string): Promise<{ heightmap?: number[][]; terrainSize?: number } | null>;
  loadAIConfig(worldId: string): Promise<any | null>;
  loadDialogueContexts(worldId: string): Promise<any[]>;
  loadPrologContent(worldId: string): Promise<string | null>;
  loadWorldItems(worldId: string): Promise<any[]>;
  loadTexts(worldId: string): Promise<any[]>;
  getLanguages(worldId: string): Promise<any[]>;
  loadGenerationJobs(worldId: string): Promise<GenerationJobSummary[]>;

  // ── Settlement data ──
  loadSettlementBusinesses(settlementId: string): Promise<any[]>;
  loadSettlementLots(settlementId: string): Promise<any[]>;
  loadSettlementResidences(settlementId: string): Promise<any[]>;

  // ── Playthrough lifecycle ──
  listPlaythroughs(worldId: string, authToken: string): Promise<any[]>;
  startPlaythrough(worldId: string, authToken: string, playthroughName: string): Promise<any>;
  getPlaythrough(playthroughId: string): Promise<any | null>;
  updatePlaythrough(playthroughId: string, data: any): Promise<any>;
  deletePlaythrough(playthroughId: string): Promise<void>;
  markPlaythroughInitialized(playthroughId: string): Promise<void>;

  // ── Quests ──
  createDynamicQuest(worldId: string, questData: any): Promise<any>;
  branchQuest(worldId: string, questId: string, choiceId: string, targetStageId?: string): Promise<any>;
  updateQuest(questId: string, data: any): Promise<void>;
  completeQuest(worldId: string, questId: string): Promise<any>;
  getNpcQuestGuidance(worldId: string, npcId: string): Promise<{ hasGuidance: boolean; systemPromptAddition?: string } | null>;
  getMainQuestJournal(worldId: string, playerId: string, cefrLevel?: string): Promise<any>;
  tryUnlockMainQuest(worldId: string, playerId: string, cefrLevel: string): Promise<void>;
  recordMainQuestCompletion(worldId: string, playerId: string, questType: string, cefrLevel?: string): Promise<any>;
  saveQuestProgress(playthroughId: string, questProgress: any): Promise<void>;
  loadQuestProgress(playthroughId: string): Promise<any | null>;

  // ── Inventory & containers ──
  getEntityInventory(worldId: string, entityId: string): Promise<any>;
  transferItem(worldId: string, transfer: {
    fromEntityId?: string;
    toEntityId?: string;
    itemId: string;
    itemName?: string;
    itemDescription?: string;
    itemType?: string;
    quantity?: number;
    transactionType: 'buy' | 'sell' | 'steal' | 'discard' | 'give' | 'quest_reward';
    totalPrice?: number;
  }): Promise<any>;
  getMerchantInventory(worldId: string, merchantId: string, businessType?: string): Promise<any>;
  getPlayerInventory(worldId: string, playerId: string): Promise<any>;
  getContainerContents(containerId: string): Promise<any>;
  loadContainers(worldId: string): Promise<any[]>;
  loadContainersByLocation(worldId: string, location: { businessId?: string; residenceId?: string; lotId?: string }): Promise<any[]>;
  updateContainer(containerId: string, data: any): Promise<any>;
  transferContainerItem(containerId: string, transfer: { itemId: string; itemName?: string; quantity?: number; direction: 'deposit' | 'withdraw' }): Promise<any>;

  // ── Save/Load ──
  saveGameState(worldId: string, playthroughId: string, slotIndex: number, state: any): Promise<void>;
  loadGameState(worldId: string, playthroughId: string, slotIndex: number): Promise<any | null>;
  deleteGameState(worldId: string, playthroughId: string, slotIndex: number): Promise<void>;

  // ── Conversations ──
  saveConversation(playthroughId: string, conversation: any): Promise<any>;
  updateConversation(playthroughId: string, conversationId: string, updates: any): Promise<any>;
  getConversations(playthroughId: string, npcCharacterId?: string): Promise<any[]>;
  startNpcNpcConversation(worldId: string, npc1Id: string, npc2Id: string, topic?: string): Promise<NpcConversationResult | null>;
  simulateRichConversation(worldId: string, char1Id: string, char2Id: string, turnCount?: number): Promise<{ utterances: Array<{ speaker: string; text: string; gender?: string }> } | null>;
  checkConversationHealth(baseUrl?: string): Promise<boolean>;

  // ── Relationships & reputation ──
  loadPlaythroughRelationships(playthroughId: string): Promise<any[]>;
  getReputations(playthroughId: string): Promise<any[]>;
  updatePlaythroughRelationship(playthroughId: string, fromCharacterId: string, toCharacterId: string, data: { type: string; strength: number; cause?: string }): Promise<any>;
  adjustReputation(playthroughId: string, entityType: string, entityId: string, amount: number, reason: string): Promise<any>;
  payFines(playthroughId: string, settlementId: string): Promise<any>;

  // ── Language learning ──
  loadLanguageProgress(playerId: string, worldId: string, playthroughId?: string): Promise<any>;
  saveLanguageProgress(data: { playerId: string; worldId: string; playthroughId?: string; progress: Record<string, unknown>; vocabulary: Array<Record<string, unknown>>; grammarPatterns: Array<Record<string, unknown>>; conversations: Array<Record<string, unknown>> }): Promise<void>;
  getLanguageProfile(worldId: string, playerId: string): Promise<any>;
  loadReadingProgress(playerId: string, worldId: string, playthroughId?: string): Promise<any | null>;
  syncReadingProgress(data: { playerId: string; worldId: string; playthroughId?: string; quizAnswers: any[]; totalCorrect: number; totalAttempted: number }): Promise<void>;

  // ── Player progress CEFR ──
  updatePlayerProgressCefrLevel(userId: string, worldId: string, cefrLevel: string, playthroughId?: string): Promise<void>;

  // ── Assessment (deprecated — data flows through quest overlay, not AssessmentSession collection) ──
  /** @deprecated No-op. Assessment sessions are now embedded in quest customData. */
  createAssessmentSession(data: { playerId: string; worldId: string; assessmentType: string; assessmentDefinitionId?: string; targetLanguage?: string; totalMaxPoints?: number }): Promise<any>;
  /** @deprecated No-op. Phase results are stored in quest overlay via questOverlay.updateQuest(). */
  submitAssessmentPhase(sessionId: string, phaseId: string, data: any): Promise<any>;
  /** @deprecated No-op. Assessment completion is stored in quest overlay assessmentResult. */
  completeAssessment(sessionId: string, data: { totalScore: number; maxScore?: number; cefrLevel?: string }): Promise<any>;
  getPlayerAssessments(playerId: string, worldId: string): Promise<any[]>;

  // ── Quest storage provider (for shared quest generators) ──
  getQuestStorageProvider?(): any;

  // ── Translation cache ──
  /** Fetch cached translations for a batch of English words from the server. */
  fetchTranslationBatch(worldId: string, targetLanguage: string, words: string[]): Promise<Record<string, string>>;
  /** Fetch the LLM-generated UI translation file for a world's target language. */
  fetchUITranslations(worldId: string, languageCode: string): Promise<Record<string, unknown> | null>;

  // ── Media & assets ──
  textToSpeech(text: string, voice: string, gender: string, targetLanguage?: string | null): Promise<Blob | null>;
  resolveAssetById(assetId: string): Promise<VisualAsset | null>;
  resolveAssetUrl(assetId: string): string | null;
  getPortfolio(worldId: string, playerName: string): Promise<any | null>;
}
