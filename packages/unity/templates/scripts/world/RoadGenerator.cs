using UnityEngine;
using Insimul.Data;

namespace Insimul.World
{
    /// <summary>
    /// Generates road meshes from IR data. Builds procedural ribbon meshes
    /// along waypoints for both street segments and inter-settlement roads.
    /// Each road gets a MeshFilter, MeshRenderer, and MeshCollider.
    /// </summary>
    public class RoadGenerator : MonoBehaviour
    {
        public Color roadColor = new Color({{ROAD_COLOR_R}}f, {{ROAD_COLOR_G}}f, {{ROAD_COLOR_B}}f);
        public float roadWidth = {{ROAD_WIDTH}}f;

        [Tooltip("Height offset above terrain to prevent z-fighting")]
        public float roadElevation = 0.5f;

        private Material _roadMaterial;
        private Material _sidewalkMaterial;
        private Material _centerLineMaterial;
        private Material _crosswalkMaterial;
        private Material _lampPostMaterial;

        public void GenerateFromData(InsimulWorldIR worldData)
        {
            int streetCount = 0;
            int roadCount = 0;

            _roadMaterial = new Material(Shader.Find("Unlit/Color"));
            _roadMaterial.color = roadColor;

            InitMaterials();

            // Generate named streets from settlement street networks
            if (worldData?.geography?.settlements != null)
            {
                foreach (var settlement in worldData.geography.settlements)
                {
                    if (settlement.streetNetwork?.segments == null) continue;
                    foreach (var segment in settlement.streetNetwork.segments)
                    {
                        if (segment.waypoints == null || segment.waypoints.Length < 2) continue;
                        float w = segment.width > 0 ? segment.width : roadWidth;
                        var points = Vec3ArrayToPositions(segment.waypoints);
                        string streetName = $"Street_{segment.name}_{segment.id}";
                        CreateRoadMesh(streetName, points, w);
                        AddSidewalks(streetName, points, w);
                        AddCenterLine(streetName, points);
                        AddCrosswalk(points[0], (points[1] - points[0]).normalized, w);
                        AddCrosswalk(points[points.Length - 1], (points[points.Length - 1] - points[points.Length - 2]).normalized, w);
                        AddStreetLights(streetName, points, w);
                        streetCount++;
                    }
                }
            }

            // Generate inter-settlement roads
            if (worldData?.entities?.buildings != null)
            {
                var irJson = Resources.Load<TextAsset>("Data/roads");
                if (irJson != null)
                {
                    var roads = JsonUtility.FromJson<RoadArray>("{\"items\":" + irJson.text + "}");
                    if (roads?.items != null)
                    {
                        foreach (var road in roads.items)
                        {
                            if (road.waypoints != null && road.waypoints.Length >= 2)
                            {
                                float w = road.width > 0 ? road.width : roadWidth;
                                var points = Vec3ArrayToPositions(road.waypoints);
                                string roadName = $"Road_{roadCount}";
                                CreateRoadMesh(roadName, points, w);
                                AddCenterLine(roadName, points);
                                roadCount++;
                            }
                        }
                    }
                }
            }

            Debug.Log($"[Insimul] Roads: {streetCount} street segments, {roadCount} inter-settlement roads");
        }

        public void GenerateRoad(Vector3 from, Vector3 to, float width)
        {
            if (_roadMaterial == null)
            {
                _roadMaterial = new Material(Shader.Find("Unlit/Color"));
                _roadMaterial.color = roadColor;
            }
            var points = new Vector3[] { from + Vector3.up * roadElevation, to + Vector3.up * roadElevation };
            CreateRoadMesh("Road", points, width);
        }

        private Vector3[] Vec3ArrayToPositions(Vec3Data[] data)
        {
            var positions = new Vector3[data.Length];
            for (int i = 0; i < data.Length; i++)
            {
                // Use the max height across center and both edges so the road
                // surface clears any terrain bumps across its full width.
                positions[i] = data[i].ToVector3() + Vector3.up * roadElevation;
            }
            return positions;
        }

