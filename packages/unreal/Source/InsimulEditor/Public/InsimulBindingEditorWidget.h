// Copyright 2024 Insimul. All Rights Reserved.
//
// InsimulBindingEditorWidget — the Binding Editor as an Editor Utility Widget
// (US-XG4), the Unreal twin of Unity's InsimulBindingEditorWindow. It is a thin
// VIEW over the pure host-tested view-model (Portable/InsimulBindingEditorModel):
// a taxonomy-grouped archetype list with bound / placeholder / unbound status, an
// asset picker with name/tag suggestions, bind + bind-descendants, and pack
// import/export against a project-tier UInsimulBindingTable.
//
// Every decision (status, taxonomy grouping, suggestion ranking, partitioning)
// is delegated to insimul::FBindingEditorModel so the Unity and Unreal editors
// can never disagree; this class only marshals UE types (the Asset Registry, the
// object pickers, the binding table) into those calls and surfaces the results as
// Blueprint-readable rows the widget's UMG binds to.
//
// UNREAL-COUPLED — syntax-gated only (no UBT in this harness). The view-model's
// real assertions run on a bare clang box (test_binding_editor_model.cpp). A
// human drives the full editor loop per VERIFICATION.md.

#pragma once

#include "CoreMinimal.h"
#include "EditorUtilityWidget.h"
#include "InsimulBindingEditorWidget.generated.h"

class UInsimulBindingTable;

/** Bound state of an archetype row (mirrors insimul::EBindingStatus). */
UENUM(BlueprintType)
enum class EInsimulBindingRowStatus : uint8
{
	Unbound     UMETA(DisplayName = "Unbound"),
	Placeholder UMETA(DisplayName = "Placeholder"),
	Bound       UMETA(DisplayName = "Bound"),
};

/** One archetype row the widget renders (taxonomy leaf + resolution). */
USTRUCT(BlueprintType)
struct FInsimulBindingRow
{
	GENERATED_BODY()

	/** The full dot-path archetype key. */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Binding")
	FString Archetype;

	/** Nesting depth (number of dot segments - 1) for indented display. */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Binding")
	int32 Depth = 0;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Binding")
	EInsimulBindingRowStatus Status = EInsimulBindingRowStatus::Unbound;

	/** The resolved asset handle ("" when unbound). */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Binding")
	FString AssetRef;

	/** Which tier resolved it (layer / source name). */
	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Binding")
	FString Layer;
};

/** A ranked asset suggestion for a picker (mirrors insimul::FSuggestionResult). */
USTRUCT(BlueprintType)
struct FInsimulBindingSuggestion
{
	GENERATED_BODY()

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Binding")
	FString AssetPath;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Binding")
	FString AssetName;

	UPROPERTY(BlueprintReadOnly, Category = "Insimul|Binding")
	int32 Score = 0;
};

/**
 * The Binding Editor utility widget. Create a Blueprint child (Editor Utility
 * Widget) whose UMG binds to these calls; the C++ base owns the model + the
 * project table. Reachable from the Insimul editor menu.
 */
UCLASS()
class INSIMULEDITOR_API UInsimulBindingEditorWidget : public UEditorUtilityWidget
{
	GENERATED_BODY()

public:
	/** The project-override binding table this editor edits (highest tier). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Binding")
	UInsimulBindingTable* ProjectTable = nullptr;

	/** The pack / placeholder tables shown as read-only fallback context. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Binding")
	TArray<UInsimulBindingTable*> FallbackTables;

	/** The archetype keys the current world's IR uses (drives the tree). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "Insimul|Binding")
	TArray<FString> WorldArchetypes;

	/** Rebuild the taxonomy-grouped, status-annotated row list for
	 *  WorldArchetypes against the current tables (project -> packs -> placeholder). */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Binding")
	TArray<FInsimulBindingRow> BuildRows();

	/** The archetype keys with / without a placeable binding (sorted). */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Binding")
	TArray<FString> BoundKeys();

	UFUNCTION(BlueprintCallable, Category = "Insimul|Binding")
	TArray<FString> UnboundKeys();

	/** Rank project assets as picker suggestions for `Archetype` (name/tag/path
	 *  segment match), scanning the Asset Registry. */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Binding")
	TArray<FInsimulBindingSuggestion> SuggestBindings(const FString& Archetype);

	/** Bind `Archetype` to `AssetPath` in the project table. A non-leaf key binds
	 *  every descendant (the "bind descendants" affordance). */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Binding")
	void Bind(const FString& Archetype, const FString& AssetPath, bool bIsMesh = false);

	/** Alias documenting intent — identical to Bind on the parent key. */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Binding")
	void BindDescendants(const FString& ParentKey, const FString& AssetPath, bool bIsMesh = false);

	/** Remove the exact-key binding for `Archetype`. Returns true if removed. */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Binding")
	bool Unbind(const FString& Archetype);

	/** Import a portable binding pack JSON into the project table (replaces it). */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Binding")
	bool ImportPack(const FString& Json);

	/** Export the project table as canonical portable binding-pack JSON. */
	UFUNCTION(BlueprintCallable, Category = "Insimul|Binding")
	FString ExportPack() const;
};
