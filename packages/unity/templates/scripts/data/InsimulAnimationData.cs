using System;

namespace Insimul.Data
{
    /// <summary>
    /// Animation reference data matching AnimationReferenceIR from ir-types.ts.
    /// </summary>
    [Serializable]
    public class InsimulAnimationData
    {
        public string name;
        public string animationType;
        public string assetPath;
        public int[] frameRange;
        public bool loop = true;
        public float speedRatio = 1f;
        public string format;
        public string skeletonType;
        public bool isMixamo;
    }
}