        private void CreateRoadMesh(string name, Vector3[] waypoints, float width)
        {
            var roadObj = new GameObject(name);
            roadObj.transform.SetParent(transform);

            var mesh = BuildRibbonMesh(waypoints, width);

            var mf = roadObj.AddComponent<MeshFilter>();
            mf.mesh = mesh;

            var mr = roadObj.AddComponent<MeshRenderer>();
            mr.sharedMaterial = _roadMaterial;
            mr.receiveShadows = true;
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

            var mc = roadObj.AddComponent<MeshCollider>();
            mc.sharedMesh = mesh;
        }

        /// <summary>
        /// Builds a flat ribbon mesh along a polyline path. For each waypoint,
        /// two vertices are placed perpendicular to the path direction at +/- width/2.
        /// Triangles connect consecutive pairs to form quads.
        /// </summary>
        public static Mesh BuildRibbonMesh(Vector3[] waypoints, float width)
        {
            int n = waypoints.Length;
            var vertices = new Vector3[n * 2];
            var uvs = new Vector2[n * 2];
            var normals = new Vector3[n * 2];

            float halfWidth = width * 0.5f;
            float cumulativeLength = 0f;

            for (int i = 0; i < n; i++)
            {
                // Compute the tangent direction at this waypoint
                Vector3 forward;
                if (i == 0)
                    forward = (waypoints[1] - waypoints[0]).normalized;
                else if (i == n - 1)
                    forward = (waypoints[n - 1] - waypoints[n - 2]).normalized;
                else
                    forward = (waypoints[i + 1] - waypoints[i - 1]).normalized;

                // If forward is zero (duplicate points), use a fallback
                if (forward.sqrMagnitude < 0.0001f)
                    forward = Vector3.forward;

                // Perpendicular in the XZ plane (roads are flat ribbons)
                Vector3 right = new Vector3(forward.z, 0f, -forward.x).normalized;

                // If right is degenerate (vertical path), fall back
                if (right.sqrMagnitude < 0.0001f)
                    right = Vector3.right;

                vertices[i * 2]     = waypoints[i] - right * halfWidth;
                vertices[i * 2 + 1] = waypoints[i] + right * halfWidth;

                normals[i * 2]     = Vector3.up;
                normals[i * 2 + 1] = Vector3.up;

                // Accumulate length for UV mapping
                if (i > 0)
                    cumulativeLength += Vector3.Distance(waypoints[i], waypoints[i - 1]);

                float v = cumulativeLength / width; // tile UVs proportionally
                uvs[i * 2]     = new Vector2(0f, v);
                uvs[i * 2 + 1] = new Vector2(1f, v);
            }

            // Build triangle indices: two triangles per segment
            int segmentCount = n - 1;
            var triangles = new int[segmentCount * 6];
            for (int i = 0; i < segmentCount; i++)
            {
                int bl = i * 2;
                int br = i * 2 + 1;
                int tl = (i + 1) * 2;
                int tr = (i + 1) * 2 + 1;

                triangles[i * 6]     = bl;
                triangles[i * 6 + 1] = tl;
                triangles[i * 6 + 2] = br;
                triangles[i * 6 + 3] = br;
                triangles[i * 6 + 4] = tl;
                triangles[i * 6 + 5] = tr;
            }

            var mesh = new Mesh();
            mesh.name = "RoadMesh";
            mesh.vertices = vertices;
            mesh.triangles = triangles;
            mesh.uv = uvs;
            mesh.normals = normals;
            mesh.RecalculateBounds();

            return mesh;
        }

