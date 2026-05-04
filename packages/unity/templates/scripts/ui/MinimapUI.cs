using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using System.Collections.Generic;
using Insimul.Core;
using Insimul.Characters;

namespace Insimul.UI
{
    /// <summary>
    /// Marker type matching the Babylon source of truth:
    /// player, npc, settlement, building, water_features, quest,
    /// quest_objective, exclamation, discovery
    /// </summary>
    public enum MinimapMarkerType
    {
        Player,
        NPC,
        Settlement,
        Building,
        WaterFeatures,
        Quest,
        QuestObjective,
        Exclamation,
        Discovery
    }

    /// <summary>
    /// Shape hint for quest_objective markers.
    /// Diamond for location-based, Circle for others.
    /// </summary>
    public enum MinimapMarkerShape
    {
        Circle,
        Diamond
    }

    /// <summary>
    /// Data for a single minimap marker.
    /// </summary>
    public struct MinimapMarkerData
    {
        public string Id;
        public Vector3 WorldPosition;
        public MinimapMarkerType Type;
        public string Label;
        public Color? CustomColor;
        public MinimapMarkerShape Shape;
    }

    public class MinimapUI : MonoBehaviour, IPointerClickHandler
    {
        private const float MapSize = 200f;
        private const float Margin = 8f;
        private const float HeaderHeight = 20f;
        private const float CaptureThreshold = 5f;      // world units before re-render
        private const float CaptureInterval = 0.5f;      // seconds between captures
        private const float PulseSpeed = 1.5f;

        private RectTransform _mapContent;
        private RectTransform _playerMarker;
        private InsimulPlayerController _player;
        private bool _visible = true;
        private bool _expanded = true;
        private bool _legendVisible = false;
        private GameObject _container;
        private GameObject _mapArea;
        private GameObject _legendPanel;
        private Text _toggleIcon;

        // Marker tracking
        private Dictionary<string, MinimapMarkerData> _markers = new Dictionary<string, MinimapMarkerData>();
        private Dictionary<string, RectTransform> _markerElements = new Dictionary<string, RectTransform>();
        private Dictionary<string, Image> _pulsingMarkers = new Dictionary<string, Image>();

        // Smart capture scheduling
        private Camera _minimapCamera;
        private RenderTexture _renderTexture;
        private RawImage _mapImage;
        private Vector3 _lastCapturePos = Vector3.one * float.MaxValue;
        private float _lastCaptureTime;

        // Teleport
        public System.Action<float, float> OnTeleportRequest;
        private GameObject _teleportDialog;

        // Fullscreen toggle
        public System.Action OnFullscreenToggle;

        // Whether the minimap is in fullscreen mode
        private bool _isFullscreen;

        // Marker label display elements
        private Dictionary<string, Text> _markerLabels = new Dictionary<string, Text>();

        private float _scale;
        private float _terrainSize;

        private void Start()
        {
            var worldData = InsimulGameManager.Instance?.WorldData;
            _terrainSize = worldData?.terrainSize ?? 500f;
            _scale = MapSize / _terrainSize;

            _player = FindFirstObjectByType<InsimulPlayerController>();

            Canvas canvas = FindFirstObjectByType<Canvas>();
            if (canvas == null)
            {
                var canvasGo = new GameObject("MinimapCanvas");
                canvas = canvasGo.AddComponent<Canvas>();
                canvas.renderMode = RenderMode.ScreenSpaceOverlay;
                canvas.sortingOrder = 50;
                canvasGo.AddComponent<CanvasScaler>();
                canvasGo.AddComponent<GraphicRaycaster>();
            }

            BuildUI(canvas.transform);
            CreateMinimapCamera();
        }

