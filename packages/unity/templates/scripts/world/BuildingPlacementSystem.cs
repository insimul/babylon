using UnityEngine;
using System.Collections.Generic;
using Insimul.Data;

namespace Insimul.World
{
    /// <summary>
    /// Places buildings along streets with proper facing and collision avoidance.
    /// Matches shared/game-engine/rendering/BuildingPlacementSystem.ts and StreetAlignedPlacement.ts.
    /// Supports BuildingScaleByZone.ts zone-based scaling.
    /// </summary>
    public class BuildingPlacementSystem : MonoBehaviour
    {
        public enum BuildingZone
        {
            Downtown,
            Commercial,
            Residential,
            Industrial,
            Outskirts
        }

        public const float LOT_SPACING = 20f;

        [Header("Placement")]
        [Tooltip("Minimum distance between buildings")]
        public float minBuildingGap = 2f;
        [Tooltip("Distance from road center to building front")]
        public float roadSetback = 4f;

        [Header("Zone Scale Multipliers")]
        public float downtownScale = 1.3f;
        public float commercialScale = 1.15f;
        public float residentialScale = 1.0f;
        public float industrialScale = 1.1f;
        public float outskirtsScale = 0.85f;

        private List<Bounds> _placedBounds = new List<Bounds>();

        /// <summary>
        /// Place a building at a lot position, aligned to the nearest street.
        /// Returns the placed GameObject or null if placement failed.
        /// </summary>
        public GameObject PlaceBuilding(GameObject buildingObj, InsimulBuildingData buildingData,
            InsimulLotData lot, List<InsimulStreetSegment> streets)
        {
            Vector3 position = new Vector3(lot.position.x, lot.position.y, lot.position.z);
            float facing = lot.facingAngle;

            // If lot has a street reference, align to it
            if (!string.IsNullOrEmpty(lot.streetName) && streets != null)
            {
                Vector3 streetDir = GetNearestStreetDirection(position, streets);
                if (streetDir != Vector3.zero)
                {
                    facing = Mathf.Atan2(streetDir.x, streetDir.z) * Mathf.Rad2Deg + 90f;
                    // Offset from road center
                    Vector3 perpendicular = new Vector3(-streetDir.z, 0, streetDir.x);
                    position += perpendicular * roadSetback;
                }
            }

            // Scale by zone
            float scale = GetZoneScale(buildingData, position);

            // Check collision
            Vector3 size = new Vector3(
                buildingData.width * scale + minBuildingGap,
                buildingData.floors * 3f * scale,
                buildingData.depth * scale + minBuildingGap
            );
            Bounds newBounds = new Bounds(position + Vector3.up * size.y * 0.5f, size);

            if (CheckCollision(newBounds))
                return null;

            _placedBounds.Add(newBounds);

            // Apply transform
            buildingObj.transform.position = position;
            buildingObj.transform.rotation = Quaternion.Euler(0, facing, 0);
            buildingObj.transform.localScale = Vector3.one * scale;

            return buildingObj;
        }

        /// <summary>
        /// Place a building using lot data from the IR (pre-computed position and facing).
        /// </summary>
        public GameObject PlaceBuildingFromIR(GameObject buildingObj, InsimulBuildingData buildingData)
        {
            Vector3 position = new Vector3(
                buildingData.position.x,
                buildingData.position.y,
                buildingData.position.z
            );
            float rotation = buildingData.rotation * Mathf.Rad2Deg;

            float scale = GetZoneScale(buildingData, position);

            Vector3 size = new Vector3(
                buildingData.width * scale + minBuildingGap,
                buildingData.floors * 3f * scale,
                buildingData.depth * scale + minBuildingGap
            );
            Bounds newBounds = new Bounds(position + Vector3.up * size.y * 0.5f, size);

            if (CheckCollision(newBounds))
                return null;

            _placedBounds.Add(newBounds);

            buildingObj.transform.position = position;
            buildingObj.transform.rotation = Quaternion.Euler(0, rotation, 0);
            buildingObj.transform.localScale = Vector3.one * scale;

            return buildingObj;
        }

        private float GetZoneScale(InsimulBuildingData data, Vector3 position)
        {
            BuildingZone zone = ClassifyZone(data);

            switch (zone)
            {
                case BuildingZone.Downtown:    return downtownScale;
                case BuildingZone.Commercial:  return commercialScale;
                case BuildingZone.Industrial:  return industrialScale;
                case BuildingZone.Outskirts:   return outskirtsScale;
                default:                       return residentialScale;
            }
        }

        private BuildingZone ClassifyZone(InsimulBuildingData data)
        {
            string role = (data.buildingRole ?? "").ToLower();

            if (role == "townhall" || role == "bank" || role == "hotel" || role == "theater")
                return BuildingZone.Downtown;
            if (role.Contains("shop") || role.Contains("store") || role == "restaurant" || role == "bar" ||
                role == "bakery" || role == "market")
                return BuildingZone.Commercial;
            if (role == "factory" || role == "warehouse" || role == "mine" || role == "lumbermill")
                return BuildingZone.Industrial;
            if (role == "farm" || role == "cottage")
                return BuildingZone.Outskirts;

            return BuildingZone.Residential;
        }

        private bool CheckCollision(Bounds newBounds)
        {
            for (int i = 0; i < _placedBounds.Count; i++)
            {
                if (_placedBounds[i].Intersects(newBounds))
                    return true;
            }
            return false;
        }

        private Vector3 GetNearestStreetDirection(Vector3 pos, List<InsimulStreetSegment> streets)
        {
            float bestDist = float.MaxValue;
            Vector3 bestDir = Vector3.zero;

            for (int i = 0; i < streets.Count; i++)
            {
                var seg = streets[i];
                if (seg.waypoints == null || seg.waypoints.Length < 2) continue;

                for (int j = 0; j < seg.waypoints.Length - 1; j++)
                {
                    Vector3 a = seg.waypoints[j];
                    Vector3 b = seg.waypoints[j + 1];
                    Vector3 closest = ClosestPointOnSegment(pos, a, b);
                    float dist = Vector3.Distance(pos, closest);
                    if (dist < bestDist)
                    {
                        bestDist = dist;
                        bestDir = (b - a).normalized;
                    }
                }
            }

            return bestDir;
        }

        private static Vector3 ClosestPointOnSegment(Vector3 p, Vector3 a, Vector3 b)
        {
            Vector3 ab = b - a;
            float t = Mathf.Clamp01(Vector3.Dot(p - a, ab) / Vector3.Dot(ab, ab));
            return a + ab * t;
        }

        /// <summary>Clear all tracked bounds for a new settlement pass.</summary>
        public void ClearPlacedBounds()
        {
            _placedBounds.Clear();
        }

        /// <summary>Number of successfully placed buildings.</summary>
        public int PlacedCount => _placedBounds.Count;
    }
}
