using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using Insimul.Data;

namespace Insimul.Systems
{
    public class ResourceSystem : MonoBehaviour
    {
        [Header("Gathering")]
        public float interactionRadius = 2f;
        public KeyCode gatherKey = KeyCode.E;

        private List<ResourceDefData> _definitions = new();
        private List<GatheringNodeInstance> _instances = new();
        private GatheringNodeInstance _activeNode;
        private bool _isGathering;
        private float _gatherProgress;

        public event System.Action<string, int> OnResourceGathered;

        public void LoadFromData(InsimulWorldIR worldData)
        {
            if (worldData?.resources?.definitions != null)
                _definitions.AddRange(worldData.resources.definitions);

            if (worldData?.resources?.nodes != null)
            {
                foreach (var node in worldData.resources.nodes)
                    SpawnNode(node);
            }

            Debug.Log($"[Insimul] ResourceSystem loaded {_definitions.Count} types, {_instances.Count} nodes");
        }

        private void SpawnNode(GatheringNodeData data)
        {
            var def = _definitions.Find(d => d.id == data.resourceType);
            if (def == null) return;

            var go = CreateNodeVisual(data.resourceType, def);
            go.name = data.id;
            go.transform.position = new Vector3(data.position.x, data.position.y, data.position.z);
            go.transform.localScale = Vector3.one * data.scale;

            var instance = new GatheringNodeInstance
            {
                id = data.id,
                resourceType = data.resourceType,
                gameObject = go,
                renderer = go.GetComponentInChildren<MeshRenderer>(),
                originalMaterial = go.GetComponentInChildren<MeshRenderer>().material,
                maxAmount = data.maxAmount,
                currentAmount = data.maxAmount,
                respawnTime = data.respawnTime / 1000f,
                scale = data.scale,
                depleted = false,
            };

            // Progress bar (world-space canvas)
            instance.progressBar = CreateProgressBar(go.transform);
            instance.progressBar.gameObject.SetActive(false);

            _instances.Add(instance);
        }

        private GameObject CreateNodeVisual(string resourceType, ResourceDefData def)
        {
            GameObject go;
            switch (resourceType)
            {
                case "wood":
                    go = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                    break;
                case "stone":
                    go = GameObject.CreatePrimitive(PrimitiveType.Cube);
                    break;
                case "iron":
                    go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                    break;
                case "crystal":
                    go = CreateCrystalShape();
                    break;
                case "food":
                    go = CreateBushShape();
                    break;
                default:
                    go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                    break;
            }

            var renderer = go.GetComponentInChildren<MeshRenderer>();
            if (renderer != null && def.color != null)
            {
                var mat = new Material(Shader.Find("Standard"));
                mat.color = new Color(def.color.r, def.color.g, def.color.b);
                if (resourceType == "iron")
                {
                    mat.SetFloat("_Metallic", 0.8f);
                    mat.SetFloat("_Glossiness", 0.6f);
                }
                renderer.material = mat;
            }

            go.tag = "GatheringNode";
            return go;
        }

        private static GameObject CreateCrystalShape()
        {
            // Vertically scaled octahedron approximation using a sphere
            var go = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            go.transform.localScale = new Vector3(0.5f, 1.2f, 0.5f);
            return go;
        }

        private static GameObject CreateBushShape()
        {
            // Two overlapping spheres for a bush look
            var parent = new GameObject("Bush");
            var bottom = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            bottom.transform.SetParent(parent.transform);
            bottom.transform.localPosition = Vector3.zero;
            bottom.transform.localScale = new Vector3(1f, 0.6f, 1f);

            var top = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            top.transform.SetParent(parent.transform);
            top.transform.localPosition = new Vector3(0f, 0.35f, 0f);
            top.transform.localScale = new Vector3(0.7f, 0.5f, 0.7f);

            return parent;
        }

        private Image CreateProgressBar(Transform parent)
        {
            var canvasGo = new GameObject("ProgressCanvas");
            canvasGo.transform.SetParent(parent);
            canvasGo.transform.localPosition = new Vector3(0f, 1.5f, 0f);

            var canvas = canvasGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.WorldSpace;
            canvas.GetComponent<RectTransform>().sizeDelta = new Vector2(1f, 0.15f);

            var bgGo = new GameObject("Background");
            bgGo.transform.SetParent(canvasGo.transform, false);
            var bgImg = bgGo.AddComponent<Image>();
            bgImg.color = new Color(0.2f, 0.2f, 0.2f, 0.8f);
            bgImg.rectTransform.sizeDelta = new Vector2(1f, 0.15f);

            var fillGo = new GameObject("Fill");
            fillGo.transform.SetParent(canvasGo.transform, false);
            var fillImg = fillGo.AddComponent<Image>();
            fillImg.color = new Color(0.2f, 0.8f, 0.2f, 1f);
            fillImg.rectTransform.pivot = new Vector2(0f, 0.5f);
            fillImg.rectTransform.anchorMin = new Vector2(0f, 0f);
            fillImg.rectTransform.anchorMax = new Vector2(0f, 1f);
            fillImg.rectTransform.sizeDelta = new Vector2(0f, 0f);

            return fillImg;
        }