        private void BuildUI(Transform canvasRoot)
        {
            float containerW = MapSize + 14f;

            // Main container
            _container = new GameObject("MinimapContainer");
            _container.transform.SetParent(canvasRoot, false);
            var containerRect = _container.AddComponent<RectTransform>();
            containerRect.anchorMin = new Vector2(1, 1);
            containerRect.anchorMax = new Vector2(1, 1);
            containerRect.pivot = new Vector2(1, 1);
            containerRect.anchoredPosition = new Vector2(-Margin, -Margin);
            containerRect.sizeDelta = new Vector2(containerW, MapSize + HeaderHeight);

            var bg = _container.AddComponent<Image>();
            bg.color = new Color(0f, 0f, 0f, 0.7f);

            // ── Header row ──
            var headerGo = new GameObject("Header");
            headerGo.transform.SetParent(_container.transform, false);
            var headerRect = headerGo.AddComponent<RectTransform>();
            headerRect.anchorMin = new Vector2(0, 1);
            headerRect.anchorMax = new Vector2(1, 1);
            headerRect.pivot = new Vector2(0.5f, 1);
            headerRect.anchoredPosition = Vector2.zero;
            headerRect.sizeDelta = new Vector2(0, HeaderHeight);

            // Toggle button (left)
            var toggleGo = new GameObject("ToggleBtn");
            toggleGo.transform.SetParent(headerGo.transform, false);
            var toggleRect = toggleGo.AddComponent<RectTransform>();
            toggleRect.anchorMin = new Vector2(0, 0.5f);
            toggleRect.anchorMax = new Vector2(0, 0.5f);
            toggleRect.pivot = new Vector2(0, 0.5f);
            toggleRect.anchoredPosition = new Vector2(2, 0);
            toggleRect.sizeDelta = new Vector2(20, 16);
            var toggleBtn = toggleGo.AddComponent<Button>();
            toggleBtn.onClick.AddListener(ToggleCollapse);
            _toggleIcon = CreateTextChild(toggleGo, "ToggleIcon", "\u25BC", 9);

            // Title
            var titleGo = new GameObject("MapLabel");
            titleGo.transform.SetParent(headerGo.transform, false);
            var titleRect = titleGo.AddComponent<RectTransform>();
            titleRect.anchorMin = Vector2.zero;
            titleRect.anchorMax = Vector2.one;
            titleRect.offsetMin = Vector2.zero;
            titleRect.offsetMax = Vector2.zero;
            var titleText = titleGo.AddComponent<Text>();
            titleText.text = "Map";
            titleText.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            titleText.fontSize = 10;
            titleText.fontStyle = FontStyle.Bold;
            titleText.alignment = TextAnchor.MiddleCenter;
            titleText.color = Color.white;

            // Legend button (right, "?")
            var legendBtnGo = new GameObject("LegendBtn");
            legendBtnGo.transform.SetParent(headerGo.transform, false);
            var legendBtnRect = legendBtnGo.AddComponent<RectTransform>();
            legendBtnRect.anchorMin = new Vector2(1, 0.5f);
            legendBtnRect.anchorMax = new Vector2(1, 0.5f);
            legendBtnRect.pivot = new Vector2(1, 0.5f);
            legendBtnRect.anchoredPosition = new Vector2(-20, 0);
            legendBtnRect.sizeDelta = new Vector2(16, 14);
            var legendButton = legendBtnGo.AddComponent<Button>();
            legendButton.onClick.AddListener(ToggleLegend);
            CreateTextChild(legendBtnGo, "LegendIcon", "?", 9);

            // Fullscreen button (far right)
            var fsBtnGo = new GameObject("FullscreenBtn");
            fsBtnGo.transform.SetParent(headerGo.transform, false);
            var fsBtnRect = fsBtnGo.AddComponent<RectTransform>();
            fsBtnRect.anchorMin = new Vector2(1, 0.5f);
            fsBtnRect.anchorMax = new Vector2(1, 0.5f);
            fsBtnRect.pivot = new Vector2(1, 0.5f);
            fsBtnRect.anchoredPosition = new Vector2(-2, 0);
            fsBtnRect.sizeDelta = new Vector2(16, 14);
            var fsButton = fsBtnGo.AddComponent<Button>();
            fsButton.onClick.AddListener(() => OnFullscreenToggle?.Invoke());
            CreateTextChild(fsBtnGo, "FSIcon", "\u26F6", 10);

            // ── Map area ──
            _mapArea = new GameObject("MapArea");
            _mapArea.transform.SetParent(_container.transform, false);
            var mapAreaRect = _mapArea.AddComponent<RectTransform>();
            mapAreaRect.anchorMin = new Vector2(0, 0);
            mapAreaRect.anchorMax = new Vector2(1, 1);
            mapAreaRect.offsetMin = new Vector2(7, 0);
            mapAreaRect.offsetMax = new Vector2(-7, -HeaderHeight);

            // Add Mask so markers clip
            var maskImg = _mapArea.AddComponent<Image>();
            maskImg.color = new Color(0.08f, 0.08f, 0.08f, 0.8f);
            _mapArea.AddComponent<Mask>().showMaskGraphic = true;

            // RawImage for render texture
            var rtGo = new GameObject("MinimapRT");
            rtGo.transform.SetParent(_mapArea.transform, false);
            var rtRect = rtGo.AddComponent<RectTransform>();
            rtRect.anchorMin = Vector2.zero;
            rtRect.anchorMax = Vector2.one;
            rtRect.offsetMin = Vector2.zero;
            rtRect.offsetMax = Vector2.zero;
            _mapImage = rtGo.AddComponent<RawImage>();

            // Map content (markers go here)
            var contentGo = new GameObject("MapContent");
            contentGo.transform.SetParent(_mapArea.transform, false);
            _mapContent = contentGo.AddComponent<RectTransform>();
            _mapContent.anchorMin = new Vector2(0.5f, 0.5f);
            _mapContent.anchorMax = new Vector2(0.5f, 0.5f);
            _mapContent.pivot = new Vector2(0.5f, 0.5f);
            _mapContent.sizeDelta = Vector2.zero;

            // Player marker (cyan circle)
            _playerMarker = CreateMarkerVisual(_mapContent, "Player", GetDefaultColor(MinimapMarkerType.Player), 6, MinimapMarkerShape.Circle);

            // ── Legend panel ──
            BuildLegend(canvasRoot);
        }

