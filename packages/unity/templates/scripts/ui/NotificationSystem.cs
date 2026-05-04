using UnityEngine;
using UnityEngine.UI;
using TMPro;
using System.Collections.Generic;

namespace Insimul.UI
{
    public enum NotificationType { Info, Success, Warning, QuestUpdate, ItemPickup, LevelUp }

    public class NotificationSystem : MonoBehaviour
    {
        public static NotificationSystem Instance { get; private set; }

        private Canvas canvas;
        private RectTransform container;
        private List<Toast> toasts = new List<Toast>();
        private const int MaxVisible = 5;
        private const float SlideTime = 0.3f;
        private const float Lifetime = 4f;
        private const float FadeTime = 0.5f;
        private const float ToastWidth = 300f;
        private const float ToastHeight = 40f;
        private const float Spacing = 6f;

        private class Toast
        {
            public GameObject go;
            public float createdAt;
            public float lifetime = Lifetime;
            public RectTransform rect;
            public CanvasGroup canvasGroup;
            public bool fadingOut;
        }

        private void Awake()
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
            DontDestroyOnLoad(gameObject);
            SetupCanvas();
        }

        private void SetupCanvas()
        {
            var canvasGo = new GameObject("NotificationCanvas");
            canvasGo.transform.SetParent(transform);
            canvas = canvasGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 200;
            canvasGo.AddComponent<CanvasScaler>().uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            canvasGo.AddComponent<GraphicRaycaster>();

            var cGo = new GameObject("Container");
            container = cGo.AddComponent<RectTransform>();
            container.SetParent(canvasGo.transform, false);
            container.anchorMin = new Vector2(1, 1);
            container.anchorMax = new Vector2(1, 1);
            container.pivot = new Vector2(1, 1);
            container.anchoredPosition = new Vector2(-16, -16);
        }

        public void ShowNotification(string message, NotificationType type = NotificationType.Info)
        {
            if (toasts.Count >= MaxVisible)
            {
                var oldest = toasts[0];
                if (oldest.go) Destroy(oldest.go);
                toasts.RemoveAt(0);
            }

            Color accent = GetColor(type);
            var toast = CreateToast(message, accent);
            toasts.Add(toast);
            RepositionStack();
        }

        private Toast CreateToast(string message, Color accent)
        {
            var go = new GameObject("Toast");
            var rect = go.AddComponent<RectTransform>();
            rect.SetParent(container, false);
            rect.sizeDelta = new Vector2(ToastWidth, ToastHeight);
            rect.pivot = new Vector2(1, 1);

            var cg = go.AddComponent<CanvasGroup>();

            var bgImg = go.AddComponent<Image>();
            bgImg.color = new Color(0.1f, 0.1f, 0.15f, 0.85f);

            var iconGo = new GameObject("Icon");
            var iconRect = iconGo.AddComponent<RectTransform>();
            iconRect.SetParent(rect, false);
            iconRect.anchorMin = new Vector2(0, 0.5f);
            iconRect.anchorMax = new Vector2(0, 0.5f);
            iconRect.pivot = new Vector2(0, 0.5f);
            iconRect.anchoredPosition = new Vector2(8, 0);
            iconRect.sizeDelta = new Vector2(8, 8);
            var iconImg = iconGo.AddComponent<Image>();
            iconImg.color = accent;

            var textGo = new GameObject("Text");
            var textRect = textGo.AddComponent<RectTransform>();
            textRect.SetParent(rect, false);
            textRect.anchorMin = Vector2.zero;
            textRect.anchorMax = Vector2.one;
            textRect.offsetMin = new Vector2(24, 4);
            textRect.offsetMax = new Vector2(-8, -4);
            var tmp = textGo.AddComponent<TextMeshProUGUI>();
            tmp.text = message;
            tmp.fontSize = 14;
            tmp.color = Color.white;
            tmp.alignment = TextAlignmentOptions.MidlineLeft;
            tmp.overflowMode = TextOverflowModes.Ellipsis;

            return new Toast
            {
                go = go, rect = rect, canvasGroup = cg,
                createdAt = Time.unscaledTime, lifetime = Lifetime
            };
        }

        private void RepositionStack()
        {
            for (int i = 0; i < toasts.Count; i++)
            {
                float targetY = -i * (ToastHeight + Spacing);
                toasts[i].rect.anchoredPosition = new Vector2(
                    toasts[i].rect.anchoredPosition.x, targetY);
            }
        }

        private Color GetColor(NotificationType type)
        {
            switch (type)
            {
                case NotificationType.Success:     return new Color(0.3f, 0.85f, 0.3f);
                case NotificationType.Warning:     return new Color(0.9f, 0.7f, 0.2f);
                case NotificationType.QuestUpdate: return new Color(0.2f, 0.8f, 0.9f);
                case NotificationType.ItemPickup:  return new Color(0.9f, 0.8f, 0.2f);
                case NotificationType.LevelUp:     return new Color(0.9f, 0.3f, 0.9f);
                default:                           return new Color(0.9f, 0.9f, 0.9f);
            }
        }

        private void Update()
        {
            float now = Time.unscaledTime;
            bool removed = false;

            for (int i = toasts.Count - 1; i >= 0; i--)
            {
                var t = toasts[i];
                if (!t.go) { toasts.RemoveAt(i); removed = true; continue; }

                float age = now - t.createdAt;

                // Slide in
                if (age < SlideTime)
                {
                    float p = age / SlideTime;
                    float x = Mathf.Lerp(ToastWidth + 20f, 0f, p * p);
                    var pos = t.rect.anchoredPosition;
                    pos.x = x;
                    t.rect.anchoredPosition = pos;
                }
                else if (!t.fadingOut && t.rect.anchoredPosition.x != 0f)
                {
                    var pos = t.rect.anchoredPosition;
                    pos.x = 0f;
                    t.rect.anchoredPosition = pos;
                }

                // Fade out
                if (age > t.lifetime)
                {
                    t.fadingOut = true;
                    float fadeProgress = (age - t.lifetime) / FadeTime;
                    t.canvasGroup.alpha = Mathf.Lerp(1f, 0f, fadeProgress);
                    if (fadeProgress >= 1f)
                    {
                        Destroy(t.go);
                        toasts.RemoveAt(i);
                        removed = true;
                    }
                }
            }

            if (removed) RepositionStack();
        }
    }
}
