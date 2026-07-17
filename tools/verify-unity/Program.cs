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
using Insimul.Prolog;
using Insimul.Prolog.Conformance;

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

            if (skipNative)
            {
                Console.WriteLine("\n(--pure-only: skipping native tests)");
                return Report();
            }

            Section("Native (requires libinsimul on the loader path)");
            try
            {
                RunNativeTests();
                RunConformanceCorpus();
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

        // ---- Native tests ----------------------------------------------------

        private static void RunNativeTests()
        {
            Case("version: non-empty semver", () =>
            {
                string v = InsimulProlog.NativeVersion;
                AssertTrue(!string.IsNullOrWhiteSpace(v), "version should be non-empty");
                Console.WriteLine($"      libinsimul {v}");
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

            // Radiant: skipped until libinsimul exposes a radiant tick (tracked TODO).
            string radiantNote = ConformanceCorpus.RadiantCorpusPresent(root)
                ? "radiant corpus present but " + ConformanceCorpus.RadiantSkipReason
                : "no radiant corpus; " + ConformanceCorpus.RadiantSkipReason;
            Console.WriteLine($"  SKIP  {radiantNote}");
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
    }
}
