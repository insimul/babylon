// UiCorpus.cs — shared, framework-agnostic loaders for the default-UI conformance
// corpus (US-UU1).
//
// Like RadiantCorpus.cs / SaveSystemCorpus.cs, this is test-framework-free AND
// UnityEngine-free so BOTH harnesses compile + drive it:
//   • tools/verify-unity  (net8 console — the authoritative host-side gate), and
//   • packages/unity/Tests/Editor (Unity EditMode NUnit — see UiCorpusTests.cs).
//
// It reads the engine-neutral cases every default-UI mirror shares:
//   packages/core/conformance/ui/registry-cases.json   (registry precedence + diagnostics)
//   packages/core/conformance/ui/loading-phases.json   (weighted-phase progress)
//   packages/core/conformance/ui/theme-tokens.json     (design-token parity)
// Path resolution + JSON parse ONLY; every assertion lives in the harness files
// (Program.cs / UiCorpusTests.cs).

using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.CompilerServices;
using System.Text.Json;

namespace Insimul.UI.TestSupport
{
    // ── Registry cases ────────────────────────────────────────────────────────

    public sealed class RegistryCase
    {
        public string Name;
        public Dictionary<string, string> Defaults;
        public Dictionary<string, string> Overrides;
        public string Resolve;
        public string ExpectedScene;
        public bool ExpectedMissing;
        public bool ExpectedOverridden;
        public override string ToString() => $"registry:{Name}";
    }

    // ── Loading-phase cases ───────────────────────────────────────────────────

    public sealed class LoadingStep
    {
        public string Advance;
        public float ExpectedProgress;
        public string ExpectedLabel;
        public bool ExpectedComplete;
    }

    public sealed class LoadingCase
    {
        public string Name;
        public List<LoadingStep> Steps = new List<LoadingStep>();
        public override string ToString() => $"loading:{Name}";
    }

    // ── Quest-journal cases ───────────────────────────────────────────────────

    public sealed class QuestStep
    {
        public string Op;
        public string Arg;
        public QuestSeed Entry;                 // upsert only
        public bool HasExpectedOk;
        public bool ExpectedOk;
        public List<string> ExpectedFilteredIds;   // null when absent
        public List<string> ExpectedTrackedIds;     // null when absent
    }

    public sealed class QuestSeed
    {
        public string Id;
        public string Title;
        public string Status;
        public string Difficulty;
        public bool IsRadiant;
    }

    public sealed class QuestJournalCase
    {
        public string Name;
        public int MaxTracked = 3;
        public List<QuestSeed> Quests = new List<QuestSeed>();
        public List<QuestStep> Steps = new List<QuestStep>();
        public Dictionary<string, int> ExpectedCounts = new Dictionary<string, int>();
        public override string ToString() => $"quest-journal:{Name}";
    }

    // ── Trade cases (inventory / container / merchant) ────────────────────────

    public sealed class TradeCase
    {
        public string Name;
        /// <summary>Raw JSON of the case's initial currentState slice — feed to
        /// JsonVal.Parse so the trade model operates on real save state.</summary>
        public string StateJson;
        public string OpKind;
        public string OpContainer;
        public string OpMerchant;
        public string OpItem;
        public int OpQty;
        public bool HasOpQty;
        // Expected outcome (nullable maps/ints absent when the case omits them).
        public bool ExpectedOk;
        public string ExpectedReason;         // "" when absent
        public int ExpectedMoved;
        public bool HasExpectedMoved;
        public int ExpectedPlayerGold;
        public bool HasExpectedPlayerGold;
        public int ExpectedMerchantGold;
        public bool HasExpectedMerchantGold;
        public Dictionary<string, int> ExpectedPlayerItems;      // null when absent
        public Dictionary<string, int> ExpectedContainerItems;   // null when absent
        public Dictionary<string, int> ExpectedMerchantItems;    // null when absent
        public override string ToString() => $"trade:{Name}";
    }

    // ── Chat / dialogue streaming cases ───────────────────────────────────────

    public sealed class ChatEvent
    {
        public string Op;                     // greeting | begin | chunk | action | complete | fail
        public string Text;
        public bool HasFullText;
        public string FullText;
        public bool HasExpectedOk;
        public bool ExpectedOk;
        // action ops
        public string Name;
        public List<string> Args;             // null when absent
        public string Fact;
        // fail ops
        public string Error;
    }

