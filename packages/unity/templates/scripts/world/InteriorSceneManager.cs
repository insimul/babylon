using UnityEngine;
using System.Collections.Generic;
using Insimul.Data;

namespace Insimul.World
{
    /// <summary>
    /// Manages interior scene loading and transitions.
    /// Matches shared/game-engine/rendering/InteriorSceneManager.ts.
    /// Handles both model-based and procedural interiors, disabling exterior
    /// rendering while inside a building.
    /// </summary>
    public class InteriorSceneManager : MonoBehaviour
    {
        public enum InteriorMode
        {
            None,
            Model,
            Procedural
        }

        [Header("Interior Placement")]
        [Tooltip("Y offset for interior scenes (placed high above the world)")]
        public float interiorYOffset = 500f;

        [Header("Transition")]
        public float fadeTime = 0.3f;

        /// <summary>Pre-built interior model paths by building type.</summary>
        private static readonly Dictionary<string, string[]> MODEL_INTERIORS = new Dictionary<string, string[]>
        {
            { "church", new[] { "Models/interiors/silent_hill_3_cathedral" } },
            { "residence", new[] {
                "Models/interiors/mansion_furnished",
                "Models/interiors/modern_apartment_interior",
                "Models/interiors/small_apartment_morning_version"
            }},
            { "restaurant", new[] {
                "Models/interiors/restaurant_1",
                "Models/interiors/restaurant_2",
                "Models/interiors/restaurant_3",
                "Models/interiors/restaurant_4",
                "Models/interiors/restaurant_5",
                "Models/interiors/restaurant_6",
                "Models/interiors/restaurant_7"
            }},
            { "shop", new[] {
                "Models/interiors/convenience_store_2",
                "Models/interiors/one_stop"
            }},
            { "tavern", new[] {
                "Models/interiors/british_pub",
                "Models/interiors/food_bar",
                "Models/interiors/old_bar",
                "Models/interiors/silent_hill_old_bar_2"
            }},
            { "bar", new[] {
                "Models/interiors/british_pub",
                "Models/interiors/old_bar"
            }},
            { "inn", new[] {
                "Models/interiors/british_pub",
                "Models/interiors/food_bar"
            }},
        };

        private string _currentBuildingId;
        private InteriorMode _currentMode = InteriorMode.None;
        private GameObject _currentInterior;
        private Vector3 _savedPlayerPosition;
        private Quaternion _savedPlayerRotation;

        private Dictionary<string, GameObject> _cachedInteriors = new Dictionary<string, GameObject>();
        private List<GameObject> _disabledExteriorRoots = new List<GameObject>();

        /// <summary>Currently inside a building?</summary>
        public bool IsInside => _currentMode != InteriorMode.None;

        /// <summary>ID of the building we are currently inside.</summary>
        public string CurrentBuildingId => _currentBuildingId;

        /// <summary>
        /// Enter a building by ID. Loads or generates interior and teleports player.
        /// </summary>
        public void EnterBuilding(string buildingId)
        {
            if (IsInside) return;

            // Find building data
            var loader = FindFirstObjectByType<Insimul.Core.InsimulDataLoader>();
            if (loader == null) return;

            var buildingData = FindBuildingData(buildingId);
            if (buildingData == null) return;

            _currentBuildingId = buildingId;

            // Save player state
            var player = GameObject.FindGameObjectWithTag("Player");
            if (player != null)
            {
                _savedPlayerPosition = player.transform.position;
                _savedPlayerRotation = player.transform.rotation;
            }

            // Determine interior mode
            string role = (buildingData.buildingRole ?? "").ToLower();
            InteriorMode mode = GetInteriorMode(role, buildingData.modelAssetKey);

            if (mode == InteriorMode.Model)
            {
                LoadModelInterior(buildingId, role);
            }
            else
            {
                GenerateProceduralInterior(buildingId, buildingData);
            }

            _currentMode = mode;

            // Disable exterior rendering
            DisableExterior();

            // Teleport player to interior
            if (player != null && _currentInterior != null)
            {
                Vector3 entryPoint = _currentInterior.transform.position + new Vector3(0, 0.5f, 2f);
                player.transform.position = entryPoint;
                player.transform.rotation = Quaternion.identity;
            }
        }

