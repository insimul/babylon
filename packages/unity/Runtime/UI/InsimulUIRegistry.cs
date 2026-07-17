// InsimulUIRegistry.cs — default-runtime UI panel registry (US-UU1).
//
// Maps a stable panel KEY (e.g. "quest_journal", "inventory", "dialogue") to an
// opaque scene reference (a prefab Resources/Addressables path in an exported
// game), with a creator OVERRIDE layer that always wins over the shipped default,
// plus missing-panel diagnostics. This is the Unity mirror of the engine-neutral
// registry contract; the behavior (default lookup, override precedence, missing
// diagnostics) is pinned by the shared cases in
// packages/core/conformance/ui/registry-cases.json — every engine (Babylon /
// Unreal / Godot / Unity) runs the SAME cases; only the concrete default map
// differs per engine.
//
// This type is deliberately UnityEngine-FREE so it host-tests on a bare .NET SDK
// (tools/verify-unity, the authoritative gate). The instantiation seam — turning
// a resolved scene ref into a live GameObject — lives in the UnityEngine-coupled
// InsimulUIManager MonoBehaviour + InsimulUICatalog ScriptableObject, which are
// structural-gate-only. SceneRef(key) is pure data (what the shared cases
// exercise); the manager does the Resources.Load/Instantiate.

using System;
using System.Collections.Generic;

namespace Insimul.UI
{
    /// <summary>A creator-facing diagnostic recorded when a panel key fails to
    /// resolve or (in the manager layer) fails to load — a "why is this panel
    /// blank" breadcrumb. Kind is a stable machine token; Message is human text.</summary>
    public readonly struct UIRegistryDiagnostic
    {
        public readonly string Kind;
        public readonly string Key;
        public readonly string Message;

        public UIRegistryDiagnostic(string kind, string key, string message)
        {
            Kind = kind;
            Key = key;
            Message = message;
        }

        public override string ToString() => $"[{Kind}] {Key}: {Message}";
    }

    /// <summary>Panel-key → scene-ref registry with a creator override layer and
    /// missing-panel diagnostics. Pure data; no Unity types.</summary>
    public sealed class InsimulUIRegistry
    {
        /// <summary>The canonical default panel map. Keys mirror
        /// packages/core/conformance/ui/registry-cases.json → <c>panel_keys</c>.
        /// The refs are opaque prefab addresses under <c>Insimul/UI/</c> (a
        /// Resources path in an exported game); a creator overrides any of them via
        /// InsimulUICatalog or a Register() call.</summary>
        public static readonly IReadOnlyDictionary<string, string> DefaultPanels =
            new Dictionary<string, string>(StringComparer.Ordinal)
            {
                { "loading_screen", "Insimul/UI/LoadingScreen" },
                { "notifications",  "Insimul/UI/NotificationSystem" },
                { "hud",            "Insimul/UI/HUD" },
                { "main_menu",      "Insimul/UI/MainMenu" },
                { "game_menu",      "Insimul/UI/GameMenu" },
                { "quest_journal",  "Insimul/UI/QuestJournal" },
                { "quest_tracker",  "Insimul/UI/QuestTracker" },
                { "quest_offer",    "Insimul/UI/QuestOffer" },
                { "inventory",      "Insimul/UI/Inventory" },
                { "container",      "Insimul/UI/Container" },
                { "merchant",       "Insimul/UI/Merchant" },
                { "dialogue",       "Insimul/UI/Dialogue" },
                { "pause_menu",     "Insimul/UI/PauseMenu" },
                { "save_load",      "Insimul/UI/SaveLoad" },
            };

        private readonly Dictionary<string, string> _defaults;
        private readonly Dictionary<string, string> _overrides =
            new Dictionary<string, string>(StringComparer.Ordinal);
        private readonly List<UIRegistryDiagnostic> _diagnostics = new List<UIRegistryDiagnostic>();

        /// <summary>Seed with the shipped defaults. Pass a custom default map
        /// (opaque scene ids) to run the shared registry cases; omit for the real
        /// default-UI panel set.</summary>
        public InsimulUIRegistry(IReadOnlyDictionary<string, string> defaults = null)
        {
            _defaults = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var kv in defaults ?? DefaultPanels)
                _defaults[kv.Key] = kv.Value;
        }

        /// <summary>Apply an override map directly (key → scene ref). Later calls win.</summary>
        public void ApplyOverrides(IReadOnlyDictionary<string, string> overrides)
        {
            if (overrides == null) return;
            foreach (var kv in overrides)
                _overrides[kv.Key] = kv.Value;
        }

        /// <summary>Register / override a single panel's scene ref.</summary>
        public void Register(string key, string sceneRef) => _overrides[key] = sceneRef;

        /// <summary>True if <paramref name="key"/> resolves to a default or an override.</summary>
        public bool Has(string key) => _overrides.ContainsKey(key) || _defaults.ContainsKey(key);

        /// <summary>True if <paramref name="key"/> is currently served by a creator
        /// override rather than the shipped default.</summary>
        public bool IsOverridden(string key) => _overrides.ContainsKey(key);

        /// <summary>The scene reference for <paramref name="key"/> (override wins over
        /// default). Returns <c>""</c> and records a <c>missing_panel</c> diagnostic
        /// when the key is unknown.</summary>
        public string SceneRef(string key)
        {
            if (_overrides.TryGetValue(key, out string ov)) return ov;
            if (_defaults.TryGetValue(key, out string def)) return def;
            _record("missing_panel", key, $"no panel registered for key '{key}'");
            return "";
        }

        /// <summary>All panel keys currently resolvable (defaults + overrides), sorted.</summary>
        public IReadOnlyList<string> Keys()
        {
            var merged = new SortedSet<string>(StringComparer.Ordinal);
            foreach (var k in _defaults.Keys) merged.Add(k);
            foreach (var k in _overrides.Keys) merged.Add(k);
            return new List<string>(merged);
        }

        /// <summary>Diagnostics accumulated by SceneRef() (and the manager's load
        /// path) — a creator-facing "why is this panel blank" log.</summary>
        public IReadOnlyList<UIRegistryDiagnostic> Diagnostics() =>
            _diagnostics.ToArray();

        public bool HasDiagnostics() => _diagnostics.Count > 0;

        public void ClearDiagnostics() => _diagnostics.Clear();

        /// <summary>Record a diagnostic (used by the manager layer for load failures).</summary>
        public void Record(string kind, string key, string message) => _record(kind, key, message);

        private void _record(string kind, string key, string message) =>
            _diagnostics.Add(new UIRegistryDiagnostic(kind, key, message));
    }
}
