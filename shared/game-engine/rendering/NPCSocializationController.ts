/**
 * NPCSocializationController
 *
 * Drives autonomous NPC-to-NPC socialization. NPCs at the same location
 * evaluate socialization every 5 game-minutes based on personality,
 * relationship, mood, and time of day.
 *
 * When socializing: NPCs walk toward each other, face each other,
 * and play talk/listen animations. Triggers server-side NPC-NPC
 * conversation engine and streams text to nearby players.
 */

import { Vector3 } from '@babylonjs/core';
import type { AnimationState } from './NPCAnimationController';

// ── Types ──────────────────────────────────────────────────────────────

/** NPC data needed for socialization evaluation */
export interface SocializableNPC {
  id: string;
  position: Vector3;
  /** Big Five personality traits (0-1 scale) */
  personality: {
    openness: number;
    conscientiousness: number;
    extroversion: number;
    agreeableness: number;
    neuroticism: number;
  };
  /** Relationships with other NPCs: Record<npcId, {strength, trust, type}> */
  relationships: Record<string, { type?: string; strength?: number; trust?: number }>;
  /** Current emotional state */
  mood: string;
  /** Whether currently in conversation with player */
  isInConversation: boolean;
  /** Location group ID (building, settlement area, etc.) */
  locationId: string;
}

/** Active socialization pair */
export interface SocializationPair {
  npc1Id: string;
  npc2Id: string;
  startTime: number;
  /** Duration in game-minutes */
  durationMinutes: number;
  /** Current exchange index */
  exchangeIndex: number;
  /** Max exchanges */
  maxExchanges: number;
  /** Whether NPCs have reached each other */
  hasReached: boolean;
  /** Server conversation result (populated async) */
  conversationText: string[];
  /** Location where socialization started */
  locationId: string;
  /** Pre-conversation positions so NPCs return after talking */
  npc1OriginalPos?: Vector3;
  npc2OriginalPos?: Vector3;
}

/** Callbacks for socialization events */
export interface SocializationCallbacks {
  /** Move NPC toward a position */
  onMoveTo?: (npcId: string, targetPosition: Vector3, speed: 'stroll' | 'walk') => void;
  /** Change NPC animation */
  onAnimationChange?: (npcId: string, state: AnimationState) => void;
  /** Face NPC toward a position */
  onFaceDirection?: (npcId: string, targetPosition: Vector3) => void;
  /** Trigger server-side NPC-NPC conversation */
  onStartConversation?: (npc1Id: string, npc2Id: string, topic?: string) => Promise<ConversationResult | null>;
  /** Update relationship between two NPCs */
  onRelationshipUpdate?: (npc1Id: string, npc2Id: string, delta: RelationshipDelta) => void;
  /** Emit event to GameEventBus */
  onEmitEvent?: (event: any) => void;
  /** Stream conversation text to player (if within range) */
  onStreamToPlayer?: (text: string, speakerId: string, speakerName: string) => void;
  /** Get current game hour (0-23) */
  getGameHour?: () => number;
  /** Get player position for overhearing range check */
  getPlayerPosition?: () => Vector3 | null;
}

/** Result from server-side conversation */
export interface ConversationResult {
  exchanges: Array<{ speakerId: string; speakerName: string; text: string }>;
  relationshipDelta: RelationshipDelta;
  topic: string;
  languageUsed: string;
}

/** Relationship change from a conversation */
export interface RelationshipDelta {
  friendshipChange: number;
  trustChange: number;
  romanceSpark: number;
}

// ── Constants ──────────────────────────────────────────────────────────

/** Evaluation interval in game-minutes */
const EVAL_INTERVAL_GAME_MINUTES = 5;

/** Distance threshold for NPCs to be "at the same location" */
const SAME_LOCATION_RADIUS = 20;

/** Distance for NPCs to stand when socializing */
const CONVERSATION_DISTANCE = 2.0;

/** Player overhearing range */
const OVERHEARING_RANGE = 25;

/** Max concurrent socializations */
const MAX_CONCURRENT_SOCIALIZATIONS = 5;

/** Time between conversation text chunks in ms */
const TEXT_STREAM_INTERVAL_MS = 3000;

// ── Controller ─────────────────────────────────────────────────────────

export class NPCSocializationController {
  private callbacks: SocializationCallbacks;

  // Registered NPCs
  private npcs: Map<string, SocializableNPC> = new Map();

  // Active socialization pairs
  private activePairs: Map<string, SocializationPair> = new Map();