        private void Update()
        {
            if (_isGathering)
            {
                UpdateGathering();
                return;
            }

            var player = GameObject.FindGameObjectWithTag("Player");
            if (player == null) return;

            GatheringNodeInstance nearest = null;
            float nearestDist = interactionRadius;

            foreach (var node in _instances)
            {
                if (node.depleted) continue;
                float dist = Vector3.Distance(player.transform.position, node.gameObject.transform.position);
                if (dist < nearestDist)
                {
                    nearestDist = dist;
                    nearest = node;
                }
            }

            _activeNode = nearest;

            if (_activeNode != null && Input.GetKeyDown(gatherKey))
            {
                if (CheckToolRequirement(_activeNode.resourceType))
                    StartGathering();
                else
                    Debug.Log($"[Insimul] Need a tool to gather {_activeNode.resourceType}");
            }
        }

        private bool CheckToolRequirement(string resourceType)
        {
            // Stone/iron/crystal/gold require a tool (pickaxe or axe)
            string requiredTool = resourceType switch
            {
                "stone" => "pickaxe",
                "iron" => "pickaxe",
                "crystal" => "pickaxe",
                "gold" => "pickaxe",
                "wood" => "axe",
                _ => null,
            };

            if (requiredTool == null) return true;

            var inv = FindFirstObjectByType<InventorySystem>();
            return inv != null && inv.HasItem(requiredTool);
        }

        private void StartGathering()
        {
            _isGathering = true;
            _gatherProgress = 0f;
            _activeNode.progressBar.gameObject.transform.parent.gameObject.SetActive(true);
        }

        private void UpdateGathering()
        {
            if (_activeNode == null || _activeNode.depleted)
            {
                CancelGathering();
                return;
            }

            var player = GameObject.FindGameObjectWithTag("Player");
            if (player == null || Vector3.Distance(player.transform.position, _activeNode.gameObject.transform.position) > interactionRadius)
            {
                CancelGathering();
                return;
            }

            var def = _definitions.Find(d => d.id == _activeNode.resourceType);
            float gatherTime = (def?.gatherTime ?? 2000f) / 1000f;

            _gatherProgress += Time.deltaTime / gatherTime;
            UpdateProgressBar(_activeNode.progressBar, Mathf.Clamp01(_gatherProgress));

            if (_gatherProgress >= 1f)
                CompleteGathering();
        }

        private void CompleteGathering()
        {
            var inv = FindFirstObjectByType<InventorySystem>();
            if (inv != null)
            {
                var def = _definitions.Find(d => d.id == _activeNode.resourceType);
                inv.AddItem(new InventoryItem
                {
                    id = _activeNode.resourceType,
                    name = def?.name ?? _activeNode.resourceType,
                    type = InsimulItemType.Material,
                    quantity = 1,
                });
            }

            _activeNode.currentAmount--;
            OnResourceGathered?.Invoke(_activeNode.resourceType, 1);
            Debug.Log($"[Insimul] Gathered {_activeNode.resourceType} ({_activeNode.currentAmount}/{_activeNode.maxAmount} remaining)");

            if (_activeNode.currentAmount <= 0)
                DepleteNode(_activeNode);

            _isGathering = false;
            _gatherProgress = 0f;
            _activeNode.progressBar.gameObject.transform.parent.gameObject.SetActive(false);
        }

        private void CancelGathering()
        {
            _isGathering = false;
            _gatherProgress = 0f;
            if (_activeNode?.progressBar != null)
                _activeNode.progressBar.gameObject.transform.parent.gameObject.SetActive(false);
        }

        private void DepleteNode(GatheringNodeInstance node)
        {
            node.depleted = true;

            // Gray out and shrink
            if (node.renderer != null)
            {
                var depletedMat = new Material(Shader.Find("Standard"));
                depletedMat.color = new Color(0.4f, 0.4f, 0.4f, 0.5f);
                node.renderer.material = depletedMat;
            }
            node.gameObject.transform.localScale = Vector3.one * node.scale * 0.5f;

            StartCoroutine(RespawnAfterDelay(node));
        }

        private IEnumerator RespawnAfterDelay(GatheringNodeInstance node)
        {
            yield return new WaitForSeconds(node.respawnTime);

            node.currentAmount = node.maxAmount;
            node.depleted = false;
            node.gameObject.transform.localScale = Vector3.one * node.scale;

            if (node.renderer != null)
                node.renderer.material = node.originalMaterial;

            Debug.Log($"[Insimul] Resource node {node.id} respawned");
        }

        private static void UpdateProgressBar(Image fill, float value)
        {
            fill.rectTransform.sizeDelta = new Vector2(value, 0f);
            fill.rectTransform.anchorMax = new Vector2(value, 1f);
        }

        public GatheringNodeInstance GetNearestNode()
        {
            return _activeNode;
        }

        public bool IsGathering() => _isGathering;
        public float GetGatherProgress() => _gatherProgress;
        public IReadOnlyList<GatheringNodeInstance> GetAllNodes() => _instances;
    }

    public class GatheringNodeInstance
    {
        public string id;
        public string resourceType;
        public GameObject gameObject;
        public MeshRenderer renderer;
        public Material originalMaterial;
        public Image progressBar;
        public int maxAmount;
        public int currentAmount;
        public float respawnTime;
        public float scale;
        public bool depleted;
    }
}
