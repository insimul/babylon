// QuestSystemTests.cs — Unity EditMode NUnit wrapper around InsimulQuestSystem /
// InsimulQuestRuntime (US-UC3).
//
// Compiled ONLY by the Unity EditMode test assembly (Insimul.Tests.Editor.asmdef);
// the tools/verify-unity console harness does NOT <Compile Include> it (so that
// harness never references nunit.framework). Both harnesses exercise the identical
// portable quest contract — see Program.cs (RunQuestSystemTests) for the
// authoritative host-side gate.
//
// The hydration-parity test reads the golden corpus under
// packages/core/conformance/quests; when unreachable (a stripped install) it
// Ignores rather than hard-fails.

using System.Collections.Generic;
using System.Text.Json;
using NUnit.Framework;
using Insimul.Quest;
using Insimul.Quest.TestSupport;
using Insimul.Save;

namespace Insimul.Prolog.Tests.Editor
{
    [TestFixture]
    public sealed class QuestSystemTests
    {
        private const string ErrandContent =
            "quest(q_market, 'Market Errand', errand, easy, active).\n" +
            "quest_objective(q_market, 0, talk_to(npc_marie)).\n" +
            "quest_objective(q_market, 1, visit_location('Town Square')).\n" +
            "quest_objective(q_market, 2, deliver(bread, npc_paul)).\n" +
            "quest_reward(q_market, experience, 250).\n" +
            "quest_completion(q_market, all_objectives_complete).";

        [Test]
        public void Hydration_MatchesGoldenCorpus()
        {
            string corpus = QuestSystemCorpus.ReadQuestCorpus("hydration-cases.json");
            if (corpus == null) Assert.Ignore("quest corpus not reachable (set INSIMUL_CONFORMANCE_DIR).");

            using var doc = JsonDocument.Parse(corpus);
            foreach (var c in doc.RootElement.GetProperty("cases").EnumerateArray())
            {
                string name = c.GetProperty("name").GetString();
                var input = c.GetProperty("input");
                string content = input.TryGetProperty("content", out var cv) ? cv.GetString() : string.Empty;
                string status = input.TryGetProperty("status", out var sv) ? sv.GetString() : null;
                string golden = CanonicalJson.Stringify(JsonVal.Parse(c.GetProperty("expected").GetRawText()));
                Assert.That(InsimulQuestSystem.HydrateCanonical(content, status), Is.EqualTo(golden),
                    $"hydration case '{name}'");
            }
        }

        [Test]
        public void Completion_AssertedFactsFlipState()
        {
            var rt = new InsimulQuestRuntime();
            string completedQuest = null;
            rt.OnQuestCompleted += q => completedQuest = q;
            rt.RegisterQuest(ErrandContent);

            rt.AssertFact("talked_to", "player", "npc_marie");
            rt.AssertFact("visited", "player", "Town Square");
            rt.AssertFact("delivered", "player", "npc_paul");
            var t = rt.EvaluateQuest("q_market");

            Assert.That(t.Completed, Is.True);
            Assert.That(rt.IsQuestComplete("q_market"), Is.True);
            Assert.That(completedQuest, Is.EqualTo("q_market"));
            Assert.That(rt.Kb.Has("quest_complete", new[] { PrologArg.Atom("q_market") }), Is.True);
        }

        [Test]
        public void Reward_ReadFromProlog()
        {
            var rt = new InsimulQuestRuntime();
            rt.RegisterQuest(ErrandContent);
            Assert.That(rt.GetExperienceReward("q_market"), Is.EqualTo(250.0));

            rt.RegisterQuest("quest(q_bare, 'Bare', errand, easy, active).\nquest_objective(q_bare, 0, talk_to(npc_x)).");
            Assert.That(rt.GetQuest("q_bare").HasExperience, Is.False);
            Assert.That(rt.GetExperienceReward("q_bare"), Is.EqualTo(0.0));
        }

        [Test]
        public void Persistence_QuestStateRoundTrips()
        {
            const string worldSnapshot =
                "{\"world\":{\"id\":\"w1\",\"name\":\"W\"},\"settlements\":[],\"characters\":[]}";

            var rt = new InsimulQuestRuntime();
            rt.RegisterQuest(ErrandContent);
            rt.AssertFact("talked_to", "player", "npc_marie");
            rt.AssertFact("visited", "player", "Town Square");
            rt.AssertFact("delivered", "player", "npc_paul");
            rt.EvaluateQuest("q_market");

            var sys = new InsimulSaveSystem();
            sys.NewGame(worldSnapshot, new NewGameOptions { Id = "s", WorldId = "w1" });
            sys.SnapshotFacts(rt.Facts);

            var loaded = new InsimulSaveSystem();
            loaded.Load(sys.SerializeCanonical());
            var rt2 = new InsimulQuestRuntime();
            rt2.RegisterQuest(ErrandContent);
            rt2.LoadFacts(loaded.RestoreFacts());
            Assert.That(rt2.IsQuestComplete("q_market"), Is.True);
        }
    }
}
