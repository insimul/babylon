/**
 * Insimul SDK Type Definitions
 *
 * Protocol types mirror the conversation service protobuf schema.
 * Client types define the public SDK API surface.
 */

import type { ChatProvider } from './providers/chat/types.js';
import type { TTSProvider } from './providers/tts/types.js';
import type { STTProvider } from './providers/stt/types.js';

// ── Provider type aliases ─────────────────────────────────────────────────

export type ChatProviderType = 'server' | 'browser' | 'local';
export type TTSProviderType = 'server' | 'browser' | 'local' | 'none';
export type STTProviderType = 'server' | 'browser' | 'local' | 'none';

// ── Conversation state ────────────────────────────────────────────────────

/** Client-facing conversation state (string union for ergonomics). */
export type ConversationState =
  | 'idle'
  | 'connecting'
  | 'thinking'
  | 'speaking'
  | 'listening'
  | 'error';

// ── Protocol Enums (wire format — kept for SSE/WS message parsing) ────────

export enum SystemCommandType {
  SYSTEM_COMMAND_TYPE_UNSPECIFIED = 0,
  END = 1,
  PAUSE = 2,
  RESUME = 3,
}

export enum AudioEncoding {
  AUDIO_ENCODING_UNSPECIFIED = 0,
  PCM = 1,
  OPUS = 2,
  MP3 = 3,
}

export enum ConversationStateProto {
  CONVERSATION_STATE_UNSPECIFIED = 0,
  STARTED = 1,
  ACTIVE = 2,
  PAUSED = 3,
  ENDED = 4,
}

// ── Request Messages ──────────────────────────────────────────────────────

export interface TextInput {
  text: string;
  sessionId: string;
  characterId: string;
  worldId?: string;
  languageCode: string;
}

export interface AudioChunkInput {
  data: Uint8Array;
  encoding: AudioEncoding;
  sampleRate: number;
  sessionId: string;
  characterId: string;
}

export interface SystemCommand {
  type: SystemCommandType;
  sessionId: string;
  parameters: Record<string, string>;
}

// ── Response Messages ─────────────────────────────────────────────────────

export interface TextChunk {
  text: string;
  isFinal: boolean;
  languageCode?: string;
  sessionId?: string;
}

export interface AudioChunkOutput {
  data: Uint8Array;
  encoding: AudioEncoding;
  sampleRate: number;
  durationMs: number;
}

export interface Viseme {
  phoneme: string;
  weight: number;
  durationMs: number;
}

export interface FacialData {
  visemes: Viseme[];
}

export interface ActionTrigger {
  actionType: string;
  targetId: string;
  parameters: Record<string, string>;
}

export interface ConversationMeta {
  sessionId: string;
  state: ConversationStateProto;
}

// ── SSE Event Types ───────────────────────────────────────────────────────

export interface SSETextEvent {
  type: 'text';
  text: string;
  isFinal: boolean;
}

export interface SSEAudioEvent {
  type: 'audio';
  data: string; // base64-encoded
  encoding: AudioEncoding;
  sampleRate: number;
  durationMs: number;
}

export interface SSEFacialEvent {
  type: 'facial';
  visemes: Viseme[];
}

export interface SSETranscriptEvent {
  type: 'transcript';
  text: string;
}

export interface SSEMetadataEvent {
  type: 'vocab_hints' | 'grammar_feedback' | 'quest_assign' | 'eval' | 'quest_progress';
  content: string;
}

export interface SSEErrorEvent {
  type: 'error';
  message: string;
}

export type SSEEvent =
  | SSETextEvent
  | SSEAudioEvent
  | SSEFacialEvent
  | SSETranscriptEvent
  | SSEMetadataEvent
  | SSEErrorEvent;

// ── Client Options ────────────────────────────────────────────────────────

export interface InsimulClientOptions {
  // ── Provider selection (string = built-in, object = custom) ──
  /** Chat provider. Omit to auto-detect. */
  chat?: ChatProviderType | ChatProvider;
  /** TTS provider. Omit to match chat provider. */
  tts?: TTSProviderType | TTSProvider;
  /** STT provider. Omit to match chat provider. */
  stt?: STTProviderType | STTProvider;

