// Copyright 2024 Insimul. All Rights Reserved.
//
// UInsimulPrologSubsystem — the UE-facing layer over the real Prolog engine.
//
// THIN BY DESIGN: this GameInstance subsystem owns exactly one
// insimul::InsimulKB (the plain, UE-free RAII wrapper in
// Private/Prolog/InsimulKB.h) and does nothing but marshal between UE reflected
// types (FString / USTRUCT / TArray) and that core. ALL Prolog logic lives in
// InsimulKB — this class catches bools, converts binding sets into UStructs, and
// enforces game-thread affinity. The core is forward-declared here (pimpl via
// TUniquePtr) so this Public header never drags the C ABI or the Private core
// header into downstream modules.
//
// THREAD AFFINITY: libinsimul's KB is single-thread-owned. Every mutating /
// querying call asserts IsInGameThread() (checkf in shipping-safe form) so a
// stray async task can't corrupt the KB. Do not call these off the game thread.
#pragma once

#include "CoreMinimal.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "InsimulPrologSubsystem.generated.h"

// Forward declaration of the plain-C++ core (Private/Prolog/InsimulKB.h). Kept
// out of this header so the C ABI stays a private implementation detail.
namespace insimul { class InsimulKB; }

/** Kind of a bound Prolog term. Mirrors insimul::PrologValueType. */
UENUM(BlueprintType)
enum class EInsimulPrologValueType : uint8
{
	Null     = 0 UMETA(DisplayName = "Null (unbound)"),
	Atom     = 1 UMETA(DisplayName = "Atom"),
	Int      = 2 UMETA(DisplayName = "Integer"),
	Float    = 3 UMETA(DisplayName = "Float"),
	List     = 4 UMETA(DisplayName = "List"),
	Compound = 5 UMETA(DisplayName = "Compound")
};

/**
 * A single bound Prolog term, flattened for Blueprint use. Scalars carry their
 * native payload (Text for atoms / compound functor, IntValue, FloatValue);
 * DisplayString is always the canonical rendered form (e.g. "[a,b]", "f(1,x)")
 * and Elements holds the rendered list items / compound args. Deep structural
 * traversal stays in C++ (insimul::PrologValue) — this is the curated surface.
 */
USTRUCT(BlueprintType)
struct INSIMULRUNTIME_API FInsimulPrologValue
{
	GENERATED_BODY()

	/** Term kind. */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Prolog")
	EInsimulPrologValueType Type = EInsimulPrologValueType::Null;

	/** Atom text, or a compound's functor name. Empty for numbers/lists/null. */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Prolog")
	FString Text;

	/** Integer payload (valid when Type == Int). */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Prolog")
	int64 IntValue = 0;

	/** Float payload (valid when Type == Float). */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Prolog")
	double FloatValue = 0.0;

	/** Canonical rendered form of the whole term (always populated). */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Prolog")
	FString DisplayString;

	/** Rendered list elements / compound arguments (empty for scalars). */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Prolog")
	TArray<FString> Elements;
};

/** One named goal variable and the value bound to it in a solution. */
USTRUCT(BlueprintType)
struct INSIMULRUNTIME_API FInsimulPrologVar
{
	GENERATED_BODY()

	/** Goal variable name (e.g. "X"). */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Prolog")
	FString Name;

	/** Value bound to this variable. */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Prolog")
	FInsimulPrologValue Value;
};

/**
 * One solution's binding set: the goal's named variables in ABI emit order.
 * A ground success (goal with no variables) is an empty Vars array.
 */
USTRUCT(BlueprintType)
struct INSIMULRUNTIME_API FInsimulPrologBinding
{
	GENERATED_BODY()

	/** Bound variables for this solution. */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Prolog")
	TArray<FInsimulPrologVar> Vars;
};