    public sealed class ChatExpectedMessage
    {
        public string Role;
        public string Text;
        public bool Error;
    }

    public sealed class ChatExpectedAction
    {
        public string Name;
        public List<string> Args;             // null when absent
        public string FactToAssert;
    }

    public sealed class ChatExpectedTurn
    {
        public string Role;
        public string Content;
    }

    public sealed class ChatCase
    {
        public string Name;
        public string CharacterId;
        public string CharacterName;
        public List<ChatEvent> Events = new List<ChatEvent>();
        public List<ChatExpectedMessage> ExpectedMessages = new List<ChatExpectedMessage>();
        public bool ExpectedStreaming;
        public List<ChatExpectedAction> ExpectedActions = new List<ChatExpectedAction>();
        public int ExpectedTurnCount;
        public string ExpectedLastNpcText;
        public List<ChatExpectedTurn> ExpectedHistoryTurns = new List<ChatExpectedTurn>();
        public override string ToString() => $"chat:{Name}";
    }

    // ── Pause-menu tab-gating cases ───────────────────────────────────────────

    public sealed class PauseMenuStep
    {
        public string Op;                     // open | close | toggle | set_active | expect_active | expect_open
        public string Key;                    // set_active / expect_active
        public string Tab;                    // open (target tab)
        public bool HasExpectedOk;
        public bool ExpectedOk;               // set_active
        public bool HasValue;
        public bool Value;                    // expect_open
    }

    public sealed class PauseMenuTabDef
    {
        public string Key;
        public string Label;
        public List<string> Requires;         // null when absent
    }

    public sealed class PauseMenuCase
    {
        public string Name;
        public List<string> EnabledModules = new List<string>();
        public List<PauseMenuTabDef> Tabs;    // null = default tabs
        public List<string> ExpectedVisibleKeys = new List<string>();
        public List<PauseMenuStep> Steps = new List<PauseMenuStep>();
        public override string ToString() => $"pause-menu:{Name}";
    }

    // ── Save/load slot cases ──────────────────────────────────────────────────

    public sealed class SaveSlotSummarySeed
    {
        public string PlayerName;
        public bool HasLevel;
        public int Level;
        public string LocationName;
        public bool HasGold;
        public int Gold;
        public string SavedAt;
    }

    public sealed class SaveSlotSeed
    {
        public int Index;
        public string Outcome;
        public SaveSlotSummarySeed Summary;   // null when absent
    }

    public sealed class SaveSlotExpectedRow
    {
        public int Index;
        public string Status;
        public string Title;
        public string Message;
        public bool CanLoad;
        public bool CanSave;
    }

    public sealed class SaveSlotCase
    {
        public string Name;
        public List<SaveSlotSeed> Slots = new List<SaveSlotSeed>();
        public List<SaveSlotExpectedRow> Expected = new List<SaveSlotExpectedRow>();
        public bool ExpectedHasLoadable;
        public override string ToString() => $"save-slot:{Name}";
    }

    // ── Corpus locator + parsers ──────────────────────────────────────────────

    public static class UiCorpus
    {
        private const string CorpusEnvVar = "INSIMUL_CONFORMANCE_DIR";

        /// <summary>Locate the conformance root (the dir containing <c>ui/</c>),
        /// honoring <c>INSIMUL_CONFORMANCE_DIR</c>, else walking up from this file.
        /// Returns null when unreachable so callers SKIP rather than fail.</summary>
        public static string LocateUiDir()
        {
            string overrideDir = Environment.GetEnvironmentVariable(CorpusEnvVar);
            if (!string.IsNullOrEmpty(overrideDir) && Directory.Exists(Path.Combine(overrideDir, "ui")))
                return Path.Combine(overrideDir, "ui");

            string dir = Path.GetDirectoryName(ThisFilePath());
            while (!string.IsNullOrEmpty(dir))
            {
                string mono = Path.Combine(dir, "packages", "core", "conformance", "ui");
                if (Directory.Exists(mono)) return mono;
                string flat = Path.Combine(dir, "conformance", "ui");
                if (Directory.Exists(flat)) return flat;
                dir = Directory.GetParent(dir)?.FullName;
            }
            return null;
        }