        private void BuildLegend(Transform canvasRoot)
        {
            var items = new (string label, Color color)[]
            {
                ("You",        GetDefaultColor(MinimapMarkerType.Player)),
                ("NPC",        GetDefaultColor(MinimapMarkerType.NPC)),
                ("Settlement", GetDefaultColor(MinimapMarkerType.Settlement)),
                ("Quest",      GetDefaultColor(MinimapMarkerType.Quest)),
                ("Building",   GetDefaultColor(MinimapMarkerType.Building)),
            };

            float rowH = 14f;
            float legendH = items.Length * rowH + 8f;
            float legendW = MapSize + 14f;

            _legendPanel = new GameObject("MinimapLegend");
            _legendPanel.transform.SetParent(canvasRoot, false);
            var legendRect = _legendPanel.AddComponent<RectTransform>();
            legendRect.anchorMin = new Vector2(1, 1);
            legendRect.anchorMax = new Vector2(1, 1);
            legendRect.pivot = new Vector2(1, 1);
            legendRect.anchoredPosition = new Vector2(-Margin, -(Margin + MapSize + HeaderHeight + 2));
            legendRect.sizeDelta = new Vector2(legendW, legendH);

            var legendBg = _legendPanel.AddComponent<Image>();
            legendBg.color = new Color(0f, 0f, 0f, 0.8f);

            for (int i = 0; i < items.Length; i++)
            {
                var rowGo = new GameObject($"LegendRow{i}");
                rowGo.transform.SetParent(_legendPanel.transform, false);
                var rowRect = rowGo.AddComponent<RectTransform>();
                rowRect.anchorMin = new Vector2(0, 1);
                rowRect.anchorMax = new Vector2(1, 1);
                rowRect.pivot = new Vector2(0, 1);
                rowRect.anchoredPosition = new Vector2(4, -(4 + i * rowH));
                rowRect.sizeDelta = new Vector2(-8, rowH);

                // Color dot
                var dotGo = new GameObject($"Dot{i}");
                dotGo.transform.SetParent(rowGo.transform, false);
                var dotRect = dotGo.AddComponent<RectTransform>();
                dotRect.anchorMin = new Vector2(0, 0.5f);
                dotRect.anchorMax = new Vector2(0, 0.5f);
                dotRect.pivot = new Vector2(0, 0.5f);
                dotRect.anchoredPosition = new Vector2(0, 0);
                dotRect.sizeDelta = new Vector2(6, 6);
                var dotImg = dotGo.AddComponent<Image>();
                dotImg.color = items[i].color;

                // Label
                var lblGo = new GameObject($"Label{i}");
                lblGo.transform.SetParent(rowGo.transform, false);
                var lblRect = lblGo.AddComponent<RectTransform>();
                lblRect.anchorMin = Vector2.zero;
                lblRect.anchorMax = Vector2.one;
                lblRect.offsetMin = new Vector2(10, 0);
                lblRect.offsetMax = Vector2.zero;
                var lblText = lblGo.AddComponent<Text>();
                lblText.text = items[i].label;
                lblText.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
                lblText.fontSize = 8;
                lblText.alignment = TextAnchor.MiddleLeft;
                lblText.color = Color.white;
            }

            _legendPanel.SetActive(false);
        }

