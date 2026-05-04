using UnityEngine;
using System.Collections.Generic;

namespace Insimul.Characters
{
    /// <summary>
    /// Deterministic procedural NPC appearance from character ID hash.
    /// Builds a primitive-based body with skin tone, clothing, hair, and body type variation.
    /// </summary>
    public static class NPCAppearanceGenerator
    {
        private static readonly Vector3[] SkinTones = {
            new(0.96f,0.87f,0.77f), new(0.92f,0.78f,0.65f), new(0.84f,0.67f,0.52f), new(0.74f,0.56f,0.40f),
            new(0.62f,0.44f,0.30f), new(0.50f,0.35f,0.22f), new(0.40f,0.28f,0.18f), new(0.32f,0.22f,0.14f)
        };

        private static readonly Vector3[] ClothingColors = {
            new(0.2f,0.35f,0.6f), new(0.6f,0.2f,0.2f), new(0.2f,0.5f,0.25f), new(0.5f,0.4f,0.15f),
            new(0.45f,0.2f,0.5f), new(0.3f,0.3f,0.3f), new(0.55f,0.35f,0.2f), new(0.15f,0.4f,0.45f),
            new(0.65f,0.55f,0.3f), new(0.35f,0.15f,0.15f), new(0.2f,0.2f,0.4f), new(0.5f,0.5f,0.45f)
        };

        private static readonly Vector3[] HairColors = {
            new(0.1f,0.1f,0.1f), new(0.35f,0.2f,0.1f), new(0.75f,0.65f,0.3f),
            new(0.55f,0.2f,0.1f), new(0.5f,0.5f,0.5f), new(0.85f,0.85f,0.82f)
        };

        // Body types: torsoScale, limbWidth
        private static readonly (Vector3 torso, float limb)[] BodyTypes = {
            (new Vector3(0.35f,0.35f,0.22f), 0.10f),
            (new Vector3(0.40f,0.32f,0.26f), 0.13f),
            (new Vector3(0.30f,0.38f,0.19f), 0.08f),
            (new Vector3(0.42f,0.33f,0.28f), 0.14f)
        };

        private static readonly Dictionary<string, Vector3> RoleTints = new() {
            {"guard",       new Vector3(0.7f,0.3f,0.3f)},
            {"soldier",     new Vector3(0.7f,0.3f,0.3f)},
            {"merchant",    new Vector3(0.8f,0.7f,0.4f)},
            {"shopkeeper",  new Vector3(0.8f,0.7f,0.4f)},
            {"vendor",      new Vector3(0.8f,0.7f,0.4f)},
            {"questgiver",  new Vector3(0.3f,0.4f,0.8f)},
            {"priest",      new Vector3(0.9f,0.9f,0.8f)},
            {"healer",      new Vector3(0.9f,0.9f,0.8f)},
            {"blacksmith",  new Vector3(0.4f,0.35f,0.3f)},
            {"farmer",      new Vector3(0.5f,0.6f,0.3f)}
        };

        private static readonly Dictionary<string, Material> _materialCache = new();

        public static GameObject BuildNPCModel(string characterId, string role, string gender, Transform parent)
        {
            var root = new GameObject("AppearanceRoot");
            root.transform.SetParent(parent);
            root.transform.localPosition = Vector3.zero;

            int hash = characterId?.GetHashCode() ?? 0;
            var rng = new System.Random(hash);

            var skin = SkinTones[rng.Next(SkinTones.Length)];
            var clothing = ClothingColors[rng.Next(ClothingColors.Length)];
            var body = BodyTypes[rng.Next(BodyTypes.Length)];
            var hairColor = HairColors[rng.Next(HairColors.Length)];
            bool hasHair = rng.NextDouble() < 0.5;

            // Apply role tint
            string roleKey = role?.ToLowerInvariant() ?? "";
            if (RoleTints.TryGetValue(roleKey, out var tint))
                clothing = new Vector3(clothing.x * tint.x, clothing.y * tint.y, clothing.z * tint.z);

            var skinMat = GetOrCreateMaterial(skin);
            var clothMat = GetOrCreateMaterial(clothing);

            float torsoHalfWidth = body.torso.x * 0.5f;
            float limbW = body.limb;

            // Head
            CreatePart(PrimitiveType.Sphere, root.transform, new Vector3(0,1.6f,0), new Vector3(0.3f,0.35f,0.3f), skinMat, "Head");

            // Torso
            CreatePart(PrimitiveType.Capsule, root.transform, new Vector3(0,1.1f,0), body.torso, clothMat, "Torso");

            // Arms
            CreatePart(PrimitiveType.Capsule, root.transform, new Vector3(-(torsoHalfWidth-0.03f),1.1f,0), new Vector3(limbW,0.25f,limbW), clothMat, "LeftArm");
            CreatePart(PrimitiveType.Capsule, root.transform, new Vector3(torsoHalfWidth-0.03f,1.1f,0), new Vector3(limbW,0.25f,limbW), clothMat, "RightArm");

            // Legs
            CreatePart(PrimitiveType.Capsule, root.transform, new Vector3(-0.1f,0.45f,0), new Vector3(limbW+0.02f,0.3f,limbW+0.02f), clothMat, "LeftLeg");
            CreatePart(PrimitiveType.Capsule, root.transform, new Vector3(0.1f,0.45f,0), new Vector3(limbW+0.02f,0.3f,limbW+0.02f), clothMat, "RightLeg");

            // Hair
            if (hasHair)
            {
                var hairMat = GetOrCreateMaterial(hairColor);
                CreatePart(PrimitiveType.Sphere, root.transform, new Vector3(0,1.78f,0), new Vector3(0.28f,0.12f,0.28f), hairMat, "Hair");
            }

            return root;
        }

        private static void CreatePart(PrimitiveType type, Transform parent, Vector3 localPos, Vector3 scale, Material mat, string name)
        {
            var obj = GameObject.CreatePrimitive(type);
            obj.name = name;
            obj.transform.SetParent(parent);
            obj.transform.localPosition = localPos;
            obj.transform.localScale = scale;
            obj.GetComponent<Renderer>().sharedMaterial = mat;

            var col = obj.GetComponent<Collider>();
            if (col != null) Object.Destroy(col);
        }

        private static Material GetOrCreateMaterial(Vector3 rgb)
        {
            var hex = ColorUtility.ToHtmlStringRGB(new Color(rgb.x, rgb.y, rgb.z));
            var key = $"npc_{hex}";

            if (_materialCache.TryGetValue(key, out var cached))
                return cached;

            var mat = new Material(Shader.Find("Standard"));
            mat.color = new Color(rgb.x, rgb.y, rgb.z);
            mat.SetFloat("_Glossiness", 0.15f);
            _materialCache[key] = mat;
            return mat;
        }
    }
}
