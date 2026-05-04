using System;
using System.Collections.Generic;
using UnityEngine;
using Insimul.Data;

namespace Insimul.World
{
    /// <summary>
    /// Axis-aligned territory bounding box with cached center.
    /// </summary>
    [Serializable]
    public struct TerritoryBounds
    {
        public float minX;
        public float maxX;
        public float minZ;
        public float maxZ;
        public float centerX;
        public float centerZ;
    }

    /// <summary>
    /// A settlement placed within a state or country.
    /// </summary>
    [Serializable]
    public class ScaledSettlement
    {
        public string id;
        public string name;
        public string stateId;
        public string countryId;
        public Vector3 position;
        public float radius;
        public int population;
        public string settlementType;
    }

    /// <summary>
    /// A state region within a country.
    /// </summary>
    [Serializable]
    public class ScaledState
    {
        public string id;
        public string name;
        public string countryId;
        public TerritoryBounds bounds;
        public List<ScaledSettlement> settlements = new List<ScaledSettlement>();
        public string terrain;
    }

    /// <summary>
    /// A country containing states.
    /// </summary>
    [Serializable]
    public class ScaledCountry
    {
        public string id;
        public string name;
        public TerritoryBounds bounds;
        public List<ScaledState> states = new List<ScaledState>();
    }

    /// <summary>
    /// Lot metadata returned by street-aligned generation.
    /// </summary>
    [Serializable]
    public struct PlacedLot
    {
        public Vector3 position;
        public float facingAngle;
        public int houseNumber;
        public string streetName;
        public bool isCorner;
    }

    /// <summary>
    /// Street segment returned by street-aligned generation.
    /// </summary>
    [Serializable]
    public struct StreetSegment
    {
        public Vector3 start;
        public Vector3 end;
        public string name;
    }

    /// <summary>
    /// Full result of street-aligned settlement generation.
    /// </summary>
    [Serializable]
    public class StreetAlignedResult
    {
        public List<StreetSegment> streets = new List<StreetSegment>();
        public List<PlacedLot> lots = new List<PlacedLot>();
    }

    public class WorldScaleManager : MonoBehaviour
    {
        [Header("World")]
        public int terrainSize = {{TERRAIN_SIZE}};
        /// <summary>Runtime scale factor applied to all world positions (default 1.0).</summary>
        public float scaleFactor = {{WORLD_SCALE_FACTOR}}f;
        public Color groundColor = new Color({{GROUND_COLOR_R}}f, {{GROUND_COLOR_G}}f, {{GROUND_COLOR_B}}f);
        public Color skyColor = new Color({{SKY_COLOR_R}}f, {{SKY_COLOR_G}}f, {{SKY_COLOR_B}}f);
        public Color roadColor = new Color({{ROAD_COLOR_R}}f, {{ROAD_COLOR_G}}f, {{ROAD_COLOR_B}}f);

        // --- Scale constants ---
        public const float SPAWN_CLEAR_RADIUS = 15f;
        public const float COUNTRY_MIN_SIZE = 200f;
        public const float COUNTRY_MAX_SIZE = 400f;
        public const float STATE_MIN_SIZE = 60f;
        public const float STATE_MAX_SIZE = 150f;

        private string seed = "world";

        // Population tier definition
        private static readonly (int min, int max, float radius)[] PopScale = new[]
        {
            (0, 50, 20f), (51, 200, 35f), (201, 1000, 55f),
            (1001, 5000, 80f), (5001, int.MaxValue, 120f)
        };

        public void Initialize(InsimulWorldIR worldData)
        {
            terrainSize = worldData.geography.terrainSize;
            if (worldData.geography.worldScaleFactor > 0f)
                scaleFactor = worldData.geography.worldScaleFactor;
            Debug.Log($"[Insimul] WorldScaleManager initialized (terrain: {terrainSize}, scale: {scaleFactor:F2})");

            // Set skybox color
            RenderSettings.ambientSkyColor = skyColor;
            Camera.main.backgroundColor = skyColor;

            // Generate terrain from heightmap or flat fallback
            GenerateTerrain(worldData.geography.heightmap);
        }

