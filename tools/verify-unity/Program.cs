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
using Insimul.Prolog;
using Insimul.Prolog.Conformance;
using Insimul.Quest;
using Insimul.Quest.TestSupport;
using Insimul.Radiant;
using Insimul.Radiant.Conformance;
using Insimul.Runtime;
using Insimul.Save;
using Insimul.Save.TestSupport;
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
