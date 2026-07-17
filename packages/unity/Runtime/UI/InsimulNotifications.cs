// InsimulNotifications.cs — transient-notification (toast) view-model (US-UU1).
//
// A pure, timing-driven queue: callers Push() notifications with a kind
// (info/success/warning/danger, mapped to a token color name) and an optional
// lifetime; Tick(delta) ages them out. Kept UnityEngine-FREE so the UGUI
// NotificationSystem MonoBehaviour (templates/scripts/ui/NotificationSystem.cs,
// structural-gate-only) and the shared host tests drive the SAME logic. Paired
// with the loading screen as the US-UU1 "pattern-proof pair" — both are
// model + thin view.

using System.Collections.Generic;

namespace Insimul.UI
{
    /// <summary>Notification severity. Maps to a theme token color via
    /// <see cref="InsimulNotifications.KindColor"/>.</summary>
    public enum NotificationKind { Info, Success, Warning, Danger }

    /// <summary>One live toast: a monotonic <see cref="Id"/>, its text, kind,
    /// resolved token color name, and remaining lifetime in seconds.</summary>
    public sealed class NotificationItem
    {
        public int Id;
        public string Text;
        public NotificationKind Kind;
        public string Color;
        public float Remaining;
    }

    /// <summary>Timing-driven toast queue. Pure; no Unity types.</summary>
    public sealed class InsimulNotifications
    {
        /// <summary>Default seconds a notification stays visible before Tick() expires it.</summary>
        public const float DefaultLifetime = 4f;

        /// <summary>Kind → theme token color name (see InsimulUITheme.Colors).</summary>
        public static readonly IReadOnlyDictionary<NotificationKind, string> KindColor =
            new Dictionary<NotificationKind, string>
            {
                { NotificationKind.Info,    "accent" },
                { NotificationKind.Success, "success" },
                { NotificationKind.Warning, "warning" },
                { NotificationKind.Danger,  "danger" },
            };

        private readonly List<NotificationItem> _items = new List<NotificationItem>();
        private int _nextId = 1;

        /// <summary>Enqueue a notification. Returns its id (so a caller can Dismiss()
        /// it early).</summary>
        public int Push(string text, NotificationKind kind = NotificationKind.Info, float lifetime = DefaultLifetime)
        {
            int id = _nextId++;
            _items.Add(new NotificationItem
            {
                Id = id,
                Text = text,
                Kind = kind,
                Color = KindColor.TryGetValue(kind, out string c) ? c : "accent",
                Remaining = lifetime,
            });
            return id;
        }

        /// <summary>Age every notification by <paramref name="delta"/> seconds,
        /// dropping any that expired. Returns true if the visible set changed (so a
        /// view knows to repaint).</summary>
        public bool Tick(float delta)
        {
            if (_items.Count == 0) return false;
            int before = _items.Count;
            for (int i = _items.Count - 1; i >= 0; i--)
            {
                _items[i].Remaining -= delta;
                if (_items[i].Remaining <= 0f) _items.RemoveAt(i);
            }
            return _items.Count != before;
        }

        /// <summary>Dismiss a notification by id early. Returns true if one was removed.</summary>
        public bool Dismiss(int id)
        {
            for (int i = 0; i < _items.Count; i++)
            {
                if (_items[i].Id == id)
                {
                    _items.RemoveAt(i);
                    return true;
                }
            }
            return false;
        }

        /// <summary>Currently visible notifications, oldest first.</summary>
        public IReadOnlyList<NotificationItem> Visible() => _items.ToArray();

        public int Count => _items.Count;

        public void Clear() => _items.Clear();
    }
}