        private void InitMaterials()
        {
            var standard = Shader.Find("Standard");

            _sidewalkMaterial = new Material(standard);
            _sidewalkMaterial.color = new Color(0.6f, 0.58f, 0.55f);
            _sidewalkMaterial.SetFloat("_Glossiness", 0.1f);

            _centerLineMaterial = new Material(standard);
            _centerLineMaterial.color = new Color(0.6f, 0.55f, 0.25f);
            _centerLineMaterial.SetFloat("_Glossiness", 0.05f);

            _crosswalkMaterial = new Material(standard);
            _crosswalkMaterial.color = new Color(0.75f, 0.75f, 0.72f);
            _crosswalkMaterial.SetFloat("_Glossiness", 0.05f);

            _lampPostMaterial = new Material(standard);
            _lampPostMaterial.color = new Color(0.2f, 0.2f, 0.22f);
            _lampPostMaterial.SetFloat("_Glossiness", 0.4f);
        }

        /// <summary>
        /// Generates two sidewalk ribbons flanking the road, offset outward from each edge.
        /// </summary>
        private void AddSidewalks(string name, Vector3[] waypoints, float roadWidth)
        {
            float sidewalkWidth = 1.5f;
            float offsetFromEdge = 0.3f;
            float sidewalkElevation = 0.08f;
            float centerOffset = roadWidth / 2f + offsetFromEdge + sidewalkWidth / 2f;

            for (int side = 0; side < 2; side++)
            {
                float sign = side == 0 ? -1f : 1f;
                var offsetPoints = new Vector3[waypoints.Length];

                for (int i = 0; i < waypoints.Length; i++)
                {
                    Vector3 forward;
                    if (i == 0)
                        forward = (waypoints[1] - waypoints[0]).normalized;
                    else if (i == waypoints.Length - 1)
                        forward = (waypoints[waypoints.Length - 1] - waypoints[waypoints.Length - 2]).normalized;
                    else
                        forward = (waypoints[i + 1] - waypoints[i - 1]).normalized;

                    if (forward.sqrMagnitude < 0.0001f) forward = Vector3.forward;

                    Vector3 right = new Vector3(forward.z, 0f, -forward.x).normalized;
                    if (right.sqrMagnitude < 0.0001f) right = Vector3.right;

                    offsetPoints[i] = waypoints[i] + right * sign * centerOffset + Vector3.up * sidewalkElevation;
                }

                string sideName = side == 0 ? "Left" : "Right";
                var obj = new GameObject($"{name}_Sidewalk_{sideName}");
                obj.transform.SetParent(transform);
                obj.isStatic = true;

                var mesh = BuildRibbonMesh(offsetPoints, sidewalkWidth);

                var mf = obj.AddComponent<MeshFilter>();
                mf.mesh = mesh;

                var mr = obj.AddComponent<MeshRenderer>();
                mr.sharedMaterial = _sidewalkMaterial;
                mr.receiveShadows = true;
                mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

                var mc = obj.AddComponent<MeshCollider>();
                mc.sharedMesh = mesh;
            }
        }