        private void CreateMinimapCamera()
        {
            _renderTexture = new RenderTexture(512, 512, 16);

            var camGo = new GameObject("MinimapCamera");
            _minimapCamera = camGo.AddComponent<Camera>();
            _minimapCamera.orthographic = true;
            _minimapCamera.orthographicSize = _terrainSize / 2f;
            _minimapCamera.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
            _minimapCamera.transform.position = new Vector3(0f, 200f, 0f);
            _minimapCamera.targetTexture = _renderTexture;
            _minimapCamera.clearFlags = CameraClearFlags.SolidColor;
            _minimapCamera.backgroundColor = new Color(0.35f, 0.55f, 0.25f);
            _minimapCamera.cullingMask = ~0; // all layers
            _minimapCamera.depth = -10;
            _minimapCamera.enabled = false; // manual rendering

            if (_mapImage != null)
                _mapImage.texture = _renderTexture;

            // Initial capture
            ScheduleCapture();
        }

        private void ScheduleCapture()
        {
            if (_minimapCamera == null) return;
            _minimapCamera.Render();
            _lastCaptureTime = Time.time;
        }

        private void Update()
        {
            if (Input.GetKeyDown(KeyCode.M))
            {
                _visible = !_visible;
                _container.SetActive(_visible);
                if (!_visible)
                {
                    _legendVisible = false;
                    _legendPanel.SetActive(false);
                }
            }

            if (!_visible || _player == null) return;

            // Update all marker positions
            Vector3 playerPos = _player.transform.position;
            _playerMarker.GetComponent<RectTransform>().anchoredPosition = WorldToMinimap(playerPos.x, playerPos.z);

            foreach (var kvp in _markers)
            {
                if (_markerElements.TryGetValue(kvp.Key, out var el))
                {
                    var pos = kvp.Value.WorldPosition;
                    el.anchoredPosition = WorldToMinimap(pos.x, pos.z);
                }
            }

            // Pulsing animation for exclamation markers
            foreach (var kvp in _pulsingMarkers)
            {
                float alpha = 0.7f + 0.3f * Mathf.Sin(Time.time * PulseSpeed * Mathf.PI);
                var c = kvp.Value.color;
                kvp.Value.color = new Color(c.r, c.g, c.b, alpha);
            }

            // Smart capture: only re-render when player moves >5 units or every 500ms
            float dx = playerPos.x - _lastCapturePos.x;
            float dz = playerPos.z - _lastCapturePos.z;
            float distSq = dx * dx + dz * dz;
            if (distSq > CaptureThreshold * CaptureThreshold &&
                Time.time - _lastCaptureTime > CaptureInterval)
            {
                if (_minimapCamera != null)
                {
                    _minimapCamera.transform.position = new Vector3(playerPos.x, 200f, playerPos.z);
                }
                _lastCapturePos = playerPos;
                ScheduleCapture();
            }
        }

        // ── Marker management ──

