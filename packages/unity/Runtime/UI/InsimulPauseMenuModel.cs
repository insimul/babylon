// InsimulPauseMenuModel.cs — unified pause / ESC-menu tab-gating view-model (US-UU5).
//
// The Unity mirror of the engine-neutral pause-menu contract
// (packages/core/src/ui/pause-menu-model.ts + the Godot pause_menu_model.gd). An
// ordered set of tabs, each optionally GATED by the feature modules the active genre
// bundle enabled (see packages/core/src/feature-modules/genre-bundles.ts). A tab with
// no requirement is always shown (the ungated core tabs: resume/journal/inventory/
// map/settings/save — the GameMenuSystem's always-present set); a gated tab shows only
// when EVERY module it requires is enabled. This is what "module-bundle-gated tabs"
// means — an RPG bundle hides the language Vocabulary/Analytics tabs, a
// language-learning bundle shows them.
//
// The shared cases live in packages/core/conformance/ui/pause-menu-cases.json, so every
// default-UI mirror (Babylon / Godot / Unreal / Unity) runs the SAME tab-gating matrix.
// The GenreDefaultModules table mirrors genre-bundles.ts so tab visibility can be driven
// straight off a genre id (rpg vs strategy vs language-learning show different tabs).
//
// UnityEngine-FREE so it host-tests on a bare .NET SDK (tools/verify-unity). The thin
// UGUI view (InsimulPauseMenu / InsimulGameMenu, structural-gate-only) owns the
// engine-coupled bits the model can't (pausing, input, mouse mode) and reflects
// VisibleTabs()/ActiveTab() into widgets.

using System.Collections.Generic;

namespace Insimul.UI
{
    /// <summary>One pause-menu tab: a stable key, a display label, and the module ids
    /// (if any) that must ALL be enabled for the tab to show.</summary>
    public sealed class MenuTabDef
    {
        public string Key = string.Empty;
        public string Label = string.Empty;
        /// <summary>Module ids that must all be enabled. Empty/null = always shown.</summary>
        public string[] Requires;

        public MenuTabDef() { }

        public MenuTabDef(string key, string label, params string[] requires)
        {
            Key = key;
            Label = label;
            Requires = (requires != null && requires.Length > 0) ? requires : null;
        }

        public MenuTabDef Clone() => new MenuTabDef
        {
            Key = Key,
            Label = Label,
            Requires = Requires == null ? null : (string[])Requires.Clone(),
        };
    }

    /// <summary>Unified pause / ESC-menu tab-gating view-model. Pure; no Unity types.</summary>
    public sealed class InsimulPauseMenuModel
    {
        /// <summary>Default pause-menu tabs. Core tabs (resume/journal/inventory/map/
        /// settings/save) are ungated; the learning/progression tabs gate on their
        /// module. Mirrors DEFAULT_MENU_TABS (TS) / DEFAULT_TABS (GDScript).</summary>
        public static readonly IReadOnlyList<MenuTabDef> DefaultTabs = new List<MenuTabDef>
        {
            new MenuTabDef("resume", "Resume"),
            new MenuTabDef("journal", "Journal"),
            new MenuTabDef("inventory", "Inventory"),
            new MenuTabDef("map", "Map"),
            new MenuTabDef("character", "Character", "proficiency"),
            new MenuTabDef("vocabulary", "Vocabulary", "knowledge-acquisition"),
            new MenuTabDef("skills", "Skills", "skill-tree"),
            new MenuTabDef("analytics", "Analytics", "conversation-analytics"),
            new MenuTabDef("assessment", "Assessment", "assessment"),
            new MenuTabDef("settings", "Settings"),
            new MenuTabDef("save", "Save / Load"),
        };

