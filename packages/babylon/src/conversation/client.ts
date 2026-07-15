/**
 * InsimulClient — unified conversation client with pluggable providers.
 *
 * Orchestrates chat (LLM), TTS, and STT across server, browser, and local backends.
 * Consumers configure their preferred mix at construction time:
 *
 *   const client = new InsimulClient({
 *     chat: 'browser',   // WebLLM in-browser
 *     tts: 'browser',    // Kokoro WASM
 *     stt: 'none',       // disabled
 *   });
 *
 *   client.on({ onTextChunk, onAudioChunk, onComplete });
 *   client.setCharacter(npcId, worldId);
 *   await client.sendText("Hello!");
 */

import type {
  InsimulClientOptions,
  InsimulEventCallbacks,
  ConversationState,
  SendTextOptions,
  HealthCheckResponse,
  ChatProviderType,
  TTSProviderType,
  STTProviderType,
} from './types.js';
import type { ChatProvider } from './providers/chat/types.js';
import type { TTSProvider } from './providers/tts/types.js';
import type { STTProvider } from './providers/stt/types.js';
import { detectBestChatProvider, detectBestTTSProvider, detectBestSTTProvider } from './detect.js';

// ── Provider factories ──────────────────────────────────────────────────

async function createChatProvider(type: ChatProviderType, options: InsimulClientOptions): Promise<ChatProvider> {
  switch (type) {
    case 'server': {
      const { ServerChatProvider } = await import('./providers/chat/server-chat-provider.js');
      return new ServerChatProvider({
        serverUrl: options.serverUrl || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000'),
        apiKey: options.apiKey,
        worldId: options.worldId,
        preferWebSocket: options.preferWebSocket ?? true,
        languageCode: options.languageCode,
      });
    }
    case 'browser': {
      const { BrowserChatProvider } = await import('./providers/chat/browser-chat-provider.js');
      return new BrowserChatProvider({
        llmModel: options.llmModel,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        onLoadProgress: options.onLoadProgress,
      });
    }
    case 'local': {
      const { LocalChatProvider } = await import('./providers/chat/local-chat-provider.js');
      return new LocalChatProvider();
    }
  }
}

async function createTTSProvider(type: TTSProviderType, _options: InsimulClientOptions): Promise<TTSProvider> {
  switch (type) {
    case 'server': {
      const { ServerTTSProvider } = await import('./providers/tts/server-tts-provider.js');
      return new ServerTTSProvider();
    }
    case 'browser': {
      const { BrowserTTSProvider } = await import('./providers/tts/browser-tts-provider.js');
      return new BrowserTTSProvider();
    }
    case 'local': {
      const { LocalTTSProvider } = await import('./providers/tts/local-tts-provider.js');
      return new LocalTTSProvider();
    }
    case 'none': {
      const { NoneTTSProvider } = await import('./providers/tts/none-tts-provider.js');
      return new NoneTTSProvider();
    }
  }
}

