/**
 * StreamingAudioPlayer
 *
 * Plays gRPC AudioChunk streams via the Web Audio API with pre-buffering,
 * seamless chunk concatenation, spatial audio, interrupt handling, and
 * audio ducking integration with the existing AudioManager.
 */

import { Vector3 } from '@babylonjs/core';
import type { AudioEncoding } from '@shared/proto/conversation';
import type { AudioManager } from './AudioManager';

// ── Types ───────────────────────────────────────────────────────────────────

/** Audio chunk matching the gRPC AudioChunkOutput shape */
export interface StreamingAudioChunk {
  data: Uint8Array;
  encoding: AudioEncoding; // 1=PCM, 2=OPUS, 3=MP3
  sampleRate: number;
  durationMs: number;
}

export interface StreamingAudioPlayerCallbacks {
  onStart?: () => void;
  onChunkPlayed?: (chunkIndex: number) => void;
  onComplete?: () => void;
}

export interface StreamingAudioPlayerOptions {
  /** Chunks to buffer before starting playback (default 2) */
  preBufferCount?: number;
  /** NPC world position for spatial audio (updated externally) */
  npcPosition?: Vector3;
  /** Reference to AudioManager for ducking integration */
  audioManager?: AudioManager;
  /** Ducking volume for music/ambient during speech (0-1, default 0.2) */
  duckingVolume?: number;
  /** Spatial audio rolloff – max audible distance in world units (default 50) */
  maxDistance?: number;
}

// ── AudioEncoding enum values (matches proto) ───────────────────────────────

const ENCODING_PCM = 1;
const ENCODING_MP3 = 3;

// ── Class ───────────────────────────────────────────────────────────────────

export class StreamingAudioPlayer {
  // Web Audio
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;

  // Chunk queue
  private chunkQueue: StreamingAudioChunk[] = [];
  private decodedQueue: AudioBuffer[] = [];
  private isPlaying = false;
  private isStarted = false;
  /**
   * All audio sources scheduled on the AudioContext but not yet ended.
   * Tracking every active source (not just the most recent) is what makes
   * stop() actually stop everything — previously `currentSource` was
   * overwritten on each chunk and earlier sources leaked into the
   * AudioContext, producing the "NPC words layered on top of each other"
   * symptom when a new turn started before the previous turn drained.
   */
  private activeSources: Set<AudioBufferSourceNode> = new Set();

  // Scheduling – tracks the AudioContext time at which the next chunk should start
  private nextScheduleTime = 0;
  private chunksPlayed = 0;

  // Options
  private preBufferCount: number;
  private npcPosition: Vector3 | null;
  private audioManager: AudioManager | null;
  private duckingVolume: number;
  private maxDistance: number;

  // Listener position (set externally each frame)
  private listenerPosition: Vector3 | null = null;

  // Pre-ducking volumes (to restore after speech)
  private preDuckMusicVolume: number | null = null;
  private preDuckAmbientVolume: number | null = null;

  // Callbacks
  private callbacks: StreamingAudioPlayerCallbacks = {};

  // Track whether we've been told no more chunks are coming
  private streamFinished = false;

  constructor(options: StreamingAudioPlayerOptions = {}) {
    this.preBufferCount = options.preBufferCount ?? 2;
    this.npcPosition = options.npcPosition ?? null;
    this.audioManager = options.audioManager ?? null;
    this.duckingVolume = options.duckingVolume ?? 0.2;
    this.maxDistance = options.maxDistance ?? 50;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Register playback callbacks */
  public setCallbacks(callbacks: StreamingAudioPlayerCallbacks): void {
    this.callbacks = callbacks;
  }

  /** Update the NPC world position for spatial attenuation */
  public setNpcPosition(position: Vector3): void {
    this.npcPosition = position;
  }

  /** Update the listener (camera/player) position each frame */
  public setListenerPosition(position: Vector3): void {
    this.listenerPosition = position;
    this.updateSpatialVolume();
  }

  /** Push a new audio chunk from the gRPC stream */
  public pushChunk(chunk: StreamingAudioChunk): void {
    this.chunkQueue.push(chunk);
    this.tryDecodeAndPlay();
  }

  /** Signal that no more chunks will arrive for this utterance */
  public finish(): void {
    this.streamFinished = true;
    // If we're still waiting on pre-buffer, start playing what we have
    if (!this.isStarted && this.decodedQueue.length > 0) {
      this.startPlayback();
    }
  }

  /** Interrupt / stop all playback immediately */
  public stop(): void {
    // Stop EVERY active source. Previously only `currentSource` (the
    // last-scheduled one) was stopped, which left earlier scheduled
    // sources playing — visible in production as NPC speech "layering"
    // across turns whenever Gemini emitted several audio chunks before
    // the previous turn's sources had ended.
    // Array.from avoids for-of Set iteration that requires
    // downlevelIteration under older TS targets.
    Array.from(this.activeSources).forEach((source) => {
      try { source.stop(); } catch { /* already stopped */ }
      try { source.disconnect(); } catch { /* already disconnected */ }
    });
    this.activeSources.clear();
    this.chunkQueue = [];
    this.decodedQueue = [];
    this.isPlaying = false;
    this.isStarted = false;
    this.streamFinished = false;
    this.chunksPlayed = 0;
    this.nextScheduleTime = 0;
    this.restoreAudioLevels();
  }

  /** Whether the player is currently outputting audio */
  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /** Clean up Web Audio resources */
  public dispose(): void {
    this.stop();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
    }
    this.audioContext = null;
    this.gainNode = null;
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private ensureAudioContext(): AudioContext {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new AudioContext();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
    }
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    return this.audioContext;
  }

