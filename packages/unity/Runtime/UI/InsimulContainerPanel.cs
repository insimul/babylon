// InsimulContainerPanel.cs — thin UGUI container-transfer panel over InsimulTradeModel
// (US-UU3).
//
// The BabylonContainerPanel equivalent: a two-pane loot view (container stacks left,
// player inventory right) with Take / Take-All actions. Every button routes to the
// host-tested InsimulTradeModel, which moves stacks between save.currentState.
// containers.containers[id] and player.inventory (never creating/destroying items).
// Structural-gate-only (UnityEngine-coupled).

using UnityEngine;

namespace Insimul.UI
{
    public sealed class InsimulContainerPanel : MonoBehaviour
    {
        [SerializeField] private RectTransform _containerList;
        [SerializeField] private GameObject _rowPrefab;

        private InsimulTradeModel _model;
        private string _containerId;

        /// <summary>Raised after a successful transfer so a bound inventory panel repaints.</summary>
        public event System.Action Changed;

        public void Open(InsimulTradeModel model, string containerId)
        {
            _model = model;
            _containerId = containerId;
            Refresh();
        }

        /// <summary>Take one stack (whole) of <paramref name="itemId"/> into the player.</summary>
        public void Take(string itemId, int qty = 0)
        {
            if (_model == null) return;
            var r = _model.TakeFromContainer(_containerId, itemId, qty);
            if (r.Ok) { Refresh(); Changed?.Invoke(); }
        }

        public void TakeAll()
        {
            if (_model == null) return;
            var r = _model.TakeAllFromContainer(_containerId);
            if (r.Ok) { Refresh(); Changed?.Invoke(); }
        }

        private void Refresh()
        {
            if (_containerList == null || _model == null) return;
            for (int i = _containerList.childCount - 1; i >= 0; i--)
                Destroy(_containerList.GetChild(i).gameObject);

            foreach (var stack in _model.ContainerItems(_containerId).Items)
            {
                if (_rowPrefab == null) continue;
                string itemId = stack.TryGet("itemId", out var idv) ? idv.Str : "";
                int qty = stack.TryGet("quantity", out var qv) ? (int)qv.Number : 0;
                GameObject row = Instantiate(_rowPrefab, _containerList);
                var text = row.GetComponentInChildren<TMPro.TMP_Text>();
                if (text != null) text.text = qty > 1 ? $"{itemId} ×{qty}" : itemId;
            }
        }
    }
}