        /// <summary>
        /// Adds dashed yellow center line markings along a road path.
        /// </summary>
        private void AddCenterLine(string name, Vector3[] waypoints)
        {
            float dashLength = 2.0f;
            float gapLength = 1.5f;
            float cycleLength = dashLength + gapLength;
            float lineWidth = 0.15f;

            var parent = new GameObject($"{name}_CenterLine");
            parent.transform.SetParent(transform);
            parent.isStatic = true;

            float accumulated = 0f;
            int dashIndex = 0;

            for (int i = 0; i < waypoints.Length - 1; i++)
            {
                Vector3 segStart = waypoints[i];
                Vector3 segEnd = waypoints[i + 1];
                Vector3 dir = segEnd - segStart;
                float segLength = dir.magnitude;
                if (segLength < 0.001f) continue;
                dir /= segLength;

                float pos = 0f;

                // If we're mid-cycle from previous segment, figure out where we are
                float cyclePos = accumulated % cycleLength;

                // Walk along this segment
                while (pos < segLength)
                {
                    float currentCyclePos = (accumulated + pos) % cycleLength;

                    if (currentCyclePos < dashLength)
                    {
                        // We're in a dash region — figure out how much dash remains
                        float dashRemaining = dashLength - currentCyclePos;
                        float segRemaining = segLength - pos;
                        float thisDash = Mathf.Min(dashRemaining, segRemaining);

                        Vector3 dashCenter = segStart + dir * (pos + thisDash / 2f);
                        dashCenter.y = waypoints[0].y + 0.02f;

                        var dash = GameObject.CreatePrimitive(PrimitiveType.Cube);
                        dash.name = $"Dash_{dashIndex++}";
                        dash.transform.SetParent(parent.transform);
                        dash.transform.position = dashCenter;
                        dash.transform.localScale = new Vector3(lineWidth, 0.02f, thisDash);
                        dash.transform.rotation = Quaternion.LookRotation(dir, Vector3.up);
                        dash.isStatic = true;

                        var mr = dash.GetComponent<MeshRenderer>();
                        mr.sharedMaterial = _centerLineMaterial;
                        mr.receiveShadows = false;
                        mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

                        // Remove collider to avoid physics issues
                        var col = dash.GetComponent<Collider>();
                        if (col != null) Destroy(col);

                        pos += thisDash;
                    }
                    else
                    {
                        // We're in a gap region
                        float gapRemaining = cycleLength - currentCyclePos;
                        pos += Mathf.Min(gapRemaining, segLength - pos);
                    }
                }

                accumulated += segLength;
            }
        }

        /// <summary>
        /// Places crosswalk stripes perpendicular to the road direction at the given position.
        /// </summary>
        private void AddCrosswalk(Vector3 position, Vector3 roadDirection, float roadWidth)
        {
            // Dynamic stripe count based on road width (roughly 1 stripe per 1.2m of road)
            float stripeWidth = 0.3f;
            float stripeGap = 0.3f;
            int stripeCount = Mathf.Clamp(Mathf.RoundToInt(roadWidth / (stripeWidth + stripeGap)), 3, 12);
            float totalWidth = stripeCount * stripeWidth + (stripeCount - 1) * stripeGap;

            var parent = new GameObject($"Crosswalk_{position.x:F0}_{position.z:F0}");
            parent.transform.SetParent(transform);
            parent.isStatic = true;

            Vector3 forward = roadDirection.normalized;
            Vector3 right = new Vector3(forward.z, 0f, -forward.x).normalized;
            if (right.sqrMagnitude < 0.0001f) right = Vector3.right;

            float startOffset = -totalWidth / 2f + stripeWidth / 2f;

            for (int i = 0; i < stripeCount; i++)
            {
                float offset = startOffset + i * (stripeWidth + stripeGap);
                Vector3 stripePos = position + forward * offset;
                stripePos.y = position.y + 0.02f;

                var stripe = GameObject.CreatePrimitive(PrimitiveType.Cube);
                stripe.name = $"Stripe_{i}";
                stripe.transform.SetParent(parent.transform);
                stripe.transform.position = stripePos;
                stripe.transform.localScale = new Vector3(roadWidth, 0.02f, stripeWidth);
                stripe.transform.rotation = Quaternion.LookRotation(forward, Vector3.up);
                stripe.isStatic = true;

                var mr = stripe.GetComponent<MeshRenderer>();
                mr.sharedMaterial = _crosswalkMaterial;
                mr.receiveShadows = false;
                mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;

                var col = stripe.GetComponent<Collider>();
                if (col != null) Destroy(col);
            }
        }

