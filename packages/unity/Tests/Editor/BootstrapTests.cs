// BootstrapTests.cs — Unity EditMode NUnit wrapper around the startup orchestrator
// (InsimulRuntimeContext, US-UC5).
//
// Compiled ONLY by the Unity EditMode test assembly; the tools/verify-unity console
// harness does NOT <Compile Include> it (so that harness never references
// nunit.framework). Both harnesses exercise the identical UnityEngine-free context —
// see Program.cs (RunBootstrapTests) for the authoritative host-side gate. The Unity
// MonoBehaviour that drives this context (templates/scripts/core/InsimulRuntimeBootstrap.cs)
// is UnityEngine-coupled and thus structural-gate only.

using System.Collections.Generic;
using NUnit.Framework;
using Insimul.Quest;
using Insimul.Runtime;
using Insimul.Save;

namespace Insimul.Prolog.Tests.Editor
{
    [TestFixture]
    public sealed class BootstrapTests
    {
        private const string WorldSnapshot =
            "{\"world\":{\"id\":\"w1\",\"name\":\"World\"}," +
            "\"settlements\":[]," +
            "\"characters\":[{\"id\":\"npc_anne\",\"name\":\"Anne\"}]," +
            "\"quests\":[{\"id\":\"q_intro\",\"content\":\"" +
            "quest(q_intro, 'Intro', errand, easy, active).\\n" +
            "quest_objective(q_intro, 0, objective('Say hi')).\\n" +
            "quest_reward(q_intro, experience, 50).\\n" +
            "quest_completion(q_intro, all_objectives_complete).\"}]}";

        private static NewGameOptions NewOpts() =>
            new NewGameOptions { Id = "s1", WorldId = "w1", Name = "New Game" };

        [Test]
        public void Boot_NoSave_StartsNewGame()
        {
            var ctx = new InsimulRuntimeContext();
            var boot = ctx.Boot(null, WorldSnapshot, NewOpts());
            Assert.IsTrue(boot.Ok);
            Assert.IsFalse(boot.ResumedSave);
            Assert.IsTrue(ctx.IsLoaded);
            Assert.AreEqual(1, ctx.World.Characters.Count);
            Assert.AreEqual(1, ctx.Quests.QuestCount);
            Assert.IsNotNull(ctx.Quests.GetQuest("q_intro"));
        }

        [Test]
        public void StartNewGame_FiresQuestAccepted()
        {
            var ctx = new InsimulRuntimeContext();
            var accepted = new List<string>();
            ctx.Quests.OnQuestAccepted += id => accepted.Add(id);
            Assert.IsTrue(ctx.StartNewGame(WorldSnapshot, NewOpts(), out _));
            CollectionAssert.Contains(accepted, "q_intro");
        }

        [Test]
        public void Boot_ResumesValidSave()
        {
            var first = new InsimulRuntimeContext();
            first.StartNewGame(WorldSnapshot, NewOpts(), out _);
            first.Quests.AssertFact("objective_satisfied", "q_intro", "obj_0");
            first.EvaluateAllQuests();
            first.CommitToSave();
            string saveJson = first.SerializeCanonical();

            var second = new InsimulRuntimeContext();
            var boot = second.Boot(saveJson, WorldSnapshot, NewOpts());
            Assert.IsTrue(boot.Ok);
            Assert.IsTrue(boot.ResumedSave);
            Assert.IsTrue(second.Quests.IsQuestComplete("q_intro"));
        }

        [Test]
        public void Boot_CorruptSave_FallsBackToNewGame()
        {
            var ctx = new InsimulRuntimeContext();
            var boot = ctx.Boot("{not valid json", WorldSnapshot, NewOpts());
            Assert.IsTrue(boot.Ok);
            Assert.IsFalse(boot.ResumedSave);
            Assert.IsTrue(ctx.IsLoaded);
        }

        [Test]
        public void Boot_BadSaveAndBadWorld_FailsCleanly()
        {
            var ctx = new InsimulRuntimeContext();
            var boot = ctx.Boot("{bad", "{\"no\":\"world\"}", NewOpts());
            Assert.IsFalse(boot.Ok);
            Assert.IsFalse(ctx.IsLoaded);
            Assert.IsNotEmpty(boot.Error);
        }

        [Test]
        public void CommitToSave_WorldSnapshotHashStable()
        {
            var ctx = new InsimulRuntimeContext();
            ctx.StartNewGame(WorldSnapshot, NewOpts(), out _);
            string before = ctx.WorldSnapshotIntegrity();

            ctx.Quests.AssertFact("objective_satisfied", "q_intro", "obj_0");
            ctx.EvaluateAllQuests();
            ctx.CommitToSave();

            Assert.AreEqual(before, ctx.WorldSnapshotIntegrity());
        }

        [Test]
        public void Context_Envelope_Validates()
        {
            var ctx = new InsimulRuntimeContext();
            ctx.StartNewGame(WorldSnapshot, NewOpts(), out _);
            ctx.CommitToSave();
            string envelope = ctx.BuildEnvelopeJson("test-version", "1970-01-01T00:00:00.000Z");
            Assert.IsTrue(InsimulSaveSystem.ValidateEnvelope(envelope).Ok);
        }
    }
}
