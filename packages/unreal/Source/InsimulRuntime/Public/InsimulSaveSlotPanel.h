// Copyright 2024 Insimul. All Rights Reserved.
//
// UInsimulSaveSlotPanel — the UE seam over the portable save/load slot view-model
// (Portable/InsimulSaveSlotModel.h, US-XU4). The UObject the save/load screen
// (InsimulSaveGame / the save-load menu tab) binds to: the save shell loads each
// slot through the portable codec (canonical JSON + SHA-256 integrity), reports an
// OUTCOME per slot (empty / ok / a validation failure), and this seam renders each
// into a row (status / title / message / can_load / can_save). The
// corrupted-envelope MESSAGING (e.g. an integrity mismatch on a tampered save) is
// the cross-engine contract proven by the portable core.
//
// All rendering SEMANTICS live in the portable core and are host-tested by
// run-dialogue-ui-tests.sh. This class is the thin, syntax-gated Blueprint /
// UObject boundary (pimpl).

#pragma once

#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
#include "InsimulSaveSlotPanel.generated.h"

// The engine-agnostic model this seam wraps (pimpl). Host-tested by
// run-dialogue-ui-tests.sh.
namespace insimul { class FInsimulSaveSlotModel; }

/** A codec-reported slot summary (a healthy save's title/message source). */
USTRUCT(BlueprintType)
struct FInsimulSaveSummary
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite, Category = "Insimul|Save")
	FString PlayerName;

	UPROPERTY(BlueprintReadWrite, Category = "Insimul|Save")
	int32 Level = 0;

	UPROPERTY(BlueprintReadWrite, Category = "Insimul|Save")
	bool bHasLevel = false;

	UPROPERTY(BlueprintReadWrite, Category = "Insimul|Save")
	FString LocationName;

	UPROPERTY(BlueprintReadWrite, Category = "Insimul|Save")
	FString SavedAt;
};

/** One codec-reported slot: index + outcome (+ a summary when ok). */
USTRUCT(BlueprintType)
struct FInsimulSaveSlotResult
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadWrite, Category = "Insimul|Save")
	int32 Index = 0;

	/** empty | ok | invalid_format | missing_save_file | integrity_mismatch. */
	UPROPERTY(BlueprintReadWrite, Category = "Insimul|Save")
	FString Outcome;

	UPROPERTY(BlueprintReadWrite, Category = "Insimul|Save")
	bool bHasSummary = false;

	UPROPERTY(BlueprintReadWrite, Category = "Insimul|Save")
	FInsimulSaveSummary Summary;
};

/** One rendered slot row as the save/load screen draws it. */
USTRUCT(BlueprintType)
struct FInsimulSaveSlotView
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Save")
	int32 Index = 0;

	/** "empty" | "ok" | "corrupted". */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Save")
	FString Status;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Save")
	FString Title;

	/** The row's subtitle — for corrupted slots, the cross-engine failure message. */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Save")
	FString Message;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Save")
	bool bCanLoad = false;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Save")
	bool bCanSave = false;
};

/**
 * The default-runtime save/load slot view-model. The screen renders Slots() and
 * gates the main-menu Continue button on HasAnyLoadable(); all rendering lives in
 * the portable core (pimpl) that host-tests UE-free.
 */
UCLASS(BlueprintType)
class INSIMULRUNTIME_API UInsimulSaveSlotPanel : public UObject
{
	GENERATED_BODY()

public:
	UInsimulSaveSlotPanel();

	/** Feed the codec-reported slot outcomes (from the portable save system). */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Save")
	void SetSlots(const TArray<FInsimulSaveSlotResult>& Results);

	/** The rendered rows, in slot-index order. */
	UFUNCTION(BlueprintPure, Category = "Insimul|Save")
	TArray<FInsimulSaveSlotView> Slots() const;

	/** The rendered row for one slot index. */
	UFUNCTION(BlueprintPure, Category = "Insimul|Save")
	FInsimulSaveSlotView Slot(int32 Index) const;

	/** True when any slot is loadable (main-menu Continue gate). */
	UFUNCTION(BlueprintPure, Category = "Insimul|Save")
	bool HasAnyLoadable() const;

	virtual void BeginDestroy() override;

private:
	/** The host-tested portable model (pimpl — never in the reflected layout). */
	TUniquePtr<insimul::FInsimulSaveSlotModel> Model;

	insimul::FInsimulSaveSlotModel& EnsureModel();
};
