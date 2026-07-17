using UnityEngine;

namespace Insimul.Scene
{
    /// <summary>
    /// Stamps a generated GameObject with its stable IR entity ID + a
    /// generated-content flag (US-UB3). This is the match key the conservative
    /// re-import diff (US-UB4) uses: generated-tagged objects are updated in
    /// place on re-generate, hand-placed (untagged) objects are never touched.
    ///
    /// UnityEngine-coupled (a MonoBehaviour), so it is structural-gate-only — the
    /// pure placement core (SceneGenerator/ScenePipeline) computes the IDs it
    /// stamps and is host-tested; this component only carries them at runtime.
    /// </summary>
    [DisallowMultipleComponent]
    public sealed class InsimulEntityId : MonoBehaviour
    {
        [Tooltip("Stable entity ID from the World IR — the re-import diff match key.")]
        public string entityId = "";

        [Tooltip("Coarse node category: terrain_chunk | road | building | interior | prop | nav_region.")]
        public string kind = "";

        [Tooltip("Resolved archetype key (empty for interiors / the nav root).")]
        public string archetype = "";

        [Tooltip("Binding layer this object's asset resolved from (empty when unbound).")]
        public string bindingSource = "";

        [Tooltip("True for pipeline-generated objects; the re-import diff only ever mutates these.")]
        public bool generated = true;
    }
}
