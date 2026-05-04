using UnityEngine;
using System.Collections.Generic;
using Insimul.Data;

namespace Insimul.Characters
{
    /// <summary>
    /// Assembles NPC characters from modular Quaternius parts.
    /// Loads base body, hair, and outfit pieces via Resources.Load,
    /// then attaches them to the SkinnedMeshRenderer bone hierarchy.
    /// Selection logic: genre + gender + body type + role with fallback chain.
    /// </summary>
    public class NPCModularAssembler : MonoBehaviour
    {
        [Header("Assembly Settings")]
        public string genre = "fantasy";
        public string gender = "male";
        public string bodyType = "average";
        public string role = "civilian";

        private static readonly string[] BODY_TYPES = { "average", "athletic", "heavy", "slim", "elderly" };
        private static readonly string[] HAIR_CATEGORIES = { "short", "medium", "long", "bald", "hat" };

        private readonly List<GameObject> _attachedParts = new List<GameObject>();

        public void Assemble(InsimulNPCData data, string worldGenre)
        {
            genre = worldGenre ?? "generic";
            gender = data.gender ?? "male";
            bodyType = data.bodyType ?? "average";
            role = data.role ?? "civilian";

            ClearParts();
            AttachBody();
            AttachHair(data.characterId);
            AttachOutfit(data.characterId);

            Debug.Log($"[Insimul] Assembled NPC {data.characterId}: {genre}/{gender}/{bodyType}/{role}");
        }

        private void ClearParts()
        {
            foreach (var part in _attachedParts)
            {
                if (part != null) Destroy(part);
            }
            _attachedParts.Clear();
        }

        private void AttachBody()
        {
            string[] paths = {
                $"Models/Characters/Bodies/{genre}_{gender}_{bodyType}",
                $"Models/Characters/Bodies/{gender}_{bodyType}",
                $"Models/Characters/Bodies/generic_{gender}_average",
                "Models/Characters/Bodies/generic_male_average"
            };

            foreach (string path in paths)
            {
                var prefab = Resources.Load<GameObject>(path);
                if (prefab != null)
                {
                    var body = Instantiate(prefab, transform);
                    body.name = "Body";
                    _attachedParts.Add(body);
                    return;
                }
            }

            BuildFallbackBody();
        }

        private void AttachHair(string characterId)
        {
            int seed = characterId.GetHashCode();
            var rng = new System.Random(seed);
            string category = HAIR_CATEGORIES[rng.Next(HAIR_CATEGORIES.Length)];
            int index = rng.Next(20);

            string[] paths = {
                $"Models/Characters/Hair/{gender}_{category}_{index:D3}",
                $"Models/Characters/Hair/{category}_{index:D3}",
                $"Models/Characters/Hair/generic_{category}_000"
            };

            foreach (string path in paths)
            {
                var prefab = Resources.Load<GameObject>(path);
                if (prefab != null)
                {
                    var hair = Instantiate(prefab, transform);
                    hair.name = "Hair";
                    AttachToBone(hair, "Head");
                    _attachedParts.Add(hair);
                    return;
                }
            }
        }

        private void AttachOutfit(string characterId)
        {
            int seed = (characterId + "_outfit").GetHashCode();
            var rng = new System.Random(seed);

            string[] outfitSets = GetOutfitSetsForRole(role);
            string chosenSet = outfitSets[rng.Next(outfitSets.Length)];

            string[] pieces = { "top", "bottom", "shoes" };
            foreach (string piece in pieces)
            {
                string[] paths = {
                    $"Models/Characters/Outfits/{genre}/{gender}/{chosenSet}_{piece}",
                    $"Models/Characters/Outfits/{gender}/{chosenSet}_{piece}",
                    $"Models/Characters/Outfits/generic/{gender}/civilian_{piece}"
                };

                foreach (string path in paths)
                {
                    var prefab = Resources.Load<GameObject>(path);
                    if (prefab != null)
                    {
                        var outfit = Instantiate(prefab, transform);
                        outfit.name = $"Outfit_{piece}";
                        _attachedParts.Add(outfit);
                        break;
                    }
                }
            }
        }

        private string[] GetOutfitSetsForRole(string npcRole)
        {
            switch (npcRole)
            {
                case "guard": return new[] { "guard_armor", "guard_chainmail", "guard_leather" };
                case "merchant": return new[] { "merchant_robe", "merchant_apron", "merchant_vest" };
                case "noble": return new[] { "noble_gown", "noble_suit", "noble_royal" };
                case "farmer": return new[] { "farmer_overalls", "farmer_tunic", "farmer_simple" };
                case "blacksmith": return new[] { "smith_apron", "smith_heavy", "worker_vest" };
                default: return new[] { "civilian_casual", "civilian_tunic", "civilian_shirt" };
            }
        }

        private void AttachToBone(GameObject part, string boneName)
        {
            var skinnedMesh = GetComponentInChildren<SkinnedMeshRenderer>();
            if (skinnedMesh == null) return;

            foreach (var bone in skinnedMesh.bones)
            {
                if (bone.name.Contains(boneName))
                {
                    part.transform.SetParent(bone, false);
                    part.transform.localPosition = Vector3.zero;
                    part.transform.localRotation = Quaternion.identity;
                    return;
                }
            }
        }

        private void BuildFallbackBody()
        {
            var capsule = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            capsule.name = "FallbackBody";
            capsule.transform.SetParent(transform, false);
            capsule.transform.localPosition = new Vector3(0f, 1f, 0f);
            Object.Destroy(capsule.GetComponent<Collider>());
            _attachedParts.Add(capsule);
        }

        private void OnDestroy()
        {
            ClearParts();
        }
    }
}
