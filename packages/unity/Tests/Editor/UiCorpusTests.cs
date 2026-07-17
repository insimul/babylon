// UiCorpusTests.cs — Unity EditMode NUnit wrapper around the shared default-UI
// corpus (UiCorpus.cs) + the pure view-models (US-UU1).
//
// Compiled ONLY by the Unity EditMode test assembly (Insimul.Tests.Editor.asmdef);
// the tools/verify-unity console harness does NOT <Compile Include> it (so that
// harness never references nunit.framework). Both harnesses exercise the identical
// loaders + models — see Program.cs (RunUiRegistry/LoadingScreen/Notification/
// ThemeToken tests) for the authoritative host-side gate.
//
// Everything here runs with no native library and no scene tree — the models are
// pure C#; the corpus is plain JSON under packages/core/conformance/ui/.

using System.Collections.Generic;
using NUnit.Framework;
using Insimul.Quest;
using Insimul.Save;
using Insimul.UI;
using Insimul.UI.TestSupport;

namespace Insimul.Prolog.Tests.Editor
{
    [TestFixture]
    public sealed class UiCorpusTests
    {
        // ── Panel registry ────────────────────────────────────────────────────

        [Test]
        public void DefaultMap_ResolvesEveryCorpusPanelKey()
        {
            var keys = UiCorpus.LoadPanelKeys();
            if (keys.Count == 0)
                Assert.Ignore("UI conformance corpus not reachable (set INSIMUL_CONFORMANCE_DIR).");
            var registry = new InsimulUIRegistry();
            foreach (string key in keys)
                Assert.That(registry.Has(key), Is.True, $"default map missing panel '{key}'");
        }

        private static IEnumerable<RegistryCase> RegistryCases() => UiCorpus.LoadRegistryCases();

        [Test]
        [TestCaseSource(nameof(RegistryCases))]
        public void RegistryCase(RegistryCase c)
        {
            var registry = new InsimulUIRegistry(c.Defaults);
            registry.ApplyOverrides(c.Overrides);
            string scene = registry.SceneRef(c.Resolve);
            Assert.That(scene, Is.EqualTo(c.ExpectedScene), $"{c}: scene ref");
            Assert.That(registry.IsOverridden(c.Resolve), Is.EqualTo(c.ExpectedOverridden), $"{c}: overridden");
            Assert.That(registry.HasDiagnostics(), Is.EqualTo(c.ExpectedMissing), $"{c}: diagnostic recorded");
            if (c.ExpectedMissing)
            {
                var diags = registry.Diagnostics();
                Assert.That(diags[diags.Count - 1].Kind, Is.EqualTo("missing_panel"));
                Assert.That(diags[diags.Count - 1].Key, Is.EqualTo(c.Resolve));
            }
        }

        // ── Loading screen ────────────────────────────────────────────────────

        [Test]
        public void DefaultPhaseTable_MatchesCorpus()
        {
            var phases = UiCorpus.LoadPhases();
            if (phases.Count == 0) Assert.Ignore("UI conformance corpus not reachable.");
            Assert.That(InsimulLoadingScreenModel.DefaultPhases.Count, Is.EqualTo(phases.Count));
            for (int i = 0; i < phases.Count; i++)
            {
                Assert.That(InsimulLoadingScreenModel.DefaultPhases[i].Key, Is.EqualTo(phases[i].Key));
                Assert.That(InsimulLoadingScreenModel.DefaultPhases[i].Label, Is.EqualTo(phases[i].Label));
                Assert.That(InsimulLoadingScreenModel.DefaultPhases[i].Weight, Is.EqualTo(phases[i].Weight));
            }
            var tips = UiCorpus.LoadTips();
            Assert.That(InsimulLoadingScreenModel.DefaultTips.Count, Is.EqualTo(tips.Count));
        }

        private static IEnumerable<LoadingCase> LoadingCases() => UiCorpus.LoadLoadingCases();

