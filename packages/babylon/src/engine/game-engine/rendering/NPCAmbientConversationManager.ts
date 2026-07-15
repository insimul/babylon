/**
 * NPC Ambient Conversation Manager
 *
 * Pairs nearby NPCs into conversations when the player is within range.
 * Calls the NPC-NPC conversation engine for real dialogue, then plays each
 * line via TTS with spatial audio positioned at the speaking NPC's mesh.
 */

import { Vector3, Scene, Mesh } from '@babylonjs/core';
import { NPCTalkingIndicator } from './NPCTalkingIndicator';
import { NpcAudioLock } from './NpcAudioLock';
import { StreamingAudioPlayer } from './StreamingAudioPlayer';
import type { StreamingAudioChunk } from './StreamingAudioPlayer';
import { selectVoice } from './NpcGreetingTTS';
import { getLanguageBCP47 } from '@shared/language/language-utils';
import type { GamePrologEngine } from '../logic/GamePrologEngine';

interface NPCInstance {
  mesh: Mesh;
  state: string;
  id: string;
  name: string;
  gender?: string;
  age?: number;
}

/** A single line from an NPC-NPC conversation */
export interface AmbientConversationLine {
  speakerId: string;
  speakerName: string;
  text: string;
  gender?: string;
}

/**
 * Provider callback that fetches a real NPC-NPC conversation from the server.
 * Returns an array of conversation lines (utterances).
 */
export type ConversationProvider = (
  npc1Id: string,
  npc2Id: string,
  maxExchanges: number,
  signal: AbortSignal,
) => Promise<AmbientConversationLine[]>;

export interface AmbientConversation {
  id: string;
  participants: [string, string];
  startTime: number;
  /** Which participant is currently "talking" (index 0 or 1) */
  activeSpeakerIdx: number;
  /** Timer handle for alternating talk animations */
  alternateTimer: number | null;
  /** AbortController for cancelling streamed conversation + TTS */
  abortController?: AbortController;
  /** Currently playing StreamingAudioPlayer */
  activePlayer?: StreamingAudioPlayer;
  /** Whether this conversation is using streamed TTS (vs fallback animation) */
  streamed?: boolean;
}

/** Callback to trigger NPC animations (talk/idle/listen) */
type AnimationChangeCallback = (npcId: string, animation: string) => void;

export class NPCAmbientConversationManager {
  private scene: Scene;

  // NPC tracking
  private npcMeshes: Map<string, NPCInstance> = new Map();

  // Active visual-only conversations (no API calls)
  private activeConversations: Map<string, AmbientConversation> = new Map();
  private conversationCooldowns: Map<string, number> = new Map();

  // Settings
  private checkIntervalMs = 5000;
  private minCooldownMs = 120000; // 2 minutes — prevents rapid re-pairing and NPC clustering
  private maxSimultaneous = 1;
  /** How long each NPC "talks" before the other responds (ms) */
  private talkTurnDurationMs = 3000;
  /** Total conversation duration before NPCs part ways (ms) */
  private conversationDurationMs = 20000;
  /** Max distance between two NPCs to start a conversation */
  private pairingRadius = 8;
  /** Distance beyond which an active conversation is cancelled (player walked away) */
  private cancelRadius = 12;
  /** Minimum distance NPCs maintain during conversation */
  private minSeparation = 2.0;

  // Timers
  private checkTimer: number | null = null;

  // Pause flag
  private _paused = false;

  // Player tracking
  private playerMesh: Mesh | null = null;

  // Talking indicator for "..." chat bubbles
  private talkingIndicator: NPCTalkingIndicator | null = null;

  // Callbacks
  private onAnimationChange: AnimationChangeCallback | null = null;
  // Target language for ambient dialogue phrases
  private targetLanguage: string = 'English';

  // Shared audio lock — only one NPC audio source at a time
  private audioLock: NpcAudioLock | null = null;

