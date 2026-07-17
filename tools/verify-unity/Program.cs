// Program.cs — dependency-free verification harness for the Unity Prolog
// wrapper (US-UP1). No test framework: a tiny assert/case runner keeps the
// project buildable on a bare .NET SDK. Exit code 0 = all green.
//
// The native tests require a loadable libinsimul (run.sh builds it and sets the
// loader path). The pure tests (ParseBindingSet) run with no native library.

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using System.IO;
using Insimul.Binding;
using Insimul.Binding.TestSupport;
using Insimul.Prolog;
using Insimul.Prolog.Conformance;
using Insimul.Quest;
using Insimul.Quest.TestSupport;
using Insimul.Radiant;
using Insimul.Radiant.Conformance;
using Insimul.Runtime;
using Insimul.Save;
using Insimul.Save.TestSupport;
using Insimul.Scene;
using Insimul.Scene.TestSupport;
using Insimul.UI;
using Insimul.UI.TestSupport;
using Insimul.World;
using Insimul.World.TestSupport;

namespace Insimul.Verify
{
    internal static class Program
    {
        private static int _passed;
        private static int _failed;

        private static int Main(string[] args)
        {
            bool skipNative = args.Contains("--pure-only");

            Section("Pure (no native library)");
            RunParseBindingSetTests();
            RunVersionHandshakeTests();
            RunAdapterPureTests();
            RunWorldSourceTests();
            RunSaveSystemTests();
            RunQuestSystemTests();
            RunRadiantPureTests();
            RunBootstrapTests();
            RunBindingResolverTests();
            RunPlaceholderPackTests();
            RunSceneGenTests();
            RunReimportDiffTests();
            RunBindingEditorTests();
            RunUiRegistryTests();
            RunLoadingScreenTests();
            RunNotificationTests();
            RunThemeTokenTests();
            RunQuestJournalTests();
            RunQuestFeedTests();
            RunTradeTests();
            RunChatTests();
            RunPauseMenuTests();
            RunSaveSlotTests();

            if (skipNative)
            {
                Console.WriteLine("\n(--pure-only: skipping native tests)");
                return Report();
            }

            Section("Native (requires libinsimul on the loader path)");
            try
            {
                RunNativeTests();
                RunAdapterNativeTests();
                RunConformanceCorpus();
                RunRadiantConformance();
                RunSaveKbRoundTripNative();
                RunQuestKbRoundTripNative();
            }
            catch (DllNotFoundException ex)
            {
                Console.WriteLine($"\nFATAL: libinsimul not found on the loader path: {ex.Message}");
                Console.WriteLine("Run via tools/verify-unity/run.sh, which builds it and sets DYLD/LD_LIBRARY_PATH.");
                return 2;
            }

            return Report();
        }

        // ---- Pure tests ------------------------------------------------------

        private static void RunParseBindingSetTests()
        {
            Case("ParseBindingSet: empty object => empty map", () =>
            {
                var b = InsimulProlog.ParseBindingSet("{}");
                AssertEqual(0, b.Count);
            });

            Case("ParseBindingSet: atom binds as string", () =>
            {
                var b = InsimulProlog.ParseBindingSet("{\"X\":\"sword\"}");
                AssertEqual(1, b.Count);
                AssertEqual("sword", b["X"].GetString());
            });

            Case("ParseBindingSet: integer binds as number", () =>
            {
                var b = InsimulProlog.ParseBindingSet("{\"N\":42}");
                AssertEqual(JsonValueKind.Number, b["N"].ValueKind);
                AssertEqual(42, b["N"].GetInt32());
            });

            Case("ParseBindingSet: multiple vars", () =>
            {
                var b = InsimulProlog.ParseBindingSet("{\"Item\":\"key\",\"Qty\":3}");
                AssertEqual("key", b["Item"].GetString());
                AssertEqual(3, b["Qty"].GetInt32());
            });

            Case("ParseBindingSet: null/empty => empty map", () =>
            {
                AssertEqual(0, InsimulProlog.ParseBindingSet(null).Count);
                AssertEqual(0, InsimulProlog.ParseBindingSet("").Count);
            });

            Case("ParseBindingSet: malformed JSON throws InsimulPrologException", () =>
            {
                AssertThrows<InsimulPrologException>(() => InsimulProlog.ParseBindingSet("{not json"));
            });

            Case("ParseBindingSet: non-object JSON throws InsimulPrologException", () =>
            {
                AssertThrows<InsimulPrologException>(() => InsimulProlog.ParseBindingSet("[1,2,3]"));
            });
        }

        // ---- Version handshake (US-UP3) -------------------------------------

        // Pure (no native library): the version comparison takes the native stamp
        // as an argument, so the compatible AND mismatch paths are exercised with
        // MOCKED stamps — no libinsimul required.
        private static void RunVersionHandshakeTests()
        {
            Case("ParseSemver: MAJOR.MINOR.PATCH", () =>
            {
                var v = InsimulProlog.ParseSemver("1.2.3");
                AssertEqual(1, v.Major);
                AssertEqual(2, v.Minor);
                AssertEqual(3, v.Patch);
            });

            Case("ParseSemver: tolerates leading v and pre-release/build metadata", () =>
            {
                AssertEqual("0.1.0", InsimulProlog.ParseSemver("v0.1.0").ToString());
                AssertEqual("0.1.0", InsimulProlog.ParseSemver("0.1.0-rc.1+build.5").ToString());
            });

            Case("ParseSemver: malformed throws InsimulPrologException", () =>
            {
                AssertThrows<InsimulPrologException>(() => InsimulProlog.ParseSemver("1.2"));
                AssertThrows<InsimulPrologException>(() => InsimulProlog.ParseSemver("1.x.0"));
                AssertThrows<InsimulPrologException>(() => InsimulProlog.ParseSemver(""));
            });

            Case("CheckNativeVersion: exact match is compatible", () =>
            {
                var c = InsimulProlog.CheckNativeVersion("0.1.0", "0.1.0");
                AssertTrue(c.Compatible, "exact match should be compatible");
                AssertEqual("0.1.0", c.ActualSemver);
            });

            Case("CheckNativeVersion: differing PATCH is compatible", () =>
            {
                var c = InsimulProlog.CheckNativeVersion("0.1.7", "0.1.0");
                AssertTrue(c.Compatible, "patch drift should stay compatible");
            });

            Case("CheckNativeVersion: MINOR drift is a mismatch", () =>
            {
                var c = InsimulProlog.CheckNativeVersion("0.2.0", "0.1.0");
                AssertTrue(!c.Compatible, "minor drift should be incompatible");
                AssertTrue(c.Message.Contains("0.2.0") && c.Message.Contains("0.1.0"),
                    "mismatch message should name both versions");
            });

            Case("CheckNativeVersion: MAJOR drift is a mismatch", () =>
            {
                var c = InsimulProlog.CheckNativeVersion("1.1.0", "0.1.0");
                AssertTrue(!c.Compatible, "major drift should be incompatible");
            });

            Case("CheckNativeVersion: unparseable actual is a mismatch (not a throw)", () =>
            {
                var c = InsimulProlog.CheckNativeVersion("garbage", "0.1.0");
                AssertTrue(!c.Compatible, "unparseable native version is incompatible");
                AssertTrue(c.Message.Contains("garbage"), "message should surface the bad stamp");
            });

            Case("ExpectedNativeSemver is a well-formed semver", () =>
            {
                var v = InsimulProlog.ParseSemver(InsimulProlog.ExpectedNativeSemver);
                AssertTrue(v.Major >= 0 && v.Minor >= 0 && v.Patch >= 0, "expected semver should parse");
            });
        }

        // ---- Native tests ----------------------------------------------------

        private static void RunNativeTests()
        {
            Case("version: non-empty semver", () =>
            {
                string v = InsimulProlog.NativeVersion;
                AssertTrue(!string.IsNullOrWhiteSpace(v), "version should be non-empty");
                Console.WriteLine($"      libinsimul {v}");
            });

            Case("VerifyNativeVersion: loaded library is ABI-compatible", () =>
            {
                // This reads the REAL native version. If the locally built
                // libinsimul drifts from ExpectedNativeSemver on MAJOR.MINOR, this
                // fails loudly — the handshake doing its job. Bump
                // ExpectedNativeSemver (and re-fetch) to reconcile.
                var check = InsimulProlog.VerifyNativeVersion();
                AssertTrue(check.Compatible, check.Message);
                Console.WriteLine($"      {check.Message}");
            });

            Case("consult + query: single solution with binding", () =>
            {
                using var pl = new InsimulProlog();
                pl.Consult("likes(sam, prolog).");
                var sols = pl.Query("likes(sam, X)").ToList();
                AssertEqual(1, sols.Count);
                AssertEqual("prolog", sols[0]["X"].GetString());
            });

            Case("ground query that succeeds => one empty binding set", () =>
            {
                using var pl = new InsimulProlog();
                pl.Consult("fact(a).");
                var sols = pl.Query("fact(a)").ToList();
                AssertEqual(1, sols.Count);
                AssertEqual(0, sols[0].Count);
                AssertTrue(pl.Holds("fact(a)"), "Holds should be true");
            });

            Case("query that fails => zero solutions", () =>
            {
                using var pl = new InsimulProlog();
                pl.Consult("fact(a).");
                AssertEqual(0, pl.Query("fact(b)").Count());
                AssertTrue(!pl.Holds("fact(b)"), "Holds should be false");
            });

            Case("multiple solutions enumerate lazily", () =>
            {
                using var pl = new InsimulProlog();
                pl.Consult("color(red). color(green). color(blue).");
                var vals = pl.Query("color(C)").Select(s => s["C"].GetString()).OrderBy(x => x).ToList();
                AssertEqual(3, vals.Count);
                AssertEqual("blue", vals[0]);
                AssertEqual("green", vals[1]);
                AssertEqual("red", vals[2]);
            });

            Case("rules unify (grandparent)", () =>
            {
                using var pl = new InsimulProlog();
                pl.Consult(
                    "parent(tom, bob). parent(bob, ann). " +
                    "grandparent(X, Z) :- parent(X, Y), parent(Y, Z).");
                var sols = pl.Query("grandparent(tom, G)").ToList();
                AssertEqual(1, sols.Count);
                AssertEqual("ann", sols[0]["G"].GetString());
            });

            Case("assert then query", () =>
            {
                using var pl = new InsimulProlog();
                pl.Assert("owns(player, torch)");
                AssertTrue(pl.Holds("owns(player, torch)"), "asserted fact should hold");
            });

            Case("retract removes a matching clause", () =>
            {
                using var pl = new InsimulProlog();
                pl.Assert("owns(player, torch)");
                bool removed = pl.Retract("owns(player, torch)");
                AssertTrue(removed, "retract should report a removal");
                AssertTrue(!pl.Holds("owns(player, torch)"), "fact should be gone");
            });

            Case("snapshot then restore round-trips state", () =>
            {
                using var pl = new InsimulProlog();
                pl.Assert("score(10)");
                string snap = pl.Snapshot();
                pl.Retract("score(10)");
                AssertTrue(!pl.Holds("score(10)"), "retracted before restore");
                pl.Restore(snap);
                AssertTrue(pl.Holds("score(10)"), "restore should bring the fact back");
            });

            // ---- Disposal / lifetime ----

            Case("double-dispose is safe", () =>
            {
                var pl = new InsimulProlog();
                pl.Assert("x(1)");
                pl.Dispose();
                pl.Dispose(); // must not throw or crash
            });

            Case("query iterator after KB dispose throws ObjectDisposedException", () =>
            {
                var pl = new InsimulProlog();
                pl.Consult("n(1). n(2). n(3).");
                var it = pl.Query("n(X)").GetEnumerator();
                AssertTrue(it.MoveNext(), "first solution available");
                pl.Dispose(); // closes the live iterator, destroys the KB
                AssertThrows<ObjectDisposedException>(() => it.MoveNext());
            });

            Case("method use after dispose throws ObjectDisposedException", () =>
            {
                var pl = new InsimulProlog();
                pl.Dispose();
                AssertThrows<ObjectDisposedException>(() => pl.Assert("y(1)"));
                AssertThrows<ObjectDisposedException>(() => pl.Query("y(X)").ToList());
            });

            // ---- Thread affinity ----

            Case("cross-thread use throws InvalidOperationException", () =>
            {
                using var pl = new InsimulProlog();
                pl.Assert("t(1)");
                Exception captured = null;
                var other = new Thread(() =>
                {
                    try { pl.Query("t(X)").ToList(); }
                    catch (Exception e) { captured = e; }
                });
                other.Start();
                other.Join();
                AssertTrue(captured is InvalidOperationException,
                    $"expected InvalidOperationException off-thread, got {captured?.GetType().Name ?? "none"}");
            });
        }

        // ---- Prolog game adapter (US-UP4) -----------------------------------

        // Pure: the atom encoders are the single source of truth for fact/atom
        // encoding, so they are tested with no native library.
        private static void RunAdapterPureTests()
        {
            Case("adapter Sanitize: lowercases + slugs non-atom chars", () =>
            {
                AssertEqual("find_the_sword", PrologGameAdapter.Sanitize("Find the Sword!"));
                AssertEqual("iron_axe", PrologGameAdapter.Sanitize("Iron  Axe"));
            });

            Case("adapter Sanitize: leading digit gets underscore, empty => _empty", () =>
            {
                AssertEqual("_1st_quest", PrologGameAdapter.Sanitize("1st Quest"));
                AssertEqual("_empty", PrologGameAdapter.Sanitize(""));
                AssertEqual("_empty", PrologGameAdapter.Sanitize("!!!"));
            });

            Case("adapter Escape: backslash + single-quote", () =>
            {
                AssertEqual("it\\'s", PrologGameAdapter.Escape("it's"));
                AssertEqual("a\\\\b", PrologGameAdapter.Escape("a\\b"));
            });

            Case("adapter NormalizeFact: trims + strips one trailing period", () =>
            {
                AssertEqual("foo(a)", PrologGameAdapter.NormalizeFact("  foo(a). "));
                AssertEqual("foo(a)", PrologGameAdapter.NormalizeFact("foo(a)"));
                AssertEqual("", PrologGameAdapter.NormalizeFact(null));
            });
        }

        // ---- World source (US-UC1) ------------------------------------------