  /** Decode queued raw chunks into AudioBuffers, then attempt playback */
  private async tryDecodeAndPlay(): Promise<void> {
    // Decode any raw chunks that haven't been decoded yet
    while (this.chunkQueue.length > 0) {
      const chunk = this.chunkQueue.shift()!;
      try {
        const buffer = await this.decodeChunk(chunk);
        this.decodedQueue.push(buffer);
      } catch (err) {
        console.warn('[StreamingAudioPlayer] Failed to decode chunk:', err);
      }
    }

    // Start playback once we have enough buffered (or stream is done)
    if (!this.isStarted) {
      if (this.decodedQueue.length >= this.preBufferCount || this.streamFinished) {
        this.startPlayback();
      }
    }
  }

  /** Decode a single audio chunk to an AudioBuffer */
  private async decodeChunk(chunk: StreamingAudioChunk): Promise<AudioBuffer> {
    const ctx = this.ensureAudioContext();

    if (chunk.encoding === ENCODING_PCM) {
      return this.decodePCM(ctx, chunk.data, chunk.sampleRate);
    }

    // MP3 / Opus – use browser's built-in decoder
    const arrayBuffer = chunk.data.buffer.slice(
      chunk.data.byteOffset,
      chunk.data.byteOffset + chunk.data.byteLength
    );
    return ctx.decodeAudioData(arrayBuffer as ArrayBuffer);
  }

  /** Convert raw PCM 16-bit LE mono into an AudioBuffer */
  private decodePCM(ctx: AudioContext, data: Uint8Array, sampleRate: number): AudioBuffer {
    const samples = data.byteLength / 2;
    const buffer = ctx.createBuffer(1, samples, sampleRate);
    const channel = buffer.getChannelData(0);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    for (let i = 0; i < samples; i++) {
      const int16 = view.getInt16(i * 2, true); // little-endian
      channel[i] = int16 / 32768;
    }
    return buffer;
  }

  /** Begin scheduled playback of decoded buffers */
  private startPlayback(): void {
    if (this.isStarted) return;
    this.isStarted = true;
    this.isPlaying = true;

    const ctx = this.ensureAudioContext();
    this.nextScheduleTime = ctx.currentTime;

    this.applyAudioDucking();
    this.callbacks.onStart?.();

    this.scheduleNextChunks();
  }

  /**
   * Schedule as many decoded buffers as are available.
   * Uses Web Audio's precise scheduling to eliminate gaps.
   */
  private scheduleNextChunks(): void {
    if (!this.audioContext || !this.gainNode) return;

    while (this.decodedQueue.length > 0) {
      const buffer = this.decodedQueue.shift()!;
      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gainNode);

      source.start(this.nextScheduleTime);
      this.nextScheduleTime += buffer.duration;

      const chunkIdx = this.chunksPlayed++;
      this.activeSources.add(source);

      source.onended = () => {
        this.activeSources.delete(source);
        this.callbacks.onChunkPlayed?.(chunkIdx);

        // If there are more decoded buffers queued, schedule them
        if (this.decodedQueue.length > 0) {
          this.scheduleNextChunks();
        } else if (this.streamFinished && this.activeSources.size === 0) {
          // All done — wait until every scheduled source has actually
          // finished (not just the most recent one) before signalling
          // completion, so onComplete doesn't fire while other chunks
          // are still playing.
          this.isPlaying = false;
          this.isStarted = false;
          this.restoreAudioLevels();
          this.callbacks.onComplete?.();
        }
        // else: waiting for more chunks to arrive from the stream
      };
    }
  }

  // ── Spatial Audio ───────────────────────────────────────────────────────

  /** Attenuate gain based on distance between listener and NPC */
  private updateSpatialVolume(): void {
    if (!this.gainNode || !this.npcPosition || !this.listenerPosition) return;

    const distance = Vector3.Distance(this.listenerPosition, this.npcPosition);
    // Exponential rolloff: full volume at 0, ~0 at maxDistance
    const attenuation = Math.max(0, 1 - distance / this.maxDistance);
    const volume = attenuation * attenuation; // quadratic falloff for natural feel
    this.gainNode.gain.setTargetAtTime(volume, this.gainNode.context.currentTime, 0.05);
  }

  // ── Audio Ducking ──────────────────────────────────────────────────────

  /** Reduce ambient/music volume when NPC starts speaking */
  private applyAudioDucking(): void {
    if (!this.audioManager) return;

    const state = this.audioManager.getAudioState();
    this.preDuckMusicVolume = state.musicVolume;
    this.preDuckAmbientVolume = state.ambientVolume;

    this.audioManager.setMusicVolume(state.musicVolume * this.duckingVolume);
    this.audioManager.setAmbientVolume(state.ambientVolume * this.duckingVolume);
  }

  /** Restore ambient/music volume after NPC finishes speaking */
  private restoreAudioLevels(): void {
    if (!this.audioManager) return;

    if (this.preDuckMusicVolume !== null) {
      this.audioManager.setMusicVolume(this.preDuckMusicVolume);
      this.preDuckMusicVolume = null;
    }
    if (this.preDuckAmbientVolume !== null) {
      this.audioManager.setAmbientVolume(this.preDuckAmbientVolume);
      this.preDuckAmbientVolume = null;
    }
  }
}
