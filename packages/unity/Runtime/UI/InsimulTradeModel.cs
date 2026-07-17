// InsimulTradeModel.cs — inventory / container-transfer / merchant trade view-model (US-UU3).
//
// The Unity mirror of the engine-neutral trade contract
// (packages/core/src/ui/trade-model.ts + the Godot trade_model.gd), backing the
// three trade panels (InventoryUI, container transfer, merchant/shop) that finish
// the BabylonInventory / BabylonContainerPanel / BabylonShopPanel behavior set.
//
// Backed EXCLUSIVELY by save.currentState. Every read and every mutation goes
// through the live currentState JsonVal handed to Attach() — the model keeps NO
// private item store, which is the "state-location invariant": inventory, container
// loot, and merchant stock live in exactly ONE place (the save), so a snapshot at
// any moment (SerializeCanonical) is the whole truth and a save→load round-trip
// preserves every quantity and gold total.
//
// State paths (a structural subset of the save's currentState, so a real migrated
// save is assignable — see InsimulSaveSystem.BuildDefaultCurrentState):
//   • player.gold / player.inventory
//   • containers.containers[containerId].items
//   • npcs.merchantStates[merchantId].{goldReserve, items}
//
// Conservation is a hard invariant of every op: items MOVE between stacks (never
// created or destroyed), and a merchant trade conserves gold (player.gold +
// merchant.goldReserve is constant across buy/sell). The shared behavior matrix
// lives in packages/core/conformance/ui/trade-cases.json, so every default-UI
// mirror (Babylon / Godot / Unreal / Unity) runs the SAME cases.
//
// UnityEngine-FREE (it reads/writes JsonVal, the save model) so it host-tests on a
// bare .NET SDK (tools/verify-unity). The thin UGUI views (InsimulInventoryPanel /
// InsimulContainerPanel / InsimulMerchantPanel, structural-gate-only) just reflect
// the read accessors into widgets and call the mutators on click.

using System.Collections.Generic;
using Insimul.Save;

namespace Insimul.UI
{
    /// <summary>Outcome of a trade op: success flag, machine-readable failure reason
    /// (empty on success), and the quantity actually moved (0 on failure).</summary>
    public readonly struct TradeResult
    {
        public bool Ok { get; }
        public string Reason { get; }
        public int Moved { get; }

        private TradeResult(bool ok, string reason, int moved)
        {
            Ok = ok;
            Reason = reason;
            Moved = moved;
        }

        public static TradeResult Success(int moved) => new TradeResult(true, string.Empty, moved);
        public static TradeResult Fail(string reason) => new TradeResult(false, reason, 0);
    }

    /// <summary>Trade view-model over a live currentState JsonVal. Holds no item
    /// state of its own; every accessor and mutator resolves through _state.</summary>
    public sealed class InsimulTradeModel
    {
        private JsonVal _state;

        public InsimulTradeModel() { }

        public InsimulTradeModel(JsonVal currentState) => _state = currentState;

        /// <summary>Bind the live currentState slice. The model mutates it IN PLACE;
        /// it never copies, so the save is the single source of truth.</summary>
        public void Attach(JsonVal currentState) => _state = currentState;

        // ── Reads (all straight off currentState — no private copy) ────────────

        public int PlayerGold() => (int)AsLong(Player(), "gold");

        /// <summary>The player's live inventory array (the SAME JsonVal reference as
        /// currentState.player.inventory — mutating a stack here mutates the save).</summary>
        public JsonVal PlayerItems() => Array(Player(), "inventory");

        public JsonVal ContainerItems(string containerId)
        {
            var c = Container(containerId);
            return c == null ? JsonVal.Arr() : Array(c, "items");
        }

        public JsonVal MerchantItems(string merchantId)
        {
            var m = Merchant(merchantId);
            return m == null ? JsonVal.Arr() : Array(m, "items");
        }

        public int MerchantGold(string merchantId)
        {
            var m = Merchant(merchantId);
            return m == null ? 0 : (int)AsLong(m, "goldReserve");
        }

        /// <summary>Quantity of <paramref name="itemId"/> the player holds (0 if none).</summary>
        public int PlayerQuantity(string itemId) => StackQuantity(PlayerItems(), itemId);

