/**
 * LocalSTTProvider — speech-to-text via Electron IPC (Whisper).
 */

import type { STTProvider, STTProviderCallbacks } from './types.js';

export class LocalSTTProvider implements STTProvider {
  readonly type = 'local' as const;

  private callbacks: STTProviderCallbacks = {};

  async initialize(): Promise<void> {}

  isSupported(): boolean {
    return !!(typeof window !== 'undefined' && window.electronAPI?.aiSTT);
  }

  isReady(): boolean { return this.isSupported(); }
  setCallbacks(callbacks: STTProviderCallbacks): void { this.callbacks = callbacks; }

  async transcribe(audioBlob: Blob, languageCode?: string): Promise<string> {
    if (!window.electronAPI?.aiSTT) return '';

    try {
      const buffer = await audioBlob.arrayBuffer();
      const result = await window.electronAPI.aiSTT(buffer, languageCode);
      const transcript = result?.text || '';
      this.callbacks.onTranscript?.(transcript, true);
      return transcript;
    } catch (err: any) {
      this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
      return '';
    }
  }

  abort(): void {}
  async dispose(): Promise<void> {}
}
