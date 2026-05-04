using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using TMPro;
using Insimul.Data;

namespace Insimul.UI
{
    /// <summary>
    /// Full-screen world map overlay with pan, zoom, settlement markers,
    /// road lines, quest markers, NPC positions, and a player arrow.
    /// Toggle with M key. Pauses the game and shows cursor while open.
    /// </summary>
    public class WorldMapUI : MonoBehaviour
    {
        public enum MapMarkerType { Settlement, QuestObjective, NPC, Player }

        [System.Serializable]
        public struct MapMarker
        {
            public string id;
            public string label;
            public Vector2 worldPosition;
            public MapMarkerType markerType;
            public Color color;
        }

        [System.Serializable]
        public struct MapRoad
        {
            public Vector2[] waypoints;
            public float width;
        }

        [Header("Map Container")]
        public RectTransform mapPanel;
        public Image backgroundOverlay;

        [Header("Title")]
        public TextMeshProUGUI titleText;

        [Header("Legend")]
        public TextMeshProUGUI legendText;

        [Header("Map Content")]
        public RawImage terrainImage;
        public RectTransform markerContainer;
        public RectTransform playerArrow;

        [Header("Marker Prefabs")]
        public GameObject settlementMarkerPrefab;
        public GameObject questMarkerPrefab;
        public GameObject npcMarkerPrefab;

        [Header("Settings")]
        public float worldSize = 1000f;
        public float[] zoomLevels = { 0.5f, 1f, 2f, 4f };
        public KeyCode toggleKey = KeyCode.M;

        private bool _isOpen;
        private int _currentZoomIndex = 1;
        private Vector2 _panOffset;
        private bool _isDragging;
        private Vector2 _dragStart;
        private Vector2 _playerPosition;
        private float _playerRotation;
        private readonly List<MapMarker> _markers = new();
        private readonly List<MapRoad> _roads = new();
        private readonly Dictionary<string, GameObject> _markerObjects = new();
        private Texture2D _terrainTexture;

        private const float MAP_PADDING = 40f;
        private const float MARKER_SIZE = 16f;
        private const float PLAYER_ARROW_SIZE = 20f;

        private void Start()
        {
            if (mapPanel != null)
                mapPanel.gameObject.SetActive(false);
            _currentZoomIndex = Mathf.Clamp(1, 0, zoomLevels.Length - 1);
        }

        private void Update()
        {
            if (Input.GetKeyDown(toggleKey))
                ToggleMap();

            if (!_isOpen) return;

            HandleZoomInput();
            HandlePanInput();
            UpdatePlayerArrow();
            UpdateMarkerPositions();
        }

        // ── Public API ──

        public void InitializeMap(float inWorldSize, float[] inZoomLevels)
        {
            worldSize = Mathf.Max(inWorldSize, 1f);
            if (inZoomLevels != null && inZoomLevels.Length > 0)
                zoomLevels = inZoomLevels;

            _currentZoomIndex = 0;
            for (int i = 0; i < zoomLevels.Length; i++)
            {
                if (zoomLevels[i] >= 1f)
                {
                    _currentZoomIndex = i;
                    break;
                }
            }
            _panOffset = Vector2.zero;
        }

        public void AddMarker(MapMarker marker)
        {
            _markers.Add(marker);
            CreateMarkerObject(marker);
        }

        public void AddRoad(MapRoad road)
        {
            _roads.Add(road);
        }

        public void UpdatePlayerPosition(Vector2 position, float rotationDegrees)
        {
            _playerPosition = position;
            _playerRotation = rotationDegrees;
        }

        public void ClearMarkersByType(MapMarkerType type)
        {
            for (int i = _markers.Count - 1; i >= 0; i--)
            {
                if (_markers[i].markerType == type)
                {
                    if (_markerObjects.TryGetValue(_markers[i].id, out var obj))
                    {
                        Destroy(obj);
                        _markerObjects.Remove(_markers[i].id);
                    }
                    _markers.RemoveAt(i);
                }
            }
        }

        public void SetTerrainTexture(Texture2D texture)
        {
            _terrainTexture = texture;
            if (terrainImage != null)
                terrainImage.texture = texture;
        }

        public bool IsMapOpen => _isOpen;

