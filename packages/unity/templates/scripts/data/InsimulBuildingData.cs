using System;
using UnityEngine;

namespace Insimul.Data
{
    [Serializable]
    public class InsimulBuildingData
    {
        public string id;
        public string settlementId;
        public Vec3Data position;
        public float rotation;
        public string buildingRole;
        public int floors = 2;
        public float width = 10f;
        public float depth = 10f;
        public bool hasChimney;
        public bool hasBalcony;
        public string modelAssetKey;
        public string businessId;
    }
}
