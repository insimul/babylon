using UnityEngine;
using System.Collections.Generic;
using Insimul.Data;

namespace Insimul.World
{
    /// <summary>
    /// Generates central gathering areas for settlements.
    /// Matches shared/game-engine/rendering/TownSquareGenerator.ts.
    /// Creates ground planes, decorative props (fountains, benches, market stalls),
    /// and street network connection points.
    /// </summary>
    public class TownSquareGenerator : MonoBehaviour
    {
        [Header("Square Settings")]
        public float defaultSquareSize = 20f;
        public float propDensity = 0.6f;

        private Dictionary<string, Material> _materialCache = new Dictionary<string, Material>();

        /// <summary>
        /// Generate a town square at the center of a settlement.
        /// </summary>
        public GameObject GenerateTownSquare(Vector3 center, float radius, string settlementType, Transform parent)
        {
            float squareSize = Mathf.Min(defaultSquareSize, radius * 0.4f);

            GameObject root = new GameObject("TownSquare");
            root.transform.SetParent(parent, false);
            root.transform.position = center;

            // Ground plane
            CreateGroundPlane(root.transform, squareSize);

            // Decorative elements based on settlement type
            int seed = center.GetHashCode();
            System.Random rng = new System.Random(seed);

            PlaceFountain(root.transform, squareSize, rng);
            PlaceBenches(root.transform, squareSize, rng);

            string type = (settlementType ?? "town").ToLower();
            if (type.Contains("town") || type.Contains("city"))
            {
                PlaceMarketStalls(root.transform, squareSize, rng);
            }
            PlaceLampPosts(root.transform, squareSize, rng);

            // Static batching for performance
            StaticBatchingUtility.Combine(root);

            return root;
        }

        private void CreateGroundPlane(Transform parent, float size)
        {
            GameObject plane = GameObject.CreatePrimitive(PrimitiveType.Quad);
            plane.name = "SquareGround";
            plane.transform.SetParent(parent, false);
            plane.transform.localRotation = Quaternion.Euler(90, 0, 0);
            plane.transform.localScale = new Vector3(size, size, 1);
            plane.transform.localPosition = new Vector3(0, 0.02f, 0);

            var r = plane.GetComponent<Renderer>();
            r.material = GetOrCreateMaterial("town_square_ground",
                new Color(0.55f, 0.5f, 0.45f));

            plane.isStatic = true;
        }

        private void PlaceFountain(Transform parent, float size, System.Random rng)
        {
            GameObject fountain = new GameObject("Fountain");
            fountain.transform.SetParent(parent, false);

            // Base cylinder
            GameObject basin = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            basin.name = "Basin";
            basin.transform.SetParent(fountain.transform, false);
            basin.transform.localScale = new Vector3(3f, 0.4f, 3f);
            basin.transform.localPosition = Vector3.zero;
            basin.GetComponent<Renderer>().material = GetOrCreateMaterial("fountain_stone",
                new Color(0.65f, 0.63f, 0.6f));
            basin.isStatic = true;

            // Center pillar
            GameObject pillar = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            pillar.name = "Pillar";
            pillar.transform.SetParent(fountain.transform, false);
            pillar.transform.localScale = new Vector3(0.5f, 1.5f, 0.5f);
            pillar.transform.localPosition = new Vector3(0, 0.75f, 0);
            pillar.GetComponent<Renderer>().material = GetOrCreateMaterial("fountain_stone",
                new Color(0.65f, 0.63f, 0.6f));
            pillar.isStatic = true;

            // Water plane
            GameObject water = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            water.name = "Water";
            water.transform.SetParent(fountain.transform, false);
            water.transform.localScale = new Vector3(2.6f, 0.05f, 2.6f);
            water.transform.localPosition = new Vector3(0, 0.3f, 0);
            var waterMat = GetOrCreateMaterial("fountain_water",
                new Color(0.3f, 0.5f, 0.7f, 0.7f));
            waterMat.SetFloat("_Mode", 3); // Transparent
            waterMat.renderQueue = 3000;
            water.GetComponent<Renderer>().material = waterMat;
            water.isStatic = true;
        }