        // Pure: InsimulWorldSource parses through the generated DTOs + System.Text.Json
        // with NO native library and NO Unity editor, so the whole world-loading +
        // version-compatibility surface is host-tested here against the golden saves.
        private static void RunWorldSourceTests()
        {
            Section("World source (US-UC1)");

            string typical = WorldSourceCorpus.ReadGoldenSave("v2-typical.json");
            if (typical == null)
            {
                _failed++;
                Console.WriteLine("  FAIL  golden save corpus not found " +
                                  "(set INSIMUL_CONFORMANCE_DIR to the conformance root)");
            }
            else
            {
                Case("FromSaveJson: golden v2-typical -> expected entity counts", () =>
                {
                    var w = InsimulWorldSource.FromSaveJson(typical);
                    AssertEqual("fixture-world", w.WorldId);
                    AssertEqual("Fixture Village", w.WorldName);
                    AssertEqual(1, w.Characters.Count);
                    AssertEqual(1, w.Settlements.Count);
                    AssertEqual(1, w.Lots.Count);
                    AssertEqual(1, w.Quests.Count);
                    AssertEqual(0, w.Items.Count); // no items array in this snapshot
                });

                Case("FromSaveJson: typed accessors read ids / names / prolog content", () =>
                {
                    var w = InsimulWorldSource.FromSaveJson(typical);
                    AssertEqual("npc-shopkeeper", w.Characters[0].Id);
                    AssertEqual("Marie", w.Characters[0].Name); // firstName fallback
                    AssertEqual("settlement-1", w.Settlements[0].Id);
                    AssertEqual("lot-shop", w.Lots[0].Id);
                    AssertEqual("quest-welcome", w.Quests[0].Id);

                    var content = w.QuestPrologContent();
                    AssertEqual(1, content.Count);
                    AssertTrue(content[0].Contains("quest(quest_welcome"),
                        "quest prolog content should be surfaced verbatim");
                });

                Case("FromSaveJson: unversioned snapshot skips the check (treated current)", () =>
                {
                    // v2-typical carries no worldSnapshot.worldVersion, so even a
                    // current-version argument leaves Compatibility null (no throw).
                    var w = InsimulWorldSource.FromSaveJson(typical, currentWorldVersion: 99);
                    AssertTrue(w.Compatibility == null, "unversioned save should skip the check");
                });
            }

            string versioned = WorldSourceCorpus.ReadWorldFixture("versioned-snapshot.json");
            if (versioned == null)
            {
                _failed++;
                Console.WriteLine("  FAIL  versioned-snapshot.json fixture not found");
            }
            else
            {
                Case("FromSaveJson: versioned snapshot reads items + entity counts", () =>
                {
                    var w = InsimulWorldSource.FromSaveJson(versioned);
                    AssertEqual(2, w.Characters.Count);
                    AssertEqual(1, w.Items.Count);
                    AssertEqual("item-lantern", w.Items[0].Id);
                    AssertEqual("Lantern", w.Items[0].Name);
                });

                Case("FromSaveJson: snapshot behind but within gap -> loads, status Behind", () =>
                {
                    // worldVersion 5, current 8 -> 3 behind (< MAX gap) -> compatible.
                    var w = InsimulWorldSource.FromSaveJson(versioned, currentWorldVersion: 8);
                    AssertTrue(w.Compatibility != null, "versioned save should produce a verdict");
                    AssertTrue(w.Compatibility.Compatible, "3 behind should be compatible");
                    AssertEqual(WorldSnapshotVersion.Status.Behind, w.Compatibility.Status);
                });

                Case("FromSaveJson: snapshot ahead of world -> rejected with documented error", () =>
                {
                    // worldVersion 5, current 2 -> snapshot ahead -> incompatible.
                    var ex = AssertThrowsReturning<InsimulWorldException>(
                        () => InsimulWorldSource.FromSaveJson(versioned, currentWorldVersion: 2));
                    AssertTrue(ex.Message.Contains("ahead of the world version"),
                        "rejection message should match the documented 'ahead' text");
                });

                Case("FromSaveJson: snapshot too far behind (>50) -> rejected", () =>
                {
                    // worldVersion 5, current 60 -> 55 behind (> MAX 50) -> incompatible.
                    var ex = AssertThrowsReturning<InsimulWorldException>(
                        () => InsimulWorldSource.FromSaveJson(versioned, currentWorldVersion: 60));
                    AssertTrue(ex.Message.Contains("versions behind"),
                        "rejection message should cite the version gap");
                });
            }

            // Pure parity with packages/core/src/world-snapshot-version.ts.
            Case("CheckSnapshotCompatibility: equal versions => current", () =>
            {
                var r = WorldSnapshotVersion.CheckSnapshotCompatibility(3, 3);
                AssertTrue(r.Compatible, "equal versions compatible");
                AssertEqual(WorldSnapshotVersion.Status.Current, r.Status);
                AssertEqual(0, r.VersionsBehind);
            });

            Case("CheckSnapshotCompatibility: one behind => singular message", () =>
            {
                var r = WorldSnapshotVersion.CheckSnapshotCompatibility(4, 3);
                AssertTrue(r.Compatible, "one behind compatible");
                AssertEqual(WorldSnapshotVersion.Status.Behind, r.Status);
                AssertTrue(r.Message.Contains("1 version behind"),
                    "singular 'version' for a gap of one");
            });

            Case("CheckSnapshotCompatibility: ahead => incompatible", () =>
            {
                var r = WorldSnapshotVersion.CheckSnapshotCompatibility(3, 5);
                AssertTrue(!r.Compatible, "ahead is incompatible");
                AssertEqual(WorldSnapshotVersion.Status.Incompatible, r.Status);
                AssertEqual(-2, r.VersionsBehind);
            });

            Case("CheckSnapshotCompatibility: gap beyond MAX => incompatible", () =>
            {
                var r = WorldSnapshotVersion.CheckSnapshotCompatibility(
                    WorldSnapshotVersion.MaxCompatibleVersionGap + 6, 5);
                AssertTrue(!r.Compatible, "51 behind is incompatible");
                AssertEqual(WorldSnapshotVersion.Status.Incompatible, r.Status);
            });

            Case("ShouldBumpVersion / NextVersion parity", () =>
            {
                AssertTrue(WorldSnapshotVersion.ShouldBumpVersion("character"), "character bumps");
                AssertTrue(!WorldSnapshotVersion.ShouldBumpVersion("weather"), "unlisted does not bump");
                AssertEqual(6, WorldSnapshotVersion.NextVersion(5));
            });

            Case("FromSaveJson: empty / snapshot-less input throws InsimulWorldException", () =>
            {
                AssertThrows<InsimulWorldException>(() => InsimulWorldSource.FromSaveJson(""));
                AssertThrows<InsimulWorldException>(
                    () => InsimulWorldSource.FromSaveJson("{\"id\":\"x\",\"status\":\"active\"}"));
            });
        }

        // Native: real unification through libinsimul (the whole point of US-UP4).
        private static void RunAdapterNativeTests()
        {
            Section("Prolog game adapter (US-UP4, native)");

            Case("adapter Query: real unification enumerates solutions", () =>
            {
                using var a = new PrologGameAdapter();
                a.Consult("color(red). color(green). color(blue).");
                var vals = a.QueryColumn("color(C)", "C");
                vals.Sort();
                AssertEqual(3, vals.Count);
                AssertEqual("blue", vals[0]);
                AssertEqual("green", vals[1]);
                AssertEqual("red", vals[2]);
            });

            Case("adapter QueryColumn: distinct removes duplicate projections", () =>
            {
                using var a = new PrologGameAdapter();
                a.Consult("likes(sam, tea). likes(bob, tea). likes(ann, coffee).");
                var drinks = a.QueryColumn("likes(_, D)", "D");
                drinks.Sort();
                AssertEqual(2, drinks.Count); // tea deduped
                AssertEqual("coffee", drinks[0]);
                AssertEqual("tea", drinks[1]);
            });

            Case("adapter rules participate in resolution", () =>
            {
                using var a = new PrologGameAdapter();
                a.Consult("item_type(sword_a, sword). item_category(sword_a, weapon).");
                a.Consult("item_is_a(I, C) :- item_category(I, C). item_is_a(I, T) :- item_type(I, T).");
                AssertTrue(a.Holds("item_is_a(sword_a, weapon)"), "category IS-A should hold");
                AssertTrue(a.Holds("item_is_a(sword_a, sword)"), "type IS-A should hold");
                AssertTrue(!a.Holds("item_is_a(sword_a, potion)"), "unrelated IS-A should not hold");
            });

            Case("adapter CanPerformAction: undeclared predicate => allowed (graceful)", () =>
            {
                using var a = new PrologGameAdapter();
                // No can_perform rules loaded at all.
                var r = a.CanPerformAction("open_door", "player");
                AssertTrue(r.Allowed, "undeclared can_perform should allow by default");
            });

            Case("adapter CanPerformAction: declared but unmet => denied", () =>
            {
                using var a = new PrologGameAdapter();
                a.Consult("can_perform(player, wave).");
                var ok = a.CanPerformAction("wave", "player");
                AssertTrue(ok.Allowed, "matching can_perform should allow");
                var no = a.CanPerformAction("fly", "player");
                AssertTrue(!no.Allowed, "unmet prerequisite should deny");
                AssertTrue(no.Reason != null && no.Reason.Contains("fly"), "deny reason names the action");
            });

            Case("adapter RetractAll: removes every matching clause", () =>
            {
                using var a = new PrologGameAdapter();
                a.AssertFact("personality(bob, openness, 0.5)");
                a.AssertFact("personality(bob, neuroticism, 0.2)");
                int removed = a.RetractAll("personality(bob, _, _)");
                AssertEqual(2, removed);
                AssertTrue(!a.Holds("personality(bob, openness, 0.5)"), "all personality clauses gone");
            });

            Case("adapter player-fact tracking + save round-trip via RestorePlayerFacts", () =>
            {
                using var a = new PrologGameAdapter();
                a.AssertFact("world_fact(town)");          // NOT a player fact
                a.AssertPlayerFact("has(player, torch)");
                a.AssertPlayerFact("has_item(player, torch, 3)");
                var saved = a.GetPlayerFacts();
                AssertEqual(2, saved.Length); // world_fact excluded

                using var b = new PrologGameAdapter();
                b.RestorePlayerFacts(saved);
                AssertTrue(b.Holds("has(player, torch)"), "restored has fact");
                AssertTrue(b.Holds("has_item(player, torch, 3)"), "restored quantity fact");
            });

            Case("adapter item-quantity update retracts old has_item", () =>
            {
                using var a = new PrologGameAdapter();
                a.AssertPlayerFact("has_item(player, apple, 2)");
                a.RetractPlayerFactByPattern("has_item(player, apple, _)", "has_item(player, apple");
                a.AssertPlayerFact("has_item(player, apple, 5)");
                var qtys = a.QueryColumn("has_item(player, apple, Q)", "Q");
                AssertEqual(1, qtys.Count); // exactly one has_item clause remains
                AssertEqual("5", qtys[0]);
            });

            Case("adapter SnapshotState / RestoreState round-trips full KB", () =>
            {
                using var a = new PrologGameAdapter();
                a.AssertFact("quest_active(player, q1)");
                string snap = a.SnapshotState();
                a.RetractFact("quest_active(player, q1)");
                AssertTrue(!a.Holds("quest_active(player, q1)"), "retracted before restore");
                a.RestoreState(snap);
                AssertTrue(a.Holds("quest_active(player, q1)"), "restore brings the fact back");
            });

            Case("adapter use after dispose throws", () =>
            {
                var a = new PrologGameAdapter();
                a.Dispose();
                a.Dispose(); // idempotent
                AssertThrows<ObjectDisposedException>(() => a.AssertFact("x(1)"));
            });
        }

        // ---- Conformance corpus (US-UP2) ------------------------------------

        // Runs the shared, framework-agnostic corpus runner (ConformanceCorpus) over
        // every packages/core/conformance/prolog/*.json case through the real native
        // engine. This is the authoritative host-side parity gate — the same JSON the
        // tau-prolog TS suite and the Unity EditMode assembly consume.
        private static void RunConformanceCorpus()
        {
            Section("Conformance corpus (packages/core/conformance/prolog)");

            string root = ConformanceCorpus.LocateCorpusRoot();
            if (root == null)
            {
                _failed++;
                Console.WriteLine("  FAIL  corpus directory not found " +
                                  "(set INSIMUL_CONFORMANCE_DIR to the conformance root)");
                return;
            }

            var cases = ConformanceCorpus.LoadPrologCorpus(root);
            if (cases.Count == 0)
            {
                _failed++;
                Console.WriteLine($"  FAIL  no corpus cases loaded from {root}");
                return;
            }

            Console.WriteLine($"      {cases.Count} case(s) from {root}");
            foreach (CorpusCase c in cases)
            {
                Case($"[{c.File}] {c.Name}", () =>
                {
                    var actual = ConformanceCorpus.RunCase(c);
                    AssertTrue(
                        ConformanceCorpus.SameSolutionSet(actual, c.Expected),
                        $"expected {ConformanceCorpus.Describe(c.Expected)} " +
                        $"but got {ConformanceCorpus.Describe(actual)}");
                });
            }
        }

        // ---- Radiant conformance (US-UC4, native) ---------------------------

        private static void RunRadiantConformance()
        {
            Section("Radiant conformance (packages/core/conformance/radiant)");

            string root = RadiantCorpus.LocateCorpusRoot();
            var cases = RadiantCorpus.Load(root);
            if (cases.Count == 0)
            {
                _failed++;
                Console.WriteLine("  FAIL  no radiant corpus cases loaded " +
                                  "(set INSIMUL_CONFORMANCE_DIR to the conformance root)");
                return;
            }

            Console.WriteLine($"      {cases.Count} case(s) from {root}");
            foreach (RadiantCorpusCase c in cases)
            {
                Case($"[{c.File}] {c.Name}", () =>
                {
                    var produced = RadiantCorpus.Run(c);
                    var (ok, message) = RadiantCorpus.Compare(produced, c);
                    AssertTrue(ok, message ?? "mismatch");
                });
            }
        }

        // ---- Radiant engine (US-UC4, pure — libinsimul-free) ----------------

        private static void RunRadiantPureTests()
        {
            Section("Radiant engine (US-UC4, pure)");

            // A single fetch template with two givers × two herbs. Mirrors the
            // conformance single-slot-fill-multi-candidate case (minus the exclusion,
            // which does not affect the pick) so the seeded pick + serialization are
            // proven byte-identical to the golden output WITHOUT a native library.
            const string program =
                "radiant_template(rt_fetch, [category(fetch), title('Gather Herbs for {giver}'), quest_type(gathering), difficulty(2)]).\n" +
                "radiant_precondition(rt_fetch, giver, character_occupation(Giver, herbalist)).\n" +
                "radiant_precondition(rt_fetch, item, item_category(Item, herb)).\n" +
                "radiant_objective(rt_fetch, collect(Item, 5)).\n" +
                "radiant_objective(rt_fetch, deliver(Item, Giver)).\n" +
                "radiant_reward(rt_fetch, gold, times(20, difficulty)).\n" +
                "radiant_reward(rt_fetch, experience, 25).\n" +
                "radiant_cooldown(rt_fetch, 3600).";

            const string conj = "character_occupation(Giver, herbalist), item_category(Item, herb)";

            StubRadiantSolver Solver() => new StubRadiantSolver()
                .On(conj,
                    "{\"Giver\":\"anne\",\"Item\":\"sage\"}",
                    "{\"Giver\":\"anne\",\"Item\":\"mint\"}",
                    "{\"Giver\":\"bob\",\"Item\":\"sage\"}",
                    "{\"Giver\":\"bob\",\"Item\":\"mint\"}");

            Case("seed 'contract' picks the golden candidate (anne, sage) byte-identically", () =>
            {
                var r = InsimulRadiantEngine.Generate(program, Solver(),
                    new RadiantOptions { Seed = RadiantSeed.Of("contract"), Now = 1000 });
                AssertEqual(1, r.Quests.Count);
                var q = r.Quests[0];
                AssertEqual("radiant_rt_fetch_1000", q.QuestId);
                var content = new HashSet<string>(q.QuestContent.Split('\n'));
                AssertTrue(content.Contains("quest(radiant_rt_fetch_1000, 'Gather Herbs for anne', gathering, 2, available)."),
                    "quest header with anne");
                AssertTrue(content.Contains("quest_objective(radiant_rt_fetch_1000, 0, collect(sage, 5))."), "objective 0");
                AssertTrue(content.Contains("quest_objective(radiant_rt_fetch_1000, 1, deliver(sage, anne))."), "objective 1");
                AssertTrue(content.Contains("quest_reward(radiant_rt_fetch_1000, gold, 40)."), "gold = 20 × difficulty(2)");
                AssertTrue(content.Contains("quest_reward(radiant_rt_fetch_1000, experience, 25)."), "flat experience");
                AssertTrue(q.FactsToAssert.Contains("radiant_generated(radiant_rt_fetch_1000, rt_fetch, 1000)."), "provenance");
                AssertTrue(q.FactsToAssert.Contains("radiant_cooldown_until(rt_fetch, 4600)."), "cooldown");
                AssertEqual(0, q.FactsToRetract.Count);
            });

            Case("alternate seed 'zephyr' selects a different giver (bob) — seed drives the pick", () =>
            {
                var r = InsimulRadiantEngine.Generate(program, Solver(),
                    new RadiantOptions { Seed = RadiantSeed.Of("zephyr"), Now = 1000 });
                AssertEqual(1, r.Quests.Count);
                AssertTrue(r.Quests[0].QuestContent.Contains("'Gather Herbs for bob'"), "seed selects bob");
            });

            Case("exclusion goal that succeeds suppresses the template", () =>
            {
                var solver = Solver().Succeed("radiant_generated(_, rt_fetch, _)");
                string withExcl = program + "\nradiant_exclusion(rt_fetch, radiant_generated(_, rt_fetch, _)).";
                var r = InsimulRadiantEngine.Generate(withExcl, solver,
                    new RadiantOptions { Seed = RadiantSeed.Of("contract"), Now = 1000 });
                AssertEqual(0, r.Quests.Count);
            });

            Case("an active future cooldown suppresses; retract-then-assert once elapsed", () =>
            {
                var solver = Solver().On("radiant_cooldown_until(rt_fetch, T)", "{\"T\":5000}");
                var active = InsimulRadiantEngine.Generate(program, solver,
                    new RadiantOptions { Seed = RadiantSeed.Of("contract"), Now = 1000 });
                AssertEqual(0, active.Quests.Count);

                var elapsed = InsimulRadiantEngine.Generate(program, solver,
                    new RadiantOptions { Seed = RadiantSeed.Of("contract"), Now = 6000 });
                AssertEqual(1, elapsed.Quests.Count);
                AssertTrue(elapsed.Quests[0].FactsToRetract.Contains("radiant_cooldown_until(rt_fetch, 5000)."),
                    "stale cooldown retracted");
                AssertTrue(elapsed.Quests[0].FactsToAssert.Contains("radiant_cooldown_until(rt_fetch, 9600)."),
                    "fresh cooldown asserted (6000 + 3600)");
            });

            Case("RunRadiantTick folds generated quests + facts into the quest system; worldSnapshot untouched", () =>
            {
                const string worldSnapshot =
                    "{\"world\":{\"id\":\"w1\",\"name\":\"W\"},\"settlements\":[],\"characters\":[]}";

                var save = new InsimulSaveSystem();
                save.NewGame(worldSnapshot, new NewGameOptions { Id = "s", WorldId = "w1" });
                string snapHashBefore = ExtractWorldSnapshotIntegrity(save);

                var rt = new InsimulQuestRuntime();
                string generated = null;
                rt.OnRadiantQuestGenerated += id => generated = id;

                var result = rt.RunRadiantTick(program, Solver(),
                    new RadiantOptions { Seed = RadiantSeed.Of("contract"), Now = 1000 });

                AssertEqual(1, result.Quests.Count);
                AssertEqual("radiant_rt_fetch_1000", generated);
                AssertTrue(rt.GetQuest("radiant_rt_fetch_1000") != null, "quest registered in the runtime");

                // The provenance + cooldown facts landed in currentState.prologFacts.
                AssertTrue(rt.Kb.Has("radiant_generated",
                        new[] { PrologArg.Atom("radiant_rt_fetch_1000"), PrologArg.Atom("rt_fetch"), PrologArg.Number(1000) }),
                    "radiant_generated in the KB");
                AssertTrue(rt.Kb.Has("radiant_cooldown_until",
                        new[] { PrologArg.Atom("rt_fetch"), PrologArg.Number(4600) }),
                    "radiant_cooldown_until in the KB");

                // Persist through the save file — worldSnapshot must be byte-stable.
                save.SnapshotFacts(rt.Facts);
                string snapHashAfter = ExtractWorldSnapshotIntegrity(save);
                AssertEqual(snapHashBefore, snapHashAfter);

                // Reload → generated quest survives, facts intact.
                var reloaded = new InsimulSaveSystem();
                reloaded.Load(save.SerializeCanonical());
                var restored = reloaded.RestoreFacts();
                bool provenance = false;
                foreach (var f in restored)
                    if (f.Predicate == "radiant_generated") provenance = true;
                AssertTrue(provenance, "radiant provenance round-trips through the save");
            });
        }

