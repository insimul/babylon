/**
 * US-GU3 — dialogue / pause-menu / save-slot shared-corpus runner.
 *
 * Executes the engine-neutral matrices under
 * `packages/core/conformance/ui/{chat-cases,pause-menu-cases,save-slot-cases}.json`
 * against the TS view-models (`ChatModel`, `PauseMenuModel`, `SaveSlotModel`) that
 * the Godot `chat_model.gd` / `pause_menu_model.gd` / `save_slot_model.gd` mirror.
 * The Godot headless test (`dialogue_menu_save_test.gd`) runs the SAME JSON, so the
 * two legs can never disagree.
 *
 * The final describe block proves the corrupted-envelope chain END-TO-END: it builds
 * a real envelope, tampers the payload, and feeds the actual SHA-256 verdict through
 * `SaveSlotModel.classifyEnvelope`.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { ChatModel } from '../chat-model';
import { PauseMenuModel, type MenuTabDef } from '../pause-menu-model';
import { SaveSlotModel, type SlotLoadResult } from '../save-slot-model';
import { buildSaveFileEnvelope, type SaveFileEnvelope } from '../../save-envelope';
import type { SaveFile } from '../../save-file';

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(here, '..', '..', '..', 'conformance', 'ui');

function load<T>(file: string): T {
  return JSON.parse(readFileSync(join(corpusDir, file), 'utf8')) as T;
}

// ── Dialogue / chat streaming matrix ─────────────────────────────────────────

interface ChatEvent {
  op: string;
  text?: string;
  full_text?: string;
  error?: string;
  name?: string;
  args?: string[];
  fact?: string;
  expected_ok?: boolean;
}
interface ChatCase {
  name: string;
  character: { id: string; name: string };
  events: ChatEvent[];
  expected_messages: Array<{ role: string; text: string; error?: boolean }>;
  expected_streaming: boolean;
  expected_actions: Array<{ name: string; args?: string[]; factToAssert?: string }>;
  expected_turn_count: number;
  expected_last_npc_text: string;
  expected_history_turns: Array<{ role: string; content: string }>;
}

describe('dialogue / chat streaming — shared cases', () => {
  const doc = load<{ cases: ChatCase[] }>('chat-cases.json');

  for (const c of doc.cases) {
    it(c.name, () => {
      const model = new ChatModel(c.character.id, c.character.name);
      for (const ev of c.events) {
        let ok: boolean | undefined;
        switch (ev.op) {
          case 'greeting':
            model.greeting(ev.text!);
            break;
          case 'begin':
            ok = model.beginUserTurn(ev.text!);
            break;
          case 'chunk':
            model.appendChunk(ev.text!);
            break;
          case 'action':
            model.triggerAction({ name: ev.name!, args: ev.args, factToAssert: ev.fact });
            break;
          case 'complete':
            ok = model.completeTurn(ev.full_text);
            break;
          case 'fail':
            ok = model.failTurn(ev.error!);
            break;
          default:
            throw new Error(`unknown chat op '${ev.op}'`);
        }
        if (ev.expected_ok !== undefined) expect(ok, `${c.name}:${ev.op}`).toBe(ev.expected_ok);
      }

      const msgs = model.messageList().map((m) => ({
        role: m.role,
        text: m.text,
        ...(m.error ? { error: true } : {}),
      }));
      expect(msgs).toEqual(c.expected_messages);
      expect(model.isStreaming()).toBe(c.expected_streaming);
      expect(model.actionList()).toEqual(c.expected_actions);
      expect(model.completedTurnCount()).toBe(c.expected_turn_count);
      expect(model.lastNpcText()).toBe(c.expected_last_npc_text);

      const hist = model.history();
      expect(hist.totalTurnCount).toBe(c.expected_turn_count);
      expect(hist.recentTurns.map((t) => ({ role: t.role, content: t.content }))).toEqual(
        c.expected_history_turns,
      );
    });
  }
});

// ── Pause-menu tab-gating matrix ─────────────────────────────────────────────

interface MenuStep {
  op: string;
  tab?: string;
  key?: string;
  value?: boolean;
  expected_ok?: boolean;
}
interface MenuCase {
  name: string;
  enabled_modules: string[];
  tabs?: MenuTabDef[];
  expected_visible_keys: string[];
  steps?: MenuStep[];
}

describe('pause / ESC menu — tab gating shared cases', () => {
  const doc = load<{ cases: MenuCase[] }>('pause-menu-cases.json');

  for (const c of doc.cases) {
    it(c.name, () => {
      const model = c.tabs
        ? new PauseMenuModel(c.enabled_modules, c.tabs)
        : new PauseMenuModel(c.enabled_modules);
      expect(model.visibleKeys()).toEqual(c.expected_visible_keys);

      for (const step of c.steps ?? []) {
        switch (step.op) {
          case 'open':
            model.openMenu(step.tab);
            break;
          case 'close':
            model.closeMenu();
            break;
          case 'toggle':
            model.toggle();
            break;
          case 'set_active': {
            const ok = model.setActive(step.key!);
            if (step.expected_ok !== undefined) expect(ok, `${c.name}:set_active`).toBe(step.expected_ok);
            break;
          }
          case 'expect_active':
            expect(model.activeTab(), c.name).toBe(step.key);
            break;
          case 'expect_open':
            expect(model.isOpen(), c.name).toBe(step.value);
            break;
          default:
            throw new Error(`unknown menu op '${step.op}'`);
        }
      }
    });
  }
});

// ── Save/load slot matrix ────────────────────────────────────────────────────

interface SlotCase {
  name: string;
  slots: SlotLoadResult[];
  expected: Array<{
    index: number;
    status: string;
    title: string;
    message: string;
    can_load: boolean;
    can_save: boolean;
  }>;
  expected_has_loadable: boolean;
}

describe('save / load slots — shared cases', () => {
  const doc = load<{ cases: SlotCase[] }>('save-slot-cases.json');

  for (const c of doc.cases) {
    it(c.name, () => {
      const model = new SaveSlotModel(c.slots);
      const rows = model.slots().map((s) => ({
        index: s.index,
        status: s.status,
        title: s.title,
        message: s.message,
        can_load: s.canLoad,
        can_save: s.canSave,
      }));
      expect(rows).toEqual(c.expected);
      expect(model.hasAnyLoadable()).toBe(c.expected_has_loadable);
    });
  }
});

// ── Corrupted-envelope integrity chain (TS-only, real SHA-256) ───────────────

describe('save slot — real corrupted-envelope integrity chain', () => {
  const saveFile = { version: 1, currentState: { player: { gold: 5 } } } as unknown as SaveFile;

  function summarize(): { playerName: string } {
    return { playerName: 'Test' };
  }

  it('a valid envelope classifies as ok', () => {
    const env = buildSaveFileEnvelope(saveFile, { insimulVersion: 't', exportedAt: 'x' });
    const res = SaveSlotModel.classifyEnvelope(0, env, summarize);
    expect(res.outcome).toBe('ok');
    expect(new SaveSlotModel([res]).slot(0)?.canLoad).toBe(true);
  });

  it('a tampered payload fails integrity and renders the corrupted message', () => {
    const env = buildSaveFileEnvelope(saveFile, { insimulVersion: 't', exportedAt: 'x' });
    const tampered: SaveFileEnvelope = {
      ...env,
      saveFile: { ...(env.saveFile as object), currentState: { player: { gold: 999999 } } } as unknown as SaveFile,
    };
    const res = SaveSlotModel.classifyEnvelope(0, tampered);
    expect(res.outcome).toBe('integrity_mismatch');
    const view = new SaveSlotModel([res]).slot(0)!;
    expect(view.status).toBe('corrupted');
    expect(view.canLoad).toBe(false);
    expect(view.message).toBe(
      'Save file integrity check failed — file may be corrupted or tampered.',
    );
  });

  it('a wrong-format blob classifies as invalid_format; null is empty', () => {
    expect(SaveSlotModel.classifyEnvelope(0, { format: 'nope' }).outcome).toBe('invalid_format');
    expect(SaveSlotModel.classifyEnvelope(1, null).outcome).toBe('empty');
  });
});