        /// <summary>
        /// Exit the current building and return to the exterior.
        /// </summary>
        public void ExitBuilding()
        {
            if (!IsInside) return;

            // Restore player position
            var player = GameObject.FindGameObjectWithTag("Player");
            if (player != null)
            {
                player.transform.position = _savedPlayerPosition;
                player.transform.rotation = _savedPlayerRotation;
            }

            // Hide interior
            if (_currentInterior != null)
                _currentInterior.SetActive(false);

            // Re-enable exterior
            EnableExterior();

            _currentMode = InteriorMode.None;
            _currentBuildingId = null;
        }

        private InteriorMode GetInteriorMode(string role, string modelAssetKey)
        {
            if (!string.IsNullOrEmpty(modelAssetKey))
                return InteriorMode.Model;

            if (MODEL_INTERIORS.ContainsKey(role))
                return InteriorMode.Model;

            return InteriorMode.Procedural;
        }

        private void LoadModelInterior(string buildingId, string role)
        {
            if (_cachedInteriors.TryGetValue(buildingId, out GameObject cached))
            {
                cached.SetActive(true);
                _currentInterior = cached;
                return;
            }

            string[] paths;
            if (!MODEL_INTERIORS.TryGetValue(role, out paths) || paths.Length == 0)
            {
                // Fallback to procedural
                _currentMode = InteriorMode.Procedural;
                return;
            }

            // Deterministic selection based on building ID hash
            int index = Mathf.Abs(buildingId.GetHashCode()) % paths.Length;
            string path = paths[index];

            GameObject prefab = Resources.Load<GameObject>(path);
            if (prefab != null)
            {
                _currentInterior = Instantiate(prefab);
                _currentInterior.name = $"Interior_{buildingId}";
                _currentInterior.transform.position = new Vector3(0, interiorYOffset, 0);
                _cachedInteriors[buildingId] = _currentInterior;
            }
            else
            {
                // Model not found; generate procedural
                var buildingData = FindBuildingData(buildingId);
                if (buildingData != null)
                    GenerateProceduralInterior(buildingId, buildingData);
            }
        }

        private void GenerateProceduralInterior(string buildingId, InsimulBuildingData data)
        {
            if (_cachedInteriors.TryGetValue(buildingId, out GameObject cached))
            {
                cached.SetActive(true);
                _currentInterior = cached;
                return;
            }

            var interiorGen = FindFirstObjectByType<BuildingInteriorGenerator>();
            if (interiorGen != null)
            {
                Vector3 interiorPos = new Vector3(0, interiorYOffset, 0);
                _currentInterior = interiorGen.GenerateInterior(
                    data.buildingRole, data.width, data.depth,
                    data.floors, interiorPos
                );
                if (_currentInterior != null)
                {
                    _currentInterior.name = $"Interior_{buildingId}";
                    _cachedInteriors[buildingId] = _currentInterior;
                }
            }
            _currentMode = InteriorMode.Procedural;
        }

        private void DisableExterior()
        {
            _disabledExteriorRoots.Clear();

            // Disable terrain, settlements, nature, roads
            string[] tags = { "Terrain", "Settlement", "Nature", "Road" };
            foreach (string tag in tags)
            {
                try
                {
                    foreach (var obj in GameObject.FindGameObjectsWithTag(tag))
                    {
                        if (obj.activeSelf)
                        {
                            obj.SetActive(false);
                            _disabledExteriorRoots.Add(obj);
                        }
                    }
                }
                catch { /* Tag may not exist */ }
            }

            // Disable directional light (interiors use their own lighting)
            var sun = RenderSettings.sun;
            if (sun != null)
            {
                sun.gameObject.SetActive(false);
                _disabledExteriorRoots.Add(sun.gameObject);
            }
        }

        private void EnableExterior()
        {
            foreach (var obj in _disabledExteriorRoots)
            {
                if (obj != null)
                    obj.SetActive(true);
            }
            _disabledExteriorRoots.Clear();
        }

        private InsimulBuildingData FindBuildingData(string buildingId)
        {
            // Search loaded building data
            var buildings = Resources.Load<TextAsset>("Data/buildings");
            if (buildings == null) return null;

            var list = JsonUtility.FromJson<InsimulBuildingDataList>(
                "{\"items\":" + buildings.text + "}");
            if (list?.items == null) return null;

            foreach (var b in list.items)
            {
                if (b.id == buildingId) return b;
            }
            return null;
        }

        [System.Serializable]
        private class InsimulBuildingDataList
        {
            public InsimulBuildingData[] items;
        }
    }
}
