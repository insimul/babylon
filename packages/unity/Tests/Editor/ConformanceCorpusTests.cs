// ConformanceCorpusTests.cs — Unity EditMode NUnit wrapper around the shared
// conformance runner (ConformanceCorpus.cs).
//
// This file is compiled ONLY by the Unity EditMode test assembly
// (Insimul.Tests.Editor.asmdef) — the tools/verify-unity console harness does NOT
// <Compile Include> it, so that harness never references nunit.framework. Both
// harnesses exercise the identical loading/comparison logic in ConformanceCorpus.
//
// Requires the same System.Text.Json Plugins DLL as Runtime/Prolog (US-UP3) plus a
// loadable libinsimul native library to run inside the editor; when either is
// absent the assembly still compiles and the tests report Inconclusive rather than
// hard-failing. See packages/unity/README.md ("EditMode conformance tests").

using System.Collections.Generic;
using NUnit.Framework;
using Insimul.Prolog.Conformance;

namespace Insimul.Prolog.Tests.Editor
{
    [TestFixture]
    public sealed class ConformanceCorpusTests
    {
        // NUnit calls this once to expand the corpus into one test per case. When the
        // corpus is unreachable (a stripped package install) it yields nothing and the
        // parameterized test simply does not appear.
        private static IEnumerable<CorpusCase> PrologCases() =>
            ConformanceCorpus.LoadPrologCorpus();

        [Test]
        public void CorpusIsReachable()
        {
            var cases = ConformanceCorpus.LoadPrologCorpus();
            if (cases.Count == 0)
            {
                Assert.Ignore("Prolog conformance corpus not reachable from this install " +
                              "(set INSIMUL_CONFORMANCE_DIR to the conformance root).");
            }
            Assert.That(cases.Count, Is.GreaterThan(0));
        }

        [Test]
        [TestCaseSource(nameof(PrologCases))]
        public void PrologCase(CorpusCase c)
        {
            var actual = ConformanceCorpus.RunCase(c);
            Assert.That(
                ConformanceCorpus.SameSolutionSet(actual, c.Expected),
                Is.True,
                $"{c}: expected {ConformanceCorpus.Describe(c.Expected)} " +
                $"but got {ConformanceCorpus.Describe(actual)}");
        }
    }
}
