/**
 * NPCProximitySpeechSystem — Unified NPC greeting trigger system.
 *
 * Evaluates once per second: finds idle NPCs within 8m of the player,
 * uses personality-driven probability to decide if they greet, acquires
 * NpcAudioLock, and calls generateAndSpeakGreeting for TTS playback.
 *
 * Replaces NPCGreetingSystem, callouts, walking interrupts, and NPC approach.
 */

import { Vector3 } from '@babylonjs/core';
import type { Mesh } from '@babylonjs/core';
import { NpcAudioLock } from './NpcAudioLock';
import { generateAndSpeakGreeting } from './NpcGreetingTTS';
import type { GreetingNPC, GreetingWorldData, GreetingResult } from './NpcGreetingTTS';

// ── Types ───────────────────────────────────────────────────────────────

export interface ProximityNPC {
  id: string;
  name: string;
  mesh: Mesh;
  gender?: string;
  age?: number;
  occupation?: string;
  personality: {
    openness: number;
    conscientiousness: number;
    extroversion: number;
    agreeableness: number;
    neuroticism: number;
  };
}

export interface ProximitySpeechConfig {
  /** Radius in world units within which NPCs may greet the player. Default 8. */
  greetingRadius: number;
  /** Base probability per evaluation tick (0-1). Default 0.05. */
  baseProbability: number;
  /** Per-NPC cooldown in ms. Default 180000 (3 minutes). */
  perNpcCooldownMs: number;
  /** Global cooldown between any greeting in ms. Default 15000 (15 seconds). */
  globalCooldownMs: number;
  /** Evaluation interval in ms. Default 1000 (1 second). */
  evalIntervalMs: number;
  /** Target language for greetings. */
  targetLanguage: string;
  /** Server URL for LLM/TTS endpoints. */
  serverUrl: string;
}

const DEFAULT_CONFIG: ProximitySpeechConfig = {
  greetingRadius: 8,
  baseProbability: 0.05,
  perNpcCooldownMs: 180_000,
  globalCooldownMs: 15_000,
  evalIntervalMs: 1_000,
  targetLanguage: 'French',
  serverUrl: '',
};

// ── System ──────────────────────────────────────────────────────────────

export class NPCProximitySpeechSystem {
  private config: ProximitySpeechConfig;
  private audioLock: NpcAudioLock;
  private npcs: Map<string, ProximityNPC> = new Map();
  private playerMesh: Mesh | null = null;

  /** Per-NPC cooldown timestamps (npcId -> last greeting ms). */
  private perNpcCooldowns: Map<string, number> = new Map();
  /** Global timestamp of last greeting from any NPC. */
  private lastGlobalGreeting = 0;

  /** Tracks the last greeting text and timestamp per NPC for US-013 continuation. */
  private lastGreetingResults: Map<string, { text: string; timestamp: number }> = new Map();

  /** Currently active greeting abort controller (null when idle). */
  private activeAbort: AbortController | null = null;
  private activeOwner: string | null = null;

  /** Accumulator for throttled evaluation. */
  private accumMs = 0;

  /** Callback to check if the player is in an active conversation. */
  private isPlayerInConversation: () => boolean = () => false;

  /** Callback to check if an NPC has an active quest for the player. */
  private isNpcQuestBearer: (npcId: string) => boolean = () => false;

  /** Callback to get the current game hour (0-23). */
  private getGameHour: () => number = () => 12;

  /** Callback to show/hide a talking indicator above an NPC's head. */
  private showTalkingIndicator: ((npcId: string, mesh: any, text?: string) => void) | null = null;
  private hideTalkingIndicator: ((npcId: string) => void) | null = null;

  constructor(audioLock: NpcAudioLock, config?: Partial<ProximitySpeechConfig>) {
    this.audioLock = audioLock;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Registration ────────────────────────────────────────────────────

  registerNPC(npc: ProximityNPC): void {
    this.npcs.set(npc.id, npc);
  }

  unregisterNPC(npcId: string): void {
    this.npcs.delete(npcId);
    this.perNpcCooldowns.delete(npcId);
    this.lastGreetingResults.delete(npcId);
  }

  // ── Configuration setters ───────────────────────────────────────────

  setPlayerMesh(mesh: Mesh): void {
    this.playerMesh = mesh;
  }

  setPlayerConversationCheck(fn: () => boolean): void {
    this.isPlayerInConversation = fn;
  }

  setQuestBearerCheck(fn: (npcId: string) => boolean): void {
    this.isNpcQuestBearer = fn;
  }

  setTimeOfDayProvider(fn: () => number): void {
    this.getGameHour = fn;
  }

  setTargetLanguage(language: string): void {
    this.config.targetLanguage = language;
  }

  setTalkingIndicator(
    show: (npcId: string, mesh: any, text?: string) => void,
    hide: (npcId: string) => void,
  ): void {
    this.showTalkingIndicator = show;
    this.hideTalkingIndicator = hide;
  }

  setServerUrl(url: string): void {
    this.config.serverUrl = url;
  }

  // ── Public API ──────────────────────────────────────────────────────

  /** Get recent greeting info for an NPC (used by US-013 for conversation continuation). */
  getRecentGreeting(npcId: string, withinMs: number = 30_000): { text: string; timestamp: number } | null {
    const entry = this.lastGreetingResults.get(npcId);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > withinMs) return null;
    return entry;
  }