        /// <summary>
        /// Places street lights along both sides of a road at regular intervals.
        /// Lamp heads are tagged "StreetLight" for DayNightCycleManager discovery.
        /// </summary>
        private void AddStreetLights(string name, Vector3[] waypoints, float roadWidth)
        {
            float interval = 25f;
            float sideOffset = roadWidth / 2f + 1.0f;
            float postHeight = 4.5f;
            float postRadius = 0.08f;
            float lampRadius = 0.2f;

            var parent = new GameObject($"{name}_StreetLights");
            parent.transform.SetParent(transform);

            float accumulated = 0f;
            float nextPlacement = 0f;
            int lightIndex = 0;
            bool placeLeft = true;

            for (int i = 0; i < waypoints.Length - 1; i++)
            {
                Vector3 segStart = waypoints[i];
                Vector3 segEnd = waypoints[i + 1];
                Vector3 dir = segEnd - segStart;
                float segLength = dir.magnitude;
                if (segLength < 0.001f) continue;
                dir /= segLength;

                Vector3 right = new Vector3(dir.z, 0f, -dir.x).normalized;
                if (right.sqrMagnitude < 0.0001f) right = Vector3.right;

                while (accumulated + (nextPlacement - accumulated) <= accumulated + segLength)
                {
                    float localPos = nextPlacement - accumulated;
                    if (localPos < 0f) localPos = 0f;
                    if (localPos > segLength) break;

                    Vector3 roadPoint = segStart + dir * localPos;
                    float sign = placeLeft ? -1f : 1f;
                    Vector3 basePos = roadPoint + right * sign * sideOffset;
                    basePos.y = waypoints[0].y;

                    // Post
                    var post = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                    post.name = $"LampPost_{lightIndex}";
                    post.transform.SetParent(parent.transform);
                    post.transform.position = basePos + Vector3.up * (postHeight / 2f);
                    post.transform.localScale = new Vector3(postRadius * 2f, postHeight / 2f, postRadius * 2f);

                    var postMr = post.GetComponent<MeshRenderer>();
                    postMr.sharedMaterial = _lampPostMaterial;

                    // Lamp head
                    var lamp = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                    lamp.name = $"LampHead_{lightIndex}";
                    lamp.tag = "StreetLight";
                    lamp.transform.SetParent(parent.transform);
                    lamp.transform.position = basePos + Vector3.up * postHeight;
                    lamp.transform.localScale = Vector3.one * lampRadius * 2f;

                    var lampMat = new Material(Shader.Find("Standard"));
                    lampMat.color = new Color(1f, 0.95f, 0.8f);
                    lampMat.EnableKeyword("_EMISSION");
                    lampMat.SetColor("_EmissionColor", new Color(1f, 0.9f, 0.7f) * 0.5f);
                    var lampMr = lamp.GetComponent<MeshRenderer>();
                    lampMr.sharedMaterial = lampMat;

                    // Point light
                    var pointLight = lamp.AddComponent<Light>();
                    pointLight.type = LightType.Point;
                    pointLight.range = 12f;
                    pointLight.intensity = 0.8f;
                    pointLight.color = new Color(1f, 0.9f, 0.7f);
                    pointLight.enabled = false;

                    lightIndex++;
                    placeLeft = !placeLeft;
                    nextPlacement += interval;
                }

                accumulated += segLength;
            }
        }