        [Test]
        [TestCaseSource(nameof(LoadingCases))]
        public void LoadingCase(LoadingCase c)
        {
            var model = new InsimulLoadingScreenModel(UiCorpus.LoadPhases(), UiCorpus.LoadTips());
            foreach (LoadingStep s in c.Steps)
            {
                model.Advance(s.Advance);
                Assert.That(model.Progress(), Is.EqualTo(s.ExpectedProgress).Within(0.0001f),
                    $"{c}: phase '{s.Advance}' progress");
                Assert.That(model.Label(), Is.EqualTo(s.ExpectedLabel), $"{c}: label");
                Assert.That(model.IsComplete(), Is.EqualTo(s.ExpectedComplete), $"{c}: complete");
            }
        }

        // ── Notifications ─────────────────────────────────────────────────────

        [Test]
        public void Notifications_PushTickDismissLifecycle()
        {
            var n = new InsimulNotifications();
            int a = n.Push("a", NotificationKind.Info, 4f);
            int b = n.Push("b", NotificationKind.Success, 2f);
            Assert.That(n.Count, Is.EqualTo(2));
            Assert.That(a, Is.Not.EqualTo(b));
            Assert.That(n.Visible()[0].Color, Is.EqualTo("accent"));
            Assert.That(n.Visible()[1].Color, Is.EqualTo("success"));

            Assert.That(n.Tick(1f), Is.False, "nothing expired at t=1");
            Assert.That(n.Tick(1.5f), Is.True, "b (2s) expired at t=2.5");
            Assert.That(n.Count, Is.EqualTo(1));
            Assert.That(n.Visible()[0].Text, Is.EqualTo("a"));

            Assert.That(n.Dismiss(a), Is.True);
            Assert.That(n.Dismiss(9999), Is.False);
            Assert.That(n.Count, Is.EqualTo(0));
        }

        // ── Quest journal / tracker / offer ───────────────────────────────────

        private static IEnumerable<QuestJournalCase> QuestJournalCases() => UiCorpus.LoadQuestJournalCases();

        [Test]
        [TestCaseSource(nameof(QuestJournalCases))]
        public void QuestJournalCase(QuestJournalCase c)
        {
            var model = new InsimulQuestJournalModel(c.MaxTracked);
            var seeds = new List<QuestEntry>();
            foreach (QuestSeed s in c.Quests) seeds.Add(ToEntry(s));
            model.SetQuests(seeds);

            foreach (QuestStep step in c.Steps)
            {
                bool ok = ApplyQuestStep(model, step);
                if (step.HasExpectedOk)
                    Assert.That(ok, Is.EqualTo(step.ExpectedOk), $"{c}/{step.Op}: ok");
                if (step.ExpectedFilteredIds != null)
                    Assert.That(model.FilteredIds(), Is.EqualTo(step.ExpectedFilteredIds), $"{c}/{step.Op}: filtered");
                if (step.ExpectedTrackedIds != null)
                    Assert.That(model.TrackedIds(), Is.EqualTo(step.ExpectedTrackedIds), $"{c}/{step.Op}: tracked");
            }

            var counts = model.Counts();
            Assert.That(counts.All, Is.EqualTo(c.ExpectedCounts["all"]), $"{c}: all");
            Assert.That(counts.Active, Is.EqualTo(c.ExpectedCounts["active"]), $"{c}: active");
            Assert.That(counts.Completed, Is.EqualTo(c.ExpectedCounts["completed"]), $"{c}: completed");
            Assert.That(counts.Available, Is.EqualTo(c.ExpectedCounts["available"]), $"{c}: available");
        }

        private static bool ApplyQuestStep(InsimulQuestJournalModel model, QuestStep step)
        {
            switch (step.Op)
            {
                case "set_filter": model.SetFilter(step.Arg); return true;
                case "accept": return model.Accept(step.Arg);
                case "decline": return model.Decline(step.Arg);
                case "complete": return model.Complete(step.Arg);
                case "track": return model.Track(step.Arg);
                case "untrack": return model.Untrack(step.Arg);
                case "upsert": model.Upsert(ToEntry(step.Entry)); return true;
                default: throw new System.Exception($"unknown quest step op '{step.Op}'");
            }
        }

        private static QuestEntry ToEntry(QuestSeed s) => new QuestEntry
        {
            Id = s.Id,
            Title = s.Title,
            Status = s.Status,
            Difficulty = s.Difficulty,
            IsRadiant = s.IsRadiant,
        };