        /// <summary>
        /// Generate a terrain texture from a heightmap using elevation-based coloring.
        /// </summary>
        public static Texture2D GenerateTerrainTexture(float[,] heightmap, int resolution = 256)
        {
            int rows = heightmap.GetLength(0);
            int cols = heightmap.GetLength(1);
            var tex = new Texture2D(resolution, resolution, TextureFormat.RGBA32, false)
            {
                filterMode = FilterMode.Bilinear,
                wrapMode = TextureWrapMode.Clamp
            };

            var pixels = new Color[resolution * resolution];
            for (int y = 0; y < resolution; y++)
            {
                for (int x = 0; x < resolution; x++)
                {
                    float sampleX = (float)x / resolution * (cols - 1);
                    float sampleY = (float)y / resolution * (rows - 1);
                    int ix = Mathf.Clamp(Mathf.FloorToInt(sampleX), 0, cols - 1);
                    int iy = Mathf.Clamp(Mathf.FloorToInt(sampleY), 0, rows - 1);
                    float elevation = heightmap[iy, ix];

                    pixels[y * resolution + x] = ElevationToColor(elevation);
                }
            }

            tex.SetPixels(pixels);
            tex.Apply();
            return tex;
        }

        // ── Toggle ──

        public void ToggleMap()
        {
            _isOpen = !_isOpen;

            if (mapPanel != null)
                mapPanel.gameObject.SetActive(_isOpen);

            if (_isOpen)
            {
                Time.timeScale = 0f;
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
                UpdateLegend();
            }
            else
            {
                Time.timeScale = 1f;
                Cursor.lockState = CursorLockMode.Locked;
                Cursor.visible = false;
                _isDragging = false;
            }
        }

        // ── Input handling ──

        private void HandleZoomInput()
        {
            float scroll = Input.GetAxis("Mouse ScrollWheel");
            if (scroll > 0f)
                CycleZoom(1);
            else if (scroll < 0f)
                CycleZoom(-1);
        }

        private void HandlePanInput()
        {
            if (Input.GetMouseButtonDown(0))
            {
                _isDragging = true;
                _dragStart = Input.mousePosition;
            }
            else if (Input.GetMouseButtonUp(0))
            {
                _isDragging = false;
            }

            if (_isDragging)
            {
                Vector2 current = Input.mousePosition;
                _panOffset += current - _dragStart;
                _dragStart = current;
                ClampPanOffset();
            }
        }

        private void CycleZoom(int direction)
        {
            int newIndex = _currentZoomIndex + direction;
            if (newIndex >= 0 && newIndex < zoomLevels.Length)
            {
                _currentZoomIndex = newIndex;
                ClampPanOffset();
                UpdateLegend();
            }
        }

        private void ClampPanOffset()
        {
            float zoom = CurrentZoom;
            float maxPan = worldSize * zoom * 0.5f;
            _panOffset.x = Mathf.Clamp(_panOffset.x, -maxPan, maxPan);
            _panOffset.y = Mathf.Clamp(_panOffset.y, -maxPan, maxPan);
        }

        private float CurrentZoom =>
            _currentZoomIndex >= 0 && _currentZoomIndex < zoomLevels.Length
                ? zoomLevels[_currentZoomIndex]
                : 1f;

        // ── Coordinate conversion ──

        private Vector2 WorldToMap(Vector2 worldPos)
        {
            if (mapPanel == null) return Vector2.zero;

            Vector2 panelSize = mapPanel.rect.size;
            float mapSize = Mathf.Min(panelSize.x, panelSize.y) - MAP_PADDING * 2f;
            float zoom = CurrentZoom;

            float normX = worldPos.x / worldSize;
            float normY = worldPos.y / worldSize;

            float screenX = (normX - 0.5f) * mapSize * zoom + _panOffset.x;
            float screenY = (normY - 0.5f) * mapSize * zoom + _panOffset.y;

            return new Vector2(screenX, screenY);
        }

        // ── Marker management ──