        // ---- Startup orchestrator (US-UC5) ----------------------------------

        private static void RunBootstrapTests()
        {
            Section("Runtime context / bootstrap (US-UC5, pure)");

            // A golden-shaped world: one character + one all-objectives quest.
            const string worldSnapshot =
                "{\"world\":{\"id\":\"w1\",\"name\":\"World\"}," +
                "\"settlements\":[]," +
                "\"characters\":[{\"id\":\"npc_anne\",\"name\":\"Anne\"}]," +
                "\"quests\":[{\"id\":\"q_intro\",\"content\":\"" +
                "quest(q_intro, 'Intro', errand, easy, active).\\n" +
                "quest_objective(q_intro, 0, objective('Say hi')).\\n" +
                "quest_reward(q_intro, experience, 50).\\n" +
                "quest_completion(q_intro, all_objectives_complete).\"}]}";

            NewGameOptions NewOpts() => new NewGameOptions { Id = "s1", WorldId = "w1", Name = "New Game" };

            Case("Boot with no existing save -> new game, world + quests loaded", () =>
            {
                var ctx = new InsimulRuntimeContext();
                var boot = ctx.Boot(null, worldSnapshot, NewOpts());
                AssertTrue(boot.Ok, "boot ok");
                AssertTrue(!boot.ResumedSave, "new game (not resumed)");
                AssertTrue(ctx.IsLoaded, "context loaded");
                AssertEqual(1, ctx.World.Characters.Count);
                AssertEqual(1, ctx.Quests.QuestCount);
                AssertTrue(ctx.Quests.GetQuest("q_intro") != null, "world quest registered");
            });

            Case("Registering world quests fires OnQuestAccepted", () =>
            {
                var ctx = new InsimulRuntimeContext();
                var accepted = new List<string>();
                ctx.Quests.OnQuestAccepted += id => accepted.Add(id);
                AssertTrue(ctx.StartNewGame(worldSnapshot, NewOpts(), out _), "new game ok");
                AssertTrue(accepted.Contains("q_intro"), "OnQuestAccepted fired for the world quest");
            });

            Case("Boot resumes a valid save (ResumedSave = true)", () =>
            {
                // Produce a save from a new game, complete the quest, commit.
                var first = new InsimulRuntimeContext();
                first.StartNewGame(worldSnapshot, NewOpts(), out _);
                first.Quests.AssertFact("objective_satisfied", "q_intro", "obj_0");
                first.EvaluateAllQuests();
                AssertTrue(first.Quests.IsQuestComplete("q_intro"), "quest completed after objective satisfied");
                first.CommitToSave();
                string saveJson = first.SerializeCanonical();

                // A fresh context resumes it.
                var second = new InsimulRuntimeContext();
                var boot = second.Boot(saveJson, worldSnapshot, NewOpts());
                AssertTrue(boot.Ok, "resume ok");
                AssertTrue(boot.ResumedSave, "resumed the save");
                AssertTrue(second.Quests.IsQuestComplete("q_intro"),
                    "completion round-trips through the save (KB-backed)");
            });

            Case("Boot falls back to a new game on a corrupt save (never bricks)", () =>
            {
                var ctx = new InsimulRuntimeContext();
                var boot = ctx.Boot("{not valid json", worldSnapshot, NewOpts());
                AssertTrue(boot.Ok, "boot still ok");
                AssertTrue(!boot.ResumedSave, "fell back to a new game");
                AssertTrue(ctx.IsLoaded, "loaded from the fallback world");
                AssertTrue(!ctx.Quests.IsQuestComplete("q_intro"), "fresh game has an incomplete quest");
            });

            Case("Boot fails cleanly when BOTH the save and the fallback world are bad", () =>
            {
                var ctx = new InsimulRuntimeContext();
                var boot = ctx.Boot("{not valid json", "{\"no\":\"world\"}", NewOpts());
                AssertTrue(!boot.Ok, "boot fails");
                AssertTrue(!ctx.IsLoaded, "not loaded");
                AssertTrue(!string.IsNullOrEmpty(boot.Error), "surfaces an error");
            });

            Case("CommitToSave captures KB state; worldSnapshot hash byte-stable across commit", () =>
            {
                var ctx = new InsimulRuntimeContext();
                ctx.StartNewGame(worldSnapshot, NewOpts(), out _);
                string worldHashBefore = ctx.WorldSnapshotIntegrity();

                ctx.Quests.AssertFact("objective_satisfied", "q_intro", "obj_0");
                ctx.EvaluateAllQuests();
                ctx.CommitToSave();

                string worldHashAfter = ctx.WorldSnapshotIntegrity();
                AssertEqual(worldHashBefore, worldHashAfter);

                // The completion fact persisted into currentState.prologFacts only.
                var reloaded = new InsimulSaveSystem();
                reloaded.Load(ctx.SerializeCanonical());
                bool complete = false;
                foreach (var f in reloaded.RestoreFacts())
                    if (f.Predicate == "quest_complete") complete = true;
                AssertTrue(complete, "quest_complete persisted through the save file");
            });

            Case("EvaluateAllQuests returns a transition per registered quest", () =>
            {
                var ctx = new InsimulRuntimeContext();
                ctx.StartNewGame(worldSnapshot, NewOpts(), out _);
                var transitions = ctx.EvaluateAllQuests();
                AssertEqual(ctx.Quests.QuestCount, transitions.Count);
            });

            Case("Envelope produced by the context validates + verifies integrity", () =>
            {
                var ctx = new InsimulRuntimeContext();
                ctx.StartNewGame(worldSnapshot, NewOpts(), out _);
                ctx.CommitToSave();
                string envelope = ctx.BuildEnvelopeJson("test-version", "1970-01-01T00:00:00.000Z");
                var validation = InsimulSaveSystem.ValidateEnvelope(envelope);
                AssertTrue(validation.Ok, "context envelope validates: " + validation.Message);
            });
        }

        /// <summary>Canonical integrity hash of just the SaveFile.worldSnapshot node.</summary>
        private static string ExtractWorldSnapshotIntegrity(InsimulSaveSystem save)
        {
            var root = save.SaveFile;
            return root.TryGet("worldSnapshot", out var snap)
                ? Insimul.Save.CanonicalJson.Integrity(snap)
                : "<none>";
        }

        // ---- Save system (US-UC2) -------------------------------------------

        private static void RunSaveSystemTests()
        {
            Section("Save system (US-UC2, pure)");

            // Minimal world snapshot for new-game construction.
            const string worldSnapshot =
                "{\"world\":{\"id\":\"w1\",\"name\":\"W\"},\"settlements\":[],\"characters\":[]}";

            Case("NewGame: builds a fresh current-version save with default currentState", () =>
            {
                var sys = new InsimulSaveSystem();
                sys.NewGame(worldSnapshot, new NewGameOptions
                {
                    Id = "save-1",
                    UserId = "u1",
                    WorldId = "w1",
                    Name = "New Game",
                    SlotIndex = 0,
                    CreatedAt = "2026-07-17T00:00:00.000Z",
                });
                AssertTrue(sys.IsLoaded, "should be loaded");
                AssertEqual(InsimulSaveSystem.SaveFileVersion, sys.Version);
                AssertEqual(0, sys.RestoreFacts().Count);
                // worldSnapshot embedded verbatim; currentState present.
                AssertTrue(sys.SaveFile.TryGet("worldSnapshot", out _), "worldSnapshot embedded");
                AssertTrue(sys.SaveFile.TryGet("currentState", out _), "currentState present");
            });

            Case("NewGame: rejects a snapshot missing a world object", () =>
            {
                var sys = new InsimulSaveSystem();
                AssertThrows<SaveLoadException>(() =>
                    sys.NewGame("{\"settlements\":[]}", new NewGameOptions { Id = "x" }));
            });

            Case("Load: rejects a save from a newer build", () =>
            {
                var sys = new InsimulSaveSystem();
                AssertThrows<SaveLoadException>(() =>
                    sys.Load("{\"version\":999,\"worldSnapshot\":{},\"currentState\":{}}"));
            });

            // ── Canonical-JSON + SHA-256 parity vectors (C# side of the anchor) ──
            string vectorsJson = SaveSystemCorpus.ReadIntegrityVectors();
            if (vectorsJson == null)
            {
                Console.WriteLine("  SKIP  integrity vectors not reachable (set INSIMUL_CONFORMANCE_DIR)");
            }
            else
            {
                using var vdoc = JsonDocument.Parse(vectorsJson);
                var vectors = vdoc.RootElement.GetProperty("vectors");
                foreach (var name in new[] { "v1-minimal.json", "v2-typical.json", "v2-with-extensions.json" })
                {
                    string fixture = SaveSystemCorpus.ReadGoldenSave(name);
                    string expected = vectors.TryGetProperty(name, out var ev) ? ev.GetString() : null;
                    Case($"integrity vector: {name} == committed (canonical JSON + SHA-256 parity)", () =>
                    {
                        AssertTrue(fixture != null, $"{name} reachable");
                        AssertTrue(expected != null, $"{name} vector present");
                        // Hash the RAW fixture (vectors are on raw, un-migrated saves).
                        string actual = CanonicalJson.Integrity(JsonVal.Parse(fixture));
                        AssertEqual(expected, actual);
                    });
                }
            }

            // ── Golden Babylon saves LOAD in C# (portability, load side) ──
            foreach (var name in new[] { "v1-minimal.json", "v2-typical.json", "v2-with-extensions.json" })
            {
                string fixture = SaveSystemCorpus.ReadGoldenSave(name);
                if (fixture == null) continue;
                Case($"Load: golden {name} loads + migrates to current version", () =>
                {
                    var sys = new InsimulSaveSystem();
                    sys.Load(fixture);
                    AssertEqual(InsimulSaveSystem.SaveFileVersion, sys.Version);
                    AssertTrue(sys.SaveFile.TryGet("currentState", out _), "currentState present");
                });
            }

            // ── Migration parity: migrated output identical to TS ──
            var migratedVectorsJson = SaveSystemCorpus.ReadSaveFixture("migrated-integrity-vectors.json");
            foreach (var name in new[] { "v1-minimal", "v2-typical" })
            {
                string fixture = SaveSystemCorpus.ReadGoldenSave($"{name}.json");
                string goldenCanonical = SaveSystemCorpus.ReadSaveFixture($"{name}.migrated.canonical.json");
                if (fixture == null || goldenCanonical == null) continue;
                Case($"Migration: {name} lifts to TS-identical canonical output", () =>
                {
                    var sys = new InsimulSaveSystem();
                    sys.Load(fixture);
                    AssertEqual(InsimulSaveSystem.SaveFileVersion, sys.Version);
                    AssertEqual(goldenCanonical, sys.SerializeCanonical());
                    if (migratedVectorsJson != null)
                    {
                        using var mdoc = JsonDocument.Parse(migratedVectorsJson);
                        string mv = mdoc.RootElement.GetProperty("vectors").GetProperty($"{name}.json").GetString();
                        AssertEqual(mv, sys.ComputeIntegrity());
                    }
                });
            }

            // ── prologFacts snapshot / restore round-trip (pure) ──
            Case("SnapshotFacts -> serialize -> Load -> RestoreFacts is identity", () =>
            {
                var facts = new List<PrologFact>
                {
                    new PrologFact("player_cefr_level", new[] { PrologArg.Atom("player"), PrologArg.Atom("A2") }),
                    new PrologFact("gold", new[] { PrologArg.Atom("player"), PrologArg.Number(42) }),
                    new PrologFact("in_settlement", new[] { PrologArg.Atom("player"), PrologArg.Atom("settlement-1") }),
                };
                var a = new InsimulSaveSystem();
                a.NewGame(worldSnapshot, new NewGameOptions { Id = "s", WorldId = "w1" });
                a.SnapshotFacts(facts);
                string json = a.SerializeCanonical();

                var b = new InsimulSaveSystem();
                b.Load(json);
                var restored = b.RestoreFacts();
                AssertEqual(facts.Count, restored.Count);
                for (int i = 0; i < facts.Count; i++)
                    AssertTrue(facts[i].Equals(restored[i]), $"fact {i} round-trips");
            });

            // ── Envelope build / validate / tamper ──
            Case("Envelope: build -> validate ok; integrity hashes saveFile only", () =>
            {
                var sys = new InsimulSaveSystem();
                sys.NewGame(worldSnapshot, new NewGameOptions { Id = "s", WorldId = "w1" });
                // exportedAt/insimulVersion differ but integrity is stable (hashes saveFile only).
                string env1 = sys.BuildEnvelopeJson("1.2.3", "2026-01-01T00:00:00.000Z");
                string env2 = sys.BuildEnvelopeJson("9.9.9", "2027-01-01T00:00:00.000Z");
                var i1 = ExtractIntegrity(env1);
                var i2 = ExtractIntegrity(env2);
                AssertEqual(i1, i2);
                AssertTrue(InsimulSaveSystem.ValidateEnvelope(env1).Ok, "envelope validates");
            });

            Case("Envelope: tampered saveFile -> integrity_mismatch", () =>
            {
                var sys = new InsimulSaveSystem();
                sys.NewGame(worldSnapshot, new NewGameOptions { Id = "s", WorldId = "w1" });
                string env = sys.BuildEnvelopeJson("1.0.0", "2026-01-01T00:00:00.000Z");
                string tampered = env.Replace("\"totalPlaytime\":0", "\"totalPlaytime\":9999");
                AssertTrue(!ReferenceEquals(tampered, env) && tampered != env, "tamper applied");
                var r = InsimulSaveSystem.ValidateEnvelope(tampered);
                AssertTrue(!r.Ok, "tampered envelope rejected");
                AssertEqual("integrity_mismatch", r.Code);
            });

            Case("Envelope: wrong format -> invalid_format", () =>
            {
                var r = InsimulSaveSystem.ValidateEnvelope("{\"format\":\"nope\",\"saveFile\":{},\"integrity\":\"x\"}");
                AssertTrue(!r.Ok, "rejected");
                AssertEqual("invalid_format", r.Code);
            });

            // ── Emit the cross-check envelope for the node portability test ──
            EmitCrossCheckEnvelope();
        }

        // ---- Quest system (US-UC3, pure) ------------------------------------

