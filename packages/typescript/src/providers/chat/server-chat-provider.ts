/**
 * ServerChatProvider — connects to the Insimul server via WebSocket (primary)
 * or SSE/HTTP (fallback) for streaming NPC conversations.
 *
 * Ported from ConversationClient.ts WebSocket + SSE paths.
 */

import type { ChatProvider, ChatProviderCallbacks } from './types.js';
import type { AudioChunkOutput } from '../../types.js';

export interface ServerChatProviderConfig {
  serverUrl: string;
  apiKey?: string;
  worldId?: string;
  preferWebSocket?: boolean;
  languageCode?: string;
}

export interface LiveSessionOptions {
  characterId: string;
  worldId: string;
  systemPrompt?: string;
  voiceName?: string;
  languageCode?: string;
}

export class ServerChatProvider implements ChatProvider {
  readonly type = 'server' as const;

  private config: ServerChatProviderConfig;
  private callbacks: ChatProviderCallbacks = {};
  private characterId = '';
  private worldId = '';
  private characterGender = '';
  private sessionId: string;
  private systemPrompt = '';
  private gameContext: Record<string, unknown> = {};

  // WebSocket state
  private ws: WebSocket | null = null;
  private wsConnecting: Promise<void> | null = null;
  private pendingResolve: ((text: string) => void) | null = null;
  private pendingFullText = '';
  private pendingTextComplete = false;
  private pendingHasAudio = false;
  private pendingAudioMetaQueue: Array<{ encoding: number; sampleRate: number; durationMs: number }> = [];

  // Live session state
  private liveSessionActive = false;
  private liveSessionId: string | null = null;

  // SSE fallback state
  private abortController: AbortController | null = null;

  constructor(config: ServerChatProviderConfig) {
    this.config = {
      preferWebSocket: true,
      languageCode: 'en',
      ...config,
    };
    this.sessionId = `sdk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.worldId = config.worldId || '';
  }

  async initialize(): Promise<void> {
    if (this.config.preferWebSocket) {
      try {
        await this.ensureWSConnected();
      } catch {
        // WebSocket failed — will use SSE fallback
      }
    }
  }

  isSupported(): boolean { return true; }

  isReady(): boolean {
    if (this.config.preferWebSocket && this.ws?.readyState === WebSocket.OPEN) return true;
    return true; // SSE fallback is always available
  }

  setCallbacks(callbacks: ChatProviderCallbacks): void { this.callbacks = callbacks; }

  setCharacter(characterId: string, worldId: string, gender?: string): void {
    this.characterId = characterId;
    this.worldId = worldId;
    if (gender) this.characterGender = gender;
  }

  setSystemPrompt(prompt: string): void { this.systemPrompt = prompt; }

  setGameContext(context: Record<string, unknown>): void { this.gameContext = context; }

  async sendText(text: string, languageCode?: string, prologFacts?: Array<{ predicate: string; args: Array<string | number> }>): Promise<string> {
    const lang = languageCode || this.config.languageCode || 'en';
    // Cap prologFacts at 50 entries to avoid bloating the request
    const cappedFacts = prologFacts?.slice(0, 50);

    // Try WebSocket first
    if (this.config.preferWebSocket !== false) {
      try {
        return await this.sendTextWS(text, lang, cappedFacts);
      } catch (err: any) {
        console.warn('[ServerChat] WebSocket unavailable, falling back to SSE:', err.message);
      }
    }

    return this.sendTextSSE(text, lang, cappedFacts);
  }

  async sendAudio(audioBlob: Blob, languageCode?: string): Promise<string> {
    const lang = languageCode || this.config.languageCode || 'en';

    // Try WebSocket
    if (this.config.preferWebSocket !== false && this.ws?.readyState === WebSocket.OPEN) {
      try {
        return await this.sendAudioWS(audioBlob, lang);
      } catch {
        // fall through to SSE
      }
    }

    return this.sendAudioSSE(audioBlob, lang);
  }

  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    if (this.pendingResolve) {
      this.pendingResolve('');
      this.pendingResolve = null;
    }
  }

  async dispose(): Promise<void> {
    this.abort();
    if (this.liveSessionActive) {
      try { await this.endLiveSession(); } catch { /* best effort */ }
    }
    if (this.ws) {
      try {
        this.ws.send(JSON.stringify({ systemCommand: { type: 'END', sessionId: this.sessionId } }));
      } catch { /* best effort */ }
      this.ws.onmessage = null;
      this.ws.onerror = null;
      this.ws.onclose = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, 'disposed');
      }
      this.ws = null;
    }
  }

  // ── WebSocket transport ───────────────────────────────────────────────

  private getWSUrl(): string {
    const base = this.config.serverUrl;
    // Empty serverUrl = same origin — derive WS URL from window.location
    if (!base && typeof window !== 'undefined') {
      const loc = window.location;
      const protocol = loc.protocol === 'https:' ? 'wss' : 'ws';
      return `${protocol}://${loc.host}/ws/conversation`;
    }
    const protocol = base.startsWith('https') ? 'wss' : 'ws';
    const host = base.replace(/^https?:\/\//, '');
    return `${protocol}://${host}/ws/conversation`;
  }

