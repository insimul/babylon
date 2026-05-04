using System.Globalization;
using System.Collections.Generic;
using UnityEngine;
using TMPro;
using Insimul.Data;

namespace Insimul.World
{
    /// <summary>
    /// Generates and places signs on building facades showing business names.
    /// Matches shared/game-engine/rendering/BuildingSignManager.ts.
    /// Signs face the street with genre-appropriate backing geometry and
    /// TextMeshPro for dynamic text display.
    /// </summary>
    public class BuildingSignManager : MonoBehaviour
    {
        [Header("Sign Settings")]
        [Tooltip("World genre for sign style (medieval, cyberpunk, modern, etc.)")]
        public string worldGenre = "medieval";

        private Dictionary<string, Material> _materialCache = new Dictionary<string, Material>();

        /// <summary>Business name lookup by building ID (from BusinessIR data).</summary>
        private Dictionary<string, string> _businessNames = new Dictionary<string, string>();

        /// <summary>
        /// Register a business name for a building.
        /// </summary>
        public void RegisterBusinessName(string buildingId, string businessName)
        {
            if (!string.IsNullOrEmpty(buildingId) && !string.IsNullOrEmpty(businessName))
                _businessNames[buildingId] = businessName;
        }

        public void GenerateSigns(InsimulWorldIR worldData)
        {
            if (worldData?.entities?.buildings == null) return;

            int signCount = 0;
            foreach (var building in worldData.entities.buildings)
            {
                if (string.IsNullOrEmpty(building.buildingRole)) continue;

                GameObject parent = GameObject.Find($"Building_{building.id}");
                if (parent == null) continue;

                // Use business name if available, otherwise format the role
                string displayName;
                if (!string.IsNullOrEmpty(building.businessId) &&
                    _businessNames.TryGetValue(building.id, out string bizName))
                {
                    displayName = bizName;
                }
                else
                {
                    displayName = FormatRoleName(building.buildingRole);
                }

                float height = building.floors * 3f;

                // Create sign with backing geometry
                var signObj = CreateSign(building.id, displayName, height, parent.transform);
                signCount++;
            }

            Debug.Log($"[Insimul] BuildingSignManager: generated {signCount} signs");
        }

        private GameObject CreateSign(string buildingId, string displayName, float buildingHeight,
            Transform parent)
        {
            var signRoot = new GameObject($"Sign_{buildingId}");
            signRoot.transform.SetParent(parent, false);

            float signY = buildingHeight + 0.5f;
            float signWidth = Mathf.Max(2f, displayName.Length * 0.35f);
            float signHeight = 0.8f;

            // Backing geometry varies by genre
            GameObject backing = CreateSignBacking(signWidth, signHeight);
            backing.transform.SetParent(signRoot.transform, false);
            backing.transform.localPosition = new Vector3(0f, signY, parent.localScale.z * 0.5f + 0.1f);

            // Text
            var textObj = new GameObject("SignText");
            textObj.transform.SetParent(signRoot.transform, false);
            textObj.transform.localPosition = new Vector3(0f, signY, parent.localScale.z * 0.5f + 0.15f);
            textObj.transform.localScale = new Vector3(0.5f, 0.5f, 0.5f);

            var tmp = textObj.AddComponent<TextMeshPro>();
            tmp.text = displayName;
            tmp.fontSize = 5;
            tmp.alignment = TextAlignmentOptions.Center;
            tmp.color = GetTextColor();
            tmp.outlineWidth = 0.15f;
            tmp.outlineColor = new Color32(0, 0, 0, 180);

            signRoot.AddComponent<BillboardText>();

            return signRoot;
        }

        private GameObject CreateSignBacking(float width, float height)
        {
            string genre = (worldGenre ?? "").ToLower();
            GameObject backing = GameObject.CreatePrimitive(PrimitiveType.Cube);
            backing.name = "SignBacking";
            backing.transform.localScale = new Vector3(width + 0.4f, height + 0.2f, 0.08f);

            Material mat;
            if (genre.Contains("cyberpunk") || genre.Contains("sci-fi"))
            {
                // Neon frame style
                mat = GetOrCreateMaterial("sign_neon", new Color(0.1f, 0.1f, 0.15f));
                mat.EnableKeyword("_EMISSION");
                mat.SetColor("_EmissionColor", new Color(0.2f, 0.5f, 1f) * 0.5f);
            }
            else if (genre.Contains("modern"))
            {
                mat = GetOrCreateMaterial("sign_modern", new Color(0.85f, 0.85f, 0.85f));
            }
            else
            {
                // Medieval/default: wooden plank
                mat = GetOrCreateMaterial("sign_wood", new Color(0.4f, 0.28f, 0.15f));
            }

            backing.GetComponent<Renderer>().material = mat;
            backing.isStatic = true;
            Object.Destroy(backing.GetComponent<Collider>());

            return backing;
        }

        private Color GetTextColor()
        {
            string genre = (worldGenre ?? "").ToLower();
            if (genre.Contains("cyberpunk"))
                return new Color(0.4f, 0.9f, 1f);
            return new Color(0.95f, 0.9f, 0.8f);
        }

        private static string FormatRoleName(string role)
        {
            if (string.IsNullOrEmpty(role)) return role;
            string spaced = role.Replace('_', ' ');
            return CultureInfo.InvariantCulture.TextInfo.ToTitleCase(spaced);
        }

        private Material GetOrCreateMaterial(string key, Color color)
        {
            if (!_materialCache.TryGetValue(key, out Material mat))
            {
                mat = new Material(Shader.Find("Standard"));
                mat.color = color;
                _materialCache[key] = mat;
            }
            return mat;
        }

        public class BillboardText : MonoBehaviour
        {
            private void LateUpdate()
            {
                if (Camera.main != null)
                    transform.rotation = Quaternion.LookRotation(transform.position - Camera.main.transform.position);
            }
        }
    }
}
