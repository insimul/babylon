/**
 * TypeScript type definitions for proto/conversation.proto
 *
 * These types mirror the protobuf schema and are used by both the gRPC server
 * and any client code that interacts with the conversation service.
 */

// ── Enums ──────────────────────────────────────────────────────────────────

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

export enum ConversationState {
  CONVERSATION_STATE_UNSPECIFIED = 0,
  STARTED = 1,
  ACTIVE = 2,
  PAUSED = 3,
  ENDED = 4,
}

// ── Request Messages ───────────────────────────────────────────────────────

export interface TextInput {
  text: string;
  sessionId: string;
  characterId: string;
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

export type ConversationRequest =
  | { textInput: TextInput; audioChunk?: undefined; systemCommand?: undefined }
  | { textInput?: undefined; audioChunk: AudioChunkInput; systemCommand?: undefined }
  | { textInput?: undefined; audioChunk?: undefined; systemCommand: SystemCommand };

// ── Response Messages ──────────────────────────────────────────────────────

export interface TextChunk {
  text: string;
  isFinal: boolean;
  languageCode: string;
  sessionId: string;
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
  state: ConversationState;
}

export type ConversationResponse =
  | { textChunk: TextChunk; audioChunk?: undefined; facialData?: undefined; actionTrigger?: undefined; conversationMeta?: undefined }
  | { textChunk?: undefined; audioChunk: AudioChunkOutput; facialData?: undefined; actionTrigger?: undefined; conversationMeta?: undefined }
  | { textChunk?: undefined; audioChunk?: undefined; facialData: FacialData; actionTrigger?: undefined; conversationMeta?: undefined }
  | { textChunk?: undefined; audioChunk?: undefined; facialData?: undefined; actionTrigger: ActionTrigger; conversationMeta?: undefined }
  | { textChunk?: undefined; audioChunk?: undefined; facialData?: undefined; actionTrigger?: undefined; conversationMeta: ConversationMeta };

// ── NPC-to-NPC ─────────────────────────────────────────────────────────────

export interface NpcToNpcRequest {
  npc1Id: string;
  npc2Id: string;
  worldId: string;
  topic: string;
  languageCode: string;
}

// ── Health Check ───────────────────────────────────────────────────────────

export interface HealthCheckRequest {}

export interface HealthCheckResponse {
  healthy: boolean;
  version: string;
}
