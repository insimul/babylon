/**
 * RelationshipManager
 *
 * Client-side manager for playthrough-scoped NPC relationships.
 * - Loads relationship overlays on game start
 * - Listens to GameEventBus for relationship-changing events
 * - Maintains in-memory cache of current NPC relationships
 * - Persists changes to server via DataSource
 * - Emits npc_relationship_changed events for UI notifications
 * - Provides relationship context for NPC conversation prompts
 */

import type { GameEventBus } from './GameEventBus';
import type { IDataSource } from '@shared/game-engine/data-source';
import {
  getRelationshipTier,
  getRelationshipTierLabel,
  RELATIONSHIP_DELTAS,
  type RelationshipTier,
  type RelationshipDeltaCause,
} from '@shared/relationship-tiers';

export interface NPCRelationship {
  npcId: string;
  npcName: string;
  type: string;
  strength: number;
  tier: RelationshipTier;
  lastModified: number;
}

interface RelationshipManagerConfig {
  playthroughId: string;
  playerCharacterId: string;
  eventBus: GameEventBus;
  dataSource: IDataSource;
  /** Callback for showing toast notifications */
  onNotification?: (message: string, variant?: 'default' | 'success' | 'destructive') => void;
}

export class RelationshipManager {
  private relationships = new Map<string, NPCRelationship>();
  private npcNames = new Map<string, string>();
  private unsubscribers: (() => void)[] = [];
  private config: RelationshipManagerConfig;
  private saveDebounce = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(config: RelationshipManagerConfig) {
    this.config = config;
  }

  /** Load existing relationship overlays from server and subscribe to events. */
  async initialize(characters: Array<{ id: string; firstName?: string; lastName?: string; name?: string }>): Promise<void> {
    // Build NPC name lookup
    for (const char of characters) {
      const name = char.name || `${char.firstName || ''} ${char.lastName || ''}`.trim() || 'Unknown';
      this.npcNames.set(char.id, name);
    }

    // Load existing overlays
    try {
      const overlays = await this.config.dataSource.loadPlaythroughRelationships(this.config.playthroughId);
      for (const overlay of overlays) {
        if (overlay.fromCharacterId === this.config.playerCharacterId) {
          this.relationships.set(overlay.toCharacterId, {
            npcId: overlay.toCharacterId,
            npcName: this.npcNames.get(overlay.toCharacterId) || 'Unknown',
            type: overlay.type || 'acquaintance',
            strength: overlay.strength || 0,
            tier: getRelationshipTier(overlay.strength || 0),
            lastModified: overlay.lastModified || Date.now(),
          });
        }
      }
    } catch (err) {
      console.error('[RelationshipManager] Failed to load relationships:', err);
    }

    this.subscribeToEvents();
  }

  /** Subscribe to game events that affect relationships. */
  private subscribeToEvents(): void {
    const { eventBus } = this.config;

    this.unsubscribers.push(
      eventBus.on('npc_talked', (e) => {
        this.modifyRelationship(e.npcId, RELATIONSHIP_DELTAS.conversation, 'conversation', e.npcName);
      }),
      eventBus.on('quest_completed', (e) => {
        if (e.assignedByNpcId) {
          this.modifyRelationship(e.assignedByNpcId, RELATIONSHIP_DELTAS.quest_completed, 'quest_completed');
        }
      }),
      eventBus.on('quest_failed', (e) => {
        if (e.assignedByNpcId) {
          this.modifyRelationship(e.assignedByNpcId, RELATIONSHIP_DELTAS.quest_failed, 'quest_failed');
        }
      }),
      eventBus.on('item_delivered', (e) => {
        this.modifyRelationship(e.npcId, RELATIONSHIP_DELTAS.item_delivered, 'item_delivered');
      }),
    );
  }