  /** Player proximity radius — conversations only start when player is within this distance of both NPCs */
  private playerProximityRadius = 8;

  // Streamed conversation support
  private conversationProvider: ConversationProvider | null = null;
  private serverUrl: string = '';

  constructor(scene: Scene, _worldId: string, talkingIndicator: NPCTalkingIndicator) {
    this.scene = scene;
    this.talkingIndicator = talkingIndicator;
  }

  // --- Public API ---

  public setPlayerMesh(mesh: Mesh): void {
    this.playerMesh = mesh;
  }

  public registerNPC(npcId: string, npcName: string, mesh: Mesh, state: string, gender?: string, age?: number): void {
    this.npcMeshes.set(npcId, { mesh, state, id: npcId, name: npcName, gender, age });
  }

  public unregisterNPC(npcId: string): void {
    this.npcMeshes.delete(npcId);
    this.conversationCooldowns.delete(npcId);
    for (const [convId, conv] of Array.from(this.activeConversations.entries())) {
      if (conv.participants.includes(npcId)) {
        this.endConversation(convId);
      }
    }
  }

  public setPrologEngine(_engine: GamePrologEngine): void {
    // Prolog-based matching not used in lightweight ambient system
  }

  public setTargetLanguage(language: string): void {
    this.targetLanguage = language;
  }

  public setAnimationCallback(cb: AnimationChangeCallback): void {
    this.onAnimationChange = cb;
  }

  public setAudioLock(lock: NpcAudioLock): void {
    this.audioLock = lock;
  }

  public setConversationProvider(provider: ConversationProvider): void {
    this.conversationProvider = provider;
  }

  public setServerUrl(url: string): void {
    this.serverUrl = url;
  }

  public pause(): void { this._paused = true; }
  public resume(): void { this._paused = false; }

  /** Cancel all active ambient conversations (abort LLM streams, stop TTS, release lock). */
  public cancelAllActive(): void {
    for (const convId of Array.from(this.activeConversations.keys())) {
      this.endConversation(convId);
    }
  }

  public start(): void {
    if (this.checkTimer !== null) return;
    this.checkTimer = window.setInterval(() => this.tick(), this.checkIntervalMs);
  }