        /// <summary>
        /// Create a street name sign oriented parallel to the street direction.
        /// Double-sided so it can be read from either side.
        /// </summary>
        public void CreateStreetSign(Vector3 position, string streetName, Vector3 streetDir)
        {
            var parent = new GameObject($"StreetSign_{streetName.Replace(" ", "_")}");
            parent.transform.SetParent(transform);
            parent.transform.position = position;

            // Pole
            var pole = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            pole.name = "Pole";
            pole.transform.SetParent(parent.transform);
            pole.transform.position = position + Vector3.up * 1.25f;
            pole.transform.localScale = new Vector3(0.1f, 1.25f, 0.1f);
            var poleMr = pole.GetComponent<MeshRenderer>();
            poleMr.sharedMaterial = _lampPostMaterial;

            // Sign face — quad oriented parallel to street
            var sign = GameObject.CreatePrimitive(PrimitiveType.Quad);
            sign.name = "SignFace";
            sign.transform.SetParent(parent.transform);
            sign.transform.position = position + Vector3.up * 2.5f;
            sign.transform.localScale = new Vector3(2.0f, 0.5f, 1f);

            // Orient parallel to street direction
            if (streetDir.sqrMagnitude > 0.001f)
            {
                float angle = Mathf.Atan2(streetDir.x, streetDir.z) * Mathf.Rad2Deg;
                sign.transform.rotation = Quaternion.Euler(0f, angle, 0f);
            }

            // Green sign material (double-sided via shader)
            var signMat = new Material(Shader.Find("Standard"));
            signMat.color = new Color(0.16f, 0.37f, 0.16f);
            signMat.EnableKeyword("_EMISSION");
            signMat.SetColor("_EmissionColor", new Color(0.16f, 0.37f, 0.16f) * 0.5f);
            signMat.SetFloat("_Cull", 0f); // Render both sides
            sign.GetComponent<MeshRenderer>().sharedMaterial = signMat;

            // 3D text — use TextMesh for street name
            var textObj = new GameObject("SignText");
            textObj.transform.SetParent(sign.transform);
            textObj.transform.localPosition = new Vector3(0f, 0f, -0.01f);
            textObj.transform.localScale = Vector3.one * 0.05f;
            var tm = textObj.AddComponent<TextMesh>();
            tm.text = streetName;
            tm.fontSize = 64;
            tm.alignment = TextAlignment.Center;
            tm.anchor = TextAnchor.MiddleCenter;
            tm.color = Color.white;
        }

        #region Lot-Based Sidewalk Generation

        /// <summary>
        /// Generates sidewalks along lot frontages based on lot dimensions and positions.
        /// Each lot gets a sidewalk segment along its street-facing edge.
        /// </summary>
        public void GenerateLotSidewalks(Vector3 lotCenter, Vector3 lotSize, Vector3 streetDirection)
        {
            if (_sidewalkMaterial == null) InitMaterials();

            float sidewalkWidth = 1.5f;
            float sidewalkElevation = 0.08f;

            // Calculate frontage edge perpendicular to street direction
            Vector3 forward = streetDirection.normalized;
            Vector3 right = new Vector3(forward.z, 0f, -forward.x).normalized;
            if (right.sqrMagnitude < 0.0001f) right = Vector3.right;

            // Front edge of lot (closest to street)
            float halfDepth = lotSize.z / 2f;
            Vector3 frontCenter = lotCenter - forward * halfDepth;

            // Create two waypoints spanning the lot width
            float halfWidth = lotSize.x / 2f;
            Vector3[] sidewalkPoints = new Vector3[]
            {
                frontCenter - right * halfWidth + Vector3.up * (roadElevation + sidewalkElevation),
                frontCenter + right * halfWidth + Vector3.up * (roadElevation + sidewalkElevation)
            };

            string sideName = $"LotSidewalk_{frontCenter.x:F0}_{frontCenter.z:F0}";
            var obj = new GameObject(sideName);
            obj.transform.SetParent(transform);
            obj.isStatic = true;

            var mesh = BuildRibbonMesh(sidewalkPoints, sidewalkWidth);
            var mf = obj.AddComponent<MeshFilter>();
            mf.mesh = mesh;
            var mr = obj.AddComponent<MeshRenderer>();
            mr.sharedMaterial = _sidewalkMaterial;
            mr.receiveShadows = true;
            mr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            var mc = obj.AddComponent<MeshCollider>();
            mc.sharedMesh = mesh;
        }

        #endregion

        #region Point-on-Road Query

        /// <summary>
        /// Returns true if the given point is within the threshold distance of any road segment.
        /// Useful for NPC navigation and placement validation.
        /// </summary>
        public bool IsPointOnRoad(Vector3 point, float threshold = 1.0f)
        {
            // Check all road GameObjects that are children of this generator
            foreach (Transform child in transform)
            {
                var mf = child.GetComponent<MeshFilter>();
                if (mf == null || mf.sharedMesh == null) continue;

                var mc = child.GetComponent<MeshCollider>();
                if (mc != null)
                {
                    // Use the collider's closest point for accurate distance check
                    Vector3 closest = mc.ClosestPoint(point);
                    if (Vector3.Distance(point, closest) <= threshold)
                        return true;
                }
            }
            return false;
        }