        /// <summary>Stub mercantile-reputation hook. A game scales prices off the
        /// player's standing with the merchant (npcs.relationships[merchantId]); the
        /// default is neutral (1.0) and buy/sell deliberately do NOT apply it, so the
        /// conservation corpus is unaffected. Views can use it for a display quote.</summary>
        public double ReputationPriceModifier(string merchantId)
        {
            // Presence-only seam today: real reputation pricing derives a multiplier
            // from the relationship facts. Returns 1.0 until a game wires it.
            return 1.0;
        }

        // ── Container transfer (BabylonContainerPanel) ─────────────────────────

        /// <summary>Take <paramref name="qty"/> of <paramref name="itemId"/> from a
        /// container into the player inventory. qty &lt;= 0 takes the whole stack; a
        /// request larger than stock is clamped to what is available.</summary>
        public TradeResult TakeFromContainer(string containerId, string itemId, int qty = 0)
        {
            var container = Container(containerId);
            if (container == null) return TradeResult.Fail("no_container");
            var items = Array(container, "items");
            int idx = StackIndex(items, itemId);
            int avail = idx < 0 ? 0 : (int)AsLong(items.Items[idx], "quantity");
            if (avail <= 0) return TradeResult.Fail("not_present");
            int moved = qty > 0 ? System.Math.Min(qty, avail) : avail;
            JsonVal value = ValueOf(items.Items[idx]);
            RemoveStack(items, itemId, moved);
            AddStack(PlayerItems(), itemId, moved, value);
            return TradeResult.Success(moved);
        }

        /// <summary>Take every stack from a container into the player inventory.</summary>
        public TradeResult TakeAllFromContainer(string containerId)
        {
            var container = Container(containerId);
            if (container == null) return TradeResult.Fail("no_container");
            var items = Array(container, "items");
            // Snapshot the id list first — TakeFromContainer mutates items.
            var ids = new List<string>();
            foreach (var s in items.Items) ids.Add(StringOf(s, "itemId"));
            int moved = 0;
            foreach (string id in ids)
            {
                var r = TakeFromContainer(containerId, id, 0);
                if (r.Ok) moved += r.Moved;
            }
            return TradeResult.Success(moved);
        }

        // ── Merchant buy / sell (BabylonShopPanel) ─────────────────────────────

        /// <summary>Buy <paramref name="qty"/> of <paramref name="itemId"/> from a
        /// merchant: item merchant→player, gold player→merchant. Unit price is the
        /// merchant stack's value.</summary>
        public TradeResult Buy(string merchantId, string itemId, int qty)
        {
            if (qty <= 0) return TradeResult.Fail("bad_qty");
            var merchant = Merchant(merchantId);
            if (merchant == null) return TradeResult.Fail("no_merchant");
            var items = Array(merchant, "items");
            int idx = StackIndex(items, itemId);
            int avail = idx < 0 ? 0 : (int)AsLong(items.Items[idx], "quantity");
            if (avail < qty) return TradeResult.Fail("out_of_stock");
            int unit = idx < 0 ? 0 : (int)AsLong(items.Items[idx], "value");
            int cost = unit * qty;
            if (PlayerGold() < cost) return TradeResult.Fail("insufficient_gold");
            RemoveStack(items, itemId, qty);
            AddStack(PlayerItems(), itemId, qty, JsonVal.Int(unit));
            SetGold(Player(), PlayerGold() - cost);
            SetGold(merchant, "goldReserve", MerchantGold(merchantId) + cost);
            return TradeResult.Success(qty);
        }

        /// <summary>Sell <paramref name="qty"/> of <paramref name="itemId"/> to a
        /// merchant: item player→merchant, gold merchant→player. Unit price is the
        /// player stack's value.</summary>
        public TradeResult Sell(string merchantId, string itemId, int qty)
        {
            if (qty <= 0) return TradeResult.Fail("bad_qty");
            var merchant = Merchant(merchantId);
            if (merchant == null) return TradeResult.Fail("no_merchant");
            var playerItems = PlayerItems();
            int idx = StackIndex(playerItems, itemId);
            int have = idx < 0 ? 0 : (int)AsLong(playerItems.Items[idx], "quantity");
            if (have < qty) return TradeResult.Fail("insufficient_items");
            int unit = idx < 0 ? 0 : (int)AsLong(playerItems.Items[idx], "value");
            int revenue = unit * qty;
            if (MerchantGold(merchantId) < revenue) return TradeResult.Fail("merchant_cannot_afford");
            RemoveStack(playerItems, itemId, qty);
            AddStack(Array(merchant, "items"), itemId, qty, JsonVal.Int(unit));
            SetGold(Player(), PlayerGold() + revenue);
            SetGold(merchant, "goldReserve", MerchantGold(merchantId) - revenue);
            return TradeResult.Success(qty);
        }

