// SaveSystemTests.cs — Unity EditMode NUnit wrapper around InsimulSaveSystem
// (US-UC2).
//
// Compiled ONLY by the Unity EditMode test assembly (Insimul.Tests.Editor.asmdef);
// the tools/verify-unity console harness does NOT <Compile Include> it (so that
// harness never references nunit.framework). Both harnesses exercise the identical
// portable save contract — see Program.cs (RunSaveSystemTests) for the
// authoritative host-side gate.
//
// When the golden save corpus / TS-migration goldens are unreachable (a stripped
// install) the corpus-backed tests Ignore rather than hard-fail.

using System.Collections.Generic;
using NUnit.Framework;
using Insimul.Save;
using Insimul.Save.TestSupport;

namespace Insimul.Prolog.Tests.Editor
{
    [TestFixture]
    public sealed class SaveSystemTests
    {
        private const string WorldSnapshot =
            "{\"world\":{\"id\":\"w1\",\"name\":\"W\"},\"settlements\":[],\"characters\":[]}";

        private static string GoldenOrIgnore(string name)
        {
            string json = SaveSystemCorpus.ReadGoldenSave(name);
            if (json == null) Assert.Ignore("golden save corpus not reachable (set INSIMUL_CONFORMANCE_DIR).");
            return json;
        }

        [Test]
        public void NewGame_BuildsCurrentVersionSave()
        {
            var sys = new InsimulSaveSystem();
            sys.NewGame(WorldSnapshot, new NewGameOptions { Id = "s", WorldId = "w1", Name = "New" });
            Assert.That(sys.IsLoaded, Is.True);
            Assert.That(sys.Version, Is.EqualTo(InsimulSaveSystem.SaveFileVersion));
            Assert.That(sys.RestoreFacts().Count, Is.EqualTo(0));
        }

        [Test]
        public void NewGame_RejectsSnapshotMissingWorld()
        {
            var sys = new InsimulSaveSystem();
            Assert.Throws<SaveLoadException>(() =>
                sys.NewGame("{\"settlements\":[]}", new NewGameOptions { Id = "x" }));
        }

        [Test]
        public void Load_RejectsNewerVersion()
        {
            var sys = new InsimulSaveSystem();
            Assert.Throws<SaveLoadException>(() =>
                sys.Load("{\"version\":999,\"worldSnapshot\":{},\"currentState\":{}}"));
        }

        [TestCase("v1-minimal.json", "39503a8e474f370618de2f54bfe365741d4cf6d254032bb59e42670a4c30427f")]
        [TestCase("v2-typical.json", "4b24b7a3fba6eff0808e4306683cd34ac5127223b3de5ab4a7f6d0f84e4534c6")]
        [TestCase("v2-with-extensions.json", "753a504d7781e07f7fdc368f6f65e1d4677991bf7658b7c84cc7977cde68ac7f")]
        public void IntegrityVector_MatchesTs(string fixtureName, string expected)
        {
            string fixture = GoldenOrIgnore(fixtureName);
            // Hash the RAW fixture (vectors are on raw, un-migrated saves).
            Assert.That(CanonicalJson.Integrity(JsonVal.Parse(fixture)), Is.EqualTo(expected));
        }

        [TestCase("v1-minimal")]
        [TestCase("v2-typical")]
        public void Migration_ProducesTsIdenticalCanonical(string name)
        {
            string fixture = GoldenOrIgnore($"{name}.json");
            string golden = SaveSystemCorpus.ReadSaveFixture($"{name}.migrated.canonical.json");
            if (golden == null) Assert.Ignore("TS-migration golden not reachable.");

            var sys = new InsimulSaveSystem();
            sys.Load(fixture);
            Assert.That(sys.Version, Is.EqualTo(InsimulSaveSystem.SaveFileVersion));
            Assert.That(sys.SerializeCanonical(), Is.EqualTo(golden));
        }

        [Test]
        public void SnapshotRestoreFacts_IsIdentity()
        {
            var facts = new List<PrologFact>
            {
                new PrologFact("player_cefr_level", new[] { PrologArg.Atom("player"), PrologArg.Atom("A2") }),
                new PrologFact("gold", new[] { PrologArg.Atom("player"), PrologArg.Number(42) }),
            };
            var a = new InsimulSaveSystem();
            a.NewGame(WorldSnapshot, new NewGameOptions { Id = "s", WorldId = "w1" });
            a.SnapshotFacts(facts);

            var b = new InsimulSaveSystem();
            b.Load(a.SerializeCanonical());
            var restored = b.RestoreFacts();
            Assert.That(restored.Count, Is.EqualTo(facts.Count));
            for (int i = 0; i < facts.Count; i++)
                Assert.That(restored[i].Equals(facts[i]), Is.True, $"fact {i}");
        }

        [Test]
        public void Envelope_BuildValidateTamper()
        {
            var sys = new InsimulSaveSystem();
            sys.NewGame(WorldSnapshot, new NewGameOptions { Id = "s", WorldId = "w1" });
            string env = sys.BuildEnvelopeJson("1.0.0", "2026-01-01T00:00:00.000Z");
            Assert.That(InsimulSaveSystem.ValidateEnvelope(env).Ok, Is.True);

            string tampered = env.Replace("\"totalPlaytime\":0", "\"totalPlaytime\":9999");
            var r = InsimulSaveSystem.ValidateEnvelope(tampered);
            Assert.That(r.Ok, Is.False);
            Assert.That(r.Code, Is.EqualTo("integrity_mismatch"));
        }

        [Test]
        public void Envelope_IntegrityHashesSaveFileOnly()
        {
            var sys = new InsimulSaveSystem();
            sys.NewGame(WorldSnapshot, new NewGameOptions { Id = "s", WorldId = "w1" });
            string e1 = sys.BuildEnvelopeJson("1.2.3", "2026-01-01T00:00:00.000Z");
            string e2 = sys.BuildEnvelopeJson("9.9.9", "2027-01-01T00:00:00.000Z");
            // exportedAt/insimulVersion differ; integrity (over saveFile) is stable.
            Assert.That(InsimulSaveSystem.ValidateEnvelope(e1).Ok, Is.True);
            Assert.That(InsimulSaveSystem.ValidateEnvelope(e2).Ok, Is.True);
        }
    }
}