        #endregion

        #region Polyline Utilities

        /// <summary>
        /// Interpolate a position along a polyline at a given distance from the start.
        /// Returns the last point if distance exceeds total length.
        /// </summary>
        public static Vector3 InterpolatePolyline(Vector3[] waypoints, float distance)
        {
            if (waypoints == null || waypoints.Length == 0) return Vector3.zero;
            if (waypoints.Length == 1 || distance <= 0f) return waypoints[0];

            float walked = 0f;
            for (int i = 0; i < waypoints.Length - 1; i++)
            {
                float segLen = Vector3.Distance(waypoints[i], waypoints[i + 1]);
                if (walked + segLen >= distance)
                {
                    float t = (distance - walked) / Mathf.Max(segLen, 0.001f);
                    return Vector3.Lerp(waypoints[i], waypoints[i + 1], Mathf.Clamp01(t));
                }
                walked += segLen;
            }
            return waypoints[waypoints.Length - 1];
        }

        /// <summary>
        /// Calculate the total length of a polyline path.
        /// </summary>
        public static float PolylineLength(Vector3[] waypoints)
        {
            if (waypoints == null || waypoints.Length < 2) return 0f;
            float length = 0f;
            for (int i = 0; i < waypoints.Length - 1; i++)
                length += Vector3.Distance(waypoints[i], waypoints[i + 1]);
            return length;
        }

        #endregion

        #region Settlement MST Generation

        /// <summary>
        /// Generate inter-settlement roads using a minimum spanning tree (Kruskal's algorithm).
        /// Connects settlement centers with the shortest total road network.
        /// Stub — call GenerateRoad for each resulting edge.
        /// </summary>
        public void GenerateSettlementRoads(Vector3[] settlementCenters, float defaultWidth)
        {
            if (settlementCenters == null || settlementCenters.Length < 2) return;
            if (_roadMaterial == null)
            {
                _roadMaterial = new Material(Shader.Find("Unlit/Color"));
                _roadMaterial.color = roadColor;
            }

            int n = settlementCenters.Length;

            // Build all edges sorted by distance (Kruskal's)
            var edges = new List<(int a, int b, float dist)>();
            for (int i = 0; i < n; i++)
                for (int j = i + 1; j < n; j++)
                    edges.Add((i, j, Vector3.Distance(settlementCenters[i], settlementCenters[j])));
            edges.Sort((e1, e2) => e1.dist.CompareTo(e2.dist));

            // Union-Find
            int[] parent = new int[n];
            for (int i = 0; i < n; i++) parent[i] = i;
            System.Func<int, int> find = null;
            find = (x) => parent[x] == x ? x : (parent[x] = find(parent[x]));

            int edgesAdded = 0;
            foreach (var edge in edges)
            {
                int rootA = find(edge.a);
                int rootB = find(edge.b);
                if (rootA == rootB) continue;

                parent[rootA] = rootB;
                var points = new Vector3[]
                {
                    settlementCenters[edge.a] + Vector3.up * roadElevation,
                    settlementCenters[edge.b] + Vector3.up * roadElevation
                };
                CreateRoadMesh($"SettlementRoad_{edgesAdded}", points, defaultWidth);
                AddCenterLine($"SettlementRoad_{edgesAdded}", points);
                edgesAdded++;

                if (edgesAdded >= n - 1) break;
            }

            Debug.Log($"[Insimul] Generated {edgesAdded} settlement MST roads");
        }

        #endregion

        [System.Serializable]
        private class RoadArray { public RoadEntry[] items; }

        [System.Serializable]
        private class RoadEntry
        {
            public string fromId;
            public string toId;
            public float width;
            public Vec3Data[] waypoints;
        }
    }
}