        // ── Internal navigation (all resolve off _state each call) ─────────────

        private JsonVal Player()
        {
            if (_state != null && _state.TryGet("player", out var p) && p.Kind == JsonKind.Object) return p;
            return JsonVal.Object();
        }

        private JsonVal Container(string containerId)
        {
            if (_state == null || !_state.TryGet("containers", out var c) || c.Kind != JsonKind.Object) return null;
            if (!c.TryGet("containers", out var map) || map.Kind != JsonKind.Object) return null;
            return map.TryGet(containerId, out var v) && v.Kind == JsonKind.Object ? v : null;
        }

        private JsonVal Merchant(string merchantId)
        {
            if (_state == null || !_state.TryGet("npcs", out var n) || n.Kind != JsonKind.Object) return null;
            if (!n.TryGet("merchantStates", out var map) || map.Kind != JsonKind.Object) return null;
            return map.TryGet(merchantId, out var v) && v.Kind == JsonKind.Object ? v : null;
        }

        // ── Stack helpers (operate on a JsonVal array of {itemId,quantity,value?}) ─

        private static JsonVal Array(JsonVal obj, string key)
        {
            if (obj != null && obj.TryGet(key, out var v) && v.Kind == JsonKind.Array) return v;
            var fresh = JsonVal.Arr();
            if (obj != null && obj.Kind == JsonKind.Object) obj.Set(key, fresh);
            return fresh;
        }

        private static int StackIndex(JsonVal items, string itemId)
        {
            for (int i = 0; i < items.Items.Count; i++)
                if (StringOf(items.Items[i], "itemId") == itemId) return i;
            return -1;
        }

        private static int StackQuantity(JsonVal items, string itemId)
        {
            int idx = StackIndex(items, itemId);
            return idx < 0 ? 0 : (int)AsLong(items.Items[idx], "quantity");
        }

        /// <summary>Merge <paramref name="qty"/> of <paramref name="itemId"/> into
        /// <paramref name="items"/>, stacking onto an existing entry.</summary>
        private static void AddStack(JsonVal items, string itemId, int qty, JsonVal value)
        {
            if (qty <= 0) return;
            int idx = StackIndex(items, itemId);
            if (idx >= 0)
            {
                var existing = items.Items[idx];
                existing.Set("quantity", JsonVal.Int((int)AsLong(existing, "quantity") + qty));
                return;
            }
            var stack = JsonVal.Object();
            stack.Set("itemId", JsonVal.Str(itemId));
            stack.Set("quantity", JsonVal.Int(qty));
            if (value != null && value.Kind != JsonKind.Null) stack.Set("value", value);
            items.Add(stack);
        }

        /// <summary>Remove <paramref name="qty"/> of <paramref name="itemId"/> from
        /// <paramref name="items"/>, dropping the stack when it hits 0.</summary>
        private static void RemoveStack(JsonVal items, string itemId, int qty)
        {
            int idx = StackIndex(items, itemId);
            if (idx < 0) return;
            var stack = items.Items[idx];
            int next = (int)AsLong(stack, "quantity") - qty;
            if (next <= 0) items.RemoveAt(idx);
            else stack.Set("quantity", JsonVal.Int(next));
        }

        private static void SetGold(JsonVal owner, int gold) => SetGold(owner, "gold", gold);

        private static void SetGold(JsonVal owner, string key, int gold)
        {
            if (owner != null && owner.Kind == JsonKind.Object) owner.Set(key, JsonVal.Int(gold));
        }

        private static JsonVal ValueOf(JsonVal stack) =>
            stack != null && stack.TryGet("value", out var v) ? v : null;

        private static long AsLong(JsonVal obj, string key) =>
            obj != null && obj.TryGet(key, out var v) && v.Kind == JsonKind.Number ? (long)v.Number : 0L;

        private static string StringOf(JsonVal obj, string key) =>
            obj != null && obj.TryGet(key, out var v) && v.Kind == JsonKind.String ? v.Str : string.Empty;
    }
}