        [Test]
        public void QuestFeed_UpdatesOnRuntimeEvents_WithoutPolling()
        {
            var runtime = new InsimulQuestRuntime();
            var feed = new InsimulQuestFeed();
            int repaints = 0;
            feed.Changed += () => repaints++;
            feed.Attach(runtime);

            runtime.RegisterQuest(
                "quest(q_fetch, 'Fetch the Herbs', errand, easy, active).\n" +
                "quest_objective(q_fetch, 0, talk_to(npc_marie, 1)).\n" +
                "quest_objective(q_fetch, 1, visit_location(market)).\n" +
                "quest_completion(q_fetch, all_objectives_complete).");
            Assert.That(repaints, Is.GreaterThanOrEqualTo(1));
            Assert.That(feed.Model.Get("q_fetch").Status, Is.EqualTo("active"));
            Assert.That(feed.Model.Track("q_fetch"), Is.True);

            runtime.AssertFact("talked_to", "player", "npc_marie");
            runtime.EvaluateQuest("q_fetch");
            Assert.That(feed.Model.ObjectiveProgress("q_fetch"), Is.EqualTo((1, 2)));

            runtime.AssertFact("visited", "player", "market");
            runtime.EvaluateQuest("q_fetch");
            Assert.That(feed.Model.ObjectiveProgress("q_fetch"), Is.EqualTo((2, 2)));
            Assert.That(feed.Model.Get("q_fetch").Status, Is.EqualTo("completed"));
            Assert.That(feed.Model.TrackedIds(), Is.Empty, "auto-untracked on completion");

            int before = repaints;
            feed.Detach();
            runtime.RegisterQuest("quest(q_other, 'Other', errand, easy, active).");
            Assert.That(repaints, Is.EqualTo(before), "detached feed ignores events");
            Assert.That(feed.Model.Get("q_other"), Is.Null);
        }

        // ── Trade: inventory / container / merchant (US-UU3) ──────────────────

        private static IEnumerable<TradeCase> TradeCases() => UiCorpus.LoadTradeCases();

        [Test]
        [TestCaseSource(nameof(TradeCases))]
        public void TradeCase(TradeCase c)
        {
            JsonVal state = JsonVal.Parse(c.StateJson);
            var model = new InsimulTradeModel(state);
            TradeResult r = ApplyTradeOp(model, c);

            Assert.That(r.Ok, Is.EqualTo(c.ExpectedOk), $"{c}: ok");
            if (!string.IsNullOrEmpty(c.ExpectedReason))
                Assert.That(r.Reason, Is.EqualTo(c.ExpectedReason), $"{c}: reason");
            if (c.HasExpectedMoved) Assert.That(r.Moved, Is.EqualTo(c.ExpectedMoved), $"{c}: moved");
            if (c.HasExpectedPlayerGold) Assert.That(model.PlayerGold(), Is.EqualTo(c.ExpectedPlayerGold), $"{c}: player gold");
            if (c.HasExpectedMerchantGold) Assert.That(model.MerchantGold(c.OpMerchant), Is.EqualTo(c.ExpectedMerchantGold), $"{c}: merchant gold");
            if (c.ExpectedPlayerItems != null) AssertItems(c.ExpectedPlayerItems, model.PlayerItems());
            if (c.ExpectedContainerItems != null) AssertItems(c.ExpectedContainerItems, model.ContainerItems(c.OpContainer));
            if (c.ExpectedMerchantItems != null) AssertItems(c.ExpectedMerchantItems, model.MerchantItems(c.OpMerchant));
        }

        [Test]
        public void Trade_StateLocationInvariant_ReadsAreLiveSaveState()
        {
            JsonVal state = JsonVal.Parse(
                "{\"player\":{\"gold\":0,\"inventory\":[]}," +
                "\"containers\":{\"containers\":{\"chest\":{\"items\":[{\"itemId\":\"gem\",\"quantity\":2,\"value\":100}]}}}," +
                "\"npcs\":{\"merchantStates\":{}}}");
            var model = new InsimulTradeModel(state);
            model.TakeAllFromContainer("chest");
            state.TryGet("player", out var player);
            player.TryGet("inventory", out var inv);
            Assert.That(ReferenceEquals(inv, model.PlayerItems()), Is.True,
                "PlayerItems() must be the live currentState.player.inventory reference");
        }