        public void AddMarker(MinimapMarkerData marker)
        {
            if (_mapContent == null) return;

            _markers[marker.Id] = marker;

            if (!_markerElements.ContainsKey(marker.Id))
            {
                Color color = marker.CustomColor ?? GetDefaultColor(marker.Type);
                int size = GetMarkerSize(marker.Type);
                MinimapMarkerShape shape = marker.Shape;

                // Exclamation markers use a special "!" label
                if (marker.Type == MinimapMarkerType.Exclamation)
                {
                    shape = MinimapMarkerShape.Circle;
                    size = 12;
                }

                // quest_objective + diamond -> rotated square
                if (marker.Type == MinimapMarkerType.QuestObjective && marker.Shape == MinimapMarkerShape.Diamond)
                {
                    shape = MinimapMarkerShape.Diamond;
                    size = 6;
                }

                var el = CreateMarkerVisual(_mapContent, marker.Id, color, size, shape);

                if (marker.Type == MinimapMarkerType.Exclamation)
                {
                    // Add "!" text
                    var txtGo = new GameObject("ExclamText");
                    txtGo.transform.SetParent(el.gameObject.transform, false);
                    var txtRect = txtGo.AddComponent<RectTransform>();
                    txtRect.anchorMin = Vector2.zero;
                    txtRect.anchorMax = Vector2.one;
                    txtRect.offsetMin = Vector2.zero;
                    txtRect.offsetMax = Vector2.zero;
                    var txt = txtGo.AddComponent<Text>();
                    txt.text = "!";
                    txt.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
                    txt.fontSize = 9;
                    txt.fontStyle = FontStyle.Bold;
                    txt.alignment = TextAnchor.MiddleCenter;
                    txt.color = Color.black;

                    // Register for pulsing
                    var img = el.GetComponent<Image>();
                    if (img != null) _pulsingMarkers[marker.Id] = img;
                }

                _markerElements[marker.Id] = el;
            }

            // Add or update dynamic marker label if provided
            if (!string.IsNullOrEmpty(marker.Label))
            {
                if (!_markerLabels.ContainsKey(marker.Id))
                {
                    var labelGo = new GameObject(marker.Id + "Label");
                    labelGo.transform.SetParent(_mapContent, false);
                    var labelRect = labelGo.AddComponent<RectTransform>();
                    labelRect.sizeDelta = new Vector2(60, 10);
                    var labelText = labelGo.AddComponent<Text>();
                    labelText.text = marker.Label;
                    labelText.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
                    labelText.fontSize = 7;
                    labelText.alignment = TextAnchor.UpperCenter;
                    labelText.color = new Color(1f, 1f, 1f, 0.8f);
                    _markerLabels[marker.Id] = labelText;
                }
                else
                {
                    _markerLabels[marker.Id].text = marker.Label;
                }
            }

            // Update position
            if (_markerElements.TryGetValue(marker.Id, out var rect))
            {
                var pos = marker.WorldPosition;
                var minimapPos = WorldToMinimap(pos.x, pos.z);
                rect.anchoredPosition = minimapPos;

                // Update label position (offset below marker)
                if (_markerLabels.TryGetValue(marker.Id, out var labelText))
                {
                    labelText.GetComponent<RectTransform>().anchoredPosition =
                        new Vector2(minimapPos.x, minimapPos.y - 8f);
                }
            }
        }

        public void RemoveMarker(string markerId)
        {
            _markers.Remove(markerId);
            _pulsingMarkers.Remove(markerId);

            if (_markerElements.TryGetValue(markerId, out var el))
            {
                Destroy(el.gameObject);
                _markerElements.Remove(markerId);
            }

            if (_markerLabels.TryGetValue(markerId, out var label))
            {
                Destroy(label.gameObject);
                _markerLabels.Remove(markerId);
            }
        }

        public void ClearMarkers()
        {
            foreach (var kvp in _markerElements)
                Destroy(kvp.Value.gameObject);
            foreach (var kvp in _markerLabels)
                Destroy(kvp.Value.gameObject);

            _markers.Clear();
            _markerElements.Clear();
            _pulsingMarkers.Clear();
            _markerLabels.Clear();
        }

        // ── Fullscreen toggle ──

        /// <summary>
        /// Toggle between normal minimap and fullscreen map view.
        /// In fullscreen, the minimap container fills the screen center area.
        /// </summary>
        public void ToggleFullscreen()
        {
            _isFullscreen = !_isFullscreen;
            var containerRect = _container.GetComponent<RectTransform>();

            if (_isFullscreen)
            {
                // Expand to near-fullscreen centered
                containerRect.anchorMin = new Vector2(0.1f, 0.1f);
                containerRect.anchorMax = new Vector2(0.9f, 0.9f);
                containerRect.anchoredPosition = Vector2.zero;
                containerRect.sizeDelta = Vector2.zero;
            }
            else
            {
                // Restore to normal minimap position (top-right corner)
                containerRect.anchorMin = new Vector2(1, 1);
                containerRect.anchorMax = new Vector2(1, 1);
                containerRect.pivot = new Vector2(1, 1);
                containerRect.anchoredPosition = new Vector2(-Margin, -Margin);
                containerRect.sizeDelta = new Vector2(MapSize + 14f, MapSize + HeaderHeight);
            }

            OnFullscreenToggle?.Invoke();
            ScheduleCapture();
        }

        // ── Collapse / expand ──

