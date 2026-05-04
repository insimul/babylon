using System.Collections.Generic;
using UnityEngine;

namespace Insimul.World
{
    public static class TerrainFoundationRenderer
    {
        private enum FoundationType { None, Raised, Stilted, Terraced }

        private static readonly Dictionary<string, Material> _materialCache = new Dictionary<string, Material>();

        public static void GenerateFoundation(GameObject buildingRoot, float width, float depth, float buildingBaseY)
        {
            Vector3 pos = buildingRoot.transform.position;
            Quaternion rot = buildingRoot.transform.rotation;
            float hw = width * 0.5f;
            float hd = depth * 0.5f;

            Vector3[] localCorners = {
                new Vector3(-hw, 0, -hd),
                new Vector3( hw, 0, -hd),
                new Vector3( hw, 0,  hd),
                new Vector3(-hw, 0,  hd)
            };

            float[] heights = new float[4];
            float minH = float.MaxValue, maxH = float.MinValue;
            for (int i = 0; i < 4; i++)
            {
                Vector3 world = pos + rot * localCorners[i];
                heights[i] = SampleTerrainHeight(world.x, world.z);
                if (heights[i] < minH) minH = heights[i];
                if (heights[i] > maxH) maxH = heights[i];
            }

            float delta = maxH - minH;
            float gap = buildingBaseY - maxH;
            FoundationType type = Classify(gap, delta);

            if (type == FoundationType.None) return;

            switch (type)
            {
                case FoundationType.Raised:
                    BuildRaisedFoundation(buildingRoot, width, depth, buildingBaseY, minH);
                    break;
                case FoundationType.Stilted:
                    BuildStiltedFoundation(buildingRoot, localCorners, heights, buildingBaseY);
                    break;
                case FoundationType.Terraced:
                    BuildTerracedFoundation(buildingRoot, width, depth, buildingBaseY, minH);
                    break;
            }
        }

        private static float SampleTerrainHeight(float worldX, float worldZ)
        {
            Ray ray = new Ray(new Vector3(worldX, 200f, worldZ), Vector3.down);
            if (Physics.Raycast(ray, out RaycastHit hit, 400f))
                return hit.point.y;
            return 0f;
        }

        private static FoundationType Classify(float gap, float delta)
        {
            if (gap < 0.3f && delta < 0.3f) return FoundationType.None;
            if (gap < 1.5f) return FoundationType.Raised;
            if (gap < 3.0f) return FoundationType.Stilted;
            return FoundationType.Terraced;
        }

        // --- Raised: single box fill from min terrain to building base ---
        private static void BuildRaisedFoundation(GameObject root, float w, float d, float baseY, float minH)
        {
            float h = baseY - minH;
            GameObject fill = GameObject.CreatePrimitive(PrimitiveType.Cube);
            fill.name = "Foundation_Raised";
            fill.transform.SetParent(root.transform, false);
            fill.transform.localPosition = new Vector3(0, -(h * 0.5f), 0);
            fill.transform.localScale = new Vector3(w, h, d);
            fill.GetComponent<Renderer>().sharedMaterial = GetMaterial("stone", new Color(0.5f, 0.48f, 0.45f));
            fill.isStatic = true;
        }

        // --- Stilted: corner posts + cross beams ---
        private static void BuildStiltedFoundation(GameObject root, Vector3[] corners, float[] heights, float baseY)
        {
            Material postMat = GetMaterial("wood", new Color(0.4f, 0.28f, 0.18f));
            Material beamMat = GetMaterial("wood_dark", new Color(0.32f, 0.22f, 0.14f));

            for (int i = 0; i < 4; i++)
            {
                float h = baseY - heights[i];
                if (h < 0.05f) continue;

                GameObject post = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                post.name = $"Foundation_Post_{i}";
                post.transform.SetParent(root.transform, false);
                post.transform.localPosition = corners[i] + new Vector3(0, -(h * 0.5f), 0);
                post.transform.localScale = new Vector3(0.3f, h * 0.5f, 0.3f);
                post.GetComponent<Renderer>().sharedMaterial = postMat;
                post.isStatic = true;
                Object.Destroy(post.GetComponent<Collider>());
            }

            // Cross beams connecting front pair and back pair
            AddBeam(root, corners[0], corners[1], heights[0], heights[1], baseY, beamMat);
            AddBeam(root, corners[3], corners[2], heights[3], heights[2], baseY, beamMat);
        }

        private static void AddBeam(GameObject root, Vector3 a, Vector3 b, float hA, float hB, float baseY, Material mat)
        {
            float beamY = baseY - 0.2f;
            Vector3 mid = (a + b) * 0.5f;
            float length = Vector3.Distance(a, b);
            mid.y = beamY - baseY; // local offset

            GameObject beam = GameObject.CreatePrimitive(PrimitiveType.Cube);
            beam.name = "Foundation_Beam";
            beam.transform.SetParent(root.transform, false);
            beam.transform.localPosition = mid;
            beam.transform.localScale = new Vector3(length, 0.15f, 0.15f);
            beam.GetComponent<Renderer>().sharedMaterial = mat;
            beam.isStatic = true;
            Object.Destroy(beam.GetComponent<Collider>());
        }

        // --- Terraced: retaining wall + fill platform ---
        private static void BuildTerracedFoundation(GameObject root, float w, float d, float baseY, float minH)
        {
            Material mat = GetMaterial("stone_retaining", new Color(0.45f, 0.42f, 0.38f));
            float wallH = baseY - minH;

            // Retaining wall on the lowest side (back-center, full width)
            GameObject wall = GameObject.CreatePrimitive(PrimitiveType.Cube);
            wall.name = "Foundation_RetainingWall";
            wall.transform.SetParent(root.transform, false);
            wall.transform.localPosition = new Vector3(0, -(wallH * 0.5f), -(d * 0.5f));
            wall.transform.localScale = new Vector3(w + 0.2f, wallH, 0.3f);
            wall.GetComponent<Renderer>().sharedMaterial = mat;
            wall.isStatic = true;

            // Fill platform at building base level
            GameObject fill = GameObject.CreatePrimitive(PrimitiveType.Cube);
            fill.name = "Foundation_Fill";
            fill.transform.SetParent(root.transform, false);
            fill.transform.localPosition = new Vector3(0, -0.15f, 0);
            fill.transform.localScale = new Vector3(w, 0.3f, d);
            fill.GetComponent<Renderer>().sharedMaterial = mat;
            fill.isStatic = true;
        }

        // --- Material cache ---
        private static Material GetMaterial(string key, Color color)
        {
            if (_materialCache.TryGetValue(key, out Material cached))
                return cached;

            Material mat = new Material(Shader.Find("Standard"));
            mat.color = color;
            mat.SetFloat("_Glossiness", 0.1f);
            mat.name = $"Foundation_{key}";
            _materialCache[key] = mat;
            return mat;
        }
    }
}