        private void GenerateTerrain(float[][] heightmap)
        {
            var terrainGO = new GameObject("Terrain");
            terrainGO.transform.position = Vector3.zero;

            var meshGen = terrainGO.AddComponent<TerrainMeshGenerator>();
            meshGen.GenerateFromHeightmap(heightmap, terrainSize, groundColor);
        }

        // ---------------------------------------------------------------
        // Seeded random – mirrors the TypeScript createSeededRandom()
        // ---------------------------------------------------------------

        private static int CreateSeedHash(string seedString)
        {
            int hash = 0;
            foreach (char c in seedString)
            {
                hash = ((hash << 5) - hash) + (int)c;
                hash = hash & hash; // force 32-bit wrap
            }
            return hash;
        }

        private static float SeededRandom(ref int hash)
        {
            hash = (hash * 9301 + 49297) % 233280;
            return Mathf.Abs(hash) / 233280f;
        }

        // ---------------------------------------------------------------
        // Population helpers
        // ---------------------------------------------------------------

        /// <summary>
        /// Calculate settlement radius based on population, with interpolation
        /// within each tier matching the TypeScript source.
        /// </summary>
        public static float GetSettlementRadius(int population)
        {
            for (int i = 0; i < PopScale.Length; i++)
            {
                var tier = PopScale[i];
                if (population >= tier.min && population <= tier.max)
                {
                    float tierProgress = (tier.max > tier.min)
                        ? (float)(population - tier.min) / (tier.max - tier.min)
                        : 0f;

                    if (i + 1 < PopScale.Length)
                    {
                        return tier.radius + tierProgress * (PopScale[i + 1].radius - tier.radius);
                    }
                    return tier.radius;
                }
            }
            return 20f;
        }

        /// <summary>
        /// Calculate building count for a settlement based on population.
        /// Rough estimate: 1 building per 3-5 people (avg occupancy 4).
        /// </summary>
        public static int GetBuildingCount(int population)
        {
            const int avgOccupancy = 4;
            return Mathf.CeilToInt((float)population / avgOccupancy);
        }

        public static string GetSettlementTier(int population)
        {
            if (population < 100) return "hamlet";
            if (population < 500) return "village";
            if (population < 2000) return "town";
            if (population < 10000) return "city";
            return "metropolis";
        }

        // ---------------------------------------------------------------
        // Territory distribution – countries
        // ---------------------------------------------------------------

        /// <summary>
        /// Distribute countries across the world map in a grid layout.
        /// </summary>
        public List<ScaledCountry> DistributeCountries(
            string[] countryIds, string[] countryNames)
        {
            var result = new List<ScaledCountry>();
            int count = countryIds.Length;
            if (count == 0) return result;

            float half = terrainSize / 2f;
            int cols = Mathf.CeilToInt(Mathf.Sqrt(count));
            int rows = Mathf.CeilToInt((float)count / cols);
            float cellWidth = (float)terrainSize / cols;
            float cellHeight = (float)terrainSize / rows;

            for (int index = 0; index < count; index++)
            {
                int row = index / cols;
                int col = index % cols;

                float cellMinX = -half + col * cellWidth;
                float cellMaxX = -half + (col + 1) * cellWidth;
                float cellMinZ = -half + row * cellHeight;
                float cellMaxZ = -half + (row + 1) * cellHeight;

                const float padding = 20f;

                var country = new ScaledCountry
                {
                    id = countryIds[index],
                    name = (index < countryNames.Length) ? countryNames[index] : countryIds[index],
                    bounds = new TerritoryBounds
                    {
                        minX = cellMinX + padding,
                        maxX = cellMaxX - padding,
                        minZ = cellMinZ + padding,
                        maxZ = cellMaxZ - padding,
                        centerX = (cellMinX + cellMaxX) / 2f,
                        centerZ = (cellMinZ + cellMaxZ) / 2f
                    }
                };

                result.Add(country);
            }

            return result;
        }

        // ---------------------------------------------------------------
        // Territory distribution – states within a country
        // ---------------------------------------------------------------

