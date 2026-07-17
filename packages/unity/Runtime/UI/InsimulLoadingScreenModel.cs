// InsimulLoadingScreenModel.cs — loading-screen view-model driven by the runtime
// startup phases (US-UU1).
//
// The boot loop (world source → save slot → KB → systems init; see
// InsimulRuntimeContext.Boot / the InsimulRuntimeBootstrap MonoBehaviour) advances
// this model through an ordered set of weighted phases. The model turns the
// current phase into a MONOTONIC progress fraction in [0, 1], a human label, and a
// deterministic per-phase tip.
//
// Contract + shared cases: packages/core/conformance/ui/loading-phases.json. The
// same weighted-cumulative-progress rule is asserted by every default-UI mirror
// (Babylon / Godot / Unreal), so the default phase table below MUST match the
// corpus. A custom table can be injected (e.g. by the parity test) via the
// constructor.
//
// UnityEngine-FREE so it host-tests on a bare .NET SDK (tools/verify-unity). The
// thin MonoBehaviour that renders it (InsimulLoadingScreen, structural-gate-only)
// just reflects Progress()/Label()/Tip()/IsComplete() into UGUI widgets.

using System;
using System.Collections.Generic;

namespace Insimul.UI
{
    /// <summary>One ordered startup phase: a stable <see cref="Key"/>, a human
    /// <see cref="Label"/>, and a <see cref="Weight"/> (its share of the total
    /// progress bar).</summary>
    public readonly struct LoadingPhase
    {
        public readonly string Key;
        public readonly string Label;
        public readonly int Weight;

        public LoadingPhase(string key, string label, int weight)
        {
            Key = key;
            Label = label;
            Weight = weight;
        }
    }

    /// <summary>Weighted-phase loading-screen view-model. Progress at a phase =
    /// cumulative weight through that phase ÷ total weight; never regresses.</summary>
    public sealed class InsimulLoadingScreenModel
    {
        /// <summary>Ordered default phases. Mirrors
        /// packages/core/conformance/ui/loading-phases.json → <c>phases</c>.</summary>
        public static readonly IReadOnlyList<LoadingPhase> DefaultPhases = new[]
        {
            new LoadingPhase("init",    "Starting up…",               1),
            new LoadingPhase("world",   "Loading world…",             3),
            new LoadingPhase("save",    "Restoring save…",            2),
            new LoadingPhase("kb",      "Building knowledge base…",   2),
            new LoadingPhase("systems", "Initializing systems…",      1),
            new LoadingPhase("ready",   "Ready",                      1),
        };

        /// <summary>Deterministic tip pool. Tip() returns the tip at
        /// (phase index % tips.Count). Mirrors loading-phases.json → <c>tips</c>.</summary>
        public static readonly IReadOnlyList<string> DefaultTips = new[]
        {
            "Talk to villagers to uncover radiant quests.",
            "Every conversation is generated live — no two runs are alike.",
            "Check the quest journal (J) to track objectives.",
            "Your progress autosaves to the active slot.",
        };

        private readonly List<LoadingPhase> _phases;
        private readonly List<string> _tips;
        private readonly int _totalWeight;
        private string _currentKey = "";
        private float _progress;

        /// <summary>Optional injection of a custom phase table / tip pool (used by the
        /// parity test to run the shared corpus). An empty/null argument falls back to
        /// the defaults.</summary>
        public InsimulLoadingScreenModel(
            IReadOnlyList<LoadingPhase> phases = null,
            IReadOnlyList<string> tips = null)
        {
            _phases = new List<LoadingPhase>(phases != null && phases.Count > 0 ? phases : DefaultPhases);
            _tips = new List<string>(tips != null && tips.Count > 0 ? tips : DefaultTips);
            _totalWeight = 0;
            foreach (var p in _phases) _totalWeight += p.Weight;
            if (_totalWeight <= 0) _totalWeight = 1;
        }

        /// <summary>Advance to a named phase. Progress is clamped monotonic —
        /// re-entering the current phase, or a phase earlier in the order, never
        /// lowers the bar. An unknown key is ignored.</summary>
        public void Advance(string key)
        {
            int idx = IndexOf(key);
            if (idx < 0) return;
            _currentKey = key;
            int cumulative = 0;
            for (int i = 0; i <= idx; i++) cumulative += _phases[i].Weight;
            float next = (float)cumulative / _totalWeight;
            if (next > _progress) _progress = next;
        }

        public float Progress() => _progress;

        public string Label()
        {
            int idx = IndexOf(_currentKey);
            return idx < 0 ? "" : _phases[idx].Label;
        }

        /// <summary>Deterministic per-phase tip (index by phase position, wrapping the
        /// tip pool).</summary>
        public string Tip()
        {
            int idx = IndexOf(_currentKey);
            if (idx < 0 || _tips.Count == 0) return "";
            return _tips[idx % _tips.Count];
        }

        public string CurrentPhase() => _currentKey;

        /// <summary>True once the final (terminal) phase has been reached.</summary>
        public bool IsComplete()
        {
            if (_phases.Count == 0) return false;
            return _currentKey == _phases[_phases.Count - 1].Key;
        }

        public void Reset()
        {
            _currentKey = "";
            _progress = 0f;
        }

        private int IndexOf(string key)
        {
            for (int i = 0; i < _phases.Count; i++)
                if (_phases[i].Key == key) return i;
            return -1;
        }
    }
}