        private void PlaceBenches(Transform parent, float size, System.Random rng)
        {
            int count = Mathf.Max(2, Mathf.RoundToInt(size * 0.2f * propDensity));
            float margin = size * 0.35f;

            for (int i = 0; i < count; i++)
            {
                float angle = (i / (float)count) * Mathf.PI * 2f;
                float x = Mathf.Cos(angle) * margin;
                float z = Mathf.Sin(angle) * margin;

                GameObject bench = CreateBenchPrimitive();
                bench.transform.SetParent(parent, false);
                bench.transform.localPosition = new Vector3(x, 0, z);
                bench.transform.localRotation = Quaternion.Euler(0, -angle * Mathf.Rad2Deg + 90, 0);
            }
        }

        private void PlaceMarketStalls(Transform parent, float size, System.Random rng)
        {
            int count = Mathf.Max(1, Mathf.RoundToInt(size * 0.1f * propDensity));
            float margin = size * 0.3f;

            for (int i = 0; i < count; i++)
            {
                float offsetAngle = (i / (float)count) * Mathf.PI * 2f + Mathf.PI * 0.25f;
                float x = Mathf.Cos(offsetAngle) * margin;
                float z = Mathf.Sin(offsetAngle) * margin;

                GameObject stall = CreateMarketStallPrimitive();
                stall.transform.SetParent(parent, false);
                stall.transform.localPosition = new Vector3(x, 0, z);
                stall.transform.localRotation = Quaternion.Euler(0, -offsetAngle * Mathf.Rad2Deg, 0);
            }
        }

        private void PlaceLampPosts(Transform parent, float size, System.Random rng)
        {
            float margin = size * 0.4f;
            Vector3[] corners = new Vector3[]
            {
                new Vector3(-margin, 0, -margin),
                new Vector3(margin, 0, -margin),
                new Vector3(margin, 0, margin),
                new Vector3(-margin, 0, margin),
            };

            foreach (var pos in corners)
            {
                GameObject lamp = new GameObject("LampPost");
                lamp.transform.SetParent(parent, false);
                lamp.transform.localPosition = pos;
                lamp.tag = "StreetLight";

                // Pole
                GameObject pole = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                pole.name = "Pole";
                pole.transform.SetParent(lamp.transform, false);
                pole.transform.localScale = new Vector3(0.15f, 2.5f, 0.15f);
                pole.transform.localPosition = new Vector3(0, 2.5f, 0);
                pole.GetComponent<Renderer>().material = GetOrCreateMaterial("lamp_metal",
                    new Color(0.2f, 0.2f, 0.2f));
                pole.isStatic = true;

                // Light bulb
                GameObject bulb = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                bulb.name = "Bulb";
                bulb.transform.SetParent(lamp.transform, false);
                bulb.transform.localScale = new Vector3(0.4f, 0.4f, 0.4f);
                bulb.transform.localPosition = new Vector3(0, 5.2f, 0);
                var bulbMat = GetOrCreateMaterial("lamp_bulb",
                    new Color(1f, 0.95f, 0.8f));
                bulbMat.EnableKeyword("_EMISSION");
                bulbMat.SetColor("_EmissionColor", new Color(1f, 0.9f, 0.6f) * 2f);
                bulb.GetComponent<Renderer>().material = bulbMat;
                bulb.isStatic = true;

                // Point light
                GameObject lightObj = new GameObject("Light");
                lightObj.transform.SetParent(lamp.transform, false);
                lightObj.transform.localPosition = new Vector3(0, 5f, 0);
                var pointLight = lightObj.AddComponent<Light>();
                pointLight.type = LightType.Point;
                pointLight.color = new Color(1f, 0.9f, 0.7f);
                pointLight.intensity = 1.2f;
                pointLight.range = 12f;
                pointLight.enabled = false; // DayNightCycleManager toggles
            }
        }