        private void CreateMarkerObject(MapMarker marker)
        {
            if (markerContainer == null) return;

            GameObject prefab = marker.markerType switch
            {
                MapMarkerType.Settlement => settlementMarkerPrefab,
                MapMarkerType.QuestObjective => questMarkerPrefab,
                MapMarkerType.NPC => npcMarkerPrefab,
                _ => settlementMarkerPrefab
            };

            if (prefab == null)
            {
                // Fallback: create a simple colored rect marker
                var go = new GameObject($"Marker_{marker.id}");
                go.transform.SetParent(markerContainer, false);

                var rt = go.AddComponent<RectTransform>();
                float size = marker.markerType == MapMarkerType.Settlement
                    ? MARKER_SIZE * 1.5f
                    : MARKER_SIZE;
                rt.sizeDelta = new Vector2(size, size);

                var img = go.AddComponent<Image>();
                img.color = marker.color;

                // Add label for settlements
                if (marker.markerType == MapMarkerType.Settlement && !string.IsNullOrEmpty(marker.label))
                {
                    var labelGo = new GameObject("Label");
                    labelGo.transform.SetParent(go.transform, false);
                    var labelRt = labelGo.AddComponent<RectTransform>();
                    labelRt.anchoredPosition = new Vector2(0f, -size * 0.5f - 10f);
                    labelRt.sizeDelta = new Vector2(120f, 20f);
                    var tmp = labelGo.AddComponent<TextMeshProUGUI>();
                    tmp.text = marker.label;
                    tmp.fontSize = 12f;
                    tmp.alignment = TextAlignmentOptions.Center;
                    tmp.color = Color.white;
                }

                _markerObjects[marker.id] = go;
                return;
            }

            var instance = Instantiate(prefab, markerContainer);
            instance.name = $"Marker_{marker.id}";

            var instanceImg = instance.GetComponent<Image>();
            if (instanceImg != null)
                instanceImg.color = marker.color;

            var instanceLabel = instance.GetComponentInChildren<TextMeshProUGUI>();
            if (instanceLabel != null && !string.IsNullOrEmpty(marker.label))
                instanceLabel.text = marker.label;

            _markerObjects[marker.id] = instance;
        }

        private void UpdateMarkerPositions()
        {
            for (int i = 0; i < _markers.Count; i++)
            {
                var marker = _markers[i];
                if (!_markerObjects.TryGetValue(marker.id, out var obj)) continue;

                var rt = obj.GetComponent<RectTransform>();
                if (rt != null)
                    rt.anchoredPosition = WorldToMap(marker.worldPosition);
            }
        }

        private void UpdatePlayerArrow()
        {
            if (playerArrow == null) return;

            playerArrow.anchoredPosition = WorldToMap(_playerPosition);
            playerArrow.localRotation = Quaternion.Euler(0f, 0f, -_playerRotation);
            playerArrow.sizeDelta = new Vector2(PLAYER_ARROW_SIZE, PLAYER_ARROW_SIZE);
        }

        private void UpdateLegend()
        {
            if (legendText != null)
                legendText.text = $"Zoom: {CurrentZoom:F1}x  |  Scroll to zoom  |  Drag to pan  |  {toggleKey} to close";
        }

        // ── Terrain color mapping ──

        private static Color ElevationToColor(float elevation)
        {
            // Water
            if (elevation <= 0.02f)
                return new Color(40f / 255f, 80f / 255f, 120f / 255f);

            // Lowland (0.02 - 0.25)
            if (elevation <= 0.25f)
            {
                float t = (elevation - 0.02f) / 0.23f;
                return Color.Lerp(
                    new Color(35f / 255f, 100f / 255f, 30f / 255f),
                    new Color(50f / 255f, 128f / 255f, 38f / 255f),
                    t);
            }

            // Midland (0.25 - 0.55)
            if (elevation <= 0.55f)
            {
                float t = (elevation - 0.25f) / 0.30f;
                return Color.Lerp(
                    new Color(50f / 255f, 128f / 255f, 38f / 255f),
                    new Color(90f / 255f, 110f / 255f, 80f / 255f),
                    t);
            }

            // Highland (0.55 - 0.80)
            if (elevation <= 0.80f)
            {
                float t = (elevation - 0.55f) / 0.25f;
                return Color.Lerp(
                    new Color(90f / 255f, 110f / 255f, 80f / 255f),
                    new Color(160f / 255f, 160f / 255f, 155f / 255f),
                    t);
            }

            // Alpine (0.80 - 1.0)
            float tAlpine = (elevation - 0.80f) / 0.20f;
            return Color.Lerp(
                new Color(160f / 255f, 160f / 255f, 155f / 255f),
                new Color(220f / 255f, 220f / 255f, 225f / 255f),
                tAlpine);
        }

        private void OnDestroy()
        {
            if (_terrainTexture != null)
                Destroy(_terrainTexture);
        }
    }
}
