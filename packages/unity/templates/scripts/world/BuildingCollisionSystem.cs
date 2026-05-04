using UnityEngine;
using System.Collections.Generic;

namespace Insimul.World
{
    /// <summary>
    /// Manages building colliders and entry detection triggers.
    /// Matches shared/game-engine/rendering/BuildingCollisionSystem.ts and BuildingEntrySystem.ts.
    /// Adds colliders to buildings and trigger zones at doorways for interior entry.
    /// </summary>
    public class BuildingCollisionSystem : MonoBehaviour
    {
        [Header("Entry Detection")]
        [Tooltip("Size of the door trigger zone")]
        public Vector3 doorTriggerSize = new Vector3(2f, 3f, 1.5f);
        [Tooltip("Distance from building front to place the door trigger")]
        public float doorOffset = 0.5f;

        /// <summary>
        /// Set up collisions for a building GameObject.
        /// Adds a BoxCollider for the building body and a trigger collider at the door.
        /// </summary>
        public void SetupBuildingCollision(GameObject building, float width, float depth,
            int floors, string buildingId)
        {
            float height = floors * 3f;

            // Main body collider
            BoxCollider body = building.AddComponent<BoxCollider>();
            body.size = new Vector3(width, height, depth);
            body.center = new Vector3(0, height * 0.5f, 0);

            // Door trigger at front face
            GameObject doorTrigger = new GameObject("DoorTrigger");
            doorTrigger.transform.SetParent(building.transform, false);
            doorTrigger.transform.localPosition = new Vector3(0, doorTriggerSize.y * 0.5f,
                depth * 0.5f + doorOffset);
            doorTrigger.layer = LayerMask.NameToLayer("Ignore Raycast");

            BoxCollider trigger = doorTrigger.AddComponent<BoxCollider>();
            trigger.size = doorTriggerSize;
            trigger.isTrigger = true;

            var entry = doorTrigger.AddComponent<BuildingEntryTrigger>();
            entry.buildingId = buildingId;
        }

        /// <summary>
        /// Add MeshCollider to a building with a loaded model.
        /// </summary>
        public void SetupModelCollision(GameObject building, string buildingId)
        {
            // Use existing mesh for collision
            MeshFilter[] meshes = building.GetComponentsInChildren<MeshFilter>();
            if (meshes.Length > 0)
            {
                // Add convex MeshCollider to the root or first child with mesh
                foreach (var mf in meshes)
                {
                    if (mf.sharedMesh == null) continue;
                    var mc = mf.gameObject.AddComponent<MeshCollider>();
                    mc.convex = true;
                    break; // One collider is enough for the building shell
                }
            }
            else
            {
                // Fallback to bounds-based BoxCollider
                Renderer[] renderers = building.GetComponentsInChildren<Renderer>();
                if (renderers.Length > 0)
                {
                    Bounds combined = renderers[0].bounds;
                    for (int i = 1; i < renderers.Length; i++)
                        combined.Encapsulate(renderers[i].bounds);

                    BoxCollider box = building.AddComponent<BoxCollider>();
                    box.center = building.transform.InverseTransformPoint(combined.center);
                    box.size = combined.size;
                }
            }

            // Door trigger at front
            Bounds buildingBounds = CalculateBounds(building);
            if (buildingBounds.size != Vector3.zero)
            {
                GameObject doorTrigger = new GameObject("DoorTrigger");
                doorTrigger.transform.SetParent(building.transform, false);
                doorTrigger.transform.localPosition = new Vector3(0,
                    doorTriggerSize.y * 0.5f,
                    buildingBounds.extents.z + doorOffset);
                doorTrigger.layer = LayerMask.NameToLayer("Ignore Raycast");

                BoxCollider trigger = doorTrigger.AddComponent<BoxCollider>();
                trigger.size = doorTriggerSize;
                trigger.isTrigger = true;

                var entry = doorTrigger.AddComponent<BuildingEntryTrigger>();
                entry.buildingId = buildingId;
            }
        }

        private Bounds CalculateBounds(GameObject obj)
        {
            Renderer[] renderers = obj.GetComponentsInChildren<Renderer>();
            if (renderers.Length == 0)
                return new Bounds(Vector3.zero, Vector3.zero);

            Bounds b = renderers[0].bounds;
            for (int i = 1; i < renderers.Length; i++)
                b.Encapsulate(renderers[i].bounds);
            return b;
        }
    }

    /// <summary>
    /// Trigger component placed at building doorways.
    /// Detects player approach and triggers interior entry.
    /// </summary>
    public class BuildingEntryTrigger : MonoBehaviour
    {
        public string buildingId;

        private bool _playerInRange;

        void OnTriggerEnter(Collider other)
        {
            if (other.CompareTag("Player"))
            {
                _playerInRange = true;
                // Notify interaction prompt system
                var prompt = FindFirstObjectByType<Insimul.Systems.InteractionPromptSystem>();
                if (prompt != null)
                    prompt.ShowPrompt("Enter Building", transform.position + Vector3.up * 2f);
            }
        }

        void OnTriggerExit(Collider other)
        {
            if (other.CompareTag("Player"))
            {
                _playerInRange = false;
                var prompt = FindFirstObjectByType<Insimul.Systems.InteractionPromptSystem>();
                if (prompt != null)
                    prompt.HidePrompt();
            }
        }

        void Update()
        {
            if (_playerInRange && Input.GetKeyDown(KeyCode.E))
            {
                var interiorMgr = FindFirstObjectByType<InteriorSceneManager>();
                if (interiorMgr != null)
                    interiorMgr.EnterBuilding(buildingId);
            }
        }
    }
}
