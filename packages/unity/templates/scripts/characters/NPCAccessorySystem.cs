using UnityEngine;
using System.Collections.Generic;
using Insimul.Data;

namespace Insimul.Characters
{
    /// <summary>
    /// Attaches accessories (hats, glasses, jewelry, weapons, tools) to NPC skeleton
    /// at appropriate bone transforms. Generates appearance variations deterministically
    /// from character seed so each NPC looks unique. Accessories match occupation and social status.
    /// </summary>
    public class NPCAccessorySystem : MonoBehaviour
    {
        private static readonly Dictionary<string, string[]> OCCUPATION_ACCESSORIES = new Dictionary<string, string[]>
        {
            { "guard",      new[] { "sword", "shield", "helmet" } },
            { "merchant",   new[] { "pouch", "scales", "hat_merchant" } },
            { "blacksmith", new[] { "hammer", "tongs", "apron_leather" } },
            { "farmer",     new[] { "pitchfork", "hat_straw", "basket" } },
            { "noble",      new[] { "ring_gold", "necklace", "crown" } },
            { "tavern",     new[] { "mug", "apron_cloth", "towel" } },
            { "healer",     new[] { "staff", "pouch_herbs", "amulet" } },
            { "scholar",    new[] { "glasses", "book", "quill" } },
        };

        private static readonly Dictionary<string, string> BONE_MAPPINGS = new Dictionary<string, string>
        {
            { "helmet",       "Head" },
            { "hat_merchant", "Head" },
            { "hat_straw",    "Head" },
            { "crown",        "Head" },
            { "glasses",      "Head" },
            { "sword",        "RightHand" },
            { "staff",        "RightHand" },
            { "hammer",       "RightHand" },
            { "pitchfork",    "RightHand" },
            { "quill",        "RightHand" },
            { "shield",       "LeftHand" },
            { "mug",          "LeftHand" },
            { "book",         "LeftHand" },
            { "tongs",        "LeftHand" },
            { "basket",       "LeftHand" },
            { "necklace",     "Spine" },
            { "amulet",       "Spine" },
            { "pouch",        "Hips" },
            { "pouch_herbs",  "Hips" },
            { "scales",       "Hips" },
            { "ring_gold",    "LeftHand" },
            { "towel",        "LeftHand" },
        };

        private readonly List<GameObject> _accessories = new List<GameObject>();

        public void GenerateAccessories(InsimulNPCData data)
        {
            ClearAccessories();

            int seed = data.characterId.GetHashCode();
            var rng = new System.Random(seed);

            string occupation = data.role ?? "civilian";
            string[] available;
            if (!OCCUPATION_ACCESSORIES.TryGetValue(occupation, out available))
                available = new[] { "pouch", "hat_straw" };

            int maxAccessories = Mathf.Min(2, available.Length);
            int count = rng.Next(1, maxAccessories + 1);

            var chosen = new List<string>(available);
            Shuffle(chosen, rng);

            for (int i = 0; i < count && i < chosen.Count; i++)
            {
                AttachAccessory(chosen[i], data.characterId);
            }

            Debug.Log($"[Insimul] NPC {data.characterId} accessories: {count} items");
        }

        private void AttachAccessory(string accessoryId, string characterId)
        {
            string path = $"Models/Props/Accessories/{accessoryId}";
            var prefab = Resources.Load<GameObject>(path);

            GameObject accessory;
            if (prefab != null)
            {
                accessory = Instantiate(prefab);
            }
            else
            {
                accessory = GameObject.CreatePrimitive(PrimitiveType.Cube);
                accessory.transform.localScale = Vector3.one * 0.1f;
                Object.Destroy(accessory.GetComponent<Collider>());
            }

            accessory.name = $"Accessory_{accessoryId}";

            string boneName;
            if (!BONE_MAPPINGS.TryGetValue(accessoryId, out boneName))
                boneName = "Spine";

            var skinnedMesh = GetComponentInChildren<SkinnedMeshRenderer>();
            if (skinnedMesh != null)
            {
                foreach (var bone in skinnedMesh.bones)
                {
                    if (bone.name.Contains(boneName))
                    {
                        accessory.transform.SetParent(bone, false);
                        accessory.transform.localPosition = Vector3.zero;
                        accessory.transform.localRotation = Quaternion.identity;
                        _accessories.Add(accessory);
                        return;
                    }
                }
            }

            accessory.transform.SetParent(transform, false);
            _accessories.Add(accessory);
        }

        private void ClearAccessories()
        {
            foreach (var a in _accessories)
            {
                if (a != null) Destroy(a);
            }
            _accessories.Clear();
        }

        private static void Shuffle<T>(List<T> list, System.Random rng)
        {
            for (int i = list.Count - 1; i > 0; i--)
            {
                int j = rng.Next(i + 1);
                T tmp = list[i]; list[i] = list[j]; list[j] = tmp;
            }
        }

        private void OnDestroy()
        {
            ClearAccessories();
        }
    }
}