        private static void RunQuestSystemTests()
        {
            Section("Quest system (US-UC3, pure)");

            // ── Hydration parity vs the golden corpus (the SAME JSON the TS drift
            //    guard + the Unreal host harness read) ──
            string corpus = QuestSystemCorpus.ReadQuestCorpus("hydration-cases.json");
            if (corpus == null)
            {
                Console.WriteLine("  SKIP  quest hydration corpus not reachable (set INSIMUL_CONFORMANCE_DIR)");
            }
            else
            {
                using var doc = JsonDocument.Parse(corpus);
                var cases = doc.RootElement.GetProperty("cases");
                foreach (var c in cases.EnumerateArray())
                {
                    string name = c.GetProperty("name").GetString();
                    var input = c.GetProperty("input");
                    string content = input.TryGetProperty("content", out var cv) ? cv.GetString() : string.Empty;
                    string status = input.TryGetProperty("status", out var sv) ? sv.GetString() : null;
                    // Re-canonicalize the committed `expected` through the SAME serializer
                    // so the comparison is byte-for-byte on the projection contract.
                    string golden = CanonicalJson.Stringify(JsonVal.Parse(c.GetProperty("expected").GetRawText()));
                    Case($"hydration '{name}' matches golden projection (TS parity)", () =>
                    {
                        AssertEqual(golden, InsimulQuestSystem.HydrateCanonical(content, status));
                    });
                }
            }

            // ── Fact-driven completion flips quest state + fires template events ──
            const string errandContent =
                "quest(q_market, 'Market Errand', errand, easy, active).\n" +
                "quest_objective(q_market, 0, talk_to(npc_marie)).\n" +
                "quest_objective(q_market, 1, visit_location('Town Square')).\n" +
                "quest_objective(q_market, 2, deliver(bread, npc_paul)).\n" +
                "quest_reward(q_market, experience, 250).\n" +
                "quest_completion(q_market, all_objectives_complete).";

            Case("Completion: asserting trigger facts flips quest active -> completed", () =>
            {
                var rt = new InsimulQuestRuntime();
                var completedObjs = new List<string>();
                string completedQuest = null;
                rt.OnObjectiveCompleted += (q, o) => completedObjs.Add(o);
                rt.OnQuestCompleted += q => completedQuest = q;

                rt.RegisterQuest(errandContent);
                AssertTrue(!rt.IsQuestComplete("q_market"), "not complete before any facts");

                // Partial: only first objective satisfied.
                rt.AssertFact("talked_to", "player", "npc_marie");
                var t1 = rt.EvaluateQuest("q_market");
                AssertTrue(!t1.Completed, "not complete with one objective");
                AssertEqual(1, completedObjs.Count);

                // Remaining objectives satisfied -> quest completes.
                rt.AssertFact("visited", "player", "Town Square");
                rt.AssertFact("delivered", "player", "npc_paul");
                var t2 = rt.EvaluateQuest("q_market");
                AssertTrue(t2.Completed, "all objectives satisfied -> completed");
                AssertTrue(rt.IsQuestComplete("q_market"), "status flipped to completed");
                AssertEqual("q_market", completedQuest);
                // The fact-asserting transition recorded the completion facts.
                AssertTrue(rt.Kb.Has("quest_complete", new[] { PrologArg.Atom("q_market") }),
                    "quest_complete fact asserted");
                AssertTrue(rt.Kb.Has("quest_objective_complete",
                    new[] { PrologArg.Atom("q_market"), PrologArg.Atom("obj_2") }),
                    "quest_objective_complete asserted for obj_2");
            });

            Case("Completion: re-evaluating a completed quest fires OnQuestCompleted once", () =>
            {
                var rt = new InsimulQuestRuntime();
                int completions = 0;
                rt.OnQuestCompleted += q => completions++;
                rt.RegisterQuest(errandContent);
                rt.AssertFact("talked_to", "player", "npc_marie");
                rt.AssertFact("visited", "player", "Town Square");
                rt.AssertFact("delivered", "player", "npc_paul");
                rt.EvaluateQuest("q_market");
                rt.EvaluateQuest("q_market"); // idempotent — already completed
                AssertEqual(1, completions);
            });

            // ── Rewards are READ FROM PROLOG (quest_reward/3), not a denormalized
            //    default — a quest with no quest_reward exposes no reward ──
            Case("Reward: experience read from Prolog content (quest_reward/3)", () =>
            {
                var rt = new InsimulQuestRuntime();
                rt.RegisterQuest(errandContent);
                AssertEqual(250.0, rt.GetExperienceReward("q_market"));
            });

            Case("Reward: no quest_reward fact => no denormalized default (0)", () =>
            {
                var rt = new InsimulQuestRuntime();
                rt.RegisterQuest(
                    "quest(q_bare, 'Bare', errand, easy, active).\n" +
                    "quest_objective(q_bare, 0, talk_to(npc_x)).");
                AssertTrue(!rt.GetQuest("q_bare").HasExperience, "no experience reward present");
                AssertEqual(0.0, rt.GetExperienceReward("q_bare"));
            });

            // ── Save/load preserves quest state (KB-backed, through the save file) ──
            Case("Persistence: quest state round-trips through the save file (KB-backed)", () =>
            {
                const string worldSnapshot =
                    "{\"world\":{\"id\":\"w1\",\"name\":\"W\"},\"settlements\":[],\"characters\":[]}";

                var rt = new InsimulQuestRuntime();
                rt.RegisterQuest(errandContent);
                rt.AssertFact("talked_to", "player", "npc_marie");
                rt.AssertFact("visited", "player", "Town Square");
                rt.AssertFact("delivered", "player", "npc_paul");
                rt.EvaluateQuest("q_market");
                AssertTrue(rt.IsQuestComplete("q_market"), "completed before save");

                // Persist the KB facts into currentState.prologFacts and serialize.
                var sys = new InsimulSaveSystem();
                sys.NewGame(worldSnapshot, new NewGameOptions { Id = "s", WorldId = "w1" });
                sys.SnapshotFacts(rt.Facts);
                string json = sys.SerializeCanonical();

                // Fresh load -> fresh runtime -> re-register quest (from world content)
                // -> restore KB facts -> quest status re-derives to completed.
                var loaded = new InsimulSaveSystem();
                loaded.Load(json);
                var rt2 = new InsimulQuestRuntime();
                var q2 = rt2.RegisterQuest(errandContent);
                AssertTrue(q2.Status == "active", "freshly registered quest starts active");
                rt2.LoadFacts(loaded.RestoreFacts());
                AssertTrue(rt2.IsQuestComplete("q_market"), "quest state restored to completed");
                AssertTrue(rt2.Kb.Has("quest_objective_complete",
                    new[] { PrologArg.Atom("q_market"), PrologArg.Atom("obj_0") }),
                    "objective-complete facts preserved");
            });
        }

        /// <summary>Read the integrity field out of a canonical envelope JSON.</summary>
        private static string ExtractIntegrity(string envelopeJson)
        {
            using var doc = JsonDocument.Parse(envelopeJson);
            return doc.RootElement.GetProperty("integrity").GetString();
        }

        /// <summary>
        /// Write a C#-produced envelope (from a loaded+migrated golden save) into
        /// tools/verify-unity/cross-check/ so tools/verify-unity/cross-check.mjs can
        /// validate it against the TS contract — THE PORTABILITY TEST.
        /// </summary>
        private static void EmitCrossCheckEnvelope()
        {
            string fixture = SaveSystemCorpus.ReadGoldenSave("v2-typical.json");
            string dir = SaveSystemCorpus.LocateCrossCheckDir();
            if (fixture == null || dir == null)
            {
                Console.WriteLine("  SKIP  cross-check envelope not emitted (corpus/tools dir unreachable)");
                return;
            }
            Case("Cross-check: emit C#-produced envelope for the node portability test", () =>
            {
                var sys = new InsimulSaveSystem();
                sys.Load(fixture);
                string env = sys.BuildEnvelopeJson("unity-host-test", "2026-07-17T00:00:00.000Z");
                // Self-check before writing: the envelope must validate in C#.
                AssertTrue(InsimulSaveSystem.ValidateEnvelope(env).Ok, "produced envelope validates in C#");
                Directory.CreateDirectory(dir);
                File.WriteAllText(Path.Combine(dir, "csharp-produced.envelope.json"), env);
            });
        }

        // ---- Save system KB round-trip (US-UC2, native) ---------------------

        private static void RunSaveKbRoundTripNative()
        {
            Section("Save system KB round-trip (US-UC2, native)");

            const string worldSnapshot =
                "{\"world\":{\"id\":\"w1\",\"name\":\"W\"},\"settlements\":[],\"characters\":[]}";

            Case("new-game -> assert facts -> save -> load -> re-hydrate KB: identical queries", () =>
            {
                var facts = new List<PrologFact>
                {
                    new PrologFact("player_cefr_level", new[] { PrologArg.Atom("player"), PrologArg.Atom("a2") }),
                    new PrologFact("gold", new[] { PrologArg.Atom("player"), PrologArg.Number(42) }),
                    new PrologFact("in_settlement", new[] { PrologArg.Atom("player"), PrologArg.Atom("s1") }),
                };

                // Build the source KB and mirror the facts into the save.
                using var kbA = new InsimulProlog();
                foreach (var f in facts) kbA.Assert(FactToClause(f));

                var sys = new InsimulSaveSystem();
                sys.NewGame(worldSnapshot, new NewGameOptions { Id = "s", WorldId = "w1" });
                sys.SnapshotFacts(facts);
                string json = sys.SerializeCanonical();

                // Load a fresh save and re-hydrate a fresh KB from currentState.prologFacts.
                var loaded = new InsimulSaveSystem();
                loaded.Load(json);
                using var kbB = new InsimulProlog();
                foreach (var f in loaded.RestoreFacts()) kbB.Assert(FactToClause(f));

                // Identical query results across the two KBs.
                AssertEqual(kbA.Holds("player_cefr_level(player, a2)"),
                            kbB.Holds("player_cefr_level(player, a2)"));
                AssertTrue(kbB.Holds("gold(player, 42)"), "gold fact re-hydrated");
                AssertTrue(kbB.Holds("in_settlement(player, s1)"), "settlement fact re-hydrated");
                AssertTrue(!kbB.Holds("gold(player, 43)"), "no phantom facts");
            });
        }

        // ---- Quest system KB round-trip (US-UC3, native) --------------------

        private static void RunQuestKbRoundTripNative()
        {
            Section("Quest system KB round-trip (US-UC3, native)");

            const string questContent =
                "quest(q_native, 'Native Quest', errand, easy, active).\n" +
                "quest_objective(q_native, 0, talk_to(npc_ned)).\n" +
                "quest_objective(q_native, 1, deliver(parcel, npc_ida)).\n" +
                "quest_completion(q_native, all_objectives_complete).";

            Case("complete a quest -> mirror facts into a real KB: completion queryable", () =>
            {
                var rt = new InsimulQuestRuntime();
                rt.RegisterQuest(questContent);
                rt.AssertFact("talked_to", "player", "npc_ned");
                rt.AssertFact("delivered", "player", "npc_ida");
                var t = rt.EvaluateQuest("q_native");
                AssertTrue(t.Completed, "quest completed in the portable core");

                // The asserted transition facts hydrate a real Prolog KB and answer
                // the same completion queries the quest layer reads.
                using var kb = new InsimulProlog();
                foreach (var f in rt.Facts) kb.Assert(FactToClause(f));
                AssertTrue(kb.Holds("quest_complete(q_native)"), "quest_complete queryable in native KB");
                AssertTrue(kb.Holds("quest_objective_complete(q_native, obj_0)"),
                    "objective completion queryable in native KB");
                AssertTrue(!kb.Holds("quest_complete(q_other)"), "no phantom completion");
            });
        }

        /// <summary>Render a <see cref="PrologFact"/> as a clause for InsimulProlog.Assert.</summary>
        private static string FactToClause(PrologFact fact)
        {
            var sb = new System.Text.StringBuilder();
            sb.Append(fact.Predicate).Append('(');
            for (int i = 0; i < fact.Args.Count; i++)
            {
                if (i != 0) sb.Append(", ");
                var arg = fact.Args[i];
                sb.Append(arg.IsNumber
                    ? arg.Num.ToString(System.Globalization.CultureInfo.InvariantCulture)
                    : arg.Str);
            }
            sb.Append(')');
            return sb.ToString();
        }

        // ---- Binding resolver (US-UB1) --------------------------------------

        private static BindingLayer Layer(string name, BindingSourceKind kind, params BindingRule[] rules)
            => new BindingLayer(name, kind, new List<BindingRule>(rules));

        private static void RunBindingResolverTests()
        {
            Case("ArchetypeKey.Matches: exact / wildcard / ancestor", () =>
            {
                const string key = "building.commercial.bakery.medium";
                AssertEqual(true, ArchetypeKey.Matches(key, key));
                AssertEqual(false, ArchetypeKey.Matches("building.commercial.bakery.small", key));
                AssertEqual(true, ArchetypeKey.Matches("building.commercial.*", key));
                AssertEqual(true, ArchetypeKey.Matches("building.commercial.*", "building.commercial"));
                AssertEqual(true, ArchetypeKey.Matches("building", key));           // ancestor
                AssertEqual(false, ArchetypeKey.Matches("building.residential.*", key));
                AssertEqual(false, ArchetypeKey.Matches("building.*", "building.*")); // query can't be wildcard
            });

            Case("ArchetypeKey.Specificity: exact > deep wildcard > shallow wildcard", () =>
            {
                const string key = "building.commercial.bakery.medium";
                int exact = ArchetypeKey.Specificity(key, key);
                int deep = ArchetypeKey.Specificity("building.commercial.bakery.*", key);
                int shallow = ArchetypeKey.Specificity("building.commercial.*", key);
                AssertEqual(true, exact > deep);
                AssertEqual(true, deep > shallow);
                AssertEqual(-1, ArchetypeKey.Specificity("building.residential.*", key));
            });

            Case("Resolver: exact match beats wildcard in the same layer", () =>
            {
                var resolver = new BindingResolver(new[]
                {
                    Layer("project", BindingSourceKind.Project,
                        new BindingRule("building.commercial.*", "wild"),
                        new BindingRule("building.commercial.bakery.medium", "exact")),
                });
                var r = resolver.Resolve("building.commercial.bakery.medium");
                AssertEqual("exact", r.Rule.AssetRef);
            });

            Case("Resolver: descendant binding via an ancestor rule", () =>
            {
                var resolver = new BindingResolver(new[]
                {
                    Layer("project", BindingSourceKind.Project,
                        new BindingRule("npc", "npc-generic")),
                });
                var r = resolver.Resolve("npc.merchant.baker");
                AssertEqual("npc-generic", r.Rule.AssetRef);
            });

            Case("Resolver: fallback chain project > pack > placeholder", () =>
            {
                var placeholderOnly = new BindingResolver(new[]
                {
                    Layer("project", BindingSourceKind.Project),
                    Layer("pack", BindingSourceKind.Pack),
                    Layer("placeholder", BindingSourceKind.Placeholder,
                        new BindingRule("item.*", "ph-item")),
                });
                var r1 = placeholderOnly.Resolve("item.tool.fishing_rod");
                AssertEqual("ph-item", r1.Rule.AssetRef);
                AssertEqual(BindingSourceKind.Placeholder, r1.Source);
                AssertEqual(true, r1.IsPlaceholder);

                // A project rule overrides even a MORE specific placeholder rule.
                var projectWins = new BindingResolver(new[]
                {
                    Layer("project", BindingSourceKind.Project,
                        new BindingRule("item.*", "proj-item")),
                    Layer("placeholder", BindingSourceKind.Placeholder,
                        new BindingRule("item.tool.fishing_rod", "ph-exact")),
                });
                var r2 = projectWins.Resolve("item.tool.fishing_rod");
                AssertEqual("proj-item", r2.Rule.AssetRef);
                AssertEqual(BindingSourceKind.Project, r2.Source);
            });

            Case("Resolver: unbound report lists missing keys, sorted + deduped", () =>
            {
                var resolver = new BindingResolver(new[]
                {
                    Layer("placeholder", BindingSourceKind.Placeholder,
                        new BindingRule("building.*", "ph-building")),
                });
                var report = resolver.CollectUnbound(new[]
                {
                    "building.commercial.bakery",   // bound
                    "npc.merchant.baker",           // unbound
                    "item.food.bread",              // unbound
                    "npc.merchant.baker",           // dup — collapses
                });
                AssertEqual(3, report.RequestedCount);
                AssertEqual(1, report.BoundCount);
                AssertEqual(2, report.MissingCount);
                AssertEqual("item.food.bread", report.MissingKeys[0]);
                AssertEqual("npc.merchant.baker", report.MissingKeys[1]);
                AssertEqual(false, report.AllBound);
            });

            Case("Resolver: unmatched key resolves to null", () =>
            {
                var resolver = new BindingResolver(new[]
                {
                    Layer("project", BindingSourceKind.Project,
                        new BindingRule("building.*", "b")),
                });
                AssertEqual(true, resolver.Resolve("terrain.texture.grass") == null);
            });

            Case("SortRules: ordinal by key, stable for equal keys", () =>
            {
                var rules = new List<BindingRule>
                {
                    new BindingRule("prop.tree", "a"),
                    new BindingRule("building.house", "b"),
                    new BindingRule("building.house", "c"), // equal key, keeps order after b
                    new BindingRule("item.sword", "d"),
                };
                BindingResolver.SortRules(rules);
                AssertEqual("building.house", rules[0].Key);
                AssertEqual("b", rules[0].AssetRef);
                AssertEqual("c", rules[1].AssetRef); // stable
                AssertEqual("item.sword", rules[2].Key);
                AssertEqual("prop.tree", rules[3].Key);
            });

            Case("Empty-AssetRef rule counts as bound (deliberate gap)", () =>
            {
                var resolver = new BindingResolver(new[]
                {
                    Layer("project", BindingSourceKind.Project,
                        new BindingRule("prop.street.market-stall", "")),
                });
                var report = resolver.CollectUnbound(new[] { "prop.street.market-stall" });
                AssertEqual(0, report.MissingCount);
                var r = resolver.Resolve("prop.street.market-stall");
                AssertEqual(false, r.Rule.HasAsset);
            });
        }

