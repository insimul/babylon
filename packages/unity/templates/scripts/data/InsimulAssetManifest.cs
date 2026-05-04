using System;

namespace Insimul.Data
{
    /// <summary>
    /// Matches the structure of Assets/Resources/Data/asset-manifest.json.
    /// Used at runtime to discover and load bundled GLTF/GLB assets.
    /// </summary>
    [Serializable]
    public class InsimulAssetManifest
    {
        public InsimulAssetManifestEntry[] assets;
    }

    [Serializable]
    public class InsimulAssetManifestEntry
    {
        public string exportPath;
        public string category;
        public string role;
        public int fileSize;
    }
}
