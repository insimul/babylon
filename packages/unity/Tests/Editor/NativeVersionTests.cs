// NativeVersionTests.cs — Unity EditMode NUnit tests for the libinsimul version
// handshake (US-UP3).
//
// These exercise the PURE comparison surface of InsimulProlog only — ParseSemver
// / CheckNativeVersion take the version string as an argument, so the mismatch
// path is tested with MOCKED stamps and NO native library is required. (This is
// the same logic the console harness covers in tools/verify-unity; duplicated
// here so the check also runs inside the Unity Test Runner.)
//
// Compiled ONLY by the Unity EditMode test assembly (Insimul.Tests.Editor.asmdef);
// uses the public surface only, so no InternalsVisibleTo is needed.

using NUnit.Framework;
using Insimul.Prolog;

namespace Insimul.Prolog.Tests.Editor
{
    [TestFixture]
    public sealed class NativeVersionTests
    {
        [TestCase("1.2.3", 1, 2, 3)]
        [TestCase("v0.1.0", 0, 1, 0)]
        [TestCase("0.1.0-rc.1+build.5", 0, 1, 0)]
        public void ParseSemver_ParsesCore(string input, int major, int minor, int patch)
        {
            var v = InsimulProlog.ParseSemver(input);
            Assert.That(v.Major, Is.EqualTo(major));
            Assert.That(v.Minor, Is.EqualTo(minor));
            Assert.That(v.Patch, Is.EqualTo(patch));
        }

        [TestCase("1.2")]
        [TestCase("1.x.0")]
        [TestCase("")]
        [TestCase(" ")]
        public void ParseSemver_MalformedThrows(string input)
        {
            Assert.Throws<InsimulPrologException>(() => InsimulProlog.ParseSemver(input));
        }

        [Test]
        public void CheckNativeVersion_ExactMatch_IsCompatible()
        {
            var c = InsimulProlog.CheckNativeVersion("0.1.0", "0.1.0");
            Assert.That(c.Compatible, Is.True);
            Assert.That(c.ActualSemver, Is.EqualTo("0.1.0"));
        }

        [Test]
        public void CheckNativeVersion_PatchDrift_IsCompatible()
        {
            var c = InsimulProlog.CheckNativeVersion("0.1.9", "0.1.0");
            Assert.That(c.Compatible, Is.True);
        }

        [TestCase("0.2.0")] // minor drift
        [TestCase("1.1.0")] // major drift
        public void CheckNativeVersion_AbiDrift_IsIncompatible(string actual)
        {
            var c = InsimulProlog.CheckNativeVersion(actual, "0.1.0");
            Assert.That(c.Compatible, Is.False);
            Assert.That(c.Message, Does.Contain(actual));
            Assert.That(c.Message, Does.Contain("0.1.0"));
        }

        [Test]
        public void CheckNativeVersion_UnparseableActual_IsIncompatibleNotThrow()
        {
            var c = InsimulProlog.CheckNativeVersion("garbage", "0.1.0");
            Assert.That(c.Compatible, Is.False);
            Assert.That(c.Message, Does.Contain("garbage"));
        }

        [Test]
        public void ExpectedNativeSemver_IsWellFormed()
        {
            Assert.DoesNotThrow(() => InsimulProlog.ParseSemver(InsimulProlog.ExpectedNativeSemver));
        }
    }
}