        // ---- Placeholder asset pack (US-UB2) --------------------------------

        private static void RunPlaceholderPackTests()
        {
            Case("PlaceholderPack.Specs cover the five base-node wildcards", () =>
            {
                var patterns = new HashSet<string>();
                foreach (var s in PlaceholderPack.Specs) patterns.Add(s.Pattern);
                AssertEqual(true, patterns.Contains("building.*"));
                AssertEqual(true, patterns.Contains("npc.*"));
                AssertEqual(true, patterns.Contains("item.*"));
                AssertEqual(true, patterns.Contains("prop.*"));
                AssertEqual(true, patterns.Contains("terrain.*"));
            });

            Case("PlaceholderPack.Specs are deterministic + ordinally sorted", () =>
            {
                var a = PlaceholderPack.Specs;
                var b = PlaceholderPack.Specs;
                AssertEqual(a.Count, b.Count);
                for (int i = 0; i < a.Count; i++)
                {
                    AssertEqual(a[i].Pattern, b[i].Pattern);
                    AssertEqual(a[i].AssetRef, b[i].AssetRef);
                    if (i > 0)
                        AssertTrue(string.CompareOrdinal(a[i - 1].Pattern, a[i].Pattern) < 0,
                                   "specs must be strictly ordinally sorted (no dup patterns)");
                }
            });

            Case("Placeholder AssetRefs are deterministic placeholder: handles", () =>
            {
                foreach (var s in PlaceholderPack.Specs)
                {
                    AssertTrue(s.AssetRef.StartsWith(PlaceholderPack.AssetPrefix),
                               $"{s.Pattern} -> {s.AssetRef} must be a placeholder: handle");
                    AssertTrue(!s.AssetRef.Contains("*"),
                               $"{s.AssetRef} must strip the wildcard");
                }
                // The base-node handle strips the wildcard.
                var building = FindSpec("building.*");
                AssertEqual("placeholder:building", building.AssetRef);
                var grass = FindSpec("terrain.texture.grass");
                AssertEqual("placeholder:terrain.texture.grass", grass.AssetRef);
            });

            Case("PlaceholderPack.BuildLayer is Placeholder-tier, sorted, every rule bound", () =>
            {
                var layer = PlaceholderPack.BuildLayer();
                AssertEqual(BindingSourceKind.Placeholder, layer.Kind);
                AssertEqual(PlaceholderPack.Name, layer.Name);
                AssertEqual(PlaceholderPack.Specs.Count, layer.Rules.Count);
                for (int i = 1; i < layer.Rules.Count; i++)
                    AssertTrue(string.CompareOrdinal(layer.Rules[i - 1].Key, layer.Rules[i].Key) <= 0,
                               "layer rules must be ordinally sorted");
                foreach (var r in layer.Rules)
                    AssertTrue(r.HasAsset, $"placeholder rule {r.Key} must carry an asset handle");
            });

            Case("Every golden-world archetype resolves against the placeholder pack", () =>
            {
                var keys = PlaceholderPackCorpus.GoldenArchetypeKeys();
                AssertTrue(keys.Count > 0, "golden-world-archetypes.json must load with keys");

                var resolver = new BindingResolver(new[] { PlaceholderPack.BuildLayer() });
                var report = resolver.CollectUnbound(keys);
                if (!report.AllBound)
                    throw new Exception("unbound golden keys: " + string.Join(", ", report.MissingKeys));
                AssertEqual(0, report.MissingCount);
                AssertEqual(report.RequestedCount, report.BoundCount);

                // Each resolves via the Placeholder tier to a placeholder: handle.
                foreach (var key in keys)
                {
                    var r = resolver.Resolve(key);
                    AssertTrue(r != null, $"golden key {key} resolved to null");
                    AssertEqual(BindingSourceKind.Placeholder, r.Source);
                    AssertTrue(r.Rule.HasAsset, $"golden key {key} resolved to an empty asset");
                }
            });

            Case("Placeholder is the fallback: a project rule overrides it", () =>
            {
                var resolver = new BindingResolver(new[]
                {
                    Layer("project", BindingSourceKind.Project,
                        new BindingRule("building.commercial.bakery.medium", "my-bakery")),
                    PlaceholderPack.BuildLayer(),
                });
                var over = resolver.Resolve("building.commercial.bakery.medium");
                AssertEqual("my-bakery", over.Rule.AssetRef);
                AssertEqual(BindingSourceKind.Project, over.Source);
                // An unbound-in-project key still falls through to the placeholder.
                var fell = resolver.Resolve("npc.guard");
                AssertEqual(BindingSourceKind.Placeholder, fell.Source);
            });
        }

        private static PlaceholderSpec FindSpec(string pattern)
        {
            foreach (var s in PlaceholderPack.Specs)
                if (s.Pattern == pattern) return s;
            throw new Exception($"no placeholder spec for pattern {pattern}");
        }

        // ---- Editor-time scene generation (US-UB3) --------------------------

        private static void RunSceneGenTests()
        {
            Case("QuantizeCoord rounds to 0.001 + normalizes signed zero", () =>
            {
                AssertEqual(1.16, SceneGenerator.QuantizeCoord(1.1604));
                AssertEqual(3.142, SceneGenerator.QuantizeCoord(3.14159));
                AssertEqual(0.0, SceneGenerator.QuantizeCoord(-0.0));
                AssertEqual(0.0, SceneGenerator.QuantizeCoord(0.00004));
                AssertEqual(0.0, SceneGenerator.QuantizeCoord(double.NaN));
            });

            Case("ZoneScaleForRole matches the cross-engine table", () =>
            {
                AssertEqual(1.3, SceneGenerator.ZoneScaleForRole("commercial"));
                AssertEqual(1.4, SceneGenerator.ZoneScaleForRole("downtown"));
                AssertEqual(1.2, SceneGenerator.ZoneScaleForRole("industrial"));
                AssertEqual(0.9, SceneGenerator.ZoneScaleForRole("outskirts"));
                AssertEqual(1.0, SceneGenerator.ZoneScaleForRole("residential"));
                AssertEqual(1.0, SceneGenerator.ZoneScaleForRole("who-knows"));
            });

            Case("SampleTerrainHeight: bilinear over the golden heightmap", () =>
            {
                var heights = new List<double> { 0, 0, 0, 0, 4, 0, 0, 0, 0 };
                // Centre of the map = grid centre = the peak value.
                AssertEqual(4.0, SceneGenerator.SampleTerrainHeight(heights, 3, 100, 100, 50, 50));
                // Chunk centre (25,25) = quarter-way = 1.0 (matches the golden manifest).
                AssertEqual(1.0, SceneGenerator.SampleTerrainHeight(heights, 3, 100, 100, 25, 25));
                // Road-main centroid (50,10) samples to 0.8.
                AssertEqual(0.8, Round3(SceneGenerator.SampleTerrainHeight(heights, 3, 100, 100, 50, 10)));
                // Out-of-range clamps to the edge (0 here), no throw.
                AssertEqual(0.0, SceneGenerator.SampleTerrainHeight(heights, 3, 100, 100, -50, -50));
                // Degenerate inputs are safe.
                AssertEqual(0.0, SceneGenerator.SampleTerrainHeight(new List<double>(), 0, 100, 100, 5, 5));
                AssertEqual(7.0, SceneGenerator.SampleTerrainHeight(new List<double> { 7 }, 1, 100, 100, 5, 5));
            });

            Case("ComputePlacement over the golden IR matches the golden manifest", () =>
            {
                var ir = JsonVal.Parse(SceneGenCorpus.ReadGoldenIrJson());
                AssertTrue(ir != null, "golden-ir.json must load");
                var resolver = new BindingResolver(new[] { PlaceholderPack.BuildLayer() });
                var got = SceneGenerator.ComputePlacement(ir, resolver);

                var golden = SceneGenCorpus.ParseManifest(SceneGenCorpus.ReadGoldenManifestJson());
                AssertTrue(golden.Nodes.Count > 0, "golden manifest must load with nodes");
                AssertEqual(golden.Seed, got.Seed);
                AssertEqual(golden.NodeCount, got.NodeCount);

                for (int i = 0; i < golden.Nodes.Count; i++)
                {
                    var e = golden.Nodes[i];
                    var a = got.Nodes[i];
                    AssertEqual(e.EntityId, a.EntityId);
                    AssertEqual(e.Kind, a.Kind);
                    AssertEqual(e.Archetype, a.Archetype);
                    AssertEqual(e.AssetRef, a.AssetRef);
                    AssertEqual(e.BindingSource, a.BindingSource);
                    AssertVec3(e.Position, a.Position, e.EntityId + ".pos");
                    AssertTrue(Math.Abs(e.RotationY - a.RotationY) < 0.001f, e.EntityId + ".rotY");
                    AssertVec3(e.Scale, a.Scale, e.EntityId + ".scale");
                }
            });

            Case("Determinism: same IR + table -> byte-identical serialized manifest", () =>
            {
                var ir = JsonVal.Parse(SceneGenCorpus.ReadGoldenIrJson());
                var resolver = new BindingResolver(new[] { PlaceholderPack.BuildLayer() });
                string a = SceneGenerator.SerializeManifest(SceneGenerator.ComputePlacement(ir, resolver));
                string b = SceneGenerator.SerializeManifest(SceneGenerator.ComputePlacement(ir, resolver));
                AssertEqual(a, b);
                // Nodes are canonically ordered (ordinal by entityId) in the output.
                AssertTrue(a.IndexOf("bld-house", StringComparison.Ordinal) <
                           a.IndexOf("terrain.chunk.0_0", StringComparison.Ordinal),
                           "serialized nodes must be ordinal-sorted by entityId");
            });

            Case("ComputePlacement is order-insensitive to the IR array order", () =>
            {
                // Two IRs, identical content, buildings/props in OPPOSITE order ->
                // byte-identical serialized manifests (canonical EntityId sort).
                var resolver = new BindingResolver(new[] { PlaceholderPack.BuildLayer() });
                string forward = SceneGenerator.SerializeManifest(
                    SceneGenerator.ComputePlacement(BuildTwoEntityIr(false), resolver));
                string reversed = SceneGenerator.SerializeManifest(
                    SceneGenerator.ComputePlacement(BuildTwoEntityIr(true), resolver));
                AssertEqual(forward, reversed);
            });

            Case("ScenePipeline drives the builder in stage order + bakes nav", () =>
            {
                var ir = JsonVal.Parse(SceneGenCorpus.ReadGoldenIrJson());
                var resolver = new BindingResolver(new[] { PlaceholderPack.BuildLayer() });
                var manifest = SceneGenerator.ComputePlacement(ir, resolver);

                var builder = new RecordingSceneBuilder();
                ScenePipeline.Build(manifest, builder);

                AssertEqual("golden-seed-1", builder.Seed);
                AssertEqual("begin", builder.Calls[0]);
                AssertTrue(builder.NavBaked, "nav must be baked");
                AssertEqual("bake_nav", builder.Calls[builder.Calls.Count - 2]);
                AssertEqual("end", builder.Calls[builder.Calls.Count - 1]);
                AssertTrue(builder.Ended, "world must be ended (scene saved)");

                // Every non-terminal call is a placed node, in the manifest's order.
                AssertEqual(manifest.NodeCount, builder.Placed.Count);
                for (int i = 0; i < manifest.NodeCount; i++)
                    AssertEqual(manifest.Nodes[i].EntityId, builder.Placed[i].EntityId);

                // The bake stage runs AFTER every node is placed.
                int lastPlace = builder.Calls.FindLastIndex(c => c.Contains(":"));
                int bakeIdx = builder.Calls.IndexOf("bake_nav");
                AssertTrue(bakeIdx > lastPlace, "nav bake must run after all placements");
            });

            Case("Interior is a separate node at origin with no binding", () =>
            {
                var ir = JsonVal.Parse(SceneGenCorpus.ReadGoldenIrJson());
                var resolver = new BindingResolver(new[] { PlaceholderPack.BuildLayer() });
                var manifest = SceneGenerator.ComputePlacement(ir, resolver);
                var interior = manifest.Nodes.Find(n => n.EntityId == "bld-townhall.interior");
                AssertTrue(interior != null, "townhall interior must exist");
                AssertEqual("interior", interior.Kind);
                AssertEqual("", interior.Archetype);
                AssertEqual("", interior.AssetRef);
                AssertVec3(BindingVec3.Zero, interior.Position, "interior at origin");
            });
        }

        private static void RunReimportDiffTests()
        {
            Case("Re-import diff over the shared fixtures matches the golden report", () =>
            {
                var oldNodes = ReimportCorpus.ReadOldNodes();
                var newNodes = ReimportCorpus.ReadNewNodes();
                AssertTrue(oldNodes.Count == 5, "old manifest must load 5 nodes");
                AssertTrue(newNodes.Count == 4, "new manifest must load 4 nodes");

                var report = ReimportDiff.Compute(oldNodes, newNodes);
                string got = ReimportDiff.SerializeReport(report);
                string golden = ReimportCorpus.ReadGoldenReportJson();
                AssertTrue(golden != null, "golden-diff-report.json must load");
                AssertEqual(golden.Trim(), got);
            });

            Case("Every diff action is exercised + counts are correct", () =>
            {
                var report = ReimportDiff.Compute(ReimportCorpus.ReadOldNodes(), ReimportCorpus.ReadNewNodes());
                // added: prop.c (new, generated, absent from old)
                AssertEqual(1, report.Added.Count);
                AssertEqual("prop.c", report.Added[0]);
                // updated: building.b (both, generated, position moved)
                AssertEqual(1, report.Updated.Count);
                AssertEqual("building.b", report.Updated[0]);
                // unchanged: building.a (both, generated, equivalent)
                AssertEqual(1, report.Unchanged.Count);
                AssertEqual("building.a", report.Unchanged[0]);
                // skipped: prop.d (hand edit still in new) + prop.f (hand edit gone from new)
                AssertEqual(2, report.Skipped.Count);
                AssertEqual("prop.d", report.Skipped[0]);
                AssertEqual("prop.f", report.Skipped[1]);
                // deprecated: prop.e (generated, dropped from new)
                AssertEqual(1, report.Deprecated.Count);
                AssertEqual("prop.e", report.Deprecated[0]);
            });

            Case("Hand edit is NEVER updated or deprecated — always skipped", () =>
            {
                // prop.d is generated=false in OLD but the NEW manifest lists it as a
                // fresh generated node at a different transform. Policy: skip it.
                var report = ReimportDiff.Compute(ReimportCorpus.ReadOldNodes(), ReimportCorpus.ReadNewNodes());
                AssertTrue(report.Skipped.Contains("prop.d"), "hand edit present-in-new must be skipped");
                AssertTrue(!report.Updated.Contains("prop.d"), "hand edit must never be updated");
                AssertTrue(!report.Deprecated.Contains("prop.d"), "hand edit must never be deprecated");
                // prop.f is a hand edit absent from NEW — kept as-is (skipped), not deprecated.
                AssertTrue(report.Skipped.Contains("prop.f"), "hand edit absent-from-new must be skipped");
                AssertTrue(!report.Deprecated.Contains("prop.f"), "hand edit must never be deprecated");
            });

            Case("A no-op re-import (new == old) classifies everything unchanged/skipped", () =>
            {
                var oldNodes = ReimportCorpus.ReadOldNodes();
                var report = ReimportDiff.Compute(oldNodes, oldNodes);
                AssertEqual(0, report.Added.Count);
                AssertEqual(0, report.Updated.Count);
                AssertEqual(0, report.Deprecated.Count);
                // The 3 generated nodes -> unchanged; the 2 hand edits -> skipped.
                AssertEqual(3, report.Unchanged.Count);
                AssertEqual(2, report.Skipped.Count);
            });

            Case("Diff is deterministic (byte-identical over two runs)", () =>
            {
                var oldNodes = ReimportCorpus.ReadOldNodes();
                var newNodes = ReimportCorpus.ReadNewNodes();
                string a = ReimportDiff.SerializeReport(ReimportDiff.Compute(oldNodes, newNodes));
                string b = ReimportDiff.SerializeReport(ReimportDiff.Compute(oldNodes, newNodes));
                AssertEqual(a, b);
            });

            Case("ReimportReconciler drives the mutator: updates+adds+deprecates, hand edits untouched", () =>
            {
                var oldNodes = ReimportCorpus.ReadOldNodes();
                var newNodes = ReimportCorpus.ReadNewNodes();
                var mutator = new RecordingReimportMutator();
                var report = ReimportReconciler.Apply(oldNodes, newNodes, mutator);

                AssertEqual(1, mutator.Updated.Count);
                AssertEqual("building.b", mutator.Updated[0]);
                AssertEqual(1, mutator.Added.Count);
                AssertEqual("prop.c", mutator.Added[0]);
                AssertEqual(1, mutator.Deprecated.Count);
                AssertEqual("prop.e", mutator.Deprecated[0]);
                // Hand edits + unchanged nodes are never handed to the mutator.
                AssertTrue(!mutator.Calls.Exists(c => c.EndsWith(":prop.d")), "hand edit prop.d untouched");
                AssertTrue(!mutator.Calls.Exists(c => c.EndsWith(":prop.f")), "hand edit prop.f untouched");
                AssertTrue(!mutator.Calls.Exists(c => c.EndsWith(":building.a")), "unchanged building.a untouched");
                // The report returned is the same one that drove the mutator.
                AssertEqual(1, report.Updated.Count);
            });

            Case("Reconciler with a null mutator is a pure dry run (report only)", () =>
            {
                var report = ReimportReconciler.Apply(ReimportCorpus.ReadOldNodes(), ReimportCorpus.ReadNewNodes(), null);
                AssertEqual("prop.c", report.Added[0]);
                AssertEqual("building.b", report.Updated[0]);
                AssertEqual("prop.e", report.Deprecated[0]);
            });
        }

