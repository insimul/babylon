/**
 * StreamingAudioPlayer — Standalone Web Audio API player for streaming
 * audio chunks from the Insimul conversation service.
 *
 * Features:
 * - Pre-buffering to prevent stuttering
 * - Seamless chunk concatenation (zero-gap scheduling)
 * - Interrupt handling
 * - Playback state events
 *
 * This is a standalone version with no engine dependencies (no Babylon.js, etc.)
 */

import type { AudioChunkOutput } from './types.js';

// ── Types ───────────────────────────────────────────────────────────────────

export interface AudioPlayerCallbacks {
  onStart?: () => void;
  onChunkPlayed?: (chunkIndex: number) => void;
  onComplete?: () => void;
}

export interface AudioPlayerOptions {
  /** Chunks to buffer before starting playback (default 2) */
  preBufferCount?: number;
}

// ── AudioEncoding enum values (matches proto) ───────────────────────────────

const ENCODING_PCM = 1;

// ── Class ───────────────────────────────────────────────────────────────────

export class StreamingAudioPlayer {
  // Web Audio
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;

  // Chunk queue
  private chunkQueue: AudioChunkOutput[] = [];
  private decodedQueue: AudioBuffer[] = [];
  private isPlaying = false;
  private isStarted = false;
  private currentSource: AudioBufferSourceNode | null = null;

  // Scheduling — tracks the AudioContext time at which the next chunk starts
  private nextScheduleTime = 0;
  private chunksPlayed = 0;

  // Options
  private preBufferCount: number;

  // Callbacks
  private callbacks: AudioPlayerCallbacks = {};

  // Track whether stream is complete
  private streamFinished = false;

  constructor(options: AudioPlayerOptions = {}) {
    this.preBufferCount = options.preBufferCount ?? 2;
  }

  // ── Public API ──────────────────────────────────────────────────────────

  /** Register playback callbacks */
  public setCallbacks(callbacks: AudioPlayerCallbacks): void {
    this.callbacks = callbacks;
  }

  /** Push a new audio chunk from the conversation stream */
  public pushChunk(chunk: AudioChunkOutput): void {
    this.chunkQueue.push(chunk);
    this.tryDecodeAndPlay();
  }

  /** Signal that no more chunks will arrive for this utterance */
  public finish(): void {
    this.streamFinished = true;
    if (!this.isStarted && this.decodedQueue.length > 0) {
      this.startPlayback();
    }
  }

  /** Interrupt / stop all playback immediately */
  public stop(): void {
    if (this.currentSource) {
      try {
        this.currentSource.stop();
      } catch {
        /* already stopped */
      }
      this.currentSource.disconnect();
      this.currentSource = null;
    }
    this.chunkQueue = [];
    this.decodedQueue = [];
    this.isPlaying = false;
    this.isStarted = false;
    this.streamFinished = false;
    this.chunksPlayed = 0;
    this.nextScheduleTime = 0;
  }

  /** Whether the player is currently outputting audio */
  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /** Set the master volume (0.0 – 1.0) */
  public setVolume(volume: number): void {
    if (this.gainNode) {
      this.gainNode.gain.setTargetAtTime(
        Math.max(0, Math.min(1, volume)),
        this.gainNode.context.currentTime,
        0.05,
      );
    }
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
    while (this.chunkQueue.length > 0) {
      const chunk = this.chunkQueue.shift()!;
      try {
        const buffer = await this.decodeChunk(chunk);
        this.decodedQueue.push(buffer);
      } catch (err) {
        console.warn('[InsimulAudioPlayer] Failed to decode chunk:', err);
      }
    }

    if (!this.isStarted) {
      if (this.decodedQueue.length >= this.preBufferCount || this.streamFinished) {
        this.startPlayback();
      }
    }
  }

  /** Decode a single audio chunk to an AudioBuffer */
  private async decodeChunk(chunk: AudioChunkOutput): Promise<AudioBuffer> {
    const ctx = this.ensureAudioContext();

    if (chunk.encoding === ENCODING_PCM) {
      return this.decodePCM(ctx, chunk.data, chunk.sampleRate);
    }

    // MP3 / Opus – use browser's built-in decoder
    const arrayBuffer = chunk.data.buffer.slice(
      chunk.data.byteOffset,
      chunk.data.byteOffset + chunk.data.byteLength,
    );
    return ctx.decodeAudioData(arrayBuffer);
  }

  /** Convert raw PCM 16-bit LE mono into an AudioBuffer */
  private decodePCM(
    ctx: AudioContext,
    data: Uint8Array,
    sampleRate: number,
  ): AudioBuffer {
    const samples = data.byteLength / 2;
    const buffer = ctx.createBuffer(1, samples, sampleRate);
    const channel = buffer.getChannelData(0);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    for (let i = 0; i < samples; i++) {
      const int16 = view.getInt16(i * 2, true);
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
      this.currentSource = source;

      source.onended = () => {
        this.callbacks.onChunkPlayed?.(chunkIdx);

        if (this.decodedQueue.length > 0) {
          this.scheduleNextChunks();
        } else if (this.streamFinished) {
          this.isPlaying = false;
          this.isStarted = false;
          this.currentSource = null;
          this.callbacks.onComplete?.();
        }
      };
    }
  }
}
