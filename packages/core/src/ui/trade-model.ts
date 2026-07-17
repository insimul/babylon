/**
 * Trade view-model — inventory / container / merchant (US-GU2).
 *
 * The engine-agnostic heart of the three trade panels, backed EXCLUSIVELY by
 * `save.currentState`. Every read and every mutation goes through the live
 * currentState object handed to the constructor — the model keeps NO private item
 * store of its own, which is the "state-location invariant": inventory, container
 * loot, and merchant stock live in exactly one place (the save), so a snapshot at
 * any moment is the whole truth. The Godot `trade_model.gd` mirrors this contract;
 * the shared matrices live in `packages/core/conformance/ui/trade-cases.json`.
 *
 * State paths (a structural subset of `CurrentGameState`, so a real migrated save
 * is assignable):
 *   - player.gold / player.inventory
 *   - containers.containers[containerId].items
 *   - npcs.merchantStates[merchantId].{goldReserve, items}
 *
 * Conservation is a hard invariant of every op: items MOVE between stacks (never
 * created or destroyed), and a merchant trade conserves gold (player.gold +
 * merchant.goldReserve is constant across buy/sell).
 */

export interface TradeItem {
  itemId: string;
  quantity: number;
  /** Unit price used by buy/sell (missing -> free). */
  value?: number;
  [key: string]: unknown;
}

/** Structural subset of `CurrentGameState` the trade model reads/writes. */
export interface TradeState {
  player: { gold: number; inventory: TradeItem[] };
  containers: { containers: Record<string, { items: TradeItem[] }> };
  npcs: { merchantStates: Record<string, { goldReserve: number; items: TradeItem[] }> };
}

export interface TradeResult {
  ok: boolean;
  /** Machine-readable failure reason (empty on success). */
  reason: string;
  /** Quantity actually moved (0 on failure). */
  moved: number;
}

const OK = (moved: number): TradeResult => ({ ok: true, reason: '', moved });
const FAIL = (reason: string): TradeResult => ({ ok: false, reason, moved: 0 });

function findStack(items: TradeItem[], itemId: string): TradeItem | undefined {
  return items.find((i) => i.itemId === itemId);
}

/** Merge `qty` of `itemId` into `items`, stacking onto an existing entry. */
function addStack(items: TradeItem[], itemId: string, qty: number, value?: number): void {
  if (qty <= 0) return;
  const existing = findStack(items, itemId);
  if (existing) {
    existing.quantity += qty;
    return;
  }
  const stack: TradeItem = { itemId, quantity: qty };
  if (value !== undefined) stack.value = value;
  items.push(stack);
}

/** Remove `qty` of `itemId` from `items`, dropping the stack when it hits 0. */
function removeStack(items: TradeItem[], itemId: string, qty: number): void {
  const idx = items.findIndex((i) => i.itemId === itemId);
  if (idx < 0) return;
  items[idx].quantity -= qty;
  if (items[idx].quantity <= 0) items.splice(idx, 1);
}

export class TradeModel {
  constructor(private readonly state: TradeState) {}

  // ── Reads (all straight off currentState — no private copy) ─────────────

  playerGold(): number {
    return this.state.player.gold;
  }

  /** The player's live inventory array (same reference as currentState). */
  playerItems(): TradeItem[] {
    return this.state.player.inventory;
  }

  containerItems(containerId: string): TradeItem[] {
    return this.state.containers.containers[containerId]?.items ?? [];
  }

  merchantItems(merchantId: string): TradeItem[] {
    return this.state.npcs.merchantStates[merchantId]?.items ?? [];
  }

  merchantGold(merchantId: string): number {
    return this.state.npcs.merchantStates[merchantId]?.goldReserve ?? 0;
  }

  // ── Container transfer ──────────────────────────────────────────────────

  /**
   * Take `qty` of `itemId` from a container into the player inventory. `qty <= 0`
   * or omitted takes the whole stack; a request larger than stock is clamped.
   */
  takeFromContainer(containerId: string, itemId: string, qty = 0): TradeResult {
    const container = this.state.containers.containers[containerId];
    if (!container) return FAIL('no_container');
    const stack = findStack(container.items, itemId);
    const avail = stack?.quantity ?? 0;
    if (avail <= 0) return FAIL('not_present');
    const moved = qty > 0 ? Math.min(qty, avail) : avail;
    removeStack(container.items, itemId, moved);
    addStack(this.state.player.inventory, itemId, moved, stack?.value);
    return OK(moved);
  }

  /** Take every stack from a container into the player inventory. */
  takeAllFromContainer(containerId: string): TradeResult {
    const container = this.state.containers.containers[containerId];
    if (!container) return FAIL('no_container');
    let moved = 0;
    // Copy the id/value list first — takeFromContainer mutates container.items.
    const stacks = container.items.map((i) => ({ itemId: i.itemId }));
    for (const s of stacks) {
      const r = this.takeFromContainer(containerId, s.itemId, 0);
      if (r.ok) moved += r.moved;
    }
    return OK(moved);
  }

  // ── Merchant buy / sell ─────────────────────────────────────────────────

  /** Buy `qty` of `itemId` from a merchant: item merchant->player, gold player->merchant. */
  buy(merchantId: string, itemId: string, qty: number): TradeResult {
    if (qty <= 0) return FAIL('bad_qty');
    const merchant = this.state.npcs.merchantStates[merchantId];
    if (!merchant) return FAIL('no_merchant');
    const stack = findStack(merchant.items, itemId);
    if ((stack?.quantity ?? 0) < qty) return FAIL('out_of_stock');
    const unit = stack?.value ?? 0;
    const cost = unit * qty;
    if (this.state.player.gold < cost) return FAIL('insufficient_gold');
    removeStack(merchant.items, itemId, qty);
    addStack(this.state.player.inventory, itemId, qty, unit);
    this.state.player.gold -= cost;
    merchant.goldReserve += cost;
    return OK(qty);
  }

  /** Sell `qty` of `itemId` to a merchant: item player->merchant, gold merchant->player. */
  sell(merchantId: string, itemId: string, qty: number): TradeResult {
    if (qty <= 0) return FAIL('bad_qty');
    const merchant = this.state.npcs.merchantStates[merchantId];
    if (!merchant) return FAIL('no_merchant');
    const stack = findStack(this.state.player.inventory, itemId);
    if ((stack?.quantity ?? 0) < qty) return FAIL('insufficient_items');
    const unit = stack?.value ?? 0;
    const revenue = unit * qty;
    if (merchant.goldReserve < revenue) return FAIL('merchant_cannot_afford');
    removeStack(this.state.player.inventory, itemId, qty);
    addStack(merchant.items, itemId, qty, unit);
    this.state.player.gold += revenue;
    merchant.goldReserve -= revenue;
    return OK(qty);
  }
}