        private static JsonElement? ReadFile(string fileName)
        {
            string uiDir = LocateUiDir();
            if (uiDir == null) return null;
            string path = Path.Combine(uiDir, fileName);
            if (!File.Exists(path)) return null;
            using var doc = JsonDocument.Parse(File.ReadAllText(path));
            return doc.RootElement.Clone();
        }

        public static IReadOnlyList<RegistryCase> LoadRegistryCases()
        {
            var list = new List<RegistryCase>();
            var root = ReadFile("registry-cases.json");
            if (root == null || !root.Value.TryGetProperty("cases", out JsonElement cases)) return list;
            foreach (JsonElement el in cases.EnumerateArray())
            {
                list.Add(new RegistryCase
                {
                    Name = Str(el, "name"),
                    Defaults = StrMap(el, "defaults"),
                    Overrides = StrMap(el, "overrides"),
                    Resolve = Str(el, "resolve"),
                    ExpectedScene = Str(el, "expected_scene"),
                    ExpectedMissing = Bool(el, "expected_missing"),
                    ExpectedOverridden = Bool(el, "expected_overridden"),
                });
            }
            return list;
        }

        /// <summary>Panel keys the corpus pins (registry-cases.json → panel_keys).</summary>
        public static IReadOnlyList<string> LoadPanelKeys()
        {
            var list = new List<string>();
            var root = ReadFile("registry-cases.json");
            if (root == null || !root.Value.TryGetProperty("panel_keys", out JsonElement keys)) return list;
            foreach (JsonElement k in keys.EnumerateArray()) list.Add(k.GetString());
            return list;
        }

        public static IReadOnlyList<LoadingPhase> LoadPhases()
        {
            var list = new List<LoadingPhase>();
            var root = ReadFile("loading-phases.json");
            if (root == null || !root.Value.TryGetProperty("phases", out JsonElement phases)) return list;
            foreach (JsonElement p in phases.EnumerateArray())
                list.Add(new LoadingPhase(Str(p, "key"), Str(p, "label"), (int)p.GetProperty("weight").GetDouble()));
            return list;
        }

        public static IReadOnlyList<string> LoadTips()
        {
            var list = new List<string>();
            var root = ReadFile("loading-phases.json");
            if (root == null || !root.Value.TryGetProperty("tips", out JsonElement tips)) return list;
            foreach (JsonElement t in tips.EnumerateArray()) list.Add(t.GetString());
            return list;
        }

        public static IReadOnlyList<LoadingCase> LoadLoadingCases()
        {
            var list = new List<LoadingCase>();
            var root = ReadFile("loading-phases.json");
            if (root == null || !root.Value.TryGetProperty("cases", out JsonElement cases)) return list;
            foreach (JsonElement el in cases.EnumerateArray())
            {
                var lc = new LoadingCase { Name = Str(el, "name") };
                foreach (JsonElement s in el.GetProperty("steps").EnumerateArray())
                {
                    lc.Steps.Add(new LoadingStep
                    {
                        Advance = Str(s, "advance"),
                        ExpectedProgress = (float)s.GetProperty("expected_progress").GetDouble(),
                        ExpectedLabel = Str(s, "expected_label"),
                        ExpectedComplete = Bool(s, "expected_complete"),
                    });
                }
                list.Add(lc);
            }
            return list;
        }