        /// <summary>
        /// Distribute states within a country in a grid layout.
        /// </summary>
        public List<ScaledState> DistributeStates(
            ScaledCountry country,
            string[] stateIds, string[] stateNames, string[] stateTerrains)
        {
            var result = new List<ScaledState>();
            int count = stateIds.Length;
            if (count == 0) return result;

            float countryWidth = country.bounds.maxX - country.bounds.minX;
            float countryHeight = country.bounds.maxZ - country.bounds.minZ;

            int cols = Mathf.CeilToInt(Mathf.Sqrt(count));
            int rows = Mathf.CeilToInt((float)count / cols);
            float cellWidth = countryWidth / cols;
            float cellHeight = countryHeight / rows;

            for (int index = 0; index < count; index++)
            {
                int row = index / cols;
                int col = index % cols;

                float cellMinX = country.bounds.minX + col * cellWidth;
                float cellMaxX = country.bounds.minX + (col + 1) * cellWidth;
                float cellMinZ = country.bounds.minZ + row * cellHeight;
                float cellMaxZ = country.bounds.minZ + (row + 1) * cellHeight;

                const float padding = 5f;

                var state = new ScaledState
                {
                    id = stateIds[index],
                    name = (index < stateNames.Length) ? stateNames[index] : stateIds[index],
                    countryId = country.id,
                    bounds = new TerritoryBounds
                    {
                        minX = cellMinX + padding,
                        maxX = cellMaxX - padding,
                        minZ = cellMinZ + padding,
                        maxZ = cellMaxZ - padding,
                        centerX = (cellMinX + cellMaxX) / 2f,
                        centerZ = (cellMinZ + cellMaxZ) / 2f
                    },
                    terrain = (index < stateTerrains.Length) ? stateTerrains[index] : ""
                };

                result.Add(state);
            }

            return result;
        }

        // ---------------------------------------------------------------
        // Settlement distribution with collision detection (structured)
        // ---------------------------------------------------------------

        /// <summary>
        /// Distribute settlements within a territory using seeded random
        /// placement with collision detection, matching the TypeScript source.
        /// </summary>
        public List<ScaledSettlement> DistributeSettlementsInTerritory(
            TerritoryBounds bounds, string territoryId, bool isState,
            string[] settlementIds, string[] settlementNames,
            int[] populations, string[] settlementTypes,
            float[] worldPositionsX, float[] worldPositionsZ)
        {
            var result = new List<ScaledSettlement>();
            int count = settlementIds.Length;
            if (count == 0) return result;

            int hash = CreateSeedHash(seed + "_" + territoryId);

            float boundsW = bounds.maxX - bounds.minX;
            float boundsH = bounds.maxZ - bounds.minZ;
            float margin = Mathf.Min(boundsW, boundsH) * 0.25f;
            float safeMinX = bounds.minX + margin;
            float safeMaxX = bounds.maxX - margin;
            float safeMinZ = bounds.minZ + margin;
            float safeMaxZ = bounds.maxZ - margin;

            for (int index = 0; index < count; index++)
            {
                int pop = (index < populations.Length) ? populations[index] : 100;
                float radius = GetSettlementRadius(pop);
                Vector3 position;

                // Use stored world coordinates if available
                bool hasWorldPos = index < worldPositionsX.Length
                    && index < worldPositionsZ.Length
                    && worldPositionsX[index] != 0f
                    && worldPositionsZ[index] != 0f;

                if (hasWorldPos)
                {
                    position = new Vector3(worldPositionsX[index] * scaleFactor, 0f, worldPositionsZ[index] * scaleFactor);
                }
                else if (count == 1)
                {
                    position = new Vector3(bounds.centerX, 0f, bounds.centerZ);
                }
                else
                {
                    int attempts = 0;
                    const int maxAttempts = 50;
                    bool placed = false;
                    position = new Vector3(bounds.centerX, 0f, bounds.centerZ);

                    while (attempts < maxAttempts)
                    {
                        float x = safeMinX + SeededRandom(ref hash) * Mathf.Max(safeMaxX - safeMinX, 1f);
                        float z = safeMinZ + SeededRandom(ref hash) * Mathf.Max(safeMaxZ - safeMinZ, 1f);
                        position = new Vector3(x, 0f, z);

                        bool tooClose = false;
                        for (int j = 0; j < result.Count; j++)
                        {
                            float dist = Vector3.Distance(position, result[j].position);
                            if (dist < (radius + result[j].radius + 10f))
                            {
                                tooClose = true;
                                break;
                            }
                        }

                        if (!tooClose)
                        {
                            placed = true;
                            break;
                        }
                        attempts++;
                    }

                    // Grid fallback
                    if (!placed)
                    {
                        int cols = Mathf.CeilToInt(Mathf.Sqrt(count));
                        int row = index / cols;
                        int col = index % cols;
                        float cellWidth = (safeMaxX - safeMinX) / cols;
                        float cellH = (safeMaxZ - safeMinZ) / Mathf.CeilToInt((float)count / cols);

                        position = new Vector3(
                            safeMinX + col * cellWidth + cellWidth / 2f,
                            0f,
                            safeMinZ + row * cellH + cellH / 2f);
                    }
                }

                result.Add(new ScaledSettlement
                {
                    id = settlementIds[index],
                    name = (index < settlementNames.Length) ? settlementNames[index] : settlementIds[index],
                    stateId = isState ? territoryId : "",
                    countryId = isState ? "" : territoryId,
                    position = position,
                    radius = radius,
                    population = pop,
                    settlementType = (index < settlementTypes.Length) ? settlementTypes[index] : "town"
                });
            }

            return result;
        }

