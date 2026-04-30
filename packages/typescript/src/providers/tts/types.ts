/**
 * TTSProvider interface — text-to-speech synthesis.
 *
 * Providers: server (Gemini TTS via chat stream), browser (Kokoro WASM),
 * local (Electron Piper), or none (disabled).
 */

import type { AudioChunkOutput } from '../../types.js';

export interface TTSProviderCallbacks {
  onAudioChunk?: (chunk: AudioChunkOutput) => void;
  onStart?: () => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

export interface TTSVoiceOptions {
  gender?: string;
  language?: string;
  voiceId?: string;
}

export interface TTSProvider {
  readonly type: 'server' | 'browser' | 'local' | 'none';

  initialize(): Promise<void>;
  isSupported(): boolean;
  isReady(): boolean;
  setCallbacks(callbacks: TTSProviderCallbacks): void;

  /** Set voice parameters for the current character */
  setVoice(options: TTSVoiceOptions): void;

  /** Synthesize text to audio. Delivers chunks via onAudioChunk callback. Returns raw buffer or null. */
  synthesize(text: string): Promise<ArrayBuffer | null>;

  abort(): void;
  dispose(): Promise<void>;
}
