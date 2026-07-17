// WorldSourceTests.cs — Unity EditMode NUnit wrapper around InsimulWorldSource
// (US-UC1).
//
// Compiled ONLY by the Unity EditMode test assembly (Insimul.Tests.Editor.asmdef);
// the tools/verify-unity console harness does NOT <Compile Include> it (so that
// harness never references nunit.framework). Both harnesses exercise the identical
// InsimulWorldSource loading + version-compatibility logic — see Program.cs
// (RunWorldSourceTests) for the authoritative host-side gate.
//
// When the golden save corpus / fixtures are unreachable (a stripped package
// install) the tests report Ignore rather than hard-failing, matching
// ConformanceCorpusTests.

using NUnit.Framework;
using Insimul.World;
using Insimul.World.TestSupport;

namespace Insimul.Prolog.Tests.Editor
{
    [TestFixture]
    public sealed class WorldSourceTests
    {
        private static string GoldenTypicalOrIgnore()
        {
            string json = WorldSourceCorpus.ReadGoldenSave("v2-typical.json");
            if (json == null)
                Assert.Ignore("golden save corpus not reachable (set INSIMUL_CONFORMANCE_DIR).");
            return json;
        }

        private static string VersionedOrIgnore()
        {
            string json = WorldSourceCorpus.ReadWorldFixture("versioned-snapshot.json");
            if (json == null)
                Assert.Ignore("versioned-snapshot.json fixture not reachable.");
            return json;
        }

        [Test]
        public void GoldenTypical_EntityCounts()
        {
            var w = InsimulWorldSource.FromSaveJson(GoldenTypicalOrIgnore());
            Assert.That(w.WorldId, Is.EqualTo("fixture-world"));
            Assert.That(w.Characters.Count, Is.EqualTo(1));
            Assert.That(w.Settlements.Count, Is.EqualTo(1));
            Assert.That(w.Lots.Count, Is.EqualTo(1));
            Assert.That(w.Quests.Count, Is.EqualTo(1));
            Assert.That(w.QuestPrologContent().Count, Is.EqualTo(1));
            Assert.That(w.QuestPrologContent()[0], Does.Contain("quest(quest_welcome"));
        }

        [Test]
        public void UnversionedSnapshot_SkipsCompatibilityCheck()
        {
            var w = InsimulWorldSource.FromSaveJson(GoldenTypicalOrIgnore(), currentWorldVersion: 99);
            Assert.That(w.Compatibility, Is.Null);
        }

        [Test]
        public void VersionedSnapshot_Behind_LoadsCompatible()
        {
            var w = InsimulWorldSource.FromSaveJson(VersionedOrIgnore(), currentWorldVersion: 8);
            Assert.That(w.Items.Count, Is.EqualTo(1));
            Assert.That(w.Compatibility, Is.Not.Null);
            Assert.That(w.Compatibility.Compatible, Is.True);
            Assert.That(w.Compatibility.Status, Is.EqualTo(WorldSnapshotVersion.Status.Behind));
        }

        [Test]
        public void VersionedSnapshot_Ahead_Rejected()
        {
            string json = VersionedOrIgnore();
            var ex = Assert.Throws<InsimulWorldException>(
                () => InsimulWorldSource.FromSaveJson(json, currentWorldVersion: 2));
            Assert.That(ex.Message, Does.Contain("ahead of the world version"));
        }

        [Test]
        public void VersionedSnapshot_TooFarBehind_Rejected()
        {
            string json = VersionedOrIgnore();
            var ex = Assert.Throws<InsimulWorldException>(
                () => InsimulWorldSource.FromSaveJson(json, currentWorldVersion: 60));
            Assert.That(ex.Message, Does.Contain("versions behind"));
        }

        [Test]
        public void CheckSnapshotCompatibility_MatchesCoreSemantics()
        {
            Assert.That(WorldSnapshotVersion.CheckSnapshotCompatibility(3, 3).Status,
                Is.EqualTo(WorldSnapshotVersion.Status.Current));
            Assert.That(WorldSnapshotVersion.CheckSnapshotCompatibility(4, 3).Message,
                Does.Contain("1 version behind"));
            Assert.That(WorldSnapshotVersion.CheckSnapshotCompatibility(3, 5).Compatible, Is.False);
            Assert.That(
                WorldSnapshotVersion.CheckSnapshotCompatibility(
                    WorldSnapshotVersion.MaxCompatibleVersionGap + 6, 5).Compatible,
                Is.False);
        }
    }
}