  /** Cancel any active greeting (e.g., when player opens chat). */
  cancelActiveGreeting(): void {
    if (this.activeAbort) {
      this.activeAbort.abort();
      this.activeAbort = null;
    }
    if (this.activeOwner) {
      this.audioLock.release(this.activeOwner);
      this.activeOwner = null;
    }
  }

  // ── Update loop ─────────────────────────────────────────────────────

  /**
   * Called from the game render loop. Throttles evaluation to once per evalIntervalMs.
   * @param dtMs Delta time in milliseconds since last frame.
   */
  update(dtMs: number): void {
    this.accumMs += dtMs;
    if (this.accumMs < this.config.evalIntervalMs) return;
    this.accumMs = 0;

    this.evaluate();
  }

  private evaluate(): void {
    // Skip if no player mesh or player is in active conversation
    if (!this.playerMesh) return;
    if (this.isPlayerInConversation()) return;

    // Skip if audio lock is already held (greeting or ambient in progress)
    if (this.audioLock.isLocked()) return;

    // Check global cooldown
    const now = Date.now();
    if (now - this.lastGlobalGreeting < this.config.globalCooldownMs) return;

    const playerPos = this.playerMesh.position;

    // Find idle NPCs within greeting radius
    const candidates: ProximityNPC[] = [];
    this.npcs.forEach((npc) => {
      if (!npc.mesh || !npc.mesh.position) return;
      const dist = Vector3.Distance(playerPos, npc.mesh.position);
      if (dist > this.config.greetingRadius) return;

      // Check per-NPC cooldown
      const lastGreet = this.perNpcCooldowns.get(npc.id) || 0;
      if (now - lastGreet < this.config.perNpcCooldownMs) return;

      candidates.push(npc);
    });

    if (candidates.length === 0) return;

    // Evaluate each candidate with personality-driven probability
    for (const npc of candidates) {
      const prob = this.calculateGreetingProbability(npc);
      if (Math.random() > prob) continue;

      // Try to acquire the audio lock
      const owner = `greeting-${npc.id}`;
      if (!this.audioLock.acquire(owner)) return;

      // Fire and forget the greeting pipeline
      this.activeOwner = owner;
      this.fireGreeting(npc, owner, now);
      return; // Only one greeting per evaluation tick
    }
  }

  /**
   * Personality-driven greeting probability.
   * Formula: base * (0.5 + extroversion * 0.5) * (1 - neuroticism * 0.3)
   * Quest-bearing NPCs get +25% bonus.
   */
  private calculateGreetingProbability(npc: ProximityNPC): number {
    const ext = npc.personality.extroversion;
    const neu = npc.personality.neuroticism;

    let prob = this.config.baseProbability * (0.5 + ext * 0.5) * (1 - neu * 0.3);

    // Quest-bearing NPCs get +25% bonus
    if (this.isNpcQuestBearer(npc.id)) {
      prob *= 1.25;
    }

    return Math.max(0, Math.min(1, prob));
  }

  private async fireGreeting(npc: ProximityNPC, owner: string, timestamp: number): Promise<void> {
    const abort = new AbortController();
    this.activeAbort = abort;

    // Set cooldowns immediately
    this.perNpcCooldowns.set(npc.id, timestamp);
    this.lastGlobalGreeting = timestamp;

    const greetingNpc: GreetingNPC = {
      id: npc.id,
      name: npc.name,
      gender: npc.gender,
      age: npc.age,
      occupation: npc.occupation,
      personality: npc.personality,
      meshPosition: npc.mesh.position,
    };

    const worldData: GreetingWorldData = {
      targetLanguage: this.config.targetLanguage,
      timeOfDay: String(this.getGameHour()),
      serverUrl: this.config.serverUrl,
    };

    try {
      // Show talking indicator above NPC head while greeting plays
      this.showTalkingIndicator?.(npc.id, npc.mesh);

      const result: GreetingResult = await generateAndSpeakGreeting(greetingNpc, worldData, {
        signal: abort.signal,
      });

      // Update indicator with actual greeting text
      if (result.text) {
        this.showTalkingIndicator?.(npc.id, npc.mesh, result.text);
      }

      // Track greeting result for conversation continuation (US-013)
      this.lastGreetingResults.set(npc.id, {
        text: result.text,
        timestamp: Date.now(),
      });

      // Hide indicator after a brief display period
      setTimeout(() => {
        this.hideTalkingIndicator?.(npc.id);
      }, 3000);
    } catch (_err: any) {
      // Aborted or failed — hide indicator and swallow
      this.hideTalkingIndicator?.(npc.id);
    } finally {
      // Release audio lock
      this.audioLock.release(owner);
      if (this.activeOwner === owner) {
        this.activeOwner = null;
        this.activeAbort = null;
      }
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────────────

  dispose(): void {
    this.cancelActiveGreeting();
    this.npcs.clear();
    this.perNpcCooldowns.clear();
    this.lastGreetingResults.clear();
    this.playerMesh = null;
  }
}
