// Host unit tests for the plain C++ InsimulKB wrapper (US-XP1).
//
// Exercises the wrapper end-to-end against a locally built libinsimul: KB
// lifetime, consult (good / syntax error / rollback), assert, the query
// iterator over zero / one / many solutions and every binding-JSON value kind,
// ground success, retract (removed / no-match), the error surface, and a
// snapshot -> restore round-trip. This is the host mirror of the native ABI's
// tests/abi.c, but through the marshalling layer the wrapper adds (variant
// parsing), so it catches wrapper bugs the native lib cannot.

#include "InsimulKB.h"

#include <cstdio>
#include <string>
#include <vector>

using insimul::InsimulKB;
using insimul::PrologBinding;
using insimul::PrologQuery;
using insimul::PrologValue;
using insimul::PrologValueType;

static int gFailures = 0;

#define CHECK(cond, msg)                                    \
    do {                                                    \
        if (cond) { std::printf("  ok   %s\n", msg); }      \
        else { std::printf("  FAIL %s\n", msg); ++gFailures; } \
    } while (0)

// Look up a var's rendered value in a binding, or "<none>".
static std::string BoundText(const PrologBinding& B, const char* Name)
{
    const PrologValue* V = B.Find(Name);
    return V ? V->ToDisplayString() : std::string("<none>");
}

