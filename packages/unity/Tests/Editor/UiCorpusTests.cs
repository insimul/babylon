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
