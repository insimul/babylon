// Copyright 2024 Insimul. All Rights Reserved.
//
// UInsimulPauseMenu — the UE seam over the portable pause-menu view-model
// (Portable/InsimulPauseMenuModel.h, US-XU4). The UObject the unified ESC menu
// (InsimulGameMenuWidget / InsimulPauseMenuWidget) binds to: VisibleTabs() drives
// which tabs are built (module-bundle gated from the IR feature-modules registry),
// and Open/Close/Toggle/SetActive drive the open + active-tab reducer. The
// UUserWidget owns the actual UGameplayStatics pause + input capture.
//
// All gating + reducer SEMANTICS (AND-gating, open-to-hidden falls back to the
// first visible tab, SetActive rejects hidden tabs) live in the portable core and
// are host-tested by run-dialogue-ui-tests.sh. This class is the thin,
// syntax-gated Blueprint / UObject boundary (pimpl).

#pragma once

#include "CoreMinimal.h"
#include "UObject/NoExportTypes.h"
#include "InsimulPauseMenu.generated.h"

// The engine-agnostic model this seam wraps (pimpl). Host-tested by
// run-dialogue-ui-tests.sh.
namespace insimul { class FInsimulPauseMenuModel; }

/** One menu tab as the ESC menu renders it. */
USTRUCT(BlueprintType)
struct FInsimulPauseTab
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Menu")
	FString Key;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Menu")
	FString Label;
};

/** Fired when the visible-tab set or the open/active state changes (no polling). */
DECLARE_DYNAMIC_MULTICAST_DELEGATE(FOnPauseMenuChanged);

/**
 * The default-runtime pause-menu view-model. The ESC menu builds its tab bar from
 * VisibleTabs() and re-renders from OnPauseMenuChanged; all gating lives in the
 * portable core (pimpl) that host-tests UE-free.
 */
UCLASS(BlueprintType)
class INSIMULRUNTIME_API UInsimulPauseMenu : public UObject
{
	GENERATED_BODY()

public:
	UInsimulPauseMenu();

	/** Configure the menu with the feature modules the active genre bundle enabled
	 *  (from the IR feature-modules registry). Uses the shared default tab set. */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Menu")
	void Configure(const TArray<FString>& EnabledModules);

	/** Tabs visible under the current module set, in declaration order. */
	UFUNCTION(BlueprintPure, Category = "Insimul|Menu")
	TArray<FInsimulPauseTab> VisibleTabs() const;

	UFUNCTION(BlueprintPure, Category = "Insimul|Menu")
	TArray<FString> VisibleKeys() const;

	UFUNCTION(BlueprintPure, Category = "Insimul|Menu")
	bool IsTabVisible(const FString& Key) const;

	/** Open the menu, optionally to a tab (falls back to the first visible tab). */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Menu")
	void Open(const FString& Tab);

	UFUNCTION(BlueprintCallable, Category = "Insimul|Menu")
	void Close();

	UFUNCTION(BlueprintCallable, Category = "Insimul|Menu")
	void Toggle();

	UFUNCTION(BlueprintPure, Category = "Insimul|Menu")
	bool IsOpen() const;

	/** Switch tabs. Rejected (returns false) for a hidden/unknown tab. */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Menu")
	bool SetActive(const FString& Key);

	UFUNCTION(BlueprintPure, Category = "Insimul|Menu")
	FString ActiveTab() const;

	/** No-poll re-render signal. */
	UPROPERTY(BlueprintAssignable, Category = "Insimul|Menu")
	FOnPauseMenuChanged OnPauseMenuChanged;

	virtual void BeginDestroy() override;

private:
	/** The host-tested portable model (pimpl — never in the reflected layout). */
	TUniquePtr<insimul::FInsimulPauseMenuModel> Model;

	insimul::FInsimulPauseMenuModel& EnsureModel();
};