int main()
{
    InsimulKB Kb;
    CHECK(Kb.IsValid(), "InsimulKB constructs a valid KB");
    if (!Kb.IsValid()) return 1;

    CHECK(!InsimulKB::Version().empty(), "Version() returns a stamp");

    // --- consult ------------------------------------------------------------
    CHECK(Kb.Consult(
              "parent(tom, bob).\n"
              "parent(bob, ann).\n"
              "grandparent(X, Z) :- parent(X, Y), parent(Y, Z).\n"),
          "consult a valid program");
    CHECK(Kb.LastError().empty(), "no error after good consult");

    // Custom operator directive must affect later clauses.
    CHECK(Kb.Consult(":- op(700, xfx, ===).\nsame(X === X).\n"),
          "consult with :- op/3 directive");
    {
        std::vector<PrologBinding> Sols;
        CHECK(Kb.QueryAll("same(a === a)", Sols) && Sols.size() == 1,
              "custom operator query succeeds");
    }

    // Syntax error: reported, rolled back (nothing from that source loaded).
    CHECK(!Kb.Consult("ok_before(1).\nbroken(2.\n"), "consult syntax error returns false");
    CHECK(!Kb.LastError().empty(), "syntax error sets LastError");
    {
        std::vector<PrologBinding> Sols;
        CHECK(Kb.QueryAll("catch(ok_before(_), _, fail)", Sols) && Sols.empty(),
              "failed consult loads nothing (rollback)");
    }

    // --- query: one / many / zero / ground ----------------------------------
    {
        std::vector<PrologBinding> Sols;
        CHECK(Kb.QueryAll("grandparent(tom, X)", Sols) && Sols.size() == 1,
              "one-solution query");
        CHECK(Sols.size() == 1 && BoundText(Sols[0], "X") == "ann",
              "binding X = ann");
        CHECK(Sols.size() == 1 && Sols[0].Size() == 1,
              "one named variable in the binding");
    }
    {
        std::vector<PrologBinding> Sols;
        CHECK(Kb.QueryAll("parent(P, C)", Sols) && Sols.size() == 2,
              "multi-solution query yields 2");
        CHECK(Sols.size() == 2 &&
                  BoundText(Sols[0], "P") == "tom" && BoundText(Sols[0], "C") == "bob" &&
                  BoundText(Sols[1], "P") == "bob" && BoundText(Sols[1], "C") == "ann",
              "both solutions, in order, with correct bindings");
    }
    {
        std::vector<PrologBinding> Sols;
        CHECK(Kb.QueryAll("grandparent(tom, ann)", Sols) && Sols.size() == 1 && Sols[0].Empty(),
              "ground success yields one empty binding");
    }
    {
        std::vector<PrologBinding> Sols;
        CHECK(Kb.QueryAll("grandparent(tom, tom)", Sols) && Sols.empty(),
              "failing goal yields zero solutions");
        CHECK(Kb.LastError().empty(), "a plain failure is not an error");
    }

    // --- assert / value mapping ---------------------------------------------
    CHECK(Kb.Assert("likes(alice, [wine, chess(fast), 3, 4.5])"),
          "assert a dynamic fact");
    {
        PrologBinding B;
        CHECK(Kb.QueryFirst("likes(Who, What)", B), "query the asserted fact");
        CHECK(BoundText(B, "Who") == "alice", "atom binding Who = alice");

        const PrologValue* What = B.Find("What");
        CHECK(What && What->Type == PrologValueType::List && What->Elements.size() == 4,
              "list value has 4 elements");
        if (What && What->Elements.size() == 4)
        {
            const PrologValue& E0 = What->Elements[0];
            const PrologValue& E1 = What->Elements[1];
            const PrologValue& E2 = What->Elements[2];
            const PrologValue& E3 = What->Elements[3];
            CHECK(E0.Type == PrologValueType::Atom && E0.Text == "wine", "list[0] atom wine");
            CHECK(E1.Type == PrologValueType::Compound && E1.Text == "chess" &&
                      E1.Elements.size() == 1 && E1.Elements[0].Text == "fast",
                  "list[1] compound chess(fast)");
            CHECK(E2.Type == PrologValueType::Int && E2.Int == 3, "list[2] int 3");
            CHECK(E3.Type == PrologValueType::Float && E3.Float > 4.4 && E3.Float < 4.6,
                  "list[3] float 4.5");
        }
    }

    // --- retract ------------------------------------------------------------
    CHECK(Kb.Retract("likes(alice, _)") == InsimulKB::RetractResult::Removed,
          "retract an existing clause");
    {
        std::vector<PrologBinding> Sols;
        CHECK(Kb.QueryAll("likes(_, _)", Sols) && Sols.empty(),
              "clause is gone after retract");
    }
    CHECK(Kb.Retract("likes(nobody, nothing)") == InsimulKB::RetractResult::NoMatch,
          "retract with no match returns NoMatch");
    CHECK(Kb.LastError().empty(), "no-match retract is not an error");

    // --- query error path ---------------------------------------------------
    {
        PrologQuery Q = Kb.StartQuery("foo(bar"); // unbalanced
        CHECK(!Q.IsValid(), "syntax-error goal returns invalid query");
        CHECK(!Kb.LastError().empty(), "syntax-error goal sets LastError");
    }
    {
        PrologQuery Q = Kb.StartQuery("X is foo + 1"); // type error
        CHECK(!Q.IsValid(), "type-error goal returns invalid query");
        CHECK(!Kb.LastError().empty(), "type-error goal sets LastError");
    }
    {
        PrologBinding B;
        CHECK(Kb.QueryFirst("parent(tom, bob)", B) && Kb.LastError().empty(),
              "success clears LastError");
    }

    // --- snapshot / restore round-trip --------------------------------------
    // Use a dedicated KB with no custom operators: the :- op/3 directive is NOT
    // part of the snapshot image (only clauses are), so a KB whose clauses lean
    // on a custom operator cannot restore into a fresh KB. That is a property of
    // the snapshot contract, not the wrapper — round-trip plain clauses here.
    {
        InsimulKB KbSnap;
        CHECK(KbSnap.IsValid(), "snapshot-source KB valid");
        CHECK(KbSnap.Consult(
                  "parent(tom, bob).\n"
                  "parent(bob, ann).\n"
                  "grandparent(X, Z) :- parent(X, Y), parent(Y, Z).\n"),
              "consult rules to snapshot");
        CHECK(KbSnap.Assert("quest(sword, active)"), "assert quest fact for snapshot");

        std::string Image;
        CHECK(KbSnap.Snapshot(Image) && !Image.empty(), "snapshot yields a non-empty image");

        // Restore into a fresh KB and confirm the state reproduces.
        InsimulKB Kb2;
        CHECK(Kb2.IsValid(), "second KB valid");
        CHECK(Kb2.Restore(Image), "restore image into a fresh KB");
        {
            PrologBinding B;
            CHECK(Kb2.QueryFirst("quest(Q, active)", B) && BoundText(B, "Q") == "sword",
                  "restored KB reproduces the quest fact");
        }
        {
            std::vector<PrologBinding> Sols;
            CHECK(Kb2.QueryAll("grandparent(tom, X)", Sols) && Sols.size() == 1 &&
                      BoundText(Sols[0], "X") == "ann",
                  "restored KB reproduces consulted rules");
        }

        // Restore replaces state: the quest fact from before is gone.
        CHECK(Kb2.Restore("weather(sunny)."), "restore a second image");
        {
            std::vector<PrologBinding> Sols;
            CHECK(Kb2.QueryAll("quest(_, _)", Sols) && Sols.empty(),
                  "restore replaces prior dynamic state");
        }
    }

    // --- malformed restore is rejected --------------------------------------
    CHECK(!Kb.Restore("this is not : valid prolog ("),
          "malformed restore image is rejected");
    CHECK(!Kb.LastError().empty(), "malformed restore sets LastError");

    if (gFailures == 0)
    {
        std::printf("insimul_kb: PASS\n");
        return 0;
    }
    std::printf("insimul_kb: FAIL (%d)\n", gFailures);
    return 1;
}
