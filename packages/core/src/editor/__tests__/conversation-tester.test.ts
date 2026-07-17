/**
 * US-GE3 — In-editor NPC Conversation Tester view-model tests.
 *
 * Runs on a bare box under `npm test`. Covers the character picker
 * (`extractCharacters`), the SSE-frame parser (`parseConversationEvent`), the
 * transcript reducer over a mocked stream, the recorded-reasoning fallback
 * auto-switch, and the {@link ConversationController} teardown (a frame arriving
 * after dispose is dropped) — the editor-restart-safety guarantee.
 */

import { describe, expect, it } from 'vitest';

import {
  ConversationController,
  conversationReduce,
  extractCharacters,
  initialConversationState,
  isRecordedFallback,
  openTurn,
  parseConversationEvent,
  parseWorldCharacters,
  type ConversationEvent,
  type ConversationState,
} from '../conversation-tester';

// A small imported-world fixture (world-export shape).
const WORLD = {
  worldId: 'w1',
  characters: [
    { characterId: 'c1', firstName: 'Ada', lastName: 'Vance', occupation: 'smith' },
    { id: 'c2', name: 'Bram the Baker' },
    { firstName: 'NoId' }, // dropped — no id
    'not-an-object', // dropped
  ],
};

function feed(state: ConversationState, frames: readonly ConversationEvent[]): ConversationState {
  return frames.reduce((s, event) => conversationReduce(s, { type: 'streamEvent', event }), state);
}

describe('extractCharacters (US-GE3 picker)', () => {
  it('extracts characters from imported world data, dropping entries without an id', () => {
    const chars = extractCharacters(WORLD);
    expect(chars).toEqual([
      { id: 'c1', name: 'Ada Vance', occupation: 'smith' },
      { id: 'c2', name: 'Bram the Baker', occupation: undefined },
    ]);
  });

  it('falls back to the id when no name is present', () => {
    const chars = extractCharacters({ characters: [{ characterId: 'c9' }] });
    expect(chars).toEqual([{ id: 'c9', name: 'c9', occupation: undefined }]);
  });

  it('tolerates non-object / missing / non-array characters', () => {
    expect(extractCharacters(null)).toEqual([]);
    expect(extractCharacters({})).toEqual([]);
    expect(extractCharacters({ characters: 'nope' })).toEqual([]);
  });

  it('parseWorldCharacters parses a body then extracts (bad body -> [])', () => {
    expect(parseWorldCharacters(JSON.stringify(WORLD))).toHaveLength(2);
    expect(parseWorldCharacters('garbage')).toEqual([]);
  });
});

describe('parseConversationEvent (US-GE3, mocked stream)', () => {
  it('parses a text chunk with isFinal', () => {
    expect(parseConversationEvent('{"type":"text","text":"Hi","isFinal":true}')).toEqual({
      kind: 'text',
      text: 'Hi',
      isFinal: true,
    });
  });

  it('parses reasoning / action / error / done frames', () => {
    expect(parseConversationEvent('{"type":"reasoning","text":"thinking"}')).toEqual({
      kind: 'reasoning',
      text: 'thinking',
    });
    expect(parseConversationEvent('{"type":"action","actionType":"give","targetId":"item1"}')).toEqual({
      kind: 'action',
      actionType: 'give',
      targetId: 'item1',
    });
    expect(parseConversationEvent('{"type":"error","message":"boom"}')).toEqual({
      kind: 'error',
      error: 'boom',
    });
    expect(parseConversationEvent('{"type":"done"}')).toEqual({ kind: 'done' });
  });

  it('ignores blank keep-alive frames, bad JSON, and unknown types', () => {
    expect(parseConversationEvent('   ')).toBeNull();
    expect(parseConversationEvent('not json')).toBeNull();
    expect(parseConversationEvent('{"type":"weird"}')).toBeNull();
  });
});

