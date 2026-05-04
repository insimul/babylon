using System;
using UnityEngine;

namespace Insimul.Data
{
    [Serializable]
    public class InsimulWaterFeatureData
    {
        public string id;
        public string name;
        public string type;
        public string subType;
        public Vec3Data position;
        public float waterLevel;
        public InsimulBoundsData bounds;
        public float depth;
        public float width;
        public Vec3Data flowDirection;
        public float flowSpeed;
        public Vec3Data[] shorelinePoints;
        public bool isNavigable = true;
        public bool isDrinkable = true;
        public string settlementId;
        public string biome;
        public float transparency = 0.3f;
        public string modelAssetKey;
        public ColorData color;
    }

    [Serializable]
    public class InsimulBoundsData
    {
        public float minX;
        public float maxX;
        public float minZ;
        public float maxZ;
        public float centerX;
        public float centerZ;
    }
}
