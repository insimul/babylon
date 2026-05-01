/**
 * ReputationManager — client-side reputation tracking with gameplay consequences.
 *
 * Listens on the GameEventBus for reputation-affecting events (quest completion,
 * quest failure, NPC conversations, item theft, etc.) and calls the server API
 * to persist reputation changes scoped to the current playthrough.
 *
 * Provides gameplay consequence queries: price multiplier, quest availability
 * check, NPC willingness to talk, and conversation context for NPC prompts.
 */

import type { GameEventBus, GameEvent } from '../logic/GameEventBus';

// ── Types ───────────────────────────────────────────────────────────────────

export type Standing = 'hostile' | 'unfriendly' | 'neutral' | 'friendly' | 'revered';

export interface ReputationRecord {
  entityType: string;
  entityId: string;
  entityName: string;
  score: number;
  standing: Standing;
  isBanned: boolean;
  banExpiry: string | null;
  violationCount: number;
  outstandingFines: number;
  hasDiscounts: boolean;
  hasSpecialAccess: boolean;
}

export interface ReputationChangeEvent {
  entityType: string;
  entityId: string;
  entityName: string;
  previousScore: number;
  newScore: number;
  previousStanding: Standing;
  newStanding: Standing;
  delta: number;
  reason: string;
}

export type ReputationChangeListener = (change: ReputationChangeEvent) => void;

// ── Consequence thresholds ──────────────────────────────────────────────────

const STANDING_THRESHOLDS: { min: number; standing: Standing }[] = [
  { min: 51, standing: 'revered' },
  { min: 1, standing: 'friendly' },
  { min: -49, standing: 'neutral' },
  { min: -99, standing: 'unfriendly' },
  { min: -Infinity, standing: 'hostile' },
];

export function scoreToStanding(score: number): Standing {
  for (const t of STANDING_THRESHOLDS) {
    if (score >= t.min) return t.standing;
  }
  return 'hostile';
}

/** Price multiplier per standing (1.0 = normal price). */
const PRICE_MULTIPLIER: Record<Standing, number> = {
  hostile: 2.0,
  unfriendly: 1.3,
  neutral: 1.0,
  friendly: 0.9,
  revered: 0.75,
};

// ── Manager ─────────────────────────────────────────────────────────────────

export class ReputationManager {
  /** In-memory cache of reputation records keyed by `${entityType}:${entityId}`. */
  private cache = new Map<string, ReputationRecord>();
  private changeListeners = new Set<ReputationChangeListener>();
  private unsubscribers: Array<() => void> = [];

  private _dataSource: any | null = null;

  constructor(
    private playthroughId: string,
    private authToken: string,
    private eventBus: GameEventBus,
  ) {
    this.subscribeToEvents();
  }

