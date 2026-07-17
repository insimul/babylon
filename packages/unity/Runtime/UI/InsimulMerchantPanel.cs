// InsimulMerchantPanel.cs — thin UGUI merchant/shop panel over InsimulTradeModel
// (US-UU3).
//
// The BabylonShopPanel equivalent: a dual-inventory trade screen (merchant stock left,
// player inventory right) with Buy / Sell at a chosen quantity. Price is the item
// stack's value; the reputation hook (InsimulTradeModel.ReputationPriceModifier, a
// stub off the relationship facts) supplies a display quote only. Every trade routes
// to the host-tested InsimulTradeModel, which conserves gold across the two parties.
// Structural-gate-only (UnityEngine-coupled).

using UnityEngine;

namespace Insimul.UI
{
    public sealed class InsimulMerchantPanel : MonoBehaviour
    {
        [SerializeField] private RectTransform _merchantList;
        [SerializeField] private RectTransform _playerList;
        [SerializeField] private GameObject _rowPrefab;
        [SerializeField] private TMPro.TMP_Text _goldLabel;

        private InsimulTradeModel _model;
        private string _merchantId;

        /// <summary>Raised after a successful trade so bound panels repaint.</summary>
        public event System.Action Changed;

        public void Open(InsimulTradeModel model, string merchantId)
        {
            _model = model;
            _merchantId = merchantId;
            Refresh();
        }

        public void Buy(string itemId, int qty)
        {
            if (_model == null) return;
            var r = _model.Buy(_merchantId, itemId, qty);
            if (r.Ok) { Refresh(); Changed?.Invoke(); }
        }

        public void Sell(string itemId, int qty)
        {
            if (_model == null) return;
            var r = _model.Sell(_merchantId, itemId, qty);
            if (r.Ok) { Refresh(); Changed?.Invoke(); }
        }

        private void Refresh()
        {
            if (_model == null) return;
            Paint(_merchantList, _model.MerchantItems(_merchantId));
            Paint(_playerList, _model.PlayerItems());
            if (_goldLabel != null)
                _goldLabel.text = $"Gold: {_model.PlayerGold()}   Merchant: {_model.MerchantGold(_merchantId)}";
        }

        private void Paint(RectTransform list, Save.JsonVal items)
        {
            if (list == null) return;
            for (int i = list.childCount - 1; i >= 0; i--)
                Destroy(list.GetChild(i).gameObject);

            double mod = _model.ReputationPriceModifier(_merchantId);
            foreach (var stack in items.Items)
            {
                if (_rowPrefab == null) continue;
                string itemId = stack.TryGet("itemId", out var idv) ? idv.Str : "";
                int qty = stack.TryGet("quantity", out var qv) ? (int)qv.Number : 0;
                int value = stack.TryGet("value", out var vv) ? (int)vv.Number : 0;
                int quote = (int)System.Math.Round(value * mod);
                GameObject row = Instantiate(_rowPrefab, list);
                var text = row.GetComponentInChildren<TMPro.TMP_Text>();
                if (text != null) text.text = $"{itemId} ×{qty}  ({quote}g)";
            }
        }
    }
}