        // ---- Binding Editor window logic (US-UB5) ---------------------------

        private static void RunBindingEditorTests()
        {
            // A resolver: a project layer (building.* + npc.merchant.baker) layered
            // over the placeholder pack, so the three statuses are all reachable.
            BindingResolver EditorResolver() => new BindingResolver(new[]
            {
                Layer("project", BindingSourceKind.Project,
                    new BindingRule("building.*", "Assets/MyBuilding.prefab"),
                    new BindingRule("npc.merchant.baker", "Assets/Baker.prefab")),
                PlaceholderPack.BuildLayer(),
            });

            Case("SuggestBindings scores by segment matches, sorts score desc then path asc", () =>
            {
                var model = new BindingEditorModel(EditorResolver());
                var assets = new List<AssetCandidate>
                {
                    new AssetCandidate("Assets/Props/Bakery_Commercial.prefab", "Bakery_Commercial",
                        new List<string> { "building" }),          // building + commercial + bakery = 3
                    new AssetCandidate("Assets/Props/Bakery.prefab", "Bakery", null),   // bakery = 1
                    new AssetCandidate("Assets/Props/Shop_Commercial.prefab", "Shop", // commercial = 1
                        new List<string> { "commercial" }),
                    new AssetCandidate("Assets/Props/Tree.prefab", "Tree", null),       // 0 -> excluded
                };
                var hits = model.SuggestBindings("building.commercial.bakery", assets);
                AssertEqual(3, hits.Count); // Tree excluded (score 0)
                AssertEqual("Assets/Props/Bakery_Commercial.prefab", hits[0].Path);
                AssertEqual(3, hits[0].Score);
                // The two score-1 hits break the tie by path ascending.
                AssertEqual("Assets/Props/Bakery.prefab", hits[1].Path);
                AssertEqual("Assets/Props/Shop_Commercial.prefab", hits[2].Path);
            });

            Case("SuggestBindings on empty archetype / null assets is empty", () =>
            {
                var model = new BindingEditorModel(EditorResolver());
                AssertEqual(0, model.SuggestBindings("", new List<AssetCandidate>()).Count);
                AssertEqual(0, model.SuggestBindings("building.house", null).Count);
            });

            Case("StatusFor distinguishes real / placeholder / unbound", () =>
            {
                var model = new BindingEditorModel(EditorResolver());
                // building.* is a real project rule.
                AssertEqual(BindingStatus.Bound, model.StatusFor("building.commercial.bakery.medium"));
                AssertEqual(BindingStatus.Bound, model.StatusFor("npc.merchant.baker"));
                // npc.guard has no project rule -> falls to the placeholder npc.* tier.
                AssertEqual(BindingStatus.Placeholder, model.StatusFor("npc.guard"));
                AssertEqual(BindingStatus.Placeholder, model.StatusFor("item.sword"));
            });

            Case("Bound/unbound partition is deterministic + sorted (no placeholder tier)", () =>
            {
                // Project-only resolver so some keys are genuinely unbound.
                var model = new BindingEditorModel(new BindingResolver(new[]
                {
                    Layer("project", BindingSourceKind.Project,
                        new BindingRule("building.*", "Assets/MyBuilding.prefab")),
                }));
                var keys = new[] { "npc.b", "building.a", "item.c", "building.a" }; // dup building.a
                var bound = model.BoundKeys(keys);
                var unbound = model.UnboundKeys(keys);
                AssertEqual(1, bound.Count);
                AssertEqual("building.a", bound[0]);
                AssertEqual(2, unbound.Count);
                AssertEqual("item.c", unbound[0]); // sorted ordinal: item < npc
                AssertEqual("npc.b", unbound[1]);
            });

            Case("BuildTaxonomyTree groups by taxonomy + annotates leaf status", () =>
            {
                var model = new BindingEditorModel(EditorResolver());
                var tree = model.BuildTaxonomyTree(new[]
                {
                    "building.commercial.bakery",
                    "building.residential.house",
                    "npc.guard",
                });
                // Two roots, ordinal order.
                var rootSegs = new List<string>(tree.Children.Keys);
                AssertEqual(2, rootSegs.Count);
                AssertEqual("building", rootSegs[0]);
                AssertEqual("npc", rootSegs[1]);
                // building is an intermediate node (not itself a used archetype).
                var building = tree.Children["building"];
                AssertTrue(!building.IsArchetype, "building is intermediate");
                AssertEqual(2, building.Children.Count); // commercial + residential
                // The bakery leaf is a used archetype, bound via the real project rule.
                var bakery = building.Children["commercial"].Children["bakery"];
                AssertTrue(bakery.IsArchetype, "bakery leaf is a used archetype");
                AssertEqual(BindingStatus.Bound, bakery.Status);
                AssertEqual("building.commercial.bakery", bakery.Path);
                // npc.guard falls to the placeholder tier.
                var guard = tree.Children["npc"].Children["guard"];
                AssertEqual(BindingStatus.Placeholder, guard.Status);
                AssertTrue(guard.IsPlaceholder, "npc.guard is a placeholder binding");
            });

            Case("Binding pack round-trips: export -> import -> export is identity", () =>
            {
                var layer = BindingEditorCorpus.BuildGoldenLayer();
                string exported = BindingPack.Export(layer);
                var reimported = BindingPack.Import(exported);
                string reexported = BindingPack.Export(reimported);
                AssertEqual(exported, reexported);

                // The imported table is field-for-field identical (name, kind, rules).
                AssertEqual(layer.Name, reimported.Name);
                AssertEqual(layer.Kind, reimported.Kind);
                AssertEqual(2, reimported.Rules.Count);
                // Rules come back key-sorted; verify the bakery rule survived intact.
                BindingRule bakery = null;
                foreach (var r in reimported.Rules)
                    if (r.Key == "building.commercial.bakery.medium") bakery = r;
                AssertTrue(bakery != null, "bakery rule survives the round-trip");
                AssertEqual("Assets/Bakery.prefab", bakery.AssetRef);
                AssertEqual(FootprintAlignment.Center, bakery.FootprintAlign);
                AssertVec3(new BindingVec3(1.5f, 1f, 1.5f), bakery.Scale, "bakery.scale");
                AssertEqual(2, bakery.Tags.Count);
                AssertEqual("oven", bakery.Tags[0]);
                // The baker rule's socket + pivot survive.
                BindingRule baker = null;
                foreach (var r in reimported.Rules)
                    if (r.Key == "npc.merchant.baker") baker = r;
                AssertTrue(baker != null, "baker rule survives the round-trip");
                AssertVec3(new BindingVec3(0f, 0.5f, 0f), baker.PivotOffset, "baker.pivot");
                AssertEqual(1, baker.Sockets.Count);
                AssertEqual("hat", baker.Sockets[0].Name);
                AssertVec3(new BindingVec3(0f, 2f, 0f), baker.Sockets[0].LocalPosition, "hat.pos");
            });

            Case("Exported pack is byte-identical to the canonical golden", () =>
            {
                string golden = BindingEditorCorpus.ReadGoldenPackJson();
                AssertTrue(golden != null, "golden-pack.json must load");
                var layer = BindingEditorCorpus.BuildGoldenLayer();
                AssertEqual(golden.Trim(), BindingPack.Export(layer));
                // ...and importing the golden then re-exporting reproduces it.
                AssertEqual(golden.Trim(), BindingPack.Export(BindingPack.Import(golden)));
            });

            Case("Importing malformed / empty pack JSON yields an empty layer (never throws)", () =>
            {
                AssertEqual(0, BindingPack.Import(null).Rules.Count);
                AssertEqual(0, BindingPack.Import("").Rules.Count);
                AssertEqual(0, BindingPack.Import("}{ not json").Rules.Count);
            });
        }

        // ---- Default UI (US-UU1) --------------------------------------------

        private static void RunUiRegistryTests()
        {
            Section("Default UI — panel registry (US-UU1)");

            Case("Shipped default map resolves every corpus panel key", () =>
            {
                var keys = UiCorpus.LoadPanelKeys();
                AssertTrue(keys.Count > 0, "registry-cases.json → panel_keys must load");
                var registry = new InsimulUIRegistry();
                foreach (string key in keys)
                    AssertTrue(registry.Has(key), $"default map missing panel '{key}'");
            });

            var cases = UiCorpus.LoadRegistryCases();
            AssertTrue(cases.Count > 0, "registry-cases.json must load");
            foreach (RegistryCase c in cases)
            {
                Case($"registry: {c.Name}", () =>
                {
                    var registry = new InsimulUIRegistry(c.Defaults);
                    registry.ApplyOverrides(c.Overrides);
                    string scene = registry.SceneRef(c.Resolve);
                    AssertEqual(c.ExpectedScene, scene);
                    AssertEqual(c.ExpectedOverridden, registry.IsOverridden(c.Resolve));
                    // A missing key must record a diagnostic; a resolved key must not.
                    AssertEqual(c.ExpectedMissing, registry.HasDiagnostics());
                    if (c.ExpectedMissing)
                    {
                        var diags = registry.Diagnostics();
                        AssertEqual("missing_panel", diags[diags.Count - 1].Kind);
                        AssertEqual(c.Resolve, diags[diags.Count - 1].Key);
                    }
                });
            }
        }

        private static void RunLoadingScreenTests()
        {
            Section("Default UI — loading screen view-model (US-UU1)");

            var phases = UiCorpus.LoadPhases();
            var tips = UiCorpus.LoadTips();
            AssertTrue(phases.Count > 0, "loading-phases.json → phases must load");

            Case("Shipped default phase table matches the corpus", () =>
            {
                AssertEqual(phases.Count, InsimulLoadingScreenModel.DefaultPhases.Count);
                for (int i = 0; i < phases.Count; i++)
                {
                    AssertEqual(phases[i].Key, InsimulLoadingScreenModel.DefaultPhases[i].Key);
                    AssertEqual(phases[i].Label, InsimulLoadingScreenModel.DefaultPhases[i].Label);
                    AssertEqual(phases[i].Weight, InsimulLoadingScreenModel.DefaultPhases[i].Weight);
                }
                AssertEqual(tips.Count, InsimulLoadingScreenModel.DefaultTips.Count);
                for (int i = 0; i < tips.Count; i++)
                    AssertEqual(tips[i], InsimulLoadingScreenModel.DefaultTips[i]);
            });

            var cases = UiCorpus.LoadLoadingCases();
            AssertTrue(cases.Count > 0, "loading-phases.json → cases must load");
            foreach (LoadingCase c in cases)
            {
                Case($"loading: {c.Name}", () =>
                {
                    var model = new InsimulLoadingScreenModel(phases, tips);
                    foreach (LoadingStep s in c.Steps)
                    {
                        model.Advance(s.Advance);
                        AssertTrue(Math.Abs(model.Progress() - s.ExpectedProgress) < 0.0001f,
                            $"phase '{s.Advance}': progress expected {s.ExpectedProgress}, got {model.Progress()}");
                        AssertEqual(s.ExpectedLabel, model.Label());
                        AssertEqual(s.ExpectedComplete, model.IsComplete());
                    }
                });
            }

            Case("Deterministic per-phase tip wraps the tip pool", () =>
            {
                var model = new InsimulLoadingScreenModel(phases, tips);
                model.Advance("init");
                AssertEqual(tips[0], model.Tip());
                model.Advance("systems"); // index 4 -> 4 % tips.Count
                AssertEqual(tips[4 % tips.Count], model.Tip());
            });
        }

        private static void RunNotificationTests()
        {
            Section("Default UI — notification queue (US-UU1)");

            Case("Push assigns ids and maps kind -> token color", () =>
            {
                var n = new InsimulNotifications();
                int id1 = n.Push("hello");
                int id2 = n.Push("done", NotificationKind.Success);
                AssertEqual(2, n.Count);
                AssertTrue(id2 != id1, "ids are unique");
                var vis = n.Visible();
                AssertEqual("accent", vis[0].Color);   // Info -> accent
                AssertEqual("success", vis[1].Color);
                AssertEqual("warning", KindColorOf(NotificationKind.Warning));
                AssertEqual("danger", KindColorOf(NotificationKind.Danger));
            });

            Case("Tick ages notifications out; returns true only when the set changes", () =>
            {
                var n = new InsimulNotifications();
                n.Push("a", NotificationKind.Info, 4f);
                n.Push("b", NotificationKind.Info, 2f);
                AssertTrue(!n.Tick(1f), "nothing expired yet");
                AssertEqual(2, n.Count);
                AssertTrue(n.Tick(1.5f), "b (2s) expired at t=2.5");
                AssertEqual(1, n.Count);
                AssertEqual("a", n.Visible()[0].Text);
            });

            Case("Dismiss removes early; unknown id is a no-op", () =>
            {
                var n = new InsimulNotifications();
                int id = n.Push("x");
                AssertTrue(n.Dismiss(id), "known id removed");
                AssertEqual(0, n.Count);
                AssertTrue(!n.Dismiss(9999), "unknown id is a no-op");
            });
        }

        private static string KindColorOf(NotificationKind kind) =>
            InsimulNotifications.KindColor[kind];

        private static void RunThemeTokenTests()
        {
            Section("Default UI — theme-token parity (US-UU1)");

            Case("Color tokens match theme-tokens.json exactly", () =>
            {
                var colors = UiCorpus.LoadThemeColors();
                AssertTrue(colors.Count > 0, "theme-tokens.json → colors must load");
                AssertEqual(colors.Count, InsimulUITheme.Colors.Count);
                foreach (var kv in colors)
                {
                    AssertTrue(InsimulUITheme.Colors.TryGetValue(kv.Key, out string mine),
                        $"missing color token '{kv.Key}'");
                    AssertEqual(kv.Value, mine);
                }
            });

            Case("Numeric tokens (spacing/radius/font_size) match theme-tokens.json", () =>
            {
                AssertNumericTokens(UiCorpus.LoadThemeInts("spacing"), InsimulUITheme.Spacing, "spacing");
                AssertNumericTokens(UiCorpus.LoadThemeInts("radius"), InsimulUITheme.Radius, "radius");
                AssertNumericTokens(UiCorpus.LoadThemeInts("font_size"), InsimulUITheme.FontSize, "font_size");
            });

            Case("Hex parser yields the expected RGBA (incl. alpha)", () =>
            {
                ThemeColor accent = InsimulUITheme.Color("accent"); // #5b8cff
                AssertEqual((byte)0x5b, accent.R);
                AssertEqual((byte)0x8c, accent.G);
                AssertEqual((byte)0xff, accent.B);
                AssertEqual((byte)0xff, accent.A);
                ThemeColor overlay = InsimulUITheme.Color("overlay"); // #0a0b10cc
                AssertEqual((byte)0xcc, overlay.A);
                AssertThrows<FormatException>(() => InsimulUITheme.ParseHex("#12"));
            });
        }

