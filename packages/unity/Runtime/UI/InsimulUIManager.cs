// InsimulUIManager.cs — thin runtime instantiation layer over the panel registry
// (US-UU1).
//
// The one MonoBehaviour a scene needs to open default-UI panels by key. It owns a
// pure InsimulUIRegistry (built from an optional InsimulUICatalog of creator
// overrides) and turns a resolved scene ref into a live GameObject: a direct
// override prefab wins, else Resources.Load(<ref>). Every failure is recorded on
// the registry's diagnostics AND logged, so a creator sees exactly which panel is
// blank and why.
//
// UnityEngine-COUPLED — structural-gate-only. The resolution/precedence/diagnostic
// LOGIC it delegates to lives in the host-tested pure InsimulUIRegistry.

using UnityEngine;

namespace Insimul.UI
{
    public sealed class InsimulUIManager : MonoBehaviour
    {
        [SerializeField]
        [Tooltip("Optional creator catalog. Its per-key overrides win over the shipped defaults.")]
        private InsimulUICatalog _catalog;

        private InsimulUIRegistry _registry;

        /// <summary>The resolved registry (defaults + catalog overrides), built lazily.</summary>
        public InsimulUIRegistry Registry =>
            _registry ??= (_catalog != null ? _catalog.BuildRegistry() : new InsimulUIRegistry());

        /// <summary>Instantiate the panel for <paramref name="key"/> under
        /// <paramref name="parent"/> (or unparented). Returns null and logs a
        /// diagnostic when the key is unknown or its prefab cannot be loaded.</summary>
        public GameObject Open(string key, Transform parent = null)
        {
            InsimulUIRegistry registry = Registry;

            GameObject prefab = _catalog != null ? _catalog.PrefabFor(key) : null;
            if (prefab == null)
            {
                string refStr = registry.SceneRef(key);
                if (string.IsNullOrEmpty(refStr))
                {
                    Warn(registry, key);
                    return null;
                }
                prefab = Resources.Load<GameObject>(refStr);
                if (prefab == null)
                {
                    registry.Record("missing_prefab", key, $"Resources.Load failed for '{refStr}'");
                    Warn(registry, key);
                    return null;
                }
            }

            return parent != null ? Instantiate(prefab, parent) : Instantiate(prefab);
        }

        private static void Warn(InsimulUIRegistry registry, string key)
        {
            var diags = registry.Diagnostics();
            string last = diags.Count > 0 ? diags[diags.Count - 1].ToString() : $"panel '{key}' unavailable";
            Debug.LogWarning($"[InsimulUI] {last}");
        }
    }
}
