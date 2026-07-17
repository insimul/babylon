/**
 * Dialogue / chat streaming view-model (US-GU3).
 *
 * The engine-agnostic, UI-free heart of the default-runtime NPC dialogue panel. It
 * drives the streaming SDK's turn lifecycle — a player line opens a turn, response
 * CHUNKS accumulate into the in-flight NPC bubble, ACTION triggers (parsed from the
 * stream, applied to the KB by the panel) are recorded, and `complete`/`fail` close
 * the turn. The finished transcript projects into the `save.conversations`
 * (`ConversationSummary.recentTurns`) shape so history round-trips through a save.
 *
 * The Godot `chat_model.gd` mirrors this contract exactly; the shared cases live in
 * `packages/core/conformance/ui/chat-cases.json`, so both legs run the SAME matrix.
 * TTS + `insimul_lip_sync` are PANEL-level hooks fed from `lastNpcText()` on
 * `complete`; the streaming/action/history contract is here so it stays testable
 * headless.
 */

export type ChatRole = 'player' | 'npc';

export interface ChatMessage {
  readonly role: ChatRole;
  text: string;
  /** True while this NPC bubble is still receiving stream chunks. */
  streaming?: boolean;
  /** True when the turn ended in an error (rendered as an error bubble). */
  error?: boolean;
}

/** An action the NPC stream triggered — the panel asserts `factToAssert` into the KB. */
export interface ChatAction {
  readonly name: string;
  readonly args?: readonly string[];
  /** Prolog fact the action asserts into the KB (e.g. `has_item(player,sword)`). */
  readonly factToAssert?: string;
}

/** A projected transcript turn, matching `ConversationSummary.recentTurns`. */
export interface ChatTurn {
  readonly role: ChatRole;
  readonly content: string;
  readonly timestamp: string;
}

export class ChatModel {
  readonly characterId: string;
  readonly characterName: string;
  private messages: ChatMessage[] = [];
  private actions: ChatAction[] = [];
  private streaming = false;
  /** Index into `messages` of the in-flight NPC bubble, or -1. */
  private streamIndex = -1;
  /** Completed player/npc pairs (a turn = a player line answered by the NPC). */
  private turnCount = 0;

  constructor(characterId: string, characterName?: string) {
    this.characterId = characterId;
    this.characterName = characterName ?? characterId;
  }

  /** Seed the NPC's opening line (context greeting) — not a streamed turn. */
  greeting(text: string): void {
    if (!text) return;
    this.messages.push({ role: 'npc', text });
  }

  /**
   * Open a new turn with the player's line and an empty in-flight NPC bubble.
   * Rejected (returns false) while a turn is already streaming.
   */
  beginUserTurn(text: string): boolean {
    if (this.streaming) return false;
    const trimmed = text.trim();
    if (!trimmed) return false;
    this.messages.push({ role: 'player', text: trimmed });
    this.messages.push({ role: 'npc', text: '', streaming: true });
    this.streamIndex = this.messages.length - 1;
    this.streaming = true;
    return true;
  }

  /** Append a streamed chunk to the in-flight NPC bubble. No-op when idle. */
  appendChunk(text: string): void {
    if (!this.streaming || this.streamIndex < 0) return;
    this.messages[this.streamIndex].text += text;
  }

  /** Record an action the stream triggered (the panel applies it to the KB). */
  triggerAction(action: ChatAction): void {
    this.actions.push({ ...action });
  }

  /**
   * Close the in-flight turn (a `done` event). `fullText`, when given, replaces the
   * accumulated bubble text (the SDK's authoritative final text). Returns false when
   * no turn is in flight.
   */
  completeTurn(fullText?: string): boolean {
    if (!this.streaming || this.streamIndex < 0) return false;
    const bubble = this.messages[this.streamIndex];
    if (fullText !== undefined) bubble.text = fullText;
    delete bubble.streaming;
    this.streaming = false;
    this.streamIndex = -1;
    this.turnCount++;
    return true;
  }

  /** Fail the in-flight turn (stream error / watchdog) — renders an error bubble. */
  failTurn(error: string): boolean {
    if (!this.streaming || this.streamIndex < 0) return false;
    const bubble = this.messages[this.streamIndex];
    bubble.text = `[Error: ${error}]`;
    bubble.error = true;
    delete bubble.streaming;
    this.streaming = false;
    this.streamIndex = -1;
    return true;
  }

  isStreaming(): boolean {
    return this.streaming;
  }

  /** The whole transcript (including any in-flight / errored bubble), oldest first. */
  messageList(): readonly ChatMessage[] {
    return this.messages.map((m) => ({ ...m }));
  }

  /** Actions triggered so far (the panel diffs this to feed the KB). */
  actionList(): readonly ChatAction[] {
    return this.actions.map((a) => ({ ...a }));
  }

  /** The current in-flight bubble text (for live rendering). */
  streamingText(): string {
    return this.streamIndex >= 0 ? this.messages[this.streamIndex].text : '';
  }

  /** The last settled (non-streaming, non-error) NPC line — TTS / lip-sync source. */
  lastNpcText(): string {
    for (let i = this.messages.length - 1; i >= 0; i--) {
      const m = this.messages[i];
      if (m.role === 'npc' && !m.streaming && !m.error) return m.text;
    }
    return '';
  }

  completedTurnCount(): number {
    return this.turnCount;
  }

  /**
   * Project the transcript into `ConversationSummary.recentTurns` form for
   * `save.conversations`. In-flight and errored bubbles are excluded (only settled
   * turns persist). `timestamp` stamps every emitted turn (caller-supplied so the
   * projection stays deterministic).
   */
  history(timestamp = ''): { recentTurns: ChatTurn[]; totalTurnCount: number } {
    const recentTurns: ChatTurn[] = [];
    for (const m of this.messages) {
      if (m.streaming || m.error) continue;
      recentTurns.push({ role: m.role, content: m.text, timestamp });
    }
    return { recentTurns, totalTurnCount: this.turnCount };
  }
}