  /** Modify relationship strength for an NPC and persist. */
  modifyRelationship(npcId: string, delta: number, cause: string, npcName?: string): void {
    const existing = this.relationships.get(npcId);
    const previousStrength = existing?.strength ?? 0;
    const previousTier = getRelationshipTier(previousStrength);
    const newStrength = Math.max(-1, Math.min(1, previousStrength + delta));
    const newTier = getRelationshipTier(newStrength);
    const resolvedName = npcName || this.npcNames.get(npcId) || 'Unknown';

    const updated: NPCRelationship = {
      npcId,
      npcName: resolvedName,
      type: existing?.type || 'acquaintance',
      strength: newStrength,
      tier: newTier,
      lastModified: Date.now(),
    };
    this.relationships.set(npcId, updated);

    // Emit event
    this.config.eventBus.emit({
      type: 'npc_relationship_changed',
      npcId,
      npcName: resolvedName,
      previousStrength,
      newStrength,
      previousTier: previousTier.id,
      newTier: newTier.id,
      cause,
      delta,
    });

    // Show notification on tier change
    if (previousTier.id !== newTier.id && this.config.onNotification) {
      const direction = newStrength > previousStrength ? 'improved' : 'worsened';
      this.config.onNotification(
        `Relationship with ${resolvedName} ${direction} to ${newTier.label}`,
        newStrength > previousStrength ? 'success' : 'destructive',
      );
    }

    // Debounced persist to server
    this.debouncedSave(npcId, updated);
  }

  /** Persist relationship change to server with debouncing. */
  private debouncedSave(npcId: string, rel: NPCRelationship): void {
    const existing = this.saveDebounce.get(npcId);
    if (existing) clearTimeout(existing);

    this.saveDebounce.set(npcId, setTimeout(() => {
      this.saveDebounce.delete(npcId);
      this.config.dataSource.updatePlaythroughRelationship(
        this.config.playthroughId,
        this.config.playerCharacterId,
        npcId,
        { type: rel.type, strength: rel.strength, cause: 'gameplay' },
      ).catch(err => console.error('[RelationshipManager] Save failed:', err));
    }, 2000));
  }

  /** Get the current relationship with an NPC. */
  getRelationship(npcId: string): NPCRelationship | null {
    return this.relationships.get(npcId) || null;
  }

  /** Get the relationship strength with an NPC (0 if no relationship). */
  getStrength(npcId: string): number {
    return this.relationships.get(npcId)?.strength ?? 0;
  }

  /** Get the relationship tier for an NPC. */
  getTier(npcId: string): RelationshipTier {
    return getRelationshipTier(this.getStrength(npcId));
  }

  /** Get the relationship tier label for an NPC. */
  getTierLabel(npcId: string): string {
    return getRelationshipTierLabel(this.getStrength(npcId));
  }

  /** Get all tracked relationships. */
  getAllRelationships(): NPCRelationship[] {
    return Array.from(this.relationships.values());
  }

  /** Get the price multiplier for an NPC (for merchant transactions). */
  getPriceMultiplier(npcId: string): number {
    return this.getTier(npcId).priceMultiplier;
  }

  /** Check if an NPC will offer quests at current relationship level. */
  canOfferQuests(npcId: string): boolean {
    return this.getTier(npcId).canOfferQuests;
  }

  /** Check if an NPC will share secrets at current relationship level. */
  canShareSecrets(npcId: string): boolean {
    return this.getTier(npcId).canShareSecrets;
  }

  /**
   * Build conversation context string for an NPC's system prompt.
   * Returns null if the NPC is a stranger (no special context needed).
   */
  getConversationContext(npcId: string): string | null {
    const rel = this.relationships.get(npcId);
    if (!rel) return null;
    const tier = rel.tier;
    if (tier.id === 'stranger') return null;
    return `\n\nRELATIONSHIP CONTEXT: Your relationship with this person is "${tier.label}" (${tier.id}). ${tier.conversationContext}`;
  }

  /** Clean up subscriptions and pending saves. */
  dispose(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers = [];
    this.saveDebounce.forEach((timeout) => clearTimeout(timeout));
    this.saveDebounce.clear();
  }
}