        // ---------------------------------------------------------------
        // Legacy flat-vector settlement distribution (kept for compat)
        // ---------------------------------------------------------------

        /// <summary>
        /// Distribute settlements within territory bounds, using 25% margin and
        /// center-placement for single settlements.
        /// </summary>
        public static Vector3[] DistributeSettlements(
            Vector3 boundsMin, Vector3 boundsMax, Vector3 boundsCenter,
            int settlementCount, float[] radii, int worldSeed)
        {
            var positions = new Vector3[settlementCount];
            if (settlementCount <= 0) return positions;

            float boundsW = boundsMax.x - boundsMin.x;
            float boundsH = boundsMax.z - boundsMin.z;

            float margin = Mathf.Min(boundsW, boundsH) * 0.25f;
            float safeMinX = boundsMin.x + margin;
            float safeMaxX = boundsMax.x - margin;
            float safeMinZ = boundsMin.z + margin;
            float safeMaxZ = boundsMax.z - margin;

            System.Random rand = new System.Random(worldSeed);

            for (int index = 0; index < settlementCount; index++)
            {
                float radius = (index < radii.Length) ? radii[index] : 20f;
                Vector3 position;

                if (settlementCount == 1)
                {
                    position = boundsCenter;
                }
                else
                {
                    int attempts = 0;
                    const int maxAttempts = 50;
                    bool placed = false;
                    position = Vector3.zero;

                    while (attempts < maxAttempts)
                    {
                        float x = safeMinX + (float)rand.NextDouble() * Mathf.Max(safeMaxX - safeMinX, 1f);
                        float z = safeMinZ + (float)rand.NextDouble() * Mathf.Max(safeMaxZ - safeMinZ, 1f);
                        position = new Vector3(x, 0f, z);

                        bool tooClose = false;
                        for (int j = 0; j < index; j++)
                        {
                            float dist = Vector3.Distance(position, positions[j]);
                            float otherRadius = (j < radii.Length) ? radii[j] : 20f;
                            if (dist < (radius + otherRadius + 10f))
                            {
                                tooClose = true;
                                break;
                            }
                        }

                        if (!tooClose)
                        {
                            placed = true;
                            break;
                        }
                        attempts++;
                    }

                    if (!placed)
                    {
                        int cols = Mathf.CeilToInt(Mathf.Sqrt(settlementCount));
                        int row = index / cols;
                        int col = index % cols;

                        float cellWidth = (safeMaxX - safeMinX) / cols;
                        float cellHeight = (safeMaxZ - safeMinZ) / Mathf.CeilToInt((float)settlementCount / cols);

                        position = new Vector3(
                            safeMinX + col * cellWidth + cellWidth / 2f,
                            0f,
                            safeMinZ + row * cellHeight + cellHeight / 2f
                        );
                    }
                }

                positions[index] = position;
            }

            return positions;
        }

