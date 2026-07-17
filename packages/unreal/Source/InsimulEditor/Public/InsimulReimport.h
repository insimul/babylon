// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulReimport — the editor entry point for the CONSERVATIVE re-import of a
// world's IR (US-XG4), the Unreal twin of Unity's InsimulReimport.cs. When a
// world is re-exported, running "Insimul ▸ Generate Scene From World IR" from
// scratch would clobber every hand edit a creator made in the interim. This
// re-imports instead: it reads the InsimulEntityId stamps off the actors already
// in the level (the OLD manifest), computes the FRESH placement manifest for the
// new IR (the host-tested Portable/InsimulScenePlacement core), and runs the pure
// re-import policy (Portable/InsimulReimportDiff) to reconcile them —
//
//   Added      -> materialize a new generated actor (+ stamp it)
//   Updated    -> re-apply the fresh generated transform + binding in place
//   Unchanged  -> no-op
//   Skipped    -> a hand edit (generated=false) is preserved VERBATIM
//   Deprecated -> a generated actor the new IR dropped is reparented under a
//                 `Deprecated/` folder, NEVER deleted
//
// The classification is a pure, side-effect-free function, so the menu computes +
// logs the canonical dry-run report and shows an added/updated/unchanged/skipped/
// deprecated summary BEFORE any mutation; the whole apply is one transaction.
//
// UNREAL-COUPLED — syntax-gated only (no UBT in this harness); a human runs it in
// a real editor (see VERIFICATION.md). The reconciliation POLICY underneath is
// the host-tested pure core — the editor and the host gate can never diverge.

#pragma once

#include "CoreMinimal.h"
#include "Kismet/BlueprintFunctionLibrary.h"
#include "InsimulReimport.generated.h"

class UWorld;
class UInsimulBindingTable;

/** The dry-run report surfaced before an apply (the FDiffReport counts, plus the
 *  id lists for the preview dialog). */
USTRUCT(BlueprintType)
struct FInsimulReimportReport
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Reimport")
	bool bSuccess = false;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Reimport")
	int32 AddedCount = 0;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Reimport")
	int32 UpdatedCount = 0;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Reimport")
	int32 UnchangedCount = 0;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Reimport")
	int32 SkippedCount = 0;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Reimport")
	int32 DeprecatedCount = 0;

	/** The canonical dry-run report JSON (byte-identical to the cross-engine
	 *  golden), logged + available for tests. */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Reimport")
	FString ReportJson;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Reimport")
	FString Error;
};

/**
 * Conservative re-import driver. Exposed as a Blueprint function library so an
 * Editor Utility Widget / menu command can drive it, and callable from C++.
 */
UCLASS()
class INSIMULEDITOR_API UInsimulReimport : public UBlueprintFunctionLibrary
{
	GENERATED_BODY()

public:
	/**
	 * Compute the dry-run re-import diff for `IrJson` against the actors already in
	 * `World`, WITHOUT mutating anything. Returns the classification report. Entry
	 * point behind the "Insimul ▸ Re-import World IR (Diff)" preview.
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Reimport")
	static FInsimulReimportReport DryRun(UWorld* World, const FString& IrJson,
			const TArray<UInsimulBindingTable*>& Tables);

	/**
	 * Compute + APPLY the re-import: update generated actors in place, add new
	 * ones, reparent dropped generated actors under a `Deprecated/` folder, and
	 * leave hand edits untouched. Wrapped in a single Undo transaction. Returns the
	 * report that was applied.
	 */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Reimport")
	static FInsimulReimportReport Apply(UWorld* World, const FString& IrJson,
			const TArray<UInsimulBindingTable*>& Tables);
};
