/**
 * @insimul/typescript — JavaScript/TypeScript SDK for the Insimul conversation service.
 *
 * Pluggable providers for chat (LLM), TTS, and STT across server, browser, and local backends.
 *
 * Usage:
 *   import { InsimulClient } from '@insimul/typescript';
 *
 *   const client = new InsimulClient({ chat: 'browser', tts: 'browser', stt: 'none' });
 *   client.on({ onTextChunk: (text, isFinal) => console.log(text) });
 *   client.setCharacter(npcId, worldId);
 *   await client.sendText("Hello!");
 */

// ── Client ────────────────────────────────────────────────────────────────
export { InsimulClient } from './client.js';

// ── Audio utilities ───────────────────────────────────────────────────────
export { StreamingAudioPlayer } from './audio/streaming-audio-player.js';
export type { AudioPlayerCallbacks, AudioPlayerOptions } from './audio/streaming-audio-player.js';
export { MicCapture } from './audio/mic-capture.js';
export type { MicCaptureCallbacks, MicCaptureOptions } from './audio/mic-capture.js';

// ── Provider interfaces ───────────────────────────────────────────────────
export type { ChatProvider, ChatProviderCallbacks } from './providers/chat/types.js';
export type { TTSProvider, TTSProviderCallbacks, TTSVoiceOptions } from './providers/tts/types.js';
export type { STTProvider, STTProviderCallbacks } from './providers/stt/types.js';

// ── Built-in providers (for direct construction) ──────────────────────────
export { ServerChatProvider } from './providers/chat/server-chat-provider.js';
export type { ServerChatProviderConfig } from './providers/chat/server-chat-provider.js';
export { BrowserChatProvider } from './providers/chat/browser-chat-provider.js';
export type { BrowserChatProviderConfig } from './providers/chat/browser-chat-provider.js';
export { LocalChatProvider } from './providers/chat/local-chat-provider.js';

export { ServerTTSProvider } from './providers/tts/server-tts-provider.js';
export { BrowserTTSProvider } from './providers/tts/browser-tts-provider.js';
export { LocalTTSProvider } from './providers/tts/local-tts-provider.js';
export { NoneTTSProvider } from './providers/tts/none-tts-provider.js';

export { ServerSTTProvider } from './providers/stt/server-stt-provider.js';
export { BrowserSTTProvider } from './providers/stt/browser-stt-provider.js';
export { LocalSTTProvider } from './providers/stt/local-stt-provider.js';
export { NoneSTTProvider } from './providers/stt/none-stt-provider.js';

// ── Detection utilities ───────────────────────────────────────────────────
export {
  detectBestChatProvider,
  detectBestTTSProvider,
  detectBestSTTProvider,
  isElectronAI,
  isWebGPUAvailable,
  isWebSpeechAvailable,
  isKokoroAvailable,
} from './detect.js';

// ── Types ─────────────────────────────────────────────────────────────────
export {
  SystemCommandType,
  AudioEncoding,
  ConversationStateProto,
} from './types.js';

export type {
  // Provider type aliases
  ChatProviderType,
  TTSProviderType,
  STTProviderType,
  // Client state
  ConversationState,
  // Request types
  TextInput,
  AudioChunkInput,
  SystemCommand,
  // Response types
  TextChunk,
  AudioChunkOutput,
  Viseme,
  FacialData,
  ActionTrigger,
  ConversationMeta,
  // SSE event types
  SSEEvent,
  SSETextEvent,
  SSEAudioEvent,
  SSEFacialEvent,
  SSETranscriptEvent,
  SSEMetadataEvent,
  SSEErrorEvent,
  // Config types
  InsimulClientOptions,
  InsimulEventCallbacks,
  SendTextOptions,
  ConversationMetadataRequest,
  ConversationMetadataResponse,
  HealthCheckResponse,
} from './types.js';
