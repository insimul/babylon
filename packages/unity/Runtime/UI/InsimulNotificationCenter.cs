// InsimulNotificationCenter.cs — thin UGUI view over InsimulNotifications (US-UU1).
//
// The default toast panel: quest/state notifications slide in top-right and age
// out. It owns an InsimulNotifications queue and ticks it each frame; the queue
// (push/tick/dismiss lifecycle + kind→token color) is host-tested, this view just
// materializes rows and tints them via InsimulUITheme. Structural-gate-only
// (UnityEngine-coupled). The richer animated prototype lives at
// templates/scripts/ui/NotificationSystem.cs; both drive the SAME model contract.

using UnityEngine;

namespace Insimul.UI
{
    public sealed class InsimulNotificationCenter : MonoBehaviour
    {
        [SerializeField] private RectTransform _container;
        [SerializeField] private GameObject _rowPrefab;

        private readonly InsimulNotifications _model = new InsimulNotifications();

        /// <summary>Push a notification (defaults to Info). Returns its id.</summary>
        public int Notify(string text, NotificationKind kind = NotificationKind.Info) =>
            _model.Push(text, kind);

        public bool Dismiss(int id) => _model.Dismiss(id);

        private void Update()
        {
            if (_model.Tick(Time.deltaTime)) Repaint();
        }

        private void Repaint()
        {
            if (_container == null) return;
            // Rebuild the visible rows from the model. A production panel would pool
            // rows; the pattern-proof view keeps it obvious.
            for (int i = _container.childCount - 1; i >= 0; i--)
                Destroy(_container.GetChild(i).gameObject);

            foreach (NotificationItem item in _model.Visible())
            {
                if (_rowPrefab == null) continue;
                GameObject row = Instantiate(_rowPrefab, _container);
                var text = row.GetComponentInChildren<TMPro.TMP_Text>();
                if (text != null)
                {
                    text.text = item.Text;
                    text.color = InsimulUIThemeAsset.ToColor(item.Color);
                }
            }
        }
    }
}