        [Test]
        public void Trade_PersistenceRoundTrip_SurvivesSaveLoad()
        {
            var save = new InsimulSaveSystem();
            save.NewGame("{\"world\":{\"id\":\"w1\"}}", new InsimulSaveSystem.NewGameOptions { Id = "s1", WorldId = "w1" });
            save.SaveFile.TryGet("currentState", out var cs);
            cs.TryGet("player", out var pl);
            pl.Set("gold", JsonVal.Int(100));
            cs.TryGet("npcs", out var npcs);
            var shop = JsonVal.Object();
            shop.Set("goldReserve", JsonVal.Int(100));
            var items = JsonVal.Arr();
            var potion = JsonVal.Object();
            potion.Set("itemId", JsonVal.Str("potion"));
            potion.Set("quantity", JsonVal.Int(5));
            potion.Set("value", JsonVal.Int(10));
            items.Add(potion);
            shop.Set("items", items);
            var merchants = JsonVal.Object();
            merchants.Set("shop", shop);
            npcs.Set("merchantStates", merchants);

            Assert.That(new InsimulTradeModel(cs).Buy("shop", "potion", 3).Ok, Is.True);

            var reloaded = new InsimulSaveSystem();
            reloaded.Load(save.SerializeCanonical());
            reloaded.SaveFile.TryGet("currentState", out var cs2);
            var model = new InsimulTradeModel(cs2);
            Assert.That(model.PlayerGold(), Is.EqualTo(70));
            Assert.That(model.MerchantGold("shop"), Is.EqualTo(130));
            Assert.That(model.PlayerQuantity("potion"), Is.EqualTo(3));
        }

        private static TradeResult ApplyTradeOp(InsimulTradeModel model, TradeCase c)
        {
            int qty = c.HasOpQty ? c.OpQty : 0;
            switch (c.OpKind)
            {
                case "take": return model.TakeFromContainer(c.OpContainer, c.OpItem, qty);
                case "take_all": return model.TakeAllFromContainer(c.OpContainer);
                case "buy": return model.Buy(c.OpMerchant, c.OpItem, qty);
                case "sell": return model.Sell(c.OpMerchant, c.OpItem, qty);
                default: throw new System.Exception($"unknown trade op kind '{c.OpKind}'");
            }
        }

        private static void AssertItems(Dictionary<string, int> expected, JsonVal items)
        {
            var actual = new Dictionary<string, int>();
            foreach (JsonVal s in items.Items)
            {
                string id = s.TryGet("itemId", out var idv) ? idv.Str : "";
                actual[id] = s.TryGet("quantity", out var qv) ? (int)qv.Number : 0;
            }
            Assert.That(actual.Count, Is.EqualTo(expected.Count));
            foreach (var kv in expected)
            {
                Assert.That(actual.ContainsKey(kv.Key), Is.True, $"missing item '{kv.Key}'");
                Assert.That(actual[kv.Key], Is.EqualTo(kv.Value), $"item '{kv.Key}' quantity");
            }
        }

        // ── Chat / dialogue streaming (US-UU4) ────────────────────────────────

        private static IEnumerable<ChatCase> ChatCases() => UiCorpus.LoadChatCases();