        public static IReadOnlyList<QuestJournalCase> LoadQuestJournalCases()
        {
            var list = new List<QuestJournalCase>();
            var root = ReadFile("quest-journal-cases.json");
            if (root == null || !root.Value.TryGetProperty("cases", out JsonElement cases)) return list;
            foreach (JsonElement el in cases.EnumerateArray())
            {
                var qc = new QuestJournalCase { Name = Str(el, "name") };
                if (el.TryGetProperty("max_tracked", out JsonElement mt)) qc.MaxTracked = (int)mt.GetDouble();
                if (el.TryGetProperty("quests", out JsonElement quests))
                    foreach (JsonElement q in quests.EnumerateArray()) qc.Quests.Add(Seed(q));
                if (el.TryGetProperty("steps", out JsonElement steps))
                {
                    foreach (JsonElement s in steps.EnumerateArray())
                    {
                        var step = new QuestStep
                        {
                            Op = Str(s, "op"),
                            Arg = Str(s, "arg"),
                            ExpectedFilteredIds = StrList(s, "expected_filtered_ids"),
                            ExpectedTrackedIds = StrList(s, "expected_tracked_ids"),
                        };
                        if (s.TryGetProperty("expected_ok", out JsonElement ok))
                        {
                            step.HasExpectedOk = true;
                            step.ExpectedOk = ok.GetBoolean();
                        }
                        if (s.TryGetProperty("entry", out JsonElement entry) && entry.ValueKind == JsonValueKind.Object)
                            step.Entry = Seed(entry);
                        qc.Steps.Add(step);
                    }
                }
                if (el.TryGetProperty("expected_counts", out JsonElement counts) && counts.ValueKind == JsonValueKind.Object)
                    foreach (JsonProperty p in counts.EnumerateObject()) qc.ExpectedCounts[p.Name] = (int)p.Value.GetDouble();
                list.Add(qc);
            }
            return list;
        }

        public static IReadOnlyList<TradeCase> LoadTradeCases()
        {
            var list = new List<TradeCase>();
            var root = ReadFile("trade-cases.json");
            if (root == null || !root.Value.TryGetProperty("cases", out JsonElement cases)) return list;
            foreach (JsonElement el in cases.EnumerateArray())
            {
                var tc = new TradeCase
                {
                    Name = Str(el, "name"),
                    StateJson = el.GetProperty("state").GetRawText(),
                };
                JsonElement op = el.GetProperty("op");
                tc.OpKind = Str(op, "kind");
                tc.OpContainer = Str(op, "container");
                tc.OpMerchant = Str(op, "merchant");
                tc.OpItem = Str(op, "item");
                if (op.TryGetProperty("qty", out JsonElement q))
                {
                    tc.HasOpQty = true;
                    tc.OpQty = (int)q.GetDouble();
                }
                JsonElement exp = el.GetProperty("expected");
                tc.ExpectedOk = Bool(exp, "ok");
                tc.ExpectedReason = Str(exp, "reason");
                if (exp.TryGetProperty("moved", out JsonElement mv)) { tc.HasExpectedMoved = true; tc.ExpectedMoved = (int)mv.GetDouble(); }
                if (exp.TryGetProperty("player_gold", out JsonElement pg)) { tc.HasExpectedPlayerGold = true; tc.ExpectedPlayerGold = (int)pg.GetDouble(); }
                if (exp.TryGetProperty("merchant_gold", out JsonElement mg)) { tc.HasExpectedMerchantGold = true; tc.ExpectedMerchantGold = (int)mg.GetDouble(); }
                tc.ExpectedPlayerItems = IntMap(exp, "player_items");
                tc.ExpectedContainerItems = IntMap(exp, "container_items");
                tc.ExpectedMerchantItems = IntMap(exp, "merchant_items");
                list.Add(tc);
            }
            return list;
        }

