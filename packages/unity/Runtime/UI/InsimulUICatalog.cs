// InsimulUICatalog.cs — creator-overridable panel catalog (US-UU1).
//
// A ScriptableObject a creator drops in their project to REPLACE any default
// panel wholesale (the module-registry pattern, plan §4.6): each entry maps a
// stable panel key to either a prefab (instantiated directly) or a Resources
// path. BuildRegistry() folds these entries into the pure InsimulUIRegistry as
// per-key overrides — which always win over the shipped defaults.
//
// UnityEngine-COUPLED, so it is NOT compiled by the host harness
// (tools/verify-unity) — structural-gate-only. The override PRECEDENCE it feeds
// is what the pure InsimulUIRegistry host-tests against the shared corpus.

using System.Collections.Generic;
using UnityEngine;

namespace Insimul.UI
{
    [CreateAssetMenu(menuName = "Insimul/UI Catalog", fileName = "InsimulUICatalog")]
    public sealed class InsimulUICatalog : ScriptableObject
    {
        /// <summary>One creator override: a panel key + how to source its view. A
        /// non-null <see cref="Prefab"/> wins; otherwise <see cref="ResourcePath"/>
        /// (a Resources.Load path) is used.</summary>
        [System.Serializable]
        public sealed class Entry
        {
            [Tooltip("Panel key, e.g. quest_journal / inventory / dialogue.")]
            public string Key;

            [Tooltip("Prefab to instantiate for this panel (wins over Resource Path).")]
            public GameObject Prefab;

            [Tooltip("Optional Resources.Load path; used when Prefab is unset.")]
            public string ResourcePath;
        }

        [SerializeField]
        [Tooltip("Per-key panel overrides. Any key here replaces the shipped default.")]
        private List<Entry> _overrides = new List<Entry>();

        public IReadOnlyList<Entry> Overrides => _overrides;

        /// <summary>A pure registry seeded with the shipped defaults plus this
        /// catalog's overrides (as opaque string refs — prefab name or Resources
        /// path). Drives the diagnostics + precedence logic; instantiation goes
        /// through PrefabFor()/InsimulUIManager.</summary>
        public InsimulUIRegistry BuildRegistry()
        {
            var registry = new InsimulUIRegistry();
            foreach (var e in _overrides)
            {
                if (e == null || string.IsNullOrEmpty(e.Key)) continue;
                string refStr = !string.IsNullOrEmpty(e.ResourcePath)
                    ? e.ResourcePath
                    : (e.Prefab != null ? e.Prefab.name : null);
                if (!string.IsNullOrEmpty(refStr)) registry.Register(e.Key, refStr);
            }
            return registry;
        }

        /// <summary>The override prefab for <paramref name="key"/>, or null if the
        /// creator did not override it with a direct prefab reference.</summary>
        public GameObject PrefabFor(string key)
        {
            foreach (var e in _overrides)
                if (e != null && e.Key == key && e.Prefab != null) return e.Prefab;
            return null;
        }
    }
}