        private GameObject CreateBenchPrimitive()
        {
            GameObject bench = new GameObject("Bench");

            // Seat
            GameObject seat = GameObject.CreatePrimitive(PrimitiveType.Cube);
            seat.name = "Seat";
            seat.transform.SetParent(bench.transform, false);
            seat.transform.localScale = new Vector3(1.8f, 0.1f, 0.5f);
            seat.transform.localPosition = new Vector3(0, 0.5f, 0);
            seat.GetComponent<Renderer>().material = GetOrCreateMaterial("bench_wood",
                new Color(0.45f, 0.3f, 0.15f));
            seat.isStatic = true;

            // Legs
            for (int i = 0; i < 2; i++)
            {
                float x = i == 0 ? -0.7f : 0.7f;
                GameObject leg = GameObject.CreatePrimitive(PrimitiveType.Cube);
                leg.name = $"Leg_{i}";
                leg.transform.SetParent(bench.transform, false);
                leg.transform.localScale = new Vector3(0.1f, 0.5f, 0.4f);
                leg.transform.localPosition = new Vector3(x, 0.25f, 0);
                leg.GetComponent<Renderer>().material = GetOrCreateMaterial("bench_wood",
                    new Color(0.45f, 0.3f, 0.15f));
                leg.isStatic = true;
            }

            // Back rest
            GameObject back = GameObject.CreatePrimitive(PrimitiveType.Cube);
            back.name = "Back";
            back.transform.SetParent(bench.transform, false);
            back.transform.localScale = new Vector3(1.8f, 0.6f, 0.08f);
            back.transform.localPosition = new Vector3(0, 0.85f, -0.2f);
            back.GetComponent<Renderer>().material = GetOrCreateMaterial("bench_wood",
                new Color(0.45f, 0.3f, 0.15f));
            back.isStatic = true;

            return bench;
        }

        private GameObject CreateMarketStallPrimitive()
        {
            GameObject stall = new GameObject("MarketStall");

            // Counter
            GameObject counter = GameObject.CreatePrimitive(PrimitiveType.Cube);
            counter.name = "Counter";
            counter.transform.SetParent(stall.transform, false);
            counter.transform.localScale = new Vector3(3f, 1f, 1.2f);
            counter.transform.localPosition = new Vector3(0, 0.5f, 0);
            counter.GetComponent<Renderer>().material = GetOrCreateMaterial("stall_wood",
                new Color(0.5f, 0.35f, 0.2f));
            counter.isStatic = true;

            // Canopy poles
            for (int i = 0; i < 2; i++)
            {
                float x = i == 0 ? -1.3f : 1.3f;
                GameObject pole = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                pole.name = $"Pole_{i}";
                pole.transform.SetParent(stall.transform, false);
                pole.transform.localScale = new Vector3(0.08f, 1.5f, 0.08f);
                pole.transform.localPosition = new Vector3(x, 2f, -0.5f);
                pole.GetComponent<Renderer>().material = GetOrCreateMaterial("stall_wood",
                    new Color(0.5f, 0.35f, 0.2f));
                pole.isStatic = true;
            }

            // Canopy
            GameObject canopy = GameObject.CreatePrimitive(PrimitiveType.Cube);
            canopy.name = "Canopy";
            canopy.transform.SetParent(stall.transform, false);
            canopy.transform.localScale = new Vector3(3.4f, 0.05f, 1.8f);
            canopy.transform.localPosition = new Vector3(0, 3.3f, 0);
            canopy.GetComponent<Renderer>().material = GetOrCreateMaterial("stall_canvas",
                new Color(0.7f, 0.2f, 0.15f));
            canopy.isStatic = true;

            return stall;
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
    }
}
