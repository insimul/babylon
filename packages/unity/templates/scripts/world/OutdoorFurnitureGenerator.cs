using UnityEngine;
using TMPro;
using System.Collections.Generic;
using Insimul.Data;

namespace Insimul.World
{
    /// <summary>
    /// Places decorative outdoor furniture (benches, market stalls, wells, signs, barrels)
    /// near buildings and in settlement spaces. Called from InsimulGameManager.
    /// </summary>
    public class OutdoorFurnitureGenerator : MonoBehaviour
    {
        private Dictionary<string, Material> _matCache = new();
        private Transform _root;

        public void Generate(InsimulWorldIR worldData)
        {
            if (worldData?.geography?.settlements == null) return;
            _root = new GameObject("OutdoorFurniture").transform;

            foreach (var settlement in worldData.geography.settlements)
            {
                int seed = settlement.id?.GetHashCode() ?? 0;
                var rng = new System.Random(seed);
                var buildings = GatherBuildings(worldData, settlement.id);
                var center = settlement.position != null
                    ? new Vector3(settlement.position.x, 0, settlement.position.z)
                    : Vector3.zero;

                PlaceBenches(buildings, rng, center, 2 + rng.Next(3));
                PlaceMarketStalls(buildings, rng, 1 + rng.Next(3));
                PlaceWell(center, rng);
                PlaceStreetSigns(settlement, rng, 1 + rng.Next(2));
                PlaceBarrelGroups(buildings, rng, 1 + rng.Next(3));
            }

            Debug.Log($"[OutdoorFurniture] Generated furniture under {_root.childCount} objects");
        }

        private List<InsimulBuildingData> GatherBuildings(InsimulWorldIR wd, string settlementId)
        {
            var list = new List<InsimulBuildingData>();
            if (wd.entities?.buildings == null) return list;
            foreach (var b in wd.entities.buildings)
                if (b.settlementId == settlementId) list.Add(b);
            return list;
        }

        private Vector3 BldgPos(InsimulBuildingData b) =>
            new Vector3(b.position.x, 0, b.position.z);

        private float GroundY(Vector3 p)
        {
            if (Physics.Raycast(new Vector3(p.x, 100f, p.z), Vector3.down, out var hit, 200f))
                return hit.point.y;
            return 0f;
        }

        private bool TooCloseToBuilding(Vector3 pos, List<InsimulBuildingData> buildings, float minDist = 3f)
        {
            foreach (var b in buildings)
                if (Vector3.Distance(pos, BldgPos(b)) < minDist) return true;
            return false;
        }

        private Vector3 OffsetFromBuilding(InsimulBuildingData b, System.Random rng)
        {
            float angle = (float)(rng.NextDouble() * Mathf.PI * 2);
            float dist = 3f + (float)(rng.NextDouble() * 2f);
            var p = BldgPos(b) + new Vector3(Mathf.Cos(angle) * dist, 0, Mathf.Sin(angle) * dist);
            p.y = GroundY(p);
            return p;
        }

        // ── Benches ──────────────────────────────────────────────────────────

        private void PlaceBenches(List<InsimulBuildingData> buildings, System.Random rng, int count)
        {
            var wood = GetMat("bench_wood", new Color(0.45f, 0.32f, 0.18f));
            for (int i = 0; i < count && i < buildings.Count; i++)
            {
                var pos = OffsetFromBuilding(buildings[i], rng);
                if (TooCloseToBuilding(pos, buildings)) continue;
                float yaw = (float)(rng.NextDouble() * 360);

                var bench = new GameObject("Bench");
                bench.transform.SetParent(_root);
                bench.transform.position = pos;
                bench.transform.rotation = Quaternion.Euler(0, yaw, 0);
                bench.isStatic = true;

                AddBox(bench.transform, new Vector3(0, 0.4f, 0), new Vector3(1.5f, 0.08f, 0.5f), wood);
                AddBox(bench.transform, new Vector3(0, 0.7f, -0.22f), new Vector3(1.5f, 0.6f, 0.08f), wood);
                float[] lx = { -0.6f, -0.2f, 0.2f, 0.6f };
                foreach (float x in lx)
                    AddCylinder(bench.transform, new Vector3(x, 0.2f, 0), 0.03f, 0.4f, wood);

                bench.AddComponent<BoxCollider>().size = new Vector3(1.5f, 0.8f, 0.5f);
                bench.GetComponent<BoxCollider>().center = new Vector3(0, 0.4f, 0);
            }
        }