        // ---------------------------------------------------------------
        // Lot generation (legacy grid+jitter)
        // ---------------------------------------------------------------

        public static Vector3[] GenerateLotPositions(Vector3 settlementPosition, float settlementRadius, int lotCount)
        {
            var positions = new Vector3[lotCount];
            if (lotCount <= 0) return positions;

            int cols = Mathf.CeilToInt(Mathf.Sqrt(lotCount));
            int rows = Mathf.CeilToInt((float)lotCount / cols);
            float lotSpacing = 20f;
            float gridWidth = (cols - 1) * lotSpacing;
            float gridHeight = (rows - 1) * lotSpacing;

            System.Random rand = new System.Random(
                settlementPosition.GetHashCode());

            for (int i = 0; i < lotCount; i++)
            {
                int row = i / cols;
                int col = i % cols;

                float baseX = settlementPosition.x - gridWidth / 2f + col * lotSpacing;
                float baseZ = settlementPosition.z - gridHeight / 2f + row * lotSpacing;

                float jitterX = ((float)rand.NextDouble() - 0.5f) * 4f;
                float jitterZ = ((float)rand.NextDouble() - 0.5f) * 4f;

                float lotX = baseX + jitterX;
                float lotZ = baseZ + jitterZ;

                float dx = lotX - settlementPosition.x;
                float dz = lotZ - settlementPosition.z;
                float dist = Mathf.Sqrt(dx * dx + dz * dz);
                if (dist < SPAWN_CLEAR_RADIUS)
                {
                    float angle = dist > 0.001f
                        ? Mathf.Atan2(dz, dx)
                        : i * Mathf.PI * 0.618f;
                    lotX = settlementPosition.x + Mathf.Cos(angle) * SPAWN_CLEAR_RADIUS;
                    lotZ = settlementPosition.z + Mathf.Sin(angle) * SPAWN_CLEAR_RADIUS;
                }

                positions[i] = new Vector3(lotX, 0f, lotZ);
            }

            return positions;
        }

        // ---------------------------------------------------------------
        // Street-aligned settlement generation
        // ---------------------------------------------------------------

