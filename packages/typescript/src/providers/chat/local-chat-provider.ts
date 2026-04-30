/**
 * LocalChatProvider — routes to a local LLM via Electron IPC.
 *
 * Requires the Electron app to expose window.electronAPI with aiGenerate/aiGenerateStream.
 * Ported from LocalAIClient.ts.
 */

import type { ChatProvider, ChatProviderCallbacks } from './types.js';

declare global {
  interface Window {
    electronAPI?: {
      aiAvailable?: boolean;
      aiGenerate?: (prompt: string, systemPrompt?: string, options?: { temperature?: number; maxTokens?: number }) => Promise<string>;
      aiGenerateStream?: (
        prompt: string, systemPrompt?: string,
        options?: { temperature?: number; maxTokens?: number },
        onToken?: (token: string) => void,
      ) => Promise<string>;
      aiTTS?: (text: string, voice?: string, speed?: number) => Promise<ArrayBuffer | null>;
      aiSTT?: (audioBuffer: ArrayBuffer, languageHint?: string) => Promise<{ text: string }>;
    };
  }
}

export class LocalChatProvider implements ChatProvider {
  readonly type = 'local' as const;

  private callbacks: ChatProviderCallbacks = {};
  private systemPrompt = '';
  private _aborted = false;

  async initialize(): Promise<void> {}

  isSupported(): boolean {
    return !!(
      typeof window !== 'undefined' &&
      window.electronAPI?.aiAvailable &&
      window.electronAPI?.aiGenerate
    );
  }

  isReady(): boolean { return this.isSupported(); }

  setCallbacks(callbacks: ChatProviderCallbacks): void { this.callbacks = callbacks; }

  setCharacter(_characterId: string, _worldId: string, _gender?: string): void {
    // Local provider uses system prompt, not character/world IDs
  }

  setSystemPrompt(prompt: string): void { this.systemPrompt = prompt; }

  async sendText(text: string, _languageCode?: string): Promise<string> {
    if (!window.electronAPI?.aiGenerateStream && !window.electronAPI?.aiGenerate) {
      throw new Error('Electron AI not available');
    }

    this._aborted = false;
    this.callbacks.onStateChange?.('thinking');

    try {
      let fullText = '';

      if (window.electronAPI.aiGenerateStream) {
        const result = await window.electronAPI.aiGenerateStream(
          text, this.systemPrompt, undefined,
          (token: string) => {
            if (this._aborted) return;
            fullText += token;
            this.callbacks.onStateChange?.('speaking');
            this.callbacks.onTextChunk?.(token, false);
          },
        );
        fullText = result || fullText;
      } else {
        fullText = await window.electronAPI.aiGenerate!(text, this.systemPrompt);
        this.callbacks.onTextChunk?.(fullText, false);
      }

      if (this._aborted) return '';

      this.callbacks.onTextChunk?.('', true);
      this.callbacks.onComplete?.(fullText);
      this.callbacks.onStateChange?.('idle');
      return fullText;
    } catch (err: any) {
      if (this._aborted) return '';
      this.callbacks.onStateChange?.('error');
      this.callbacks.onError?.(err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  async sendAudio(_audioBlob: Blob, _languageCode?: string): Promise<string> {
    throw new Error('LocalChatProvider does not support audio input — use STT provider first');
  }

  abort(): void { this._aborted = true; }

  async dispose(): Promise<void> { this.abort(); }
}