  public stop(): void {
    if (this.checkTimer !== null) {
      window.clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    for (const convId of Array.from(this.activeConversations.keys())) {
      this.endConversation(convId);
    }
  }

  public isInConversation(npcId: string): boolean {
    return Array.from(this.activeConversations.values()).some(
      conv => conv.participants.includes(npcId)
    );
  }

  public getActiveConversationCount(): number {
    return this.activeConversations.size;
  }

  /**
   * If the NPC is in an ambient conversation, return the partner's id and name.
   */
  public getConversationPartner(npcId: string): { partnerId: string; partnerName: string } | null {
    for (const conv of Array.from(this.activeConversations.values())) {
      const idx = conv.participants.indexOf(npcId);
      if (idx !== -1) {
        const partnerId = conv.participants[idx === 0 ? 1 : 0];
        const partnerNpc = this.npcMeshes.get(partnerId);
        return {
          partnerId,
          partnerName: partnerNpc?.name || partnerId,
        };
      }
    }
    return null;
  }

  public updateSettings(settings: {
    hearingRadius?: number;
    maxSimultaneousConversations?: number;
    conversationCheckInterval?: number;
  }): void {
    if (settings.maxSimultaneousConversations !== undefined) {
      this.maxSimultaneous = settings.maxSimultaneousConversations;
    }
    if (settings.conversationCheckInterval !== undefined) {
      this.checkIntervalMs = settings.conversationCheckInterval;
      if (this.checkTimer !== null) {
        this.stop();
        this.start();
      }
    }
  }

  public dispose(): void {
    this.stop();
    this.npcMeshes.clear();
    this.conversationCooldowns.clear();
  }

  // --- Core tick ---

  private tick(): void {
    if (this._paused) return;
    const now = Date.now();

    // Cancel active conversations if the player has left range
    this.checkPlayerProximityToActiveConversations(now);

    // Expire old conversations (only fallback timer-based ones; streamed ones end naturally)
    for (const [convId, conv] of Array.from(this.activeConversations.entries())) {
      if (!conv.streamed && now - conv.startTime > this.conversationDurationMs) {
        this.endConversation(convId);
      }
    }

    // Try to start new conversations
    if (this.activeConversations.size < this.maxSimultaneous) {
      this.tryStartConversation(now);
    }

  }

  /**
   * Cancel any active ambient conversation if the player is beyond cancelRadius
   * from both participating NPCs. Sets per-NPC cooldown on cancellation.
   */
  private checkPlayerProximityToActiveConversations(now: number): void {
    if (!this.playerMesh) return;
    const playerPos = this.playerMesh.position;

    for (const [convId, conv] of Array.from(this.activeConversations.entries())) {
      const npc1 = this.npcMeshes.get(conv.participants[0]);
      const npc2 = this.npcMeshes.get(conv.participants[1]);
      if (!npc1 || !npc2) continue;

      const dist1 = Vector3.Distance(playerPos, npc1.mesh.position);
      const dist2 = Vector3.Distance(playerPos, npc2.mesh.position);

      if (dist1 > this.cancelRadius && dist2 > this.cancelRadius) {
        // Update cooldowns from now so the 2-minute cooldown starts from cancellation
        this.conversationCooldowns.set(conv.participants[0], now);
        this.conversationCooldowns.set(conv.participants[1], now);
        this.endConversation(convId);
      }
    }
  }

  // --- Pairing logic ---

  private tryStartConversation(now: number): void {
    // Don't start if audio lock is held (e.g., greeting playing)
    if (this.audioLock?.isLocked()) return;

    // Player proximity gate: need a player mesh to check distance
    if (!this.playerMesh) return;
    const playerPos = this.playerMesh.position;

    const available: NPCInstance[] = [];

    for (const npc of Array.from(this.npcMeshes.values())) {
      if (this.isInConversation(npc.id)) continue;
      if (npc.state === 'combat') continue;
      if (!npc.mesh.isEnabled()) continue;

      const lastChat = this.conversationCooldowns.get(npc.id) || 0;
      if (now - lastChat < this.minCooldownMs) continue;

      // Player must be within proximity radius of this NPC
      if (Vector3.Distance(playerPos, npc.mesh.position) > this.playerProximityRadius) continue;

      available.push(npc);
    }

    if (available.length < 2) return;

    // Find closest pair within pairing radius
    let bestPair: [NPCInstance, NPCInstance] | null = null;
    let bestDist = Infinity;

    for (let i = 0; i < available.length - 1; i++) {
      for (let j = i + 1; j < available.length; j++) {
        const d = Vector3.Distance(available[i].mesh.position, available[j].mesh.position);
        if (d <= this.pairingRadius && d < bestDist) {
          bestDist = d;
          bestPair = [available[i], available[j]];
        }
      }
    }

    if (!bestPair) return;
    if (Math.random() > 0.5) return; // 50% chance per tick

    // Acquire audio lock before starting
    if (this.audioLock && !this.audioLock.acquire('ambient')) return;

    this.startConversation(bestPair[0], bestPair[1], now);
  }

  private startConversation(npc1: NPCInstance, npc2: NPCInstance, now: number): void {
    const convId = `conv_${now}_${npc1.id}_${npc2.id}`;

    // Face each other and enforce separation
    this.faceEachOther(npc1.mesh, npc2.mesh);

    const abortController = new AbortController();

    const conv: AmbientConversation = {
      id: convId,
      participants: [npc1.id, npc2.id],
      startTime: now,
      activeSpeakerIdx: 0,
      alternateTimer: null,
      abortController,
      streamed: false,
    };

    this.activeConversations.set(convId, conv);
    this.conversationCooldowns.set(npc1.id, now);
    this.conversationCooldowns.set(npc2.id, now);

    // If a conversation provider is available, use streamed TTS playback
    if (this.conversationProvider) {
      conv.streamed = true;
      // Set initial animations (npc1 talks first)
      this.onAnimationChange?.(npc1.id, 'talk');
      this.onAnimationChange?.(npc2.id, 'idle');

      this.runStreamedConversation(conv, npc1, npc2);
    } else {
      // Fallback: timer-based animation only (no TTS)
      this.setTalkAnimations(conv);
      conv.alternateTimer = window.setInterval(() => {
        if (!this.activeConversations.has(convId)) return;
        conv.activeSpeakerIdx = conv.activeSpeakerIdx === 0 ? 1 : 0;
        this.setTalkAnimations(conv);
      }, this.talkTurnDurationMs);
    }
  }

  /**
   * Run a streamed NPC-NPC conversation with sequential TTS playback.
   * Each line is TTS'd and played at the speaking NPC's position.
   * No speech bubbles — audio only.
   */
  private async runStreamedConversation(
    conv: AmbientConversation,
    npc1: NPCInstance,
    npc2: NPCInstance,
  ): Promise<void> {
    const convId = conv.id;
    const signal = conv.abortController!.signal;

    try {
      // Random 3-5 exchanges
      const maxExchanges = 3 + Math.floor(Math.random() * 3);

      const lines = await this.conversationProvider!(
        npc1.id, npc2.id, maxExchanges, signal,
      );

      if (signal.aborted || !this.activeConversations.has(convId)) return;
      if (!lines || lines.length === 0) {
        this.endConversation(convId);
        return;
      }

      // Play each line sequentially with TTS
      for (let i = 0; i < lines.length; i++) {
        if (signal.aborted || !this.activeConversations.has(convId)) return;

        const line = lines[i];

        // Set animations: speaker talks, other idles
        const isSpeakerNpc1 = line.speakerId === npc1.id;
        const speakerNpc = isSpeakerNpc1 ? npc1 : npc2;
        const listenerNpc = isSpeakerNpc1 ? npc2 : npc1;
        this.onAnimationChange?.(speakerNpc.id, 'talk');
        this.onAnimationChange?.(listenerNpc.id, 'idle');

        // TTS + spatial audio playback
        await this.speakLine(line, speakerNpc, conv, signal);

        if (signal.aborted || !this.activeConversations.has(convId)) return;

        // 500ms pause between exchanges
        if (i < lines.length - 1) {
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, 500);
            const onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
            signal.addEventListener('abort', onAbort, { once: true });
          }).catch(() => { /* aborted */ });
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('[AmbientConv] Streamed conversation error:', err);
      }
    } finally {
      // Conversation finished or was aborted — clean up
      if (this.activeConversations.has(convId)) {
        this.endConversation(convId);
      }
    }
  }

  /**
   * Synthesize and play a single conversation line via TTS.
   * Returns a promise that resolves when audio playback finishes.
   */
  private async speakLine(
    line: AmbientConversationLine,
    speakerNpc: NPCInstance,
    conv: AmbientConversation,
    signal: AbortSignal,
  ): Promise<void> {
    if (signal.aborted) return;

    const langCode = getLanguageBCP47(this.targetLanguage);
    const voice = selectVoice({
      id: speakerNpc.id,
      name: speakerNpc.name,
      gender: line.gender || speakerNpc.gender,
      age: speakerNpc.age,
      meshPosition: speakerNpc.mesh.position,
    });

    // Call TTS endpoint
    let audioBuffer: ArrayBuffer | null = null;
    try {
      const ttsRes = await fetch(`${this.serverUrl}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: line.text,
          voice: voice.voiceName,
          gender: voice.gender,
          encoding: 'MP3',
          targetLanguage: langCode,
        }),
        signal,
      });

      if (ttsRes.ok) {
        audioBuffer = await ttsRes.arrayBuffer();
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      // TTS failure — skip this line silently
    }

    if (!audioBuffer || audioBuffer.byteLength === 0 || signal.aborted) return;

    // Play via StreamingAudioPlayer at the speaking NPC's position
    const player = new StreamingAudioPlayer({
      preBufferCount: 1,
      npcPosition: speakerNpc.mesh.position,
      maxDistance: 50,
    });

    conv.activePlayer = player;

    return new Promise<void>((resolve) => {
      const cleanup = () => {
        conv.activePlayer = undefined;
        player.stop();
        player.dispose();
        resolve();
      };

      if (signal.aborted) {
        cleanup();
        return;
      }

      const onAbort = () => cleanup();
      signal.addEventListener('abort', onAbort, { once: true });

      player.setCallbacks({
        onComplete: () => {
          signal.removeEventListener('abort', onAbort);
          conv.activePlayer = undefined;
          player.dispose();
          resolve();
        },
      });

      const chunk: StreamingAudioChunk = {
        data: new Uint8Array(audioBuffer!),
        encoding: 1, // PCM (server returns raw PCM from Gemini TTS)
        sampleRate: 24000,
        durationMs: 0,
      };

      player.pushChunk(chunk);
      player.finish();
    });
  }

  private setTalkAnimations(conv: AmbientConversation): void {
    const speakerId = conv.participants[conv.activeSpeakerIdx];
    const listenerId = conv.participants[conv.activeSpeakerIdx === 0 ? 1 : 0];
    this.onAnimationChange?.(speakerId, 'talk');
    this.onAnimationChange?.(listenerId, 'idle');

    // Show a target-language snippet in the speech bubble (fallback mode only)
    const speakerNPC = this.npcMeshes.get(speakerId);
    if (this.talkingIndicator && speakerNPC) {
      this.talkingIndicator.hide(listenerId);
      this.talkingIndicator.show(speakerId, speakerNPC.mesh);
    }
  }

  private endConversation(convId: string): void {
    const conv = this.activeConversations.get(convId);
    if (!conv) return;

    // Abort any in-progress streamed conversation + TTS
    if (conv.abortController && !conv.abortController.signal.aborted) {
      conv.abortController.abort();
    }

    // Stop any active audio player
    if (conv.activePlayer) {
      conv.activePlayer.stop();
      conv.activePlayer.dispose();
      conv.activePlayer = undefined;
    }

    if (conv.alternateTimer !== null) {
      window.clearInterval(conv.alternateTimer);
    }

    // Reset both to idle and hide chat bubbles
    for (const pid of conv.participants) {
      this.onAnimationChange?.(pid, 'idle');
      this.talkingIndicator?.hide(pid);
    }

    this.activeConversations.delete(convId);

    // Release audio lock if we held it
    this.audioLock?.release('ambient');

  }

  // --- Helpers ---

  private faceEachOther(mesh1: Mesh, mesh2: Mesh): void {
    const diff = mesh2.position.subtract(mesh1.position);
    const dist = diff.length();
    if (dist < this.minSeparation && dist > 0.01) {
      const pushDir = diff.normalize();
      const pushAmount = (this.minSeparation - dist) / 2;
      mesh1.position.subtractInPlace(pushDir.scale(pushAmount));
      mesh2.position.addInPlace(pushDir.scale(pushAmount));
    }

    const dir1to2 = mesh2.position.subtract(mesh1.position).normalize();
    const dir2to1 = mesh1.position.subtract(mesh2.position).normalize();
    mesh1.rotation.y = Math.atan2(dir1to2.x, dir1to2.z) + Math.PI;
    mesh2.rotation.y = Math.atan2(dir2to1.x, dir2to1.z) + Math.PI;
  }
}