  setDataSource(ds: any): void {
    this._dataSource = ds;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Load all reputations for this playthrough. */
  async loadAll(): Promise<void> {
    try {
      if (!this._dataSource) throw new Error('No dataSource — save file not loaded');
      const records = await this._dataSource.getReputations(this.playthroughId);
      this.cache.clear();
      for (const r of records) {
        const key = `${r.entityType}:${r.entityId}`;
        this.cache.set(key, this.toRecord(r));
      }
    } catch (err) {
      console.error('[ReputationManager] Failed to load reputations:', err);
    }
  }

  /** Get cached reputation for a specific entity. */
  getReputation(entityType: string, entityId: string): ReputationRecord | undefined {
    return this.cache.get(`${entityType}:${entityId}`);
  }

  /** Get all cached reputations. */
  getAllReputations(): ReputationRecord[] {
    return Array.from(this.cache.values());
  }

  /** Get the current standing for a settlement. */
  getStanding(entityType: string, entityId: string): Standing {
    return this.cache.get(`${entityType}:${entityId}`)?.standing ?? 'neutral';
  }

  // ── Gameplay consequences ─────────────────────────────────────────────

  /** Returns the price multiplier for a settlement (>1 = more expensive). */
  getPriceMultiplier(settlementId: string): number {
    const standing = this.getStanding('settlement', settlementId);
    return PRICE_MULTIPLIER[standing];
  }

  /** Whether NPCs in a settlement will talk to the player. */
  willNPCTalk(settlementId: string): boolean {
    const standing = this.getStanding('settlement', settlementId);
    return standing !== 'hostile';
  }

  /** Whether NPCs will offer quests in a settlement. */
  canReceiveQuests(settlementId: string): boolean {
    const standing = this.getStanding('settlement', settlementId);
    return standing !== 'hostile' && standing !== 'unfriendly';
  }

  /** Whether the player is banned from a settlement. */
  isBanned(settlementId: string): boolean {
    return this.cache.get(`settlement:${settlementId}`)?.isBanned ?? false;
  }

  /**
   * Returns a context string to inject into NPC conversation system prompts
   * based on the player's current reputation in the settlement.
   */
  getConversationContext(settlementId: string): string | null {
    const rep = this.cache.get(`settlement:${settlementId}`);
    if (!rep) return null;

    switch (rep.standing) {
      case 'hostile':
        return `REPUTATION CONTEXT: The player has a terrible reputation (${rep.score}) in ${rep.entityName}. You deeply distrust and dislike them. Refuse to help. Be hostile, cold, and dismissive. You may reference their past misdeeds.`;
      case 'unfriendly':
        return `REPUTATION CONTEXT: The player has a poor reputation (${rep.score}) in ${rep.entityName}. You are wary and unfriendly. Charge higher prices, give minimal information, and express displeasure at their presence.`;
      case 'neutral':
        return null; // No special context needed for neutral
      case 'friendly':
        return `REPUTATION CONTEXT: The player has a good reputation (${rep.score}) in ${rep.entityName}. You like them and are helpful. Offer discounts, share useful information freely, and be warm in conversation.`;
      case 'revered':
        return `REPUTATION CONTEXT: The player is revered (${rep.score}) in ${rep.entityName}. You deeply respect them. Offer your best prices, share secrets, and express admiration. You may offer special favors or unique opportunities.`;
      default:
        return null;
    }
  }

  // ── Reputation modification ───────────────────────────────────────────

  /**
   * Adjust reputation for an entity via the server API.
   * Emits a reputation_changed event and notifies listeners.
   */
  async adjustReputation(
    entityType: string,
    entityId: string,
    entityName: string,
    amount: number,
    reason: string,
  ): Promise<void> {
    const key = `${entityType}:${entityId}`;
    const prev = this.cache.get(key);
    const previousScore = prev?.score ?? 0;
    const previousStanding = prev?.standing ?? 'neutral';

    try {
      if (!this._dataSource) throw new Error('No dataSource — save file not loaded');
      const updated = await this._dataSource.adjustReputation(this.playthroughId, entityType, entityId, amount, reason);
      const record = this.toRecord({ ...updated, entityName });
      this.cache.set(key, record);

      const change: ReputationChangeEvent = {
        entityType,
        entityId,
        entityName,
        previousScore,
        newScore: record.score,
        previousStanding,
        newStanding: record.standing,
        delta: amount,
        reason,
      };
      this.notifyListeners(change);
      this.eventBus.emit({ type: 'reputation_changed', factionId: entityId, delta: amount });
    } catch (err) {
      console.error('[ReputationManager] Error adjusting reputation:', err);
    }
  }

  // ── Listeners ─────────────────────────────────────────────────────────

  /** Register a listener for reputation changes (for UI notifications). */
  onReputationChange(listener: ReputationChangeListener): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  /** Serialize cache for save state. */
  serialize(): ReputationRecord[] {
    return Array.from(this.cache.values());
  }

  /** Restore cache from save state. */
  restore(records: ReputationRecord[]): void {
    this.cache.clear();
    for (const r of records) {
      this.cache.set(`${r.entityType}:${r.entityId}`, r);
    }
  }

  /** Clean up all event subscriptions. */
  dispose(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    this.changeListeners.clear();
    this.cache.clear();
  }

  // ── Private ───────────────────────────────────────────────────────────

  private subscribeToEvents(): void {
    // Quest completed for a settlement → positive reputation
    this.unsubscribers.push(
      this.eventBus.on('quest_completed', (e) => {
        this.handleQuestCompleted(e.questId, e.assignedByNpcId);
      }),
    );

    // Quest failed → negative reputation
    this.unsubscribers.push(
      this.eventBus.on('quest_failed', (e) => {
        this.handleQuestFailed(e.questId, e.assignedByNpcId);
      }),
    );

    // NPC talked → small positive reputation
    this.unsubscribers.push(
      this.eventBus.on('npc_talked', (e) => {
        this.handleNPCTalked(e.npcId, e.npcName, e.turnCount);
      }),
    );

    // Settlement entered → check ban status
    this.unsubscribers.push(
      this.eventBus.on('settlement_entered', (e) => {
        this.handleSettlementEntered(e.settlementId, e.settlementName);
      }),
    );

    // Merchant purchase → small positive reputation
    this.unsubscribers.push(
      this.eventBus.on('item_purchased', (_e) => {
        this.handleMerchantPurchase();
      }),
    );

    // Gift given → positive reputation
    this.unsubscribers.push(
      this.eventBus.on('gift_given', (e) => {
        this.handleGiftGiven(e.npcName);
      }),
    );
  }

  private currentSettlement: { id: string; name: string } | null = null;

  private async handleQuestCompleted(_questId: string, _assignedByNpcId?: string): Promise<void> {
    if (!this.currentSettlement) return;
    await this.adjustReputation(
      'settlement',
      this.currentSettlement.id,
      this.currentSettlement.name,
      10,
      'Completed a quest',
    );
  }

  private async handleQuestFailed(_questId: string, _assignedByNpcId?: string): Promise<void> {
    if (!this.currentSettlement) return;
    await this.adjustReputation(
      'settlement',
      this.currentSettlement.id,
      this.currentSettlement.name,
      -5,
      'Failed a quest',
    );
  }

  private conversationCooldowns = new Map<string, number>();

  private async handleNPCTalked(npcId: string, _npcName: string, turnCount: number): Promise<void> {
    if (!this.currentSettlement) return;
    // Only grant reputation if conversation had >= 3 turns and cooldown elapsed
    if (turnCount < 3) return;
    const now = Date.now();
    const lastTime = this.conversationCooldowns.get(npcId) ?? 0;
    if (now - lastTime < 5 * 60 * 1000) return; // 5 minute cooldown per NPC
    this.conversationCooldowns.set(npcId, now);

    await this.adjustReputation(
      'settlement',
      this.currentSettlement.id,
      this.currentSettlement.name,
      2,
      'Had a conversation with a local',
    );
  }

  private async handleSettlementEntered(settlementId: string, settlementName: string): Promise<void> {
    this.currentSettlement = { id: settlementId, name: settlementName };

    // Ensure we have a reputation record for this settlement
    const key = `settlement:${settlementId}`;
    if (!this.cache.has(key)) {
      this.cache.set(key, {
        entityType: 'settlement',
        entityId: settlementId,
        entityName: settlementName,
        score: 0,
        standing: 'neutral',
        isBanned: false,
        banExpiry: null,
        violationCount: 0,
        outstandingFines: 0,
        hasDiscounts: false,
        hasSpecialAccess: false,
      });
    }
  }

  /**
   * Called externally (by RuleEnforcer or similar) when the player steals an item.
   * This is a large reputation penalty.
   */
  async recordTheft(settlementId: string, settlementName: string): Promise<void> {
    await this.adjustReputation(
      'settlement',
      settlementId,
      settlementName,
      -15,
      'Caught stealing',
    );
  }

  /**
   * Called externally when the player is polite in conversation.
   */
  async recordPoliteConversation(settlementId: string, settlementName: string): Promise<void> {
    await this.adjustReputation(
      'settlement',
      settlementId,
      settlementName,
      1,
      'Polite conversation',
    );
  }

  /**
   * Called externally when the player is rude in conversation.
   */
  async recordRudeConversation(settlementId: string, settlementName: string): Promise<void> {
    await this.adjustReputation(
      'settlement',
      settlementId,
      settlementName,
      -3,
      'Rude conversation',
    );
  }

  private async handleMerchantPurchase(): Promise<void> {
    if (!this.currentSettlement) return;
    await this.adjustReputation(
      'settlement',
      this.currentSettlement.id,
      this.currentSettlement.name,
      2,
      'Purchased from a local merchant',
    );
  }

  private async handleGiftGiven(npcName: string): Promise<void> {
    if (!this.currentSettlement) return;
    await this.adjustReputation(
      'settlement',
      this.currentSettlement.id,
      this.currentSettlement.name,
      3,
      `Gave a gift to ${npcName}`,
    );
  }

  /** Update the current settlement reference (called by BabylonGame on zone change). */
  setCurrentSettlement(id: string, name: string): void {
    this.currentSettlement = { id, name };
  }

  private notifyListeners(change: ReputationChangeEvent): void {
    this.changeListeners.forEach((listener) => {
      try {
        listener(change);
      } catch (err) {
        console.error('[ReputationManager] Listener error:', err);
      }
    });
  }

  private headers(): Record<string, string> {
    return this.authToken
      ? { Authorization: `Bearer ${this.authToken}` }
      : {};
  }

  private toRecord(data: any): ReputationRecord {
    return {
      entityType: data.entityType ?? 'settlement',
      entityId: data.entityId ?? '',
      entityName: data.entityName ?? 'Unknown',
      score: data.score ?? 0,
      standing: (data.standing as Standing) ?? scoreToStanding(data.score ?? 0),
      isBanned: data.isBanned ?? false,
      banExpiry: data.banExpiry ?? null,
      violationCount: data.violationCount ?? 0,
      outstandingFines: data.outstandingFines ?? 0,
      hasDiscounts: data.hasDiscounts ?? false,
      hasSpecialAccess: data.hasSpecialAccess ?? false,
    };
  }
}