        /// <summary>Genre-bundle default module sets, mirroring
        /// packages/core/src/feature-modules/genre-bundles.ts. Drives tab visibility
        /// straight off a genre id — the IR's genre bundle picks which tabs light up.</summary>
        public static readonly IReadOnlyDictionary<string, string[]> GenreDefaultModules =
            new Dictionary<string, string[]>
            {
                ["language-learning"] = new[]
                {
                    "knowledge-acquisition", "proficiency", "pattern-recognition",
                    "performance-scoring", "voice", "gamification", "skill-tree",
                    "adaptive-difficulty", "world-lore", "conversation-analytics",
                    "assessment", "npc-exams", "onboarding",
                },
                ["rpg"] = new[]
                {
                    "knowledge-acquisition", "proficiency", "gamification", "skill-tree",
                    "adaptive-difficulty", "world-lore", "conversation-analytics", "onboarding",
                },
                ["survival"] = new[]
                {
                    "knowledge-acquisition", "proficiency", "gamification",
                    "adaptive-difficulty", "world-lore", "onboarding",
                },
                ["strategy"] = new[]
                {
                    "proficiency", "gamification", "adaptive-difficulty", "world-lore", "onboarding",
                },
                ["puzzle"] = new[]
                {
                    "pattern-recognition", "gamification", "adaptive-difficulty", "onboarding",
                },
                ["adventure"] = new[]
                {
                    "knowledge-acquisition", "gamification", "world-lore",
                    "conversation-analytics", "onboarding",
                },
                ["simulation"] = new[]
                {
                    "proficiency", "gamification", "world-lore", "conversation-analytics", "onboarding",
                },
                ["educational"] = new[]
                {
                    "knowledge-acquisition", "proficiency", "pattern-recognition", "assessment",
                    "gamification", "skill-tree", "adaptive-difficulty", "onboarding",
                },
            };

        private readonly List<MenuTabDef> _tabs = new List<MenuTabDef>();
        private readonly HashSet<string> _enabled = new HashSet<string>();
        private bool _open;
        private string _active = string.Empty;

        /// <summary>Construct with the enabled feature-module set (from the active genre
        /// bundle) and, optionally, a custom tab list. An empty/null tab list falls back
        /// to <see cref="DefaultTabs"/>.</summary>
        public InsimulPauseMenuModel(
            IEnumerable<string> enabledModules = null,
            IEnumerable<MenuTabDef> tabs = null)
        {
            if (enabledModules != null)
                foreach (string m in enabledModules)
                    if (!string.IsNullOrEmpty(m)) _enabled.Add(m);

            var supplied = tabs == null ? null : new List<MenuTabDef>(tabs);
            IReadOnlyList<MenuTabDef> source = (supplied != null && supplied.Count > 0)
                ? (IReadOnlyList<MenuTabDef>)supplied
                : DefaultTabs;
            foreach (MenuTabDef t in source) _tabs.Add(t.Clone());
        }

        /// <summary>Build a model from a genre id (the IR's genre bundle) — its default
        /// module set gates the tabs. An unknown genre enables no modules.</summary>
        public static InsimulPauseMenuModel ForGenre(
            string genreId, IEnumerable<MenuTabDef> tabs = null)
        {
            string[] modules = genreId != null && GenreDefaultModules.TryGetValue(genreId, out var m)
                ? m
                : new string[0];
            return new InsimulPauseMenuModel(modules, tabs);
        }

        /// <summary>True when every module a tab requires is enabled (ungated tabs
        /// always pass).</summary>
        private bool Gated(MenuTabDef tab)
        {
            if (tab.Requires == null) return true;
            foreach (string m in tab.Requires)
                if (!_enabled.Contains(m)) return false;
            return true;
        }

        /// <summary>Tabs visible under the current module set, in declaration order.</summary>
        public List<MenuTabDef> VisibleTabs()
        {
            var outList = new List<MenuTabDef>();
            foreach (MenuTabDef t in _tabs)
                if (Gated(t)) outList.Add(t.Clone());
            return outList;
        }

        public List<string> VisibleKeys()
        {
            var outList = new List<string>();
            foreach (MenuTabDef t in _tabs)
                if (Gated(t)) outList.Add(t.Key);
            return outList;
        }

        public bool IsVisible(string key)
        {
            if (key == null) return false;
            foreach (MenuTabDef t in _tabs)
                if (t.Key == key) return Gated(t);
            return false;
        }

        // ── Open / active-tab state ───────────────────────────────────────────────

        /// <summary>Open the menu, optionally to a tab (falls back to the first visible
        /// tab when the requested tab is hidden/unknown or the active tab is no longer
        /// visible).</summary>
        public void OpenMenu(string tab = null)
        {
            _open = true;
            if (!string.IsNullOrEmpty(tab) && IsVisible(tab))
            {
                _active = tab;
            }
            else if (!IsVisible(_active))
            {
                var keys = VisibleKeys();
                _active = keys.Count > 0 ? keys[0] : string.Empty;
            }
        }

        public void CloseMenu() => _open = false;

        public void Toggle()
        {
            if (_open) CloseMenu();
            else OpenMenu();
        }

        public bool IsOpen() => _open;

        /// <summary>Switch tabs. Rejected (returns false) for a hidden/unknown tab.</summary>
        public bool SetActive(string key)
        {
            if (!IsVisible(key)) return false;
            _active = key;
            return true;
        }

        public string ActiveTab() => _active;
    }
}