        // ── Market Stalls ────────────────────────────────────────────────────

        private void PlaceMarketStalls(List<InsimulBuildingData> buildings, System.Random rng, int count)
        {
            var wood = GetMat("stall_wood", new Color(0.45f, 0.32f, 0.18f));
            Color[] canvasColors = { Color.red, Color.blue, Color.green, Color.yellow };
            var shops = buildings.FindAll(b =>
                b.buildingRole != null && (b.buildingRole.Contains("shop") || b.buildingRole.Contains("market")));
            if (shops.Count == 0) shops = buildings;

            for (int i = 0; i < count && i < shops.Count; i++)
            {
                var pos = OffsetFromBuilding(shops[i], rng);
                if (TooCloseToBuilding(pos, buildings)) continue;
                var canvasMat = GetMat("canvas_" + i, canvasColors[rng.Next(canvasColors.Length)]);

                var stall = new GameObject("MarketStall");
                stall.transform.SetParent(_root);
                stall.transform.position = pos;
                stall.isStatic = true;

                float[] px = { -1.1f, 1.1f };
                float[] pz = { -0.6f, 0.6f };
                foreach (float x in px)
                    foreach (float z in pz)
                        AddCylinder(stall.transform, new Vector3(x, 1.25f, z), 0.05f, 2.5f, wood);

                AddBox(stall.transform, new Vector3(0, 2.5f, 0), new Vector3(2.5f, 0.05f, 1.5f), canvasMat);
                AddBox(stall.transform, new Vector3(0, 0.9f, 0.6f), new Vector3(2.5f, 0.9f, 0.1f), wood);

                stall.AddComponent<BoxCollider>().size = new Vector3(2.5f, 2.5f, 1.5f);
                stall.GetComponent<BoxCollider>().center = new Vector3(0, 1.25f, 0);
            }
        }

        // ── Well ─────────────────────────────────────────────────────────────

        private void PlaceWell(Vector3 center, System.Random rng)
        {
            var stone = GetMat("well_stone", new Color(0.5f, 0.48f, 0.45f));
            var wood = GetMat("well_wood", new Color(0.45f, 0.32f, 0.18f));

            center.y = GroundY(center);
            var well = new GameObject("Well");
            well.transform.SetParent(_root);
            well.transform.position = center;
            well.isStatic = true;

            AddCylinder(well.transform, new Vector3(0, 0.35f, 0), 0.5f, 0.7f, stone);
            AddCylinder(well.transform, new Vector3(-0.4f, 1.1f, 0), 0.05f, 1.5f, wood);
            AddCylinder(well.transform, new Vector3(0.4f, 1.1f, 0), 0.05f, 1.5f, wood);
            AddBox(well.transform, new Vector3(0, 1.85f, 0), new Vector3(0.9f, 0.06f, 0.06f), wood);
            AddCylinder(well.transform, new Vector3(0, 1.5f, 0), 0.08f, 0.15f, wood);

            well.AddComponent<CapsuleCollider>();
            var cc = well.GetComponent<CapsuleCollider>();
            cc.radius = 0.6f; cc.height = 1.9f; cc.center = new Vector3(0, 0.95f, 0);
        }

        // ── Street Signs ─────────────────────────────────────────────────────

