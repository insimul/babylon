// ReimportDiffTests.cs — Unity EditMode NUnit wrapper around the pure re-import
// diff policy core (US-UB4): ReimportDiff (classification + serialization) +
// ReimportReconciler (apply orchestration).
//
// Compiled ONLY by the Unity EditMode test assembly (Insimul.Tests.Editor.asmdef);
// the tools/verify-unity console harness does NOT <Compile Include> it. Both
// harnesses exercise the identical UnityEngine-free core — see
// tools/verify-unity/Program.cs (RunReimportDiffTests) for the authoritative
// host-side gate. The shared golden (fixtures/reimport/golden-diff-report.json)
// pins the report bytes across both + the cross-engine Godot golden.

using NUnit.Framework;
using Insimul.Scene;
using Insimul.Scene.TestSupport;

namespace Insimul.Prolog.Tests.Editor
{
    [TestFixture]
    public sealed class ReimportDiffTests
    {
        [Test]
        public void Diff_MatchesGoldenReport()
        {
            var oldNodes = ReimportCorpus.ReadOldNodes();
            var newNodes = ReimportCorpus.ReadNewNodes();
            Assert.That(oldNodes.Count, Is.EqualTo(5));
            Assert.That(newNodes.Count, Is.EqualTo(4));

            var report = ReimportDiff.Compute(oldNodes, newNodes);
            string got = ReimportDiff.SerializeReport(report);
            string golden = ReimportCorpus.ReadGoldenReportJson();
            Assert.That(golden, Is.Not.Null);
            Assert.That(got, Is.EqualTo(golden.Trim()));
        }

        [Test]
        public void Diff_EveryActionExercised_CountsCorrect()
        {
            var report = ReimportDiff.Compute(ReimportCorpus.ReadOldNodes(), ReimportCorpus.ReadNewNodes());
            Assert.That(report.Added, Is.EqualTo(new[] { "prop.c" }));
            Assert.That(report.Updated, Is.EqualTo(new[] { "building.b" }));
            Assert.That(report.Unchanged, Is.EqualTo(new[] { "building.a" }));
            Assert.That(report.Skipped, Is.EqualTo(new[] { "prop.d", "prop.f" }));
            Assert.That(report.Deprecated, Is.EqualTo(new[] { "prop.e" }));
        }

        [Test]
        public void HandEdit_NeverUpdatedOrDeprecated_AlwaysSkipped()
        {
            var report = ReimportDiff.Compute(ReimportCorpus.ReadOldNodes(), ReimportCorpus.ReadNewNodes());
            // prop.d: hand edit that the new manifest re-lists as generated -> skipped.
            Assert.That(report.Skipped, Does.Contain("prop.d"));
            Assert.That(report.Updated, Does.Not.Contain("prop.d"));
            Assert.That(report.Deprecated, Does.Not.Contain("prop.d"));
            // prop.f: hand edit absent from the new manifest -> kept as-is (skipped).
            Assert.That(report.Skipped, Does.Contain("prop.f"));
            Assert.That(report.Deprecated, Does.Not.Contain("prop.f"));
        }

        [Test]
        public void NoOpReimport_ClassifiesUnchangedAndSkipped()
        {
            var oldNodes = ReimportCorpus.ReadOldNodes();
            var report = ReimportDiff.Compute(oldNodes, oldNodes);
            Assert.That(report.Added, Is.Empty);
            Assert.That(report.Updated, Is.Empty);
            Assert.That(report.Deprecated, Is.Empty);
            Assert.That(report.Unchanged.Count, Is.EqualTo(3));
            Assert.That(report.Skipped.Count, Is.EqualTo(2));
        }

        [Test]
        public void Diff_IsDeterministic()
        {
            var oldNodes = ReimportCorpus.ReadOldNodes();
            var newNodes = ReimportCorpus.ReadNewNodes();
            string a = ReimportDiff.SerializeReport(ReimportDiff.Compute(oldNodes, newNodes));
            string b = ReimportDiff.SerializeReport(ReimportDiff.Compute(oldNodes, newNodes));
            Assert.That(a, Is.EqualTo(b));
        }

        [Test]
        public void Reconciler_DrivesMutator_HandEditsUntouched()
        {
            var mutator = new RecordingReimportMutator();
            ReimportReconciler.Apply(ReimportCorpus.ReadOldNodes(), ReimportCorpus.ReadNewNodes(), mutator);

            Assert.That(mutator.Updated, Is.EqualTo(new[] { "building.b" }));
            Assert.That(mutator.Added, Is.EqualTo(new[] { "prop.c" }));
            Assert.That(mutator.Deprecated, Is.EqualTo(new[] { "prop.e" }));
            Assert.That(mutator.Calls.Exists(c => c.EndsWith(":prop.d")), Is.False);
            Assert.That(mutator.Calls.Exists(c => c.EndsWith(":prop.f")), Is.False);
            Assert.That(mutator.Calls.Exists(c => c.EndsWith(":building.a")), Is.False);
        }

        [Test]
        public void Reconciler_NullMutator_IsPureDryRun()
        {
            var report = ReimportReconciler.Apply(ReimportCorpus.ReadOldNodes(), ReimportCorpus.ReadNewNodes(), null);
            Assert.That(report.Added, Is.EqualTo(new[] { "prop.c" }));
            Assert.That(report.Updated, Is.EqualTo(new[] { "building.b" }));
            Assert.That(report.Deprecated, Is.EqualTo(new[] { "prop.e" }));
        }
    }
}