        [Test]
        [TestCaseSource(nameof(ChatCases))]
        public void ChatCase(ChatCase c)
        {
            var model = new InsimulChatModel(c.CharacterId, c.CharacterName);
            ReplayChat(model, c);

            var msgs = model.MessageList();
            Assert.That(msgs.Count, Is.EqualTo(c.ExpectedMessages.Count), $"{c}: message count");
            for (int i = 0; i < c.ExpectedMessages.Count; i++)
            {
                Assert.That(InsimulChatModel.RoleName(msgs[i].Role), Is.EqualTo(c.ExpectedMessages[i].Role), $"{c}: msg[{i}] role");
                Assert.That(msgs[i].Text, Is.EqualTo(c.ExpectedMessages[i].Text), $"{c}: msg[{i}] text");
                Assert.That(msgs[i].Error, Is.EqualTo(c.ExpectedMessages[i].Error), $"{c}: msg[{i}] error");
            }

            Assert.That(model.IsStreaming(), Is.EqualTo(c.ExpectedStreaming), $"{c}: streaming");
            Assert.That(model.CompletedTurnCount(), Is.EqualTo(c.ExpectedTurnCount), $"{c}: turn count");
            Assert.That(model.LastNpcText(), Is.EqualTo(c.ExpectedLastNpcText), $"{c}: last npc text");

            var acts = model.ActionList();
            Assert.That(acts.Count, Is.EqualTo(c.ExpectedActions.Count), $"{c}: action count");
            for (int i = 0; i < c.ExpectedActions.Count; i++)
            {
                Assert.That(acts[i].Name, Is.EqualTo(c.ExpectedActions[i].Name), $"{c}: action[{i}] name");
                Assert.That(acts[i].FactToAssert, Is.EqualTo(c.ExpectedActions[i].FactToAssert), $"{c}: action[{i}] fact");
            }

            var hist = model.History();
            Assert.That(hist.RecentTurns.Count, Is.EqualTo(c.ExpectedHistoryTurns.Count), $"{c}: history count");
            for (int i = 0; i < c.ExpectedHistoryTurns.Count; i++)
            {
                Assert.That(InsimulChatModel.RoleName(hist.RecentTurns[i].Role), Is.EqualTo(c.ExpectedHistoryTurns[i].Role), $"{c}: turn[{i}] role");
                Assert.That(hist.RecentTurns[i].Content, Is.EqualTo(c.ExpectedHistoryTurns[i].Content), $"{c}: turn[{i}] content");
            }
        }

        [Test]
        public void Chat_ActionTriggers_AssertThroughRealKbPath()
        {
            var runtime = new InsimulQuestRuntime();
            var model = new InsimulChatModel("smith", "Bram");
            model.BeginUserTurn("Can I have the sword?");
            model.AppendChunk("Here, take it.");
            model.TriggerAction(new ChatAction("give_item", new[] { "sword" }, "has_item(player,sword)"));
            foreach (ChatAction a in model.ActionList())
                if (!string.IsNullOrEmpty(a.FactToAssert))
                    Assert.That(runtime.AssertClause(a.FactToAssert), Is.True);
            model.CompleteTurn();
            Assert.That(runtime.HasFact("has_item", "player", "sword"), Is.True);
        }

        [Test]
        public void Chat_History_RoundTripsThroughSaveConversations()
        {
            var model = new InsimulChatModel("npc1", "Aldric");
            model.Greeting("Well met, traveler.");
            model.BeginUserTurn("Hello");
            model.AppendChunk("Good day to you.");
            model.CompleteTurn();

            var save = new InsimulSaveSystem();
            save.NewGame("{\"world\":{\"id\":\"w1\"}}", new InsimulSaveSystem.NewGameOptions { Id = "s1", WorldId = "w1" });
            save.SaveFile.TryGet("conversations", out var conversations);
            conversations.Add(model.History("2026-07-17T00:00:00.000Z").ToConversationSummary(model.CharacterId, model.CharacterName));

            var reloaded = new InsimulSaveSystem();
            reloaded.Load(save.SerializeCanonical());
            reloaded.SaveFile.TryGet("conversations", out var convs2);
            Assert.That(convs2.Items.Count, Is.EqualTo(1));
            var turns = convs2.Items[0].TryGet("recentTurns", out var t) ? t : JsonVal.Arr();
            Assert.That(turns.Items.Count, Is.EqualTo(3));
        }

        private static void ReplayChat(InsimulChatModel model, ChatCase c)
        {
            foreach (ChatEvent e in c.Events)
            {
                switch (e.Op)
                {
                    case "greeting": model.Greeting(e.Text); break;
                    case "begin":
                    {
                        bool ok = model.BeginUserTurn(e.Text);
                        if (e.HasExpectedOk) Assert.That(ok, Is.EqualTo(e.ExpectedOk), $"{c}: begin ok");
                        break;
                    }
                    case "chunk": model.AppendChunk(e.Text); break;
                    case "action": model.TriggerAction(new ChatAction(e.Name, e.Args, e.Fact)); break;
                    case "complete":
                    {
                        bool ok = model.CompleteTurn(e.HasFullText ? e.FullText : null);
                        if (e.HasExpectedOk) Assert.That(ok, Is.EqualTo(e.ExpectedOk), $"{c}: complete ok");
                        break;
                    }
                    case "fail":
                    {
                        bool ok = model.FailTurn(e.Error);
                        if (e.HasExpectedOk) Assert.That(ok, Is.EqualTo(e.ExpectedOk), $"{c}: fail ok");
                        break;
                    }
                    default: throw new System.Exception($"unknown chat event op '{e.Op}'");
                }
            }
        }

