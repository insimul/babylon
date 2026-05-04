using UnityEngine;
using TMPro;
using System.Collections.Generic;
using Insimul.Data;
using Insimul.Core;
using Insimul.Systems;

namespace Insimul.UI
{
    public class QuestWaypointManager : MonoBehaviour
    {
        private InsimulWorldIR worldData;
        private Transform player;
        private List<WaypointMarker> markers = new List<WaypointMarker>();
        private float nextUpdateTime;
        private float nextDistanceTime;

        private class WaypointMarker
        {
            public string questId;
            public string objectiveId;
            public GameObject root;
            public TextMeshPro distText;
            public Vector3 basePos;
        }

        public void Initialize(InsimulWorldIR worldData)
        {
            this.worldData = worldData;
            player = GameObject.FindGameObjectWithTag("Player")?.transform;
            RefreshWaypoints();
        }

        public void RefreshWaypoints()
        {
            foreach (var m in markers) if (m.root) Destroy(m.root);
            markers.Clear();

            var questSystem = FindFirstObjectByType<QuestSystem>();
            if (questSystem == null || worldData == null) return;

            foreach (var quest in questSystem.GetActiveQuests())
            {
                Color color = GetQuestColor(quest.questType);
                foreach (var obj in quest.objectives)
                {
                    if (obj.completed) continue;
                    Vector3? pos = ResolveObjectivePosition(obj);
                    if (pos.HasValue)
                        markers.Add(CreateMarker(quest.id, obj.id, pos.Value, color));
                }
            }
        }

        private Vector3? ResolveObjectivePosition(QuestObjective obj)
        {
            if (obj.targetPosition != null)
                return new Vector3(obj.targetPosition.x, obj.targetPosition.y, obj.targetPosition.z);

            if (!string.IsNullOrEmpty(obj.targetBuildingId))
            {
                var bld = worldData.FindEntity(obj.targetBuildingId);
                if (bld != null) return bld.position;
            }
            if (!string.IsNullOrEmpty(obj.targetNpcId))
            {
                var npc = worldData.FindEntity(obj.targetNpcId);
                if (npc != null) return npc.position;
            }
            if (!string.IsNullOrEmpty(obj.targetSettlementId))
            {
                var stl = worldData.FindEntity(obj.targetSettlementId);
                if (stl != null) return stl.position;
            }
            return null;
        }

        private Color GetQuestColor(string questType)
        {
            switch (questType?.ToLower())
            {
                case "main": return new Color(1f, 0.85f, 0.1f);
                case "side": return new Color(0.1f, 0.8f, 0.9f);
                default: return new Color(0.9f, 0.9f, 0.9f);
            }
        }

        private WaypointMarker CreateMarker(string questId, string objId, Vector3 pos, Color color)
        {
            Vector3 markerPos = pos + Vector3.up * 3f;
            var root = new GameObject($"Waypoint_{questId}_{objId}");
            root.transform.position = markerPos;

            var sphere = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            sphere.transform.SetParent(root.transform, false);
            sphere.transform.localScale = Vector3.one * 0.5f;
            Destroy(sphere.GetComponent<Collider>());
            ApplyEmissive(sphere.GetComponent<Renderer>(), color);

            var beam = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            beam.transform.SetParent(root.transform, false);
            beam.transform.localPosition = new Vector3(0, -1.5f, 0);
            beam.transform.localScale = new Vector3(0.05f, 1.5f, 0.05f);
            Destroy(beam.GetComponent<Collider>());
            ApplyEmissive(beam.GetComponent<Renderer>(), color * 0.6f);

            var textGo = new GameObject("DistText");
            textGo.transform.SetParent(root.transform, false);
            textGo.transform.localPosition = new Vector3(0, -0.6f, 0);
            var tmp = textGo.AddComponent<TextMeshPro>();
            tmp.fontSize = 3;
            tmp.alignment = TextAlignmentOptions.Center;
            tmp.color = Color.white;
            tmp.text = "";
            tmp.enabled = false;

            return new WaypointMarker
            {
                questId = questId, objectiveId = objId,
                root = root, distText = tmp, basePos = markerPos
            };
        }

        private void ApplyEmissive(Renderer rend, Color color)
        {
            var mat = rend.material;
            mat.color = color;
            mat.EnableKeyword("_EMISSION");
            mat.SetColor("_EmissionColor", color * 1.5f);
        }

        private void Update()
        {
            float t = Time.time;

            foreach (var m in markers)
            {
                if (!m.root) continue;
                var p = m.basePos;
                p.y += Mathf.Sin(t * 2f) * 0.3f;
                m.root.transform.position = p;
            }

            if (t >= nextUpdateTime)
            {
                nextUpdateTime = t + 1f;
                UpdateVisibility();
            }

            if (player && t >= nextDistanceTime)
            {
                nextDistanceTime = t + 0.5f;
                UpdateDistances();
            }
        }

        private void UpdateVisibility()
        {
            var qs = FindFirstObjectByType<QuestSystem>();
            if (qs == null) return;

            var activeIds = new HashSet<string>();
            foreach (var quest in qs.GetActiveQuests())
                foreach (var obj in quest.objectives)
                    if (!obj.completed) activeIds.Add($"{quest.id}_{obj.id}");

            bool dirty = false;
            for (int i = markers.Count - 1; i >= 0; i--)
            {
                string key = $"{markers[i].questId}_{markers[i].objectiveId}";
                if (!activeIds.Contains(key))
                {
                    if (markers[i].root) Destroy(markers[i].root);
                    markers.RemoveAt(i);
                    dirty = true;
                }
            }
            if (dirty && markers.Count == 0) RefreshWaypoints();
        }

        private void UpdateDistances()
        {
            Vector3 pp = player.position;
            foreach (var m in markers)
            {
                if (!m.root || !m.distText) continue;
                float dist = Vector3.Distance(pp, m.basePos);
                if (dist < 50f)
                {
                    m.distText.enabled = true;
                    m.distText.text = $"{Mathf.RoundToInt(dist)}m";
                }
                else m.distText.enabled = false;
            }
        }
    }
}
