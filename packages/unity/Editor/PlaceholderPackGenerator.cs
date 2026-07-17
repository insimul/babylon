// PlaceholderPackGenerator.cs — editor-time generator for the bundled CC0
// placeholder asset pack (US-UB2).
//
// Walks PlaceholderPack.Specs (the pure, UnityEngine-free recipe) and, for each
// spec, builds a primitive-based prefab (a box/capsule/cylinder/sphere/quad with
// an archetype-labeled flat material) and wires it into a pre-wired
// InsimulBindingTable (sourceKind = Placeholder). The result is a placeholder
// tier that makes ANY imported world instantiable out of the box.
//
// Determinism: generation order + names + colors come entirely from
// PlaceholderPack.Specs (ordinally sorted), and the table's assetGuid for each
// entry is derived from Unity's own import of the just-written prefab. Re-running
// overwrites in place (no accumulation), so the same specs produce the same pack.
//
// No binary blobs are committed: the primitives are built procedurally from
// Unity's built-in primitive meshes + a single shared shader, and the generated
// prefabs/materials land under Runtime/Binding/Placeholder/Generated/ at editor
// time (that folder is produced on demand, not checked in). Licensing note lives
// beside this pack folder (Runtime/Binding/Placeholder/LICENSE.md — all original/CC0).
//
// This file references UnityEditor, so it lives OUTSIDE Runtime/ and is verified
// by the structural syntax gate only (the pure PlaceholderPack + its coverage
// test carry the real assertions).

#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.IO;
using Insimul.Binding;
using UnityEditor;
using UnityEngine;

namespace Insimul.Editor
{
    /// <summary>Generates the primitive placeholder prefabs + the pre-wired
    /// placeholder InsimulBindingTable. Menu: Insimul ▸ Generate Placeholder Pack.</summary>
    public static class PlaceholderPackGenerator
    {
        // Package-relative pack root. Matched as a path substring so it works both
        // in-package (Packages/com.insimul.sdk/…) and embedded under Assets/.
        private const string PackMarker = "Runtime/Binding/Placeholder";
        private const string GeneratedSub = "Generated";
        private const string TableAssetName = "PlaceholderBindingTable.asset";

        [MenuItem("Insimul/Generate Placeholder Pack")]
        public static void GenerateFromMenu()
        {
            var table = Generate();
            if (table != null)
                EditorGUIUtility.PingObject(table);
        }

        /// <summary>Build every placeholder prefab + the pre-wired table. Returns the
        /// generated table asset, or null if the pack folder can't be located.</summary>
        public static InsimulBindingTable Generate()
        {
            string packDir = LocatePackDir();
            if (packDir == null)
            {
                Debug.LogError($"[Insimul] Placeholder pack folder not found (looked for a path containing '{PackMarker}').");
                return null;
            }

            string generatedDir = Path.Combine(packDir, GeneratedSub);
            if (!AssetDatabase.IsValidFolder(generatedDir))
                AssetDatabase.CreateFolder(packDir, GeneratedSub);

            Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");

            var table = ScriptableObject.CreateInstance<InsimulBindingTable>();
            table.sourceKind = BindingSourceKind.Placeholder;
            table.entries = new List<InsimulBindingTable.Entry>();

            // Specs are already ordinally sorted → deterministic generation order.
            foreach (var spec in PlaceholderPack.Specs)
            {
                string prefabPath = BuildPrefab(spec, generatedDir, shader);
                string guid = AssetDatabase.AssetPathToGUID(prefabPath);
                var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);

                table.entries.Add(new InsimulBindingTable.Entry
                {
                    archetypeKey = spec.Pattern,
                    prefab = prefab,
                    assetGuid = guid,
                    scale = ToVec3(spec.Scale),
                    footprintAlign = spec.FootprintAlign,
                    tags = new List<string>(spec.Tags),
                });
            }

            table.SortEntries();

            string tablePath = Path.Combine(packDir, TableAssetName).Replace('\\', '/');
            AssetDatabase.CreateAsset(table, tablePath);
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();

            Debug.Log($"[Insimul] Generated {table.entries.Count} placeholder prefabs + {TableAssetName} under {packDir}.");
            return table;
        }

        // Build one primitive prefab for a spec, overwriting in place. Returns the
        // project-relative asset path of the prefab.
        private static string BuildPrefab(PlaceholderSpec spec, string generatedDir, Shader shader)
        {
            string safe = SafeName(spec.Pattern);
            var go = BuildPrimitive(spec.Primitive);
            go.name = "PH_" + safe;

            var renderer = go.GetComponent<Renderer>();
            if (renderer != null)
            {
                var mat = new Material(shader) { name = "PH_" + safe };
                mat.color = new Color(spec.Color.X, spec.Color.Y, spec.Color.Z, 1f);
                string matPath = Path.Combine(generatedDir, "PH_" + safe + ".mat").Replace('\\', '/');
                AssetDatabase.CreateAsset(mat, matPath);
                renderer.sharedMaterial = mat;
            }

            string prefabPath = Path.Combine(generatedDir, "PH_" + safe + ".prefab").Replace('\\', '/');
            PrefabUtility.SaveAsPrefabAsset(go, prefabPath);
            UnityEngine.Object.DestroyImmediate(go);
            return prefabPath;
        }

        private static GameObject BuildPrimitive(PlaceholderPrimitive primitive)
        {
            switch (primitive)
            {
                case PlaceholderPrimitive.Capsule: return GameObject.CreatePrimitive(PrimitiveType.Capsule);
                case PlaceholderPrimitive.Cylinder: return GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                case PlaceholderPrimitive.Sphere: return GameObject.CreatePrimitive(PrimitiveType.Sphere);
                case PlaceholderPrimitive.Quad: return GameObject.CreatePrimitive(PrimitiveType.Quad);
                default: return GameObject.CreatePrimitive(PrimitiveType.Cube);
            }
        }

        // "building.commercial.*" -> "building_commercial", "terrain.texture.grass"
        // -> "terrain_texture_grass". Wildcard + illegal chars dropped/folded.
        private static string SafeName(string pattern)
        {
            var chars = new char[pattern.Length];
            int n = 0;
            foreach (char c in pattern)
            {
                if (c == '*') continue;
                if (c == '.' || c == '-') chars[n++] = '_';
                else if (c == '_' || char.IsLetterOrDigit(c)) chars[n++] = c;
            }
            string s = new string(chars, 0, n).Trim('_');
            return s.Length == 0 ? "root" : s;
        }

        private static Vector3 ToVec3(BindingVec3 v) => new Vector3(v.X, v.Y, v.Z);

        // Locate the pack folder by scanning the AssetDatabase for a folder whose
        // path contains PackMarker (works in-package or embedded under Assets/).
        private static string LocatePackDir()
        {
            foreach (string guid in AssetDatabase.FindAssets("t:DefaultAsset"))
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                if (AssetDatabase.IsValidFolder(path) &&
                    path.Replace('\\', '/').EndsWith(PackMarker, StringComparison.Ordinal))
                {
                    return path;
                }
            }
            return null;
        }
    }
}
#endif