        /// <summary>
        /// Generate a full street-aligned layout for a settlement.
        /// Returns street segments and placed lots with metadata (facing angle,
        /// house number, street name, zoning hints). Lots are sorted so that
        /// commercial-friendly positions come first.
        /// </summary>
        public StreetAlignedResult GenerateStreetAlignedSettlement(
            Vector3 settlementPosition, float settlementRadius,
            int lotCount, int bizCount = 0, string[] streetNames = null)
        {
            var result = new StreetAlignedResult();
            if (lotCount <= 0) return result;

            float half = terrainSize / 2f;
            int hash = CreateSeedHash(seed + "_lots");

            // --- Generate street network ---
            float mainStreetHalfLen = settlementRadius * 0.85f;
            float mainAngle = SeededRandom(ref hash) * Mathf.PI;

            float cosA = Mathf.Cos(mainAngle);
            float sinA = Mathf.Sin(mainAngle);

            var mainStreet = new StreetSegment
            {
                name = (streetNames != null && streetNames.Length > 0) ? streetNames[0] : "Main Street",
                start = new Vector3(
                    settlementPosition.x - cosA * mainStreetHalfLen,
                    0f,
                    settlementPosition.z - sinA * mainStreetHalfLen),
                end = new Vector3(
                    settlementPosition.x + cosA * mainStreetHalfLen,
                    0f,
                    settlementPosition.z + sinA * mainStreetHalfLen)
            };
            result.streets.Add(mainStreet);

            // Side streets perpendicular to main street
            int sideStreetCount = Mathf.Max(1, lotCount / 8);
            float perpCos = Mathf.Cos(mainAngle + Mathf.PI / 2f);
            float perpSin = Mathf.Sin(mainAngle + Mathf.PI / 2f);

            for (int s = 0; s < sideStreetCount; s++)
            {
                float t = (float)(s + 1) / (sideStreetCount + 1);
                Vector3 origin = Vector3.Lerp(mainStreet.start, mainStreet.end, t);
                float sideLen = settlementRadius * (0.3f + SeededRandom(ref hash) * 0.3f);

                float sign = SeededRandom(ref hash) > 0.5f ? 1f : -1f;
                var side = new StreetSegment
                {
                    name = (streetNames != null && s + 1 < streetNames.Length)
                        ? streetNames[s + 1]
                        : $"Side Street {s + 1}",
                    start = origin,
                    end = new Vector3(
                        origin.x + perpCos * sideLen * sign,
                        0f,
                        origin.z + perpSin * sideLen * (SeededRandom(ref hash) > 0.5f ? 1f : -1f))
                };
                result.streets.Add(side);
            }

            // --- Place lots along streets ---
            const float lotOffset = 8f;
            const float lotSpacing = 14f;
            int placedCount = 0;
            int houseNum = 1;

            for (int si = 0; si < result.streets.Count && placedCount < lotCount; si++)
            {
                var street = result.streets[si];
                Vector3 dir = street.end - street.start;
                float len = dir.magnitude;
                if (len < 1f) continue;

                Vector3 dirN = dir / len;
                Vector3 perpN = new Vector3(-dirN.z, 0f, dirN.x);

                int lotsPerSide = Mathf.Max(1, Mathf.FloorToInt(len / lotSpacing));

                for (int side = -1; side <= 1; side += 2)
                {
                    for (int li = 0; li < lotsPerSide && placedCount < lotCount; li++)
                    {
                        float tt = (li + 0.5f) / lotsPerSide;
                        Vector3 along = Vector3.Lerp(street.start, street.end, tt);
                        Vector3 pos = along + perpN * (lotOffset * side);

                        pos.x = Mathf.Clamp(pos.x, -half, half);
                        pos.z = Mathf.Clamp(pos.z, -half, half);

                        result.lots.Add(new PlacedLot
                        {
                            position = pos,
                            facingAngle = Mathf.Atan2(perpN.z * -side, perpN.x * -side),
                            houseNumber = houseNum++,
                            streetName = street.name,
                            isCorner = (li == 0 || li == lotsPerSide - 1)
                        });
                        placedCount++;
                    }
                }
            }

            // Fill remaining with scattered lots
            if (placedCount < lotCount)
            {
                int remaining = lotCount - placedCount;
                for (int i = 0; i < remaining; i++)
                {
                    float angle = SeededRandom(ref hash) * 2f * Mathf.PI;
                    float r = (SeededRandom(ref hash) * 0.5f + 0.5f) * settlementRadius;

                    result.lots.Add(new PlacedLot
                    {
                        position = new Vector3(
                            Mathf.Clamp(settlementPosition.x + Mathf.Cos(angle) * r, -half, half),
                            0f,
                            Mathf.Clamp(settlementPosition.z + Mathf.Sin(angle) * r, -half, half)),
                        facingAngle = angle + Mathf.PI,
                        houseNumber = houseNum++,
                        streetName = "Outskirts",
                        isCorner = false
                    });
                }
            }

            // Sort lots so commercial-friendly positions come first
            if (bizCount > 0)
            {
                result.lots.Sort((a, b) =>
                {
                    // Corners first
                    if (a.isCorner != b.isCorner) return a.isCorner ? -1 : 1;
                    // Then by proximity to settlement center
                    float distA = Vector3.Distance(a.position, settlementPosition);
                    float distB = Vector3.Distance(b.position, settlementPosition);
                    return distA.CompareTo(distB);
                });
            }

            return result;
        }

        // ---------------------------------------------------------------
        // World sizing
        // ---------------------------------------------------------------

        /// <summary>
        /// Calculate recommended world size based on entity counts.
        /// Minimum 1024 so that a single town's server-generated street grid
        /// (mapSize 500-1000) fits comfortably within the world with margin.
        /// </summary>
        public static int CalculateOptimalWorldSize(int countryCount, int stateCount, int settlementCount)
        {
            float maxEntities = Mathf.Max(
                countryCount,
                Mathf.Max(stateCount / 2f, settlementCount / 5f));

            if (maxEntities <= 4f) return 1024;
            if (maxEntities <= 9f) return 1536;
            if (maxEntities <= 16f) return 2048;
            if (maxEntities <= 25f) return 2560;
            return 3072;
        }
    }
}
