// InsimulInventoryPanel.cs — thin UGUI inventory panel over InsimulTradeModel (US-UU3).
//
// The BabylonInventory equivalent: renders the player's item stacks (grouped by
// category, with rarity tint + equip-slot markers looked up from world item data via
// an injectable resolver) straight off save.currentState.player.inventory. All stack
// math lives in the host-tested InsimulTradeModel; this view only materializes rows
// and repaints when Refresh() is called after a mutation. Structural-gate-only
// (UnityEngine-coupled).

using UnityEngine;

namespace Insimul.UI
{
    /// <summary>Per-item presentation metadata a game supplies (from world item data).
    /// Defaults keep the panel functional for items without a resolver.</summary>
    public struct ItemDisplay
    {
        public string Name;      // human name (falls back to itemId)
        public string Category;  // "weapon" / "consumable" / ... (falls back to "misc")
        public string Rarity;    // "common" / "rare" / ... (falls back to "common")
        public string EquipSlot; // "" when not equippable
    }

    public sealed class InsimulInventoryPanel : MonoBehaviour
    {
        [SerializeField] private RectTransform _container;
        [SerializeField] private GameObject _rowPrefab;

        private InsimulTradeModel _model;

        /// <summary>Optional resolver from itemId to display metadata (world item data).</summary>
        public System.Func<string, ItemDisplay> ResolveDisplay;

        public void Bind(InsimulTradeModel model)
        {
            _model = model;
            Refresh();
        }

        /// <summary>Repaint the panel. Call after any trade op mutates currentState.</summary>
        public void Refresh()
        {
            if (_container == null || _model == null) return;
            for (int i = _container.childCount - 1; i >= 0; i--)
                Destroy(_container.GetChild(i).gameObject);

            foreach (var stack in _model.PlayerItems().Items)
            {
                if (_rowPrefab == null) continue;
                string itemId = stack.TryGet("itemId", out var idv) ? idv.Str : "";
                int qty = stack.TryGet("quantity", out var qv) ? (int)qv.Number : 0;
                ItemDisplay d = ResolveDisplay != null
                    ? ResolveDisplay(itemId)
                    : new ItemDisplay { Name = itemId, Category = "misc", Rarity = "common", EquipSlot = "" };
                string name = string.IsNullOrEmpty(d.Name) ? itemId : d.Name;

                GameObject row = Instantiate(_rowPrefab, _container);
                var text = row.GetComponentInChildren<TMPro.TMP_Text>();
                if (text == null) continue;
                string slot = string.IsNullOrEmpty(d.EquipSlot) ? "" : $" [{d.EquipSlot}]";
                text.text = qty > 1 ? $"{name} ×{qty}{slot}" : $"{name}{slot}";
            }
        }
    }
}
