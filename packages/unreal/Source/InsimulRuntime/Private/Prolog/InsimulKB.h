// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulKB — a plain C++ RAII wrapper around the libinsimul C ABI (insimul.h).
//
// DELIBERATELY UE-FREE: this header and its .cpp use only the C++ standard
// library and the extern "C" ABI. No CoreMinimal.h, no UObject, no FString/
// TArray. The UE-facing layer (UInsimulPrologSubsystem, US-XP3) wraps THIS class
// in UStructs; keeping the core engine-agnostic lets it be unit-tested on the
// host clang toolchain with no Unreal SDK (tools/verify-unreal/host-test) and
// lets the same wrapper be reused by other native hosts.
//
// ERROR MODEL: non-throwing. Mutating calls return a bool/status; query start
// yields an invalid PrologQuery on error. After any failure LastError() carries
// the reason (the ABI's insimul_last_error). A subsequent success clears it.
// This suits UE builds that disable C++ exceptions.
#pragma once

#include <cstdint>
#include <string>
#include <utility>
#include <vector>

// Opaque C ABI handles (from ThirdParty/InsimulLibrary/include/insimul.h).
// Forward-declared so this header pulls in neither the C ABI header nor any UE
// header — only the .cpp includes "insimul.h".
struct insimul_kb;
struct insimul_query;

namespace insimul
{

// Kind of a parsed Prolog term value. Mirrors the binding-set JSON mapping
// documented on insimul_query_next in insimul.h.
enum class PrologValueType : uint8_t
{
    Null,     // unbound variable        (JSON null)
    Atom,     // atom                    (JSON string)
    Int,      // integer                 (JSON integer)
    Float,    // float                   (JSON float)
    List,     // list                    (JSON array)
    Compound, // compound f(A,..)        ({"functor":"f","args":[..]})
};

// A single parsed Prolog term. A small tagged variant: `Text` holds an atom's
// text or a compound's functor; `Int`/`Float` the numeric payload; `Elements`
// the list items or the compound's arguments.
struct PrologValue
{
    PrologValueType Type = PrologValueType::Null;
    std::string Text;                    // Atom text, or Compound functor
    long long Int = 0;                   // Int
    double Float = 0.0;                  // Float
    std::vector<PrologValue> Elements;   // List elements, or Compound args

    bool IsNull() const { return Type == PrologValueType::Null; }
    bool IsAtom() const { return Type == PrologValueType::Atom; }
    bool IsInt() const { return Type == PrologValueType::Int; }
    bool IsFloat() const { return Type == PrologValueType::Float; }
    bool IsList() const { return Type == PrologValueType::List; }
    bool IsCompound() const { return Type == PrologValueType::Compound; }

    // Render back to canonical Prolog-ish text (atoms bare, lists [..],
    // compounds f(..)). Handy for logging and for test comparisons.
    std::string ToDisplayString() const;
};

// One solution's binding set: named goal variables in the order the ABI emits
// them. A ground success is an empty binding set.
struct PrologBinding
{
    std::vector<std::pair<std::string, PrologValue>> Vars;

    bool Empty() const { return Vars.empty(); }
    std::size_t Size() const { return Vars.size(); }
    // Value bound to `Name`, or nullptr if the goal had no such named variable.
    const PrologValue* Find(const std::string& Name) const;
};

// A live query iterator. Move-only; the underlying ABI handle is released on
// destruction (or Stop()). Created via InsimulKB::StartQuery.
class PrologQuery
{
public:
    PrologQuery() = default;
    ~PrologQuery();

    PrologQuery(PrologQuery&& Other) noexcept;
    PrologQuery& operator=(PrologQuery&& Other) noexcept;
    PrologQuery(const PrologQuery&) = delete;
    PrologQuery& operator=(const PrologQuery&) = delete;

    // False when the goal raised an error at start (see InsimulKB::LastError).
    bool IsValid() const { return Handle != nullptr; }

    // Advance to the next solution, filling OutBinding (cleared first). Returns
    // false when the solutions are exhausted or the query is invalid.
    bool Next(PrologBinding& OutBinding);

    // Release the handle early; further Next() calls return false.
    void Stop();

private:
    friend class InsimulKB;
    explicit PrologQuery(insimul_query* InHandle) : Handle(InHandle) {}

    insimul_query* Handle = nullptr;
};

// RAII owner of one knowledge base. Move-only; one KB is owned by one thread
// (the ABI's thread model). Not valid if the engine failed to initialize —
// check IsValid().
class InsimulKB
{
public:
    enum class RetractResult : uint8_t
    {
        Removed,  // a clause was retracted
        NoMatch,  // no clause unified (not an error)
        Error,    // retract failed (see LastError)
    };

    InsimulKB();
    ~InsimulKB();

    InsimulKB(InsimulKB&& Other) noexcept;
    InsimulKB& operator=(InsimulKB&& Other) noexcept;
    InsimulKB(const InsimulKB&) = delete;
    InsimulKB& operator=(const InsimulKB&) = delete;

    bool IsValid() const { return Handle != nullptr; }

    // Load Prolog program text (clauses/directives). False on syntax error;
    // nothing from Source is loaded in that case (see LastError).
    bool Consult(const std::string& Source);

    // Assert one clause given as term text WITHOUT a trailing '.'. False on error.
    bool Assert(const std::string& Fact);

    // Retract the first clause unifying with Fact (term text, no trailing '.').
    RetractResult Retract(const std::string& Fact);

    // Start a query over Goal (goal text, no trailing '.'). The returned query
    // is invalid if the goal raised an error.
    PrologQuery StartQuery(const std::string& Goal);

    // Collect every solution of Goal. Returns false only if the query failed to
    // start (LastError set); a true result with an empty vector means the goal
    // has zero solutions.
    bool QueryAll(const std::string& Goal, std::vector<PrologBinding>& OutSolutions);

    // First solution of Goal into OutBinding. Returns false on a zero-solution
    // goal OR on a start error — disambiguate via LastError() (empty on the
    // former, set on the latter).
    bool QueryFirst(const std::string& Goal, PrologBinding& OutBinding);

    // Serialize the KB's dynamic state to canonical Prolog text. False on error.
    bool Snapshot(std::string& OutImage);

    // Replace the KB's dynamic state from a snapshot image. False on error
    // (a malformed image leaves the KB unchanged).
    bool Restore(const std::string& Image);

    // Message for the KB's last operation, or "" if it succeeded.
    std::string LastError() const;

    // "insimul <semver> (git <sha>, trealla <tag>/<commit>)". No KB needed.
    static std::string Version();

private:
    insimul_kb* Handle = nullptr;
};

} // namespace insimul
