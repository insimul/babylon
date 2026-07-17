/**
 * In-editor NPC Conversation Tester view-model (US-GE3).
 *
 * The engine-agnostic, UI-free heart of the editor's Conversation Tester dock: it
 * turns imported world data into a character picker, folds a streaming conversation
 * response (the `streamConversation` SSE stream) into a running transcript, and owns
 * the PIE-style **recorded-reasoning fallback** — if the editor-process streaming
 * misbehaves, the tester auto-switches to a recorded reasoning trace rather than
 * failing the whole conversation. Mirrored per-engine (the Godot
 * `conversation_reducer.gd`, and the Unity/Unreal equivalents) and tested headless
 * over a mocked stream (`__tests__/conversation-tester.test.ts`).
 *
 * The reducer is deliberately transport-free — the request/stream lifecycle lives in
 * {@link ConversationController} (the teardown-safe wrapper the dock disposes in
 * `_exit_tree`); this module only maps events to state. That is the same "logic
 * layer tested; UI structurally checked" split the World Browser + Generation
 * Console (US-GE2) follow.
 */

// ---------------------------------------------------------------------------
// Character picker (imported world data -> selectable characters)
// ---------------------------------------------------------------------------

/** A pickable character in the tester's character list. */
export interface CharacterOption {
  readonly id: string;
  readonly name: string;
  readonly occupation?: string;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

/** Build a display name from a world-export character record. */
function characterName(o: Record<string, unknown>): string {
  const name = str(o.name);
  if (name !== undefined) return name;
  const first = str(o.firstName);
  const last = str(o.lastName);
  const joined = [first, last].filter((p): p is string => p !== undefined).join(' ');
  return joined;
}

/**
 * Extract the pickable characters from imported world data (already parsed). Accepts
 * the world-export shape (`{ characters: [...] }`) — a character needs a
 * `characterId` or `id`; entries without one are dropped. The name falls back to
 * `firstName`+`lastName`, then to the id. Defensive: a non-object, a missing/By
 * non-array `characters`, and malformed entries all yield a clean (possibly empty)
 * list rather than throwing.
 */
export function extractCharacters(worldData: unknown): CharacterOption[] {
  if (typeof worldData !== 'object' || worldData === null) return [];
  const raw = (worldData as Record<string, unknown>).characters;
  if (!Array.isArray(raw)) return [];
  const out: CharacterOption[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue;
    const o = entry as Record<string, unknown>;
    const id = str(o.characterId) ?? str(o.id);
    if (id === undefined) continue;
    const name = characterName(o);
    out.push({
      id,
      name: name !== '' ? name : id,
      occupation: str(o.occupation),
    });
  }
  return out;
}

/** Parse a `getWorldDetail` / world-export body then extract its characters. */
export function parseWorldCharacters(body: string): CharacterOption[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  return extractCharacters(parsed);
}

// ---------------------------------------------------------------------------
// Conversation stream events (SSE frame -> normalized event)
// ---------------------------------------------------------------------------

/**
 * The kinds of stream event the tester understands. `text` is a response chunk
 * (`isFinal` closes the turn), `reasoning` is a recorded/streamed reasoning line,
 * `action` is an action trigger, `error` is a stream failure, and `done` closes the
 * turn without a final text chunk.
 */
export type ConversationEventKind = 'text' | 'reasoning' | 'action' | 'error' | 'done';

/** A normalized conversation stream event (an SSE frame folded into a delta). */
export interface ConversationEvent {
  readonly kind: ConversationEventKind;
  readonly text?: string;
  readonly isFinal?: boolean;
  readonly actionType?: string;
  readonly targetId?: string;
  readonly error?: string;
}

/**
 * Parse one SSE `data:` payload (a JSON frame) into a {@link ConversationEvent}, or
 * `null` for a blank keep-alive frame / unparseable body / unknown `type`. Mirrors
 * the runtime conversation client's frame vocabulary
 * (`{ type: "text", text, isFinal }`, `action`, `error`) plus the tester's
 * `reasoning` / `done` frames.
 */
export function parseConversationEvent(data: string): ConversationEvent | null {
  const trimmed = data.trim();
  if (trimmed === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const o = parsed as Record<string, unknown>;
  const type = typeof o.type === 'string' ? o.type : '';
  switch (type) {
    case 'text':
      return {
        kind: 'text',
        text: typeof o.text === 'string' ? o.text : '',
        isFinal: o.isFinal === true,
      };
    case 'reasoning':
      return { kind: 'reasoning', text: typeof o.text === 'string' ? o.text : '' };
    case 'action':
      return {
        kind: 'action',
        actionType: str(o.actionType) ?? str(o.action) ?? '',
        targetId: str(o.targetId) ?? '',
      };
    case 'error':
      return { kind: 'error', error: str(o.message) ?? str(o.error) ?? 'stream error' };
    case 'done':
    case 'end':
    case 'complete':
      return { kind: 'done' };
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Transcript reducer (streaming response -> turns)
// ---------------------------------------------------------------------------

/** An action the character triggered mid-turn. */
export interface ConversationAction {
  readonly actionType: string;
  readonly targetId: string;
}

/** One turn in the transcript (a player line or a character response). */
export interface ConversationTurn {
  readonly role: 'player' | 'character';
  readonly text: string;
  /** Recorded/streamed reasoning trace for a character turn ('' if none). */
  readonly reasoning: string;
  readonly actions: readonly ConversationAction[];
  /** True while chunks are still arriving into this turn. */
  readonly streaming: boolean;
  /** True when the turn was produced via the recorded-reasoning fallback. */
  readonly fromRecording: boolean;
}

/** The conversation transcript status. */
export type ConversationStatus =
  | 'idle' // no turns yet
  | 'streaming' // a character turn is receiving chunks
  | 'recording' // streaming misbehaved; awaiting a recorded fallback
  | 'awaiting' // a turn completed; ready for the next player line
  | 'ended' // conversation ended
  | 'error'; // a hard error (already in the recorded fallback)

/** How the current/last character turn is being sourced. */
export type ConversationMode = 'streaming' | 'recorded';

/** The full Conversation Tester state (the reducer's accumulator). */
export interface ConversationState {
  readonly characterId: string;
  readonly turns: readonly ConversationTurn[];
  readonly status: ConversationStatus;
  readonly mode: ConversationMode;
  readonly error: string | null;
}

/** Reducer actions driving the transcript. */
export type ConversationAction2 =
  | { readonly type: 'reset'; readonly characterId: string }
  | { readonly type: 'sendPlayer'; readonly text: string }
  | { readonly type: 'streamEvent'; readonly event: ConversationEvent }
  | { readonly type: 'streamFailed'; readonly reason?: string }
  | { readonly type: 'recorded'; readonly text: string; readonly reasoning: string }
  | { readonly type: 'end' };

/** A fresh, empty transcript for `characterId`. */
export function initialConversationState(characterId = ''): ConversationState {
  return { characterId, turns: [], status: 'idle', mode: 'streaming', error: null };
}

function emptyCharacterTurn(): ConversationTurn {
  return { role: 'character', text: '', reasoning: '', actions: [], streaming: true, fromRecording: false };
}

/** Replace the last turn (assumed a character turn) with `next`. */
function withLastTurn(
  turns: readonly ConversationTurn[],
  next: ConversationTurn,
): readonly ConversationTurn[] {
  return [...turns.slice(0, -1), next];
}

function lastTurn(state: ConversationState): ConversationTurn | null {
  return state.turns.length > 0 ? state.turns[state.turns.length - 1] : null;
}

/**
 * Fold one stream event into the open character turn. Text chunks append (a final
 * chunk closes the turn -> `awaiting`); a `reasoning` frame sets the trace; an
 * `action` frame appends; a `done` frame closes the turn; an `error` frame is the
 * PIE-style fallback trigger — the FIRST error on a live stream **auto-switches** to
 * the recorded mode (`recording`) instead of failing, so the caller can supply a
 * recorded reasoning trace; an error while already in the recorded fallback is a
 * hard `error`.
 */
function reduceStreamEvent(state: ConversationState, ev: ConversationEvent): ConversationState {
  const open = lastTurn(state);
  if (open === null || open.role !== 'character' || !open.streaming) {
    // No open character turn to fold into (e.g. an event after the turn closed).
    return state;
  }
  switch (ev.kind) {
    case 'text': {
      const turn: ConversationTurn = {
        ...open,
        text: open.text + (ev.text ?? ''),
        streaming: ev.isFinal !== true,
      };
      return {
        ...state,
        turns: withLastTurn(state.turns, turn),
        status: ev.isFinal === true ? 'awaiting' : 'streaming',
      };
    }
    case 'reasoning':
      return { ...state, turns: withLastTurn(state.turns, { ...open, reasoning: ev.text ?? '' }) };
    case 'action': {
      const action: ConversationAction = {
        actionType: ev.actionType ?? '',
        targetId: ev.targetId ?? '',
      };
      return {
        ...state,
        turns: withLastTurn(state.turns, { ...open, actions: [...open.actions, action] }),
      };
    }
    case 'done':
      return {
        ...state,
        turns: withLastTurn(state.turns, { ...open, streaming: false }),
        status: 'awaiting',
      };
    case 'error':
      // First error on a live stream -> fall back to recorded reasoning, don't fail.
      if (state.mode === 'streaming') {
        return { ...state, mode: 'recorded', status: 'recording' };
      }
      return {
        ...state,
        turns: withLastTurn(state.turns, { ...open, streaming: false }),
        status: 'error',
        error: ev.error ?? 'stream error',
      };
    default:
      return state;
  }
}

/**
 * Pure reducer for the Conversation Tester transcript. `sendPlayer` appends a player
 * turn plus a fresh streaming character turn; `streamEvent` folds a stream frame into
 * that open turn; `streamFailed` forces the recorded-reasoning fallback; `recorded`
 * completes the open turn from a recorded trace; `end` closes the conversation.
 */
export function conversationReduce(
  state: ConversationState,
  action: ConversationAction2,
): ConversationState {
  switch (action.type) {
    case 'reset':
      return initialConversationState(action.characterId);
    case 'sendPlayer': {
      if (state.status === 'ended') return state;
      const player: ConversationTurn = {
        role: 'player',
        text: action.text,
        reasoning: '',
        actions: [],
        streaming: false,
        fromRecording: false,
      };
      return {
        ...state,
        turns: [...state.turns, player, emptyCharacterTurn()],
        status: 'streaming',
        mode: 'streaming',
        error: null,
      };
    }
    case 'streamEvent':
      return reduceStreamEvent(state, action.event);
    case 'streamFailed': {
      const open = lastTurn(state);
      if (open === null || open.role !== 'character' || !open.streaming) return state;
      // Auto-switch to the recorded-reasoning fallback (PIE-style).
      return { ...state, mode: 'recorded', status: 'recording' };
    }
    case 'recorded': {
      const open = lastTurn(state);
      if (open === null || open.role !== 'character') return state;
      const turn: ConversationTurn = {
        ...open,
        text: action.text,
        reasoning: action.reasoning,
        streaming: false,
        fromRecording: true,
      };
      return { ...state, turns: withLastTurn(state.turns, turn), status: 'awaiting', mode: 'recorded' };
    }
    case 'end':
      return { ...state, status: 'ended' };
    default:
      return state;
  }
}

/** The currently-open (streaming) character turn, or null. */
export function openTurn(state: ConversationState): ConversationTurn | null {
  const last = lastTurn(state);
  return last !== null && last.role === 'character' && last.streaming ? last : null;
}

/** True once the tester has switched to the recorded-reasoning fallback. */
export function isRecordedFallback(state: ConversationState): boolean {
  return state.mode === 'recorded';
}

// ---------------------------------------------------------------------------
// Stream controller (teardown-safe wrapper the dock disposes)
// ---------------------------------------------------------------------------

/**
 * A teardown-safe wrapper around the transcript reducer. The dock owns one of these
 * per active stream; `dispose()` flips a `disposed` flag so any stream frame that
 * arrives AFTER teardown is DROPPED (no `onUpdate` fires, no state changes). So the
 * dock's `_exit_tree` can dispose the controller with the guarantee that a late SSE
 * frame from an editor-process stream can never touch a freed node — the same
 * zombie-response guarantee {@link JobPoller} gives the Generation Console.
 */
export class ConversationController {
  private state: ConversationState;
  private readonly onUpdate: (state: ConversationState) => void;
  private _disposed = false;

  constructor(onUpdate: (state: ConversationState) => void, characterId = '') {
    this.onUpdate = onUpdate;
    this.state = initialConversationState(characterId);
  }

  /** The current transcript state. */
  get current(): ConversationState {
    return this.state;
  }

  /** True once {@link dispose} has run — nothing dispatches afterward. */
  get disposed(): boolean {
    return this._disposed;
  }

  /** Dispatch an action; a no-op (dropped) after dispose. Fires `onUpdate` on change. */
  dispatch(action: ConversationAction2): void {
    if (this._disposed) return;
    const next = conversationReduce(this.state, action);
    if (next !== this.state) {
      this.state = next;
      this.onUpdate(next);
    }
  }

  /** Feed one raw SSE payload; parses then dispatches (dropped after dispose). */
  feedRaw(data: string): void {
    if (this._disposed) return;
    const ev = parseConversationEvent(data);
    if (ev !== null) this.dispatch({ type: 'streamEvent', event: ev });
  }

  /** Tear down: no further dispatch/feed has any effect. Idempotent. */
  dispose(): void {
    this._disposed = true;
  }
}
