// RadiantCorpusTests.cs — Unity EditMode NUnit wrapper around the shared radiant
// conformance runner (RadiantCorpus.cs) + the pure deterministic engine (US-UC4).
//
// Compiled ONLY by the Unity EditMode test assembly (Insimul.Tests.Editor.asmdef);
// the tools/verify-unity console harness does NOT <Compile Include> it (so that
// harness never references nunit.framework). Both harnesses exercise the identical
// runner — see Program.cs (RunRadiantConformance / RunRadiantPureTests) for the
// authoritative host-side gate.
//
// The corpus parity test needs a loadable libinsimul; when absent it reports
// Inconclusive rather than hard-failing. The deterministic-pick + wiring tests use
// a StubRadiantSolver and run with no native library.

using System;
using System.Collections.Generic;
using NUnit.Framework;
using Insimul.Quest;
using Insimul.Radiant;
using Insimul.Radiant.Conformance;
using Insimul.Save;

namespace Insimul.Prolog.Tests.Editor
{
    [TestFixture]
    public sealed class RadiantCorpusTests
    {
        private const string FetchTemplate =
            "radiant_template(rt_fetch, [category(fetch), title('Gather Herbs for {giver}'), quest_type(gathering), difficulty(2)]).\n" +
            "radiant_precondition(rt_fetch, giver, character_occupation(Giver, herbalist)).\n" +
            "radiant_precondition(rt_fetch, item, item_category(Item, herb)).\n" +
            "radiant_objective(rt_fetch, collect(Item, 5)).\n" +
            "radiant_objective(rt_fetch, deliver(Item, Giver)).\n" +
            "radiant_reward(rt_fetch, gold, times(20, difficulty)).\n" +
            "radiant_reward(rt_fetch, experience, 25).\n" +
            "radiant_cooldown(rt_fetch, 3600).";

        private const string Conj = "character_occupation(Giver, herbalist), item_category(Item, herb)";

        private static StubRadiantSolver FetchSolver() => new StubRadiantSolver()
            .On(Conj,
                "{\"Giver\":\"anne\",\"Item\":\"sage\"}",
                "{\"Giver\":\"anne\",\"Item\":\"mint\"}",
                "{\"Giver\":\"bob\",\"Item\":\"sage\"}",
                "{\"Giver\":\"bob\",\"Item\":\"mint\"}");

        private static IEnumerable<RadiantCorpusCase> RadiantCases() => RadiantCorpus.Load();

        [Test]
        public void CorpusIsReachable()
        {
            var cases = RadiantCorpus.Load();
            if (cases.Count == 0)
                Assert.Ignore("Radiant conformance corpus not reachable (set INSIMUL_CONFORMANCE_DIR).");
            Assert.That(cases.Count, Is.GreaterThan(0));
        }

        [Test]
        [TestCaseSource(nameof(RadiantCases))]
        public void RadiantCase(RadiantCorpusCase c)
        {
            RadiantResult produced;
            try
            {
                produced = RadiantCorpus.Run(c);
            }
            catch (DllNotFoundException)
            {
                Assert.Ignore("libinsimul not loadable in this editor — radiant corpus parity runs on the host gate.");
                return;
            }
            var (ok, message) = RadiantCorpus.Compare(produced, c);
            Assert.That(ok, Is.True, $"{c}: {message}");
        }

        [Test]
        public void SeededPick_IsDeterministicAndByteIdentical()
        {
            var r = InsimulRadiantEngine.Generate(FetchTemplate, FetchSolver(),
                new RadiantOptions { Seed = RadiantSeed.Of("contract"), Now = 1000 });
            Assert.That(r.Quests.Count, Is.EqualTo(1));
            var content = new HashSet<string>(r.Quests[0].QuestContent.Split('\n'));
            Assert.That(content, Does.Contain("quest(radiant_rt_fetch_1000, 'Gather Herbs for anne', gathering, 2, available)."));
            Assert.That(content, Does.Contain("quest_reward(radiant_rt_fetch_1000, gold, 40)."));

            var alt = InsimulRadiantEngine.Generate(FetchTemplate, FetchSolver(),
                new RadiantOptions { Seed = RadiantSeed.Of("zephyr"), Now = 1000 });
            Assert.That(alt.Quests[0].QuestContent, Does.Contain("'Gather Herbs for bob'"));
        }

        [Test]
        public void RadiantTick_FoldsIntoQuestSystem_WorldSnapshotStable()
        {
            const string worldSnapshot =
                "{\"world\":{\"id\":\"w1\",\"name\":\"W\"},\"settlements\":[],\"characters\":[]}";

            var save = new InsimulSaveSystem();
            save.NewGame(worldSnapshot, new NewGameOptions { Id = "s", WorldId = "w1" });
            string hashBefore = save.SaveFile.TryGet("worldSnapshot", out var snapBefore)
                ? CanonicalJson.Integrity(snapBefore) : "<none>";

            var rt = new InsimulQuestRuntime();
            var result = rt.RunRadiantTick(FetchTemplate, FetchSolver(),
                new RadiantOptions { Seed = RadiantSeed.Of("contract"), Now = 1000 });

            Assert.That(result.Quests.Count, Is.EqualTo(1));
            Assert.That(rt.GetQuest("radiant_rt_fetch_1000"), Is.Not.Null);
            Assert.That(rt.Kb.Has("radiant_generated", new[]
            {
                PrologArg.Atom("radiant_rt_fetch_1000"), PrologArg.Atom("rt_fetch"), PrologArg.Number(1000),
            }), Is.True);

            save.SnapshotFacts(rt.Facts);
            string hashAfter = save.SaveFile.TryGet("worldSnapshot", out var snapAfter)
                ? CanonicalJson.Integrity(snapAfter) : "<none>";
            Assert.That(hashAfter, Is.EqualTo(hashBefore), "worldSnapshot must be byte-stable across a radiant tick");
        }
    }
}
