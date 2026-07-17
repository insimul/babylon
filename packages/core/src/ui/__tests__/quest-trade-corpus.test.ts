/**
 * US-GU2 — quest + trade shared-corpus runner + state-location invariant.
 *
 * Executes the engine-neutral matrices under
 * `packages/core/conformance/ui/{quest-journal-cases,trade-cases}.json` against the
 * TS view-models (`QuestJournalModel`, `TradeModel`) that the Godot
 * `quest_journal_model.gd` / `trade_model.gd` mirror. The Godot headless test
 * (`quest_trade_test.gd`) runs the SAME JSON, so the two legs can never disagree.
 *
 * The last describe block is the STATE-LOCATION INVARIANT: the trade model keeps no
 * private item store — reads return the live `currentState` arrays, mutations touch
 * only `currentState`, and an item/gold census is conserved by every op.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { QuestJournalModel, type QuestEntry } from '../quest-journal-model';
import { TradeModel, type TradeState, type TradeItem } from '../trade-model';

const here = dirname(fileURLToPath(import.meta.url));
const corpusDir = join(here, '..', '..', '..', 'conformance', 'ui');

function load<T>(file: string): T {
  return JSON.parse(readFileSync(join(corpusDir, file), 'utf8')) as T;
}

// ── Quest journal matrix ─────────────────────────────────────────────────────

interface QuestStep {
  op: string;
  arg?: string;
  entry?: QuestEntry;
  expected_ok?: boolean;
  expected_filtered_ids?: string[];
  expected_tracked_ids?: string[];
}

interface QuestCase {
  name: string;
  quests: QuestEntry[];
  max_tracked: number;
  steps: QuestStep[];
  expected_counts: { all: number; active: number; completed: number; available: number };
}

describe('quest journal / tracker / offer — shared cases', () => {
  const doc = load<{ cases: QuestCase[] }>('quest-journal-cases.json');

  for (const c of doc.cases) {
    it(c.name, () => {
      const model = new QuestJournalModel(c.max_tracked);
      model.setQuests(c.quests);
      for (const step of c.steps) {
        let ok: boolean | undefined;
        switch (step.op) {
          case 'set_filter':
            model.setFilter(step.arg as never);
            break;
          case 'accept':
            ok = model.accept(step.arg!);
            break;
          case 'decline':
            ok = model.decline(step.arg!);
            break;
          case 'complete':
            ok = model.complete(step.arg!);
            break;
          case 'track':
            ok = model.track(step.arg!);
            break;
          case 'untrack':
            ok = model.untrack(step.arg!);
            break;
          case 'upsert':
            model.upsert(step.entry!);
            break;
          default:
            throw new Error(`unknown quest op '${step.op}'`);
        }
        if (step.expected_ok !== undefined) expect(ok, `${c.name}:${step.op}`).toBe(step.expected_ok);
        if (step.expected_filtered_ids) {
          expect(model.filtered().map((q) => q.id)).toEqual(step.expected_filtered_ids);
        }
        if (step.expected_tracked_ids) {
          expect(model.trackedQuests().map((q) => q.id)).toEqual(step.expected_tracked_ids);
        }
      }
      expect(model.counts()).toEqual(c.expected_counts);
    });
  }
});

// ── Trade matrix ─────────────────────────────────────────────────────────────

interface TradeCase {
  name: string;
  state: TradeState;
  op: { kind: string; container?: string; merchant?: string; item?: string; qty?: number };
  expected: {
    ok: boolean;
    reason?: string;
    moved?: number;
    player_gold?: number;
    merchant_gold?: number;
    player_items?: Record<string, number>;
    merchant_items?: Record<string, number>;
    container_items?: Record<string, number>;
  };
}

function census(items: TradeItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const i of items) out[i.itemId] = (out[i.itemId] ?? 0) + i.quantity;
  return out;
}

function runOp(model: TradeModel, op: TradeCase['op']) {
  switch (op.kind) {
    case 'take':
      return model.takeFromContainer(op.container!, op.item!, op.qty ?? 0);
    case 'take_all':
      return model.takeAllFromContainer(op.container!);
    case 'buy':
      return model.buy(op.merchant!, op.item!, op.qty!);
    case 'sell':
      return model.sell(op.merchant!, op.item!, op.qty!);
    default:
      throw new Error(`unknown trade op '${op.kind}'`);
  }
}

describe('trade — inventory / container / merchant shared cases', () => {
  const doc = load<{ cases: TradeCase[] }>('trade-cases.json');

  for (const c of doc.cases) {
    it(c.name, () => {
      const state: TradeState = structuredClone(c.state);
      const model = new TradeModel(state);
      const result = runOp(model, c.op);

      expect(result.ok, c.name).toBe(c.expected.ok);
      if (c.expected.reason !== undefined) expect(result.reason).toBe(c.expected.reason);
      if (c.expected.moved !== undefined) expect(result.moved).toBe(c.expected.moved);
      if (c.expected.player_gold !== undefined) expect(state.player.gold).toBe(c.expected.player_gold);
      if (c.expected.player_items) expect(census(state.player.inventory)).toEqual(c.expected.player_items);

      if (c.op.container) {
        const items = state.containers.containers[c.op.container]?.items ?? [];
        if (c.expected.container_items) expect(census(items)).toEqual(c.expected.container_items);
      }
      if (c.op.merchant) {
        const m = state.npcs.merchantStates[c.op.merchant];
        if (c.expected.merchant_gold !== undefined) expect(m.goldReserve).toBe(c.expected.merchant_gold);
        if (c.expected.merchant_items) expect(census(m.items)).toEqual(c.expected.merchant_items);
      }
    });
  }
});

// ── State-location invariant ─────────────────────────────────────────────────

describe('trade — state-location invariant (backed exclusively by currentState)', () => {
  function freshState(): TradeState {
    return {
      player: { gold: 100, inventory: [{ itemId: 'gem', quantity: 2, value: 30 }] },
      containers: { containers: { chest1: { items: [{ itemId: 'potion', quantity: 4, value: 10 }] } } },
      npcs: { merchantStates: { shop1: { goldReserve: 200, items: [{ itemId: 'sword', quantity: 1, value: 50 }] } } },
    };
  }

  it('reads return the live currentState arrays (no private copy)', () => {
    const state = freshState();
    const model = new TradeModel(state);
    expect(model.playerItems()).toBe(state.player.inventory);
    expect(model.containerItems('chest1')).toBe(state.containers.containers.chest1.items);
    expect(model.merchantItems('shop1')).toBe(state.npcs.merchantStates.shop1.items);
  });

  it('two models over two states never share state (no static store)', () => {
    const a = freshState();
    const b = freshState();
    new TradeModel(a).buy('shop1', 'sword', 1);
    // b is untouched — the model holds no module-level store.
    expect(b.player.gold).toBe(100);
    expect(census(b.npcs.merchantStates.shop1.items)).toEqual({ sword: 1 });
  });

  it('a container take conserves the item census (player + container)', () => {
    const state = freshState();
    const potions = (s: TradeState) =>
      (census(s.player.inventory).potion ?? 0) +
      (census(s.containers.containers.chest1.items).potion ?? 0);
    const before = potions(state); // 4
    new TradeModel(state).takeFromContainer('chest1', 'potion', 3);
    expect(potions(state)).toBe(before); // moved, not created/destroyed
  });

  it('a merchant trade conserves gold (player.gold + merchant.goldReserve)', () => {
    const state = freshState();
    const before = state.player.gold + state.npcs.merchantStates.shop1.goldReserve;
    new TradeModel(state).buy('shop1', 'sword', 1);
    const afterBuy = state.player.gold + state.npcs.merchantStates.shop1.goldReserve;
    expect(afterBuy).toBe(before);
    new TradeModel(state).sell('shop1', 'sword', 1);
    const afterSell = state.player.gold + state.npcs.merchantStates.shop1.goldReserve;
    expect(afterSell).toBe(before);
  });

  it('a merchant trade conserves the item census (player + merchant)', () => {
    const state = freshState();
    const before =
      (census(state.player.inventory).sword ?? 0) +
      (census(state.npcs.merchantStates.shop1.items).sword ?? 0);
    new TradeModel(state).buy('shop1', 'sword', 1);
    const after =
      (census(state.player.inventory).sword ?? 0) +
      (census(state.npcs.merchantStates.shop1.items).sword ?? 0);
    expect(after).toBe(before);
  });
});
