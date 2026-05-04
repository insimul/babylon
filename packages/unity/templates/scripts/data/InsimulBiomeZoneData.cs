using System;

namespace Insimul.Data
{
    [Serializable]
    public class InsimulBiomeZoneSpecies
    {
        public string id;
        public string name;
        public string category;
        public float density;
        public float[] scaleRange;
        public string treeType;
    }

    [Serializable]
    public class InsimulBiomeZoneData
    {
        public string id;
        public string biome;
        public string elevationZone;
        public string moistureLevel;
        public int cellCount;
        public float coverageFraction;
        public float averageElevation;
        public float averageMoisture;
        public InsimulBiomeZoneSpecies[] species;
    }
}