  // Post-conversation cooldowns: npcId → timestamp when last conversation ended
  // NPCs cannot start a new socialization for SOCIALIZATION_COOLDOWN_MS after ending one
  private _npcCooldowns: Map<string, number> = new Map();
  private static readonly SOCIALIZATION_COOLDOWN_MS = 120_000; // 2 minutes real-time

  // Timing
  private accumulatedGameMinutes = 0;
  private lastEvalGameMinute = 0;

  // Text streaming
  private textStreamTimers: Map<string, number> = new Map();

  constructor(callbacks: SocializationCallbacks) {
    this.callbacks = callbacks;
  }

  /**
   * Register an NPC for socialization evaluation.
   */
  registerNPC(npc: SocializableNPC): void {
    this.npcs.set(npc.id, npc);
  }

  /**
   * Update NPC data (position, mood, conversation state).
   */
  updateNPC(npcId: string, updates: Partial<SocializableNPC>): void {
    const npc = this.npcs.get(npcId);
    if (npc) {
      Object.assign(npc, updates);
    }
  }

  /**
   * Unregister an NPC.
   */
  unregisterNPC(npcId: string): void {
    this.npcs.delete(npcId);
    // Cancel any active socialization involving this NPC
    this.cancelSocializationsForNPC(npcId);
  }

  /**
   * Frame update. Advances game time and evaluates socialization.
   * @param deltaTimeMs Real time since last frame
   * @param msPerGameHour Real ms per game hour
   */
  update(deltaTimeMs: number, msPerGameHour: number): void {
    // Convert to game-minutes
    const gameMinutesDelta = (deltaTimeMs / msPerGameHour) * 60;
    this.accumulatedGameMinutes += gameMinutesDelta;

    // Evaluate socialization periodically
    if (this.accumulatedGameMinutes - this.lastEvalGameMinute >= EVAL_INTERVAL_GAME_MINUTES) {
      this.lastEvalGameMinute = this.accumulatedGameMinutes;
      this.evaluateSocialization();
    }

    // Update active pairs (check if NPCs have reached each other)
    this.updateActivePairs(gameMinutesDelta);
  }

  /**
   * Get all active socialization pairs.
   */
  getActivePairs(): SocializationPair[] {
    return Array.from(this.activePairs.values());
  }

  /**
   * Check if an NPC is currently socializing.
   */
  isSocializing(npcId: string): boolean {
    const entries = Array.from(this.activePairs.values());
    return entries.some(p => p.npc1Id === npcId || p.npc2Id === npcId);
  }

  /**
   * Get the number of active socialization pairs.
   */
  getActiveCount(): number {
    return this.activePairs.size;
  }

  /**
   * Evaluate which NPCs should start socializing.
   */
  private evaluateSocialization(): void {
    if (this.activePairs.size >= MAX_CONCURRENT_SOCIALIZATIONS) return;

    const gameHour = this.callbacks.getGameHour?.() ?? 12;

    // Group NPCs by location
    const locationGroups = this.groupNPCsByLocation();

    // For each group, evaluate potential socializations
    const groupEntries = Array.from(locationGroups.entries());
    for (const [_locationId, npcsAtLocation] of groupEntries) {
      if (npcsAtLocation.length < 2) continue;
      if (this.activePairs.size >= MAX_CONCURRENT_SOCIALIZATIONS) break;

      // Find the best pair to socialize
      const pair = this.findBestPair(npcsAtLocation, gameHour);
      if (pair) {
        this.startSocialization(pair.npc1, pair.npc2, _locationId);
      }
    }
  }

  /**
   * Group NPCs by their location (using position proximity).
   */
  private groupNPCsByLocation(): Map<string, SocializableNPC[]> {
    const groups = new Map<string, SocializableNPC[]>();
    const npcList = Array.from(this.npcs.values());

    const now = Date.now();
    for (const npc of npcList) {
      // Skip NPCs in conversation with player or already socializing
      if (npc.isInConversation || this.isSocializing(npc.id)) continue;
      // Skip NPCs on post-conversation cooldown
      const lastConv = this._npcCooldowns.get(npc.id);
      if (lastConv && now - lastConv < NPCSocializationController.SOCIALIZATION_COOLDOWN_MS) continue;

      const locId = npc.locationId || 'overworld';
      const group = groups.get(locId);
      if (group) {
        group.push(npc);
      } else {
        groups.set(locId, [npc]);
      }
    }

    return groups;
  }

