/**
 * LocalTTSProvider — text-to-speech via Electron IPC (Piper/local TTS).
 */

import type { TTSProvider, TTSProviderCallbacks, TTSVoiceOptions } from './types.js';
import type { AudioEncoding } from '../../types.js';

export class LocalTTSProvider implements TTSProvider {
  readonly type = 'local' as const;

  private callbacks: TTSProviderCallbacks = {};
  private voice?: string;

  async initialize(): Promise<void> {}

  isSupported(): boolean {
    return !!(typeof window !== 'undefined' && window.electronAPI?.aiTTS);
  }

  isReady(): boolean { return this.isSupported(); }
  setCallbacks(callbacks: TTSProviderCallbacks): void { this.callbacks = callbacks; }

  setVoice(options: TTSVoiceOptions): void {
    this.voice = options.voiceId;
  }

  async synthesize(text: string): Promise<ArrayBuffer | null> {
    if (!window.electronAPI?.aiTTS) return null;

    try {
      this.callbacks.onStart?.();
      const audioBuffer = await window.electronAPI.aiTTS(text, this.voice);
      if (audioBuffer) {
        this.callbacks.onAudioChunk?.({
          data: new Uint8Array(audioBuffer),
          encoding: 3 as AudioEncoding, // MP3
          sampleRate: 24000,
          durationMs: 0,
        });
      }
      this.callbacks.onComplete?.();
      return audioBuffer;
    } catch (err: any) {
      this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
      return null;
    }
  }

  abort(): void {}
  async dispose(): Promise<void> {}
}