        private static void AssertNumericTokens(
            IReadOnlyDictionary<string, int> expected,
            IReadOnlyDictionary<string, int> actual,
            string group)
        {
            AssertTrue(expected.Count > 0, $"theme-tokens.json → {group} must load");
            AssertEqual(expected.Count, actual.Count);
            foreach (var kv in expected)
            {
                AssertTrue(actual.TryGetValue(kv.Key, out int mine), $"missing {group} token '{kv.Key}'");
                AssertEqual(kv.Value, mine);
            }
        }

        private static void RunQuestJournalTests()
        {
            Section("Default UI — quest journal / tracker / offer view-model (US-UU2)");

            var cases = UiCorpus.LoadQuestJournalCases();
            AssertTrue(cases.Count > 0, "quest-journal-cases.json must load");
            foreach (QuestJournalCase c in cases)
            {
                Case($"quest-journal: {c.Name}", () =>
                {
                    var model = new InsimulQuestJournalModel(c.MaxTracked);
                    var seeds = new List<QuestEntry>();
                    foreach (QuestSeed s in c.Quests) seeds.Add(ToEntry(s));
                    model.SetQuests(seeds);

                    foreach (QuestStep step in c.Steps)
                    {
                        bool ok = ApplyQuestStep(model, step);
                        if (step.HasExpectedOk)
                            AssertEqual(step.ExpectedOk, ok);
                        if (step.ExpectedFilteredIds != null)
                            AssertSequence(step.ExpectedFilteredIds, model.FilteredIds(),
                                $"{c.Name}/{step.Op}: filtered ids");
                        if (step.ExpectedTrackedIds != null)
                            AssertSequence(step.ExpectedTrackedIds, model.TrackedIds(),
                                $"{c.Name}/{step.Op}: tracked ids");
                    }

                    var counts = model.Counts();
                    AssertEqual(c.ExpectedCounts["all"], counts.All);
                    AssertEqual(c.ExpectedCounts["active"], counts.Active);
                    AssertEqual(c.ExpectedCounts["completed"], counts.Completed);
                    AssertEqual(c.ExpectedCounts["available"], counts.Available);
                });
            }
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
                default: throw new Exception($"unknown quest step op '{step.Op}'");
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

        private static void AssertSequence(IReadOnlyList<string> expected, IReadOnlyList<string> actual, string what)
        {
            AssertEqual(expected.Count, actual.Count);
            for (int i = 0; i < expected.Count; i++)
                AssertTrue(expected[i] == actual[i], $"{what}: [{i}] expected '{expected[i]}', got '{actual[i]}'");
        }

        private static void RunQuestFeedTests()
        {
            Section("Default UI — quest feed: runtime-event subscription (US-UU2)");

            Case("Tracker updates on quest-system events without polling (accept/complete)", () =>
            {
                var runtime = new InsimulQuestRuntime();
                var feed = new InsimulQuestFeed();
                int repaints = 0;
                feed.Changed += () => repaints++;
                feed.Attach(runtime);

                // OnQuestAccepted fires from RegisterQuest — the feed folds it in with NO
                // poll (nothing reads the model on a frame; only the event drives it).
                runtime.RegisterQuest(
                    "quest(q_fetch, 'Fetch the Herbs', errand, easy, active).\n" +
                    "quest_objective(q_fetch, 0, talk_to(npc_marie, 1)).\n" +
                    "quest_objective(q_fetch, 1, visit_location(market)).\n" +
                    "quest_completion(q_fetch, all_objectives_complete).");
                AssertTrue(repaints >= 1, "OnQuestAccepted repainted the model");
                AssertEqual("active", feed.Model.Get("q_fetch").Status);
                AssertEqual(2, feed.Model.Get("q_fetch").Objectives.Count);

                // Track it for the HUD, then complete via the KB — the feed auto-untracks.
                AssertTrue(feed.Model.Track("q_fetch"), "active quest is trackable");
                AssertSequence(new[] { "q_fetch" }, feed.Model.TrackedIds(), "tracked before complete");

                // Objective ticks arrive as OnObjectiveCompleted signals.
                runtime.AssertFact("talked_to", "player", "npc_marie");
                runtime.EvaluateQuest("q_fetch");
                var (done1, total1) = feed.Model.ObjectiveProgress("q_fetch");
                AssertEqual(1, done1);
                AssertEqual(2, total1);

                runtime.AssertFact("visited", "player", "market");
                runtime.EvaluateQuest("q_fetch"); // 2nd objective + all-objectives completion
                var (done2, total2) = feed.Model.ObjectiveProgress("q_fetch");
                AssertEqual(2, done2);
                AssertEqual(2, total2);
                AssertEqual("completed", feed.Model.Get("q_fetch").Status);
                AssertSequence(Array.Empty<string>(), feed.Model.TrackedIds(), "auto-untracked on completion");

                // Detach stops the subscription (no leak / no further repaints).
                int before = repaints;
                feed.Detach();
                runtime.RegisterQuest("quest(q_other, 'Other', errand, easy, active).");
                AssertEqual(before, repaints);
                AssertTrue(feed.Model.Get("q_other") == null, "detached feed ignores new events");
            });

            Case("Radiant arrival appears as an available, radiant-flagged quest", () =>
            {
                var runtime = new InsimulQuestRuntime();
                var feed = new InsimulQuestFeed();
                feed.Attach(runtime);

                const string program =
                    "radiant_template(rt_fetch, [category(fetch), title('Gather Herbs for {giver}'), quest_type(gathering), difficulty(2)]).\n" +
                    "radiant_precondition(rt_fetch, giver, character_occupation(Giver, herbalist)).\n" +
                    "radiant_precondition(rt_fetch, item, item_category(Item, herb)).\n" +
                    "radiant_objective(rt_fetch, collect(Item, 5)).\n" +
                    "radiant_reward(rt_fetch, experience, 25).\n" +
                    "radiant_cooldown(rt_fetch, 3600).";
                const string conj = "character_occupation(Giver, herbalist), item_category(Item, herb)";
                var solver = new StubRadiantSolver().On(conj, "{\"Giver\":\"anne\",\"Item\":\"sage\"}");

                runtime.RunRadiantTick(program, solver,
                    new RadiantOptions { Seed = RadiantSeed.Of("contract"), Now = 1000 });

                var r = feed.Model.Get("radiant_rt_fetch_1000");
                AssertTrue(r != null, "radiant quest folded into the model");
                AssertEqual("available", r.Status);
                AssertTrue(r.IsRadiant, "flagged as a radiant arrival");
                feed.Model.SetFilter("available");
                AssertSequence(new[] { "radiant_rt_fetch_1000" }, feed.Model.FilteredIds(), "shows under Available");
            });
        }

        private static void RunTradeTests()
        {
            Section("Default UI — trade view-model: inventory / container / merchant (US-UU3)");

            var cases = UiCorpus.LoadTradeCases();
            AssertTrue(cases.Count > 0, "trade-cases.json must load");
            foreach (TradeCase c in cases)
            {
                Case($"trade: {c.Name}", () =>
                {
                    JsonVal state = JsonVal.Parse(c.StateJson);
                    var model = new InsimulTradeModel(state);

                    TradeResult r = ApplyTradeOp(model, c);
                    AssertEqual(c.ExpectedOk, r.Ok);
                    if (!string.IsNullOrEmpty(c.ExpectedReason))
                        AssertEqual(c.ExpectedReason, r.Reason);
                    if (c.HasExpectedMoved)
                        AssertEqual(c.ExpectedMoved, r.Moved);
                    if (c.HasExpectedPlayerGold)
                        AssertEqual(c.ExpectedPlayerGold, model.PlayerGold());
                    if (c.HasExpectedMerchantGold)
                        AssertEqual(c.ExpectedMerchantGold, model.MerchantGold(c.OpMerchant));
                    if (c.ExpectedPlayerItems != null)
                        AssertItemQuantities(c.ExpectedPlayerItems, model.PlayerItems(), $"{c.Name}: player items");
                    if (c.ExpectedContainerItems != null)
                        AssertItemQuantities(c.ExpectedContainerItems, model.ContainerItems(c.OpContainer), $"{c.Name}: container items");
                    if (c.ExpectedMerchantItems != null)
                        AssertItemQuantities(c.ExpectedMerchantItems, model.MerchantItems(c.OpMerchant), $"{c.Name}: merchant items");
                });
            }

            Case("Stack splitting: a partial take clamps and leaves the remainder in the container", () =>
            {
                JsonVal state = JsonVal.Parse(
                    "{\"player\":{\"gold\":0,\"inventory\":[]}," +
                    "\"containers\":{\"containers\":{\"chest\":{\"items\":[{\"itemId\":\"arrow\",\"quantity\":20,\"value\":1}]}}}," +
                    "\"npcs\":{\"merchantStates\":{}}}");
                var model = new InsimulTradeModel(state);
                AssertEqual(7, model.TakeFromContainer("chest", "arrow", 7).Moved);
                AssertEqual(7, model.PlayerQuantity("arrow"));
                AssertItemQuantities(new Dictionary<string, int> { { "arrow", 13 } }, model.ContainerItems("chest"), "split: container remainder");
                // Taking the rest empties the container stack.
                AssertEqual(13, model.TakeFromContainer("chest", "arrow", 0).Moved);
                AssertEqual(20, model.PlayerQuantity("arrow"));
                AssertItemQuantities(new Dictionary<string, int>(), model.ContainerItems("chest"), "split: container drained");
            });

            Case("Gold bounds + conservation: buy then sell conserves player+merchant gold", () =>
            {
                JsonVal state = JsonVal.Parse(
                    "{\"player\":{\"gold\":100,\"inventory\":[]}," +
                    "\"containers\":{\"containers\":{}}," +
                    "\"npcs\":{\"merchantStates\":{\"shop\":{\"goldReserve\":100,\"items\":[{\"itemId\":\"potion\",\"quantity\":5,\"value\":10}]}}}}");
                var model = new InsimulTradeModel(state);
                int total = model.PlayerGold() + model.MerchantGold("shop"); // 200

                // Can't overspend: 11 potions * 10 > 100 gold -> rejected, nothing moves.
                var over = model.Buy("shop", "potion", 11);
                AssertTrue(!over.Ok && over.Reason == "out_of_stock", "over-stock buy rejected before gold check");
                AssertEqual(100, model.PlayerGold());

                AssertTrue(model.Buy("shop", "potion", 3).Ok, "affordable buy");
                AssertEqual(70, model.PlayerGold());
                AssertEqual(130, model.MerchantGold("shop"));
                AssertEqual(total, model.PlayerGold() + model.MerchantGold("shop")); // conserved

                AssertTrue(model.Sell("shop", "potion", 1).Ok, "sell one back");
                AssertEqual(80, model.PlayerGold());
                AssertEqual(120, model.MerchantGold("shop"));
                AssertEqual(total, model.PlayerGold() + model.MerchantGold("shop")); // still conserved
            });

            Case("State-location invariant: all item state lives in currentState (no private store)", () =>
            {
                JsonVal state = JsonVal.Parse(
                    "{\"player\":{\"gold\":50,\"inventory\":[]}," +
                    "\"containers\":{\"containers\":{\"chest\":{\"items\":[{\"itemId\":\"gem\",\"quantity\":2,\"value\":100}]}}}," +
                    "\"npcs\":{\"merchantStates\":{}}}");
                var model = new InsimulTradeModel(state);
                model.TakeAllFromContainer("chest");

                // The model's read accessor returns the SAME JsonVal reference the save
                // holds — proof it keeps no copy of its own.
                state.TryGet("player", out var player);
                player.TryGet("inventory", out var savedInventory);
                AssertTrue(ReferenceEquals(savedInventory, model.PlayerItems()),
                    "PlayerItems() must be the live currentState.player.inventory reference");
                AssertItemQuantities(new Dictionary<string, int> { { "gem", 2 } }, savedInventory, "invariant: read straight off save state");
            });

            Case("Persistence round-trip: trades survive a save serialize -> load cycle", () =>
            {
                var save = new InsimulSaveSystem();
                save.NewGame("{\"world\":{\"id\":\"w1\"}}", new InsimulSaveSystem.NewGameOptions { Id = "s1", WorldId = "w1" });

                // Seed a fresh save's currentState with a merchant + player gold, then trade.
                save.SaveFile.TryGet("currentState", out var cs);
                cs.TryGet("player", out var pl);
                pl.Set("gold", JsonVal.Int(100));
                cs.TryGet("npcs", out var npcs);
                var merchants = JsonVal.Object();
                var shop = JsonVal.Object();
                shop.Set("goldReserve", JsonVal.Int(100));
                var shopItems = JsonVal.Arr();
                var potion = JsonVal.Object();
                potion.Set("itemId", JsonVal.Str("potion"));
                potion.Set("quantity", JsonVal.Int(5));
                potion.Set("value", JsonVal.Int(10));
                shopItems.Add(potion);
                shop.Set("items", shopItems);
                merchants.Set("shop", shop);
                npcs.Set("merchantStates", merchants);

                var model = new InsimulTradeModel(cs);
                AssertTrue(model.Buy("shop", "potion", 3).Ok, "buy through the live save state");
                AssertEqual(70, model.PlayerGold());

                // Serialize the whole save and load it back — the trade must persist.
                string json = save.SerializeCanonical();
                var reloaded = new InsimulSaveSystem();
                reloaded.Load(json);
                reloaded.SaveFile.TryGet("currentState", out var cs2);
                var model2 = new InsimulTradeModel(cs2);
                AssertEqual(70, model2.PlayerGold());
                AssertEqual(130, model2.MerchantGold("shop"));
                AssertEqual(3, model2.PlayerQuantity("potion"));
                AssertItemQuantities(new Dictionary<string, int> { { "potion", 2 } }, model2.MerchantItems("shop"), "round-trip: merchant stock");
            });
        }

        private static void RunChatTests()
        {
            Section("Default UI — chat/dialogue view-model: streaming SDK (US-UU4)");

            var cases = UiCorpus.LoadChatCases();
            AssertTrue(cases.Count > 0, "chat-cases.json must load");
            foreach (ChatCase c in cases)
            {
                Case($"chat: {c.Name}", () =>
                {
                    var model = new InsimulChatModel(c.CharacterId, c.CharacterName);
                    ReplayChat(model, c);

                    // Transcript (role / text / error flag), oldest first.
                    IReadOnlyList<ChatMessage> msgs = model.MessageList();
                    AssertEqual(c.ExpectedMessages.Count, msgs.Count);
                    for (int i = 0; i < c.ExpectedMessages.Count; i++)
                    {
                        ChatExpectedMessage e = c.ExpectedMessages[i];
                        AssertEqual(e.Role, InsimulChatModel.RoleName(msgs[i].Role));
                        AssertEqual(e.Text, msgs[i].Text);
                        AssertEqual(e.Error, msgs[i].Error);
                    }

                    AssertEqual(c.ExpectedStreaming, model.IsStreaming());
                    AssertEqual(c.ExpectedTurnCount, model.CompletedTurnCount());
                    AssertEqual(c.ExpectedLastNpcText, model.LastNpcText());

                    // Triggered actions (name / args / factToAssert).
                    IReadOnlyList<ChatAction> acts = model.ActionList();
                    AssertEqual(c.ExpectedActions.Count, acts.Count);
                    for (int i = 0; i < c.ExpectedActions.Count; i++)
                    {
                        ChatExpectedAction e = c.ExpectedActions[i];
                        AssertEqual(e.Name, acts[i].Name);
                        AssertEqual(e.FactToAssert, acts[i].FactToAssert);
                        AssertSequence(e.Args ?? new List<string>(), new List<string>(acts[i].Args), $"{c.Name}: action args");
                    }

                    // History projection into save.conversations shape (role / content).
                    ChatHistory hist = model.History();
                    AssertEqual(c.ExpectedHistoryTurns.Count, hist.RecentTurns.Count);
                    for (int i = 0; i < c.ExpectedHistoryTurns.Count; i++)
                    {
                        ChatExpectedTurn e = c.ExpectedHistoryTurns[i];
                        AssertEqual(e.Role, InsimulChatModel.RoleName(hist.RecentTurns[i].Role));
                        AssertEqual(e.Content, hist.RecentTurns[i].Content);
                    }
                });
            }

            Case("Chunk assembly + interruption + error recovery over the mocked SDK", () =>
            {
                var model = new InsimulChatModel("npc1", "Aldric");
                AssertTrue(model.BeginUserTurn("  Hello  "), "opens a turn (trimming the input)");
                AssertEqual("Hello", model.MessageList()[0].Text);
                model.AppendChunk("Good ");
                model.AppendChunk("day.");
                AssertEqual("Good day.", model.StreamingText());
                // A second begin while streaming is rejected (interruption guard).
                AssertTrue(!model.BeginUserTurn("Second"), "second begin rejected while streaming");
                // Error recovery: fail renders an error bubble, drops the turn, and re-opens.
                AssertTrue(model.FailTurn("connection lost"), "fail closes the in-flight turn");
                AssertEqual("[Error: connection lost]", model.MessageList()[1].Text);
                AssertTrue(model.MessageList()[1].Error, "error bubble flagged");
                AssertEqual(0, model.CompletedTurnCount());
                AssertTrue(!model.IsStreaming(), "no longer streaming after fail");
                // Recovered: a fresh turn completes normally after the error.
                AssertTrue(model.BeginUserTurn("Again?"), "can open a new turn after an error");
                model.AppendChunk("All good now.");
                AssertTrue(model.CompleteTurn(), "completes");
                AssertEqual("All good now.", model.LastNpcText());
                AssertEqual(1, model.CompletedTurnCount());
            });

            Case("Action triggers assert facts through the real KB path (integration)", () =>
            {
                var runtime = new InsimulQuestRuntime();
                var model = new InsimulChatModel("smith", "Bram");
                // Panel-supplied fact sink = the real quest-runtime KB path.
                int applied = 0;
                void ApplyPending()
                {
                    IReadOnlyList<ChatAction> a = model.ActionList();
                    while (applied < a.Count)
                    {
                        if (!string.IsNullOrEmpty(a[applied].FactToAssert))
                            AssertTrue(runtime.AssertClause(a[applied].FactToAssert), "fact clause parses + asserts");
                        applied++;
                    }
                }

                AssertTrue(model.BeginUserTurn("Can I have the sword?"), "opens turn");
                model.AppendChunk("Here, take it.");
                model.TriggerAction(new ChatAction("give_item", new[] { "sword" }, "has_item(player,sword)"));
                ApplyPending();
                model.CompleteTurn();

                // The fact landed in the real KB (queryable via the runtime).
                AssertTrue(runtime.HasFact("has_item", "player", "sword"), "action fact present in the KB");
                AssertTrue(!runtime.HasFact("has_item", "player", "shield"), "unrelated fact absent");
            });

            Case("History lands in save.conversations (round-trip through the save system)", () =>
            {
                var model = new InsimulChatModel("npc1", "Aldric");
                model.Greeting("Well met, traveler.");
                model.BeginUserTurn("Hello");
                model.AppendChunk("Good day to you.");
                model.CompleteTurn();

                var save = new InsimulSaveSystem();
                save.NewGame("{\"world\":{\"id\":\"w1\"}}", new InsimulSaveSystem.NewGameOptions { Id = "s1", WorldId = "w1" });

                // Append the ConversationSummary projection into save.conversations.
                save.SaveFile.TryGet("conversations", out var conversations);
                conversations.Add(model.History("2026-07-17T00:00:00.000Z").ToConversationSummary(model.CharacterId, model.CharacterName));

                // Serialize the whole save and load it back — the history must persist.
                var reloaded = new InsimulSaveSystem();
                reloaded.Load(save.SerializeCanonical());
                reloaded.SaveFile.TryGet("conversations", out var convs2);
                AssertEqual(1, convs2.Items.Count);
                JsonVal summary = convs2.Items[0];
                AssertEqual("npc1", summary.TryGet("characterId", out var cid) ? cid.Str : "");
                AssertTrue(summary.TryGet("totalTurnCount", out var ttc) && (int)ttc.Number == 1, "totalTurnCount round-trips");
                summary.TryGet("recentTurns", out var turns);
                AssertEqual(3, turns.Items.Count);
                AssertEqual("npc", turns.Items[0].TryGet("role", out var r0) ? r0.Str : "");
                AssertEqual("Well met, traveler.", turns.Items[0].TryGet("content", out var c0) ? c0.Str : "");
                AssertEqual("player", turns.Items[1].TryGet("role", out var r1) ? r1.Str : "");
                AssertEqual("Hello", turns.Items[1].TryGet("content", out var c1) ? c1.Str : "");
                AssertEqual("Good day to you.", turns.Items[2].TryGet("content", out var c2) ? c2.Str : "");
            });
        }

        private static void RunPauseMenuTests()
        {
            Section("Default UI — pause menu: tab-gating view-model (US-UU5)");

            var cases = UiCorpus.LoadPauseMenuCases();
            AssertTrue(cases.Count > 0, "pause-menu-cases.json must load");
            foreach (PauseMenuCase c in cases)
            {
                Case($"pause-menu: {c.Name}", () =>
                {
                    List<MenuTabDef> tabs = null;
                    if (c.Tabs != null)
                    {
                        tabs = new List<MenuTabDef>();
                        foreach (PauseMenuTabDef t in c.Tabs)
                            tabs.Add(new MenuTabDef(t.Key, t.Label, t.Requires?.ToArray() ?? new string[0]));
                    }
                    var model = new InsimulPauseMenuModel(c.EnabledModules, tabs);

                    AssertSequence(c.ExpectedVisibleKeys, model.VisibleKeys(), $"{c.Name}: visible keys");

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
                                if (s.HasExpectedOk) AssertEqual(s.ExpectedOk, ok);
                                break;
                            }
                            case "expect_active": AssertEqual(s.Key, model.ActiveTab()); break;
                            case "expect_open": AssertEqual(s.Value, model.IsOpen()); break;
                            default: throw new Exception($"unknown pause-menu step op '{s.Op}'");
                        }
                    }
                });
            }