  // ── Server config (chat/tts/stt = 'server') ─────────────────
  /** Insimul server base URL */
  serverUrl?: string;
  /** API key for authentication */
  apiKey?: string;
  /** World ID for conversations */
  worldId?: string;
  /** Prefer WebSocket over SSE (default: true) */
  preferWebSocket?: boolean;

  // ── Browser config (chat = 'browser') ───────────────────────
  /** WebLLM model ID (default: SmolLM2-360M-Instruct-q4f16_1-MLC) */
  llmModel?: string;
  /** Kokoro TTS voice (default: auto-selected by gender/language) */
  ttsVoice?: string;
  /** LLM temperature (default: 0.7) */
  temperature?: number;
  /** Max response tokens (default: 256) */
  maxTokens?: number;
  /** Model download progress callback */
  onLoadProgress?: (progress: number, status: string) => void;

  // ── Common config ───────────────────────────────────────────
  /** Default language code (default: 'en') */
  languageCode?: string;
  /** Build system prompt from characterId + worldId */
  systemPromptBuilder?: (characterId: string, worldId: string) => string;
}

// ── Callback Types ────────────────────────────────────────────────────────

export interface InsimulEventCallbacks {
  /** Streaming text token from NPC */
  onTextChunk?: (text: string, isFinal: boolean) => void;
  /** Audio chunk from TTS (PCM/MP3/Opus) */
  onAudioChunk?: (chunk: AudioChunkOutput) => void;
  /** Viseme/facial data for lip sync */
  onFacialData?: (data: FacialData) => void;
  /** Server-triggered game action */
  onActionTrigger?: (action: ActionTrigger) => void;
  /** Metadata event (vocab hints, grammar feedback, quest assignments) */
  onMetadata?: (type: string, content: string) => void;
  /** Full response complete */
  onComplete?: (fullText: string) => void;
  /** Conversation state change */
  onStateChange?: (state: ConversationState) => void;
  /** Error */
  onError?: (error: Error) => void;
  /** Player speech transcription (from STT) */
  onTranscript?: (text: string, isFinal: boolean) => void;
  /** Live session was interrupted (e.g., player spoke while NPC was speaking) */
  onInterrupted?: () => void;
}

// ── Conversation context ──────────────────────────────────────────────────

export interface SendTextOptions {
  languageCode?: string;
  /** Additional context passed to the chat provider (e.g., prolog facts) */
  context?: Record<string, unknown>;
  /** Prolog facts from the client-side game engine, sent to enrich server-side prompts */
  prologFacts?: Array<{ predicate: string; args: Array<string | number> }>;
}

// ── Conversation Metadata (language learning) ────────────────────────────

export interface ConversationMetadataRequest {
  playerMessage: string;
  npcResponse: string;
  targetLanguage: string;
  playerProficiency?: string;
  cefrLevel?: string;
  /** Vocabulary frequency range label for the current CEFR level (e.g. "top 200 most common words") */
  vocabularyRange?: string;
  /** Active quest objectives to evaluate against this conversation exchange.
   *  The server will ask the LLM if any of these goals were met. */
  activeObjectives?: Array<{
    questId: string;
    objectiveId: string;
    objectiveType: string;
    description: string;
    npcId?: string;
  }>;
}

export interface ConversationGoalEvaluation {
  questId: string;
  objectiveId: string;
  goalMet: boolean;
  confidence: number;
  extractedInfo: string;
}

export interface ConversationMetadataResponse {
  /** Evaluated quest objectives — which conversational goals were met */
  goalEvaluations?: ConversationGoalEvaluation[];
  vocabHints?: Array<{ word: string; translation: string; context?: string }>;
  grammarFeedback?: {
    status: 'correct' | 'corrected' | 'no_target_language';
    errors?: Array<{ incorrect: string; corrected: string; explanation: string; pattern?: string }>;
    errorCount?: number;
  };
  /** Facts about the NPC revealed during this exchange */
  npcDetails?: string[];
  questAssignment?: Record<string, unknown>;
  [key: string]: unknown;
}

// ── Health Check ──────────────────────────────────────────────────────────

export interface HealthCheckResponse {
  healthy: boolean;
  version: string;
  services?: Record<string, boolean>;
}