  /**
   * Find the best pair of NPCs to socialize from a group at the same location.
   * Returns null if no pair meets the probability threshold.
   */
  private findBestPair(
    npcs: SocializableNPC[],
    gameHour: number
  ): { npc1: SocializableNPC; npc2: SocializableNPC } | null {
    let bestScore = 0;
    let bestPair: { npc1: SocializableNPC; npc2: SocializableNPC } | null = null;

    for (let i = 0; i < npcs.length; i++) {
      for (let j = i + 1; j < npcs.length; j++) {
        const npc1 = npcs[i];
        const npc2 = npcs[j];

        // Check distance
        const dx = npc1.position.x - npc2.position.x;
        const dz = npc1.position.z - npc2.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > SAME_LOCATION_RADIUS) continue;

        const prob = this.calculateSocializationProbability(npc1, npc2, gameHour);
        if (prob > bestScore) {
          bestScore = prob;
          bestPair = { npc1, npc2 };
        }
      }
    }

    // Only socialize if probability exceeds threshold (random check)
    if (bestPair && Math.random() < bestScore) {
      return bestPair;
    }
    return null;
  }

  /**
   * Calculate the probability of two NPCs socializing.
   * Based on: extroversion, relationship level, mood, time of day.
   */
  calculateSocializationProbability(
    npc1: SocializableNPC,
    npc2: SocializableNPC,
    gameHour: number
  ): number {
    // Base probability from extroversion (average of both)
    const avgExtroversion = (npc1.personality.extroversion + npc2.personality.extroversion) / 2;
    let prob = avgExtroversion * 0.4; // 0-0.4 from extroversion

    // Relationship bonus
    const rel1 = npc1.relationships[npc2.id];
    const rel2 = npc2.relationships[npc1.id];
    const avgRelStrength = ((rel1?.strength ?? 0) + (rel2?.strength ?? 0)) / 2;
    prob += avgRelStrength * 0.3; // 0-0.3 from relationship

    // Mood modifier
    const positiveMoods = new Set(['happy', 'excited', 'content', 'grateful', 'amused']);
    const negativeMoods = new Set(['angry', 'sad', 'fearful', 'disgusted', 'anxious']);
    if (positiveMoods.has(npc1.mood) && positiveMoods.has(npc2.mood)) {
      prob += 0.15;
    } else if (negativeMoods.has(npc1.mood) || negativeMoods.has(npc2.mood)) {
      prob -= 0.1;
    }

    // Time of day modifier: more social during day (8-20), less at night
    if (gameHour >= 8 && gameHour <= 20) {
      prob += 0.1;
    } else {
      prob -= 0.15;
    }

    // Agreeableness bonus (friendly NPCs socialize more)
    const avgAgreeableness = (npc1.personality.agreeableness + npc2.personality.agreeableness) / 2;
    prob += avgAgreeableness * 0.1;

    // Clamp
    return Math.max(0, Math.min(1, prob));
  }

  /**
   * Start a socialization between two NPCs.
   */
  private startSocialization(npc1: SocializableNPC, npc2: SocializableNPC, locationId: string): void {
    const pairId = `${npc1.id}_${npc2.id}`;

    // Calculate duration based on extroversion (extroverts talk longer)
    const avgExtro = (npc1.personality.extroversion + npc2.personality.extroversion) / 2;
    const maxExchanges = Math.round(3 + avgExtro * 5); // 3-8 exchanges

    const pair: SocializationPair = {
      npc1Id: npc1.id,
      npc2Id: npc2.id,
      startTime: Date.now(),
      durationMinutes: maxExchanges * 2, // ~2 game-minutes per exchange
      exchangeIndex: 0,
      maxExchanges,
      hasReached: false,
      conversationText: [],
      locationId,
      npc1OriginalPos: npc1.position.clone(),
      npc2OriginalPos: npc2.position.clone(),
    };

    this.activePairs.set(pairId, pair);

    // Move NPCs toward each other
    const midpoint = new Vector3(
      (npc1.position.x + npc2.position.x) / 2,
      (npc1.position.y + npc2.position.y) / 2,
      (npc1.position.z + npc2.position.z) / 2
    );

    // NPC1 walks to a point slightly offset from midpoint
    const offset1 = new Vector3(CONVERSATION_DISTANCE / 2, 0, 0);
    const offset2 = new Vector3(-CONVERSATION_DISTANCE / 2, 0, 0);

    this.callbacks.onMoveTo?.(npc1.id, midpoint.add(offset1), 'stroll');
    this.callbacks.onMoveTo?.(npc2.id, midpoint.add(offset2), 'stroll');

    // Emit event
    this.callbacks.onEmitEvent?.({
      type: 'ambient_conversation_started',
      conversationId: pairId,
      participants: [npc1.id, npc2.id] as [string, string],
      locationId,
      topic: 'socialization',
    });

    // Trigger server-side conversation
    this.triggerConversation(pairId, npc1.id, npc2.id);
  }

  /**
   * Trigger the server-side NPC-NPC conversation engine.
   */
  private async triggerConversation(pairId: string, npc1Id: string, npc2Id: string): Promise<void> {
    if (!this.callbacks.onStartConversation) return;

    try {
      const result = await this.callbacks.onStartConversation(npc1Id, npc2Id);
      const pair = this.activePairs.get(pairId);
      if (!pair || !result) return;

      // Store conversation text for streaming
      pair.conversationText = result.exchanges.map(
        (e) => `${e.speakerName}: ${e.text}`
      );

      // Apply relationship delta
      if (result.relationshipDelta) {
        this.callbacks.onRelationshipUpdate?.(npc1Id, npc2Id, result.relationshipDelta);
      }

      // Stream text to player if within range
      this.startTextStreaming(pairId, result);
    } catch (_err) {
      // Conversation failed — NPCs will just stand together briefly and then part
    }
  }

  /**
   * Stream conversation text to the player if within overhearing range.
   */
  private startTextStreaming(pairId: string, result: ConversationResult): void {
    const pair = this.activePairs.get(pairId);
    if (!pair || !result.exchanges.length) return;

    let exchangeIdx = 0;
    const streamNext = () => {
      const currentPair = this.activePairs.get(pairId);
      if (!currentPair || exchangeIdx >= result.exchanges.length) {
        this.textStreamTimers.delete(pairId);
        return;
      }

      // Check if player is within range
      const playerPos = this.callbacks.getPlayerPosition?.();
      if (playerPos) {
        const npc1 = this.npcs.get(currentPair.npc1Id);
        if (npc1) {
          const dx = playerPos.x - npc1.position.x;
          const dz = playerPos.z - npc1.position.z;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist <= OVERHEARING_RANGE) {
            const exchange = result.exchanges[exchangeIdx];
            this.callbacks.onStreamToPlayer?.(exchange.text, exchange.speakerId, exchange.speakerName);

            // Emit overheard event
            this.callbacks.onEmitEvent?.({
              type: 'conversation_overheard',
              npcId1: currentPair.npc1Id,
              npcId2: currentPair.npc2Id,
              topic: result.topic,
              languageUsed: result.languageUsed,
            });
          }
        }
      }

      exchangeIdx++;
      currentPair.exchangeIndex = exchangeIdx;

      // Schedule next exchange
      if (exchangeIdx < result.exchanges.length) {
        const timer = setTimeout(streamNext, TEXT_STREAM_INTERVAL_MS) as unknown as number;
        this.textStreamTimers.set(pairId, timer);
      } else {
        this.textStreamTimers.delete(pairId);
      }
    };

    // Start streaming after initial delay
    const timer = setTimeout(streamNext, TEXT_STREAM_INTERVAL_MS) as unknown as number;
    this.textStreamTimers.set(pairId, timer);
  }

  /**
   * Update active socialization pairs.
   */
  private updateActivePairs(_gameMinutesDelta: number): void {
    const toRemove: string[] = [];
    const entries = Array.from(this.activePairs.entries());

    for (const [pairId, pair] of entries) {
      const npc1 = this.npcs.get(pair.npc1Id);
      const npc2 = this.npcs.get(pair.npc2Id);

      if (!npc1 || !npc2) {
        toRemove.push(pairId);
        continue;
      }

      // Check if NPCs have reached each other
      if (!pair.hasReached) {
        const dx = npc1.position.x - npc2.position.x;
        const dz = npc1.position.z - npc2.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist <= CONVERSATION_DISTANCE * 2) {
          pair.hasReached = true;
          // Face each other and start talking
          this.callbacks.onFaceDirection?.(npc1.id, npc2.position);
          this.callbacks.onFaceDirection?.(npc2.id, npc1.position);
          this.callbacks.onAnimationChange?.(npc1.id, 'talk');
          this.callbacks.onAnimationChange?.(npc2.id, 'listen');
        }
      } else {
        // Alternate talk/listen animations
        const elapsed = Date.now() - pair.startTime;
        const exchangePeriod = 4000; // 4 seconds per exchange
        const currentExchange = Math.floor(elapsed / exchangePeriod);
        if (currentExchange % 2 === 0) {
          this.callbacks.onAnimationChange?.(npc1.id, 'talk');
          this.callbacks.onAnimationChange?.(npc2.id, 'listen');
        } else {
          this.callbacks.onAnimationChange?.(npc1.id, 'listen');
          this.callbacks.onAnimationChange?.(npc2.id, 'talk');
        }
      }

      // Check if conversation is done
      const elapsedMs = Date.now() - pair.startTime;
      const estimatedDurationMs = pair.durationMinutes * 60 * 1000; // Would use game time in reality
      if (elapsedMs > estimatedDurationMs || pair.exchangeIndex >= pair.maxExchanges) {
        this.endSocialization(pairId, pair);
        toRemove.push(pairId);
      }
    }

    for (const id of toRemove) {
      this.activePairs.delete(id);
    }
  }

  /**
   * End a socialization pair.
   */
  private endSocialization(pairId: string, pair: SocializationPair): void {
    // Return NPCs to idle
    this.callbacks.onAnimationChange?.(pair.npc1Id, 'idle');
    this.callbacks.onAnimationChange?.(pair.npc2Id, 'idle');

    // Return NPCs to their original positions so they don't cluster
    if (pair.npc1OriginalPos) {
      this.callbacks.onMoveTo?.(pair.npc1Id, pair.npc1OriginalPos, 'stroll');
    }
    if (pair.npc2OriginalPos) {
      this.callbacks.onMoveTo?.(pair.npc2Id, pair.npc2OriginalPos, 'stroll');
    }

    // Set cooldown so these NPCs don't immediately re-pair
    const now = Date.now();
    this._npcCooldowns.set(pair.npc1Id, now);
    this._npcCooldowns.set(pair.npc2Id, now);

    // Clear any pending text stream
    const timer = this.textStreamTimers.get(pairId);
    if (timer) {
      clearTimeout(timer);
      this.textStreamTimers.delete(pairId);
    }

    // Emit end event
    this.callbacks.onEmitEvent?.({
      type: 'ambient_conversation_ended',
      conversationId: pairId,
      participants: [pair.npc1Id, pair.npc2Id] as [string, string],
      durationMs: Date.now() - pair.startTime,
      vocabularyCount: pair.conversationText.length,
    });
  }

  /**
   * Cancel all socializations involving an NPC.
   */
  private cancelSocializationsForNPC(npcId: string): void {
    const toRemove: string[] = [];
    const entries = Array.from(this.activePairs.entries());
    for (const [pairId, pair] of entries) {
      if (pair.npc1Id === npcId || pair.npc2Id === npcId) {
        this.endSocialization(pairId, pair);
        toRemove.push(pairId);
      }
    }
    for (const id of toRemove) {
      this.activePairs.delete(id);
    }
  }

  /**
   * Get personality-driven preferred position behavior.
   * Introverts prefer corners/edges, extroverts prefer center/groups.
   */
  getPreferredPosition(npcId: string, areaCenter: Vector3, areaRadius: number): Vector3 {
    const npc = this.npcs.get(npcId);
    if (!npc) return areaCenter.clone();

    const extro = npc.personality.extroversion;

    if (extro < 0.3) {
      // Introvert: seek quiet corner (edge of area)
      const angle = Math.random() * Math.PI * 2;
      const dist = areaRadius * 0.8;
      return new Vector3(
        areaCenter.x + Math.cos(angle) * dist,
        areaCenter.y,
        areaCenter.z + Math.sin(angle) * dist
      );
    } else if (extro > 0.7) {
      // Extrovert: stay near center / near other NPCs
      const smallOffset = (Math.random() - 0.5) * areaRadius * 0.3;
      return new Vector3(
        areaCenter.x + smallOffset,
        areaCenter.y,
        areaCenter.z + smallOffset
      );
    } else {
      // Middle: moderate distance
      const angle = Math.random() * Math.PI * 2;
      const dist = areaRadius * 0.4;
      return new Vector3(
        areaCenter.x + Math.cos(angle) * dist,
        areaCenter.y,
        areaCenter.z + Math.sin(angle) * dist
      );
    }
  }

  /**
   * Clean up all resources.
   */
  dispose(): void {
    // Clear all text stream timers
    const timers = Array.from(this.textStreamTimers.values());
    for (const timer of timers) {
      clearTimeout(timer);
    }
    this.textStreamTimers.clear();

    // End all active pairs
    const entries = Array.from(this.activePairs.entries());
    for (const [pairId, pair] of entries) {
      this.endSocialization(pairId, pair);
    }
    this.activePairs.clear();
    this.npcs.clear();
  }
}