        // ── Pause menu tab-gating (US-UU5) ────────────────────────────────────

        private static IEnumerable<PauseMenuCase> PauseMenuCases() => UiCorpus.LoadPauseMenuCases();

        [Test]
        [TestCaseSource(nameof(PauseMenuCases))]
        public void PauseMenuCase(PauseMenuCase c)
        {
            List<MenuTabDef> tabs = null;
            if (c.Tabs != null)
            {
                tabs = new List<MenuTabDef>();
                foreach (PauseMenuTabDef t in c.Tabs)
                    tabs.Add(new MenuTabDef(t.Key, t.Label, t.Requires?.ToArray() ?? new string[0]));
            }
            var model = new InsimulPauseMenuModel(c.EnabledModules, tabs);
            Assert.That(model.VisibleKeys(), Is.EqualTo(c.ExpectedVisibleKeys), $"{c}: visible keys");

            foreach (PauseMenuStep s in c.Steps)
            {
                switch (s.Op)
                {
                    case "open": model.OpenMenu(string.IsNullOrEmpty(s.Tab) ? null : s.Tab); break;
                    case "close": model.CloseMenu(); break;
                    case "toggle": model.Toggle(); break;
                    case "set_active":
                    {
                        bool ok = model.SetActive(s.Key);
                        if (s.HasExpectedOk) Assert.That(ok, Is.EqualTo(s.ExpectedOk), $"{c}: set_active {s.Key}");
                        break;
                    }
                    case "expect_active": Assert.That(model.ActiveTab(), Is.EqualTo(s.Key), $"{c}: active"); break;
                    case "expect_open": Assert.That(model.IsOpen(), Is.EqualTo(s.Value), $"{c}: open"); break;
                    default: throw new System.Exception($"unknown pause-menu step op '{s.Op}'");
                }
            }
        }

        [Test]
        public void PauseMenu_GenreBundlesShowDifferentTabs()
        {
            var rpg = InsimulPauseMenuModel.ForGenre("rpg").VisibleKeys();
            var strategy = InsimulPauseMenuModel.ForGenre("strategy").VisibleKeys();
            var learning = InsimulPauseMenuModel.ForGenre("language-learning").VisibleKeys();
            Assert.That(rpg, Does.Not.Contain("assessment"), "rpg hides assessment");
            Assert.That(strategy, Does.Not.Contain("vocabulary"), "strategy hides vocabulary");
            Assert.That(learning, Does.Contain("assessment"), "language-learning shows assessment");
            Assert.That(rpg, Is.Not.EqualTo(strategy), "rpg and strategy differ");
        }

        // ── Save / load slots (US-UU5) ────────────────────────────────────────

        private static IEnumerable<SaveSlotCase> SaveSlotCases() => UiCorpus.LoadSaveSlotCases();

        [Test]
        [TestCaseSource(nameof(SaveSlotCases))]
        public void SaveSlotCase(SaveSlotCase c)
        {
            var seeds = new List<SlotLoadResult>();
            foreach (SaveSlotSeed s in c.Slots) seeds.Add(new SlotLoadResult(s.Index, s.Outcome, ToSummary(s.Summary)));
            var model = new InsimulSaveSlotModel(seeds);
            var rows = model.Slots();
            Assert.That(rows.Count, Is.EqualTo(c.Expected.Count), $"{c}: row count");
            for (int i = 0; i < c.Expected.Count; i++)
            {
                Assert.That(rows[i].Index, Is.EqualTo(c.Expected[i].Index), $"{c}: row[{i}] index");
                Assert.That(rows[i].Status, Is.EqualTo(c.Expected[i].Status), $"{c}: row[{i}] status");
                Assert.That(rows[i].Title, Is.EqualTo(c.Expected[i].Title), $"{c}: row[{i}] title");
                Assert.That(rows[i].Message, Is.EqualTo(c.Expected[i].Message), $"{c}: row[{i}] message");
                Assert.That(rows[i].CanLoad, Is.EqualTo(c.Expected[i].CanLoad), $"{c}: row[{i}] can_load");
                Assert.That(rows[i].CanSave, Is.EqualTo(c.Expected[i].CanSave), $"{c}: row[{i}] can_save");
            }
            Assert.That(model.HasAnyLoadable(), Is.EqualTo(c.ExpectedHasLoadable), $"{c}: has loadable");
        }