        private void ToggleCollapse()
        {
            _expanded = !_expanded;
            var containerRect = _container.GetComponent<RectTransform>();
            if (_expanded)
            {
                containerRect.sizeDelta = new Vector2(MapSize + 14f, MapSize + HeaderHeight);
                _mapArea.SetActive(true);
                _toggleIcon.text = "\u25BC"; // down arrow
            }
            else
            {
                containerRect.sizeDelta = new Vector2(MapSize + 14f, HeaderHeight);
                _mapArea.SetActive(false);
                _toggleIcon.text = "\u25B2"; // up arrow
                // Hide legend when collapsing
                _legendVisible = false;
                _legendPanel.SetActive(false);
            }
        }

        // ── Legend ──

        private void ToggleLegend()
        {
            _legendVisible = !_legendVisible;
            _legendPanel.SetActive(_legendVisible);
        }

        // ── Teleport via right-click ──

        public void OnPointerClick(PointerEventData eventData)
        {
            if (eventData.button != PointerEventData.InputButton.Right) return;
            if (OnTeleportRequest == null) return;

            // Convert click position to world coordinates
            RectTransform mapRect = _mapArea.GetComponent<RectTransform>();
            if (!RectTransformUtility.ScreenPointToLocalPointInRectangle(
                mapRect, eventData.position, eventData.pressEventCamera, out var localPoint))
                return;

            float halfMap = MapSize / 2f;
            if (Mathf.Abs(localPoint.x) > halfMap || Mathf.Abs(localPoint.y) > halfMap)
                return;

            float halfWorld = _terrainSize / 2f;
            float worldX = (localPoint.x / halfMap) * halfWorld;
            float worldZ = (localPoint.y / halfMap) * halfWorld;

            ShowTeleportDialog(worldX, worldZ);
        }

        private void ShowTeleportDialog(float worldX, float worldZ)
        {
            DismissTeleportDialog();

            Canvas canvas = FindFirstObjectByType<Canvas>();
            if (canvas == null) return;

            _teleportDialog = new GameObject("TeleportDialog");
            _teleportDialog.transform.SetParent(canvas.transform, false);
            var dlgRect = _teleportDialog.AddComponent<RectTransform>();
            dlgRect.anchorMin = new Vector2(0.5f, 0.5f);
            dlgRect.anchorMax = new Vector2(0.5f, 0.5f);
            dlgRect.sizeDelta = new Vector2(220, 90);

            var dlgBg = _teleportDialog.AddComponent<Image>();
            dlgBg.color = new Color(0f, 0f, 0f, 0.85f);

            // Question text
            var questionGo = new GameObject("Question");
            questionGo.transform.SetParent(_teleportDialog.transform, false);
            var qRect = questionGo.AddComponent<RectTransform>();
            qRect.anchorMin = new Vector2(0, 0.5f);
            qRect.anchorMax = new Vector2(1, 1);
            qRect.offsetMin = Vector2.zero;
            qRect.offsetMax = Vector2.zero;
            var qText = questionGo.AddComponent<Text>();
            qText.text = "Teleport here?";
            qText.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            qText.fontSize = 14;
            qText.fontStyle = FontStyle.Bold;
            qText.alignment = TextAnchor.MiddleCenter;
            qText.color = Color.white;

            // Yes button
            var yesGo = CreateDialogButton(_teleportDialog.transform, "Yes", new Color(0.16f, 0.48f, 0.16f), -40);
            yesGo.GetComponent<Button>().onClick.AddListener(() =>
            {
                OnTeleportRequest?.Invoke(worldX, worldZ);
                DismissTeleportDialog();
            });

            // No button
            var noGo = CreateDialogButton(_teleportDialog.transform, "No", new Color(0.48f, 0.16f, 0.16f), 40);
            noGo.GetComponent<Button>().onClick.AddListener(DismissTeleportDialog);
        }

        private GameObject CreateDialogButton(Transform parent, string label, Color bgColor, float xOffset)
        {
            var go = new GameObject(label + "Btn");
            go.transform.SetParent(parent, false);
            var rect = go.AddComponent<RectTransform>();
            rect.anchorMin = new Vector2(0.5f, 0);
            rect.anchorMax = new Vector2(0.5f, 0);
            rect.pivot = new Vector2(0.5f, 0);
            rect.anchoredPosition = new Vector2(xOffset, 10);
            rect.sizeDelta = new Vector2(70, 28);

            var img = go.AddComponent<Image>();
            img.color = bgColor;
            go.AddComponent<Button>();

            var txtGo = new GameObject("Text");
            txtGo.transform.SetParent(go.transform, false);
            var txtRect = txtGo.AddComponent<RectTransform>();
            txtRect.anchorMin = Vector2.zero;
            txtRect.anchorMax = Vector2.one;
            txtRect.offsetMin = Vector2.zero;
            txtRect.offsetMax = Vector2.zero;
            var txt = txtGo.AddComponent<Text>();
            txt.text = label;
            txt.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            txt.fontSize = 13;
            txt.fontStyle = FontStyle.Bold;
            txt.alignment = TextAnchor.MiddleCenter;
            txt.color = Color.white;

            return go;
        }