/**
 * GameInstance subsystem that owns the real Prolog knowledge base and exposes a
 * curated Blueprint surface. Access from Blueprint via
 * "Get Game Instance Subsystem" (class = InsimulPrologSubsystem), or from C++
 * with GetGameInstance()->GetSubsystem<UInsimulPrologSubsystem>().
 *
 * All calls must run on the game thread (see thread-affinity note above).
 */
UCLASS()
class INSIMULRUNTIME_API UInsimulPrologSubsystem : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	// Explicit destructor so the TUniquePtr<insimul::InsimulKB> member can be
	// destroyed against the complete type in the .cpp (it's forward-declared here).
	UInsimulPrologSubsystem();
	virtual ~UInsimulPrologSubsystem() override;

	// USubsystem lifecycle: the KB is created in Initialize and released in
	// Deinitialize (one KB per GameInstance, long-lived — no create/destroy loop,
	// so the Trealla keepalive concern does not apply here).
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	/**
	 * Consult (load) a block of Prolog world data — clauses and directives.
	 * Returns false on a syntax error (nothing is loaded in that case; see
	 * GetLastError). Typically fed the exported world's *.pl text at startup.
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Prolog")
	bool ConsultWorldData(const FString& PrologSource);

	/**
	 * Assert one clause given as term text WITHOUT a trailing '.'
	 * (e.g. "quest(find_sword, active)"). Returns false on error.
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Prolog")
	bool AssertFact(const FString& Fact);

	/**
	 * Retract the first clause unifying with Fact (term text, no trailing '.').
	 * Returns true only when a clause was actually removed; a no-match is false
	 * WITHOUT setting an error (check GetLastError to disambiguate a real error).
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Prolog")
	bool RetractFact(const FString& Fact);

	/**
	 * First solution of Goal (goal text, no trailing '.') into OutBinding.
	 * Returns false on a zero-solution goal OR a start error — check GetLastError
	 * (empty on no-solution, set on error).
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Prolog")
	bool QueryFirst(const FString& Goal, FInsimulPrologBinding& OutBinding);

	/**
	 * Every solution of Goal into OutSolutions. Returns false only if the query
	 * failed to start (GetLastError set); a true result with an empty array means
	 * the goal simply has zero solutions.
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Prolog")
	bool QueryAll(const FString& Goal, TArray<FInsimulPrologBinding>& OutSolutions);

	/**
	 * Serialize the KB's dynamic state to a canonical Prolog-text image (for
	 * GameSaveState.prologFacts). Returns "" on error (see GetLastError).
	 * NOTE: snapshots serialize clauses only, not ':- op/3' directives.
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Prolog")
	FString SnapshotToString();

	/**
	 * Replace the KB's dynamic state from a snapshot image produced by
	 * SnapshotToString. Returns false on a malformed image (KB left unchanged).
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Prolog")
	bool RestoreFromString(const FString& Image);

	/** Message for the last operation, or "" if it succeeded. */
	UFUNCTION(BlueprintPure, Category = "Insimul|Prolog")
	FString GetLastError() const;

	/** True once the KB is created and ready (between Initialize and Deinitialize). */
	UFUNCTION(BlueprintPure, Category = "Insimul|Prolog")
	bool IsPrologReady() const;

	/** libinsimul version string. Static — no KB required. */
	UFUNCTION(BlueprintPure, Category = "Insimul|Prolog")
	static FString GetPrologVersion();

	/**
	 * Pure helper: look up VarName in a binding set. Returns true and fills
	 * OutValue when the solution bound that variable, false otherwise.
	 */
	UFUNCTION(BlueprintPure, Category = "Insimul|Prolog")
	static bool GetBoundValue(const FInsimulPrologBinding& Binding, const FString& VarName, FInsimulPrologValue& OutValue);

private:
	// Asserts we are on the game thread; logs and returns false otherwise.
	bool EnsureGameThread(const TCHAR* Op) const;

	// The plain-C++ core. Forward-declared; owned via pimpl so the C ABI never
	// leaks into this Public header.
	TUniquePtr<insimul::InsimulKB> KB;
};