        private void PlaceStreetSigns(InsimulSettlementData settlement, System.Random rng, int count)
        {
            var metal = GetMat("sign_metal", new Color(0.2f, 0.2f, 0.22f));
            var signWood = GetMat("sign_wood", new Color(0.7f, 0.6f, 0.45f));

            var streets = settlement.streets;
            if (streets == null || streets.Length == 0) return;

            for (int i = 0; i < count && i < streets.Length; i++)
            {
                var st = streets[i];
                if (st.waypoints == null || st.waypoints.Length == 0) continue;
                var wp = st.waypoints[0];
                var pos = new Vector3(wp.x, 0, wp.z);
                pos.y = GroundY(pos);

                var sign = new GameObject("StreetSign");
                sign.transform.SetParent(_root);
                sign.transform.position = pos;
                sign.isStatic = true;

                AddCylinder(sign.transform, new Vector3(0, 1.25f, 0), 0.04f, 2.5f, metal);
                var signBoard = AddBox(sign.transform, new Vector3(0, 2.3f, 0), new Vector3(0.8f, 0.4f, 0.05f), signWood);

                string label = !string.IsNullOrEmpty(st.name) ? st.name : settlement.name;
                var textGo = new GameObject("SignText");
                textGo.transform.SetParent(signBoard.transform, false);
                textGo.transform.localPosition = new Vector3(0, 0, -0.03f);
                var tmp = textGo.AddComponent<TextMeshPro>();
                tmp.text = label;
                tmp.fontSize = 2;
                tmp.alignment = TextAlignmentOptions.Center;
                tmp.color = new Color(0.15f, 0.1f, 0.08f);
                var trt = textGo.GetComponent<RectTransform>();
                trt.sizeDelta = new Vector2(0.75f, 0.35f);
            }
        }

        // ── Barrel Groups ────────────────────────────────────────────────────

        private void PlaceBarrelGroups(List<InsimulBuildingData> buildings, System.Random rng, int count)
        {
            var wood = GetMat("barrel_wood", new Color(0.35f, 0.25f, 0.15f));
            var taverns = buildings.FindAll(b =>
                b.buildingRole != null && (b.buildingRole.Contains("tavern") || b.buildingRole.Contains("warehouse")));
            if (taverns.Count == 0) taverns = buildings;

            for (int i = 0; i < count && i < taverns.Count; i++)
            {
                var pos = OffsetFromBuilding(taverns[i], rng);
                if (TooCloseToBuilding(pos, buildings)) continue;

                var group = new GameObject("BarrelGroup");
                group.transform.SetParent(_root);
                group.transform.position = pos;
                group.isStatic = true;

                int barrelCount = 2 + rng.Next(3);
                for (int b = 0; b < barrelCount; b++)
                {
                    float ox = (float)(rng.NextDouble() - 0.5) * 0.6f;
                    float oz = (float)(rng.NextDouble() - 0.5) * 0.6f;
                    AddCylinder(group.transform, new Vector3(ox, 0.35f, oz), 0.25f, 0.7f, wood);
                }

                group.AddComponent<BoxCollider>().size = new Vector3(1f, 0.7f, 1f);
                group.GetComponent<BoxCollider>().center = new Vector3(0, 0.35f, 0);
            }
        }

        // ── Primitive Helpers ────────────────────────────────────────────────

        private GameObject AddBox(Transform parent, Vector3 localPos, Vector3 size, Material mat)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localScale = size;
            go.GetComponent<Renderer>().sharedMaterial = mat;
            Object.Destroy(go.GetComponent<Collider>());
            go.isStatic = true;
            return go;
        }

        private GameObject AddCylinder(Transform parent, Vector3 localPos, float radius, float height, Material mat)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localScale = new Vector3(radius * 2, height * 0.5f, radius * 2);
            go.GetComponent<Renderer>().sharedMaterial = mat;
            Object.Destroy(go.GetComponent<Collider>());
            go.isStatic = true;
            return go;
        }

        private Material GetMat(string key, Color color)
        {
            if (_matCache.TryGetValue(key, out var m)) return m;
            var mat = new Material(Shader.Find("Standard"));
            mat.color = color;
            mat.SetFloat("_Glossiness", 0.15f);
            _matCache[key] = mat;
            return mat;
        }
    }
}
