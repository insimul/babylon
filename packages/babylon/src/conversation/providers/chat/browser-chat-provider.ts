/**
 * BrowserChatProvider — runs LLM inference entirely in the browser via WebLLM.
 *
 * Uses WebGPU-accelerated models (SmolLM2, Qwen, Phi, Llama) cached in IndexedDB.
 * No server, no API keys, no network latency.
 *
 * Ported from BrowserAIClient.ts (LLM-only — TTS is handled by BrowserTTSProvider).
 */

import type { ChatProvider, ChatProviderCallbacks } from './types.js';

const RECOMMENDED_MODELS = [
  'SmolLM2-360M-Instruct-q4f16_1-MLC',
  'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
  'Phi-3.5-mini-instruct-q4f16_1-MLC',
  'Llama-3.2-1B-Instruct-q4f16_1-MLC',
] as const;

export interface BrowserChatProviderConfig {
  llmModel?: string;
  temperature?: number;
  maxTokens?: number;
  onLoadProgress?: (progress: number, status: string) => void;
}

export class BrowserChatProvider implements ChatProvider {
  readonly type = 'browser' as const;

  private engine: any = null; // MLCEngine — typed as any to avoid hard dependency
  private config: BrowserChatProviderConfig;
  private callbacks: ChatProviderCallbacks = {};
  private history: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
  private systemPrompt = '';
  private characterId = '';
  private worldId = '';
  private _loading = false;
  private _ready = false;
  private _aborted = false;

  constructor(config: BrowserChatProviderConfig = {}) {
    this.config = {
      llmModel: config.llmModel || RECOMMENDED_MODELS[0],
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 256,
      onLoadProgress: config.onLoadProgress || (() => {}),
    };
  }

  isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!(navigator as any).gpu;
  }

  isReady(): boolean {
    return this._ready && this.engine !== null;
  }

  async initialize(): Promise<void> {
    if (this._ready || this._loading) return;
    this._loading = true;

    try {
      this.callbacks.onStateChange?.('connecting');
      const { CreateMLCEngine } = await import('@mlc-ai/web-llm');
      this.engine = await CreateMLCEngine(this.config.llmModel!, {
        initProgressCallback: (progress: any) => {
          this.config.onLoadProgress?.(progress.progress ?? 0, progress.text ?? 'Loading...');
        },
      });
      this._ready = true;
      this._loading = false;
      console.log(`[BrowserChat] Model loaded: ${this.config.llmModel}`);
    } catch (err: any) {
      this._loading = false;
      this.callbacks.onStateChange?.('error');
      throw err;
    }
  }

  setCallbacks(callbacks: ChatProviderCallbacks): void { this.callbacks = callbacks; }

  setCharacter(characterId: string, worldId: string, _gender?: string): void {
    this.characterId = characterId;
    this.worldId = worldId;
    this.history = []; // Reset history for new character
  }

  setSystemPrompt(prompt: string): void {
    this.systemPrompt = prompt;
    this.history = [];
  }

  async sendText(text: string, _languageCode?: string): Promise<string> {
    if (!this.engine || !this._ready) {
      throw new Error('BrowserChatProvider not initialized');
    }

    this._aborted = false;
    this.callbacks.onStateChange?.('thinking');

    const messages: Array<{ role: string; content: string }> = [];
    if (this.systemPrompt) messages.push({ role: 'system', content: this.systemPrompt });
    for (const msg of this.history) messages.push(msg);
    messages.push({ role: 'user', content: text });
    this.history.push({ role: 'user', content: text });

    let fullText = '';
    try {
      const chunks = await this.engine.chat.completions.create({
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        stream: true,
      });

      this.callbacks.onStateChange?.('speaking');

      for await (const chunk of chunks) {
        if (this._aborted) break;
        const token = chunk.choices[0]?.delta?.content || '';
        if (token) {
          fullText += token;
          this.callbacks.onTextChunk?.(token, false);
        }
      }

      this.callbacks.onTextChunk?.('', true);
      this.history.push({ role: 'assistant', content: fullText });

      // Trim history
      if (this.history.length > 20) this.history = this.history.slice(-20);

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
    // Browser chat provider doesn't handle audio directly.
    // InsimulClient orchestrator runs STT first, then calls sendText().
    throw new Error('BrowserChatProvider does not support audio input — use STT provider first');
  }

  abort(): void {
    this._aborted = true;
  }

  async dispose(): Promise<void> {
    this.abort();
    this.history = [];
    this.engine = null;
    this._ready = false;
  }

  /** Get the list of recommended small models */
  static getRecommendedModels(): readonly string[] {
    return RECOMMENDED_MODELS;
  }
}