            // AC1: genre-bundle fixtures show different tab sets (rpg vs strategy vs
            // language-learning — the IR's genre bundle drives tab visibility).
            Case("Genre-bundle gating: rpg, strategy, and language-learning show different tabs", () =>
            {
                var rpg = InsimulPauseMenuModel.ForGenre("rpg").VisibleKeys();
                var strategy = InsimulPauseMenuModel.ForGenre("strategy").VisibleKeys();
                var learning = InsimulPauseMenuModel.ForGenre("language-learning").VisibleKeys();

                // rpg: character/vocabulary/skills/analytics but NOT assessment.
                AssertSequence(
                    new List<string> { "resume", "journal", "inventory", "map", "character", "vocabulary", "skills", "analytics", "settings", "save" },
                    rpg, "rpg tabs");
                // strategy: proficiency only among the gated tabs -> character shows, the rest hide.
                AssertSequence(
                    new List<string> { "resume", "journal", "inventory", "map", "character", "settings", "save" },
                    strategy, "strategy tabs");
                // language-learning: every gated tab including assessment.
                AssertSequence(
                    new List<string> { "resume", "journal", "inventory", "map", "character", "vocabulary", "skills", "analytics", "assessment", "settings", "save" },
                    learning, "language-learning tabs");

                AssertTrue(rpg.Count != strategy.Count, "rpg and strategy differ");
                AssertTrue(learning.Contains("assessment"), "language-learning shows assessment");
                AssertTrue(!rpg.Contains("assessment"), "rpg hides assessment");
                AssertTrue(!strategy.Contains("vocabulary"), "strategy hides vocabulary");

                // An unknown genre enables no modules -> only the ungated core tabs.
                AssertSequence(
                    new List<string> { "resume", "journal", "inventory", "map", "settings", "save" },
                    InsimulPauseMenuModel.ForGenre("no-such-genre").VisibleKeys(), "unknown genre tabs");
            });
        }

        private static void RunSaveSlotTests()
        {
            Section("Default UI — save/load slot view-model (US-UU5)");

            var cases = UiCorpus.LoadSaveSlotCases();
            AssertTrue(cases.Count > 0, "save-slot-cases.json must load");
            foreach (SaveSlotCase c in cases)
            {
                Case($"save-slot: {c.Name}", () =>
                {
                    var seeds = new List<SlotLoadResult>();
                    foreach (SaveSlotSeed s in c.Slots)
                        seeds.Add(new SlotLoadResult(s.Index, s.Outcome, ToSummary(s.Summary)));
                    var model = new InsimulSaveSlotModel(seeds);

                    List<SlotView> rows = model.Slots();
                    AssertEqual(c.Expected.Count, rows.Count);
                    for (int i = 0; i < c.Expected.Count; i++)
                    {
                        SaveSlotExpectedRow e = c.Expected[i];
                        AssertEqual(e.Index, rows[i].Index);
                        AssertEqual(e.Status, rows[i].Status);
                        AssertEqual(e.Title, rows[i].Title);
                        AssertEqual(e.Message, rows[i].Message);
                        AssertEqual(e.CanLoad, rows[i].CanLoad);
                        AssertEqual(e.CanSave, rows[i].CanSave);
                    }
                    AssertEqual(c.ExpectedHasLoadable, model.HasAnyLoadable());
                });
            }

            // AC2: corrupted-envelope handling proven through the REAL integrity chain
            // (SHA-256) via ClassifyEnvelope over InsimulSaveSystem.ValidateEnvelope.
            Case("ClassifyEnvelope: healthy save -> ok; tampered -> corrupted (integrity_mismatch)", () =>
            {
                const string worldSnapshot = "{\"world\":{\"id\":\"w1\",\"name\":\"W\"},\"settlements\":[],\"characters\":[]}";
                var save = new InsimulSaveSystem();
                save.NewGame(worldSnapshot, new NewGameOptions { Id = "s", WorldId = "w1" });
                string good = save.BuildEnvelopeJson("1.0.0", "2026-01-01T00:00:00.000Z");

                var okRes = InsimulSaveSlotModel.ClassifyEnvelope(0, good);
                AssertEqual("ok", okRes.Outcome);

                // Tamper with the payload -> the SHA-256 chain rejects it.
                string tampered = good.Replace("\"totalPlaytime\":0", "\"totalPlaytime\":9999");
                AssertTrue(tampered != good, "tamper applied");
                var badRes = InsimulSaveSlotModel.ClassifyEnvelope(1, tampered);
                AssertEqual("integrity_mismatch", badRes.Outcome);

                // Wrong format + empty candidate map to the right outcomes.
                AssertEqual("invalid_format",
                    InsimulSaveSlotModel.ClassifyEnvelope(2, "{\"format\":\"nope\",\"saveFile\":{},\"integrity\":\"x\"}").Outcome);
                AssertEqual("empty", InsimulSaveSlotModel.ClassifyEnvelope(3, null).Outcome);

                // A model built from these renders the corrupted MESSAGING + gates loading.
                var model = new InsimulSaveSlotModel(new List<SlotLoadResult> { okRes, badRes });
                AssertTrue(model.HasAnyLoadable(), "the healthy slot is loadable");
                SlotView corrupted = model.Slot(1);
                AssertEqual("corrupted", corrupted.Status);
                AssertEqual("Save file integrity check failed — file may be corrupted or tampered.", corrupted.Message);
                AssertTrue(!corrupted.CanLoad && corrupted.CanSave, "corrupted: cannot load, can overwrite");
            });
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

        /// <summary>Replay a chat case's ordered event stream against the model, asserting
        /// each begin/complete/fail's expected_ok when the case pins it.</summary>
        private static void ReplayChat(InsimulChatModel model, ChatCase c)
        {
            foreach (ChatEvent e in c.Events)
            {
                switch (e.Op)
                {
                    case "greeting":
                        model.Greeting(e.Text);
                        break;
                    case "begin":
                    {
                        bool ok = model.BeginUserTurn(e.Text);
                        if (e.HasExpectedOk) AssertEqual(e.ExpectedOk, ok);
                        break;
                    }
                    case "chunk":
                        model.AppendChunk(e.Text);
                        break;
                    case "action":
                        model.TriggerAction(new ChatAction(e.Name, e.Args, e.Fact));
                        break;
                    case "complete":
                    {
                        bool ok = model.CompleteTurn(e.HasFullText ? e.FullText : null);
                        if (e.HasExpectedOk) AssertEqual(e.ExpectedOk, ok);
                        break;
                    }
                    case "fail":
                    {
                        bool ok = model.FailTurn(e.Error);
                        if (e.HasExpectedOk) AssertEqual(e.ExpectedOk, ok);
                        break;
                    }
                    default:
                        throw new Exception($"unknown chat event op '{e.Op}'");
                }
            }
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
                default: throw new Exception($"unknown trade op kind '{c.OpKind}'");
            }
        }

        /// <summary>Assert a JsonVal item array holds EXACTLY the expected
        /// {itemId: quantity} multiset (order-insensitive; extra/missing stacks fail).</summary>
        private static void AssertItemQuantities(Dictionary<string, int> expected, JsonVal items, string what)
        {
            var actual = new Dictionary<string, int>(StringComparer.Ordinal);
            foreach (JsonVal s in items.Items)
            {
                string id = s.TryGet("itemId", out var idv) ? idv.Str : "";
                int qty = s.TryGet("quantity", out var qv) && qv.Kind == JsonKind.Number ? (int)qv.Number : 0;
                actual[id] = qty;
            }
            AssertEqual(expected.Count, actual.Count);
            foreach (var kv in expected)
            {
                AssertTrue(actual.TryGetValue(kv.Key, out int got),
                    $"{what}: expected item '{kv.Key}' present");
                AssertTrue(got == kv.Value, $"{what}: '{kv.Key}' expected {kv.Value}, got {got}");
            }
        }

        private static double Round3(double v) => Math.Round(v, 3, MidpointRounding.AwayFromZero);

        /// <summary>A minimal two-building IR; <paramref name="reversed"/> lists them
        /// in the opposite order to prove the manifest is order-insensitive.</summary>
        private static JsonVal BuildTwoEntityIr(bool reversed)
        {
            JsonVal Building(string id, string role, double x, double z)
            {
                var b = JsonVal.Object();
                b.Set("id", JsonVal.Str(id));
                b.Set("role", JsonVal.Str(role));
                var pos = JsonVal.Object();
                pos.Set("x", JsonVal.Num(x));
                pos.Set("z", JsonVal.Num(z));
                b.Set("position", pos);
                return b;
            }
            var a = Building("bld-a", "commercial", 10, 10);
            var c = Building("bld-c", "residential", 20, 20);
            var buildings = JsonVal.Arr();
            if (reversed) { buildings.Add(c); buildings.Add(a); }
            else { buildings.Add(a); buildings.Add(c); }
            var entities = JsonVal.Object();
            entities.Set("buildings", buildings);
            var ir = JsonVal.Object();
            ir.Set("entities", entities);
            return ir;
        }

        private static void AssertVec3(BindingVec3 expected, BindingVec3 actual, string what)
        {
            AssertTrue(Math.Abs(expected.X - actual.X) < 0.001f, what + ".x");
            AssertTrue(Math.Abs(expected.Y - actual.Y) < 0.001f, what + ".y");
            AssertTrue(Math.Abs(expected.Z - actual.Z) < 0.001f, what + ".z");
        }

        // ---- Mini test framework --------------------------------------------

        private static void Section(string name) => Console.WriteLine($"\n=== {name} ===");

        private static void Case(string name, Action body)
        {
            try
            {
                body();
                _passed++;
                Console.WriteLine($"  PASS  {name}");
            }
            catch (Exception ex)
            {
                _failed++;
                Console.WriteLine($"  FAIL  {name}\n        {ex.GetType().Name}: {ex.Message}");
            }
        }

        private static int Report()
        {
            Console.WriteLine($"\n{_passed} passed, {_failed} failed");
            return _failed == 0 ? 0 : 1;
        }

        private static void AssertTrue(bool cond, string msg)
        {
            if (!cond) throw new Exception($"assertion failed: {msg}");
        }

        private static void AssertEqual<T>(T expected, T actual)
        {
            if (!EqualityComparer<T>.Default.Equals(expected, actual))
                throw new Exception($"expected [{expected}] but got [{actual}]");
        }

        private static void AssertThrows<TException>(Action body) where TException : Exception
        {
            try { body(); }
            catch (TException) { return; }
            catch (Exception ex)
            {
                throw new Exception($"expected {typeof(TException).Name} but got {ex.GetType().Name}: {ex.Message}");
            }
            throw new Exception($"expected {typeof(TException).Name} but nothing was thrown");
        }

        private static TException AssertThrowsReturning<TException>(Action body) where TException : Exception
        {
            try { body(); }
            catch (TException ex) { return ex; }
            catch (Exception ex)
            {
                throw new Exception($"expected {typeof(TException).Name} but got {ex.GetType().Name}: {ex.Message}");
            }
            throw new Exception($"expected {typeof(TException).Name} but nothing was thrown");
        }
    }
}
