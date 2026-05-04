using UnityEngine;
using UnityEngine.AI;
using Insimul.Data;

namespace Insimul.Characters
{
    /// <summary>
    /// Spawns and manages all NPCs from IR data.
    /// On Awake, reads Assets/Resources/Data/asset-manifest.json to find a bundled
    /// character GLTF/GLB model loaded via Resources.Load. Falls back to a capsule
    /// primitive when no character asset is available.
    /// </summary>
    public class NPCManager : MonoBehaviour
    {
        private GameObject _npcModelPrefab = null;

        private void Awake()
        {
            LoadNPCModelFromManifest();
        }

        private void LoadNPCModelFromManifest()
        {
            var manifestAsset = Resources.Load<TextAsset>("Data/asset-manifest");
            if (manifestAsset == null)
            {
                Debug.LogWarning("[Insimul] NPCManager: asset-manifest not found — using capsule fallback");
                return;
            }

            var manifest = JsonUtility.FromJson<InsimulAssetManifest>(manifestAsset.text);
            if (manifest?.assets == null) return;

            foreach (var entry in manifest.assets)
            {
                if (entry.category != "character") continue;
                // Skip player-only assets
                if (entry.role == "player_default" || entry.role == "player_texture") continue;
                if (string.IsNullOrEmpty(entry.exportPath)) continue;

                var resourcePath = System.IO.Path.ChangeExtension(entry.exportPath, null);
                var prefab = Resources.Load<GameObject>(resourcePath);
                if (prefab != null)
                {
                    _npcModelPrefab = prefab;
                    Debug.Log($"[Insimul] NPCManager: loaded NPC model — {entry.exportPath}");
                    return;
                }
            }
            Debug.LogWarning("[Insimul] NPCManager: no character asset found in manifest — using capsule fallback");
        }

        public void SpawnNPCs(InsimulWorldIR worldData)
        {
            if (worldData?.entities?.npcs == null) return;

            foreach (var npcData in worldData.entities.npcs)
                SpawnNPC(npcData);

            Debug.Log($"[Insimul] Spawned {worldData.entities.npcs.Length} NPCs");
        }

        private void SpawnNPC(InsimulNPCData data)
        {
            var position = data.homePosition.ToVector3();

            var npcObj = new GameObject($"NPC_{data.characterId}");
            npcObj.tag = "NPC";
            npcObj.transform.position = position;
            npcObj.transform.SetParent(transform);

            if (_npcModelPrefab != null)
            {
                var model = Instantiate(_npcModelPrefab, npcObj.transform);
                model.name = "Model";
                model.transform.localPosition = Vector3.zero;
            }
            else
            {
                // Find matching character data for gender/role info
                string gender = null;
                var gm = Insimul.Core.InsimulGameManager.Instance;
                if (gm?.WorldData?.entities?.characters != null)
                {
                    foreach (var c in gm.WorldData.entities.characters)
                    {
                        if (c.id == data.characterId) { gender = c.gender; break; }
                    }
                }
                NPCAppearanceGenerator.BuildNPCModel(data.characterId, data.role, gender, npcObj.transform);
            }

            npcObj.AddComponent<NavMeshAgent>();
            var controller = npcObj.AddComponent<NPCController>();
            controller.InitFromData(data);

            // LOD: full model at 0-40m, simplified capsule at 40-80m, cull beyond 80m
            AddNPCLOD(npcObj);
        }

        private void AddNPCLOD(GameObject npcObj)
        {
            var fullRenderers = npcObj.GetComponentsInChildren<Renderer>();
            if (fullRenderers.Length == 0) return;

            // Create LOD 1: simplified single capsule with averaged color
            Color avgColor = Color.gray;
            if (fullRenderers.Length > 0 && fullRenderers[0].sharedMaterial != null)
                avgColor = fullRenderers[0].sharedMaterial.color;

            var lodProxy = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            lodProxy.name = "LOD_Proxy";
            lodProxy.transform.SetParent(npcObj.transform, false);
            lodProxy.transform.localPosition = new Vector3(0, 0.9f, 0);
            lodProxy.transform.localScale = new Vector3(0.4f, 0.9f, 0.4f);
            Object.Destroy(lodProxy.GetComponent<Collider>());

            var proxyMat = new Material(Shader.Find("Standard"));
            proxyMat.color = avgColor;
            proxyMat.SetFloat("_Glossiness", 0.1f);
            lodProxy.GetComponent<Renderer>().sharedMaterial = proxyMat;
            lodProxy.SetActive(false); // LODGroup manages visibility

            var proxyRenderers = new Renderer[] { lodProxy.GetComponent<Renderer>() };

            var lodGroup = npcObj.AddComponent<LODGroup>();
            lodGroup.SetLODs(new LOD[]
            {
                new LOD(0.04f, fullRenderers),      // LOD 0: full model (~40m)
                new LOD(0.015f, proxyRenderers),     // LOD 1: capsule proxy (~80m)
                new LOD(0f, new Renderer[0])         // LOD 2: culled
            });
            lodGroup.RecalculateBounds();
        }
    }
}