        public static IReadOnlyList<ChatCase> LoadChatCases()
        {
            var list = new List<ChatCase>();
            var root = ReadFile("chat-cases.json");
            if (root == null || !root.Value.TryGetProperty("cases", out JsonElement cases)) return list;
            foreach (JsonElement el in cases.EnumerateArray())
            {
                var cc = new ChatCase { Name = Str(el, "name") };
                if (el.TryGetProperty("character", out JsonElement ch))
                {
                    cc.CharacterId = Str(ch, "id");
                    cc.CharacterName = Str(ch, "name");
                }
                foreach (JsonElement e in el.GetProperty("events").EnumerateArray())
                {
                    var ev = new ChatEvent
                    {
                        Op = Str(e, "op"),
                        Text = Str(e, "text"),
                        Name = Str(e, "name"),
                        Args = StrList(e, "args"),
                        Fact = Str(e, "fact"),
                        Error = Str(e, "error"),
                    };
                    if (e.TryGetProperty("full_text", out JsonElement ft)) { ev.HasFullText = true; ev.FullText = ft.GetString(); }
                    if (e.TryGetProperty("expected_ok", out JsonElement ok)) { ev.HasExpectedOk = true; ev.ExpectedOk = ok.GetBoolean(); }
                    cc.Events.Add(ev);
                }
                foreach (JsonElement m in el.GetProperty("expected_messages").EnumerateArray())
                    cc.ExpectedMessages.Add(new ChatExpectedMessage { Role = Str(m, "role"), Text = Str(m, "text"), Error = Bool(m, "error") });
                cc.ExpectedStreaming = Bool(el, "expected_streaming");
                foreach (JsonElement a in el.GetProperty("expected_actions").EnumerateArray())
                    cc.ExpectedActions.Add(new ChatExpectedAction { Name = Str(a, "name"), Args = StrList(a, "args"), FactToAssert = Str(a, "factToAssert") });
                cc.ExpectedTurnCount = el.TryGetProperty("expected_turn_count", out JsonElement tc) ? (int)tc.GetDouble() : 0;
                cc.ExpectedLastNpcText = Str(el, "expected_last_npc_text");
                foreach (JsonElement h in el.GetProperty("expected_history_turns").EnumerateArray())
                    cc.ExpectedHistoryTurns.Add(new ChatExpectedTurn { Role = Str(h, "role"), Content = Str(h, "content") });
                list.Add(cc);
            }
            return list;
        }

        public static IReadOnlyList<PauseMenuCase> LoadPauseMenuCases()
        {
            var list = new List<PauseMenuCase>();
            var root = ReadFile("pause-menu-cases.json");
            if (root == null || !root.Value.TryGetProperty("cases", out JsonElement cases)) return list;
            foreach (JsonElement el in cases.EnumerateArray())
            {
                var pc = new PauseMenuCase
                {
                    Name = Str(el, "name"),
                    EnabledModules = StrList(el, "enabled_modules") ?? new List<string>(),
                    ExpectedVisibleKeys = StrList(el, "expected_visible_keys") ?? new List<string>(),
                };
                if (el.TryGetProperty("tabs", out JsonElement tabs) && tabs.ValueKind == JsonValueKind.Array)
                {
                    pc.Tabs = new List<PauseMenuTabDef>();
                    foreach (JsonElement t in tabs.EnumerateArray())
                        pc.Tabs.Add(new PauseMenuTabDef
                        {
                            Key = Str(t, "key"),
                            Label = Str(t, "label"),
                            Requires = StrList(t, "requires"),
                        });
                }
                if (el.TryGetProperty("steps", out JsonElement steps) && steps.ValueKind == JsonValueKind.Array)
                {
                    foreach (JsonElement s in steps.EnumerateArray())
                    {
                        var step = new PauseMenuStep
                        {
                            Op = Str(s, "op"),
                            Key = Str(s, "key"),
                            Tab = Str(s, "tab"),
                        };
                        if (s.TryGetProperty("expected_ok", out JsonElement ok)) { step.HasExpectedOk = true; step.ExpectedOk = ok.GetBoolean(); }
                        if (s.TryGetProperty("value", out JsonElement v)) { step.HasValue = true; step.Value = v.GetBoolean(); }
                        pc.Steps.Add(step);
                    }
                }
                list.Add(pc);
            }
            return list;
        }

        public static IReadOnlyList<SaveSlotCase> LoadSaveSlotCases()
        {
            var list = new List<SaveSlotCase>();
            var root = ReadFile("save-slot-cases.json");
            if (root == null || !root.Value.TryGetProperty("cases", out JsonElement cases)) return list;
            foreach (JsonElement el in cases.EnumerateArray())
            {
                var sc = new SaveSlotCase { Name = Str(el, "name") };
                foreach (JsonElement s in el.GetProperty("slots").EnumerateArray())
                {
                    var seed = new SaveSlotSeed { Index = (int)s.GetProperty("index").GetDouble(), Outcome = Str(s, "outcome") };
                    if (s.TryGetProperty("summary", out JsonElement sum) && sum.ValueKind == JsonValueKind.Object)
                        seed.Summary = ParseSummary(sum);
                    sc.Slots.Add(seed);
                }
                foreach (JsonElement e in el.GetProperty("expected").EnumerateArray())
                    sc.Expected.Add(new SaveSlotExpectedRow
                    {
                        Index = (int)e.GetProperty("index").GetDouble(),
                        Status = Str(e, "status"),
                        Title = Str(e, "title"),
                        Message = Str(e, "message"),
                        CanLoad = Bool(e, "can_load"),
                        CanSave = Bool(e, "can_save"),
                    });
                sc.ExpectedHasLoadable = Bool(el, "expected_has_loadable");
                list.Add(sc);
            }
            return list;
        }