async function createSTTProvider(type: STTProviderType, options: InsimulClientOptions): Promise<STTProvider> {
  switch (type) {
    case 'server': {
      const { ServerSTTProvider } = await import('./providers/stt/server-stt-provider.js');
      return new ServerSTTProvider(options.serverUrl || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000'), options.apiKey);
    }
    case 'browser': {
      const { BrowserSTTProvider } = await import('./providers/stt/browser-stt-provider.js');
      return new BrowserSTTProvider();
    }
    case 'local': {
      const { LocalSTTProvider } = await import('./providers/stt/local-stt-provider.js');
      return new LocalSTTProvider();
    }
    case 'none': {
      const { NoneSTTProvider } = await import('./providers/stt/none-stt-provider.js');
      return new NoneSTTProvider();
    }
  }
}

// ── InsimulClient ────────────────────────────────────────────────────────

export class InsimulClient {
  private chatProvider!: ChatProvider;
  private ttsProvider!: TTSProvider;
  private sttProvider!: STTProvider;
  private callbacks: InsimulEventCallbacks = {};
  private state: ConversationState = 'idle';
  private options: InsimulClientOptions;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  // Resolved provider types
  private chatType: ChatProviderType;
  private ttsType: TTSProviderType;
  private sttType: STTProviderType;

  // Pending character/voice settings (applied after init if set before provider is ready)
  private pendingCharacter: { characterId: string; worldId: string; gender?: string } | null = null;
  private pendingVoice: { gender?: string; language?: string; voiceId?: string } | null = null;

  constructor(options: InsimulClientOptions = {}) {
    this.options = options;

    // Resolve provider types
    this.chatType = typeof options.chat === 'string'
      ? options.chat
      : (options.chat && 'type' in options.chat) ? options.chat.type as ChatProviderType : detectBestChatProvider();

    this.ttsType = typeof options.tts === 'string'
      ? options.tts
      : (options.tts && 'type' in options.tts) ? options.tts.type as TTSProviderType : detectBestTTSProvider(this.chatType);

    this.sttType = typeof options.stt === 'string'
      ? options.stt
      : (options.stt && 'type' in options.stt) ? options.stt.type as STTProviderType : detectBestSTTProvider(this.chatType);

    // Use provided provider instances directly if given
    if (options.chat && typeof options.chat === 'object' && 'type' in options.chat) {
      this.chatProvider = options.chat as ChatProvider;
    }
    if (options.tts && typeof options.tts === 'object' && 'type' in options.tts) {
      this.ttsProvider = options.tts as TTSProvider;
    }
    if (options.stt && typeof options.stt === 'object' && 'type' in options.stt) {
      this.sttProvider = options.stt as STTProvider;
    }

    console.log(`[InsimulClient] Providers: chat=${this.chatType}, tts=${this.ttsType}, stt=${this.sttType}`);
  }

  // ── Provider access ───────────────────────────────────────────────────

  getChatProvider(): ChatProvider { return this.chatProvider; }
  getTTSProvider(): TTSProvider { return this.ttsProvider; }
  getSTTProvider(): STTProvider { return this.sttProvider; }
  getChatType(): ChatProviderType { return this.chatType; }
  getTTSType(): TTSProviderType { return this.ttsType; }
  getSTTType(): STTProviderType { return this.sttType; }

  // ── Callbacks ─────────────────────────────────────────────────────────

  on(callbacks: InsimulEventCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
    if (this.initialized) this.wireProviderCallbacks();
  }

  private wireProviderCallbacks(): void {
    this.chatProvider.setCallbacks({
      onTextChunk: (text, isFinal) => this.callbacks.onTextChunk?.(text, isFinal),
      onAudioChunk: (chunk) => this.callbacks.onAudioChunk?.(chunk),
      onFacialData: (data) => this.callbacks.onFacialData?.(data),
      onActionTrigger: (action) => this.callbacks.onActionTrigger?.(action),
      onMetadata: (type, content) => this.callbacks.onMetadata?.(type, content),
      onComplete: (fullText) => {
        // If TTS is not server-streamed and not disabled, synthesize after text completes
        if (this.ttsType !== 'server' && this.ttsType !== 'none' && fullText) {
          this.ttsProvider.synthesize(fullText).catch(err => {
            console.warn('[InsimulClient] TTS failed:', err);
          });
        }
        this.callbacks.onComplete?.(fullText);
      },
      onStateChange: (state) => this.setState(state as ConversationState),
      onError: (err) => this.callbacks.onError?.(err),
      onTranscript: (text) => this.callbacks.onTranscript?.(text, true),
      onInterrupted: () => this.callbacks.onInterrupted?.(),
    });

    this.ttsProvider.setCallbacks({
      onAudioChunk: (chunk) => this.callbacks.onAudioChunk?.(chunk),
      onStart: () => this.setState('speaking'),
      onComplete: () => {
        if (this.state === 'speaking') this.setState('idle');
      },
      onError: (err) => this.callbacks.onError?.(err),
    });

    this.sttProvider.setCallbacks({
      onTranscript: (text, isFinal) => this.callbacks.onTranscript?.(text, isFinal),
      onError: (err) => this.callbacks.onError?.(err),
    });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      // Create providers that weren't passed as instances
      if (!this.chatProvider) {
        this.chatProvider = await createChatProvider(this.chatType, this.options);
      }
      if (!this.ttsProvider) {
        this.ttsProvider = await createTTSProvider(this.ttsType, this.options);
      }
      if (!this.sttProvider) {
        this.sttProvider = await createSTTProvider(this.sttType, this.options);
      }

      // Wire callbacks
      this.wireProviderCallbacks();

      // Initialize all providers
      await Promise.all([
        this.chatProvider.initialize(),
        this.ttsProvider.initialize(),
        this.sttProvider.initialize(),
      ]);

      // Apply any character/voice settings that were set before init completed
      if (this.pendingCharacter) {
        this.chatProvider.setCharacter(this.pendingCharacter.characterId, this.pendingCharacter.worldId, this.pendingCharacter.gender);
        if (this.options.systemPromptBuilder) {
          this.chatProvider.setSystemPrompt(
            this.options.systemPromptBuilder(this.pendingCharacter.characterId, this.pendingCharacter.worldId),
          );
        }
      }
      if (this.pendingVoice) {
        this.ttsProvider.setVoice(this.pendingVoice);
      }

      this.initialized = true;
      this.initPromise = null;
    })();

    return this.initPromise;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) await this.initialize();
  }

  setCharacter(characterId: string, worldId: string, gender?: string): void {
    this.pendingCharacter = { characterId, worldId, gender };
    if (this.chatProvider) {
      this.chatProvider.setCharacter(characterId, worldId, gender);
      if (this.options.systemPromptBuilder) {
        this.chatProvider.setSystemPrompt(this.options.systemPromptBuilder(characterId, worldId));
      }
    }
  }

  /** Set TTS voice for the current character */
  setVoice(options: { gender?: string; language?: string; voiceId?: string }): void {
    this.pendingVoice = options;
    if (this.ttsProvider) {
      this.ttsProvider.setVoice(options);
    }
  }

  getState(): ConversationState { return this.state; }

  private setState(state: ConversationState): void {
    if (this.state !== state) {
      this.state = state;
      this.callbacks.onStateChange?.(state);
    }
  }

  // ── Messaging ─────────────────────────────────────────────────────────

  /** Set game context (CEFR level, vocabulary, grammar) sent with each message to the server */
  setGameContext(context: Record<string, unknown>): void {
    this.chatProvider.setGameContext?.(context);
  }

  async sendText(text: string, options?: SendTextOptions): Promise<string> {
    await this.ensureInitialized();
    return this.chatProvider.sendText(text, options?.languageCode || this.options.languageCode, options?.prologFacts);
  }

  async sendAudio(audioBlob: Blob, options?: SendTextOptions): Promise<string> {
    await this.ensureInitialized();

    // Server handles STT+LLM+TTS in one pipeline
    if (this.chatType === 'server') {
      return this.chatProvider.sendAudio(audioBlob, options?.languageCode || this.options.languageCode);
    }

    // For browser/local: STT first, then sendText
    this.setState('listening');
    const transcript = await this.sttProvider.transcribe(audioBlob, options?.languageCode || this.options.languageCode);
    this.callbacks.onTranscript?.(transcript, true);

    if (!transcript) {
      this.setState('idle');
      return '';
    }

    return this.sendText(transcript, options);
  }

  /**
   * Pre-warm LLM context for an NPC so the first conversation turn is fast.
   * Best-effort — silently ignores failures. Only works with server chat provider.
   */
  async preWarm(characterId: string, worldId: string, playerId: string): Promise<void> {
    if (this.chatType === 'server' && 'preWarm' in this.chatProvider) {
      await (this.chatProvider as any).preWarm(characterId, worldId, playerId);
    }
  }

  // ── Live Session ───────────────────────────────────────────────────────

  /**
   * Start a Gemini Live session for bidirectional audio streaming.
   * Only works with server chat provider. Returns the liveSessionId.
   */
  async startLiveSession(options: {
    characterId: string;
    worldId: string;
    systemPrompt?: string;
    voiceName?: string;
    languageCode?: string;
  }): Promise<string> {
    await this.ensureInitialized();
    if (this.chatType !== 'server' || !('startLiveSession' in this.chatProvider)) {
      throw new Error('Live sessions require the server chat provider');
    }
    return (this.chatProvider as any).startLiveSession(options);
  }

  /**
   * Send raw audio chunk to the active Live session.
   * Data should be PCM audio as a Uint8Array.
   */
  sendAudioChunk(data: Uint8Array): void {
    if (this.chatType !== 'server' || !('sendAudioChunk' in this.chatProvider)) {
      throw new Error('Live sessions require the server chat provider');
    }
    (this.chatProvider as any).sendAudioChunk(data);
  }

  /**
   * End the active Live session.
   */
  async endLiveSession(): Promise<void> {
    if (this.chatType !== 'server' || !('endLiveSession' in this.chatProvider)) return;
    await (this.chatProvider as any).endLiveSession();
  }

  /** Whether a Live session is currently active */
  get isLiveSession(): boolean {
    if (this.chatType !== 'server' || !this.chatProvider) return false;
    return (this.chatProvider as any).isLiveSession ?? false;
  }

  abort(): void {
    this.chatProvider?.abort();
    this.ttsProvider?.abort();
    this.sttProvider?.abort();
    this.setState('idle');
  }

  async dispose(): Promise<void> {
    this.abort();
    await Promise.all([
      this.chatProvider?.dispose(),
      this.ttsProvider?.dispose(),
      this.sttProvider?.dispose(),
    ]);
    this.initialized = false;
  }

  // ── Language Learning Metadata ─────────────────────────────────────────

  /**
   * Request conversation metadata (vocabulary hints, grammar feedback, quest assignments)
   * from the server. Used by language learning games to analyze conversation exchanges.
   * Fire-and-forget — does not block conversation flow.
   *
   * Returns the metadata response, or null if the request fails.
   */
  async requestMetadata(request: import('./types.js').ConversationMetadataRequest): Promise<import('./types.js').ConversationMetadataResponse | null> {
    const serverUrl = this.options.serverUrl || '';
    try {
      const res = await fetch(`${serverUrl}/api/conversation/metadata`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.options.apiKey ? { 'Authorization': `Bearer ${this.options.apiKey}` } : {}),
        },
        body: JSON.stringify(request),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /**
   * Synthesize text-to-speech audio (standalone, outside of conversation).
   * Uses the server TTS endpoint. Returns the audio as an ArrayBuffer, or null.
   */
  async synthesizeSpeech(text: string, options?: {
    voice?: string;
    gender?: string;
    encoding?: string;
  }): Promise<ArrayBuffer | null> {
    // For browser/local TTS providers, use the provider directly
    if (this.ttsType !== 'server' && this.ttsType !== 'none' && this.ttsProvider?.isReady()) {
      return this.ttsProvider.synthesize(text);
    }

    // Server TTS endpoint
    const serverUrl = this.options.serverUrl || '';
    try {
      const res = await fetch(`${serverUrl}/api/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.options.apiKey ? { 'Authorization': `Bearer ${this.options.apiKey}` } : {}),
        },
        body: JSON.stringify({
          text,
          voice: options?.voice || 'Kore',
          gender: options?.gender || 'neutral',
          encoding: options?.encoding || 'MP3',
        }),
      });
      if (!res.ok) return null;
      return await res.arrayBuffer();
    } catch {
      return null;
    }
  }

  /**
   * Translate a single word (for hover-to-translate in language learning games).
   * Returns the translation, or null if unavailable.
   */
  async translateWord(word: string, targetLanguage: string): Promise<{ word: string; translation: string; context?: string } | null> {
    const serverUrl = this.options.serverUrl || '';
    try {
      const res = await fetch(`${serverUrl}/api/conversation/translate-word`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.options.apiKey ? { 'Authorization': `Bearer ${this.options.apiKey}` } : {}),
        },
        body: JSON.stringify({ word, targetLanguage }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /**
   * Transcribe speech audio (standalone STT, outside of conversation).
   * Routes through local STT provider if available, otherwise uses server.
   * Returns the transcribed text, or empty string on failure.
   */
  async transcribeSpeech(audioBlob: Blob, languageCode?: string): Promise<string> {
    // For local/browser STT providers, use the provider directly
    if (this.sttType !== 'server' && this.sttType !== 'none' && this.sttProvider?.isReady()) {
      return this.sttProvider.transcribe(audioBlob, languageCode || this.options.languageCode);
    }

    // Server STT endpoint
    const serverUrl = this.options.serverUrl || '';
    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');
      if (languageCode) formData.append('languageCode', languageCode);

      const res = await fetch(`${serverUrl}/api/stt`, {
        method: 'POST',
        headers: this.options.apiKey ? { 'Authorization': `Bearer ${this.options.apiKey}` } : {},
        body: formData,
      });
      if (!res.ok) return '';
      const data = await res.json();
      return data.transcript || data.text || '';
    } catch {
      return '';
    }
  }

  /**
   * Simulate a rich NPC-NPC conversation (multi-turn with personality).
   * Returns the simulation result, or null.
   */
  async simulateRichConversation(request: {
    char1Id: string;
    char2Id: string;
    worldId?: string;
    turnCount?: number;
  }): Promise<Record<string, unknown> | null> {
    const serverUrl = this.options.serverUrl || '';
    try {
      const res = await fetch(`${serverUrl}/api/conversations/simulate-rich`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.options.apiKey ? { 'Authorization': `Bearer ${this.options.apiKey}` } : {}),
        },
        body: JSON.stringify({
          char1Id: request.char1Id,
          char2Id: request.char2Id,
          worldId: request.worldId || this.options.worldId || '',
          turnCount: request.turnCount,
        }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /**
   * Evaluate listening comprehension answers (for language learning assessments).
   * Returns the evaluation result, or null.
   */
  async evaluateComprehension(request: {
    questions: Array<{ question: string; playerAnswer: string; correctAnswer?: string }>;
    targetLanguage: string;
    context?: string;
  }): Promise<Record<string, unknown> | null> {
    const serverUrl = this.options.serverUrl || '';
    try {
      const res = await fetch(`${serverUrl}/api/gemini/comprehension-evaluation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.options.apiKey ? { 'Authorization': `Bearer ${this.options.apiKey}` } : {}),
        },
        body: JSON.stringify(request),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  /**
   * Trigger an NPC-to-NPC conversation (for ambient world simulation).
   * Returns the conversation result, or null.
   */
  async simulateNpcConversation(request: {
    npc1Id: string;
    npc2Id: string;
    worldId?: string;
    topic?: string;
    languageCode?: string;
  }): Promise<Record<string, unknown> | null> {
    const serverUrl = this.options.serverUrl || '';
    const worldId = request.worldId || this.options.worldId || '';
    try {
      const res = await fetch(`${serverUrl}/api/worlds/${worldId}/npc-npc-conversation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.options.apiKey ? { 'Authorization': `Bearer ${this.options.apiKey}` } : {}),
        },
        body: JSON.stringify({
          npc1Id: request.npc1Id,
          npc2Id: request.npc2Id,
          topic: request.topic,
          languageCode: request.languageCode || this.options.languageCode || 'en',
        }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  // ── Utility ───────────────────────────────────────────────────────────

  async isAvailable(): Promise<boolean> {
    if (this.chatProvider) return this.chatProvider.isSupported();
    // Before initialization, check based on type
    switch (this.chatType) {
      case 'browser': return typeof navigator !== 'undefined' && !!(navigator as any).gpu;
      case 'local': return typeof window !== 'undefined' && !!(window as any).electronAPI?.aiAvailable;
      case 'server': return true;
    }
  }

  async healthCheck(): Promise<HealthCheckResponse> {
    if (this.chatType !== 'server') {
      return { healthy: this.chatProvider?.isReady() ?? false, version: '2.0.0' };
    }
    try {
      const serverUrl = this.options.serverUrl || 'http://localhost:8080';
      const res = await fetch(`${serverUrl}/api/conversation/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) return await res.json();
      return { healthy: false, version: '0.0.0' };
    } catch {
      return { healthy: false, version: '0.0.0' };
    }
  }
}