  private async ensureWSConnected(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) return;
    if (this.wsConnecting) return this.wsConnecting;

    this.wsConnecting = new Promise<void>((resolve, reject) => {
      const url = this.getWSUrl();
      const ws = new WebSocket(url);
      const timeout = setTimeout(() => { ws.close(); reject(new Error('WS timeout')); }, 5000);

      ws.onopen = () => {
        clearTimeout(timeout);
        this.ws = ws;
        this.wsConnecting = null;
        ws.send(JSON.stringify({ resumeSession: { sessionId: this.sessionId } }));
        resolve();
      };

      ws.onerror = () => { clearTimeout(timeout); this.wsConnecting = null; reject(new Error('WS failed')); };
      ws.onclose = () => { this.ws = null; this.wsConnecting = null; };

      ws.onmessage = (event) => {
        if (typeof event.data === 'string') this.handleWSMessage(event.data);
        else if (event.data instanceof Blob) this.handleWSBinaryMessage(event.data);
      };
    });

    return this.wsConnecting;
  }

  private handleWSMessage(raw: string): void {
    try {
      const parsed = JSON.parse(raw);
      this.dispatchWSEvent(parsed);
    } catch { /* skip malformed */ }
  }

  private async handleWSBinaryMessage(blob: Blob): Promise<void> {
    const buffer = await blob.arrayBuffer();
    const data = new Uint8Array(buffer);
    const meta = this.pendingAudioMetaQueue.shift();

    const chunk: AudioChunkOutput = {
      data,
      encoding: meta?.encoding ?? 3,
      sampleRate: meta?.sampleRate ?? 24000,
      durationMs: meta?.durationMs ?? 0,
    };
    this.callbacks.onAudioChunk?.(chunk);
    this.pendingHasAudio = true;
  }

  private dispatchWSEvent(parsed: any): void {
    switch (parsed.type) {
      case 'text':
        this.callbacks.onTextChunk?.(parsed.text ?? '', parsed.isFinal ?? false);
        if (parsed.text) this.pendingFullText += parsed.text;
        if (parsed.isFinal && !this.pendingTextComplete) {
          this.pendingTextComplete = true;
          this.pendingResolve?.(this.pendingFullText);
        }
        break;
      case 'audio_meta':
        this.pendingAudioMetaQueue.push({
          encoding: parsed.encoding, sampleRate: parsed.sampleRate, durationMs: parsed.durationMs,
        });
        break;
      case 'facial':
        if (parsed.visemes) this.callbacks.onFacialData?.({ visemes: parsed.visemes });
        break;
      case 'meta':
        if (parsed.state === 'ACTIVE') this.callbacks.onStateChange?.('thinking');
        break;
      case 'done':
        this.callbacks.onComplete?.(this.pendingFullText);
        if (!this.pendingTextComplete) this.pendingResolve?.(this.pendingFullText);
        this.pendingResolve = null;
        this.callbacks.onStateChange?.('idle');
        break;
      case 'transcript':
        this.callbacks.onTranscript?.(parsed.text ?? '');
        break;
      case 'interrupted':
        this.callbacks.onInterrupted?.();
        break;
      case 'live_session_started':
        // Handled in startLiveSession() promise — ignore here for normal dispatch
        break;
      case 'live_session_ended':
        this.liveSessionActive = false;
        this.liveSessionId = null;
        break;
      case 'vocab_hints': case 'grammar_feedback': case 'quest_assign': case 'eval':
        this.callbacks.onMetadata?.(parsed.type, parsed.content ?? '');
        break;
      case 'pre_warm_ack':
        // Silently acknowledge pre-warm result — no user-facing action needed
        break;
      case 'error':
        this.callbacks.onError?.(new Error(parsed.message || 'Server error'));
        break;
    }
  }

  private resetPendingState(): void {
    this.pendingFullText = '';
    this.pendingTextComplete = false;
    this.pendingHasAudio = false;
    this.pendingAudioMetaQueue = [];
    this.pendingResolve = null;
  }

  private async sendTextWS(text: string, lang: string, prologFacts?: Array<{ predicate: string; args: Array<string | number> }>): Promise<string> {
    await this.ensureWSConnected();
    this.resetPendingState();
    this.callbacks.onStateChange?.('thinking');

    return new Promise<string>((resolve, reject) => {
      this.pendingResolve = resolve;
      try {
        this.ws!.send(JSON.stringify({
          textInput: {
            text, sessionId: this.sessionId, characterId: this.characterId,
            worldId: this.worldId, languageCode: lang,
            ...(prologFacts?.length ? { prologFacts } : {}),
            systemPrompt: this.systemPrompt || undefined,
            characterGender: this.characterGender || undefined,
            cefrLevel: this.gameContext.cefrLevel || undefined,
            gameHour: this.gameContext.gameHour ?? undefined,
            playerVocabulary: this.gameContext.playerVocabulary || undefined,
            playerGrammarPatterns: this.gameContext.playerGrammarPatterns || undefined,
            appearanceDescription: this.gameContext.appearanceDescription || undefined,
          },
        }));
      } catch (err: any) {
        this.pendingResolve = null;
        reject(err);
      }
    });
  }

  private async sendAudioWS(audioBlob: Blob, lang: string): Promise<string> {
    await this.ensureWSConnected();
    this.resetPendingState();
    this.callbacks.onStateChange?.('listening');

    return new Promise<string>((resolve, reject) => {
      this.pendingResolve = resolve;
      try {
        audioBlob.arrayBuffer().then((buffer) => {
          this.ws!.send(new Uint8Array(buffer));
          this.ws!.send(JSON.stringify({
            audioEnd: {
              sessionId: this.sessionId, characterId: this.characterId,
              worldId: this.worldId, languageCode: lang,
            },
          }));
        }).catch(reject);
      } catch (err: any) {
        this.pendingResolve = null;
        reject(err);
      }
    });
  }

  // ── Live session ──────────────────────────────────────────────────────

  /** Whether a Live session is currently active */
  get isLiveSession(): boolean { return this.liveSessionActive; }

  /**
   * Start a Gemini Live session for bidirectional audio streaming.
   * Returns the liveSessionId assigned by the server.
   */
  async startLiveSession(options: LiveSessionOptions): Promise<string> {
    await this.ensureWSConnected();

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Live session start timeout'));
      }, 10000);

      // Temporarily listen for the acknowledgment
      const origHandler = this.ws!.onmessage;
      this.ws!.onmessage = (event) => {
        if (typeof event.data === 'string') {
          try {
            const parsed = JSON.parse(event.data);
            if (parsed.type === 'live_session_started') {
              clearTimeout(timeout);
              this.liveSessionActive = true;
              this.liveSessionId = parsed.liveSessionId;
              // Restore normal handler
              this.ws!.onmessage = origHandler;
              resolve(parsed.liveSessionId);
              return;
            }
            if (parsed.type === 'error') {
              clearTimeout(timeout);
              this.ws!.onmessage = origHandler;
              reject(new Error(parsed.message || 'Failed to start Live session'));
              return;
            }
          } catch { /* skip malformed */ }
        }
        // Forward non-ack messages to normal handler
        if (origHandler) (origHandler as any)(event);
      };

      try {
        this.ws!.send(JSON.stringify({
          startLiveSession: {
            characterId: options.characterId,
            worldId: options.worldId,
            sessionId: this.sessionId,
            systemPrompt: options.systemPrompt,
            voiceName: options.voiceName,
            languageCode: options.languageCode,
          },
        }));
      } catch (err: any) {
        clearTimeout(timeout);
        this.ws!.onmessage = origHandler;
        reject(err);
      }
    });
  }

  /**
   * Send raw audio data to the active Live session.
   * Data should be PCM audio as a Uint8Array.
   */
  sendAudioChunk(data: Uint8Array): void {
    if (!this.liveSessionActive || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('No active Live session');
    }
    // Encode to base64 for the audioInput message
    const base64 = this.uint8ArrayToBase64(data);
    this.ws.send(JSON.stringify({
      audioInput: { data: base64 },
    }));
  }

  /** End the active Live session */
  async endLiveSession(): Promise<void> {
    if (!this.liveSessionActive || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ endLiveSession: {} }));
    this.liveSessionActive = false;
    this.liveSessionId = null;
  }

  private uint8ArrayToBase64(bytes: Uint8Array): string {
    // Use btoa if available (browser), otherwise Buffer (Node)
    if (typeof btoa === 'function') {
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    }
    return Buffer.from(bytes).toString('base64');
  }

  // ── Pre-warm ──────────────────────────────────────────────────────────

  /**
   * Pre-warm LLM context for an NPC. Fire-and-forget — builds and caches
   * the context on the server so that the first conversation turn is fast.
   */
  async preWarm(characterId: string, worldId: string, playerId: string): Promise<void> {
    try {
      await this.ensureWSConnected();
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          preWarm: { characterId, worldId, playerId },
        }));
      }
    } catch {
      // Pre-warm is best-effort — silently ignore failures
    }
  }

  // ── SSE fallback transport ────────────────────────────────────────────

  private async sendTextSSE(text: string, lang: string, prologFacts?: Array<{ predicate: string; args: Array<string | number> }>): Promise<string> {
    this.abortController = new AbortController();
    this.callbacks.onStateChange?.('thinking');

    const body = {
      sessionId: this.sessionId, characterId: this.characterId,
      worldId: this.worldId, text, languageCode: lang,
      systemPrompt: this.systemPrompt || undefined,
      characterGender: this.characterGender || undefined,
      ...(prologFacts?.length ? { prologFacts } : {}),
      cefrLevel: this.gameContext.cefrLevel || undefined,
      playerVocabulary: this.gameContext.playerVocabulary || undefined,
      playerGrammarPatterns: this.gameContext.playerGrammarPatterns || undefined,
      appearanceDescription: this.gameContext.appearanceDescription || undefined,
    };

    // Warn if required fields are missing — setCharacter() may not have been called
    if (!this.characterId || !this.worldId) {
      console.error('[ServerChat] Missing characterId or worldId — call setCharacter() before sendText()', {
        characterId: this.characterId, worldId: this.worldId, sessionId: this.sessionId,
      });
    }

    console.log('[ServerChat] SSE request:', { sessionId: body.sessionId, characterId: body.characterId, worldId: body.worldId, textLen: text.length });

    const response = await fetch(`${this.config.serverUrl}/api/conversation/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.config.apiKey ? { 'Authorization': `Bearer ${this.config.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal: this.abortController.signal,
    });

    if (!response.ok) throw new Error(`Server returned ${response.status}: ${await response.text().catch(() => '')}`);
    return this.consumeSSEStream(response);
  }

  private async sendAudioSSE(audioBlob: Blob, lang: string): Promise<string> {
    this.abortController = new AbortController();
    this.callbacks.onStateChange?.('listening');

    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    formData.append('sessionId', this.sessionId);
    formData.append('characterId', this.characterId);
    formData.append('worldId', this.worldId);
    formData.append('languageCode', lang);

    const response = await fetch(`${this.config.serverUrl}/api/conversation/stream-audio`, {
      method: 'POST',
      body: formData,
      signal: this.abortController.signal,
    });

    if (!response.ok) throw new Error(`Server returned ${response.status}`);
    return this.consumeSSEStream(response);
  }

  private async consumeSSEStream(response: Response): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.type === 'text') {
              this.callbacks.onTextChunk?.(parsed.text ?? '', parsed.isFinal ?? false);
              if (parsed.text) fullText += parsed.text;
            } else if (parsed.type === 'audio' && parsed.data) {
              const binaryStr = atob(parsed.data);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
              this.callbacks.onAudioChunk?.({
                data: bytes, encoding: parsed.encoding || 3,
                sampleRate: parsed.sampleRate || 24000, durationMs: parsed.durationMs || 0,
              });
            } else if (parsed.type === 'facial' && parsed.visemes) {
              this.callbacks.onFacialData?.({ visemes: parsed.visemes });
            } else if (['vocab_hints', 'grammar_feedback', 'quest_assign', 'eval'].includes(parsed.type)) {
              this.callbacks.onMetadata?.(parsed.type, parsed.content ?? '');
            } else if (parsed.type === 'error') {
              this.callbacks.onError?.(new Error(parsed.message || 'Server error'));
            }
          } catch { /* skip malformed JSON */ }
        }
      }
    } finally {
      reader.releaseLock();
      this.callbacks.onComplete?.(fullText);
      this.callbacks.onStateChange?.('idle');
    }

    return fullText;
  }
}