        private static SaveSlotSummarySeed ParseSummary(JsonElement sum)
        {
            var seed = new SaveSlotSummarySeed
            {
                PlayerName = Str(sum, "playerName"),
                LocationName = Str(sum, "locationName"),
                SavedAt = Str(sum, "savedAt"),
            };
            if (sum.TryGetProperty("level", out JsonElement lv)) { seed.HasLevel = true; seed.Level = (int)lv.GetDouble(); }
            if (sum.TryGetProperty("gold", out JsonElement gd)) { seed.HasGold = true; seed.Gold = (int)gd.GetDouble(); }
            return seed;
        }

        /// <summary>Read an object of {itemId: quantity} into a dict (null when absent).</summary>
        private static Dictionary<string, int> IntMap(JsonElement el, string prop)
        {
            if (!el.TryGetProperty(prop, out JsonElement obj) || obj.ValueKind != JsonValueKind.Object) return null;
            var map = new Dictionary<string, int>(StringComparer.Ordinal);
            foreach (JsonProperty p in obj.EnumerateObject()) map[p.Name] = (int)p.Value.GetDouble();
            return map;
        }

        private static QuestSeed Seed(JsonElement el) => new QuestSeed
        {
            Id = Str(el, "id"),
            Title = Str(el, "title"),
            Status = Str(el, "status"),
            Difficulty = Str(el, "difficulty"),
            IsRadiant = Bool(el, "isRadiant"),
        };

        /// <summary>theme-tokens.json → colors (name → hex).</summary>
        public static Dictionary<string, string> LoadThemeColors() => LoadTokenStrings("colors");

        /// <summary>theme-tokens.json → a numeric token group (spacing / radius / font_size).</summary>
        public static Dictionary<string, int> LoadThemeInts(string group)
        {
            var map = new Dictionary<string, int>(StringComparer.Ordinal);
            var root = ReadFile("theme-tokens.json");
            if (root == null || !root.Value.TryGetProperty(group, out JsonElement obj)) return map;
            foreach (JsonProperty p in obj.EnumerateObject()) map[p.Name] = (int)p.Value.GetDouble();
            return map;
        }

        private static Dictionary<string, string> LoadTokenStrings(string group)
        {
            var map = new Dictionary<string, string>(StringComparer.Ordinal);
            var root = ReadFile("theme-tokens.json");
            if (root == null || !root.Value.TryGetProperty(group, out JsonElement obj)) return map;
            foreach (JsonProperty p in obj.EnumerateObject()) map[p.Name] = p.Value.GetString();
            return map;
        }

        // ── JSON helpers ──────────────────────────────────────────────────────

        private static string Str(JsonElement el, string prop) =>
            el.TryGetProperty(prop, out JsonElement v) ? v.GetString() : "";

        private static bool Bool(JsonElement el, string prop) =>
            el.TryGetProperty(prop, out JsonElement v) && v.GetBoolean();

        private static List<string> StrList(JsonElement el, string prop)
        {
            if (!el.TryGetProperty(prop, out JsonElement arr) || arr.ValueKind != JsonValueKind.Array) return null;
            var list = new List<string>();
            foreach (JsonElement e in arr.EnumerateArray()) list.Add(e.GetString());
            return list;
        }

        private static Dictionary<string, string> StrMap(JsonElement el, string prop)
        {
            var map = new Dictionary<string, string>(StringComparer.Ordinal);
            if (el.TryGetProperty(prop, out JsonElement obj) && obj.ValueKind == JsonValueKind.Object)
                foreach (JsonProperty p in obj.EnumerateObject()) map[p.Name] = p.Value.GetString();
            return map;
        }

        private static string ThisFilePath([CallerFilePath] string path = null) => path;
    }
}