        private void DismissTeleportDialog()
        {
            if (_teleportDialog != null)
            {
                Destroy(_teleportDialog);
                _teleportDialog = null;
            }
        }

        // ── Visibility ──

        public void Show()
        {
            _visible = true;
            _container.SetActive(true);
        }

        public void Hide()
        {
            _visible = false;
            _container.SetActive(false);
            _legendVisible = false;
            _legendPanel.SetActive(false);
        }

        public void Toggle()
        {
            if (_visible) Hide();
            else Show();
        }

        // ── Helpers ──

        private Vector2 WorldToMinimap(float worldX, float worldZ)
        {
            return new Vector2(worldX * _scale, worldZ * _scale);
        }

        private int GetMarkerSize(MinimapMarkerType type)
        {
            switch (type)
            {
                case MinimapMarkerType.Player:       return 6;
                case MinimapMarkerType.Settlement:    return 8;
                case MinimapMarkerType.Quest:         return 7;
                case MinimapMarkerType.QuestObjective: return 5;
                case MinimapMarkerType.Discovery:     return 6;
                case MinimapMarkerType.Building:      return 3;
                case MinimapMarkerType.NPC:           return 4;
                case MinimapMarkerType.WaterFeatures: return 4;
                case MinimapMarkerType.Exclamation:   return 12;
                default: return 4;
            }
        }

        private Color GetDefaultColor(MinimapMarkerType type)
        {
            switch (type)
            {
                case MinimapMarkerType.Player:        return Color.cyan;
                case MinimapMarkerType.NPC:           return Color.yellow;
                case MinimapMarkerType.Settlement:     return new Color(1f, 0.65f, 0f);        // orange
                case MinimapMarkerType.Quest:          return Color.magenta;
                case MinimapMarkerType.Building:       return Color.gray;
                case MinimapMarkerType.WaterFeatures:  return new Color(0.2f, 0.4f, 0.8f);
                case MinimapMarkerType.QuestObjective: return new Color(0f, 0.74f, 0.83f);     // #00BCD4
                case MinimapMarkerType.Exclamation:    return new Color(1f, 0.8f, 0f);          // #ffcc00
                case MinimapMarkerType.Discovery:      return new Color(0.506f, 0.78f, 0.518f); // #81C784
                default: return Color.white;
            }
        }

        private RectTransform CreateMarkerVisual(RectTransform parent, string label, Color color, int size, MinimapMarkerShape shape)
        {
            var go = new GameObject(label + "Marker");
            go.transform.SetParent(parent, false);
            var rect = go.AddComponent<RectTransform>();
            rect.sizeDelta = new Vector2(size, size);
            var img = go.AddComponent<Image>();
            img.color = color;

            if (shape == MinimapMarkerShape.Diamond)
            {
                rect.localRotation = Quaternion.Euler(0, 0, 45);
            }

            return rect;
        }

        private Text CreateTextChild(GameObject parent, string name, string text, int fontSize)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent.transform, false);
            var rect = go.AddComponent<RectTransform>();
            rect.anchorMin = Vector2.zero;
            rect.anchorMax = Vector2.one;
            rect.offsetMin = Vector2.zero;
            rect.offsetMax = Vector2.zero;
            var t = go.AddComponent<Text>();
            t.text = text;
            t.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            t.fontSize = fontSize;
            t.fontStyle = FontStyle.Bold;
            t.alignment = TextAnchor.MiddleCenter;
            t.color = new Color(1f, 1f, 1f, 0.6f);
            return t;
        }

        private void OnDestroy()
        {
            DismissTeleportDialog();
            ClearMarkers();
            foreach (var kvp in _markerLabels)
            {
                if (kvp.Value != null) Destroy(kvp.Value.gameObject);
            }
            _markerLabels.Clear();
            if (_renderTexture != null)
            {
                _renderTexture.Release();
                Destroy(_renderTexture);
            }
            if (_minimapCamera != null)
                Destroy(_minimapCamera.gameObject);
        }
    }
}