describe('conversationReduce transcript (US-GE3, mocked stream)', () => {
  it('sendPlayer opens a player turn + a streaming character turn', () => {
    const s = conversationReduce(initialConversationState('c1'), {
      type: 'sendPlayer',
      text: 'Hello',
    });
    expect(s.turns).toHaveLength(2);
    expect(s.turns[0]).toMatchObject({ role: 'player', text: 'Hello' });
    expect(s.turns[1]).toMatchObject({ role: 'character', text: '', streaming: true });
    expect(s.status).toBe('streaming');
    expect(openTurn(s)).not.toBeNull();
  });

  it('streams text chunks that append, closing the turn on the final chunk', () => {
    let s = conversationReduce(initialConversationState('c1'), { type: 'sendPlayer', text: 'Hi' });
    s = feed(s, [
      { kind: 'reasoning', text: 'considering the greeting' },
      { kind: 'text', text: 'Well ' },
      { kind: 'text', text: 'met, ' },
      { kind: 'text', text: 'traveler.', isFinal: true },
    ]);
    const turn = s.turns[1];
    expect(turn.text).toBe('Well met, traveler.');
    expect(turn.reasoning).toBe('considering the greeting');
    expect(turn.streaming).toBe(false);
    expect(s.status).toBe('awaiting');
    expect(openTurn(s)).toBeNull();
  });

  it('records action triggers and a done frame closes the turn', () => {
    let s = conversationReduce(initialConversationState('c1'), { type: 'sendPlayer', text: 'Hi' });
    s = feed(s, [
      { kind: 'text', text: 'Take this.' },
      { kind: 'action', actionType: 'give', targetId: 'sword' },
      { kind: 'done' },
    ]);
    expect(s.turns[1].actions).toEqual([{ actionType: 'give', targetId: 'sword' }]);
    expect(s.turns[1].streaming).toBe(false);
    expect(s.status).toBe('awaiting');
  });

  it('a second player turn after a completed turn appends a new pair', () => {
    let s = conversationReduce(initialConversationState('c1'), { type: 'sendPlayer', text: 'Hi' });
    s = feed(s, [{ kind: 'text', text: 'Hello.', isFinal: true }]);
    s = conversationReduce(s, { type: 'sendPlayer', text: 'Bye' });
    expect(s.turns).toHaveLength(4);
    expect(s.turns[2]).toMatchObject({ role: 'player', text: 'Bye' });
    expect(s.turns[3].streaming).toBe(true);
  });

  it('events after the turn closes are ignored (no open turn)', () => {
    let s = conversationReduce(initialConversationState('c1'), { type: 'sendPlayer', text: 'Hi' });
    s = feed(s, [{ kind: 'text', text: 'Done.', isFinal: true }]);
    const after = feed(s, [{ kind: 'text', text: 'stray' }]);
    expect(after).toBe(s);
  });

  it('end freezes the conversation; sendPlayer after end is a no-op', () => {
    let s = conversationReduce(initialConversationState('c1'), { type: 'end' });
    expect(s.status).toBe('ended');
    s = conversationReduce(s, { type: 'sendPlayer', text: 'still there?' });
    expect(s.turns).toHaveLength(0);
  });
});

describe('recorded-reasoning fallback (US-GE3, PIE-style auto-switch)', () => {
  it('a stream error on a live stream auto-switches to the recorded fallback', () => {
    let s = conversationReduce(initialConversationState('c1'), { type: 'sendPlayer', text: 'Hi' });
    expect(isRecordedFallback(s)).toBe(false);
    s = feed(s, [{ kind: 'text', text: 'Wel...' }, { kind: 'error', error: 'stream stalled' }]);
    // Not a hard error — switched to the recorded mode, awaiting a recorded trace.
    expect(s.status).toBe('recording');
    expect(isRecordedFallback(s)).toBe(true);
    expect(s.error).toBeNull();
  });

  it('streamFailed forces the fallback, and recorded completes the turn', () => {
    let s = conversationReduce(initialConversationState('c1'), { type: 'sendPlayer', text: 'Hi' });
    s = conversationReduce(s, { type: 'streamFailed', reason: 'editor process misbehaved' });
    expect(s.mode).toBe('recorded');
    s = conversationReduce(s, {
      type: 'recorded',
      text: 'Greetings, traveler.',
      reasoning: 'recorded: friendly disposition, high extroversion',
    });
    const turn = s.turns[1];
    expect(turn.text).toBe('Greetings, traveler.');
    expect(turn.reasoning).toContain('recorded:');
    expect(turn.fromRecording).toBe(true);
    expect(turn.streaming).toBe(false);
    expect(s.status).toBe('awaiting');
  });

  it('an error while already in the recorded fallback is a hard error', () => {
    let s = conversationReduce(initialConversationState('c1'), { type: 'sendPlayer', text: 'Hi' });
    s = feed(s, [{ kind: 'error', error: 'first' }]); // auto-switch
    s = feed(s, [{ kind: 'error', error: 'recording failed too' }]);
    expect(s.status).toBe('error');
    expect(s.error).toBe('recording failed too');
  });
});

describe('ConversationController teardown (US-GE3, editor-restart safety)', () => {
  it('drops a stream frame that arrives after dispose (no update)', () => {
    const seen: ConversationState[] = [];
    const ctrl = new ConversationController((s) => seen.push(s), 'c1');
    ctrl.dispatch({ type: 'sendPlayer', text: 'Hi' });
    ctrl.feedRaw('{"type":"text","text":"Wel"}');
    expect(seen.length).toBe(2);

    ctrl.dispose();
    // A zombie SSE frame from the editor-process stream arrives after teardown.
    ctrl.feedRaw('{"type":"text","text":"come","isFinal":true}');
    ctrl.dispatch({ type: 'end' });

    expect(ctrl.disposed).toBe(true);
    expect(seen.length).toBe(2); // no further updates
    expect(ctrl.current.turns[1].text).toBe('Wel'); // late chunk never applied
  });

  it('dispatch fires onUpdate only on a real state change; dispose is idempotent', () => {
    const seen: ConversationState[] = [];
    const ctrl = new ConversationController((s) => seen.push(s), 'c1');
    ctrl.dispatch({ type: 'sendPlayer', text: 'Hi' });
    ctrl.feedRaw('   '); // keep-alive -> no event -> no update
    expect(seen.length).toBe(1);
    ctrl.dispose();
    ctrl.dispose(); // idempotent
    expect(ctrl.disposed).toBe(true);
  });
});