        [Test]
        public void SaveSlot_ClassifyEnvelope_CorruptedThroughRealIntegrityChain()
        {
            var save = new InsimulSaveSystem();
            save.NewGame("{\"world\":{\"id\":\"w1\",\"name\":\"W\"},\"settlements\":[],\"characters\":[]}",
                new NewGameOptions { Id = "s", WorldId = "w1" });
            string good = save.BuildEnvelopeJson("1.0.0", "2026-01-01T00:00:00.000Z");
            Assert.That(InsimulSaveSlotModel.ClassifyEnvelope(0, good).Outcome, Is.EqualTo("ok"));

            string tampered = good.Replace("\"totalPlaytime\":0", "\"totalPlaytime\":9999");
            Assert.That(InsimulSaveSlotModel.ClassifyEnvelope(1, tampered).Outcome, Is.EqualTo("integrity_mismatch"));
            Assert.That(InsimulSaveSlotModel.ClassifyEnvelope(2, null).Outcome, Is.EqualTo("empty"));
        }

        private static SlotSummary ToSummary(SaveSlotSummarySeed s)
        {
            if (s == null) return null;
            return new SlotSummary
            {
                PlayerName = s.PlayerName,
                HasLevel = s.HasLevel,
                Level = s.Level,
                LocationName = s.LocationName,
                HasGold = s.HasGold,
                Gold = s.Gold,
                SavedAt = s.SavedAt,
            };
        }

        // ── Theme tokens ──────────────────────────────────────────────────────

        [Test]
        public void ThemeColors_MatchCorpusExactly()
        {
            var colors = UiCorpus.LoadThemeColors();
            if (colors.Count == 0) Assert.Ignore("UI conformance corpus not reachable.");
            Assert.That(InsimulUITheme.Colors.Count, Is.EqualTo(colors.Count));
            foreach (var kv in colors)
            {
                Assert.That(InsimulUITheme.Colors.ContainsKey(kv.Key), Is.True, $"missing color '{kv.Key}'");
                Assert.That(InsimulUITheme.Colors[kv.Key], Is.EqualTo(kv.Value), $"color '{kv.Key}'");
            }
        }

        [Test]
        public void ThemeNumericTokens_MatchCorpus()
        {
            AssertNumeric(UiCorpus.LoadThemeInts("spacing"), InsimulUITheme.Spacing);
            AssertNumeric(UiCorpus.LoadThemeInts("radius"), InsimulUITheme.Radius);
            AssertNumeric(UiCorpus.LoadThemeInts("font_size"), InsimulUITheme.FontSize);
        }

        [Test]
        public void HexParser_YieldsExpectedRgba()
        {
            ThemeColor accent = InsimulUITheme.Color("accent");
            Assert.That(accent.R, Is.EqualTo((byte)0x5b));
            Assert.That(accent.G, Is.EqualTo((byte)0x8c));
            Assert.That(accent.B, Is.EqualTo((byte)0xff));
            Assert.That(accent.A, Is.EqualTo((byte)0xff));
            Assert.That(InsimulUITheme.Color("overlay").A, Is.EqualTo((byte)0xcc));
        }

        private static void AssertNumeric(
            IReadOnlyDictionary<string, int> expected, IReadOnlyDictionary<string, int> actual)
        {
            if (expected.Count == 0) Assert.Ignore("UI conformance corpus not reachable.");
            Assert.That(actual.Count, Is.EqualTo(expected.Count));
            foreach (var kv in expected)
                Assert.That(actual[kv.Key], Is.EqualTo(kv.Value), $"token '{kv.Key}'");
        }
    }
}
